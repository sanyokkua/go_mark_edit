## MODIFIED Requirements

### Requirement: Reading mode on open

WHEN the default open mode is Reading (Viewer) and a file is opened from disk through the Open dialog, Open Recent,
the launcher's Recent list, Reopen Last, the workspace tree, a preview link, drag and drop, the operating system (Open
With, double-click) or a command-line argument, including into a window that shows the launcher, the system SHALL show
that document in Reading mode. A file created with New File in the workspace tree SHALL open without Reading mode and
SHALL leave it if active. Opening a file SHALL NOT otherwise change whether Reading mode is active.

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

#### Scenario: Opened from the operating system

- **WHEN** the default open mode is Reading (Viewer), a GoMarkEdit window shows `a.md` and the user double-clicks
  `notes.md` in the file manager
- **THEN** a new window opens and shows `notes.md` in Reading mode

#### Scenario: Command-line argument

- **WHEN** the default open mode is Reading (Viewer) and the application is started with `notes.md` as its argument
- **THEN** the window shows `notes.md` in Reading mode

#### Scenario: Folder argument

- **WHEN** the default open mode is Reading (Viewer) and the application is started with a folder as its argument
- **THEN** the folder opens as the workspace and Reading mode is not entered
