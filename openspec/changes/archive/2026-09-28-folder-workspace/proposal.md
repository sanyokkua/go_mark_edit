# Proposal

## Why

GoMarkEdit opened one file at a time. People who keep notes in folders had no way to browse a folder, return to recent work, open by dragging, or work in several folders at once. A left sidebar that browses an opened folder, with a combined recent list, closes this gap while keeping files, not a library, as the source of truth.

## What Changes

- Add a sidebar tree for an opened folder ("workspace"): folders first then A to Z, only supported document types, hidden files always excluded, hidden folders behind a "Show hidden folders" switch, a bound of 20,000 entries with a loading state, and refresh that keeps expansion and selection. Opening a folder never opens its files.
- Add Close Folder (File menu and sidebar header) that asks whether to close open documents too, and a replace-or-new-window prompt shared by every folder-opening entry point.
- Replace the files-only recent list with Recent Items (files and folders, newest first, at most 10) with Clear Recent, and make Reopen Last restore the last closed tab or, failing that, the newest recent entry.
- Open files and folders by dragging them into the window; one prompt covers a multi-folder drop.
- Add New Window, which starts an independent process of the app.
- Add a tree context menu limited to New File, New Folder, Reveal and Copy Path; names starting with a dot are refused inline.
- Out of scope: rename, move, delete, name search or filter, and a keyboard route to the context menu.

## Capabilities

### New Capabilities

- `folder-workspace`: folder tree sidebar, recent items, drag-and-drop open, multiple windows, create and reveal.

### Modified Capabilities

- `file-lifecycle`: Recent Items and Reopen Last fallback; opening reuses the existing open lifecycle.
- `document-tabs`: tab limit and per-document save flow when a folder is replaced or closed.
- `app-shell`: sidebar content and window-level drop target.
- `actions-shortcuts`: Open Folder, Close Folder, New Window and tree context actions.
- `settings`: persisted "show hidden folders" switch.

## Impact

Adds `internal/workspace` (pure tree builder), workspace session state and commands in `internal/appmodel`, a new-window launcher in `internal/application`, a workspace slice and widgets under `frontend/src`, new bound methods, and updates to `docs/architecture.md`. No new dependency and no network use. Verified by a full six-stage run, a baseline comparison with zero findings, and a packaged-app walkthrough.
