# Spec Delta

## MODIFIED Requirements

### Requirement: Opening from the operating system

WHEN the operating system or the command line passes a path to GoMarkEdit, the system SHALL open a folder as the
workspace and any other path as a document, with the same checks and refusal messages as Open File. A window SHALL open
at most one such path: the first one that reaches it before it has finished starting up. Every other path
SHALL open in a new, independent window, one window per path, whatever the existing windows show.

#### Scenario: Open a file into a starting window

- **WHEN** GoMarkEdit is not running and the user opens `notes.md` with GoMarkEdit from the file manager
- **THEN** one window opens and shows `notes.md` as its only tab, without a sidebar

#### Scenario: Started from its icon

- **WHEN** the user starts GoMarkEdit from its icon, its window shows the launcher with no tab, and the user then
  double-clicks `notes.md` with GoMarkEdit as the default application for `.md`
- **THEN** a new window opens and shows `notes.md`
- **AND** the first window still shows only its launcher

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
- **THEN** the window opens with the launcher and no tab and shows "The selected file type is not supported."

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
- **THEN** the window starts with the launcher and no tab and shows "The file no longer exists."
