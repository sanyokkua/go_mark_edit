## Purpose

Defines Reading mode, the window state that hides the application chrome and shows only the rendered active document,
with its hover-revealed controls, its optional sidebar and tab bar overlays, and the ways it is entered and left.

## ADDED Requirements

### Requirement: Reading mode shows only the rendered document

WHILE Reading mode is active, the system SHALL hide all application chrome (menu bar with its document identity,
toolbar, tab bar, sidebar, problems panel and status bar) and SHALL show the active document rendered as the preview
renders it, at the width set by the Reading width setting. Only the operating system's window frame remains. Entering or
leaving Reading mode SHALL NOT change the document's arrangement, split ratio, cursor, selection, content or the stored
sidebar state.

#### Scenario: Enter from Split

- **WHEN** a document in the Split arrangement is active and the user enters Reading mode
- **THEN** only the rendered document is visible, and leaving Reading mode shows the Split arrangement with the same
  split ratio, editor cursor and editor scroll position

#### Scenario: Shortcuts keep working

- **WHEN** two documents are open in Reading mode and the user presses Ctrl+Tab, then Ctrl+, and then Escape
- **THEN** the other document is shown in Reading mode, and the Settings menu opens and closes over it

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

- **WHEN** Reading mode is active with Page and the user presses Ctrl+, and selects Full width in the Settings menu
- **THEN** the rendered document spans the window width minus its padding at once, and Reading mode stays active

### Requirement: Reading mode scroll position

WHEN Reading mode is entered or another document becomes active in Reading mode, the system SHALL show that document
at its saved preview scroll offset, limited to the end of the document, and scrolling in Reading mode SHALL update that
saved offset. Editor and preview scroll synchronization SHALL be inactive while Reading mode is active.

#### Scenario: Continue from the preview

- **WHEN** the preview of `notes.md` was last scrolled 1,200 px down, the user switches to the Editor arrangement and
  then enters Reading mode
- **THEN** Reading mode shows `notes.md` scrolled 1,200 px down

#### Scenario: Switch documents

- **WHEN** `a.md` is scrolled 800 px down in Reading mode, the user switches to `b.md` through the tab bar overlay and
  back
- **THEN** `a.md` is shown scrolled 800 px down again

### Requirement: Entering and leaving Reading mode

The system SHALL toggle Reading mode with Ctrl+Enter (Cmd+Enter on macOS) and with the View menu entry
Distraction-free reading, and SHALL disable both while no document is open. WHEN Escape is pressed while Reading mode
is active and no menu, dialog or reading overlay is open, the system SHALL leave Reading mode.

#### Scenario: Shortcut toggle

- **WHEN** a document is active and the user presses Ctrl+Enter twice
- **THEN** Reading mode is entered and then left

#### Scenario: View menu

- **WHEN** a document is active and the user chooses View, Distraction-free reading
- **THEN** Reading mode is entered

#### Scenario: Escape leaves

- **WHEN** Reading mode is active with no menu, dialog or overlay open and the user presses Escape
- **THEN** Reading mode is left

#### Scenario: Escape closes a menu first

- **WHEN** the preview context menu is open in Reading mode and the user presses Escape
- **THEN** the menu closes and Reading mode stays active

#### Scenario: No document

- **WHEN** no document is open
- **THEN** Distraction-free reading is disabled in the View menu and Ctrl+Enter does nothing

### Requirement: Reading mode across document changes

WHILE Reading mode is active, closing the active document while other documents remain SHALL show the newly active
document in Reading mode, closing the last open document SHALL leave Reading mode, and creating a new untitled
document SHALL leave Reading mode.

#### Scenario: Close one of several tabs

- **WHEN** two documents are open, Reading mode is active and the user presses Ctrl+W
- **THEN** the remaining document is shown in Reading mode

#### Scenario: Close the last tab

- **WHEN** one document is open, Reading mode is active and the user presses Ctrl+W
- **THEN** Reading mode is left and the launcher is shown

#### Scenario: New file

- **WHEN** Reading mode is active and the user presses Ctrl+N
- **THEN** Reading mode is left and the new untitled document is shown in the Editor arrangement

### Requirement: Hover-revealed reading controls

WHILE Reading mode is active, the system SHALL provide an Exit control at the top right, a Show or hide sidebar
control at the left edge and a Show or hide tab bar control at the top edge, each with a hover target of at least
40 by 40 px placed over the window padding. Each control SHALL be fully transparent at rest and SHALL NOT take space
from the rendered document.

#### Scenario: Hidden at rest

- **WHEN** Reading mode is entered and the pointer rests in the middle of the document
- **THEN** no reading control is visible and the document column keeps its width

#### Scenario: Exit by pointer

- **WHEN** the user clicks the Exit control
- **THEN** Reading mode is left

### Requirement: Reading control visibility and keyboard access

The Show or hide sidebar and Show or hide tab bar controls SHALL become fully opaque while the pointer is over them or
they have keyboard focus. The Exit control SHALL be at most 15 percent opaque while the pointer is over it and fully
opaque while it has keyboard focus. Each control SHALL be reachable with the Tab key and SHALL have a localized
accessible name and a visible focus indication.

#### Scenario: Faint Exit on hover

- **WHEN** the pointer moves over the Exit control
- **THEN** the Exit control is at most 15 percent opaque

#### Scenario: Reveal by keyboard

- **WHEN** the user presses Tab in Reading mode until the Exit control has focus
- **THEN** the Exit control is fully opaque with a visible focus indication, and Enter leaves Reading mode

### Requirement: Reading sidebar and tab bar overlays

WHILE Reading mode is active, the system SHALL keep the sidebar and the tab bar hidden on every entry and SHALL show
each one over the rendered document when its reading control is activated, without resizing the document column. The
sidebar overlay SHALL show the workspace file tree. Opening a file from the tree or selecting a tab SHALL show that
document in Reading mode. Escape SHALL close an open overlay before it leaves Reading mode.

#### Scenario: Open a file from the sidebar

- **WHEN** a workspace is open, the user shows the sidebar in Reading mode and opens another Markdown file from the
  tree
- **THEN** that file is shown in Reading mode and the document column keeps its width

#### Scenario: Escape closes an overlay first

- **WHEN** the sidebar overlay is open in Reading mode and the user presses Escape
- **THEN** the overlay closes and Reading mode stays active until Escape is pressed again

#### Scenario: Re-entry resets overlays

- **WHEN** the user showed the tab bar, left Reading mode and entered it again
- **THEN** the tab bar is hidden

### Requirement: Reading overlays keep the stored layout

WHILE Reading mode is active, Ctrl+\ (Cmd+\ on macOS) SHALL show or hide the sidebar overlay instead of the sidebar,
and the sidebar overlay SHALL use the stored sidebar width and offer no resize handle. Nothing in Reading mode SHALL
change the stored sidebar visibility or width. The system SHALL offer no sidebar control while no workspace is open or
while the window is 376 px wide or narrower.

#### Scenario: Stored sidebar state

- **WHEN** the sidebar was visible with width 280 px before Reading mode and the user shows and hides the overlay
  twice, once with Ctrl+\
- **THEN** after leaving Reading mode the sidebar is visible with width 280 px

#### Scenario: No workspace

- **WHEN** Reading mode is active in a window without a workspace
- **THEN** the Show or hide sidebar control is absent and Ctrl+\ does nothing

### Requirement: Reading mode is not stored

The system SHALL keep Reading mode only for the running window. It SHALL NOT be stored per document or across
restarts, and each window SHALL have its own Reading mode.

#### Scenario: Restart

- **WHEN** the application is quit in Reading mode and started again
- **THEN** it starts in the normal window and the documents' saved arrangements are unchanged

### Requirement: Reading mode on open

WHEN the default open mode is Reading (Viewer) and a file is opened from disk through the Open dialog, Open Recent,
the launcher's Recent list, Reopen Last, the workspace tree, a preview link or drag and drop, including into a window
that shows the launcher, the system SHALL show that document in Reading mode. A file created with New File in the
workspace tree SHALL open without Reading mode and SHALL leave it if active. Opening a file SHALL NOT otherwise change
whether Reading mode is active.

#### Scenario: Open into an empty window

- **WHEN** the default open mode is Reading (Viewer), the window shows the launcher and the user opens `notes.md`
- **THEN** the window shows `notes.md` in Reading mode

#### Scenario: Editor default

- **WHEN** the default open mode is Editor and the user opens `notes.md` last closed in Split
- **THEN** it opens in Split without Reading mode

#### Scenario: Already open document

- **WHEN** the default open mode is Reading (Viewer), the window is not in Reading mode and the user opens a file that
  is already open in a background tab
- **THEN** that tab becomes active and Reading mode is not entered

#### Scenario: File created in the workspace tree

- **WHEN** the default open mode is Reading (Viewer) and the user creates `draft.md` with New File in the workspace tree
- **THEN** `draft.md` opens without Reading mode

#### Scenario: File created from the sidebar overlay

- **WHEN** Reading mode is active and the user creates `draft.md` with New File in the sidebar overlay's tree
- **THEN** Reading mode is left and `draft.md` is shown in its arrangement

### Requirement: Reading mode focus

WHEN Reading mode is entered, the system SHALL move keyboard focus to the rendered document, and WHEN it is left, the
system SHALL return focus to the editor or preview that had focus before entry, or to the editor when that element no
longer exists.

#### Scenario: Focus on entry and exit

- **WHEN** the editor has focus, the user enters Reading mode and then presses Escape
- **THEN** focus is on the rendered document while Reading mode is active and on the editor afterward
