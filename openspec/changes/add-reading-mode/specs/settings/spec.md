## REMOVED Requirements

### Requirement: Default open mode
**Reason**: The choice was shown disabled; it is now selectable, restated as "Default open mode choice". A MODIFIED
block cannot drop the old "Disabled choice" scenario.
**Migration**: See "Default open mode choice".

## ADDED Requirements

### Requirement: Default open mode choice

The Settings menu and the Settings dialog SHALL let the user choose the default open mode, Editor or Reading (Viewer),
and SHALL both show the stored choice as selected. A new choice SHALL apply to the next file opened, without a
restart, and Reset appearance SHALL restore Editor. How each choice opens a file is defined by the editor capability's
Open mode requirement.

#### Scenario: Choose Reading

- **WHEN** the user selects Reading (Viewer) in the Settings menu and restarts the application
- **THEN** the Settings menu and the Settings dialog show Reading (Viewer) selected

#### Scenario: Choose in the dialog

- **WHEN** the user opens the Settings dialog and selects Editor
- **THEN** the Settings menu shows Editor selected

#### Scenario: Reset

- **WHEN** Reading (Viewer) is selected and the user activates Reset appearance
- **THEN** Editor is selected

## MODIFIED Requirements

### Requirement: Settings menu and dialog

The Settings menu SHALL offer Theme, Appearance mode, Default open mode, Markdown standard, Autosave, Format on save, Lint on save and an "All settings…" entry that opens the Settings dialog (Ctrl or Cmd plus comma). The dialog SHALL offer theme, mode, Default open mode, Markdown standard, bullet marker, emphasis marker, heading style, Format on save, Lint on save and Reset appearance.

#### Scenario: Open the dialog

- **WHEN** the user presses Ctrl+, (Cmd+, on macOS)
- **THEN** the Settings dialog opens
