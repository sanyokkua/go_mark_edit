# Phase 09 — I can find anything: in this file, this folder, this app

## What you get

Four ways to find things, built on one piece of machinery.

Press Ctrl+F and search the document you are editing, with replace and regular expressions. Press
Ctrl+P and jump to any file in your folder by typing part of its name. Press Ctrl+Shift+P and run any
command in the app by typing part of its label, without remembering its shortcut. Open the Outline and
see the headings of the current document, click one, and go there.

And because the outline knows which heading you are looking at, the preview finally follows the editor
when you scroll.

## Why these are one phase and not four

They are one search box over four catalogs — the document buffer, the workspace tree, the shortcut
registry, and the document's own headings. Split across three phases, the same filtering, the same
result list, the same keyboard navigation and the same "no matches" state get built three times, and
the third one looks different from the first.

The outline also produces something nothing else does: a map from each heading to the source line it
came from. That map is what makes scroll sync cheap. Built anywhere else it would be a second parse of
the document.

## Build it in this order

1. **Find and replace in the document.** Monaco has this; the work is making it ours. Reserve Ctrl+F,
   Ctrl+H and F3 in the registry so nothing binds over them; theme the find widget — it is a separate
   colour surface and it ships white by default, which in a dark Liquid Glass window is unmissable;
   and decide what find does in the preview and in reading mode.
2. **One result list.** The filtering, the ranking, the keyboard navigation, the empty state, the
   footer key hints. Everything below is this component with a different source.
3. **The command palette.** Over the shortcut registry Phase 04 built — which is already "the single
   source of truth for the toolbar, the menus, the tooltips and the Shortcuts dialog". Roughly forty
   actions nobody will memorise become discoverable by typing.
4. **Quick-open by filename.** Over the workspace tree from Phase 07. This is why Export to PDF moved
   off Ctrl+P: in an app with tabs, a file tree and Monaco, people reach for quick-open there.
5. **The outline.** A second tab in the Phase 03 sidebar slot, beside Files. Headings of the current
   document, nested, click to jump, and available in reading mode too.
6. **Search across the folder.** Type a phrase, see the files and lines that contain it, click through
   to the spot. Bounded by the same folder guard the tree uses — searching a home directory must not
   hang the app.
7. **Scroll sync, the cheap way.** In split view, scrolling the editor moves the preview to the
   heading you are under, and back again. Not character-accurate — heading-accurate. That is most of
   the value for almost none of the cost, and the heading map already exists from step 5.

## Where the details are

- Behaviour: `01_Product/02_EDITOR_AND_VIEWER_MODES.md` (find and replace, the outline, scroll sync),
  `01_Product/03_FILES_TABS_WORKSPACE.md` (quick-open, folder search),
  `01_Product/12_KEYBOARD_SHORTCUTS.md` (the registry, and the bindings frozen there)
- Limits: `03_NonFunctional/02_PERFORMANCE.md#hard-limits` — maximum results, maximum files scanned,
  and what the UI says when it stops early
- Decisions: DD-73 (one palette; Ctrl+P is quick-open, Ctrl+Shift+P is the palette)
- What it looks like: `mockups/gomarkedit-mockup.html` — the palette, quick-open, the outline tab, and
  the folder-search results

## Questions to settle first

- **Does folder search read files or an index?** Recommendation: read them, on demand, bounded by the
  limits table, with results streaming in. An index means invalidation, and there is deliberately no
  filesystem watcher.
- **Does search cover files that are open and edited but not saved?** Recommendation: yes — search the
  backend's buffer for open documents and the disk for everything else, and say so in the result row
  when the two differ. A search that cannot find the paragraph you just typed reads as broken.
- **What does the palette do while an operation is running?** Recommendation: stay open and disable the
  entries that cannot run, with the reason on the row, rather than refusing to open.

## Done when

Open a folder of notes. Press Ctrl+P, type four letters of a filename, and land in that file. Press
Ctrl+Shift+P, type "lint", and run it without knowing its shortcut. Press Ctrl+F, search with a
regular expression, replace all, and undo it in one step. Open the Outline, click a heading three
screens down, and arrive there. Search the whole folder for a phrase you know is in two files, and
click straight to the second one. Then put the window in split view, scroll the editor through a long
document, and watch the preview keep up.
