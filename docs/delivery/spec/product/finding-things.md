# Finding things

## What it's for

Four ways of finding something: the text in the document you are editing, a file in the open folder **by
its name**, a command whose shortcut you cannot remember, and a heading three screens down.

The first of those is Monaco's find widget, and the work is exposing all of it rather than building
anything. The other three are one search box over three catalogues — the workspace tree, the shortcut
registry, and the document's own headings. Built separately, the same filtering, the same result list,
the same keyboard handling and the same "no matches" state get written three times, and the third one
looks different from the first.

**Searching *inside* files is only ever the file you have open.** Nothing here reads a file you are not
looking at: quick-open matches filenames and never opens them to look, and there is no search or replace
across the folder. `#search-never-leaves-the-open-file` says why.

The outline also produces something nothing else does: a map from each heading to the source line it
came from. That map is what makes scroll sync cheap.

## What you can do

`Ctrl/Cmd+F` finds in the document, with `Ctrl/Cmd+H` to replace, regular expressions, and `F3` /
`Shift+F3` to step through matches.

`Ctrl/Cmd+P` is quick-open: type part of a filename and land in it.

`Ctrl/Cmd+Shift+P` is the command palette: type part of a command's label and run it, without knowing
its shortcut.

`Ctrl/Cmd+Shift+U` toggles the Outline — the current document's headings, nested, click to jump.

## Rules

### Find and replace is the editor's own, and every part of it is exposed {#find-is-the-editors-own-and-fully-exposed}
- `Ctrl/Cmd+F`, `Ctrl/Cmd+H`, `F3` and `Shift+F3` are Monaco's own find widget. It is not reimplemented,
  and it is not wrapped.
- Every capability the widget already has is reachable and none is hidden: **regular expressions**,
  **match case**, **whole word**, **find in selection**, **replace**, **replace all**, and the **match
  counter** that reads `3 of 17`.
- Those four bindings are **reserved in the shortcut registry from the moment the registry exists**, so
  no later phase binds over them.
- The widget is themed from the generated editor theme: `editorWidget.background` from `--surface`,
  `editorWidget.border` from `--stroke`.
- Find operates on the editor pane. In Preview-only and in reading mode, the webview's own in-page find
  is what is available; the app does not reimplement that either.

*Avoid:* wrapping the widget in a reduced custom find box with a text field and next/previous buttons.
That is strictly less capable than what is already in the bundle — it costs work to lose find-in-selection,
the match counter and the regular-expression toggle.

Examples: select three paragraphs, open find, enable find-in-selection, replace all → only those three
paragraphs change · an app-level `Ctrl+F` handler added by another feature → Monaco's find stops opening,
and the cause is a handler in an unrelated place · an unthemed widget in a dark Liquid Glass window → a
white box that is the most visible thing on screen.

### Find and replace never leave the open file {#search-never-leaves-the-open-file}
- Find, replace and replace-all act on the **active document** and nothing else.
- There is no cross-file search and no cross-file replace. No other file in the workspace is read to
  answer a query, and no other file is written by a replace.

*Why:* a replace the user cannot see, across files they do not have open, in an app that has no rename
and no undo across files, is a way to lose work with one keystroke and no way back.

Examples: replace all with twelve files open → only the focused tab changes, the other eleven are
untouched · replace all with a folder open → the folder is irrelevant, only the active document changes ·
a match in a neighbouring note → not found, because it was never searched.

### One result list serves all three {#one-result-list}
- The filtering, the ranking, the keyboard navigation, the empty state and the footer key hints are one
  component. Quick-open, the command palette and the outline are that component with a different source.

Examples: keyboard behaviour learned in the palette works in quick-open · three separate lists → three
different behaviours for arrow keys and Enter.

### The result list is fully keyboard-driven {#result-list-keyboard}
- Arrow keys move the selection, Enter activates it, `Esc` closes the list.
- The list scrolls to keep the selection visible.
- The footer shows the key hints for the current list.

Examples: open the palette, type three letters, press Enter without touching the mouse → the command
runs. · the same list with a result selected and `Esc` pressed → the list closes and nothing runs,
because Enter is the only thing that activates

### An empty result says what did not match {#result-list-empty-state}
- **If** a query matches nothing, **then** the list says so and names the query — `Nothing matches
  "budget".` — with the action that clears it.
- This is distinct from a list that is empty because there is nothing to search.

Examples: a filter matching nothing → `Nothing matches "budget".` + *Clear filter* · a folder with no
Markdown files → `No Markdown files in this folder.` + *New file* · the same copy for both → the user
cannot tell whether their query is wrong or the folder is.

### The command palette runs over the shortcut registry {#palette-over-the-registry}
- `Ctrl/Cmd+Shift+P` opens a palette listing every action in the shortcut registry, with its label and
  its binding.
- A command added to the registry appears in the palette without the palette changing.

Examples: type `lint` → the lint command, with `⌥⇧L` beside it, runnable without knowing the binding ·
a hand-maintained command list → it goes stale on the first addition.

### Quick-open searches the workspace tree by filename {#quick-open-by-filename}
- `Ctrl/Cmd+P` matches against filenames in the open workspace.
- **If** no folder is open, **then** quick-open says so rather than showing an empty list.

Examples: type four letters of a filename → that file · `Ctrl+P` bound to print instead → a browser
convention in a desktop application, which is why Export moved to `Ctrl/Cmd+Shift+E`.

### The outline is a tab in the sidebar {#outline-is-a-sidebar-tab}
- The outline is a second tab in the sidebar, beside Files. It shows the current document's headings,
  nested by level.
- Clicking a heading moves the editor and the preview to it.
- The outline is available in reading mode too.
- A heading inside a fenced code block is not a heading and does not appear.

Examples: a document with four levels of heading → a four-level tree · scanning the raw text for a
leading `#` → headings inside code fences appear in the outline and jumping to one lands in the middle
of a code sample.

### The heading map is what drives scroll sync {#heading-map-drives-scroll-sync}
- The outline produces a map from each heading to the source line it came from, and scroll sync uses that
  map rather than parsing the document a second time.

Examples: the outline and scroll sync agreeing about where a heading is, always, because there is one
map · two parses → they disagree on documents with unusual structure, and only one of the two is ever
debugged.

### The palette opens while something is running, with what cannot run disabled {#palette-during-a-long-operation}
- **While** a long operation holds the gate, `Ctrl/Cmd+Shift+P` still opens the palette.
- Entries that cannot run are **disabled with the reason on the row** — for example
  `Export is running`.
- The cancel entry for the running operation stays enabled.

Examples: an export running, palette opened, `Format document` shown greyed with `Export is running`
beneath it and `Cancel export` enabled → the user can stop the thing that is blocking them · every entry
left enabled → pressing one starts a gated command that is immediately refused, which is a confusing way
to say no after the user has committed to the action · refusing to open at all → the one command they
wanted is behind a palette that will not open.

### A result row goes to the exact place {#results-jump-to-the-spot}
- **When** a quick-open result is activated, the file opens — or its tab is focused if it is already
  open — and the caret is at the top of the document.
- **When** an outline heading is activated, the caret moves to that heading's source line and the
  preview moves with it.

Examples: quick-open a file that is already in a tab → that tab is focused, no second tab · click a
heading 300 lines down → the caret lands on that line, not near it.

## What it looks like

- A filter matching nothing — `../surface/mockup.html#material-light/filter-empty`
- The sidebar, where the Outline tab sits beside Files —
  `../surface/mockup.html#material-light/editor-split`
- The shortcuts dialog, which lists the same registry the palette runs over —
  `../surface/mockup.html#material-light/shortcuts`

## When things go wrong

| Situation | What the user sees | What they can do |
|---|---|---|
| Quick-open with no folder open | A message saying there is no folder open, with **Open folder…** | Open a folder |
| A quick-open result's file has been deleted | The row reports it and is removed from the list | Try again |
| A regular expression in find is invalid | Monaco's own inline indication in the find widget | Fix the expression |
| Find matches nothing in this document | Monaco's own `No results` in the match counter | Widen the query, or open the file it is in |

## Edge cases

**Replace all is pressed with twelve documents open**
- *Trigger:* find `TODO`, replace with `DONE`, press Replace all, with twelve tabs open and a folder in
  the sidebar.
- *Expected:* only the focused document changes. The other eleven tabs and every file on disk are
  untouched, and one undo reverses the whole replace in the one document it touched.
- *Avoid:* treating the open folder or the tab set as the scope, which edits files the user cannot see
  and cannot undo in one step.

**The palette is opened while a long operation is running**
- *Trigger:* `Ctrl/Cmd+Shift+P` during an export.
- *Expected:* see `#palette-during-a-long-operation`.
- *Avoid:* refusing to open, which makes the palette feel unreliable at the moment the user most wants to
  cancel something.

**The outline on a document with no headings**
- *Trigger:* a plain list with no `#` anywhere.
- *Expected:* the outline shows its empty state, and scroll sync does not attempt to sync.
- *Avoid:* an empty pane with no explanation.

**The active document changes while the outline is open**
- *Trigger:* a tab switch.
- *Expected:* the outline rebuilds for the new document.
- *Avoid:* showing the previous document's headings, where clicking one jumps to an unrelated line.

## Not this

- **No reimplementation of find and replace, and no reduced wrapper around it.** See
  `#find-is-the-editors-own-and-fully-exposed`. A custom find box is strictly less capable than the
  widget already in the bundle.
- **No search across files.** Reading every file in a folder to answer a query needs a bound, a streaming
  result list, a staleness story against unsaved buffers, and an answer for what a cross-file replace
  does to files you cannot see — for a capability a text editor is not the right place to have.
- **No fuzzy matching in find-in-document.** Monaco's find is literal or regular-expression, and changing
  that would surprise anybody who has used an editor before.
- **No separate binding for each catalogue's list.** One list, three sources.

## Decisions

- *2026-07-25* — `Ctrl/Cmd+P` is quick-open and `Ctrl/Cmd+Shift+P` is the command palette. Export to PDF
  moved to `Ctrl/Cmd+Shift+E`. In an application with tabs, a file tree and Monaco, `Ctrl+P` is where
  people reach for quick-open.
- *2026-07-28* — The command palette opens during a long operation, with unavailable entries disabled and
  the reason shown on the row, rather than refusing to open.
- *2026-07-28* — **Search is the open file only.** Cross-file search and cross-file replace are out of
  scope, and the three rules that specified a folder-wide query — its bounds, its on-demand file reads,
  and its coverage of unsaved buffers — are removed along with the `Ctrl/Cmd+Shift+F` binding. Find and
  replace is Monaco's, and the job is to expose all of it rather than to build a second search engine.
  Quick-open stays: it matches filenames in the tree and never reads a file's contents, so it is
  navigation rather than search.

## Open questions
