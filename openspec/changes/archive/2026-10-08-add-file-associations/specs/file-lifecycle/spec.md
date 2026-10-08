## MODIFIED Requirements

### Requirement: Supported file types

The system SHALL open only files with the extension .md, .markdown, .mdown or .txt (case-insensitive) and SHALL refuse any other file, or a path that does not exist, without changing open documents. This SHALL also apply to a file the operating system passes to GoMarkEdit, for example one chosen with Open With.

#### Scenario: Unsupported extension

- **WHEN** the user opens a file named "image.png"
- **THEN** the open is refused with a message that the file type is not supported
- **AND** no tab is added

#### Scenario: Unsupported file chosen with Open With

- **WHEN** on Linux the user chooses GoMarkEdit under Open With for the plain-text file "server.log"
- **THEN** the window shows "The selected file type is not supported."
- **AND** no tab is added for "server.log"

### Requirement: Open a document

WHEN the user opens a file (Open dialog, Recent Items, folder tree, the operating system's Open With or double-click, a command-line argument, drag-and-drop or preview link), the system SHALL read it once, show it in a new active tab and add it to Recent Items. IF the only open tab is an untouched empty Untitled document, THEN the new document SHALL take its place.

#### Scenario: Open replaces untouched placeholder

- **WHEN** the window holds one empty, unmodified Untitled tab and the user opens "notes.md"
- **THEN** "notes.md" replaces that tab instead of adding a second one

#### Scenario: Cancelled dialog

- **WHEN** the user dismisses the Open dialog without choosing a file
- **THEN** nothing changes

#### Scenario: Opened from the operating system

- **WHEN** GoMarkEdit is not running and the user double-clicks "notes.md" with GoMarkEdit as the default application
  for `.md`
- **THEN** "notes.md" is shown in the window's only tab and is first in Recent Items
