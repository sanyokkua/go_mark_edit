**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester
**Last Updated:** 2026-07-10
**Cross-references:** `00_ROADMAP.md`, `../01_Product/02_EDITOR_AND_VIEWER_MODES.md`, `../01_Product/05_RENDERING_AND_EXTENSIONS.md`, `../02_Architecture/02_BACKEND_GO.md`, `../02_Architecture/03_FRONTEND_REACT.md`, `../02_Architecture/05_STATE_AND_PERSISTENCE.md`, `../03_NonFunctional/02_PERFORMANCE.md`, `../00_Foundation/04_DESIGN_DECISIONS.md`, `../06_Process_and_Traceability/01_MODULE_INVENTORY.md`, `../06_Process_and_Traceability/06_DEFINITION_OF_DONE.md`

# Phase 01 — Core Editor + Preview

## Goal

Deliver the editing heart of GoMarkEdit against a single in-memory document **owned by the Go backend**:
`internal/appmodel` holds the authoritative document (canonical content + dirty) and the UI/layout state
(DD-62), a Monaco source editor with syntax highlighting whose visible buffer debounce-syncs to that
model (DD-64), a live rendered preview (base CommonMark/GFM), a split view, a view-mode toggle
(editor / split / preview), and a status bar. The Redux `documents`/`ui` slices are a **projection** of the
backend model — hydrated via `GetState` and reconciled by `state:patch` (DD-63). After this phase a user
can type Markdown and watch it render — still **no file I/O**: `internal/appmodel` holds one in-memory new
document (opening clean, DD-11), and open/save arrives in Phase 02.
Refines: `../01_Product/01_FUNCTIONAL_REQUIREMENTS.md#fr-editor`,
`../01_Product/01_FUNCTIONAL_REQUIREMENTS.md#fr-viewer`, and (base rendering pipeline)
`../01_Product/01_FUNCTIONAL_REQUIREMENTS.md#fr-rendering`.

## Depends on

- Phase 00 (app shell, adapter/store scaffolding, tokens.css skeleton, bridge-mock; the two-phase DI root
  and settings KV store that `internal/appmodel` builds on).

## Scope

- `internal/appmodel` Handler/Service — the **authoritative in-memory application model** (DD-62): owns one
  in-memory new document (canonical content, dirty, per-document view state) and the UI/layout state,
  exposes the `GetState` query + commands (`UpdateBuffer`, `SetDocView`, `SetUILayout`), and emits a
  `state:patch` event on every mutation (`../02_Architecture/02_BACKEND_GO.md#application-model`).
- `documents`/`ui` Redux slices as a **projection** of `internal/appmodel` (DD-63): hydrated once via
  `GetState`, reconciled by `state:patch`. The `documents` slice holds document **metadata** (dirty flag,
  counts, view state) for rendering — the canonical content lives in `internal/appmodel`, not the slice.
- `CodeEditor` Monaco component (Markdown language, word-wrap/line-number toggles); its visible buffer is a
  working copy that **debounce-pushes** edits to the backend via `UpdateBuffer` and flushes on blur/switch
  (DD-64).
- `MarkdownView` base rendering pipeline (react-markdown + remark-gfm) — CommonMark/GFM only.
- `EditorView` / `PreviewView` widgets and the split-view layout.
- View-mode toggle (segmented control: editor / split / preview).
- Status bar showing cursor position, word count, and a placeholder encoding/line-ending field.
- Preview debounce against the targets in `../03_NonFunctional/02_PERFORMANCE.md#3-preview-debounce-targets`
  (editor responsiveness budget: `../03_NonFunctional/02_PERFORMANCE.md#2-editor-responsiveness`).

## Out of scope

- Math/Mermaid/highlight/standard selector — Phase 04.
- File open/save, tabs, autosave — Phase 02.
- Backend file read/write and tab/workspace ownership inside `internal/appmodel` — Phase 02+ (this phase's
  model is a single in-memory new document; it composes `internal/docs`/`internal/workspace` later).
- Reading (Viewer) full-chrome-hidden mode — Phase 04 (`ReaderView`); this phase only toggles preview.
- Format/lint, theming values — Phases 05 / 08.

## Suggested stories / tasks

> Planned backlog for this phase. The `architect` generates the actual story files into `../docs/stories/` during implementation (one story per session), assigning the ids shown.


| Story id | Title | Est(S/M/L) | Modules | Spec clauses | depends_on |
|---|---|---|---|---|---|
| STORY-099 | Introduce `internal/appmodel` as the authoritative in-memory application model with the `GetState` query, mutating commands, and `state:patch` events | L | `internal/appmodel/`, `internal/apperr/`, `internal/application/` | `02_Architecture/02_BACKEND_GO.md#application-model`, `02_Architecture/05_STATE_AND_PERSISTENCE.md#in-memory-application-model`, `00_Foundation/04_DESIGN_DECISIONS.md#14-application-state-ownership` | STORY-005 |
| STORY-009 | Add the documents/ui Redux slices as a projection of the backend model (metadata + view state, no canonical content) | M | `logic/store/`, `logic/utils/` | `01_Product/02_EDITOR_AND_VIEWER_MODES.md#per-document-view-state`, `02_Architecture/03_FRONTEND_REACT.md#state-ownership`, `02_Architecture/03_FRONTEND_REACT.md#store` | STORY-006, STORY-099 |
| STORY-100 | Wire the projection to `internal/appmodel` — hydrate via `GetState`, reconcile via `state:patch`, and debounce-sync the Monaco buffer through `UpdateBuffer`/`flushBuffer` | M | `logic/adapter/`, `logic/store/`, `ui/components/` | `02_Architecture/03_FRONTEND_REACT.md#state-ownership`, `00_Foundation/04_DESIGN_DECISIONS.md#14-application-state-ownership` | STORY-099, STORY-010 |
| STORY-010 | Build the Monaco CodeEditor component with Markdown highlighting and word-wrap/line-number toggles | M | `ui/components/`, `logic/store/` | `01_Product/02_EDITOR_AND_VIEWER_MODES.md#editor-mode`, `00_Foundation/04_DESIGN_DECISIONS.md#4-markdown-behaviour`, `02_Architecture/03_FRONTEND_REACT.md#components`, `03_NonFunctional/02_PERFORMANCE.md#2-editor-responsiveness` | STORY-009 |
| STORY-011 | Build the base MarkdownView rendering pipeline for CommonMark/GFM | M | `logic/markdown/`, `ui/components/` | `01_Product/05_RENDERING_AND_EXTENSIONS.md#pipeline`, `01_Product/05_RENDERING_AND_EXTENSIONS.md#gfm-features`, `02_Architecture/03_FRONTEND_REACT.md#markdown-pipeline`, `02_Architecture/03_FRONTEND_REACT.md#components` | STORY-009 |
| STORY-012 | Compose the EditorView/PreviewView split-view layout | M | `ui/widgets/`, `ui/components/` | `01_Product/02_EDITOR_AND_VIEWER_MODES.md#split-view` | STORY-010 |
| STORY-013 | Add the view-mode toggle (editor / split / preview) segmented control | S | `ui/components/`, `logic/store/` | `01_Product/02_EDITOR_AND_VIEWER_MODES.md#view-mode-toggle` | STORY-012 |
| STORY-014 | Add the status bar showing cursor position, word count, and encoding/line-ending fields | M | `ui/components/`, `logic/store/` | `01_Product/02_EDITOR_AND_VIEWER_MODES.md#editor-mode`, `01_Product/03_FILES_TABS_WORKSPACE.md#encoding-and-line-endings` | STORY-012 |
| STORY-015 | Debounce the live preview so typing does not re-render on every keystroke | S | `logic/markdown/`, `logic/hooks/` | `01_Product/05_RENDERING_AND_EXTENSIONS.md#preview-debounce`, `00_Foundation/04_DESIGN_DECISIONS.md#6-rendering--assets`, `03_NonFunctional/02_PERFORMANCE.md#3-preview-debounce-targets` | STORY-011 |

> Story ids 099/100 are appended (globally monotonic) because the backend-authoritative application
> model (DD-62..64, ADR-0014) was introduced after the initial phase numbering; they belong to Phase 01
> but sit after the Stage-3 range in id order.

## Edge cases

- **EC-RENDER-4** — Extremely large document → preview debounces / pauses live updates (STORY-015).
- **EC-RENDER-6** — A feature above the active standard renders literally (base pipeline is GFM only; math renders literally here until Phase 04) (STORY-011).
- **EC-DOCS-12** — A `state:patch` emitted after a buffer edit updates derived views (dirty, counts) but the backend **never echoes buffer text back into the focused editor**, so the cursor/selection is preserved (DD-64) (STORY-100).

## Phase exit checklist

Automated:

- [ ] `AppModelHandler.GetState` returns a serializable snapshot, and each command emits a `state:patch` the projection applies (unit test, STORY-099/100).
- [ ] Typing debounce-pushes the buffer to `internal/appmodel` via `UpdateBuffer`, which marks the document dirty and reflects it in the `documents` projection via `state:patch` (unit test).
- [ ] A `state:patch` never moves the focused editor's cursor/selection (EC-DOCS-12).
- [ ] A GFM document (table, task list, strikethrough) renders the expected DOM selectors with no console errors (jsdom test, P4).
- [ ] The view-mode toggle switches editor / split / preview and persists per-document view state.
- [ ] Preview re-render is debounced (does not fire on every keystroke) — verified by a timer/spy test.
- [ ] `just check` green; `verify:ui` screenshot of split view exists.

Manual:

- [ ] In `wails dev`, typing Markdown updates a live preview within the debounce window.
- [ ] The Monaco editor mounts with a height > 200px (no collapsed-editor regression) at 375 / 768 / 1280 px.

DoD reference: `06_Process_and_Traceability/06_DEFINITION_OF_DONE.md`. Phase 01 spans stages: its render/preview stories are Stage 1 (Milestone **M1**); its editing stories are Stage 2 (Milestone **M2**).
