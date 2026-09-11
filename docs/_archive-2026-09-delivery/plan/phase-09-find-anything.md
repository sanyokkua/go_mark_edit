# Phase 09 — I can find anything in this file, and jump anywhere in the app

## What you get

Four ways to find things.

Press Ctrl+F and search the document you are editing — with replace, regular expressions, match case,
whole word, find in selection, and a counter telling you which match you are on. Press Ctrl+P and jump
to any file in your folder by typing part of its name. Press Ctrl+Shift+P and run any command in the
app by typing part of its label, without remembering its shortcut. Open the Outline and see the
headings of the current document, click one, and go there.

And because the outline knows which heading you are looking at, the preview finally follows the editor
when you scroll.

**Searching inside a file means the file you have open.** Neither find nor replace ever touches another
file — `../spec/product/finding-things.md#search-never-leaves-the-open-file` says why, and
`Ctrl/Cmd+Shift+F` is deliberately left unbound.

## Why these are one phase and not four

Three of them are one search box over three catalogs — the workspace tree, the shortcut registry, and
the document's own headings. Split across three phases, the same filtering, the same result list, the
same keyboard navigation and the same "no matches" state get built three times, and the third one looks
different from the first.

The fourth, find and replace, is Monaco's own widget. It belongs here because it is the same job from
the user's side, and because the work is _exposing_ the widget rather than building one.

The outline also produces something nothing else does: a map from each heading to the source line it
came from. That map is what makes scroll sync cheap. Built anywhere else it would be a second parse of
the document.

## Build it in this order

1. **Find and replace in the document.** Monaco has this; the work is making it ours and exposing all
   of it. Reserve Ctrl+F, Ctrl+H and F3 in the registry so nothing binds over them; theme the find
   widget — it is a separate colour surface and it ships white by default, which in a dark Liquid Glass
   window is unmissable; confirm regular expressions, match case, whole word, **find in selection**,
   replace, replace all and the **match counter** are all reachable and none has been hidden; and decide
   what find does in the preview and in reading mode. Do not wrap it in a custom find box — that is
   strictly less capable than what is already in the bundle.
2. **One result list.** The filtering, the ranking, the keyboard navigation, the empty state, the
   footer key hints. Everything below is this component with a different source.
3. **The command palette.** Over the shortcut registry Phase 04 built — which is already "the single
   source of truth for the toolbar, the menus, the tooltips and the Shortcuts dialog". Roughly forty
   actions nobody will memorise become discoverable by typing.
4. **Quick-open by filename.** Over the workspace tree from Phase 07. This is why Export to PDF moved
   off Ctrl+P: in an app with tabs, a file tree and Monaco, people reach for quick-open there.
5. **The outline.** A second tab in the Phase 03 sidebar slot, beside Files. Headings of the current
   document, nested, click to jump, and available in reading mode too.
6. **Scroll sync, the cheap way.** In split view, scrolling the editor moves the preview to the
   heading you are under, and back again. Not character-accurate — heading-accurate. That is most of
   the value for almost none of the cost, and the heading map already exists from step 5.

## Where the details are

- Behaviour: **`../spec/product/finding-things.md`** — this phase's own feature file. Find and replace,
  the one result list, quick-open, the command palette, the outline, and the heading map that drives
  scroll sync are all specified there
- Also behaviour: `../spec/product/writing-in-the-editor.md` (the editor pane and split view that
  scroll sync moves), `../spec/product/keyboard-shortcuts.md` (the registry, and the bindings frozen
  there)
- Limits: `../spec/constraints.md#every-limit-is-named` — the quick-open and palette result list stops
  at **1,000** and says how many were found
- Decisions: one command palette over the shortcut registry; `Ctrl/Cmd+P` is quick-open and
  `Ctrl/Cmd+Shift+P` is the palette, which is why Export moved to `Ctrl/Cmd+Shift+E`; search is the open
  file only, so `Ctrl/Cmd+Shift+F` stays unbound
- What it looks like: **the mockup does not draw these screens yet.** `../spec/surface/mockup.html`
  has `filter-empty` (a filter that matched nothing) and the sidebar the Outline tab sits in, and
  nothing else from this phase. Adding the command palette, quick-open and the Outline tab to the
  mockup is a deliverable **of** this phase — the mockup is Tier A, so they are drawn before they are
  built, not after

## Questions to settle first

**None blocking — all three former questions were settled on 2026-07-28 and now live in
`../spec/product/finding-things.md`.**

- **Does a folder-wide query read files or an index?** Moot: there is no such query. Find and replace
  never leave the open file (`#search-never-leaves-the-open-file`).
- **Does it cover files that are open and edited but not saved?** Moot for the same reason — the only
  file searched is the one whose buffer is on screen.
- **What does the palette do while an operation is running?** It stays open, with entries that cannot
  run disabled and the reason on the row (`#palette-during-a-long-operation`).

## Done when

Open a folder of notes. Press Ctrl+P, type four letters of a filename, and land in that file. Press
Ctrl+Shift+P, type "lint", and run it without knowing its shortcut. Press Ctrl+F, search with a
regular expression, replace all, and undo it in one step. Open the Outline, click a heading three
screens down, and arrive there. Then put the window in split view, scroll the editor through a long
document, and watch the preview keep up.

Then prove the find widget is whole, not a wrapper: select three paragraphs, open find, turn on **find
in selection**, replace all, and confirm the rest of the document is untouched — then read the **match
counter** and confirm it says which match you are on out of how many. With twelve tabs open, replace
all in one of them and confirm the other eleven and every file on disk are unchanged. Press
`Ctrl/Cmd+Shift+F` and confirm nothing happens.

And the constraints every phase carries: filter the tree for something that matches nothing and read
the exact empty-result wording; open a workspace big enough that quick-open exceeds 1,000 results and
confirm the list stops and reports the true total; drive the palette, quick-open, the outline and the
result list by keyboard alone with a visible focus ring throughout; confirm the find widget is themed
in dark Liquid Glass; every new string goes through `t()`; watch the network for five minutes and
confirm nothing is sent. All of it in a real build.
