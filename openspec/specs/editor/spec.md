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

The system SHALL open a file in the Preview arrangement when the default open mode is viewer, and otherwise in the arrangement last saved for that file, falling back to the window's current arrangement and then to Split.

#### Scenario: Viewer mode

- **WHEN** the default open mode is viewer and the user opens a Markdown file
- **THEN** the file opens in the Preview arrangement

#### Scenario: Editor mode with saved arrangement

- **WHEN** the default open mode is editor and the file was last closed in Editor arrangement
- **THEN** the file reopens in the Editor arrangement

### Requirement: Formatting actions

The system SHALL provide toolbar, shortcut and context-menu actions for bold (`**`), italic (the emphasis marker setting), strikethrough (`~~`), inline code, headings 1 to 3, bullet, numbered and task lists, quote, link and table, each changing only the selected lines or the current line and undoable as one edit.

#### Scenario: Bold selection

- **WHEN** the user selects "word" and presses Ctrl+B (Cmd+B on macOS)
- **THEN** the text becomes `**word**`, and pressing it again restores `word`

#### Scenario: Heading toggle

- **WHEN** the user applies Heading 2 to a line already at level 2
- **THEN** the heading marker is removed

#### Scenario: Bullet marker setting

- **WHEN** the bullet marker setting is `*` and the user applies the bullet list action to two lines
- **THEN** both lines start with `* `

#### Scenario: Table

- **WHEN** the user applies the table action on an empty line
- **THEN** a two-column table skeleton with a header row is inserted

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

### Requirement: Unavailable controls

The system SHALL show Distraction-free reading and the Image formatting action as disabled controls until those features exist.

#### Scenario: Distraction-free reading

- **WHEN** the user opens the View menu
- **THEN** Distraction-free reading is listed and disabled
