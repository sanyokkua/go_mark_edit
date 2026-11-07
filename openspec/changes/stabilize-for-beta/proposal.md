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

- After Reload from disk, no later flush, tab switch, close, Save or autosave writes the pre-reload text, including
  text that was still being handed to the application when the reload completed.
- Keep mine on a mixed-line-ending file, after the user accepted normalization, commits with one Save, from Save,
  Save As and the close prompt. A stale Keep-mine decision is dropped when a new conflict is raised.
- Keep mine takes effect only when the write it authorizes commits; a cancelled, refused or failed write leaves the
  external version undecided. Save As onto the document's own file compares it with the version the document loaded,
  a file that changes during the replacement yields the comparison, and the application's own save never raises a
  conflict.
- A save that creates a file never replaces one that another program creates in the meantime.
- A pending "Normalize line endings?" prompt is no longer cancelled by autosave; mixed-ending documents are not
  autosaved (they could never be written without the prompt).
- A timestamp-only change after a save no longer raises a conflict (the post-save baseline describes the bytes on
  disk, including documents saved without any newline).
- Save As of a file with a byte-order mark keeps the mark on later saves.
- Files created by Save As, by saving an untitled document, or by recreating a deleted file get normal
  read-for-everyone permissions (0644 before umask) instead of owner-only.
- A file whose owner-write permission is missing opens read-only with the new reason "The file is write-protected."
  instead of being overwritten by Save or autosave; Save As to another path stays available for it. A permission
  change on disk is reported like any other external change (as it already is), so Reload re-checks it.

Visible failures

- Conflict labels stay legible in tabs; save warnings replace the success toast and describe the failed verification step; classified background errors retain their safe explanation and available actions.
- Warnings that accompany a committed save (recent-items or view-state not stored, durability not confirmed) are
  shown while the window remains open; they do not delay a successful Quit, and the application does not guarantee
  that a warning is acknowledged or visible before exit. An unencodable buffer is reported without a Retry that cannot
  succeed; a failed background buffer sync is reported.
- If the interface never reports ready, the window is shown anyway 12 seconds after the window size was restored, so
  the startup failure screen is visible.
- An unexpected rendering error shows a recoverable "Something went wrong" screen instead of a blank window, with
  Reload interface (keeps every document and its unsaved text) and Quit (asks before discarding unsaved changes); an
  error inside the preview stays inside the preview pane. Reload waits for acknowledged delivery of pending text; a
  failed or one-second delivery attempt keeps the recovery screen and permits retry. Confirmed recovery discard
  does not start a document write. A ready interface that misses the native close deadline requires explicit
  native confirmation even when backend metadata is clean, protecting text not yet delivered by the interface.
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

- Live preview does no size measurement while hidden and measures each text once; the existing 2 MiB pause stays
  the protection for large documents.
- Each window-resize event no longer writes to the database; the layout sequence counter is updated under its lock.
- The success toast uses the success colour; duplicated theme token declarations and duplicated menu markup are
  removed; dead save-status code is deleted.
- Shipped metadata: real product name, copyright, version and bundle identifier in the macOS and Windows bundles.
- Build and verification: the frontend and bindings are built once per run, Go builds use `-trimpath`, lint stops
  scanning `node_modules`, Jest runs in parallel, and the preview bundle ships only the highlight grammars the app
  registers. Release verification and the five-target release build are delivered by the separate change
  `verification-first-release-ci`, whose commits are on this branch.
- Work found after the plan: status-bar facts fit the available width, the Mermaid style sanitizer and the Format,
  Compact and Lint scans stay bounded on malformed input, and a local SonarQube command exists with the findings it
  reported in changed code resolved.
- End-to-end tests no longer open Finder or overwrite the clipboard: in headless test mode Reveal and Copy path are
  recorded instead of executed, and native-clipboard tests run locally only on request (always in CI) and restore
  the clipboard afterwards.
- Test hygiene: `*.legacy` test files are renamed by feature and their source-text assertions replaced by the existing
  lint and bundle guards; the late-completion test no longer waits 10 seconds of real time.

Out of scope

- A size cap for a buffer that grows past 10 MiB while editing (follow-up change).
- Running local end-to-end tests under a Linux virtual display, and preventing test app instances from showing a
  Dock icon or taking focus on macOS (no supported Wails v2 option).
- Code signing and notarization.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `external-change-conflict`: Keep mine combines with an accepted line-ending normalization and takes effect only
  when its write commits; Save As onto the document's own file, a conflict found during replacement and the
  application's own save are specified; Reload is never undone by a later write; the touched-file scenario covers files saved by the application; a permission change is listed
  as a change (current behaviour, now specified); a file that became write-protected on disk offers only Reload from
  disk and Cancel.
- `file-lifecycle`: write-protected files open read-only; new files get normal permissions and never replace a file
  that appears during creation; BOM kept after Save As;
  autosave skips mixed-ending documents; committed-save warnings and sync failures are reported.
- `editor`: undo history survives tab switches and is reset by Reload; edits typed before a reload are discarded;
  standard text navigation and line editing keys.
- `actions-shortcuts`: tab-switch keys change; editor-focused shortcuts are not swallowed by the editor; Save As
  stays available for a write-protected document.
- `app-shell`: window shown after a startup watchdog delay; recoverable error screen for rendering errors; quitting
  is not blocked by a layout save failure.
- `markdown-preview`: an error while drawing the preview shows the inline preview error instead of failing the window.

## Impact

- Backend: `internal/appmodel` (save, conflict, lifecycle, close plan, autosave, layout drain, write coordinator),
  `internal/file` (atomic replace including exclusive creation, document reader), `internal/application` (native window, `application_context_holder.go` port
  wiring and shutdown ownership), `main.go` (headless test ports and conservative native confirmation).
- Bridge: a read-capability value for write-protected files, a typed committed-save warning value, two additive
  native lifecycle methods (`AcknowledgeRecoveryClose` and `DiscardAndAuthorizeQuit`), a required
  `PendingClose.owner` value (`frontend` or `native`), and the raw-byte fingerprint on the conflict's disk version;
  generated bindings regenerate. One existing bound method changes: `UpdateBuffer` takes the document revision the
  editor session was installed from and returns `BufferUpdateResult` (`accepted` or `superseded`). No other bound
  method signature changes. Bootstrap carries the full pending-close identity and owner.
- Frontend: `useSyncedBuffer`, `useDocumentSession`, `CodeEditor`, `EditorStage`, `monacoSetup`,
  `useEditorActionExecutor`, `useShellShortcuts`, shortcut registry, `DocumentTabs`, `readOnlyReason`,
  `useDocumentWrites`, adapter error reporting, the root error boundary in `App`, `MarkdownView`/`useLivePreview`, `useWindowGeometry`, `Menubar`,
  `Toast` styles, `tokens.css`, the markdown highlight plugin, `main.tsx`.
- Tooling: `scripts/build`, `scripts/verify` stages, `scripts/sonar` and `sonar-project.properties`, Playwright config
  and harness, CI workflows, `wails.json` and `build/` bundle templates, frontend dependencies (`rehype-highlight` replaced by a plugin on the existing `lowlight`
  dependency; the unused direct `mdast-util-math` dependency removed).
- No persisted-data migration: settings, recents and view state live in the application's own SQLite file under the
  user configuration folder, which does not depend on the bundle identifier. Changing the identifier resets only the
  macOS webview's local storage, which holds the startup theme mirror; the first launch after the change may use the
  default theme for the startup frame until settings load.
