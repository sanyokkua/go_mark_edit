# folder-workspace Specification

## Purpose

Defines the folder workspace: a per-window file tree for browsing and opening Markdown and text files under one chosen folder, creating new files and folders inside it, and opening folders through recents, drag-and-drop or new windows.

## Requirements

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

### Requirement: Tree contents and order

The tree SHALL list the folder's subfolders and the files with extension .md, .markdown, .mdown or .txt (case-insensitive), with folders first and then files, each group sorted alphabetically ignoring case. It SHALL NOT list other files, files whose names begin with a dot, or symbolic links. A subfolder that cannot be read SHALL be shown as "Unreadable folder" and not expanded.

#### Scenario: Mixed folder

- **WHEN** a folder holds "b.md", "A.md", "photo.png", ".hidden.md" and a subfolder "docs"
- **THEN** the tree shows "docs", "A.md", "b.md" in that order

### Requirement: Hidden folders

The tree SHALL omit folders whose names begin with a dot unless the Show hidden folders toggle is on. The toggle SHALL be one application-wide preference that persists across launches. It SHALL be offered in the tree and in the Settings dialog's Workspace section, and both SHALL show the same stored value. Changing it SHALL rebuild the tree immediately when a folder is open. It SHALL also be changeable while no folder is open, and the next folder that opens SHALL use it.

#### Scenario: Show hidden folders

- **WHEN** the user turns on Show hidden folders for a tree containing ".notes/"
- **THEN** ".notes" appears in the tree

#### Scenario: Turned on before opening a folder

- **WHEN** no folder is open, the user turns on Show hidden folders in the Settings dialog and then opens a folder
  containing ".notes/"
- **THEN** ".notes" appears in the tree and the tree's Show hidden folders toggle shows on

### Requirement: Entry limit

The tree SHALL contain at most 20,000 entries including the root. IF a folder holds more, THEN the tree SHALL be cut off and show "Showing the first 20,000 items — some files are not listed."

#### Scenario: Huge folder

- **WHEN** the user opens a folder with 30,000 matching files
- **THEN** the tree shows the first 20,000 entries and the truncation notice

### Requirement: Manual refresh

The tree SHALL change only when the user refreshes it, creates an entry, or toggles hidden folders; it SHALL NOT watch the file system. IF the folder can no longer be read, THEN the tree SHALL keep its last contents and show "This folder is no longer available" with a Retry action.

#### Scenario: File added externally

- **WHEN** a file is added to the folder by another program
- **THEN** it appears only after the user chooses Refresh

### Requirement: Open files from the tree

WHEN the user clicks a file row, or presses Enter on it, the system SHALL open it as an ordinary document (a duplicate focuses the existing tab). Enter on a folder row SHALL expand or collapse it; Up and Down move between rows. Rows of documents with unsaved changes SHALL show an unsaved marker, the active document's row SHALL be revealed and selected, and Collapse all SHALL collapse every folder.

#### Scenario: Open from tree

- **WHEN** the user clicks "plan.md" in the tree
- **THEN** it opens in a new active tab

### Requirement: Tree context menu

Right-clicking a row SHALL offer Reveal in file manager and Copy path for any row, and New File and New Folder only on a readable folder row. A header action SHALL offer New file or folder inside the selected folder, or the root when none is selected. Copy path SHALL copy the row's absolute path.

#### Scenario: File row

- **WHEN** the user right-clicks a file row
- **THEN** the menu offers Reveal in file manager and Copy path but not New File

### Requirement: Create files and folders

WHEN the user names a new file or folder, the system SHALL create it in the chosen folder, add it to the tree, and open a created file in a tab. The name SHALL be non-empty, SHALL NOT begin with a dot, and SHALL NOT contain a path separator. The system SHALL refuse a name that already exists, and a parent outside the workspace.

#### Scenario: Create a file

- **WHEN** the user creates "todo.md" in the root
- **THEN** an empty "todo.md" exists on disk, appears in the tree and opens as the active tab

#### Scenario: Name exists

- **WHEN** the user creates "todo.md" where it already exists
- **THEN** the existing file is untouched and "An entry with this name already exists." is shown

### Requirement: Additive-only mutations

The workspace SHALL only add entries. The system SHALL NOT rename, move, delete or overwrite files and folders from the tree.

#### Scenario: No destructive actions

- **WHEN** the user opens the tree context menu on any row
- **THEN** it contains no rename, move or delete action

### Requirement: Opening another folder

WHEN a folder is already open and the user opens a different one (menu, recent item or drop), the system SHALL ask "Open another folder?" with Replace Folder, Open in New Window and Cancel. Replace Folder SHALL first close all of the window's tabs with the usual unsaved-changes prompt and SHALL stop if that is cancelled. Open in New Window SHALL start a new application window showing that folder.

#### Scenario: Replace with unsaved tab

- **WHEN** the user chooses Replace Folder while a tab has unsaved changes and then cancels the save prompt
- **THEN** the original folder and all tabs remain

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

### Requirement: Drag and drop

WHEN the user drops items on the window, the system SHALL classify each as a supported file, a folder or unsupported. Supported files SHALL open in order until the 40-document limit is reached, and the rest SHALL be reported as not opened; unsupported items SHALL be reported by count without being opened. One dropped folder SHALL open as the workspace. For several dropped folders the system SHALL ask whether to open only the first or open all, each in a new window.

#### Scenario: Two folders dropped

- **WHEN** the user drops two folders
- **THEN** a prompt offers "Open only the first folder" or "Open all of them, each in a new window"

#### Scenario: Unsupported item

- **WHEN** the user drops one "photo.png"
- **THEN** a notice says 1 unsupported item was not opened

### Requirement: Workspace scope and multiple windows

The open folder and its tree SHALL belong to one window and SHALL NOT be restored on the next launch. Each window SHALL have its own folder and tabs; Recent Items and the Show hidden folders preference SHALL be shared by all windows, which refresh the list when needed.

#### Scenario: Second window

- **WHEN** the user opens a folder in a new window
- **THEN** the first window keeps its own folder and tabs

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
