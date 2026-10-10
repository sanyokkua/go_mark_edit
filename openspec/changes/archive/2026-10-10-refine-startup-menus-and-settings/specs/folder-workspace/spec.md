# Spec Delta

## ADDED Requirements

### Requirement: Sidebar visibility follows the folder

Each window SHALL start with its sidebar hidden. WHEN a folder opens as the workspace by any route (Open Folder, Recent Items, drag and drop, the operating system or a command-line argument), the system SHALL show the sidebar. WHEN the folder closes, the system SHALL hide it. Opening, creating or closing documents SHALL NOT change it. Ctrl+\ (Cmd+\ on macOS) SHALL show or hide it for the running window.

#### Scenario: Single file opened

- **WHEN** GoMarkEdit is started with `notes.md` as its argument
- **THEN** `notes.md` is shown and the sidebar is hidden

#### Scenario: Folder opened from the menu

- **WHEN** a window without a folder shows `a.md` and the user opens the folder `~/notes` with Open Folder
- **THEN** the sidebar is shown with the tree rooted at "notes" and `a.md` stays open

#### Scenario: Folder opened after hiding the sidebar

- **WHEN** a folder is open, the user hides the sidebar with Ctrl+\ and then opens another folder with Replace Folder
- **THEN** the sidebar is shown with the new folder's tree

#### Scenario: Manual toggle without a folder

- **WHEN** no folder is open and the user presses Ctrl+\ (Cmd+\ on macOS)
- **THEN** the sidebar is shown with "No folder open" and an Open Folder button, and pressing it again hides the sidebar

#### Scenario: Closing the last document keeps the folder sidebar

- **WHEN** a folder is open with the sidebar shown and the user closes the last tab
- **THEN** the sidebar stays shown and the launcher fills the document area

## MODIFIED Requirements

### Requirement: Open a folder

WHEN the user chooses Open Folder (menu or the tree's empty state), the system SHALL show a native folder dialog and display the chosen folder as the window's workspace tree, and SHALL add it to Recent Items. A window SHALL hold at most one folder. Opening the folder that is already shown SHALL change nothing except showing the sidebar if it is hidden. A folder that is missing, unreadable or not a folder SHALL be refused with a message.

#### Scenario: Choose a folder

- **WHEN** the user picks "~/notes" in the dialog
- **THEN** the sidebar shows the tree rooted at "notes" and "~/notes" is first in Recent Items

#### Scenario: Cancelled dialog

- **WHEN** the user dismisses the folder dialog
- **THEN** no folder opens

#### Scenario: Re-open the shown folder

- **WHEN** "~~/notes" is open, the user has hidden the sidebar with Ctrl+\ and opens "~~/notes" again from Recent Items
- **THEN** the sidebar is shown with the same tree, its expanded folders unchanged and no prompt appears

#### Scenario: Open Folder on the shown folder

- **WHEN** "~~/notes" is open, the sidebar is hidden with Ctrl+\ and the user picks "~~/notes" again in the Open Folder
  dialog
- **THEN** the sidebar is shown with the same tree, no "Open another folder?" prompt appears, and the tabs are
  unchanged

### Requirement: Hidden folders

The tree SHALL omit folders whose names begin with a dot unless the Show hidden folders toggle is on. The toggle SHALL be one application-wide preference that persists across launches. It SHALL be offered in the tree and in the Settings dialog's Workspace section, and both SHALL show the same stored value. Changing it SHALL rebuild the tree immediately when a folder is open. It SHALL also be changeable while no folder is open, and the next folder that opens SHALL use it.

#### Scenario: Show hidden folders

- **WHEN** the user turns on Show hidden folders for a tree containing ".notes/"
- **THEN** ".notes" appears in the tree

#### Scenario: Turned on before opening a folder

- **WHEN** no folder is open, the user turns on Show hidden folders in the Settings dialog and then opens a folder
  containing ".notes/"
- **THEN** ".notes" appears in the tree and the tree's Show hidden folders toggle shows on

### Requirement: Close folder

WHEN the user chooses Close Folder, the system SHALL clear the tree and hide the sidebar. IF tabs are open, THEN it SHALL ask "Close folder?" with "Close the tabs too", "Keep them open" and Cancel; Cancel SHALL leave the folder and the sidebar unchanged. Closing a folder SHALL NOT remove it from Recent Items.

#### Scenario: Keep tabs

- **WHEN** the user closes the folder and chooses "Keep them open"
- **THEN** the tree is cleared, the sidebar is hidden and all tabs remain

#### Scenario: Close the tabs too

- **WHEN** the user closes the folder, chooses "Close the tabs too" and no tab has unsaved changes
- **THEN** the window shows the launcher with no tab and no sidebar

#### Scenario: Cancel

- **WHEN** the user closes the folder and chooses Cancel
- **THEN** the folder, its tree and the visible sidebar remain
