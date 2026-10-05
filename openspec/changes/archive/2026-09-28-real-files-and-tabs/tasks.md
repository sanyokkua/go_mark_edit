# Tasks

> Reconstructed after the fact from the specification and the delivered code; the original task list was not kept in this form.

## 1. File open and classification

- [x] 1.1 File ports: native dialogs, path canonicalization, disk version, bounded document reader and codec
- [x] 1.2 New and Open commands with suffix check, size limits, read-only classification and duplicate focus
- [x] 1.3 Default open mode and per-file arrangement applied on open

## 2. Safe writes

- [x] 2.1 Atomic replace for Unix and Windows with permission preservation
- [x] 2.2 Write coordinator shared by Save, Save As, autosave and close-save
- [x] 2.3 Line ending, BOM and mixed-ending normalization handling
- [x] 2.4 Autosave with one-second debounce and settings toggle

## 3. Tabs

- [x] 3.1 Ordered tab set (limit 40) with revisioned commands
- [x] 3.2 Tab strip with dirty state, disambiguation, overflow, menu and reorder
- [x] 3.3 Recently closed history and reopen of last closed tab

## 4. Close protection

- [x] 4.1 Close plan: prepare, resolve and execute for single and multiple targets
- [x] 4.2 Save, discard and cancel prompts for tab close, close others, window close and quit
- [x] 4.3 Native close and shutdown coordination

## 5. External changes

- [x] 5.1 Foreground disk checks with stable re-read and metadata-only refresh
- [x] 5.2 Conflict prompt with Reload from disk, Keep mine and Skip, with bounded previews
- [x] 5.3 Conflict queue and blocked-tab indication; detached document handling

## 6. Launcher and recents

- [x] 6.1 SQLite-backed recent files list (up to six) with lazy validation
- [x] 6.2 Launcher shown with no open tabs, plus File menu recents

## 7. Verification

- [x] 7.1 Go tests for reader, atomic replace, write coordination, close plans and conflicts
- [x] 7.2 End-to-end tests for real files, launcher and startup/close behaviour
