# external-change-conflict Specification

## Purpose

Defines how GoMarkEdit notices that an open file was changed or deleted outside the application and how the user decides between the file on disk and their own copy, so that no external edit is overwritten or discarded silently.

## Requirements

### Requirement: When disk changes are detected

The system SHALL compare each open file with its last known disk state only at explicit moments: when the application window regains focus (all open files, in tab order), when a tab is activated, and immediately before every save and autosave. It SHALL NOT watch the file system or poll in the background.

#### Scenario: Window regains focus

- **WHEN** a file is edited in another program and the user returns to GoMarkEdit
- **THEN** the change is detected during that focus event

#### Scenario: No background polling

- **WHEN** a file changes on disk while the window stays focused and no save or tab switch happens
- **THEN** nothing is detected or shown yet

### Requirement: What counts as a change

The system SHALL treat a file as changed only when its bytes or its encoding, BOM or line-ending characteristics differ from the last loaded or saved state; a modification time change with identical bytes SHALL NOT raise a conflict. A change SHALL raise a conflict whether or not the document has unsaved edits. IF the file is being modified while it is read, THEN the system SHALL report that the file is changing and ask the user to check again.

#### Scenario: Touched file

- **WHEN** a file's timestamp changes but its bytes do not
- **THEN** no dialog appears

### Requirement: Deleted file

IF an open file no longer exists on disk, THEN the system SHALL keep its content, mark the document modified, and show no comparison. The user can recreate the file with Save.

#### Scenario: File removed

- **WHEN** a file is deleted outside the app and the window regains focus
- **THEN** the tab stays open and becomes modified

### Requirement: Conflict blocks writing

WHILE a document has an unresolved conflict, the system SHALL refuse to write it and SHALL mark its tab "Blocked by conflict". A save attempted against a changed file SHALL open the same comparison with the message that the file changed on disk before it could be saved.

#### Scenario: Save over external edit

- **WHEN** the user saves a file whose disk bytes changed since it was loaded
- **THEN** the file is not written and the comparison dialog opens

### Requirement: Conflict queue

The system SHALL track a pending conflict per document, mark each affected tab, and present one dialog at a time, taking documents in tab order. It SHALL prefer a conflict raised while closing, then one raised by a save, then one found by a focus or tab-activation check. A conflict for a document that is no longer open SHALL be dropped.

#### Scenario: Close and focus conflicts together

- **WHEN** a conflict from closing a tab and one from a focus check are both pending
- **THEN** the closing conflict is shown first

### Requirement: Comparison dialog

The system SHALL show a dialog titled "File changed on disk" naming the file, with a section "File characteristics changed" when encoding, BOM or line endings differ, and a complete, read-only side-by-side comparison of the full text labelled "On disk" and "Yours". The comparison SHALL show every change in the whole file with line numbers and whitespace differences, SHALL offer Previous change and Next change, and SHALL be omitted when the two texts are identical.

#### Scenario: Distant changes

- **WHEN** the file differs from the user's copy at line 3 and line 4,000
- **THEN** both changes are highlighted and reachable with Next change

### Requirement: Comparison statistics

Each side SHALL show its line count (one plus the number of line feeds, so an empty text is 1 line) and its size in bytes. "On disk" SHALL be the file's physical size, including any BOM and CRLF endings. "Yours" SHALL be labelled "size when saved" and be the size the file would have if saved now with its current encoding. IF that size cannot be known, THEN the dialog SHALL say why: line-ending normalization is required, the encoding is unsupported, or the content cannot be safely encoded.

#### Scenario: CRLF file

- **WHEN** the on-disk file has 10 CRLF-terminated lines of 5 characters each
- **THEN** the On disk size counts the extra carriage return byte on every line

#### Scenario: Mixed endings

- **WHEN** the user's copy has mixed line endings
- **THEN** Yours shows "size unavailable: line ending normalization is required"

### Requirement: Comparison limits

The system SHALL stop computing highlights after five seconds and then SHALL say that highlighting may be incomplete while keeping both complete texts scrollable. IF highlighting is unavailable, THEN the dialog SHALL say so and still show the complete text.

#### Scenario: Very different large files

- **WHEN** highlighting takes longer than five seconds
- **THEN** an incomplete-highlighting notice appears and both texts remain readable

### Requirement: Choices for a writable document

For a writable document the dialog SHALL offer Reload from disk, Keep mine and Skip, with Skip focused first; clicking outside or pressing Escape SHALL choose Skip. Reload SHALL replace the editor content with the file's current content, discard unsaved edits, adopt its encoding and mark the document clean. Keep mine SHALL allow the next write once to replace the changed file. Skip SHALL change neither file nor content, and the same comparison SHALL appear again at the next check or save.

#### Scenario: Reload

- **WHEN** the user chooses Reload from disk
- **THEN** the tab shows the disk content, is no longer modified, and its conflict label disappears

#### Scenario: Keep mine

- **WHEN** the user chooses Keep mine and saves
- **THEN** the file on disk contains the user's text

### Requirement: Choices for a read-only document

For a read-only document the dialog SHALL offer only Reload from disk and Cancel, with Cancel focused first and dismissal choosing Cancel. Keep mine and Skip SHALL NOT be offered, because such documents are never written.

#### Scenario: Read-only large file

- **WHEN** a read-only file changes on disk
- **THEN** the dialog shows Reload from disk and Cancel only

### Requirement: Stale decisions are refused

WHEN the user edits the document after the comparison was made, the system SHALL tell the user the comparison is no longer current and disable Keep mine until the comparison is refreshed. IF the file changed again after the comparison, THEN any decision SHALL be refused with "The file changed again; refresh the comparison." and the comparison SHALL be rebuilt.

#### Scenario: Edit while dialog is open

- **WHEN** the document is edited while the dialog is open
- **THEN** Keep mine is disabled and an out-of-date notice is shown
