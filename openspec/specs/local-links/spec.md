# local-links Specification

## Purpose

Defines the single link policy shared by the preview and the editor: which link targets open in the application, which open in the system browser, and which are refused with a visible notice.

## Requirements

### Requirement: One policy for preview and editor

The system SHALL apply the same outcome to a link whether it is activated by click in the preview or by Ctrl+click (Cmd+click on macOS) on an inline, reference-style or auto link in the editor, and a plain click in the editor SHALL only move the caret.

#### Scenario: Same result in both panes

- **WHEN** the same link text is activated in the preview and in the editor
- **THEN** both produce the same outcome

#### Scenario: Plain click in editor

- **WHEN** the user clicks a link in the editor without the modifier key
- **THEN** the caret moves and nothing opens

### Requirement: In-document anchors

The system SHALL scroll the preview to the matching heading when a `#fragment` link is activated in the preview, and SHALL place the caret on that heading's line when it is activated in the editor, or on line 1 when no heading matches.

#### Scenario: Anchor in preview

- **WHEN** the user clicks `[Setup](#setup)`
- **THEN** the preview scrolls to the heading with anchor `setup`

### Requirement: Local documents open in a tab

The system SHALL open a link to a supported local document (`.md`, `.markdown`, `.mdown`, `.txt`) anywhere on the local disk in a tab, resolving percent-encoding, `./` and `../` and symbolic links, focusing the tab if the document is already open, and keeping the outgoing document's latest edits.

#### Scenario: Relative link

- **WHEN** the user activates `[Guide](../docs/guide.md)` in a saved document
- **THEN** guide.md becomes the active tab

#### Scenario: Already open

- **WHEN** the target document already has a tab
- **THEN** that tab is focused and no duplicate opens

#### Scenario: Link with fragment

- **WHEN** the link is `guide.md#install` and the target has a heading "Install"
- **THEN** the target opens at that heading, and at its top if no heading matches

### Requirement: Untitled documents

WHILE the linking document is untitled, the system SHALL refuse relative local links with a notice that relative links need a saved document, and SHALL still handle absolute local paths and http or https links.

#### Scenario: Relative link in untitled document

- **WHEN** the user activates `notes.md` in an untitled document
- **THEN** a notice says relative links need a saved document and nothing opens

### Requirement: External web links

The system SHALL open `http` and `https` links in the system browser and SHALL NOT load them inside the application.

#### Scenario: Web link

- **WHEN** the user activates `https://example.com`
- **THEN** the default browser opens that address

### Requirement: Network and device paths refused

The system SHALL read nothing from a link target that is a UNC path (with forward or back slashes), a device-namespace path or any other network path, on every operating system, and SHALL show a refusal notice naming the target.

#### Scenario: UNC path

- **WHEN** the user activates `//server/share/a.md`
- **THEN** no file access occurs and a refusal notice appears

### Requirement: Unsupported files

IF a local link resolves to an existing file that is not a supported document, THEN the system SHALL open nothing, launch no other program, and show a notice naming the file with a "Reveal in file manager" action that shows it in the operating system's file manager.

#### Scenario: PDF link

- **WHEN** the user activates a link to `report.pdf`
- **THEN** a notice offers Reveal in file manager and the PDF is not opened

### Requirement: Unreadable or over-limit targets

IF a local link target does not exist, cannot be read, is a folder, is larger than 50 MiB or would exceed the 40-document limit, THEN the system SHALL open no tab and show the same notice the Open command shows for that condition.

#### Scenario: Missing file

- **WHEN** the user activates a link to a file that does not exist
- **THEN** a "file no longer exists" style notice names the file and no tab opens

### Requirement: Other schemes refused

The system SHALL refuse every other scheme, including `file:`, `mailto:` and `javascript:`, as well as empty and malformed targets, with a visible notice that names the target and the reason.

#### Scenario: file scheme

- **WHEN** the user activates `file:///etc/hosts`
- **THEN** a notice names the target and says the scheme is not supported

### Requirement: Windows path spellings

On Windows the system SHALL accept back-slash separators and drive-letter paths in local link targets and resolve them to the same target as the forward-slash form.

#### Scenario: Back slashes

- **WHEN** a link is `docs\guide.md`
- **THEN** it opens the same file as `docs/guide.md`
