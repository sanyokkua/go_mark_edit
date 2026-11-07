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

### Requirement: Choices for a writable document

For a writable document the dialog SHALL offer Reload from disk, Keep mine and Skip, with Skip focused first; clicking outside or pressing Escape SHALL choose Skip. Reload SHALL replace the editor content with the file's current content, discard unsaved edits, adopt its encoding and mark the document clean. Keep mine, chosen in a comparison that a Save, Save As or close-prompt save is waiting on, SHALL let that write replace the compared version of the file, and only while the file still has that version when the write runs. The compared version SHALL become the document's known disk state only when that write commits: a write that is cancelled, refused or fails SHALL leave the external version undecided, so a later Save or autosave does not overwrite it without a new decision. Keep mine, chosen in a comparison found by a window-focus or tab-activation check, SHALL only dismiss that comparison; it writes nothing and is not remembered, so the next Save compares again. Skip SHALL change neither file nor content, and the same comparison SHALL appear again at the next check or save.

#### Scenario: Reload

- **WHEN** the user chooses Reload from disk
- **THEN** the tab shows the disk content, is no longer modified, and its conflict label disappears

#### Scenario: Keep mine

- **WHEN** the user edits "notes.md", another program changes the file, the user presses Save and chooses Keep mine
  in the comparison
- **THEN** the file on disk contains the user's text and the tab is not marked modified

#### Scenario: Keep mine from a focus check

- **WHEN** another program changes "notes.md" while it is open, the window regains focus, the user chooses Keep mine
  and then presses Save
- **THEN** the dialog closes without writing and the file on disk still has the other program's text; after Save the
  comparison appears again

#### Scenario: Failed write after Keep mine

- **WHEN** the user presses Save, chooses Keep mine, and the replacement fails because the folder is not writable
- **THEN** the file on disk keeps the other program's text, and the next Save or autosave shows the comparison
  instead of overwriting it

#### Scenario: Cancelled close after Keep mine

- **WHEN** the user closes a modified tab, chooses Save, chooses Keep mine in the comparison and then cancels the
  close before anything is written
- **THEN** the file on disk is unchanged and a later Save shows the comparison again

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
  "Normalize line endings?" and chooses Keep mine in the comparison
- **THEN** the file on disk contains the user's text with one line-ending style, no second prompt appears and the tab
  is not marked modified

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

### Requirement: Save As onto the document's own file

WHEN the user chooses Save As and selects the file the document is already tied to, by its path or by a symbolic or hard link to it, the system SHALL compare that file with the version the document loaded, not with the file as it is after the dialogs close. A file that changed in the meantime SHALL produce the comparison and SHALL NOT be overwritten; a modification time change with identical bytes SHALL NOT raise a conflict.

#### Scenario: External edit while the Save As dialog is open

- **WHEN** "notes.md" has unsaved edits, the user chooses Save As, another program writes "external" to "notes.md"
  while the dialog is open, and the user selects "notes.md" (or a hard or symbolic link to it)
- **THEN** the comparison with "external" appears and "notes.md" still contains "external"

#### Scenario: Touched while the Save As dialog is open

- **WHEN** another program only changes the timestamp of "notes.md" while the Save As dialog is open and the user
  selects "notes.md"
- **THEN** no dialog appears and "notes.md" contains the user's text

### Requirement: Conflict found during replacement

IF the document's file changes after the save's disk check and before the replacement, THEN the system SHALL check the file again before reporting the result. Different bytes SHALL produce the ordinary comparison, mark the tab as blocked by a conflict and write nothing; identical bytes (a timestamp-only change) SHALL be saved without a dialog.

#### Scenario: External edit during replacement

- **WHEN** another program writes "external" to "notes.md" after the save's disk check and before the replacement
- **THEN** the comparison of the user's text with "external" appears, the tab is marked as blocked by a conflict
  and "notes.md" still contains "external"

#### Scenario: Timestamp change during replacement

- **WHEN** another program only changes the timestamp of "notes.md" at that moment
- **THEN** the save completes without a dialog and "notes.md" contains the user's text

### Requirement: The application's own save is not an external change

A check for external changes that runs while the application is saving the same document SHALL wait for that save to finish and then compare the file with the saved state; it SHALL NOT report the application's own bytes as an external change.

#### Scenario: Focus check during a save

- **WHEN** the window regains focus at the moment "notes.md" is being saved
- **THEN** no dialog appears and the tab is not marked as blocked by a conflict

### Requirement: Conflict tab remains legible

WHEN a tab is blocked by an external change, its visible conflict label, filename and close control SHALL remain distinct and usable within the available tab width.

#### Scenario: Inactive conflicted tab in a narrow window

- **WHEN** an inactive file changes externally in a narrow window
- **THEN** its conflict label does not overlap the filename or close control
