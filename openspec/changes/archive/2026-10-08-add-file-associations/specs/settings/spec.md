## MODIFIED Requirements

### Requirement: Settings catalogue and defaults

The system SHALL provide these settings with these defaults: theme Material; mode Auto; default open mode Editor; reading width Page; PDF appearance Styled; Markdown standard Full; heading style ATX; bullet marker "-"; emphasis marker "_"; format on save off; lint on save on; remote image policy Ask; line numbers on; word wrap off; scroll sync on; editor font size 14; autosave on.

#### Scenario: Fresh install

- **WHEN** the application starts for the first time
- **THEN** every setting has the default listed above

### Requirement: Allowed values

The system SHALL accept only these values: theme Glass, Material or Minimal; mode Auto, Light or Dark; default open mode Editor or Viewer; reading width Page or Full width; PDF appearance Styled or Clean; Markdown standard Minimal, GFM or Full; bullet marker `-`, `*` or `+`; emphasis marker `_` or `*`; heading style ATX or Setext; remote image policy Ask, Allow or Block; font size 13, 14 or 16. A write with any other value SHALL be refused and nothing SHALL be stored.

#### Scenario: Invalid write

- **WHEN** a client submits font size 20
- **THEN** the write is refused with a validation error and the stored font size is unchanged

#### Scenario: Corrupt stored value

- **WHEN** a stored setting holds a value outside its allowed set
- **THEN** that setting is read as its default and the application starts normally

### Requirement: Settings menu and dialog

The Settings menu SHALL offer Theme, Appearance mode, Default open mode, Reading width, PDF appearance, Markdown standard, Autosave, Format on save, Lint on save and an "All settings…" entry that opens the Settings dialog (Ctrl or Cmd plus comma). The dialog SHALL offer theme, mode, Default open mode, Reading width, PDF appearance, Markdown standard, bullet marker, emphasis marker, heading style, Format on save, Lint on save and Reset appearance.

#### Scenario: Open the dialog

- **WHEN** the user presses Ctrl+, (Cmd+, on macOS)
- **THEN** the Settings dialog opens

## ADDED Requirements

### Requirement: PDF export appearance choice

The Settings menu and the Settings dialog SHALL let the user choose the PDF appearance, Styled or Clean, under the
localized label "PDF appearance", with keyboard access and visible focus like the other appearance choices, and SHALL
both show the stored choice as selected. A new choice SHALL apply to the next export and SHALL be kept for the next
start. Reset appearance SHALL restore Styled, and a missing or invalid stored value SHALL be read as Styled.

#### Scenario: Choose Clean in the menu

- **WHEN** the user selects Clean under PDF appearance in the Settings menu
- **THEN** the Settings menu and the Settings dialog show Clean selected

#### Scenario: Choose in the dialog with the keyboard

- **WHEN** Clean is selected and the user opens the Settings dialog, moves focus to PDF appearance with Tab and selects
  Styled with the arrow keys
- **THEN** the Settings menu shows Styled selected

#### Scenario: Survives restart

- **WHEN** the user selects Clean and restarts the application
- **THEN** Clean is selected

#### Scenario: Reset

- **WHEN** Clean is selected and the user activates Reset appearance
- **THEN** Styled is selected

#### Scenario: Invalid stored value

- **WHEN** the stored PDF appearance is missing or holds a value other than `styled` or `clean`
- **THEN** the application starts normally and Styled is selected
