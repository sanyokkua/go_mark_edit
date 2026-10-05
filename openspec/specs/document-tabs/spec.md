# document-tabs Specification

## Purpose

Defines the tab strip that represents open documents in a window: how tabs are identified, activated, ordered and closed, and how unsaved work is protected when tabs, the window or the application close.

## Requirements

### Requirement: Path-independent tab identity

The system SHALL identify each tab by an identifier assigned when the document is created or opened, not by its path. A tab SHALL keep its identity, position and unsaved edits across Save As, saves that replace the file, and reloads from disk.

#### Scenario: Save As keeps the tab

- **WHEN** the user saves an Untitled tab as "draft.md"
- **THEN** the same tab, in the same position, now shows "draft.md"

### Requirement: Duplicate open focuses the existing tab

WHEN the user opens a file that is already open, including through a different spelling of the same path such as a symbolic link or different letter case on a case-insensitive volume, the system SHALL activate the existing tab and SHALL NOT add another.

#### Scenario: Aliased path

- **WHEN** "a.md" is open and the user opens a symbolic link that points to it
- **THEN** the existing "a.md" tab is activated and the tab count is unchanged

### Requirement: Tab appearance and activation

The system SHALL show one tab per document in tab order with its file name, a modified indicator for unsaved changes, a read-only marker for read-only documents, and a "Blocked by conflict" label while an external-change decision is pending. The full path SHALL be available as the tab's tooltip. Clicking a tab SHALL activate it; the active tab SHALL be kept visible.

#### Scenario: Modified tab

- **WHEN** a document has unsaved changes
- **THEN** its tab shows the modified indicator

### Requirement: Tab keyboard navigation

WHILE focus is in the tab strip, Left and Right SHALL activate the previous and next tab and Home and End SHALL activate the first and last tab. Next tab and Previous tab commands SHALL cycle through tabs and SHALL be unavailable when fewer than two tabs are open. Shift+F10 or the Context Menu key on a tab SHALL open its context menu.

#### Scenario: Home key

- **WHEN** the tab strip has focus and the user presses Home
- **THEN** the first tab becomes active

### Requirement: Overflow scrolling

WHEN the tabs are wider than the strip, the system SHALL make the strip horizontally scrollable, keep the active tab in view, and scroll the strip automatically while a tab is dragged near either edge.

#### Scenario: Many tabs

- **WHEN** enough tabs are open that they do not fit
- **THEN** the strip scrolls and the active tab remains visible

### Requirement: Reorder tabs

The system SHALL let the user move a tab by dragging it (after a short movement threshold; Escape cancels the drag) or with the Move tab left and Move tab right commands. Moving past either end SHALL do nothing. Reordering SHALL NOT change which tab is active or any document content.

#### Scenario: Move right

- **WHEN** the user chooses Move tab right on the first of three tabs
- **THEN** it becomes the second tab

### Requirement: Close a tab

WHEN the user closes a tab (close button, middle-click, Close Tab command or context menu) and its document has no unsaved changes, the system SHALL close it immediately and activate the next tab at the same position, or the previous tab when the closed tab was last. Closing the last tab SHALL leave the window with no document.

#### Scenario: Close middle tab

- **WHEN** the user closes the second of three clean tabs while it is active
- **THEN** the third tab becomes active

### Requirement: Close others and close to the right

The tab context menu SHALL offer Close others and Close to the right. Close others SHALL close every tab except the chosen one and SHALL be unavailable with a single tab. Close to the right SHALL close every tab after the chosen one and SHALL be unavailable on the last tab. The tab context menu SHALL also offer Close, Move tab left, Move tab right, Copy path and Reveal in file manager.

#### Scenario: Close to the right

- **WHEN** the user chooses Close to the right on the second of four clean tabs
- **THEN** the first and second tabs remain

### Requirement: Unsaved-changes close protection

WHEN any tab selected for closing has unsaved changes, the system SHALL close nothing and SHALL show a prompt listing each modified document with its path. For one modified tab the choices SHALL be Save, Discard and Cancel; for several they SHALL be Save all, Discard all and Cancel. The prompt SHALL focus Cancel first, Escape SHALL cancel, and clicking outside it SHALL do nothing. The same prompt SHALL guard closing the window and quitting.

#### Scenario: Cancel

- **WHEN** the user closes a modified tab and chooses Cancel
- **THEN** the tab stays open with its edits

#### Scenario: Discard all

- **WHEN** the user chooses Close others with two modified tabs and then Discard all
- **THEN** all other tabs close without saving

### Requirement: Saving while closing

WHEN the user chooses Save or Save all in the close prompt, the system SHALL save the selected tabs in tab order and then close them, asking Save As for Untitled tabs and the line-ending prompt for mixed-ending files. IF any save fails or is cancelled, THEN every tab SHALL stay open, and saves that already succeeded SHALL remain on disk. A pending external-change decision SHALL be resolved before that tab is written.

#### Scenario: Failed save keeps tabs

- **WHEN** Save all is chosen and the second file cannot be written
- **THEN** no tab closes, the first file stays saved and an error is shown
