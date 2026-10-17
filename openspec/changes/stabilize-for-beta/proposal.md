# Proposal

## Why

GoMarkEdit is feature-complete for its first public release, but a whole-repository audit (2026-10-12, re-checked
at `7580ea1`) found paths that lose or trap user work: after **Reload from disk** the next blur, tab switch or
autosave writes the pre-reload text over the file, and **Keep mine** on a file with mixed line endings loops so the
edits can never be saved. Around these sit advertised shortcuts that do nothing in the editor, a startup failure the
user cannot see, a render error that blanks the whole window, a verification suite that opens Finder and overwrites
the developer's clipboard, and a build that repeats work. Fixing these before more features land is what moves the
application from alpha to beta stability.

## What Changes

Data integrity

- After Reload from disk, no later flush, tab switch, close, Save or autosave writes the pre-reload text.
- Keep mine on a mixed-line-ending file, after the user accepted normalization, commits with one Save, from Save,
  Save As and the close prompt. A stale Keep-mine decision is dropped when a new conflict is raised.
- A pending "Normalize line endings?" prompt is no longer cancelled by autosave; mixed-ending documents are not
  autosaved (they could never be written without the prompt).
- A timestamp-only change after a save no longer raises a conflict (the post-save baseline describes the bytes on
  disk, including documents saved without any newline).
- Save As of a file with a byte-order mark keeps the mark on later saves.
- Files created by Save As, by saving an untitled document, or by recreating a deleted file get normal
  read-for-everyone permissions (0644 before umask) instead of owner-only.
- A file whose owner-write permission is missing opens read-only instead of being overwritten by Save or autosave.

Visible failures

- Warnings that accompany a committed save (recent-items or view-state not stored, durability not confirmed) are
  shown instead of dropped; an unencodable buffer is reported without a Retry that cannot succeed; a failed
  background buffer sync is reported.
- If the interface never reports ready, the window is shown anyway 12 seconds after the window size was restored, so
  the startup failure screen is visible.
- An unexpected rendering error shows a recoverable error screen instead of a blank window; an error inside the
  preview stays inside the preview pane.
- A layout (window geometry) save failure no longer prevents quitting.

Editor and shortcuts

- Undo history survives switching to another tab and back; it is still reset by Reload from disk.
- The editor gains the caret and line keys of common desktop code editors, which are missing today: move, select
  and delete by word (Option+arrows / Option+Backspace on macOS, Ctrl+arrows / Ctrl+Backspace elsewhere) and line
  operations (move, copy, delete, indent and outdent lines, delete to line start, insert line above). Existing line
  and document start/end keys are covered by tests. App shortcuts keep priority where keys overlap.
- Mod+K (Link) and Cmd+E (Inline code on macOS) work while the editor has focus.
- **Changed shortcut:** tab switching becomes Ctrl+Tab / Ctrl+Shift+Tab on every platform (shown ⌃⇥ / ⌃⇧⇥ on
  macOS), replacing the unusable Mod+Tab on macOS; Ctrl+PageDown / Ctrl+PageUp keep working, now also while the
  editor has focus.

Performance, quality and tooling (no spec-level behaviour change)

- Live preview defers rendering of large documents so typing is not blocked, and does no work while hidden.
- Each window-resize event no longer writes to the database; the layout sequence counter is updated under its lock.
- The success toast uses the success colour; duplicated theme token declarations and duplicated menu markup are
  removed; dead save-status code is deleted.
- Shipped metadata: real product name, copyright, version and bundle identifier in the macOS and Windows bundles.
- Build and verification: the frontend and bindings are built once per run, release builds once, Go builds use
  `-trimpath`, lint stops scanning `node_modules`, Jest runs in parallel, and the preview bundle ships
  only the highlight grammars the app registers.
- End-to-end tests no longer open Finder or overwrite the clipboard: in headless test mode Reveal and Copy path are
  recorded instead of executed, and native-clipboard tests run locally only on request (always in CI) and restore
  the clipboard afterwards.
- Test hygiene: `*.legacy` test files are renamed by feature and their source-text assertions replaced by the existing
  lint and bundle guards; the late-completion test no longer waits 10 seconds of real time.

Out of scope

- A size cap for a buffer that grows past 10 MiB while editing (follow-up change).
- A revision check on buffer updates as a second guard behind the reload fix.
- Running local end-to-end tests under a Linux virtual display, and preventing test app instances from showing a
  Dock icon or taking focus on macOS (no supported Wails v2 option).
- Code signing and notarization.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `external-change-conflict`: Keep mine combines with an accepted line-ending normalization; Reload is never undone
  by a later write; the touched-file scenario covers files saved by the application.
- `file-lifecycle`: write-protected files open read-only; new files get normal permissions; BOM kept after Save As;
  autosave skips mixed-ending documents; committed-save warnings and sync failures are reported.
- `editor`: undo history survives tab switches and is reset by Reload; standard text navigation and line editing
  keys.
- `actions-shortcuts`: tab-switch keys change; editor-focused shortcuts are not swallowed by the editor.
- `app-shell`: window shown after a startup watchdog delay; recoverable error screen for rendering errors; quitting
  is not blocked by a layout save failure.

## Impact

- Backend: `internal/appmodel` (save, conflict, lifecycle, close plan, autosave, layout drain), `internal/file`
  (atomic replace, document reader), `internal/application` (native window), `main.go` (headless test ports).
- Frontend: `useSyncedBuffer`, `CodeEditor`, `monacoSetup`, `useEditorActionExecutor`, shortcut registry, `DocumentTabs`,
  `useDocumentWrites`, adapter error reporting, `MarkdownView`/`useLivePreview`, `useWindowGeometry`, `Menubar`,
  `Toast` styles, `tokens.css`, the markdown highlight plugin, `main.tsx`.
- Tooling: `scripts/build`, `scripts/verify` stages, Playwright config and harness, CI workflows, `wails.json` and
  `build/` bundle templates, frontend dependencies (`rehype-highlight` replaced by a plugin on the existing `lowlight`
  dependency; the unused direct `mdast-util-math` dependency removed).
- No persisted-data migration: settings, recents and view state live in the application's own SQLite file under the
  user configuration folder, which does not depend on the bundle identifier. Changing the identifier resets only the
  macOS webview's local storage, which holds the startup theme mirror; the first launch after the change may use the
  default theme for the startup frame until settings load.
