**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester
**Last Updated:** 2026-07-10
**Cross-references:** `00_Foundation/04_DESIGN_DECISIONS.md`, `02_Architecture/07_LARGE_FILES_AND_CONCURRENCY.md`, `02_Architecture/03_FRONTEND_REACT.md`, `01_Product/05_RENDERING_AND_EXTENSIONS.md`, `08_Decisions/ADR-0002`

# Performance

Performance budgets and the strategies that meet them. Targets are pragmatic v1 goals for a native
desktop editor, verified on mid-range hardware; they are engineering targets, not hard real-time
guarantees.

## Table of Contents

1. Startup budget
2. Editor responsiveness
3. Preview debounce targets
4. Large-file handling
5. Bundle size (Monaco)
6. Memory
7. Hard limits

## 1. Startup budget

- **Cold start to interactive window: ≤ ~1.5 s** on mid-range hardware. The single embedded binary
  avoids a network or unpack step; `//go:embed` serves the UI from memory.
- Startup work is minimized: `OnStartup` opens the DB (WAL, fast), wires repositories, restores window
  size **before** the window is shown, and dispatches any OS-provided open target. No session restore or
  document scan runs on launch (DD-11).
- Monaco and heavy render assets load with the first editor/preview, not on the splash path, so the
  window is interactive quickly even before the editor engine is warm.

## 2. Editor responsiveness

- **Keystroke-to-caret latency: imperceptible (< ~16 ms typical)** — delivered by Monaco's virtualized
  model, which does not re-layout the whole buffer per keystroke (DD-20; ADR-0002).
- The editor never blocks on preview work: preview updates are decoupled via debounce (§3) and never
  run on the keystroke.
- The active buffer syncs to the backend model on a **debounce**, never per keystroke
  (`UpdateBuffer`, DD-64): typing adds no bridge traffic on the keystroke path, and the backend never
  echoes buffer text back into the focused editor, so sync can never disturb the caret. A flush occurs
  only on blur / tab switch / close / save.
- Toolbar/shortcut formatting actions operate on the selection or current line, so their cost is
  independent of document size.
- assistant LLM inference is **provider-bound** (dominated by model/network latency), runs off the
  editor/UI thread behind the single-flight gate, and streams into the assistant sidebar; it never blocks
  editing and is **not** measured against these local budgets
  (`02_Architecture/08_LLM_INTEGRATION.md`).

## 3. Preview debounce targets

- **Live preview updates from a debounced snapshot**, target interval **~150–300 ms** after typing
  stops — long enough to coalesce bursts, short enough to feel live (`02_Architecture/07_LARGE_FILES_AND_CONCURRENCY.md`
  `#preview-debounce`).
- **Async in-preview rendering**: Mermaid and KaTeX render asynchronously so a heavy diagram/formula
  never blocks the initial text paint.
- **Auto-pause threshold**: above a configurable document size, live preview pauses (setting
  `editor.pauseLivePreview`) and switches to manual refresh, keeping typing smooth on very large files
  (DD-20).

## 4. Large-file handling

- Editing scales with Monaco; the preview is the cost center and is bounded by debounce + auto-pause
  (§3).
- Reading mode renders a single static snapshot with no attached editor, so opening a large document to
  read costs one render.
- The document I/O path streams/reads whole files but keeps content as a single UTF-8 string, handed
  to the webview only for the **visible** document; there is no per-line round-trip across the bridge.
- Buffer sync (DD-64) sends the full text once per debounce tick — never per keystroke — so for a very
  large file the bridge cost is a bounded, coalesced push, and inactive tabs generate no bridge
  traffic at all.

## 5. Bundle size (Monaco)

- Monaco is the largest frontend dependency; it is loaded lazily so it does not inflate the initial
  interactive path.
- Only the Markdown language contribution and required Monaco workers are bundled — unused language
  features are excluded from the build to keep the embedded `frontend/dist` reasonable.
- All render assets (KaTeX fonts, Mermaid, highlight themes) are bundled for offline use (DD-32); bundle
  size is a deliberate trade against the zero-network invariant, not a defect. CodeMirror 6 remains a
  documented future option if Monaco's footprint becomes dominant (ADR-0002).

## 6. Memory
7. Hard limits

- One process holds one webview, one open SQLite connection (single-writer pool), and the Go-owned
  application model with every open document's canonical content (`internal/appmodel`, DD-62). Only the
  **visible** document has a Monaco model in the webview — inactive tabs cost no webview memory; their
  content lives in Go (DD-63). Closing a tab releases its Go-side buffer.
- No document content is cached in SQLite; the DB stays small (preferences + recent + window state).
- Multiple instances multiply memory linearly (independent processes, DD-08); this is the accepted cost
  of the VS-Code-style multi-window model. WAL keeps their shared DB access cheap
  (`02_Architecture/05_STATE_AND_PERSISTENCE.md` `#multi-instance-db`).

## 7. Hard limits

DD-70. **Every number in this table lives only here.** Any other document that needs one cites this
section rather than restating it — two documents holding the same number is how a threshold becomes
2 MB in one place and 5 MB in another.

A budget you cannot enforce is not a specification. Each row therefore states what happens **at** the
limit, not only what the limit is.

| Limit | Value | At the limit |
|---|---|---|
| Openable file size | **50 MB** | The file is refused with a message naming the limit. It is not partially loaded. |
| Read-only threshold | **10 MB** | Opens, but read-only: no editing, no autosave, and an inline banner saying why. Editing a file this size through a full-text bridge sync is not something the architecture supports. |
| Live-preview pause | **2 MB** | The preview stops updating on every keystroke and shows a **Refresh preview** action in an inline banner. This is `EC-DOCS-4` and `EC-RENDER-4`, which have required "a configurable threshold" with no number, unit or comparison. **It is not configurable in v1** — one number that always behaves the same beats a setting nobody can reason about. |
| Open tabs | **40** | Opening the 41st is refused with a message. Every open document's content is held in Go memory (DD-62), so this is a real bound, not a UI preference. |
| Folder entries enumerated | **20,000** per workspace | Enumeration stops and the tree shows what it has plus a note that the folder is too large to index. Opening a home directory is a plausible accident. |
| Folder depth | **12** levels | Deeper directories are not descended into. Bounds symlink cycles as well (`EC-WS-5`). |
| Search results | **1,000** | The list stops and says how many were found. |
| Lint markers decorated | **1,000** | The count stays accurate; only the first thousand get squiggles. The problems list shows all of them (`06_FORMAT_AND_LINT.md#problems-surface`). |
| Undo history | Monaco's default | Not overridden. |

**Refusal is a first-class outcome.** Each of these produces a classified error or an inline banner with
a written message (`20_NOTIFICATIONS_AND_EMPTY_STATES.md`), never a hang, never a silent truncation, and
never a crash. `03_NonFunctional/01_QUALITY_ATTRIBUTES.md`'s Reliability attribute — "predictable
failure, never a crash dialog" — is only true if the limits exist.

**These are v1 numbers chosen to be safe, not tuned.** Raising one is a decision with evidence behind
it, not a preference; lowering one because something is slow is a bug being papered over.
