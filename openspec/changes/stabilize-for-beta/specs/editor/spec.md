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
