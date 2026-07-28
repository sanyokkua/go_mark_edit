# A folder of notes

## What it's for

Markdown files come in collections: a documentation directory, a personal notes folder, a repository's
`docs/`. Opening one file at a time from a dialog is fine for a quick edit and hopeless for working
through a set. Opening the folder gives a tree you can move around in, and it is also what later
features — quick-open by filename, the assistant reading a neighbouring note — are scoped to.

## What you can do

`Ctrl/Cmd+Shift+O` opens a folder. It appears in the left sidebar as a tree, filtered to Markdown and
text files, with the folder's name as the label. Clicking a file opens it.

`Ctrl/Cmd+\` shows and hides the sidebar, and its edge is draggable.

You can create a new file or a new folder from the sidebar header or the tree's context menu, typing the
name in place. The context menu also has Copy path and Reveal in file manager. The app does not rename,
move or delete anything.

## Rules

### The tree shows Markdown and text files only {#tree-is-filtered}
- The tree shows files ending `.md`, `.markdown`, `.mdown` and `.txt`. Every other file and every
  dotfile is hidden.
- Directories are always shown, so a nested matching file is reachable even when its parents contain
  nothing else.
- The sidebar footer shows the active filter as chips: `.md`, `.markdown`, `.txt`.

Examples: a repository with `src/`, `docs/` and `package.json` → `src/` and `docs/` are shown,
`package.json` is not · a folder containing only `deep/nested/notes.md` → both directories are shown so
the file can be reached · hiding empty directories → the file becomes unreachable.

### Children load when a node is expanded {#tree-loads-lazily}
- The tree loads a folder's children when that folder is expanded, not all at once on open.

Examples: opening a large repository → the root's contents appear immediately · enumerating everything
up front → the sidebar is empty for seconds and the window is unresponsive.

### Enumeration stops at 20,000 entries and 12 levels {#enumeration-limits}
- **If** a workspace reaches **20,000** enumerated entries, **then** enumeration stops and the tree shows
  what it has plus a note that the folder is too large to index.
- Directories deeper than **12** levels are not descended into. This also bounds symlink cycles.

Examples: a home directory opened by accident → the tree shows the first 20,000 entries and says so
rather than hanging · a symlink pointing at its own parent → bounded at depth 12 rather than looping ·
19,999 entries → fully indexed.

### The app creates files and folders and changes nothing else {#additive-operations-only}
- The app can **create** a file or a folder in the workspace, **reveal** a path in the platform's file
  manager, and **copy** a path to the clipboard.
- It **never** renames, moves, deletes or reorders anything on disk.

| Operation | Where | What it does |
|---|---|---|
| New file | sidebar header; tree context menu | Creates an empty `.md` in the selected folder, or in the workspace root when nothing is selected, and opens it in a tab. The name is typed inline in the tree. |
| New folder | sidebar header; tree context menu | Creates an empty directory in the same place, named inline. |
| Reveal in file manager | tree context menu; tab context menu | Hands the path to the platform. |
| Copy path | tree context menu; tab context menu | Puts the absolute path on the clipboard. |

Examples: New file in `docs/` → `docs/untitled.md`, named in place, opened in a tab · a Rename entry →
not offered.

*Why creation is safe and renaming is not:* after a create, the app knows exactly what changed and
inserts that one node. After a rename or a delete it would have to reconcile an unknown amount of state
— every open tab, the recent list, the whole subtree — with no filesystem watcher and no way to undo it.
Renaming a file means using a file manager, or Save As. That is a real limitation, and it is stated
rather than left to be discovered.

### A name that already exists is refused {#duplicate-names-are-refused}
- **If** a new file or folder would take a name that already exists in that directory, **then** it is
  refused with a message naming the conflict.
- Nothing is ever overwritten, and nothing is silently renamed to `file (2).md`.

Examples: New file named `notes.md` where `notes.md` exists → refused, with the name in the message ·
silently creating `notes (2).md` → the user has a file they did not name and will not find.

### The tree inserts the node it created {#tree-inserts-not-reenumerates}
- **When** a file or folder is created, the tree inserts that one node in place.
- The folder is not re-enumerated.

Examples: creating a file in a folder of 2,000 → one node appears instantly · re-enumerating → a visible
pause and a scroll position lost, every time.

### There is no filesystem watcher {#no-filesystem-watcher}
- External changes are not detected continuously. The tree reflects them on a manual refresh, and an
  externally changed open file is caught at the moment of the next write; see
  `opening-and-saving-files.md#external-change-check`.
- **If** a node has been deleted or moved when the user interacts with it, **then** the failure is
  reported and the node is removed from the tree.

Examples: a file deleted in a terminal → the tree still shows it until refreshed, and clicking it says it
is gone and removes it · a watcher → background work on three platforms, with an unbounded event rate on
a large repository.

### Unreadable subfolders are skipped with an indicator {#permission-denied-subfolders}
- **If** a subfolder cannot be read, **then** it is shown with an indicator and its children are not
  enumerated. The rest of the tree is unaffected.

Examples: a root-owned directory inside the workspace → marked, and the rest of the tree loads · aborting
the whole enumeration → one unreadable directory makes the whole folder unusable.

### The sidebar's visibility and width persist {#sidebar-persists}
- `Ctrl/Cmd+\` shows and hides the sidebar.
- Its visibility and width are part of the application layout and are written through on change; see
  `the-app-window.md#layout-persists`.
- The edge is draggable and the width is persisted as `ui.sidebarWidth`.

Examples: hide the sidebar, quit, relaunch → hidden · drag it to 320 px, open a new window → 320 px.

### The workspace root is part of the asset allowlist {#workspace-is-in-the-allowlist}
- **While** a folder is open, its root is one of the directories from which local document assets may be
  served, alongside each document's own folder.

Examples: `![](../images/logo.png)` in `docs/guide.md` with the repository root open → served ·
the same link with only `docs/` open → refused, because the target is outside the allowlist; see
`images-and-remote-content.md`.

### An empty tree says so and offers the next action {#empty-tree-state}
- **If** the open folder contains no files the app shows, **then** the tree reads:

  > No Markdown files in this folder.
  > *New file* · *Open a different folder…*

- **If** the tree filter matches nothing, **then** it reads `Nothing matches "<query>".` with a
  *Clear filter* action — not the "nothing here yet" copy.
- An empty state is never shown while enumeration is still running. A large folder shows progress.

Examples: a folder of images → the empty-tree message · filter `budget` matching nothing →
`Nothing matches "budget".` · the empty message shown for a second while a large folder enumerates, then
files appearing → the user is told twice, and the first time is a lie.

## What it looks like

- The sidebar with a tree — `../surface/mockup.html#material-light/editor-split`
- The tree context menu — `../surface/mockup.html#material-light/context-menu`
- Sidebar hidden — `../surface/mockup.html#material-light/no-sidebar`
- An empty folder — `../surface/mockup.html#material-light/empty-tree`
- A filter matching nothing — `../surface/mockup.html#material-light/filter-empty`

## When things go wrong

| Situation | What the user sees | What they can do |
|---|---|---|
| The folder cannot be read | `No permission to open that file` · `Check the file's permissions, or open a copy from somewhere you can write.` | Open a folder they can read |
| The folder has more than 20,000 entries | The tree shows what it has, plus a note that the folder is too large to index | Open a narrower folder |
| A tree node was deleted outside the app | An error naming the file, and the node is removed | Refresh, or open the file's new location |
| A new file's name is already taken | A message naming the conflict; nothing is created | Choose another name |
| A subfolder cannot be read | It is shown with an indicator and does not expand | Nothing — the rest of the tree works |

## Edge cases

**A folder is opened while another folder is already open**
- *Trigger:* Open Folder with a workspace already open.
- *Expected:* the new folder replaces the current workspace in this window. Modified documents prompt
  first.
- *Avoid:* replacing the workspace and discarding unsaved work silently. Dropping a folder is different —
  see `dragging-files-in.md#dropping-a-folder-when-one-is-open-prompts`.

**A file is created in a collapsed folder**
- *Trigger:* the context menu's New file is used on a folder that is not expanded.
- *Expected:* the folder expands, the new node appears in place, and the name is typed inline.
- *Avoid:* creating the file with no visible feedback, leaving the user unsure whether it worked.

**A symlink points at an ancestor**
- *Trigger:* `docs/link` points at the workspace root.
- *Expected:* enumeration stops at 12 levels. The tree is finite and the app stays responsive.
- *Avoid:* following it, which produces an infinite tree and eventually exhausts memory.

**The workspace folder itself is deleted while open**
- *Trigger:* the open folder is removed from a terminal.
- *Expected:* the next interaction reports it and the tree empties. Open documents stay open.
- *Avoid:* closing every tab because the workspace went away — the documents are separate from the tree.

## Not this

- **No rename, move or delete.** After a create the app knows exactly what changed. After a rename it
  would have to reconcile every open tab, the recent list and the whole subtree, with no filesystem
  watcher and no undo.
- **No filesystem watcher.** It is background work with a per-platform implementation and an unbounded
  event rate on a large repository, and this app does no background work.
- **No showing of non-Markdown files.** A tree that lists everything is a file manager, and the filter is
  what makes this one useful for the job it has.
- **No multi-root workspaces.** One folder at a time. A second root would need its own allowlist entry,
  its own search scope and its own tree label, for a case a second window already handles.
- **No drag-to-move inside the tree.** It is a move on disk, which is exactly what
  `#additive-operations-only` refuses.

## Decisions

- *2026-07-25* — Workspace file operations are additive only: create, reveal and copy path; never rename,
  move, delete or reorder. Recorded in `../../adr/0033-additive-only-workspace-operations.md`.
- *2026-07-25* — "Reveal in Finder" became "Reveal in file manager", which is true on all three
  platforms.
- *2026-07-28* — The open folder scopes **quick-open by filename** and the assistant reading a
  neighbouring note. It does not scope a content search, because there is none — see
  `finding-things.md#search-never-leaves-the-open-file`.

## Open questions

*(none — ready to build)*
