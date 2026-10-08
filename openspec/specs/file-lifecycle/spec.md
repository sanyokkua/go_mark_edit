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

The system SHALL refuse a file larger than 50 MiB. A file larger than 10 MiB (10,485,760 bytes) up to 50 MiB SHALL open read-only. A file that is not valid UTF-8, contains a NUL byte, or contains a lone carriage return SHALL open read-only with invalid sequences shown as replacement characters. Read-only documents SHALL NOT be saved, autosaved or overwritten.

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

WHERE the Autosave setting is on, the system SHALL save an existing, writable, non-deleted file one second after the last edit, with the same atomic and disk-change checks as a manual save. Autosave SHALL NOT apply to untitled or read-only documents and SHALL NOT add Recent Items. A pending autosave SHALL be completed when the document is closed.

#### Scenario: Debounced save

- **WHEN** Autosave is on and the user stops typing in a saved file for one second
- **THEN** the file on disk contains the edit and the tab is no longer modified

#### Scenario: Untitled document

- **WHEN** Autosave is on and the user types in an Untitled document
- **THEN** nothing is written

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
