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

### Requirement: Reading width choice

The Settings menu and the Settings dialog SHALL let the user choose the reading width, Page or Full width, and SHALL
both show the stored choice as selected. A new choice SHALL apply at once, including while Reading mode is active, and
SHALL be kept for the next start. Reset appearance SHALL restore Page, and a missing or invalid stored value SHALL be
read as Page. How each choice lays out Reading mode is defined by the reading-mode capability's Reading width
requirement.

#### Scenario: Choose Full width in the menu

- **WHEN** the user selects Full width under Reading width in the Settings menu
- **THEN** the Settings menu and the Settings dialog show Full width selected

#### Scenario: Choose in the dialog

- **WHEN** Full width is selected and the user opens the Settings dialog and selects Page
- **THEN** the Settings menu shows Page selected

#### Scenario: Change while reading

- **WHEN** Reading mode is active with Page and the user selects Full width in the Settings menu
- **THEN** the rendered document takes the Full width layout at once and Reading mode stays active

#### Scenario: Survives restart

- **WHEN** the user selects Full width and restarts the application
- **THEN** Full width is selected

#### Scenario: Reset

- **WHEN** Full width is selected and the user activates Reset appearance
- **THEN** Page is selected

#### Scenario: Invalid stored value

- **WHEN** the stored reading width is missing or holds a value other than `page` or `full`
- **THEN** the application starts normally and Page is selected

## MODIFIED Requirements

### Requirement: Settings catalogue and defaults

The system SHALL provide these settings with these defaults: theme Material; mode Auto; default open mode Editor; reading width Page; Markdown standard Full; heading style ATX; bullet marker "-"; emphasis marker "_"; format on save off; lint on save on; remote image policy Ask; line numbers on; word wrap off; scroll sync on; editor font size 14; autosave on.

#### Scenario: Fresh install

- **WHEN** the application starts for the first time
- **THEN** every setting has the default listed above

### Requirement: Allowed values

The system SHALL accept only these values: theme Glass, Material or Minimal; mode Auto, Light or Dark; default open mode Editor or Viewer; reading width Page or Full width; Markdown standard Minimal, GFM or Full; bullet marker `-`, `*` or `+`; emphasis marker `_` or `*`; heading style ATX or Setext; remote image policy Ask, Allow or Block; font size 13, 14 or 16. A write with any other value SHALL be refused and nothing SHALL be stored.

#### Scenario: Invalid write

- **WHEN** a client submits font size 20
- **THEN** the write is refused with a validation error and the stored font size is unchanged

#### Scenario: Corrupt stored value

- **WHEN** a stored setting holds a value outside its allowed set
- **THEN** that setting is read as its default and the application starts normally

### Requirement: Settings menu and dialog

The Settings menu SHALL offer Theme, Appearance mode, Default open mode, Reading width, Markdown standard, Autosave, Format on save, Lint on save and an "All settings…" entry that opens the Settings dialog (Ctrl or Cmd plus comma). The dialog SHALL offer theme, mode, Default open mode, Reading width, Markdown standard, bullet marker, emphasis marker, heading style, Format on save, Lint on save and Reset appearance.

#### Scenario: Open the dialog

- **WHEN** the user presses Ctrl+, (Cmd+, on macOS)
- **THEN** the Settings dialog opens
