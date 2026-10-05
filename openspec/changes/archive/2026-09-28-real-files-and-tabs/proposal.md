# Proposal

## Why

Until this change the editor worked on in-memory text only. Users need to open, edit and save real Markdown files without losing work: files must be written atomically, unsaved work must be protected on close, and changes made to a file by another program must be detected rather than silently overwritten.

## What Changes

- New, Open, Save and Save As, with native dialogs and a backend-owned file lifecycle.
- Safe writes: same-directory temporary file and atomic replace, preserving line endings, BOM and permissions.
- Real document tabs (up to 40) with identity-safe duplicates, reordering, tab menu, overflow and reopen of last closed tab.
- Dirty-document protection on close, close-others and quit, resolved as one plan.
- Autosave for saved files, one second after the last edit, with no success toast.
- External-change detection on tab activation, window focus and before each write, with Reload from disk, Keep mine or Skip.
- Launcher shown when no tabs are open, with up to six recent files.
- Size and safety limits: files over 50 MiB are refused, files with invalid text or over 10 MiB open read-only, live preview pauses above 2 MiB.

## Capabilities

### New Capabilities

- `file-lifecycle`: new/open/save/save as, classification, recents, launcher
- `document-tabs`: ordered tabs, close plans, reopen closed tab
- `external-change-conflict`: disk-change detection, decision prompt, autosave interaction

### Modified Capabilities

- `app-shell`: launcher state and native close/shutdown coordination
- `actions-shortcuts`: file and tab actions, reopen-closed-tab binding
- `settings`: autosave setting

## Impact

Adds Go file I/O ports with platform-specific atomic replacement, a write coordinator, close-plan and conflict services, SQLite storage for recents and per-file view, and the tab strip, prompts and launcher in the frontend.
