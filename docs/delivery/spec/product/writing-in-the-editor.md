# Writing in the editor

## What it's for

This is where the work happens. Someone writing release notes, documentation or a personal note types
Markdown source and wants it to feel like a good code editor: fast, with syntax colouring, line
numbers, find and replace, and no lag between a keystroke and the caret moving. Everything else in the
product exists to support this pane.

## What you can do

Type Markdown. The source is shown with syntax highlighting — headings, emphasis, links, quotes and
list markers are coloured — and the preview beside it shows the rendered result. The pane header reads
`Editor · <filename>` with the document's encoding and line ending beside it, for example `UTF-8 · LF`.

A segmented control in the toolbar switches between **Editor**, **Split** and **Preview**. The View
menu has the same toggles. A draggable divider between the two panes sets how the space is shared, and
double-clicking it returns to an even split.

Line numbers and word wrap are toggles in the View menu. `Ctrl/Cmd+F` and `Ctrl/Cmd+H` open find and
replace. Right-clicking gives cut, copy, paste, paste as plain text, bold, italic, link, format
document, compact, and the command palette — every one showing its keyboard shortcut.

The status bar along the bottom shows the Markdown standard, the caret position, the word count, the
encoding, the line ending, whether autosave is on, and the number of lint problems.

## Rules

### The editor shows source, never a rendered document {#editor-shows-source}
- The editor pane contains the Markdown text as written. There is no WYSIWYG mode and no rich-text
  editing surface.
- Rendering happens in the preview pane and in reading mode.

Examples: typing `**bold**` → the editor shows `**bold**` with the asterisks coloured as
`--md-strong`, and the preview shows **bold**.

*Why:* a Markdown editor that hides the syntax has to guess what the user meant when the two disagree,
and the syntax is the thing being edited.

### A keystroke moves the caret with no round trip {#typing-is-local}
- Typing updates the Monaco buffer immediately. Nothing crosses the bridge on the keystroke path.
- Keystroke-to-caret latency stays imperceptible, under about 16 ms on mid-range hardware.
- Formatting actions from the toolbar and shortcuts operate on the selection or the current line, so
  their cost does not grow with the document.

Examples: typing in a 5 MB document → the caret keeps up · a bridge call per keystroke → typing stutters
in proportion to document size.

### The buffer syncs to the backend on a debounce, and is flushed before anything reads it {#buffer-sync}
- The visible Monaco buffer is pushed to the Go model by `UpdateBuffer` after typing pauses, never per
  keystroke.
- **When** the editor loses focus, the tab is switched, the tab is closed, or a save runs, the latest
  buffer is flushed to the backend **before** that action proceeds.
- Every other consumer — the tab's modified dot, the status-bar counts, the preview source, an export,
  the assistant — reads the backend's copy, never the Monaco instance.

Examples: type, then immediately press `Ctrl/Cmd+S` → the flush happens first and the file contains the
last character typed · saving from the backend copy without flushing → the last few characters are
missing from the file and present on screen, which the user reads as data loss.

### The backend never writes text back into the focused editor {#no-text-echo-into-editor}
- A state update from the backend carries derived values — the modified flag, the word count, the
  encoding — and never the document's text.

Examples: typing continuously for a minute → the caret never jumps · a state update that reset the
editor's value → the caret returns to the top of the document mid-sentence and the undo stack is
discarded.

### The preview updates from a debounced snapshot {#preview-is-debounced}
- The preview re-renders between 150 ms and 300 ms after typing stops, not on the keystroke.
- Mermaid diagrams and KaTeX maths render asynchronously, so a heavy diagram never blocks the text
  paint.

Examples: typing a paragraph at speed → one render when you stop, not forty · a render per keystroke →
the editor drops frames long before the document is large.

### Live preview pauses above 2 MB {#preview-pauses-at-2mb}
- **When** a document larger than **2 MB** is open, live preview stops updating and an inline banner
  offers **Refresh preview**, which renders once on demand.
- The threshold is not configurable.

Examples: 1.9 MB → live · 2.1 MB → paused with the banner · exactly 2.0 MB → live, because the
comparison is *greater than* 2 MB.

*Why one fixed number:* a threshold the user can change is one they have to reason about, and a
mis-set value produces a slow editor that looks like a defect in the editor.

### A document over 10 MB opens read-only {#read-only-above-10mb}
- **When** a document larger than **10 MB** is opened, it opens successfully but cannot be edited: no
  typing, no autosave, and an inline banner explains why.
- **When** a document larger than **50 MB** is opened, it is refused with a message naming the limit,
  and nothing is partially loaded.

Examples: 9.9 MB → editable · 10.1 MB → read-only with the banner · 49 MB → read-only · 51 MB → refused,
`That file is too large to open`.

*Why:* the whole buffer crosses the bridge on every debounce flush. Above 10 MB that is not something
the architecture supports, and pretending otherwise produces an editor that appears to accept edits and
silently loses them.

### At most 40 documents are open at once {#tab-limit}
- **If** 40 documents are already open, **then** opening a 41st is refused with a message.

Examples: 40 open → the 41st is refused · a folder of 200 files opened one at a time → the refusal
arrives at the 41st.

*Why:* every open document's text is held in Go memory. This is a real bound, not a tidiness
preference.

### At least one pane is always visible {#one-pane-minimum}
- The arrangement is exactly one of Editor, Split or Preview. Hiding both panes is not possible.
- **When** the user hides the pane that is currently the only visible one, the action is refused and the
  arrangement does not change.

Examples: Split, then hide the preview → Editor-only · Editor-only, then hide the editor → nothing
happens.

### The divider position is persisted and clamped {#divider-is-draggable}
- Dragging the divider sets the split ratio, which is persisted as `ui.splitRatio` and restored with the
  rest of the layout.
- Double-clicking the divider restores an even split.
- The ratio is clamped so neither pane can be dragged below a usable minimum.
- **If** `Esc` is pressed during a drag, **then** the drag is cancelled and the previous ratio is
  restored.

Examples: drag to 70/30, quit, relaunch → 70/30 · drag past the left edge → stops at the minimum ·
drag and press `Esc` → back to where it started.

### Scroll sync follows headings, not characters {#scroll-sync-by-heading}
- **While** scroll sync is on and the arrangement is Split, scrolling the editor moves the preview to
  the heading the caret area is under, and scrolling the preview moves the editor to that heading's
  source line.
- Scroll sync is on by default and can be turned off from the View menu.
- **If** the document contains no headings, **then** the panes scroll independently and no sync is
  attempted.

Examples: a document with six headings, scroll the editor to the fourth → the preview jumps to the
fourth heading · a document with no headings → the two panes move separately, and nothing pretends
otherwise · scrolling to the exact paragraph rather than the heading → not offered, because it needs a
source map through the whole render pipeline for value the heading already delivers.

*Why it can be turned off:* comparing two distant parts of one document is a real thing people do, and
sync makes it impossible.

### Each document remembers its own view state {#per-document-view-state}
- Each open document keeps its arrangement, whether it is in reading mode, its scroll positions and its
  caret and selection. Switching tabs restores that document's state.
- The per-document arrangement also persists across sessions, so reopening a file restores its last
  arrangement — subject to `opening-and-saving-files.md#opens-use-the-default-open-mode`.
- An explicit arrangement change on a document overrides the persisted value for that document.

Examples: document A in Split, document B in Preview → switching between them switches arrangement ·
reopening A tomorrow → Split.

### The find widget is themed with the editor {#find-widget-is-themed}
- `Ctrl/Cmd+F` opens find, `Ctrl/Cmd+H` opens replace, `F3` and `Shift+F3` step through matches. These
  are Monaco's own widget, not a reimplementation.
- The widget's colours come from the generated editor theme: `editorWidget.background` from `--surface`
  and `editorWidget.border` from `--stroke`. It is a **separate colour surface** from the editor body,
  and it ships white by default, so it has to be themed explicitly in all six palettes.
- Find operates on the editor pane. In Preview-only and in reading mode, the webview's own in-page find
  is what is available.

Examples: find in a dark Liquid Glass window → the widget matches the window · leaving it unthemed → a
white box that is the most visible thing on screen.

*Which capabilities the widget exposes, and the rule that find and replace never leave the open file,
are in `finding-things.md#find-is-the-editors-own-and-fully-exposed` and
`finding-things.md#search-never-leaves-the-open-file`. This rule is about colour only.*

### The status bar is a summary with two interactive items {#status-bar}
- The status bar is present in every arrangement and hidden only in reading mode.

| Item | Example | Interactive |
|---|---|---|
| Standard | `Markdown · GFM` | no |
| Caret position | `Ln 3, Col 12` | no |
| Counts | `231 words` | no |
| Encoding | `UTF-8` | no |
| Line endings | `LF` | no |
| Autosave | `Autosave: On` | no |
| Problems | `⚠ 1` | **yes** — opens the problems list |
| Provider | `Ollama · last call OK` | no |
| Reading | `Reading` | **yes** — enters reading mode |

- **While** text is selected, the counts item shows the selection's counts instead, prefixed `sel`.
- Character count is not shown by default; it is in the counts item's tooltip.
- The provider item appears only after the app has made at least one provider call this session, and it
  reports **that call's** outcome, not a live connection.

Examples: no selection → `231 words` · 40 words selected → `sel 40 words` · a persistent "Ollama
connected" indicator → not offered, because it would require polling and there is no background network.

### Narrow windows drop status-bar items in one fixed order {#status-bar-drop-order}
- From first dropped to last kept: Provider → Autosave → Encoding and line endings → Counts → Caret
  position → Standard.
- **Problems and Reading are never dropped.**
- A dropped item moves into the tooltip on the standard item; it is not lost.

Examples: 768 px wide → the provider is gone · 375 px → only Problems, Reading and the standard remain,
with the rest in the tooltip · a layout that reorders items at a breakpoint → rejected, because an item
in two different places at two widths cannot be found by muscle memory.

### The arrangement is shown in one place {#arrangement-shown-once}
- The segmented control is the only indicator of the current arrangement. The status bar shows
  `Reading` and nothing about Editor, Split or Preview.

Examples: Split arrangement → the middle segment is active and the status bar says nothing about it ·
reading mode → the segmented control is hidden and the status bar says `Reading`.

*Why:* reading mode hides the segmented control, so the status bar needs to say `Reading`. It does not
need to duplicate an always-visible control the user is already looking at.

### The editor's defaults {#editor-defaults}
- Line numbers on. Word wrap off. Arrangement Split. Editor font size 14 px, selectable from 13, 14 and
  16 px.

Examples: a first launch → Split, numbered lines, no wrap.

## What it looks like

- Split — `../surface/mockup.html#material-light/editor-split`
- Editor only — `../surface/mockup.html#material-light/editor-only`
- The editor context menu — `../surface/mockup.html#material-light/editor-menu`
- Preview paused for a large document — `../surface/mockup.html#material-light/paused-preview`
- Settings → Editor — `../surface/mockup.html#material-light/settings-editor`

## When things go wrong

| Situation | What the user sees | What they can do |
|---|---|---|
| A file over 50 MB is opened | `That file is too large to open` · `GoMarkEdit opens documents up to the size in Settings → Editor.` | Open a smaller file, or split the document |
| A file over 10 MB is opened | It opens, with an inline banner saying it is read-only and why | Read it, or edit it elsewhere |
| A document over 2 MB is open | An inline banner with a **Refresh preview** action | Press Refresh when they want the preview updated |
| Opening a 41st document | A message naming the 40-document limit | Close a tab and try again |
| Monaco has not finished initialising | A loading placeholder in the editor area | Wait — it is momentary |

## Edge cases

**Typing while a save is in flight**
- *Trigger:* the user keeps typing during an explicit save of a large file.
- *Expected:* the save writes the buffer as flushed at the moment it started. The characters typed
  afterwards leave the document modified, and the tab's dot stays on.
- *Avoid:* reporting the document as clean when it has changed since the flush.

**A state update arrives while the editor has focus**
- *Trigger:* the backend recomputes the word count after a debounce tick.
- *Expected:* the status bar updates. The caret and selection are exactly where they were.
- *Avoid:* re-rendering the editor from the projection on every update.

**Switching tabs mid-word**
- *Trigger:* the user types half a word and clicks another tab before the debounce fires.
- *Expected:* the buffer is flushed first, so the half-word is in the model. Returning to the tab shows
  it, with the caret restored.
- *Avoid:* switching first and losing everything typed since the last debounce tick.

**Both panes hidden**
- *Trigger:* the user unchecks Show Editor while already in Preview-only.
- *Expected:* nothing changes; Preview-only is kept.
- *Avoid:* an empty document area with no way back except the menu.

**The window is resized to 375 px while both panes are visible**
- *Trigger:* the window is dragged narrow, or the app opens on a small screen.
- *Expected:* the panes stack vertically and the divider becomes horizontal.
- *Avoid:* two panes squeezed side by side, each too narrow to read.

**A document with no headings in Split view**
- *Trigger:* a plain list with no `#` anywhere, scrolled in the editor.
- *Expected:* the preview does not move. No sync is attempted.
- *Avoid:* syncing by scroll percentage, which drifts and looks broken as soon as one pane has more
  content than the other.

## Not this

- **No WYSIWYG or rich-text editing.** The document being edited is Markdown source. A rich-text surface
  has to guess the source it produces, and the guesses are unpredictable.
- **No character-accurate scroll sync.** It needs a source map through the entire render pipeline. The
  heading map that the outline already produces gives most of the value at almost none of the cost.
- **No configurable preview-pause threshold.** See `#preview-pauses-at-2mb`.
- **No session restore.** Documents open clean on every launch; see `the-app-window.md#launch-is-clean`.
- **No reimplemented find widget.** Monaco's is good, and building a second one means maintaining two
  regular-expression behaviours.

## Decisions

- *2026-07-25* — The divider became draggable and its ratio persisted. Three width values were already
  being stored with no way for a user to change any of them, and editing a wide table in a fixed 50 %
  pane is the common case rather than an edge one.
- *2026-07-25* — The status bar stopped showing the view arrangement. The segmented control is always
  visible and shows it already; the status bar's width is better spent elsewhere.
- *2026-07-28* — `#find-is-monacos` became `#find-widget-is-themed` and now covers **colour only**. The
  conversion left the same find rule in this file and in `finding-things.md`, and the two would drift —
  they already disagreed about which of the widget's capabilities are exposed. `finding-things.md` owns
  find; this file owns the editor theme the widget is coloured from.

## Open questions

*(none — ready to build)*
