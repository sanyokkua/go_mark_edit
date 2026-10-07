## Purpose

Defines how GoMarkEdit registers with macOS, Windows and Linux as an application that can open Markdown and text files
and folders, and how paths passed by the operating system or on the command line are opened and routed to windows.

## ADDED Requirements

### Requirement: Open With registration

The installed application SHALL register as able to open files ending in .md, .markdown, .mdown and .txt, so that the
file manager lists it under Open With and the user can make it the default with the operating system's own controls.
Installing, starting or updating it SHALL NOT set, request or ask for a default and SHALL leave existing defaults
unchanged. Uninstalling SHALL remove every registration it added.

#### Scenario: Listed in Open With on macOS

- **WHEN** another application is the default for `.md` files, GoMarkEdit is installed in Applications and the user
  opens Open With for `notes.md` in Finder
- **THEN** GoMarkEdit is listed
- **AND** the other application is still the default for `.md` files

#### Scenario: Made the default by the user

- **WHEN** the user selects GoMarkEdit under "Open with" in Finder's Get Info window for `notes.md` and chooses Change All
- **THEN** double-clicking any `.md` file opens it in GoMarkEdit

#### Scenario: Windows installer keeps the defaults

- **WHEN** Notepad is the default application for `.txt` and the user installs GoMarkEdit with the Windows installer
- **THEN** Notepad is still the default for `.txt`
- **AND** GoMarkEdit is listed under "Open with" for `.md`, `.markdown`, `.mdown` and `.txt` files

#### Scenario: Linux install script

- **WHEN** a text editor is the default for Markdown and plain-text files and the user runs the install script shipped
  next to the Linux binary
- **THEN** the file manager lists GoMarkEdit under Open With for `notes.md` and `notes.txt`
- **AND** that text editor is still the default for Markdown and plain-text files

#### Scenario: Uninstall

- **WHEN** the user uninstalls GoMarkEdit with the Windows uninstaller or runs the Linux install script with
  `--uninstall`
- **THEN** GoMarkEdit is no longer listed under Open With for any of the four suffixes or for folders

### Requirement: Opening from the operating system

WHEN the operating system or the command line passes a path to GoMarkEdit, the system SHALL open a folder as the
workspace and any other path as a document, with the same checks and refusal messages as Open File. A window SHALL open
at most one such path: the first one that reaches it before it has finished starting up. Every other path
SHALL open in a new, independent window, one window per path, whatever the existing windows show.

#### Scenario: Open a file into a starting window

- **WHEN** GoMarkEdit is not running and the user opens `notes.md` with GoMarkEdit from the file manager
- **THEN** one window opens and shows `notes.md` in place of the empty Untitled document

#### Scenario: Started from its icon

- **WHEN** the user starts GoMarkEdit from its icon, its window shows the empty Untitled document, and the user then
  double-clicks `notes.md` with GoMarkEdit as the default application for `.md`
- **THEN** a new window opens and shows `notes.md`
- **AND** the first window still shows only its empty Untitled document

#### Scenario: Double-click while running

- **WHEN** a GoMarkEdit window shows `a.md` and the user double-clicks `b.md` in the file manager with GoMarkEdit as
  the default application for `.md`
- **THEN** a new window opens and shows only `b.md`
- **AND** the first window still shows only `a.md`

#### Scenario: Several files at once

- **WHEN** GoMarkEdit is not running and the user selects `a.md`, `b.md` and `c.md` in the file manager and opens them
  with GoMarkEdit
- **THEN** three windows open, each showing exactly one of the three files

#### Scenario: Unsupported file

- **WHEN** GoMarkEdit is not running and the user opens `server.log` with GoMarkEdit from the file manager
- **THEN** the window opens with its empty Untitled document and shows "The selected file type is not supported."

#### Scenario: New window cannot be started

- **WHEN** a GoMarkEdit window shows `a.md`, the user opens `b.md` with GoMarkEdit from the file manager and the new
  process cannot be started
- **THEN** the window that shows `a.md` reports "A new window could not be opened." and still shows only `a.md`

### Requirement: Command-line arguments

WHEN GoMarkEdit is started with arguments, the system SHALL use only the first argument that does not start with `-`
as the path to open, as described in "Opening from the operating system", and SHALL ignore every other argument.
Without such an argument the window SHALL start as it does without arguments.

#### Scenario: File argument

- **WHEN** the application is started with `notes.md` as its argument
- **THEN** the window shows `notes.md`

#### Scenario: Startup folder

- **WHEN** the application is started with an existing directory as its first argument
- **THEN** that directory opens as the workspace

#### Scenario: Flags are ignored

- **WHEN** the application is started with the arguments `-psn_0_12345` and `notes.md`
- **THEN** the window shows `notes.md`

#### Scenario: Only the first path counts

- **WHEN** the application is started with the arguments `a.md` and `b.md`
- **THEN** the window shows only `a.md` and no other window opens

#### Scenario: Missing file

- **WHEN** the application is started with `missing.md`, which does not exist
- **THEN** the window starts with its empty Untitled document and shows "The file no longer exists."

### Requirement: Folder open from the operating system

WHERE the operating system offers it, the user SHALL be able to open a folder in GoMarkEdit from the file manager: on
Windows with "Open with GoMarkEdit" in the context menu of a folder and of a folder's empty background, on Linux with
Open With for folders, and on macOS by dropping the folder on GoMarkEdit's Dock or application icon. The folder SHALL
open as described in "Opening from the operating system".

#### Scenario: Windows folder menu

- **WHEN** the user right-clicks `C:\notes` in Explorer and chooses "Open with GoMarkEdit"
- **THEN** a GoMarkEdit window opens with `notes` as its workspace

#### Scenario: Windows folder background menu

- **WHEN** the user right-clicks the empty area of the open `C:\notes` folder in Explorer and chooses "Open with
  GoMarkEdit"
- **THEN** a GoMarkEdit window opens with `notes` as its workspace

#### Scenario: Folder dropped on the macOS Dock icon

- **WHEN** a GoMarkEdit window shows `a.md` and the user drops the folder `~/notes` on GoMarkEdit's Dock icon
- **THEN** a new window opens with `notes` as its workspace
- **AND** the first window still shows `a.md` without a workspace

#### Scenario: Folders still open in the file manager

- **WHEN** the file manager is the default for folders, GoMarkEdit has been installed on Linux and the user
  double-clicks a folder in the file manager
- **THEN** the file manager opens the folder and GoMarkEdit does not start
