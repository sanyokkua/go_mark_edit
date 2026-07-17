**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester
**Last Updated:** 2026-07-10
**Cross-references:** `00_ROADMAP.md`, `../01_Product/03_FILES_TABS_WORKSPACE.md`, `../02_Architecture/02_BACKEND_GO.md`, `../02_Architecture/04_WAILS_INTEGRATION.md`, `../02_Architecture/05_STATE_AND_PERSISTENCE.md`, `../06_Process_and_Traceability/01_MODULE_INVENTORY.md`, `../06_Process_and_Traceability/06_DEFINITION_OF_DONE.md`

# Phase 02 — File I/O + Tabs

## Goal

Make GoMarkEdit a real editor you can use daily: native open / save / save-as / new / close, lossless
encoding handling (UTF-8 new files; preserve existing BOM and CRLF/LF on round-trip), autosave for
existing files, multiple document tabs with per-tab dirty state, and a window title that reflects the
active document. File I/O and the **tab set** are owned by `internal/appmodel` (DD-62): `OpenDoc` /
`SaveDoc` / `SaveDocAs` / `CloseTab` / `SetActiveTab` / `ReorderTabs` commands mutate the model and emit
`state:patch`, the model composing `internal/docs` for read/write. Save/autosave **flush the pending
debounced buffer first, then write the backend's canonical buffer — never frontend text** (DD-64); the
`tabs`/`documents` slices are projections (DD-63). Opens the Stage-2 (Editor) write path; contributes to
Milestone **M2**.
Refines: `../01_Product/01_FUNCTIONAL_REQUIREMENTS.md#fr-files`,
`../01_Product/01_FUNCTIONAL_REQUIREMENTS.md#fr-tabs`, and
`../01_Product/01_FUNCTIONAL_REQUIREMENTS.md#fr-autosave`.

## Depends on

- Phase 01 (in-memory document, editor, preview, status bar, `internal/appmodel` foundation + projection).

## Scope

- `internal/appmodel` extended — owns file open/save/save-as (composing `internal/docs`) and the **tab
  set** (order + active tab); the `OpenDoc`/`SaveDoc`/`SaveDocAs`/`CloseTab`/`SetActiveTab`/`ReorderTabs`
  commands mutate the model and emit `state:patch` (DD-62; `../02_Architecture/02_BACKEND_GO.md#application-model`).
- `internal/docs` Handler/Service — open/save/save-as/new via Wails runtime dialogs, returning
  `apperr.*Result`; **composed by `internal/appmodel`**, not called directly by the frontend.
- Encoding & line-ending detection and preservation (BOM + CRLF/LF), surfaced in the status bar.
- `logic/adapter(appModel)` wrapper + `documents`/`tabs` **projection** slices reconciled by `state:patch`;
  save flushes the pending debounced buffer first, then the backend writes its canonical buffer (DD-64).
- `tabs` projection slice + `TabBar` component; open-existing-path focuses its tab (no duplicate) — the
  authoritative tab set lives in `internal/appmodel`.
- Dirty state + close/quit prompt (Save / Discard / Cancel).
- `useAutosave` debounced hook — existing files only; never writes a new buffer; flushes the pending
  buffer before autosave. File-first: saves go to the real file path only — no shadow copies, no
  automatic session restore (`../02_Architecture/05_STATE_AND_PERSISTENCE.md#file-first`).
- Window title reflecting active document + dirty marker.

## Out of scope

- Folder workspace tree / recent list — Phase 03.
- OS file associations / `OnFileOpen` — Phase 07.
- Reading mode, rendering extensions — Phase 04.

## Suggested stories / tasks

> Planned backlog for this phase. The `architect` generates the actual story files into `../docs/stories/` during implementation (one story per session), assigning the ids shown.


| Story id | Title | Est(S/M/L) | Modules | Spec clauses | depends_on |
|---|---|---|---|---|---|
| STORY-016 | Implement the docs backend service for new/open/save/save-as via native dialogs returning Result envelopes | L | `internal/docs/`, `internal/apperr/`, `internal/application/` | `01_Product/03_FILES_TABS_WORKSPACE.md#new-open-save`, `01_Product/03_FILES_TABS_WORKSPACE.md#save-as`, `02_Architecture/04_WAILS_INTEGRATION.md#dialogs-runtime`, `02_Architecture/02_BACKEND_GO.md#dialogs`, `02_Architecture/02_BACKEND_GO.md#file-io` | STORY-005 |
| STORY-017 | Detect and preserve UTF-8/BOM and CRLF/LF line endings losslessly on document round-trip | M | `internal/docs/` | `01_Product/03_FILES_TABS_WORKSPACE.md#encoding-and-line-endings`, `00_Foundation/04_DESIGN_DECISIONS.md#4-markdown-behaviour` | STORY-016 |
| STORY-101 | Extend `internal/appmodel` with file open/save/save-as commands composing `internal/docs`, flushing the pending debounced buffer before writing the backend's canonical buffer | L | `internal/appmodel/`, `internal/docs/`, `internal/application/` | `02_Architecture/02_BACKEND_GO.md#application-model`, `01_Product/03_FILES_TABS_WORKSPACE.md#new-open-save`, `00_Foundation/04_DESIGN_DECISIONS.md#14-application-state-ownership` | STORY-099, STORY-016 |
| STORY-102 | Move tab-set ownership (order + active tab) into `internal/appmodel` and make the tabs slice a projection reconciled by `state:patch` | M | `internal/appmodel/`, `logic/store/`, `logic/adapter/` | `02_Architecture/02_BACKEND_GO.md#application-model`, `02_Architecture/03_FRONTEND_REACT.md#state-ownership`, `01_Product/03_FILES_TABS_WORKSPACE.md#tabs` | STORY-101, STORY-100 |
| STORY-018 | Wire the appModel adapter and documents projection to load and save real files with status-bar encoding display, reconciled via `state:patch` | M | `logic/adapter/`, `logic/store/`, `ui/components/` | `01_Product/03_FILES_TABS_WORKSPACE.md#new-open-save`, `02_Architecture/03_FRONTEND_REACT.md#state-ownership` | STORY-101 |
| STORY-019 | Add the tabs projection slice and TabBar with focus-existing-tab-on-reopen behaviour, dispatching tab commands to `internal/appmodel` | M | `logic/store/`, `ui/components/`, `ui/widgets/` | `01_Product/03_FILES_TABS_WORKSPACE.md#tabs`, `02_Architecture/03_FRONTEND_REACT.md#state-ownership` | STORY-102 |
| STORY-020 | Track dirty state and prompt Save / Discard / Cancel on close and quit | M | `logic/store/`, `ui/widgets/`, `logic/hooks/` | `01_Product/03_FILES_TABS_WORKSPACE.md#dirty-state`, `01_Product/03_FILES_TABS_WORKSPACE.md#tabs` | STORY-019 |
| STORY-021 | Add the useAutosave hook that saves existing files only and never writes a new buffer | M | `logic/hooks/`, `logic/store/`, `internal/settings/` | `01_Product/03_FILES_TABS_WORKSPACE.md#autosave`, `01_Product/11_SETTINGS.md#editor-group`, `02_Architecture/05_STATE_AND_PERSISTENCE.md#file-first` | STORY-018 |
| STORY-022 | Reflect the active document and dirty marker in the window title | S | `logic/store/`, `logic/adapter/` | `01_Product/03_FILES_TABS_WORKSPACE.md#dirty-state`, `02_Architecture/04_WAILS_INTEGRATION.md#lifecycle` | STORY-019 |

> Story ids 101/102 are appended (globally monotonic) because the backend-authoritative application
> model (DD-62..64, ADR-0014) was introduced after the initial phase numbering; they belong to Phase 02
> but sit after the Stage-3 range in id order.

## Edge cases

- **EC-DOCS-1** — Open a missing path → clear error, offer removal from Recent (STORY-016).
- **EC-DOCS-2** — File modified on disk by another program → prompt on focus/save, no silent overwrite (STORY-016/020).
- **EC-DOCS-3** — Open file deleted on disk → keep buffer, mark dirty/detached; Save recreates (STORY-020).
- **EC-DOCS-5** — Close/quit with unsaved changes → prompt Save / Discard / Cancel (STORY-020).
- **EC-DOCS-6** — New never-saved buffer is never autosaved (STORY-021).
- **EC-DOCS-7** — Save to read-only/permission-denied location → surface OS error, keep dirty (STORY-016).
- **EC-DOCS-8** — Non-UTF-8/binary content → read tolerantly, warn in status bar, no corruption (STORY-017).
- **EC-DOCS-9** — BOM and/or CRLF preserved on round-trip (STORY-017).
- **EC-DOCS-10** — Save As over existing file → native overwrite confirm (STORY-016).
- **EC-DOCS-11** — Open a path already open → focus tab, no duplicate (STORY-019).
- **EC-TABS-1** — Opening a path already open in another tab activates that tab, no duplicate (STORY-019).
- **EC-TABS-2** — More tabs than fit → the tab bar scrolls/overflows without breaking layout (STORY-019).
- **EC-TABS-3** — Closing a dirty tab prompts Save / Discard / Cancel (STORY-020).
- **EC-TABS-4** — Two tabs share a basename from different folders → labels disambiguate with a path hint (STORY-019).
- **EC-TABS-5** — Closing the last tab → a defined empty state, no phantom document (STORY-019).
- **EC-TABS-6** — Middle-click / keyboard close and tab reordering behave consistently (STORY-019).
- **EC-TABS-7** — Tab open/close/reorder/active-change mutate the backend model and reconcile the `tabs` projection via `state:patch`; the frontend holds no authoritative tab set (DD-62) (STORY-102).
- **EC-DOCS-13** — Save/autosave flushes the pending debounced buffer to `internal/appmodel` first, then writes the backend's **canonical** buffer — never frontend text (DD-64) (STORY-101).
- **EC-SET-4** — Autosave off with dirty buffer keeps it dirty (STORY-021).

## Phase exit checklist

Automated:

- [ ] `DocsHandler.Save` returns `apperr.VoidResult`; a write error returns a populated `Error` with `CodeInternal` and no partial file (P3).
- [ ] A CRLF+BOM file saved after edits retains CRLF and its BOM (integration test, EC-DOCS-9).
- [ ] Reopening an already-open path focuses the existing tab (EC-DOCS-11 / EC-TABS-1).
- [ ] `SaveDoc` writes the buffer held in `internal/appmodel` after flushing the pending debounced edit — a save issued immediately after a keystroke includes that keystroke (integration test, EC-DOCS-13).
- [ ] Tab reorder/close/active-change round-trips through `internal/appmodel` commands and the `tabs` projection reflects the emitted `state:patch` (EC-TABS-7).
- [ ] Closing a dirty tab prompts Save/Discard/Cancel (EC-TABS-3).
- [ ] Autosave never writes a never-saved buffer (EC-DOCS-6).
- [ ] `just check` green; bindings regenerated with no drift.

Manual:

- [ ] In `wails dev`: New → type → Save As writes a `.md`; reopen shows the same bytes.
- [ ] Quitting with an unsaved tab prompts; window title shows the file name and a dirty dot.

DoD reference: `06_Process_and_Traceability/06_DEFINITION_OF_DONE.md`. Stage 2 (Editor); contributes to Milestone **M2** (which completes at Phase 06).
