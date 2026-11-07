# file-lifecycle Specification

## Purpose

Defines how documents are created, opened, edited, saved and tracked as recent items, including how file bytes, encoding and permissions are preserved and which size and content limits apply. Markdown files on disk remain the source of truth.

## Requirements

### Requirement: New untitled document

WHEN the user creates a new file, the system SHALL add an empty "Untitled" document with no path as a new tab and activate it. Creating a document SHALL NOT create a file on disk or add a recent item.

#### Scenario: New document is in-memory only

- **WHEN** the user chooses New File
- **THEN** an empty Untitled tab becomes active
- **AND** no file is written and Recent Items is unchanged

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

### Requirement: Document limit

The system SHALL allow at most 40 open documents per window. WHEN a new or opened document would exceed the limit, the system SHALL refuse it with the message that the window already contains 40 documents, and New File and Open File SHALL be unavailable at the limit. Opening a file that is already open SHALL still focus its existing tab.

#### Scenario: Forty-first document

- **WHEN** 40 tabs are open and the user opens a 41st distinct file
- **THEN** the open is refused and the tab set is unchanged

### Requirement: File size and content limits

The system SHALL refuse a file larger than 50 MiB. A file larger than 10 MiB (10,485,760 bytes) up to 50 MiB SHALL open read-only. A file that is not valid UTF-8, contains a NUL byte, or contains a lone carriage return SHALL open read-only with invalid sequences shown as replacement characters. Read-only documents SHALL NOT be saved, autosaved or overwritten; Save As of a write-protected document to another path is defined in actions-shortcuts "Read-only documents".

#### Scenario: Over the maximum

- **WHEN** the user opens a 51 MiB file
- **THEN** the open is refused with "The document exceeds the 50 MiB limit."

#### Scenario: Large file

- **WHEN** the user opens a 20 MiB text file
- **THEN** it opens read-only and Save and Save As are unavailable

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

### Requirement: Dirty state

The system SHALL mark a document as modified WHEN its content differs from the last saved or loaded content, WHEN its file has been deleted from disk, WHEN its last write failed, or WHEN it is untitled with any content. The tab SHALL show this state until a save succeeds.

#### Scenario: Edit and revert

- **WHEN** the user types a character and then removes it again
- **THEN** the document is not marked modified

### Requirement: Save

WHEN the user saves a document that has a path and is writable, the system SHALL replace the file atomically: the content is written to a temporary file in the same folder, the original file's permissions are copied to it, and it replaces the target only if the target is unchanged since the last read or save. A failed save SHALL leave the original file intact and keep the document modified. WHEN the document is untitled, Save SHALL behave as Save As.

#### Scenario: Failed write keeps original

- **WHEN** the write fails partway
- **THEN** the original file bytes are unchanged and the document stays modified

#### Scenario: Permissions preserved

- **WHEN** the user saves a file whose mode is 0600
- **THEN** the saved file keeps mode 0600

### Requirement: Save As

WHEN the user chooses Save As, the system SHALL show a native save dialog and write the document to the chosen path, after which the same tab refers to the new file. The system SHALL ask for confirmation before overwriting an existing file, SHALL refuse a name without a supported extension, SHALL refuse a target that is already open in another tab, and SHALL refuse the save if the target changed after the user confirmed overwriting.

#### Scenario: Overwrite confirmation

- **WHEN** the user picks an existing file in Save As
- **THEN** an overwrite confirmation is shown and nothing is written until confirmed

#### Scenario: Target open elsewhere

- **WHEN** the user picks a path that another tab already has open
- **THEN** the save is refused with "The Save As target is already open."

### Requirement: Save a deleted file

IF an open document's file no longer exists on disk, THEN the system SHALL mark the document modified and offer Save to recreate the file at its original path. Reveal in file manager SHALL be unavailable for it; Copy path SHALL remain available.

#### Scenario: Recreate

- **WHEN** a file is deleted outside the app and the user saves its tab
- **THEN** the file is recreated at the same path with the tab content

### Requirement: Autosave

WHERE the Autosave setting is on, the system SHALL save an existing, writable, non-deleted file one second after the last edit, with the same atomic and disk-change checks as a manual save. Autosave SHALL NOT apply to untitled or read-only documents, or to documents with mixed line endings, and SHALL NOT add Recent Items. A pending autosave SHALL be completed when the document is closed, except during the recovery discard or unacknowledged ready-interface close decisions defined in app-shell.

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

### Requirement: Autosave when a document closes

Those decisions SHALL pause or discard scheduled autosaves as specified there; ordinary responsive close retains this completion behavior.

#### Scenario: Pending autosave at ordinary close

- **WHEN** a document with a pending autosave is closed in an ordinary responsive close
- **THEN** the autosave is completed first

### Requirement: Recent Items

The system SHALL keep one most-recent-first list of at most 10 files and folders, shared by all windows and persisted across launches. Opening or explicitly saving (Save or Save As) a file, or opening a folder, SHALL move that path to the top without duplicates. Clear Recent SHALL ask for confirmation and then empty the list. Choosing a recent entry SHALL open it; a missing entry SHALL report that it no longer exists.

#### Scenario: Eleventh item

- **WHEN** an 11th distinct file is opened
- **THEN** the oldest entry is dropped and the new one is first

### Requirement: Reopen Last

The system SHALL remember up to 40 recently closed files for the window, newest first. Reopen Last SHALL reopen the newest one from disk (discarded edits are not restored) and restore its saved view. WHEN no file was closed in this window, it SHALL open the newest Recent Item instead, opening a folder as a folder workspace. It SHALL be unavailable when there is nothing to reopen.

#### Scenario: Reopen after close

- **WHEN** the user closes "a.md" and chooses Reopen Last
- **THEN** "a.md" opens again with the content currently on disk

#### Scenario: Fresh window

- **WHEN** no tab was closed in the window and the newest Recent Item is a folder
- **THEN** Reopen Last opens that folder

### Requirement: Copy path and reveal

WHEN the user chooses Copy path on a document with a path, the system SHALL place its full path on the system clipboard. WHEN the user chooses Reveal in file manager, the system SHALL show the file in the operating system's file manager. Both SHALL be unavailable for an untitled document, and failures SHALL be reported with an option to retry.

#### Scenario: Untitled

- **WHEN** the active document has no path
- **THEN** Copy path and Reveal in file manager are unavailable

### Requirement: Write-protected files

The system SHALL open a file whose owner has no write permission read-only, with the reason "The file is
write-protected." shown wherever the read-only reason appears. Reload from disk SHALL re-check the permission. (Save As
availability for such a document is defined in actions-shortcuts "Read-only documents".)

#### Scenario: Read-only file mode

- **WHEN** the user opens "locked.md" whose mode is 0444 and types in the editor
- **THEN** the editor does not accept the edit, Save is unavailable and the file is unchanged after two seconds

#### Scenario: Permission restored

- **WHEN** "locked.md" is open read-only, another program makes it writable, the window regains focus and the user
  chooses Reload from disk in the external-change dialog
- **THEN** the document becomes writable and the write-protected reason disappears

### Requirement: Permissions of new files

WHEN a save creates a file that did not exist (Save As to a new path, the first save of an untitled document, or
Save after the file was deleted), the system SHALL give it read and write permission for the owner and read permission
for everyone else (0644), reduced by the user's file-creation mask.

#### Scenario: Save As to a new path

- **WHEN** the user saves an Untitled document as "new.md" on macOS or Linux with a file-creation mask of 022
- **THEN** "new.md" has mode 0644

#### Scenario: Permissive creation mask

- **WHEN** the user saves a new file on macOS or Linux with a file-creation mask of 000
- **THEN** the file has mode 0644

#### Scenario: Recreated file

- **WHEN** "notes.md" is deleted outside the app and the user saves its tab with a file-creation mask of 022
- **THEN** the recreated "notes.md" has mode 0644

### Requirement: A file that appears during creation is never replaced

WHEN a save creates a file that did not exist, the system SHALL NOT replace a file that another program creates at that path after the save's last check and before the write completes. The save SHALL write nothing, report a conflict and leave no temporary file beside the target.

#### Scenario: Another program creates the target first

- **WHEN** the user saves an Untitled document as "new.md", and another program creates "new.md" containing "other
  program" after the save checked that the path was free and before the write completes
- **THEN** "new.md" still contains "other program", the save reports a conflict and the folder holds no temporary
  file

### Requirement: Save outcome reporting

WHEN a committed save has an accompanying failure, the system SHALL keep the document saved and show one warning while
the window remains open. The warning SHALL identify the highest-priority failure: durability, Recent Items, then view
state. A committed-save warning SHALL NOT delay a successful Quit; the system does not guarantee that it is acknowledged
or visible before exit. Unencodable text SHALL be reported without offering Retry.

#### Scenario: Explicit save with an accompanying failure

- **WHEN** Save or Save As commits with an accompanying failure
- **THEN** one warning describes the failure and no separate success notification appears for that save

#### Scenario: Post-replacement check fails

- **WHEN** replacement commits but reading metadata, reading back the file, comparing its contents, or synchronizing its directory fails
- **THEN** the warning identifies the failed check and offers an appropriate next step without exposing raw system errors

#### Scenario: Recent Items cannot be stored

- **WHEN** the user saves "notes.md" and the settings store refuses the Recent Items update
- **THEN** the file is written, the tab is not marked modified, and a warning says Recent Items could not be updated

#### Scenario: Durability not confirmed

- **WHEN** the user saves "notes.md", the file is replaced, and confirming that the write reached the disk fails
- **THEN** the tab is not marked modified and a warning says the save could not be confirmed on disk

#### Scenario: Two accompanying failures

- **WHEN** a save is written and both the Recent Items update and the view-state update fail
- **THEN** one warning is shown, and it names Recent Items

#### Scenario: Durability and Recent Items both fail

- **WHEN** a save is written, confirming it reached the disk fails and the Recent Items update fails
- **THEN** one warning is shown, and it says the save could not be confirmed on disk

#### Scenario: Close-plan save warning

- **WHEN** a close-plan save commits and its Recent Items update fails
- **THEN** the close operation continues; while the window remains open, a warning says Recent Items could not be updated

#### Scenario: Quit continues after committed-save warning

- **WHEN** a successful Quit commits a close-plan save but confirming that the write reached the disk fails
- **THEN** Quit continues immediately without waiting for warning acknowledgement or visibility, and the warning may not be seen before exit

#### Scenario: Autosave durability warning

- **WHEN** an autosave replaces the file but confirming that the write reached the disk fails
- **THEN** the document is saved and a warning says the save could not be confirmed on disk

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

#### Scenario: Delivery recovers

- **WHEN** an editor update for "notes.md" was rejected and the user types again and the next update is accepted
- **THEN** the application holds the editor's full text and a later rejection shows a new error notification
