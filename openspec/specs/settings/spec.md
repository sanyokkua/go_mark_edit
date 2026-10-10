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

The Settings menu SHALL offer, as shortcuts to the same stored settings as the Settings dialog, only: Theme, Appearance mode, Markdown standard, Autosave, Format on save, Lint on save and an "All settings…" entry that opens the Settings dialog (Ctrl or Cmd plus comma).

#### Scenario: Open the dialog

- **WHEN** the user presses Ctrl+, (Cmd+, on macOS)
- **THEN** the Settings dialog opens showing the Appearance section

#### Scenario: Settings menu contents

- **WHEN** the user opens the Settings menu
- **THEN** it shows the groups Theme (Liquid Glass, Material, Minimal), Appearance (Auto (system), Light, Dark) and
  Markdown (Minimal (CommonMark), GFM, Full), the switches Autosave, Format on save and Lint on save, and All settings…
- **AND** it shows no Default open mode, Reading width or PDF appearance choice

#### Scenario: Menu and dialog stay in sync

- **WHEN** the user turns Format on save on in the Settings menu and then opens the Settings dialog's Markdown section
- **THEN** Format on save is shown on, and turning it off in the dialog shows it off in the Settings menu

### Requirement: Settings dialog contents

The Settings dialog SHALL offer the settings listed in "Settings dialog sections", in five sections: Appearance, Editor, Markdown, Workspace and Export. Show hidden folders is offered in the dialog's Workspace section as well as in the workspace tree, and the remote image policy keeps no control.

#### Scenario: Dialog sections

- **WHEN** the user opens the Settings dialog
- **THEN** it offers the sections Appearance, Editor, Markdown, Workspace and Export, and no control for the remote image policy

### Requirement: Markdown settings gating

WHILE the Markdown settings have not finished loading, the system SHALL show Markdown standard, Format on save, Lint on save and the other Markdown controls disabled. The Markdown standard SHALL control which Markdown syntax is parsed and rendered, and the bullet, emphasis and heading settings SHALL control what Format and Lint produce.

#### Scenario: Loading

- **WHEN** the Markdown settings are still loading
- **THEN** the Markdown menu's Italic, Bold Italic, Bullet list, Task list, Format, Compact and Lint items and the
  Markdown controls of the Settings menu and the Settings dialog are disabled with a "Markdown settings are loading."
  explanation

### Requirement: Save automation

WHEN Format on save is on, the system SHALL format the active document before an explicit save. WHEN Lint on save is on, the system SHALL check the active document after an explicit save. WHILE Autosave is on, the system SHALL automatically save existing files.

#### Scenario: Format on save

- **WHEN** Format on save is on and the user saves a document containing "* item"
- **THEN** the saved file contains "- item"

### Requirement: Editor display settings

Line numbers, Word wrap and Scroll sync SHALL be toggled from the View menu or the Settings dialog's Editor section and SHALL apply to all open editors at once. The editor font size SHALL be chosen in the Editor section from 13, 14 or 16 px (default 14) and SHALL apply to all open editors at once.

#### Scenario: Toggle word wrap

- **WHEN** the user turns on View, Word wrap
- **THEN** long lines wrap in every open editor, the Settings dialog's Editor section shows Word wrap on, and the
  setting is kept for the next start

#### Scenario: Choose a font size

- **WHEN** two documents are open and the user chooses 16 px under Font size in the Settings dialog's Editor section
- **THEN** both editors show their text at 16 px at once, and after a restart Font size shows 16 px

#### Scenario: Toggle in the dialog

- **WHEN** the user turns Line numbers off in the Settings dialog's Editor section
- **THEN** every open editor hides its line numbers and the View menu shows Line numbers off

### Requirement: Remote image policy

The system SHALL store the remote image policy (Ask, Allow, Block) with default Ask and SHALL provide no control to change it. The preview SHALL NOT fetch remote images.

#### Scenario: Remote image in preview

- **WHEN** a document contains an image with an http address
- **THEN** the preview shows its alt text and makes no network request

### Requirement: Window and view state

The system SHALL remember window width (at least 375), height (at least 480) and maximized state; sidebar width and Show hidden folders; and the last document arrangement. The system SHALL NOT remember sidebar visibility; how it is decided is defined by the folder-workspace capability. WHEN several windows write the same field, the most recent write SHALL win.

#### Scenario: Resize persisted

- **WHEN** the user resizes the window and restarts the application
- **THEN** the window opens at the new size

#### Scenario: Sidebar visibility not remembered

- **WHEN** the sidebar is shown with a folder open and the user restarts the application from its icon
- **THEN** the window starts with the launcher and the sidebar hidden

#### Scenario: Sidebar width kept

- **WHEN** the user resizes the sidebar to 280 px, quits, starts the application and opens a folder
- **THEN** the sidebar is shown 280 px wide

#### Scenario: Visibility stored by an earlier version

- **WHEN** an earlier version stored the sidebar as visible and the application starts without a path
- **THEN** the sidebar is hidden

### Requirement: Default open mode choice

The Settings dialog's Appearance section SHALL let the user choose the default open mode, Editor or Reading (Viewer),
with the description "How files open from the file system (association, drag-and-drop, tree, Open dialog)", and SHALL
show the stored choice as selected. The Settings menu SHALL NOT offer it.

#### Scenario: Choose Reading

- **WHEN** the user selects Reading (Viewer) in the Settings dialog and restarts the application
- **THEN** the Settings dialog shows Reading (Viewer) selected

#### Scenario: Choose in the dialog

- **WHEN** Reading (Viewer) is selected and the user opens the Settings dialog and selects Editor
- **THEN** the Settings dialog shows Editor selected and the choice is stored

#### Scenario: Applies to the next open

- **WHEN** the user selects Reading (Viewer) in the Settings dialog, closes it and opens `notes.md` with Open File
- **THEN** `notes.md` is shown in Reading mode

#### Scenario: Reset

- **WHEN** Reading (Viewer) is selected and the user activates Reset appearance
- **THEN** Editor is selected

### Requirement: Default open mode application

A new default open mode choice SHALL apply to the next file opened, without a restart, and Reset appearance SHALL restore Editor. How each choice opens a file is defined by the editor capability's Open mode requirement.

#### Scenario: Reset restores Editor

- **WHEN** Reading (Viewer) is selected and the user activates Reset appearance
- **THEN** Editor is selected, and the next file opened uses Editor

### Requirement: Reading width choice

The Settings dialog's Appearance section SHALL let the user choose the reading width, Page or Full width, and SHALL
show the stored choice as selected. The Settings menu SHALL NOT offer it. How each choice lays out Reading mode is
defined by the reading-mode capability's Reading width requirement.

#### Scenario: Choose Full width in the menu

- **WHEN** the user opens the Settings menu to change the reading width
- **THEN** the menu offers no Reading width choice, and its All settings… entry opens the Settings dialog, where
  selecting Full width shows Full width selected

#### Scenario: Choose in the dialog

- **WHEN** Full width is selected and the user opens the Settings dialog and selects Page
- **THEN** the Settings dialog shows Page selected and the choice is stored

#### Scenario: Change while reading

- **WHEN** Reading mode is active with Page and the user presses Ctrl+, and selects Full width in the Settings dialog
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

### Requirement: Reading width persistence

A new reading width choice SHALL apply at once, including while Reading mode is active, and SHALL be kept for the next start. Reset appearance SHALL restore Page, and a missing or invalid stored value SHALL be read as Page.

#### Scenario: Applied and kept

- **WHEN** the user selects Full width while Reading mode is active and restarts the application
- **THEN** Full width applied at once and is selected after the restart

### Requirement: PDF export appearance choice

The Settings dialog's Export section SHALL let the user choose the PDF appearance, Styled or Clean, under the localized
label "PDF appearance" with the description "Styled keeps the current theme in exported PDFs. Clean prints black text
on white." and SHALL show the stored choice as
selected. The Settings menu SHALL NOT offer it.

#### Scenario: Choose Clean in the menu

- **WHEN** the user opens the Settings menu to change the PDF appearance
- **THEN** the menu offers no PDF appearance choice, and its All settings… entry opens the Settings dialog

#### Scenario: Choose Clean in the dialog

- **WHEN** the user selects Clean under PDF appearance in the Settings dialog's Export section
- **THEN** Clean is shown selected and the next Export to PDF uses the Clean appearance

#### Scenario: Choose in the dialog with the keyboard

- **WHEN** Clean is selected and the user opens the Settings dialog, presses End in the section list to show Export,
  moves focus to PDF appearance with Tab and selects Styled with the arrow keys
- **THEN** Styled is shown selected and stored

#### Scenario: Survives restart

- **WHEN** the user selects Clean and restarts the application
- **THEN** Clean is selected

#### Scenario: Reset

- **WHEN** Clean is selected and the user activates Reset appearance
- **THEN** Styled is selected

#### Scenario: Invalid stored value

- **WHEN** the stored PDF appearance is missing or holds a value other than `styled` or `clean`
- **THEN** the application starts normally and Styled is selected

### Requirement: PDF appearance access and persistence

The PDF appearance choice SHALL have keyboard access and visible focus like the other choices. A new choice SHALL apply to the next export and SHALL be kept for the next start. Reset appearance SHALL restore Styled, and a missing or invalid stored value SHALL be read as Styled.

#### Scenario: Applied to the next export

- **WHEN** the user selects Clean and exports to PDF, then restarts the application
- **THEN** the export used the Clean appearance and Clean is selected after the restart

### Requirement: Settings dialog layout

The Settings dialog SHALL show a header with the title "Settings" and a Close button, a list of sections on the left and the selected section on the right as a section heading followed by rows, each with a label, an optional description and its control on the right. Every change SHALL apply when made, with no Apply or Cancel step. The dialog SHALL be at most 760 px wide and 94% of the window width, and at most 88% of the window height.

#### Scenario: Wide window

- **WHEN** the window is 1,400 by 900 px and the user opens the Settings dialog
- **THEN** the dialog is 760 px wide and at most 792 px high, with the section list on the left and the rows on the
  right

#### Scenario: Close

- **WHEN** the Settings dialog is open and the user presses Escape, clicks Close or clicks outside the dialog
- **THEN** the dialog closes and focus returns to the control that opened it

#### Scenario: Long section

- **WHEN** the selected section is taller than the dialog
- **THEN** only the rows scroll, and the header and the section list stay in place

#### Scenario: Narrow window

- **WHEN** the window is 375 px wide and the user opens the Settings dialog
- **THEN** the section list is shown above the rows and every row's label and control remain fully visible without
  horizontal scrolling

### Requirement: Settings dialog sections

The Settings dialog SHALL show these sections and rows, in this order: Appearance (Theme, Color mode, Default open mode, Reading width, Reset appearance); Editor (Autosave, Line numbers, Word wrap, Scroll sync, Font size); Markdown (Standard, Format on save, Lint on save, Bullet marker, Emphasis, Heading style); Workspace (Show hidden folders); Export (PDF appearance). Two- or three-value choices SHALL be segmented controls, on/off settings switches and Font size a drop-down.

#### Scenario: Appearance section

- **WHEN** the Settings dialog opens
- **THEN** the Appearance section shows Theme (Liquid Glass, Material, Minimal), Color mode (Auto, Light, Dark),
  Default open mode (Reading (Viewer), Editor), Reading width (Page, Full width) and a Reset appearance button

#### Scenario: Editor section

- **WHEN** the user selects Editor in the section list
- **THEN** it shows switches for Autosave, Line numbers, Word wrap and Scroll sync and a Font size drop-down offering
  13 px, 14 px and 16 px, each showing the stored value

#### Scenario: Markdown section

- **WHEN** the user selects Markdown in the section list
- **THEN** it shows Standard (Minimal, GFM, Full), switches for Format on save and Lint on save, Bullet marker (`-`,
  `*`, `+`), Emphasis (`_ _`, `* *`) and Heading style (ATX (#), Setext)

#### Scenario: Workspace section

- **WHEN** the user selects Workspace in the section list
- **THEN** it shows a Show hidden folders switch with the stored value, also when no folder is open, and turning it on
  or off stores the value and shows the same value on the workspace tree's toggle

#### Scenario: No unsupported sections

- **WHEN** the user looks through the section list
- **THEN** it contains exactly Appearance, Editor, Markdown, Workspace and Export

### Requirement: Settings dialog keyboard navigation

The section list SHALL be one keyboard stop with a visible focus indication: Up or Left SHALL move to the previous section, Down or Right to the next, Home and End to the first and last, and moving SHALL show that section at once. Tab SHALL move from the section list into the selected section's rows. Every section and control SHALL have a localized accessible name, and switches SHALL announce their on or off state.

#### Scenario: Move between sections

- **WHEN** the Settings dialog is open, the section list has focus on Appearance and the user presses Down twice
- **THEN** the Markdown section is shown and the Markdown entry has a visible focus indication

#### Scenario: Narrow window

- **WHEN** the window is 375 px wide, the section list above the rows has focus on Appearance and the user presses Right
- **THEN** the Editor section is shown

#### Scenario: Toggle with the keyboard

- **WHEN** the user moves focus to the Word wrap switch with Tab and presses Space
- **THEN** Word wrap turns on, the switch announces it as on, and every open editor wraps long lines
