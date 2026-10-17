# Design

## Context

See proposal.md for motivation. Every defect below was traced at `7580ea1`; file references are where the owner
lives today. Constraints that shape the approach:

- The backend document model (`internal/appmodel`) is authoritative (ADR-0014, ADR-0017). The frontend mirrors the
  visible buffer in `useSyncedBuffer` and pushes it with `UpdateBuffer`, which takes no revision.
- One decision token travels through Save, Save As and the close plan; normalization and keep-mine tokens are
  single-use and bound to a content revision (ADR-0024).
- Wails v2 binds each call on its own goroutine, so bound methods run concurrently.
- Production code must not grow test-only branches (`openspec/config.yaml`), with one existing precedent:
  `application.E2EHeadlessEnabled()` keeps the window hidden in end-to-end runs (`main.go:37`,
  `internal/application/native_window.go:49`).

## Goals / Non-Goals

**Goals:**

- Fix each defect inside its existing owner, with a regression test that fails before the fix.
- Keep the Wails wire contract unchanged unless a defect cannot be fixed otherwise (none needs it).
- Make a full local `scripts/verify` faster and free of desktop side effects except app focus.

**Non-Goals:**

- New abstraction layers, a second state owner, or a rewrite of the conflict or save pipeline.
- Changing what the user sees for behaviour the specs already describe correctly.

## Decisions

### 1. Reload: adopt the editor mirror per activation, not per document

`useSyncedBuffer.adoptDocument` (`frontend/src/logic/hooks/useSyncedBuffer.ts:119-130`) returns early when the
document id is unchanged, so a Reload (same id, new `externalEpoch`, new activation token) keeps the pre-reload text in
`contentRef`, and the next flush sends it. Track the adopted activation token instead of the document id and reset
the content, cursor, selection, scroll and view refs whenever the token changes.

- Rejected: a revision argument on `UpdateBuffer` as a backstop. The frontend never learns the revisions of its own
  edits (`UpdateBuffer` returns `VoidResult`), so it would need a new bound method, a reload revision field and
  frontend plumbing. Deferred (proposal, Out of scope).

### 2. Undo across tabs: one Monaco model per open writable document

Today `CodeEditor` keys the editor and model path by activation id and disposes the model on every activation change
(`frontend/src/ui/components/CodeEditor.tsx:172-175, 406-425, 689-692`). Instead:

- The model path is derived from the document id and its `externalEpoch`; the editor keeps the model on unmount
  (`keepCurrentModel`).
- A small module-local registry inside the editor component's folder owns the models. A model is disposed when its
  document id leaves the open-document list (`state.documents.orderedIds`, passed in as a prop by `EditorStage`) or
  when its epoch is superseded by a Reload.
- On activation, if the cached model's text differs from the backend buffer the stage passes in, the model is
  replaced (undo starts empty) rather than trusted. This keeps the backend authoritative and closes the C1-style
  stale-mirror path for hidden tabs.
- Read-only documents are not cached: they have no undo history and can be up to 50 MiB.

This refines ADR-0014 ("Monaco is only the visible document's working copy"): hidden models carry undo history only;
the backend content still wins on every activation. Recorded as a new durable decision in `docs/architecture.md`.

- Rejected: amending the spec to per-activation undo (user decision: keep undo).

### 3. Keep mine with normalization: bind acceptance to the keep-mine record (backend only)

The loop exists because Save carries one token and both the mixed-ending check (`internal/appmodel/save.go:77-83,
120-126, 283-290`) and the conflict check consume one. Changes, all inside `internal/appmodel`:

- `normalizationAuthorization` gains an accepted flag, set when its token arrives at the conflict inspection for the
  same content revision (covers Save, Save As and close plan, which all pass through `inspectDocument`,
  `conflict.go:273-298`).
- `AuthorizeKeepMine` copies an accepted normalization for the same revision onto the keep-mine record; when that
  keep-mine token is consumed, the normalization is re-keyed to it so `snapshotForWrite` finds it.
- `normalizationAuthorizationForLocked` (`lifecycle.go:118-123`) also accepts a keep-mine token that carries an
  accepted normalization, so the existing callers (`save.go`, `close_plan.go:744`) are unchanged.
- `registerConflict` clears keep-mine records.
- Autosave eligibility (`autosave.go:165-174`) excludes documents with mixed endings, so autosave can no longer
  overwrite and cancel the single pending normalization slot.

Consent is preserved: Skip or an edit mints a fresh, unaccepted normalization token.

- Rejected: a second token through Save, Save As and the close plan. It changes two bound signatures,
  `ClosePlanDecision`, about twelve frontend files and thirty test call sites for the same outcome.
- Rejected: making Keep mine imply normalization; that rewrites line endings without consent.

### 4. Post-save baseline from the written bytes

`characteristicsForWrittenSnapshot` (`save.go:639-659`) leaves line-ending counts at zero and Save As forces the BOM
to absent (`save.go:400`), so the next disk check differs from a fresh read. Classify the written bytes with the same
function the reader uses: extract the size/mode-independent part of `classifyDocumentBytes`
(`internal/file/document_reader.go:229`) into an exported helper taking the bytes and file mode, use it after every
committed write, and delete `characteristicsForWrittenSnapshot`. The BOM comes from the encoder's outcome. The dead
`failedWrite` field and `markFailedWrite` (`save_status.go:43`) are removed in the same slice; dirty state already
follows `ContentRevision > committedRevision`.

### 5. File permissions

- New target: `atomic_replace.go` only copies the mode when the target exists, so `os.CreateTemp`'s 0600 survives.
  When the target does not exist, chmod the temporary file to `0666 &^ umask`. The umask is read once at process
  start on Unix (the only portable read sets and restores it, which is safe before any goroutine creates files);
  Windows has no umask and uses 0644 semantics through the read-only attribute only.
- Write-protected input: the reader decides capability at `document_reader.go:239-255`. Add a capability for "owner
  has no write bit" (on Windows, the read-only attribute maps to the same bit in `os.FileMode`) that reuses the
  existing read-only behaviour and adds the catalogue string "The file is write-protected.". Reload re-reads, so it
  re-evaluates the permission.

### 6. Reporting save and sync outcomes

- The committed branch of `finishWrite` in `frontend/src/app/useDocumentWrites.ts` ignores `result.error`; report it
  through the existing warning toast. In `save.go:427-457` keep the first warning instead of overwriting it with a
  later one, and keep the durability post-commit error as a warning instead of silently resyncing.
- `save.go:311-313` maps every encode failure to a retryable I/O error; classify it as unsupported input with no
  remediation, which the frontend already renders without Retry.
- `appModelAdapter.ts:574` swallows buffer-sync failures; route the first failure to the existing error notification
  seam and suppress repeats until a send succeeds.
- `ApplicationMenubar.tsx:165-167` gets a rejection handler that reports through the same seam.

### 7. Editor-focused shortcuts: capture phase, scoped to the editor text area

Monaco's keybinding service stops propagation for Cmd+K (hover chord), Cmd+E on macOS (find with selection) and
Ctrl+PageUp/PageDown on macOS (scroll), so the bubble-phase `window` listeners never see them. Register the
executor's listener (`frontend/src/ui/widgets/useEditorActionExecutor.ts:96-114`) and the tab navigation listener
(`DocumentTabs.tsx`, `useShellShortcuts.ts`) in the capture phase, acting only when the event target is the editor's
text area and the key resolves to an available catalogue command; then `preventDefault` and `stopPropagation`.
Events from the Find/Replace inputs and every other control keep the current bubble path, which preserves "Key
handled by the Find input".

Tab switching: add physical `Ctrl+Tab` / `Ctrl+Shift+Tab` to the registry aliases on every platform, make them the
displayed bindings, and teach `formatShortcut` the macOS Control symbol (⌃).

- Rejected: registering each catalogue shortcut as a Monaco command. It needs the executor plumbed into
  `CodeEditor`, a binding converter and a second registration path for the same catalogue.

Text navigation and line editing: `monacoSetup.ts` loads `editor.api`, `coreCommands` and three contributions
only. `coreCommands` already binds line start/end and document start/end with VS Code's platform defaults (⌘←/→ and
⌘↑/↓ on macOS, Home/End and Ctrl+Home/End elsewhere), but word move/select/delete lives in the `wordOperations`
contribution, which is not loaded, so Option+arrows do nothing. Import the `wordOperations` and `linesOperations`
contributions there. Their only overlap with the catalogue is Mod+Enter (insert line below versus Distraction-free
reading); the capture-phase dispatch above runs the catalogue command first. Monaco's read-only mode already refuses
the line edits.

- Rejected: importing `editor.all`. It also brings suggest, folding, code actions and more, works against the bundle
  goal in §12, and adds bindings that would need their own conflict review.
- Rejected: custom keybindings for word movement. They would re-implement Monaco's word-separator logic.

### 8. Visible startup and render failures

- Startup watchdog: `NativeWindowService.Restore` (`internal/application/native_window.go`) arms a 12-second timer;
  if the window is still hidden it calls the existing native show. Headless mode never shows. The clock is injected
  the same way as `ShutdownClock` (`shutdown.go:68-77`) so the integration test uses a fake. `WindowReady` is not
  reused because it also marks the frontend ready for shutdown (`shutdown.go:203-210`).
- Root error boundary in the app composition (`frontend/src/app/`, mounted from `main.tsx`) showing the "Something
  went wrong" screen with Reload interface and Quit. Reload interface flushes the pending buffer through the adapter
  (bounded wait) and reloads the page; the backend still holds every document, so bootstrap restores the tabs.
- The preview's existing class component `CommittedPreview` (`MarkdownView.tsx`) becomes its error boundary and
  shows the existing inline preview error.

### 9. Preview responsiveness

`MarkdownView` renders with `useDeferredValue` on the source, so React can interrupt a large render for keystrokes.
`useLivePreview`'s byte count (`useLivePreview.ts:32-39`) runs only when the preview is visible, is memoized on the
content, and uses one shared UTF-8 byte-length helper that also replaces `new Blob([text]).size` in
`useTidyCommands.ts` and `tidy/chunking.ts`.

### 10. Layout persistence

- `useWindowGeometry` sends `windowMaximized` only when it changes.
- `persistLayout` increments `service.sequence` under `service.mu` (`internal/appmodel/service.go:600`).
- `DrainBeforeClose` (`close_drain.go:23-25`) logs a layout flush failure, drops the pending layout and continues;
  document write failures stay fatal. This refines ADR-0013's "flushed on close" to "flushed on close when possible".

### 11. End-to-end isolation (exception to the no-test-branch rule)

When `E2EHeadlessEnabled()` is true, the composition root (`main.go`) appends app-model options that replace the
reveal port and clipboard writer with recorders that append each call as one line to a file in the isolated e2e
configuration folder (the harness already isolates `HOME`/`XDG_CONFIG_HOME`). The real OS commands keep their own
coverage in `tests/go/integration/file/reveal_unix_test.go` and `clipboard_unix_test.go`. This is the second
sanctioned use of the headless flag and is recorded as a durable decision; the flag stays confined to the
composition root and `native_window.go`.

Playwright's `chromium-native` project (`frontend/playwright.config.ts:63-88`) runs only when
`E2E_NATIVE_CLIPBOARD=1` (set in `push.yml` and `release.yml`) or in the macOS subset. A shared fixture saves the
clipboard text before each native-clipboard test and restores it afterwards, replacing the per-test restores.

### 12. Build and bundle

Evidence from the 2026-10-10 run reports and the scripts:

- `scripts/verify` sets `GOMARKEDIT_E2E_REUSE_DIST=1` for the E2E stage when Build passed in the same run, so the
  frontend and generators are not run twice (`frontend/tests/support/prepare.ts:111,130-141`).
- `scripts/build` passes `-skipbindings` (bindings are generated just before) and `-trimpath` to `wails build`.
- The e2e binary drops `-gcflags all=-N -l` (`prepare.ts:243`); no debugger is attached.
- golangci-lint gets an explicit package list so it no longer loads the Go package inside
  `frontend/node_modules/flatted` (`scripts/lib/stages.sh:9`).
- Both Jest stages run with `--maxWorkers=50%` instead of `--runInBand` (`stages.sh:45,53`) after two consecutive green runs prove no
  ordering dependence; if any test proves order-dependent it is fixed, not re-serialized.
- The release workflow builds the versioned app once and verifies against it.
- `rehype-highlight` registers lowlight's whole common grammar set although the app registers 26
  (`src/logic/markdown/highlight.ts`). A small rehype plugin on `createLowlight()` with only the registered grammars
  replaces it, keeping class names and the unknown-language behaviour. The unused direct `mdast-util-math`
  dependency is removed.
- Product metadata: `wails.json` gains an `info` block (company, product, copyright, version), and the bundle
  identifier is edited in `build/darwin/Info.plist`, `Info.dev.plist` and `build/windows/wails.exe.manifest`.

Rejected: sharing one app launch across e2e tests. Launches are about 26 % of summed test time and the slowest files
are dominated by in-test loops, so the gain does not justify cross-test state.

### Verification approach

- Each defect gets a regression test at the lowest level that reaches it with real code: Go integration tests with
  real temporary files (`tests/go/integration/appmodel`, helpers in `support_test.go`, `writeMixedDocument`), Jest
  hook/component tests, and Playwright e2e tests for Reload, undo across tabs, editor shortcuts and Copy path
  recording.
- `os.Chtimes` drives the touched-file cases; a fake native window and fake clock drive the watchdog; a failing
  layout repository drives the drain test.
- Theme generation after the `tokens.css` cleanup must be byte-identical; `plutil -p` checks the built `Info.plist`;
  `pbpaste` before and after a full local e2e run and the absence of a Finder window check isolation.
- Real-app checks (computer use) for Reload then tab switch, undo across tabs, Cmd+K/Cmd+E/Ctrl+Tab in the editor on
  macOS, and the watchdog-shown failure screen.

## Risks / Trade-offs

- [Cached models raise memory use with many large open documents] → only writable documents (≤ 10 MiB) are cached
  and models are disposed with their tab; 40 × 10 MiB is the theoretical bound, the same order as the backend copy.
- [A capture-phase listener could steal keys from inputs] → it acts only for events targeted at the editor text area
  and only for available catalogue commands; Find/Replace inputs and dialogs keep the bubble path; covered by the
  existing "Key handled by the Find input" e2e test.
- [Reload interface after a crash could lose the last 50 ms of typing] → flush the pending buffer before reloading,
  with a bounded wait.
- [Jest parallelism could expose hidden shared state] → require two consecutive green runs; fix any shared state.
- [Replacing rehype-highlight could change highlighted output] → existing preview and highlight tests must pass
  unchanged; compare rendered output for each registered language in a unit test.
- [Changing the bundle identifier resets the webview's local storage on macOS] → only the startup theme mirror lives
  there; it is rewritten on the first settings load.

## Migration Plan

No data migration. Each task lands as its own commit on `feature/stabilize-for-beta`; any task can be reverted on
its own.

## Open Questions

- Final bundle identifier. Default: `io.github.sanyokkua.gomarkedit`; confirm before the metadata task lands.
