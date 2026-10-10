# editor Specification

## Purpose

Defines the Markdown source editor stage: the Monaco editor, its formatting actions, the editor/preview arrangements and split divider, search, display settings and open mode.

## Requirements

### Requirement: Editor stage with preserved working state

The system SHALL edit each document's Markdown source in a Monaco editor whose cursor, selection, undo history and scroll position persist for that document while the user changes view arrangement, switches tabs or moves focus.

#### Scenario: Switch arrangement

- **WHEN** the user moves from Split to Preview and back to Split
- **THEN** the editor shows the same cursor, selection and scroll position and Undo still reverts the last edit

### Requirement: View arrangements

The system SHALL offer Editor, Split and Preview arrangements per document, stacking Split panes vertically in the minimum window (CSS width of 376 px or less).

#### Scenario: Choose Split

- **WHEN** the user selects Split from the toolbar or View menu
- **THEN** the editor and the preview are visible together for the active document only

#### Scenario: Minimum window

- **WHEN** the window is at its minimum width and Split is selected
- **THEN** the editor and preview are stacked vertically and no divider is shown

### Requirement: Open mode

The system SHALL open a file in the arrangement last saved for that file, falling back to the window's current
arrangement and then to Split, whatever the default open mode is. WHEN the default open mode is Reading (Viewer), the
system SHALL additionally show the file in Reading mode as the reading-mode capability defines, and leaving Reading
mode SHALL show that arrangement.

#### Scenario: Viewer mode

- **WHEN** the default open mode is Reading (Viewer) and the user opens a Markdown file last closed in the Editor
  arrangement
- **THEN** the file is shown in Reading mode, and leaving Reading mode shows the Editor arrangement

#### Scenario: Editor mode with saved arrangement

- **WHEN** the default open mode is editor and the file was last closed in Editor arrangement
- **THEN** the file reopens in the Editor arrangement

### Requirement: Formatting actions

The system SHALL provide Markdown-menu, shortcut and context-menu actions for bold (`**`), italic (the emphasis marker setting), bold italic (`**` around the emphasis marker), strikethrough (`~~`), inline code, headings 1 to 6, bullet, numbered and task lists, quote, link and table; the editor context menu keeps Bold, Italic and Link. Each action SHALL change only the selected lines or the current line and be undoable as one edit.

#### Scenario: Bold selection

- **WHEN** the user selects "word" and presses Ctrl+B (Cmd+B on macOS)
- **THEN** the text becomes `**word**`, and pressing it again restores `word`

#### Scenario: Bold italic selection

- **WHEN** the emphasis marker setting is `_`, the user selects "word" and presses Ctrl+Shift+B (Cmd+Shift+B on macOS)
- **THEN** the text becomes `**_word_**`, and pressing it again restores `word`

#### Scenario: Bold italic with the asterisk marker

- **WHEN** the emphasis marker setting is `*` and the user applies Bold Italic to the selected "word"
- **THEN** the text becomes `***word***`

#### Scenario: Bold italic completes bold text

- **WHEN** the line holds `**word**`, the caret is inside "word" and the user applies Bold Italic with the emphasis
  marker `_`
- **THEN** the text becomes `**_word_**`

#### Scenario: Heading toggle

- **WHEN** the user applies Heading 2 to a line already at level 2
- **THEN** the heading marker is removed

#### Scenario: Heading 5

- **WHEN** the caret is on the line `Title` and the user presses Ctrl+5 (Cmd+5 on macOS)
- **THEN** the line becomes `##### Title`

#### Scenario: Bullet marker setting

- **WHEN** the bullet marker setting is `*` and the user applies the bullet list action to two lines
- **THEN** both lines start with `* `

#### Scenario: Table

- **WHEN** the user applies the table action on an empty line
- **THEN** the Insert table dialog opens, and the table it inserts is defined by the Insert table dialog requirement

### Requirement: Formatting toolbar

The formatting toolbar SHALL offer bold, italic, strikethrough, inline code, headings 1 to 3, the three lists, quote, link, image and table.

#### Scenario: Toolbar buttons

- **WHEN** the formatting toolbar is shown
- **THEN** it offers bold, italic, strikethrough, inline code, headings 1 to 3, the three lists, quote, link, image and table

### Requirement: Find and Replace

The system SHALL open Monaco's Find widget on Ctrl+F (Cmd+F on macOS) and its Replace widget on Ctrl+R (Cmd+R) while the editor or its search widget has focus, searching only the active document, and SHALL leave these shortcuts inactive while a modal dialog is open.

#### Scenario: Replace all

- **WHEN** the user replaces every match through the Replace widget
- **THEN** the document becomes unsaved, the preview updates and one Undo reverts the replacement

#### Scenario: Modal open

- **WHEN** a dialog is open and the user presses Ctrl+F
- **THEN** no editor search widget opens

### Requirement: Split divider

The system SHALL show a draggable, keyboard-accessible divider between editor and preview in Split arrangement, bounding the editor share to 20 to 80 percent with a 50 percent default, changing it by 2 points on Left or Right and setting 20 or 80 on Home or End.

#### Scenario: Drag beyond bounds

- **WHEN** the user drags the divider beyond the 80 percent position
- **THEN** the editor share stops at 80 percent

#### Scenario: Cancelled drag

- **WHEN** the pointer interaction is cancelled during a drag
- **THEN** the share returns to its value before the drag

#### Scenario: Single pane

- **WHEN** only the editor or only the preview is visible
- **THEN** no divider is shown and the stored share is kept

### Requirement: Per-file split ratio

The system SHALL store the split share per file, apply it independently to each open document, restore it when the file is reopened after restart, use 50 percent for a missing or invalid stored value, and carry an untitled or Save As document's share to its new path.

#### Scenario: Reopen after restart

- **WHEN** the user sets 30 percent for a saved file, restarts and reopens it
- **THEN** the editor share is 30 percent

#### Scenario: Persistence failure

- **WHEN** storing the share fails
- **THEN** the current session keeps the new share and an error is shown

### Requirement: Caret appearance

The system SHALL draw the editor caret in the active theme's caret color with no extra shadow or outline on the editor's text input, while the editor boundary keeps a visible focus indication.

#### Scenario: Focused editor

- **WHEN** the editor has focus in any theme and appearance mode
- **THEN** the caret uses the theme caret color and no decorative glow surrounds it

### Requirement: Image formatting action unavailable

The system SHALL show the Image formatting action as a disabled control in the formatting toolbar and the Markdown menu until that feature exists.

#### Scenario: Image formatting

- **WHEN** the user looks at the Image button of the formatting toolbar or the Image item of the Markdown menu
- **THEN** it is shown disabled and activating it or pressing Ctrl+Shift+I (Cmd+Shift+I on macOS) does nothing

### Requirement: Numbered list numbering

WHEN Numbered list is applied and not every selected non-blank line is a numbered item, the system SHALL replace each line's bullet, task, number or heading marker with a number counted from 1 per indentation level, a deeper level restarting after a shallower line. A numbered item on the line directly above with the same block-quote prefix and the first line's indentation SHALL be continued with its count and delimiter. Blank lines in a multi-line selection SHALL stay blank.

#### Scenario: Three plain lines

- **WHEN** the user selects the lines `a`, `b` and `c` and presses Ctrl+Shift+7 (Cmd+Shift+7 on macOS)
- **THEN** the lines become `1. a`, `2. b` and `3. c`

#### Scenario: Continue a list above

- **WHEN** the line `4) d` is directly above the selected lines `x` and `y` and the user applies Numbered list
- **THEN** the lines become `5) x` and `6) y`

#### Scenario: Continue inside a quote

- **WHEN** the line `> 2. b` is directly above the selected line `> x` and the user applies Numbered list
- **THEN** the line becomes `> 3. x`

#### Scenario: Mixed markers

- **WHEN** the user selects `- first`, `* second` and `12. third` and applies Numbered list
- **THEN** the lines become `1. first`, `2. second` and `3. third`

#### Scenario: Remove numbering

- **WHEN** every selected line is a numbered item, `1. first` and `2. second`, and the user applies Numbered list
- **THEN** the lines become `first` and `second`

#### Scenario: Nested lines

- **WHEN** the user selects `a`, `  b`, `  c` and `d` and applies Numbered list
- **THEN** the lines become `1. a`, `  1. b`, `  2. c` and `2. d`

#### Scenario: Blank line in the selection

- **WHEN** the user selects `a`, an empty line and `b` and applies Numbered list
- **THEN** the lines become `1. a`, an empty line and `2. b`

### Requirement: Insert table dialog

WHEN the user runs the table action in a writable document, the system SHALL open an "Insert table" dialog with Columns (1 to 20, default 3) and Rows below the header (1 to 100, default 3) and Insert and Cancel buttons. Insert SHALL add a table with a header row of "Header 1" to "Header N", a separator row and the chosen number of empty rows, as one undoable edit at the current line, or after it when that line is not blank.

#### Scenario: Four columns and two rows

- **WHEN** the caret is on an empty line, the user presses Ctrl+Shift+T (Cmd+Shift+T on macOS), enters 4 columns and 2
  rows and presses Enter
- **THEN** the line becomes `| Header 1 | Header 2 | Header 3 | Header 4 |`, followed by `| --- | --- | --- | --- |`
  and two rows `|  |  |  |  |`
- **AND** "Header 1" is selected and the editor has focus

#### Scenario: Defaults

- **WHEN** the user opens the dialog from the Markdown menu and chooses Insert without changing anything
- **THEN** a table with 3 columns and 3 empty rows is inserted

#### Scenario: Out of range

- **WHEN** the user enters 21 in Columns
- **THEN** the dialog shows "Columns must be a whole number from 1 to 20." and Insert is disabled until the value is
  between 1 and 20

#### Scenario: Rows out of range

- **WHEN** the user enters 0 in Rows
- **THEN** the dialog shows "Rows must be a whole number from 1 to 100." and Insert is disabled

#### Scenario: Cancel

- **WHEN** the dialog is open and the user presses Escape or chooses Cancel
- **THEN** the dialog closes, the document text is unchanged and the editor has focus with its previous selection

#### Scenario: Line with text

- **WHEN** the caret is on the line `Intro` and the user inserts a 2 by 1 table
- **THEN** the table starts two lines below `Intro`, separated from it by one blank line

#### Scenario: Read-only document

- **WHEN** the active document is read-only and the user presses Ctrl+Shift+T
- **THEN** no dialog opens and the document is unchanged

### Requirement: List continuation on Enter

WHEN the caret ends a non-empty list item in a writable editor with no selection and the user presses Enter, the system SHALL start a new line with the same indentation, block-quote prefix and the next marker: the same bullet, the next number and delimiter, or an unchecked task. Enter on an item with no text SHALL remove its marker and indentation, keeping any quote prefix. Inside fenced code, Enter SHALL insert a plain new line.

#### Scenario: Bullet item

- **WHEN** the caret is at the end of `- apple` and the user presses Enter
- **THEN** a new line `- ` follows with the caret after the marker

#### Scenario: Numbered item

- **WHEN** the caret is at the end of `  3. three` and the user presses Enter
- **THEN** a new line ` 4.` follows

#### Scenario: Task item

- **WHEN** the caret is at the end of `* [x] done` and the user presses Enter
- **THEN** a new line `* [ ] ` follows

#### Scenario: Quoted item

- **WHEN** the caret is at the end of `> - quoted` and the user presses Enter
- **THEN** a new line `> - ` follows

#### Scenario: End the list

- **WHEN** the caret is at the end of the line `- ` and the user presses Enter
- **THEN** the line becomes empty and no new line is added

#### Scenario: End a nested or quoted list

- **WHEN** the caret is at the end of ` -` and the user presses Enter, and later at the end of `> - `
- **THEN** the first line becomes empty and the second becomes `> `

#### Scenario: Inside a fenced code block

- **WHEN** the caret is at the end of `- item` inside a block fenced by three backticks and the user presses Enter
- **THEN** a plain new line is inserted with the editor's normal indentation and no marker

#### Scenario: Caret inside the item text

- **WHEN** the caret is between "app" and "le" in `- apple` and the user presses Enter
- **THEN** the line is split as a plain new line without a marker

#### Scenario: One undo step

- **WHEN** the user presses Enter at the end of `1. one` and then presses Ctrl+Z (Cmd+Z on macOS)
- **THEN** the document is `1. one` again with the caret at its end

#### Scenario: Suggestion or composition in progress

- **WHEN** the editor's suggestion list is open, or an input method composition is in progress, and the user presses
  Enter at the end of a list item
- **THEN** Enter accepts the suggestion or confirms the composition and no list marker is added
