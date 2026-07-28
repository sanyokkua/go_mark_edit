# Formatting text

## What it's for

Typing `**` around a phrase is fine once. Doing it forty times a day, or remembering the syntax for a
GFM table, is not. The toolbar and its shortcuts turn the common Markdown constructs into one keystroke
each, and the paste rules mean that content arriving from a browser, a spreadsheet or a screenshot tool
lands as something sensible instead of as a mess the user has to repair.

This is about producing Markdown as you type. Cleaning up a whole document afterwards is
`tidying-markdown.md`.

## What you can do

The formatting toolbar sits above the editor. It has bold, italic, strikethrough and inline code;
headings 1, 2 and 3; bullet, numbered and task lists; quote; link; image; and table. Every button has a
keyboard shortcut and shows it in its tooltip. At narrow window widths the list and link groups fold
into a `»` overflow menu.

Right-clicking in the editor gives cut, copy, paste, paste as plain text, then bold, italic and link,
then format document and compact, then the command palette. Every entry shows its accelerator, so the
menu doubles as a place to learn the bindings.

Dragging an image file into the editor inserts a link to it. Pasting a spreadsheet range inserts a GFM
table. Pasting a screenshot writes the image beside your document and links it.

## Rules

### Formatting acts on the selection or the current line {#formatting-scope}
- **When** text is selected, a formatting action applies to the selection.
- **When** nothing is selected, it applies to the current line.
- The cost of a formatting action does not grow with the document, because it never touches text outside
  that range.

Examples: three words selected, press bold → those three words · caret in the middle of a paragraph,
press heading 1 → that line becomes a heading · a whole 2 MB document reflowed by a bold press →
rejected.

### The canonical markers are `-`, `_` and `#` {#canonical-markers}
- A bullet list uses `-`. Emphasis uses `_`. Headings use ATX `#`.
- All three are overridable in Settings → Markdown — bullet `-`, `*` or `+`; emphasis `_ _` or `* *`;
  headings ATX or Setext — and they ship at the canonical values.
- The toolbar, the format command and the linter all read the same three settings, so they cannot
  disagree.

Examples: default settings, press bullet list → `- item` · bullet marker set to `*`, press bullet list →
`* item`, and the linter stops flagging `*` · the toolbar inserting `-` while the linter demands `*` →
the editor fights the user.

### Emphasis buttons toggle {#emphasis-toggles}
- **When** bold, italic, strikethrough or inline code is pressed and the selection is **not** already
  wrapped in that construct's markers, the markers are added around the selection.
- **When** the selection **is** already wrapped — including when the markers sit just outside the
  selection — the markers are removed.
- **When** nothing is selected, the marker pair is inserted at the caret and the caret is placed between
  the two markers.

Examples: `word` selected, bold → `**word**` · `**word**` selected, bold → `word` · `word` selected
inside `**word**`, bold → `word`, because the markers just outside the selection count · caret between
two spaces, bold → `**|**` with the caret between the pairs · pressing bold twice on the same selection
→ back to exactly the original text, byte for byte.

*Why the just-outside case:* double-clicking a word inside `**word**` selects `word`, not the asterisks.
If that case adds a second pair, the most natural way to select bold text is also the way to break it.

### The heading buttons replace the level {#heading-replaces-level}
- **When** a heading button is pressed on a line that is already a heading of a **different** level, the
  level is replaced.
- **When** it is pressed on a line that is already a heading of the **same** level, the heading markers
  are removed and the line becomes a paragraph.
- **When** it is pressed on a paragraph line, the markers are added.

Examples: `## Title` with heading 1 → `# Title` · `# Title` with heading 1 → `Title` · `Title` with
heading 1 → `# Title` · `## Title` with heading 3 → `### Title` · prefixing instead of replacing →
`# ## Title`, which renders as a level-1 heading whose text is literally `## Title`.

### The list buttons convert between kinds {#list-buttons-convert}
- **When** a list button is pressed on a line that is already a list item of a **different** kind, the
  marker is converted.
- **When** it is pressed on a line that is already a list item of the **same** kind, the marker is
  removed.
- **When** it is pressed on a plain line, the marker is added.

Examples: `- item` with numbered list → `1. item` · `1. item` with numbered list → `item` · `item` with
bullet list → `- item` · `- [ ] task` with bullet list → `- task`, because a task item is a bullet item
with a checkbox and the checkbox is the part being removed · prefixing instead of converting →
`1. - item`, which renders as a numbered item containing a literal dash.

### Formatting shortcuts only fire when the editor has focus {#formatting-is-editor-scoped}
- Bold, italic, strikethrough, inline code, link, image, the heading bindings, the list bindings, quote
  and table are **editor-scoped**: they do nothing unless the Monaco editor is focused.
- Format document, compact document and lint document are **document-scoped**: they need an open
  document but not editor focus.

Examples: `Ctrl/Cmd+B` while the file tree has focus → nothing · `Alt/Option+Shift+F` while reading
mode is active → the document is formatted.

### The table button inserts a skeleton {#table-inserts-a-skeleton}
- `Ctrl/Cmd+Shift+T` and the table button insert an empty GFM table skeleton at the caret for the user
  to fill in.

Examples: press table → a header row, a separator row and one body row appear · a table with the user's
data filled in → that is what pasting does, see `#pasting-tabular-text-makes-a-table`.

### Dropping or pasting an image inserts a link, and copies nothing {#image-insert-links-not-copies}
- **When** an image file that already exists on disk is dropped or pasted into the editor, a Markdown
  image link is inserted at the caret using the path **relative to the document**, and no file is
  copied, moved or rewritten.
- **If** no relative path reaches the image — it is on another volume, or outside any shared parent —
  **then** the absolute path is inserted and a toast explains why.

Examples: `assets/diagram.png` beside the document → `![](assets/diagram.png)`, which keeps working when
the folder is moved or shared · an image on a mounted network volume → the absolute path plus a toast ·
copying the file into the document's folder automatically → the app reorganising the user's files
without being asked.

### A clipboard bitmap is the only thing that writes a file {#bitmap-paste-writes-a-file}
- **When** a bitmap with no file path is pasted — a screenshot from a capture tool — it is written beside
  the document as `<document-name>-<n>.png` and then linked like any other image.
- **If** the document has never been saved, **then** the paste is refused with a message saying to save
  the document first, because there is nowhere to put the file.
- Nothing else in the drop-or-paste path writes to disk.

Examples: paste a screenshot into `notes.md` → `notes-1.png` beside it and `![](notes-1.png)` at the
caret · paste a second → `notes-2.png` · paste into an untitled document → refused with the message.

### Pasting tabular text makes a table {#pasting-tabular-text-makes-a-table}
- **When** clipboard text is unambiguously delimited rows and columns — tab-separated or comma-separated,
  with **at least two rows and a consistent column count** — it is inserted as a GFM table with a header
  row and aligned columns.
- **If** the content is ambiguous by that test, **then** it is inserted as plain text.
- One `Ctrl/Cmd+Z` returns the raw text.

Examples: three rows of four tab-separated fields → a four-column table · two rows, one with three
fields and one with four → plain text · a single line of comma-separated values → plain text, because
one row is a sentence with commas as often as it is a table.

*Why this and not a general converter:* tab-separated text with a consistent column count is what
Excel, Google Sheets and most database clients put on the clipboard. The shape is unmistakable rather
than guessed at, and pasting a range you already have is far more common than filling in an empty
skeleton.

### Pasted HTML and rich text arrive as plain text, unchanged {#rich-paste-is-plain}
- **When** HTML or rich text is pasted, its plain-text flavour is inserted verbatim. No conversion to
  Markdown is attempted.

Examples: copying a formatted paragraph from a browser → the words, without the formatting · an HTML
table copied from a web page → the text, not a GFM table, because the test in
`#pasting-tabular-text-makes-a-table` is about the clipboard's plain-text flavour.

*Why:* converting HTML to Markdown means guessing the structure the user wanted, and a wrong guess is
harder to repair than plain text is to re-format.

### The context menu is a view of the shortcut registry {#context-menu-is-the-registry}
- The editor context menu contains, in order: Cut · Copy · Paste · Paste as plain text · *(separator)* ·
  Bold · Italic · Link · *(separator)* · Format document · Compact · *(separator)* · Command palette.
- Every entry dispatches through the shortcut registry and displays its accelerator.
- On macOS the native Edit menu owns the clipboard accelerators; these entries invoke the same commands.

Examples: the menu shows `Bold ⌘B` on macOS and `Bold Ctrl+B` elsewhere · a context menu with its own
behaviour for bold → a second implementation of one command.

### Narrow windows fold the toolbar into an overflow menu {#toolbar-overflow}
- At 768 px the list and link groups move into a `»` overflow menu.
- At 375 px the text buttons and the view segmented control join them.
- Nothing is removed, only relocated.

Examples: 1280 px → every button visible · 375 px → the `»` menu holds the rest · a button that
disappears entirely at a width → the user cannot reach the feature at all on a small screen.

## What it looks like

- The toolbar in full — `../surface/mockup.html#material-light/editor-split`
- The overflow menu — `../surface/mockup.html#material-light/toolbar-overflow`
- The editor context menu — `../surface/mockup.html#material-light/editor-menu`
- Settings → Markdown, where the three markers live —
  `../surface/mockup.html#material-light/settings-markdown`

## When things go wrong

| Situation | What the user sees | What they can do |
|---|---|---|
| A bitmap is pasted into a never-saved document | A message saying to save the document first | Save it, then paste again |
| An image is dropped that has no relative path to the document | The absolute path is inserted, plus a toast explaining why | Move the image beside the document and re-link |
| The bitmap cannot be written beside the document | `Couldn't finish reading or writing` · `The disk may be full or the file may be in use. Try again.` | Free space, or save the document somewhere writable |
| A formatting shortcut is pressed with no editor focus | Nothing | Click into the editor first |

## Edge cases

**An image is dropped onto the file tree rather than the editor**
- *Trigger:* the user drops `diagram.png` on the sidebar.
- *Expected:* the drop is treated as an open attempt, and a `.png` is not an openable type, so a toast
  says so and nothing is inserted.
- *Avoid:* inserting a link into whichever document happens to be active, which puts content in a
  document the user was not pointing at.

**A bitmap is pasted twice into the same document**
- *Trigger:* two screenshots pasted one after the other into `notes.md`.
- *Expected:* `notes-1.png` and `notes-2.png`, two distinct links.
- *Avoid:* overwriting `notes-1.png` with the second image, which silently changes the first link's
  content.

**Tabular text pasted while a selection is active**
- *Trigger:* a paragraph is selected and a spreadsheet range is pasted.
- *Expected:* the selection is replaced by the table, and one undo restores the paragraph.
- *Avoid:* two undo steps — one for the deletion and one for the conversion — which makes undo feel
  broken.

**A formatting action on a multi-line selection**
- *Trigger:* four lines selected, bullet list pressed.
- *Expected:* all four become list items.
- *Avoid:* wrapping the whole four-line block in one marker.

## Not this

- **No HTML-to-Markdown conversion on paste.** See `#rich-paste-is-plain`.
- **No copying of dropped images into the document's folder.** See `#image-insert-links-not-copies`.
- **No image resizing, re-encoding or optimisation.** The app links what exists; changing a user's
  image files is not something a text editor should do without being asked.
- **No WYSIWYG toolbar.** The buttons write Markdown into the source, which stays visible.
- **No toolbar customisation.** A configurable toolbar means the mockup, the overflow order and the
  shortcut registry all stop describing what a given user sees.

## Decisions

- *2026-07-25* — Pasting unambiguously tabular text produces a GFM table, while pasted HTML does not.
  The two look similar and are not: the tab-separated case has a mechanical test with no guessing in it,
  and the HTML case does not.
- *2026-07-28* — Every toolbar construct toggles rather than accumulating: emphasis removes its markers
  when they are already there, a heading button replaces the level or clears it, and a list button
  converts the kind or clears it. The previous specification named the buttons and never said what a
  second press does, which meant three behaviours would have been decided by whoever implemented them.

## Open questions
