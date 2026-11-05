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

#### Scenario: Bytes change while filesystem metadata is preserved

- **WHEN** another program replaces the bytes of "notes.md" but preserves its size, modification time, permissions and file identity, and GoMarkEdit checks the file
- **THEN** the changed bytes are detected and the comparison dialog appears

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

### Requirement: Conflict queue

The system SHALL retain each pending conflict with its document identity and present at most one comparison at a time. A close-owned conflict SHALL be shown before a write-owned conflict, which SHALL be shown before a foreground conflict; conflicts at the same priority SHALL follow open-tab order. A conflict for a document that is no longer open SHALL be dropped. Resolving a prompt SHALL recheck deferred comparisons before showing them.

#### Scenario: Close, write and foreground conflicts are pending

- **WHEN** a close-owned conflict, a write-owned conflict and a focus-check conflict are pending together
- **THEN** the close-owned comparison is shown first, then the write-owned comparison, then the focus-check comparison

#### Scenario: Close and focus conflicts together

- **WHEN** a conflict from closing a tab and one from a focus check are both pending
- **THEN** the closing conflict is shown first

#### Scenario: Foreground conflicts use tab order

- **WHEN** foreground checks detect conflicts for "two.md" and "three.md" in that order, while the open-tab order is "one.md", "two.md", "three.md"
- **THEN** "two.md" is shown before "three.md"

#### Scenario: Closed queued document

- **WHEN** "two.md" has a queued conflict, its tab closes, and "three.md" has another queued conflict
- **THEN** the conflict for "two.md" is discarded and "three.md" is shown next

#### Scenario: Closing the selected tab activates a changed next tab

- **WHEN** closing the active tab activates "two.md" and an activation check finds that "two.md" changed on disk
- **THEN** the comparison for "two.md" is routed to the external-conflict prompt and the active editor remains associated with "two.md"

## ADDED Requirements

### Requirement: Reload is not undone by a later write

WHEN the user chooses Reload from disk, the system SHALL treat the reloaded text as the document's content for every
later write. Moving focus, switching tabs, closing the tab, saving or autosaving before the user types SHALL NOT write
the text the document held before the reload.

#### Scenario: Tab switch after reload with autosave on

- **WHEN** Autosave is on, "notes.md" holds unsaved text "mine", another program writes "theirs" to the file, the
  user chooses Reload from disk, switches to another tab and back, and waits two seconds
- **THEN** the file on disk contains "theirs", the editor shows "theirs" and the tab is not marked modified

#### Scenario: Reload a background tab

- **WHEN** "one.md" is active, "two.md" has a pending comparison, and the user reloads "two.md" from disk
- **THEN** "two.md" adopts the reloaded bytes while "one.md" keeps its active editor text and activation remains valid

#### Scenario: Save right after reload

- **WHEN** the user chooses Reload from disk and presses Save before typing
- **THEN** the file on disk keeps the reloaded bytes

### Requirement: Keep mine together with line-ending normalization

WHEN the user accepts normalization for mixed endings and chooses Keep mine for a conflict, the next Save, Save As
or close-prompt save SHALL write the normalized text once without asking again. Skip or an edit SHALL require renewed
normalization consent. A conflict for a different disk version SHALL discard Keep mine; rechecking the same version
SHALL preserve it.

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
- **THEN** normalization must be accepted again before the comparison reappears, and no file is written

#### Scenario: Keep mine from an earlier conflict

- **WHEN** the user chose Keep mine, the file then changes on disk again and the user saves
- **THEN** the comparison appears for the new disk content and nothing is written

### Requirement: Conflict tab remains legible

WHEN a tab is blocked by an external change, its visible conflict label, filename and close control SHALL remain distinct and usable within the available tab width.

#### Scenario: Inactive conflicted tab in a narrow window

- **WHEN** an inactive file changes externally in a narrow window
- **THEN** its conflict label does not overlap the filename or close control
