# Spec Delta

## MODIFIED Requirements

### Requirement: Byte-preserving encoding

The system SHALL read and write UTF-8 and SHALL preserve a leading byte-order mark and the file's line-ending style (LF or CRLF) on save. A file without any line break SHALL stay unterminated until the user adds a line break, after which new breaks are LF. WHEN a file contains mixed LF and CRLF endings, Save SHALL ask whether to normalize every ending before writing and SHALL write nothing if the user cancels.

#### Scenario: CRLF round trip

- **WHEN** the user edits and saves a CRLF file with a BOM
- **THEN** the saved file still uses CRLF endings and starts with the BOM

#### Scenario: Mixed endings

- **WHEN** the user saves a file with mixed endings
- **THEN** a "Normalize line endings?" prompt appears before any write

#### Scenario: BOM kept after Save As

- **WHEN** the user opens a file that starts with a BOM, saves it with Save As as "copy.md", edits it and saves again
- **THEN** "copy.md" still starts with the bytes EF BB BF and the status bar reports a BOM

### Requirement: Autosave

WHERE the Autosave setting is on, the system SHALL save an existing, writable, non-deleted file one second after the last edit, with the same atomic and disk-change checks as a manual save. Autosave SHALL NOT apply to untitled or read-only documents, or to documents with mixed line endings, and SHALL NOT add Recent Items. A pending autosave SHALL be completed when the document is closed.

#### Scenario: Debounced save

- **WHEN** Autosave is on and the user stops typing in a saved file for one second
- **THEN** the file on disk contains the edit and the tab is no longer modified

#### Scenario: Untitled document

- **WHEN** Autosave is on and the user types in an Untitled document
- **THEN** nothing is written

#### Scenario: Mixed endings wait for the user

- **WHEN** Autosave is on, the user edits a file with mixed endings, presses Save and leaves the "Normalize line
  endings?" prompt open for three seconds before confirming
- **THEN** nothing is written before the confirmation, and confirming writes the file without asking again

## ADDED Requirements

### Requirement: Write-protected files

The system SHALL open a file whose owner has no write permission read-only, with the reason "The file is
write-protected.", and SHALL NOT save, autosave or overwrite it. Save As to another path SHALL remain available.
Reload from disk SHALL re-check the permission.

#### Scenario: Read-only file mode

- **WHEN** the user opens "locked.md" whose mode is 0444 and types in the editor
- **THEN** the editor does not accept the edit, Save is unavailable and the file is unchanged after two seconds

#### Scenario: Permission restored

- **WHEN** the user makes "locked.md" writable in another program and chooses Reload from disk after the change is
  detected
- **THEN** the document becomes writable

### Requirement: Permissions of new files

WHEN a save creates a file that did not exist (Save As to a new path, the first save of an untitled document, or
Save after the file was deleted), the system SHALL give it the permissions a newly created file normally has: read and
write for the owner and read for everyone else (0644), reduced by the user's file-creation mask.

#### Scenario: Save As to a new path

- **WHEN** the user saves an Untitled document as "new.md" on macOS or Linux with a file-creation mask of 022
- **THEN** "new.md" has mode 0644

#### Scenario: Recreated file

- **WHEN** "notes.md" is deleted outside the app and the user saves its tab with a file-creation mask of 022
- **THEN** the recreated "notes.md" has mode 0644

### Requirement: Save outcome reporting

WHEN a save writes the file but something that accompanies it fails (adding the Recent Item, storing the view state,
or confirming the write reached the disk), the system SHALL keep the document saved and show a warning naming what
failed. WHEN the text cannot be encoded for writing, the system SHALL report the reason without offering Retry.

#### Scenario: Recent Items cannot be stored

- **WHEN** the user saves "notes.md" and the settings store refuses the Recent Items update
- **THEN** the file is written, the tab is not marked modified, and a warning says Recent Items could not be updated

#### Scenario: Unencodable text

- **WHEN** the text contains a NUL character and the user saves
- **THEN** nothing is written and an error explains that the text cannot be saved, with no Retry action

### Requirement: Editor changes that cannot be delivered

IF the editor's text cannot be handed to the application for storing, THEN the system SHALL keep the text in the
editor, retry at the next edit, focus change or save, and show one error notification until a later delivery
succeeds.

#### Scenario: Delivery fails

- **WHEN** the application rejects two consecutive editor updates for "notes.md"
- **THEN** one error notification is shown and the text in the editor is unchanged
