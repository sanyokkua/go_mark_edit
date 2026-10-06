## MODIFIED Requirements

### Requirement: Application and window shortcuts

The system SHALL bind: Mod+N New File; Mod+O Open File; Mod+Shift+Alt+T Reopen Last; Mod+S Save; Mod+Shift+S Save As; Mod+W Close Tab; Mod+Shift+PageUp and PageDown Move tab left and right; Mod+Tab and Mod+Shift+Tab next and previous tab (also Ctrl+PageDown and Ctrl+PageUp); Mod+, Settings; Mod+\ Toggle Sidebar; Mod+Enter Distraction-free reading; Mod+? Keyboard shortcuts; F11 Full screen. Mod is Cmd on macOS and Ctrl elsewhere.

#### Scenario: Save shortcut

- **WHEN** a writable document is active and the user presses Ctrl+S (Cmd+S on macOS)
- **THEN** the document is saved

#### Scenario: Next tab alias

- **WHEN** two tabs are open and the user presses Ctrl+PageDown
- **THEN** the next tab becomes active

#### Scenario: Reading shortcut listed

- **WHEN** the user opens the Keyboard shortcuts dialog
- **THEN** Distraction-free reading is listed with scope Window and the key Ctrl+Enter (⌘↩ on macOS)

### Requirement: Shortcut dispatch

WHEN a pressed key combination matches the shortcut of an available command, the system SHALL run that command and suppress the browser default. IF the command is unavailable, THEN the system SHALL ignore the key combination without running anything. IF the focused control has already handled the key combination, THEN the system SHALL NOT run a command for it. Shortcut hints SHALL use the symbols for Cmd, Option and Shift on macOS and "Ctrl+", "Alt+", "Shift+" elsewhere.

#### Scenario: Unavailable shortcut

- **WHEN** no document is open and the user presses Mod+S
- **THEN** nothing happens

#### Scenario: Key handled by the Find input

- **WHEN** the editor's Find input has focus and the user presses Ctrl+Enter
- **THEN** the Find input handles the key and Reading mode is not entered

## ADDED Requirements

### Requirement: Preview context menu

WHEN the user right-clicks the rendered document in the preview pane or in Reading mode, or presses the Menu key or
Shift+F10 while it has focus, the system SHALL open a context menu with Copy and Select all. Copy SHALL be disabled
while no rendered text is selected, Select all SHALL select only the rendered document, Escape SHALL close the menu and
return focus to the rendered document, and the menu SHALL offer no editing command.

#### Scenario: No selection

- **WHEN** the user right-clicks the preview with no text selected
- **THEN** Copy is disabled and Select all is enabled

#### Scenario: Open by keyboard

- **WHEN** the rendered document has focus in Reading mode and the user presses Shift+F10
- **THEN** the context menu opens with its first enabled item focused

#### Scenario: Select all scope

- **WHEN** the user chooses Select all in Reading mode with the tab bar overlay open
- **THEN** all text of the rendered document is selected and no tab label or reading control text is selected
