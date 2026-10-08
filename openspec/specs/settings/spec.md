# settings Specification

## Purpose

Defines the user settings catalogue with its defaults and allowed values, how settings are saved locally, and the recent files and window layout that the application remembers between runs.

## Requirements

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

### Requirement: Local persistence

The system SHALL store settings as key-value pairs in the application's local SQLite database. WHEN a setting changes, the system SHALL save it immediately, and the new value SHALL be in effect at the next start.

#### Scenario: Survives restart

- **WHEN** the user turns Lint on save off and restarts the application
- **THEN** Lint on save is still off

### Requirement: Acknowledged, ordered updates

The system SHALL show a changed setting only after the save succeeds, and SHALL process successive setting changes in the order the user made them. IF a save fails, THEN the displayed value SHALL stay unchanged and a Markdown setting failure SHALL be reported as an error notification.

#### Scenario: Rapid toggles

- **WHEN** the user toggles Word wrap twice in quick succession
- **THEN** the final saved and displayed state is the second toggle's result

### Requirement: Settings menu and dialog

The Settings menu SHALL offer Theme, Appearance mode, Default open mode, Reading width, PDF appearance, Markdown standard, Autosave, Format on save, Lint on save and an "All settings…" entry that opens the Settings dialog (Ctrl or Cmd plus comma). The dialog SHALL offer theme, mode, Default open mode, Reading width, PDF appearance, Markdown standard, bullet marker, emphasis marker, heading style, Format on save, Lint on save and Reset appearance.

#### Scenario: Open the dialog

- **WHEN** the user presses Ctrl+, (Cmd+, on macOS)
- **THEN** the Settings dialog opens

### Requirement: Markdown settings gating

WHILE the Markdown settings have not finished loading, the system SHALL show Markdown standard, Format on save, Lint on save and the other Markdown controls disabled. The Markdown standard SHALL control which Markdown syntax is parsed and rendered, and the bullet, emphasis and heading settings SHALL control what Format and Lint produce.

#### Scenario: Loading

- **WHEN** the Markdown settings are still loading
- **THEN** the Format menu and the Markdown controls are disabled with a "Markdown settings are loading." explanation

### Requirement: Save automation

WHEN Format on save is on, the system SHALL format the active document before an explicit save. WHEN Lint on save is on, the system SHALL check the active document after an explicit save. WHILE Autosave is on, the system SHALL automatically save existing files.

#### Scenario: Format on save

- **WHEN** Format on save is on and the user saves a document containing "* item"
- **THEN** the saved file contains "- item"

### Requirement: Editor display settings

Line numbers, Word wrap and Scroll sync SHALL be toggled from the View menu and SHALL apply to all open editors at once. The editor font size SHALL apply to all editors and SHALL have no on-screen control.

#### Scenario: Toggle word wrap

- **WHEN** the user turns on View, Word wrap
- **THEN** long lines wrap in every open editor and the setting is kept for the next start

### Requirement: Remote image policy

The system SHALL store the remote image policy (Ask, Allow, Block) with default Ask and SHALL provide no control to change it. The preview SHALL NOT fetch remote images.

#### Scenario: Remote image in preview

- **WHEN** a document contains an image with an http address
- **THEN** the preview shows its alt text and makes no network request

### Requirement: Window and view state

The system SHALL remember window width (at least 375), height (at least 480) and maximized state; sidebar visibility, width and Show hidden folders; and the last document arrangement. WHEN several windows write the same field, the most recent write SHALL win.

#### Scenario: Resize persisted

- **WHEN** the user resizes the window and restarts the application
- **THEN** the window opens at the new size

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
