# Phase 07 — I can work on a whole folder of notes

## What you get

Open a folder and get a tree of it in the sidebar, showing only Markdown and text files. Click one to
open it. The files and folders you used recently are one menu away, and you can reopen the last one you
had. Drag a file onto the window and it opens. Open a second window when you want two folders at once.

## Build it in this order

1. **Open a folder.** Pick a folder and see its tree in the Phase 03 sidebar slot, filtered to `.md`,
   `.markdown`, `.mdown`, `.txt`. Folders always show so you can reach nested files. A folder with
   nothing matching says so rather than looking broken.
2. **Make the tree behave on a big folder.** Enumerate lazily as you expand, with explicit bounds, so
   a huge directory never freezes the window. Survive a symlink loop. Survive a folder you are not
   allowed to read — show it as unreadable, do not fail the whole tree. Provide a manual refresh;
   there is no filesystem watcher.
3. **Open from the tree.** Clicking a file opens it in a tab, using exactly the same open path as the
   File ▸ Open dialog. Not a second implementation.
4. **Recent files and folders.** A bounded most-recently-used list of each, persisted, pruning entries
   whose path has disappeared. Plus an explicit "reopen last" — the app never restores anything by
   itself on launch.
5. **Drag and drop.** Drop a supported file on the window and it opens in a new tab, or in the current
   one if that is an empty never-saved buffer. Drop several and get several tabs. Drop a folder and it
   becomes the workspace. Drop something unsupported and get a toast, not an empty tab. The webview's
   own drop behaviour is suppressed so the page never navigates away.
6. **A second window.** Open a new window with its own workspace and tabs. Both share the settings
   database safely — that is what WAL and the busy timeout were for.

## Where the details are

- Behaviour: `01_Product/03_FILES_TABS_WORKSPACE.md` — open folder, tree filter, recent, reopen last,
  multi-instance, drag-and-drop open
- What it looks like: `mockups/gomarkedit-mockup.html` → `editor-split` (sidebar), `no-sidebar`,
  `drop-overlay`, `drop-prompt`
- Decisions: DD-06 (open a folder), DD-11 (file-first, no automatic session restore), DD-08
  (multi-instance, no lock), DD-58/DD-59 (drop handling)

## Questions to settle first

- **Replacing a workspace while files are unsaved.** Opening a different folder has to reuse the
  dirty-document flow from Phase 05. If Phase 05's question 3 was answered as recommended — one
  aggregate dialog, nothing written until you choose — this follows directly and needs no separate
  answer. Confirm it does before starting step 5.
- **Which view mode a tree-opened file uses.** Same question as Phase 05's question 1. It should
  already be answered; do not answer it differently here.

## Done when

Open a folder of notes and see only the Markdown in it. Expand into a subfolder. Click a file and edit
it. Open a folder with a few thousand files and watch the window stay responsive. Drag a file in from
the desktop. Open a second window on a different folder and use both at once. Quit, reopen, and get a
clean empty app — then use "reopen last" and get your folder back.
