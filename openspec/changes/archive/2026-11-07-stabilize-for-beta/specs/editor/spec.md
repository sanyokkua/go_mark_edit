# Spec Delta

## MODIFIED Requirements

### Requirement: Editor stage with preserved working state

The system SHALL edit each document's Markdown source in a Monaco editor whose cursor, selection, undo history and scroll position persist for that document while the user changes view arrangement, switches tabs or moves focus. Undo history SHALL start empty when the document is reloaded from disk and SHALL be released when its tab closes.

#### Scenario: Switch arrangement

- **WHEN** the user moves from Split to Preview and back to Split
- **THEN** the editor shows the same cursor, selection and scroll position and Undo still reverts the last edit

#### Scenario: Switch tabs

- **WHEN** the user types "abc" in "a.md", switches to "b.md", switches back to "a.md" and presses Undo
- **THEN** the last typed text is removed from "a.md" and "b.md" is unchanged

#### Scenario: Undo after reload

- **WHEN** the user types in "a.md", chooses Reload from disk after an external change and presses Undo
- **THEN** the editor keeps the reloaded text

## ADDED Requirements

### Requirement: Text navigation and line editing keys

The editor SHALL provide the caret movement, selection and line editing keys of common desktop code editors, following
each platform's convention listed in the scenarios; adding Shift to a movement key SHALL extend the selection. A key
combination that is also a command catalogue shortcut follows "Shortcuts in the editor text area". In a read-only document only
movement and selection keys SHALL work.

#### Scenario: Move by word

- **WHEN** the caret is before "hello world" and the user presses Option+Right on macOS (Ctrl+Right on Windows and
  Linux)
- **THEN** the caret moves to just after "hello"

#### Scenario: Select and delete the previous word

- **WHEN** the caret is after "hello world" and the user presses Option+Shift+Left on macOS (Ctrl+Shift+Left
  elsewhere), then Option+Backspace (Ctrl+Backspace elsewhere) after collapsing the selection
- **THEN** "world" is selected first, and the delete removes the word before the caret

#### Scenario: Line start and end

- **WHEN** the caret is in the middle of a line and the user presses Cmd+Left then Cmd+Right on macOS (Home then End
  elsewhere)
- **THEN** the caret moves to the start of the line and then to its end

#### Scenario: Document start and end

- **WHEN** the caret is on line 10 of a 50-line document and the user presses Cmd+Down on macOS (Ctrl+End elsewhere),
  then Cmd+Up (Ctrl+Home elsewhere)
- **THEN** the caret moves to the end of line 50 and then to the start of line 1

#### Scenario: Line operations

- **WHEN** the caret is on line 2 of "a", "b", "c" and the user presses Option+Up (Alt+Up elsewhere)
- **THEN** the lines read "b", "a", "c" and one Undo restores the original order
- **AND** Shift+Option+Down (Shift+Alt+Down) copies the current line below it, Cmd+Shift+K (Ctrl+Shift+K) deletes it,
  Cmd+] and Cmd+[ (Ctrl+] and Ctrl+[) indent and outdent it, Cmd+Backspace on macOS deletes from the caret to the line
  start, and Cmd+Shift+Enter (Ctrl+Shift+Enter) inserts an empty line above

#### Scenario: Read-only document

- **WHEN** a read-only document is active and the user presses Option+Up (Alt+Up elsewhere) and then Option+Right
- **THEN** the text is unchanged and the caret moves by one word

### Requirement: Edits typed before a reload are discarded

WHEN the user reloads a document from disk, text typed in the editor before the reload SHALL NOT be applied afterwards, even if it was still being handed to the application when the reload completed. The discard SHALL NOT show an error. Text typed after the reload SHALL be kept and saved normally.

#### Scenario: Typing in flight during a reload

- **WHEN** Autosave is on, the user types "mine" in "notes.md", another program writes "theirs" to the file, the user
  chooses Reload from disk before the typed text reaches the application, and two seconds pass
- **THEN** the editor shows "theirs", the file on disk contains "theirs", the tab is not marked modified and no
  error is shown

#### Scenario: Typing after the reload

- **WHEN** the user reloads "notes.md" from disk and then types "!" at the end
- **THEN** the tab is marked modified and Save writes the reloaded text followed by "!"
