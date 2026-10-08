# Spec Delta

## MODIFIED Requirements

### Requirement: Reading mode shows only the rendered document

WHILE Reading mode is active, the system SHALL hide all application chrome (menu bar with its document identity,
toolbar, tab bar, sidebar, problems panel and status bar) and SHALL show the active document rendered as the preview
renders it, at the width set by the Reading width setting. Only the operating system's window frame remains. Entering or
leaving Reading mode SHALL NOT change the document's arrangement, split ratio, cursor, selection, content, the window's
sidebar visibility or the stored sidebar width.

#### Scenario: Enter from Split

- **WHEN** a document in the Split arrangement is active and the user enters Reading mode
- **THEN** only the rendered document is visible, and leaving Reading mode shows the Split arrangement with the same
  split ratio, editor cursor and editor scroll position

#### Scenario: Shortcuts keep working

- **WHEN** two documents are open in Reading mode and the user presses Ctrl+Tab, then Ctrl+, and then Escape
- **THEN** the other document is shown in Reading mode, and the Settings dialog opens and closes over it

#### Scenario: Large document

- **WHEN** the active document is 3 MiB and Reading mode is entered
- **THEN** the rendered document is replaced by the same paused notice and Refresh action as the preview

#### Scenario: Theme change

- **WHEN** the appearance mode changes from Light to Dark while Reading mode is active
- **THEN** the rendered document restyles at once and Reading mode stays active

#### Scenario: Narrow window

- **WHEN** Reading mode is active with Reading width Page in a window 375 px wide
- **THEN** the rendered document uses the full window width minus its padding

### Requirement: Reading width

WHILE Reading mode is active, the system SHALL lay out the rendered document by the Reading width setting: Page shows
a centered column at most 700 px wide, and Full width uses the whole window width minus its padding. WHEN the setting
changes while Reading mode is active, the rendered document SHALL take the new width at once and Reading mode SHALL
stay active. The reading controls and overlays SHALL behave the same with either width.

#### Scenario: Page

- **WHEN** the Reading width is Page and Reading mode is active in a window 1,400 px wide
- **THEN** the rendered document is a column 700 px wide, centered in the window

#### Scenario: Full width

- **WHEN** the Reading width is Full width and Reading mode is active in a window 1,400 px wide
- **THEN** the rendered document spans the window width minus its padding

#### Scenario: Narrow window with either width

- **WHEN** Reading mode is active in a window 375 px wide, first with Page and then with Full width
- **THEN** the rendered document has the same width both times

#### Scenario: Change from the Settings menu

- **WHEN** Reading mode is active with Page and the user presses Ctrl+, and selects Full width in the Appearance section
  of the Settings dialog that opens (the Settings menu no longer offers Reading width)
- **THEN** the rendered document spans the window width minus its padding at once, and Reading mode stays active

### Requirement: Reading overlays keep the stored layout

WHILE Reading mode is active, Ctrl+\ (Cmd+\ on macOS) SHALL show or hide the sidebar overlay instead of the sidebar,
and the sidebar overlay SHALL use the stored sidebar width and offer no resize handle. Showing or hiding the overlay
SHALL NOT change the window's sidebar visibility or the stored sidebar width. The system SHALL offer no sidebar control
while no workspace is open or while the window is 376 px wide or narrower.

#### Scenario: Stored sidebar state

- **WHEN** the sidebar was visible with width 280 px before Reading mode and the user shows and hides the overlay
  twice, once with Ctrl+\
- **THEN** after leaving Reading mode the sidebar is visible with width 280 px

#### Scenario: Hidden sidebar stays hidden

- **WHEN** a folder is open, the user hid the sidebar with Ctrl+\, enters Reading mode and shows and hides the overlay
- **THEN** after leaving Reading mode the sidebar is still hidden

#### Scenario: No workspace

- **WHEN** Reading mode is active in a window without a workspace
- **THEN** the Show or hide sidebar control is absent and Ctrl+\ does nothing
