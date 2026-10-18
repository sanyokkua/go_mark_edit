# Spec Delta

## MODIFIED Requirements

### Requirement: What counts as a change

The system SHALL treat a file as changed only when its bytes, its encoding, BOM or line-ending characteristics, or its permissions differ from the last loaded or saved state; a modification time change with identical bytes SHALL NOT raise a conflict. A change SHALL raise a conflict whether or not the document has unsaved edits. IF the file is being modified while it is read, THEN the system SHALL report that the file is changing and ask the user to check again.

#### Scenario: Touched file

- **WHEN** a file's timestamp changes but its bytes do not
- **THEN** no dialog appears

#### Scenario: Permissions changed

- **WHEN** "notes.md" is open and another program removes its owner-write permission without changing its bytes, and
  the window regains focus
- **THEN** the external-change dialog appears and reports the permission change

#### Scenario: Touched after a save

- **WHEN** the user edits and saves "notes.md" (LF endings), another program rewrites the same bytes so only the
  timestamp changes, and the window regains focus
- **THEN** no dialog appears and the tab is not marked "Blocked by conflict"

#### Scenario: Touched after saving an untitled document without a line break

- **WHEN** the user saves an Untitled document containing only "hello" as "hello.md", the file's timestamp changes,
  and the window regains focus
- **THEN** no dialog appears

### Requirement: Choices for a read-only document

For a read-only document, or when the changed file on disk is write-protected, the dialog SHALL offer only Reload from disk and Cancel, with Cancel focused first and dismissal choosing Cancel. Keep mine and Skip SHALL NOT be offered, because such documents are never written.

#### Scenario: Read-only large file

- **WHEN** a read-only file changes on disk
- **THEN** the dialog shows Reload from disk and Cancel only

#### Scenario: File became write-protected

- **WHEN** "notes.md" is open and writable, another program removes its owner-write permission, and the window
  regains focus
- **THEN** the dialog shows Reload from disk and Cancel only, and choosing Reload from disk opens the document
  read-only with the reason "The file is write-protected."

#### Scenario: Unsaved edits when the file became write-protected

- **WHEN** "notes.md" has unsaved edits, another program removes its owner-write permission, the user chooses Cancel
  in the dialog and then Save As "copy.md"
- **THEN** "copy.md" contains the user's text, "notes.md" is unchanged, and the tab becomes "copy.md" and accepts edits

## ADDED Requirements

### Requirement: Reload is not undone by a later write

WHEN the user chooses Reload from disk, the system SHALL treat the reloaded text as the document's content for every
later write. Moving focus, switching tabs, closing the tab, saving or autosaving before the user types SHALL NOT write
the text the document held before the reload.

#### Scenario: Tab switch after reload with autosave on

- **WHEN** Autosave is on, "notes.md" holds unsaved text "mine", another program writes "theirs" to the file, the
  user chooses Reload from disk, switches to another tab and back, and waits two seconds
- **THEN** the file on disk contains "theirs", the editor shows "theirs" and the tab is not marked modified

#### Scenario: Save right after reload

- **WHEN** the user chooses Reload from disk and presses Save before typing
- **THEN** the file on disk keeps the reloaded bytes

### Requirement: Keep mine together with line-ending normalization

WHEN a document with mixed line endings has an unresolved conflict, the user has accepted "Normalize line endings?"
for the current text and then chooses Keep mine, the next Save, Save As or save from the close prompt SHALL write the
normalized text once without asking again. Choosing Skip, or editing the text, SHALL require the normalization to be
accepted again. A Keep mine decision SHALL be discarded when a new conflict is raised for the document.

#### Scenario: Keep mine on a mixed-ending file

- **WHEN** "mixed.md" contains "a\r\nb\n", another program changes it, the user edits the tab, saves, accepts
  "Normalize line endings?", chooses Keep mine in the comparison and saves again
- **THEN** the file on disk contains the user's text with one line-ending style and the tab is not marked modified

#### Scenario: Close prompt with Keep mine on a mixed-ending file

- **WHEN** the same situation arises while closing the tab and the user chooses Save, accepts normalization and
  chooses Keep mine
- **THEN** the file is written once and the tab closes

#### Scenario: Skip asks again

- **WHEN** the user accepted normalization, chose Skip in the comparison and saves again
- **THEN** the comparison appears again and no file is written

#### Scenario: Keep mine from an earlier conflict

- **WHEN** the user chose Keep mine, the file then changes on disk again and the user saves
- **THEN** the comparison appears for the new disk content and nothing is written
