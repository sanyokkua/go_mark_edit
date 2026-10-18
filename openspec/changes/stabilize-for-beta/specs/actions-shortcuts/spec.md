# Spec Delta

## MODIFIED Requirements

### Requirement: Application and window shortcuts

The system SHALL bind: Mod+N New File; Mod+O Open File; Mod+Shift+Alt+T Reopen Last; Mod+S Save; Mod+Shift+S Save As; Mod+P Export to PDF; Mod+W Close Tab; Mod+Shift+PageUp and PageDown Move tab left and right; Ctrl+Tab and Ctrl+Shift+Tab next and previous tab (also Ctrl+PageDown and Ctrl+PageUp), using the physical Ctrl key on every platform including macOS; Mod+, Settings; Mod+\ Toggle Sidebar; Mod+Enter Distraction-free reading; Mod+? Keyboard shortcuts; F11 Full screen. Mod is Cmd on macOS and Ctrl elsewhere.

#### Scenario: Save shortcut

- **WHEN** a writable document is active and the user presses Ctrl+S (Cmd+S on macOS)
- **THEN** the document is saved

#### Scenario: Next tab alias

- **WHEN** two tabs are open and the user presses Ctrl+PageDown
- **THEN** the next tab becomes active

#### Scenario: Next tab on macOS

- **WHEN** two tabs are open on macOS, the editor has focus and the user presses Control+Tab
- **THEN** the next tab becomes active
- **AND** the Keyboard shortcuts dialog lists Next tab with ⌃⇥ and Previous tab with ⌃⇧⇥

#### Scenario: Reading shortcut listed

- **WHEN** the user opens the Keyboard shortcuts dialog
- **THEN** Distraction-free reading is listed with scope Window and the key Ctrl+Enter (⌘↩ on macOS)

#### Scenario: Export shortcut

- **WHEN** a document is active, the editor has focus and the user presses Ctrl+P (Cmd+P on macOS)
- **THEN** the print dialog for Export to PDF opens
- **AND** the File menu and the Keyboard shortcuts dialog show Export to PDF with Ctrl+P (⌘P on macOS)

### Requirement: Shortcut dispatch

WHEN a pressed key combination matches the shortcut of an available command, the system SHALL run that command and suppress the browser default. IF the command is unavailable, THEN the system SHALL ignore the key combination without running anything. IF the focused control has already handled the key combination, THEN the system SHALL NOT run a command for it, except in the editor's text area as defined by "Shortcuts in the editor text area". Shortcut hints SHALL use the symbols for Cmd, Control, Option and Shift on macOS and "Ctrl+", "Alt+", "Shift+" elsewhere.

#### Scenario: Unavailable shortcut

- **WHEN** no document is open and the user presses Mod+S
- **THEN** nothing happens

#### Scenario: Key handled by the Find input

- **WHEN** the editor's Find input has focus and the user presses the physical Ctrl key with Enter (Ctrl+Enter on every platform, including macOS)
- **THEN** the Find input handles the key and Reading mode is not entered

### Requirement: Availability and disabled reasons

A command SHALL be unavailable, and shown disabled, when no document is open, Markdown settings are loading, a modal dialog is open, the document is read-only (except the commands that "Read-only documents" keeps available), or a Format, Compact or Lint run is in progress. A disabled item SHALL state the reason as a tooltip where one exists.

#### Scenario: Tab limit

- **WHEN** 40 tabs are open
- **THEN** New File and Open File are disabled

#### Scenario: Modal open

- **WHEN** the Settings dialog is open
- **THEN** menu commands and keyboard shortcuts are inactive until it closes

#### Scenario: Formatting while the editor is not shown

- **WHEN** a writable document is in the Preview arrangement
- **THEN** the toolbar's formatting buttons are disabled with the tooltip "Show the editor to use formatting.", the
  Format button stays enabled, and pressing Ctrl+B (Cmd+B on macOS) changes nothing

### Requirement: Read-only documents

For a read-only document the system SHALL disable Save, Save As, Format, Compact and every editing command, and SHALL keep Copy, Find and Lint available. Save As SHALL stay available for a document that is read-only only because the file is write-protected.

#### Scenario: Large file

- **WHEN** the active document is read-only
- **THEN** Bold is disabled while Copy and Find work

#### Scenario: Save As of a write-protected file

- **WHEN** the active document is read-only because "locked.md" is write-protected and the user chooses Save As
- **THEN** the Save As dialog opens, and saving as "copy.md" the tab becomes "copy.md" and accepts edits

## ADDED Requirements

### Requirement: Shortcuts in the editor text area

WHILE the editor's text area has focus, a key combination listed in the command catalogue SHALL run its command even
when the editor has a built-in binding for the same keys, and the built-in action SHALL NOT run. This SHALL NOT apply
while the editor's Find or Replace input has focus.

#### Scenario: Link in the editor

- **WHEN** "site" is selected in a writable editor and the user presses Ctrl+K (Cmd+K on macOS)
- **THEN** the selection becomes a Markdown link and no editor chord is started

#### Scenario: Inline code on macOS

- **WHEN** "x" is selected in a writable editor on macOS and the user presses Cmd+E
- **THEN** the selection becomes inline code and the Find input is not filled

#### Scenario: Catalogue shortcut wins over an editor key

- **WHEN** the editor text area has focus and the user presses Cmd+Enter on macOS (Ctrl+Enter elsewhere)
- **THEN** Distraction-free reading starts and no line is inserted

#### Scenario: Previous tab from the editor

- **WHEN** two tabs are open, the second is active, the editor has focus and the user presses Ctrl+PageUp
- **THEN** the first tab becomes active and the editor does not scroll
