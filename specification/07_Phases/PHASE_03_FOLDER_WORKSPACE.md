**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester
**Last Updated:** 2026-07-10
**Cross-references:** `00_ROADMAP.md`, `../01_Product/03_FILES_TABS_WORKSPACE.md`, `../02_Architecture/02_BACKEND_GO.md`, `../02_Architecture/05_STATE_AND_PERSISTENCE.md`, `../00_Foundation/04_DESIGN_DECISIONS.md`, `../06_Process_and_Traceability/01_MODULE_INVENTORY.md`, `../06_Process_and_Traceability/06_DEFINITION_OF_DONE.md`

# Phase 03 — Folder Workspace + Recent

## Goal

Turn GoMarkEdit into an IDE-like notes browser: open a folder as a recursively populated tree filtered
to `.md/.markdown/.mdown/.txt`, open documents from the tree, keep an MRU list of recent files and
folders with "reopen last", and open a second file/folder in a new window/instance (multi-instance,
no single-instance lock). Launch stays clean — no automatic session restore.
Refines: `../01_Product/01_FUNCTIONAL_REQUIREMENTS.md#fr-workspace` and
`../01_Product/01_FUNCTIONAL_REQUIREMENTS.md#fr-recent`.

## Depends on

- Phase 02 (docs service, tabs, adapter/store wiring; `internal/appmodel` file/tab ownership —
  STORY-101/102 — which this phase's `OpenWorkspace` command and tree-open path extend).

## Scope

- Workspace ownership in `internal/appmodel`: `OpenWorkspace` is a **command** that stores the workspace
  ref (root) in the authoritative model and emits `state:patch`; the `workspace` tree/sidebar slice is a
  **projection** (DD-62/DD-63; `../02_Architecture/02_BACKEND_GO.md#application-model`), with
  `internal/workspace` serving filtered tree children lazily.
- `internal/workspace` Handler/Service — open folder → filtered, lazily-loaded tree; large-folder guard; bounded traversal.
- `internal/recent` Handler/Service — bounded MRU recent files & folders, lazy pruning of missing paths, "reopen last".
- `FileExplorer` sidebar widget + `workspace`/`recent` Redux slices.
- Open-from-tree into a tab (in the default open mode — wired fully once Phase 08 provides the setting; default Edit for now).
- Multi-instance / new-window open path.

## Out of scope

- OS `OnFileOpen` association routing — Phase 07.
- Live filesystem watcher (v1 uses manual refresh) — explicitly out of v1.
- Default-open-mode setting UI — Phase 08 (this phase reads the setting if present, else defaults to Edit).

## Suggested stories / tasks

> Planned backlog for this phase. The `architect` generates the actual story files into `../docs/stories/` during implementation (one story per session), assigning the ids shown.


| Story id | Title | Est(S/M/L) | Modules | Spec clauses | depends_on |
|---|---|---|---|---|---|
| STORY-023 | Implement the workspace backend service that opens a folder into a filtered, lazily-loaded tree | L | `internal/workspace/`, `internal/appmodel/`, `internal/file/`, `internal/apperr/` | `01_Product/03_FILES_TABS_WORKSPACE.md#open-folder`, `01_Product/03_FILES_TABS_WORKSPACE.md#tree-filter`, `02_Architecture/02_BACKEND_GO.md#application-model`, `00_Foundation/04_DESIGN_DECISIONS.md#2-documents-files--workspace` | STORY-016, STORY-099 |
| STORY-024 | Implement the recent files/folders backend service with bounded MRU ordering and lazy pruning | M | `internal/recent/`, `internal/db/`, `internal/apperr/` | `01_Product/03_FILES_TABS_WORKSPACE.md#recent`, `01_Product/03_FILES_TABS_WORKSPACE.md#reopen-last`, `02_Architecture/05_STATE_AND_PERSISTENCE.md#recent` | STORY-005 |
| STORY-025 | Build the FileExplorer sidebar widget rendering the filtered workspace tree with lazy expansion | M | `ui/widgets/`, `ui/components/`, `logic/store/` | `01_Product/03_FILES_TABS_WORKSPACE.md#open-folder`, `01_Product/03_FILES_TABS_WORKSPACE.md#tree-filter` | STORY-023 |
| STORY-026 | Open a document from the workspace tree into a tab | M | `logic/store/`, `logic/adapter/`, `ui/widgets/` | `01_Product/03_FILES_TABS_WORKSPACE.md#open-folder`, `01_Product/02_EDITOR_AND_VIEWER_MODES.md#default-open-mode` | STORY-025 |
| STORY-027 | Surface recent files/folders and "reopen last" in the UI with clean-launch behaviour | M | `ui/widgets/`, `logic/store/`, `logic/adapter/` | `01_Product/03_FILES_TABS_WORKSPACE.md#recent`, `01_Product/03_FILES_TABS_WORKSPACE.md#reopen-last`, `00_Foundation/04_DESIGN_DECISIONS.md#3-persistence--state` | STORY-024 |
| STORY-028 | Open a second file/folder in a new window/instance without a single-instance lock | M | `internal/application/`, `logic/adapter/` | `01_Product/03_FILES_TABS_WORKSPACE.md#multi-instance`, `00_Foundation/04_DESIGN_DECISIONS.md#2-documents-files--workspace` | STORY-023 |
| STORY-096 | Enable native file drop and route dropped paths through open-target resolution (stat-classify file/folder; suppress webview default drop) | M | `main.go`, `internal/fileassoc/`, `internal/application/` | `01_Product/03_FILES_TABS_WORKSPACE.md#drag-and-drop-open`, `02_Architecture/04_WAILS_INTEGRATION.md#file-drop`, `00_Foundation/04_DESIGN_DECISIONS.md#12-drag-and-drop` | STORY-016, STORY-023, STORY-101 |
| STORY-097 | Build the drop overlay + `useFileDrop` hook and wire dropped files→tabs and dropped folders→workspace, with the replace-vs-new-window prompt | M | `ui/components/`, `logic/hooks/`, `logic/store/`, `ui/widgets/` | `01_Product/03_FILES_TABS_WORKSPACE.md#drag-and-drop-open`, `mockups/gomarkedit-mockup.html` | STORY-096, STORY-026, STORY-028 |

> Story ids 096/097 are appended (globally monotonic) because drag-and-drop was added after the initial
> phase numbering; they belong to Phase 03 but sit after the Stage-3 range in id order.

## Edge cases

- **EC-WS-1** — Very large folder → large-folder guard + lazy children, UI responsive (STORY-023/025).
- **EC-WS-2** — No matching files → empty-tree message, not a blank pane (STORY-025).
- **EC-WS-3** — Folder deleted/moved after opening → stale nodes handled, no crash (STORY-025).
- **EC-WS-4** — Permission-denied subfolder → skip with indicator, continue (STORY-023).
- **EC-WS-5** — Symlink loops / cyclic dirs → bounded traversal (STORY-023).
- **EC-WS-6** — Files created/renamed externally → manual refresh updates tree (STORY-025).
- **EC-WS-7** — Hidden/dotfiles/non-matching extensions always filtered (STORY-023).
Drag-and-drop edge cases as defined in `01_Product/03_FILES_TABS_WORKSPACE.md#drag-and-drop-open` /
`01_Product/03_FILES_TABS_WORKSPACE.md#edge-cases` and ADR-0012:

- **EC-DND-1** — Drop a file with no document open / current tab an empty untitled buffer → opens in the current tab (STORY-097).
- **EC-DND-2** — Drop a folder with no workspace open → opens in the current window, no prompt (STORY-097).
- **EC-DND-3** — Drop a folder with a workspace already open → prompt "Open in this window" / "Open in a new window" (STORY-097).
- **EC-DND-4** — Drop a file whose path is already open → focus the existing tab, no duplicate (STORY-097).
- **EC-DND-5** — Drop an unsupported file type → toast "Unsupported file type", open nothing (STORY-096/097).
- **EC-DND-6** — Drop a mix of files and folders → files open as tabs; each folder runs the folder flow (STORY-097).
- **EC-DND-7** — Non-file drop (text, browser image/tab) → ignored safely, no panic (STORY-096).
- **EC-DND-8** — Linux/WebKitGTK: the webview's default drop is suppressed — the drop never navigates the UI to the file (STORY-096).
- **EC-DND-9** — Dropped path no longer exists by the time it is read → toast error, open nothing (STORY-096).

## Phase exit checklist

Automated:

- [ ] `WorkspaceService.Open` returns only `.md/.markdown/.mdown/.txt`; dotfiles/hidden excluded (EC-WS-7).
- [ ] A symlink cycle terminates traversal within the bound (EC-WS-5).
- [ ] Recent list is MRU-ordered and prunes a missing path lazily (unit test).
- [ ] `OpenWorkspace` stores the workspace ref in `internal/appmodel` and the `workspace` projection
      reflects the emitted `state:patch` (DD-62/DD-63, STORY-023).
- [ ] Opening a tree file that is already open focuses its tab (reuses EC-TABS-1).
- [ ] `just check` green; bindings regenerated with no drift.

Manual:

- [ ] In `wails dev`: Open Folder shows only Markdown/txt files; expanding a node loads children.
- [ ] Reopen last file/folder restores it after a clean relaunch (no auto-restore on plain launch).
- [ ] Opening a second folder yields a second window; both share the settings DB with no lock error.
- [ ] Drag a `.md` file onto the window → opens in a tab (current tab if empty); drag an unsupported file
      → toast, nothing opens (EC-DND-1/5).
- [ ] Drag a folder with nothing open → opens as workspace; with a workspace already open → prompt with
      "Open in this window" / "Open in a new window" (EC-DND-2/3).
- [ ] On each OS the drop does **not** navigate the webview to the file, and a non-file drop is ignored
      without crashing (EC-DND-7/8).

DoD reference: `06_Process_and_Traceability/06_DEFINITION_OF_DONE.md`. Stage 1 (Viewer); contributes to Milestone **M1**.
