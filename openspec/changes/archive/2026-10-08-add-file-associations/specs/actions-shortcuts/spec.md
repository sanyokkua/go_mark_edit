## MODIFIED Requirements

### Requirement: Application and window shortcuts

The system SHALL bind: Mod+N New File; Mod+O Open File; Mod+Shift+Alt+T Reopen Last; Mod+S Save; Mod+Shift+S Save As; Mod+P Export to PDF; Mod+W Close Tab; Mod+Shift+PageUp and PageDown Move tab left and right; Mod+Tab and Mod+Shift+Tab next and previous tab (also Ctrl+PageDown and Ctrl+PageUp); Mod+, Settings; Mod+\ Toggle Sidebar; Mod+Enter Distraction-free reading; Mod+? Keyboard shortcuts; F11 Full screen. Mod is Cmd on macOS and Ctrl elsewhere.

#### Scenario: Save shortcut

- **WHEN** a writable document is active and the user presses Ctrl+S (Cmd+S on macOS)
- **THEN** the document is saved

#### Scenario: Next tab alias

- **WHEN** two tabs are open and the user presses Ctrl+PageDown
- **THEN** the next tab becomes active

#### Scenario: Reading shortcut listed

- **WHEN** the user opens the Keyboard shortcuts dialog
- **THEN** Distraction-free reading is listed with scope Window and the key Ctrl+Enter (⌘↩ on macOS)

#### Scenario: Export shortcut

- **WHEN** a document is active, the editor has focus and the user presses Ctrl+P (Cmd+P on macOS)
- **THEN** the print dialog for Export to PDF opens
- **AND** the File menu and the Keyboard shortcuts dialog show Export to PDF with Ctrl+P (⌘P on macOS)
