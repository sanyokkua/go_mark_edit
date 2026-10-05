# Design

## Context

The app already had a canonical open lifecycle (`OpenPath`, `OpenRecentFile`), an empty `Sidebar` shell, availability-gated File-menu rows (Open Folder, New Window) and shared Popup, MenuItem and ModalShell components. The backend owns state; the frontend projects it. Wails v2 has no in-process multi-window API and no filesystem watcher exists in the product.

## Goals / Non-Goals

- Goals: browse a folder safely and predictably, reuse the existing open lifecycle and shared UI, and keep one owner per behaviour.
- Non-goals: rename, move or delete from the tree; name search or filter; a keyboard route to the tree context menu (the header "+" button is the keyboard route to New File and New Folder; Copy Path and Reveal are pointer-only); detecting macOS Finder alias files; live cross-window messaging; a filesystem watcher.

## Decisions

- Tree builder: `internal/workspace/tree.go` uses `os.ReadDir` with one global entry counter. Symbolic links and Windows directory links (junctions, mount points) are never listed or followed, so cycles cannot occur. The root is always shown (even if dot-named) and counts as one of the 20,000 entries; reaching the bound marks the snapshot `truncated`. Per-directory errors are isolated and mark that node `unreadable`.
- Filtering: hidden files are always excluded; dot-folders are excluded and not walked unless "Show hidden folders" is on; the supported-document-suffix list is reused, not redefined. Children sort folders first, then A to Z.
- Snapshot: one nested `WorkspaceSnapshot` (`rootPath`, `rootName`, `root`, `totalEntries`, `truncated`, `unavailable`, `filterSuffixes`, `showHiddenFolders`) of `WorkspaceNode{path, name, isDir, unreadable, children}`. It is rebuilt on open and refresh and never persisted. At most one workspace per window.
- Setting: `workspace.showHiddenFolders` is stored through the existing layout repository beside `workspace.visible`; it is app-wide and re-read by the window that flips it.
- Commands (`AppModelHandler`): ChooseWorkspaceFolder, OpenWorkspace, RefreshWorkspace, CloseWorkspace, SetWorkspaceHiddenFolders, CreateWorkspaceFile, CreateWorkspaceFolder, RevealWorkspacePath, CopyWorkspacePath, ClassifyDroppedPaths, RefreshRecentItems, ClearRecentItems; ReopenLastFile is extended. Reveal and Copy Path reuse the existing document path actions.
- Replace and close: Close Folder and replacing the open folder go through the existing per-document save flow; cancelling any prompt abandons the whole operation. Every folder-opening entry point (menu, recent, Reopen Last, drop) shows the same replace-or-new-window prompt when a folder is already open.
- Recent Items: the files-only list (cap 6) becomes `RecentItem{path, kind}` (cap 10) in the same KV key, stored as versioned JSON v2; v1 string entries decode as files. Labels are names only with the full path on hover. A window re-reads the list when its File menu opens; there is no cross-window messaging. Missing paths are removed automatically when found gone.
- Reopen Last: one command resolved by session. It restores the most recent closed tab; when none, it opens the newest Recent entry (a folder returns `folder-target` and the frontend runs the open-folder flow). It is available while either source is non-empty.
- Drag and drop: native drop is enabled in `options.go` and received through the generated runtime `OnFileDrop` inside `logic/adapter/`. `ClassifyDroppedPaths` buckets paths into files, folders and unsupported without opening anything; the frontend drives opens through the existing adapter calls. One prompt covers a multi-folder drop. The 40-document limit applies unchanged (batch drops report which files were skipped).
- New Window: spawns a new OS process of the current executable with an optional startup folder argument (`internal/application/new_window.go`).
- Tree UI: `WorkspaceTree`, `WorkspaceTreeNode`, `WorkspaceTreeContextMenu` and `CreateEntryPrompt` under `ui/widgets/WorkspaceTree/`; `WorkspaceReplacePrompt`, `FolderDropPrompt` and `CloseFolderPrompt` under `ui/widgets/dialogs/`; `WindowDropTarget`. No new popup, modal or menu primitive. Keyboard model is basic (Tab, Up/Down, Enter). Rows reuse the projected document state for open and dirty marks.
- New File and New Folder refuse names that begin with a dot, inline, because such items would be created but never shown.

## Risks / Trade-offs

- Symbolic-link exclusion means notes reached only through links must be opened by real path, Recent Items or a drop.
- No watcher: the tree can be stale until refresh.
- The full verify run is long (about 31 minutes) because every E2E case launches its own app; concurrency was deliberately not increased to avoid port conflicts.
- The context menu has no keyboard route by owner decision; adding one is a possible follow-up.
