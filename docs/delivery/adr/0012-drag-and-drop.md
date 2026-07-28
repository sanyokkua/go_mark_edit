# ADR-0012 — Drag-and-drop opens files/folders via native path-based file drop

**Status:** accepted
**Date:** 2026-07-11
**Deciders:** project owner, architect

> **Historical vocabulary — this record is not rewritten.** The `DD-…` and `EC-…` identifiers below cite the retired 78-entry design-decision registry, last present in git at `e1bd33f` under `specification/00_Foundation/` as `04_DESIGN_DECISIONS.md`; every one of those decisions now lives in the sentence of the feature file that needs it. Links into `_archive-2026-07-28-specification/` are the pre-conversion specification, kept so a citation still resolves, and **not normative**. See `README.md`. A decision record says what was decided against what was known then, so neither is translated forward.
> A link beginning `07_Phases/` names a retired phase document that was deleted rather than archived; that set is in git at `e1bd33f`.

## Context and problem statement

GoMarkEdit should let a user **drag files and folders from the OS onto the window** to open them — a file
into a tab (or the current tab if empty), a folder as a workspace (with a replace-vs-new-window choice
when a workspace is already open). The app is **path-based**: the Go backend reads files from disk and the
webview only renders. So the drop mechanism must deliver **real absolute filesystem paths**, and it must
integrate with the existing open-target routing (`internal/fileassoc`, DD-25–DD-27) rather than inventing
a parallel path. It must also not break the webview (a naive drop navigates the page to the file on some
platforms). This decision locks DD-56–DD-59.

## Decision drivers

- The backend needs **absolute paths** (to `os.ReadFile` / open a workspace), not opaque browser blobs.
- Consistency: a dropped path and an OS file-association open should behave **identically**.
- Folder support: dropping a directory must yield a **folder path** the workspace service can open.
- Safety: the drop must never navigate/replace the webview; non-file drops must not crash the app.
- Cross-platform: must work on WebView2 (Windows), WKWebView (macOS), WebKitGTK (Linux).
- No new network, no new persistence — pure local open.

## Considered options

- **A — Wails native file drop** (`options.App.DragAndDrop.EnableFileDrop` + `runtime.OnFileDrop`), which
  returns absolute paths for files and folders.
- **B — Browser HTML5 drag-and-drop** (`dragover`/`drop` + `DataTransfer.files`) handled in the frontend.
- **C — No drag-and-drop** (open only via dialogs / OS association / recent).

## Decision outcome

Chosen: **Option A — Wails native file drop.** Enable `DragAndDrop{EnableFileDrop: true,
DisableWebViewDrop: true, CSSDropProperty: "--wails-drop-target"}`; register `runtime.OnFileDrop(ctx, cb)`
in `OnStartup`; in the callback, `os.Stat` each path to classify file vs folder and route it through
`internal/fileassoc`'s open-target resolution — the **same pipeline as OS-association opens**. The frontend
renders a **drop-target overlay** and `preventDefault`s the webview's `dragover`/`drop` so the page is
never navigated; the real paths arrive via the Wails event, not the browser drop event.

### Consequences

- Positive: The backend gets real absolute paths for **files and folders**; dropped opens reuse the OS-open
  routing, default-open-mode, tab, and multi-instance rules with no duplicate logic (DD-56–DD-58).
- Positive: Fully local — no network, no new persistence; a dropped open is just another open.
- Negative: Requires per-OS handling and testing; the webview default drop **must** be suppressed or Linux
  (WebKitGTK) replaces the UI with the file view (EC-DND-8), and older Wails builds could panic on non-file
  drops on WebView2 (EC-DND-7) — mitigated by ignoring non-file drops and pinning a fixed Wails version.
- Neutral: The drop UX (overlay, folder-conflict prompt) is new frontend surface, but it reuses existing
  primitives (Dialog for the prompt, the Toast system for rejects).

## Pros and cons of the options

### Option A — Wails native file drop

- Good: Delivers **absolute paths** for files and folders; integrates with the path-based backend and the
  existing `fileassoc` routing; framework-supported drop-target styling.
- Bad: Per-OS quirks (Linux default-drop navigation; WebView2 non-file-drop panic in older builds) that must
  be guarded and tested.

### Option B — Browser HTML5 DnD

- Good: Pure frontend, no Go changes; works uniformly in the webview's DOM.
- Bad: **Fatal flaw** — `DataTransfer.files` in a webview does **not** expose absolute filesystem paths, so a
  path-based backend cannot read the file; folder drops are effectively unusable. Would force a second,
  inconsistent open path. Rejected.

### Option C — No drag-and-drop

- Good: Zero new surface or per-OS risk.
- Bad: Misses a core convenience users expect from a desktop editor; the project owner asked for it. Rejected.

## Links

- Design decisions: DD-56, DD-57, DD-58, DD-59. Related: DD-06 (workspace), DD-08 (multi-instance),
  DD-25–DD-27 (OS open routing / default open mode), DD-32 (no network).
- Spec clauses: `../../_archive-2026-07-28-specification/01_Product/03_FILES_TABS_WORKSPACE.md#drag-and-drop-paste-and-inserting-images`,
  `../../_archive-2026-07-28-specification/02_Architecture/04_WAILS_INTEGRATION.md#file-drop`, `../../_archive-2026-07-28-specification/02_Architecture/01_MODULE_INVENTORY.md`
  (`internal/fileassoc/`, `logic/hooks/` `useFileDrop`, `ui/components/` `DropOverlay`).
- Stories: Phase 07 drag-and-drop tasks (STORY-096 backend routing, STORY-097 overlay + wiring), per
  `07_Phases/PHASE_07_A_FOLDER_OF_NOTES.md`; authored per phase (none built at ADR time).
