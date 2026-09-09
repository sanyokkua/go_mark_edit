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

- Behaviour: `../spec/product/opening-and-saving-files.md` — open folder, tree filter, recent, reopen last,
  multi-instance, drag-and-drop open
- What it looks like: `../spec/surface/mockup.html` → `editor-split` (sidebar), `no-sidebar`,
  `drop-overlay`, `drop-prompt`
- Decisions: a folder opens as a filtered tree; the app launches clean with no session restore;
  several windows run at once with no lock (`../adr/0006-multi-instance.md`); dropped paths take the
  same route as an operating-system open (`../adr/0012-drag-and-drop.md`)

## Questions to settle first

**Both are settled.** Neither blocks story planning.

- **Replacing a workspace while files are unsaved** — _Settled by
  `../adr/0024-corrected-phase02-document-lifecycle-policy.md`, recorded 2026-07-28._ Phase 05's
  question 3 was answered as recommended: one aggregate dialog, nothing written until you choose. This
  reuses it unchanged — `../spec/product/opening-and-saving-files.md#close-prompts-when-modified`.
- **Which view mode a tree-opened file uses** — _Settled by the same ADR, recorded 2026-07-28._ The
  workspace tree is named explicitly as a file-system open source, so the global default open mode
  applies exactly as it does to the Open dialog:
  `../spec/product/opening-and-saving-files.md#opens-use-the-default-open-mode`. Do not answer it
  differently here.

## Done when

Open a folder of notes and see only the Markdown in it. Expand into a subfolder. Click a file and edit
it. Open a folder with a few thousand files and watch the window stay responsive. Drag a file in from
the desktop. Open a second window on a different folder and use both at once. Quit, reopen, and get a
clean empty app — then use "reopen last" and get your folder back.

And the constraints every phase carries: open a folder with nothing in it and read the exact empty-tree
wording; filter to something that matches nothing and confirm it says so rather than showing the
empty-folder copy; open a folder with more than 20,000 entries and confirm enumeration stops and says
why; the whole tree is navigable by keyboard alone with a visible focus ring; the sidebar works in
three themes across light and dark; every new string goes through `t()`; watch the network for five
minutes and confirm nothing is sent. All of it in a real build.
