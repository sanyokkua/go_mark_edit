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
- Keep the Wails wire contract unchanged unless a defect cannot be fixed otherwise. One change is needed: a new
  read-capability value for write-protected files (§5). No bound method signature changes.
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
(`frontend/src/ui/components/CodeEditor.tsx:172-175` path, `:406-425` cleanup that calls `model.dispose()`,
`:689-692` key/path). Facts that shape the change:

- `externalEpoch` is one global counter in `useDocumentSession` (`frontend/src/app/useDocumentSession.ts:14-19`), so
  reloading B would also change A's path. It becomes a per-document map (`Record<documentId, number>`) owned by the
  same hook; `useSyncedBuffer`'s activation token stays keyed on `[documentId, externalEpoch]` with the document's own
  epoch.
- `@monaco-editor/react` (4.7) reuses an existing model at a path and ignores `defaultValue`. So the component itself
  owns model lifetime: the editor gets `keepCurrentModel`, the explicit `model.dispose()` in the cleanup is removed,
  and a module-local registry (a `Map<path, ITextModel>` in `CodeEditor`'s folder) decides disposal.
- Path = document id + that document's epoch. The registry disposes a model when its id leaves `openDocumentIds` (a
  new prop: `EditorView` (`frontend/src/ui/widgets/EditorView.tsx:250`, which already uses `useAppSelector`) selects
  `state.documents.orderedIds` and passes it through `EditorStage` to `CodeEditor`), or when a newer epoch for the same id appears.
- Before mount, if a cached model's text differs from `initialValue` (the backend buffer, which only changes on
  install), the cached model is disposed first so the editor creates a fresh one (undo starts empty). The backend
  stays authoritative and a hidden tab can never carry a stale mirror into the backend.
- Per-activation state is rebound on every activation to the current model: link provider registration, lint
  decorations, the scroll port, and `attachEditor` with the new activation token. These stay activation-scoped; only
  the model (text plus undo stack) outlives the activation.
- Read-only documents are not cached: they have no undo history and can be up to 50 MiB.
- Test support: the `@monaco-editor/react` mock in `frontend/tests/unit/components/CodeEditor.test.tsx:252-289`
  shares one model; it gains a path-to-model map so reuse and disposal are observable.

This refines ADR-0014 ("Monaco is only the visible document's working copy"): hidden models carry undo history only;
the backend content still wins on every activation. Recorded as ADR-0040 in `docs/architecture.md`.

- Rejected: amending the spec to per-activation undo (user decision: keep undo).

### 3. Keep mine with normalization: bind acceptance to the keep-mine record (backend only)

Each Save, Save As and close-plan decision carries one `decisionToken`. On a mixed-ending file with a conflict, that
one string must be both the normalization token (checked at `internal/appmodel/save.go:77-83` for Save,
`:120-126` for Save As, `internal/appmodel/close_plan.go:190` and `validNormalizationTokenLocked` at `:742` for the
close plan) and the keep-mine key (consumed in `inspectDocument`, `internal/appmodel/conflict.go:252-334`, keep-mine
branch `:273-298`). A keep-mine token fails the normalization check, and a normalization token misses the keep-mine
map, so the user loops. Today the normalization token is a single slot (`document.normalization`,
`save.go:23-28`), consumed only in `snapshotForWrite` (`save.go:267-296`); the keep-mine record
(`keepMineAuthorization`, `conflict.go:27-35`) is consumed in `inspectDocument`, which runs before
`snapshotForWrite`. Both are bound to `ContentRevision`; any edit clears both (`document.go:72-75`).

Changes, all inside `internal/appmodel`:

- `normalizationAuthorization` gains `accepted`. `inspectDocument` already receives the decision token
  (`conflict.go:252`); when the token is the current normalization token for the current revision and a conflict is then registered,
  sets `accepted`.
- `AuthorizeKeepMine` (`conflict.go:150-201`) copies an accepted normalization for the same revision onto the
  keep-mine record.
- `normalizationAuthorizationForLocked` (`lifecycle.go:118-123`) also accepts a keep-mine token whose record carries
  an accepted normalization. All four checks above call it, so the close plan's overwrite of
  `target.normalizationToken` (`close_plan.go:163`) with the keep-mine token is covered.
  `validNormalizationTokenLocked` gains the `proposedEnding` check the Save gate already does, so the close plan never
  accepts a token that Save then rejects.
- Consumption order: when `inspectDocument` consumes the keep-mine token it re-keys `document.normalization` to that
  token. If `snapshotForWrite` then refuses, the write fails with its normal error; the user's next Save raises the
  conflict again (the adopted baseline is restored from the unchanged disk), so no write happens without consent.
- `registerConflict` (`conflict.go:446-459`) drops the document's keep-mine records whose disk `version` differs from
  the newly registered one, so a Keep mine from an earlier conflict is never honoured. Records for the same version
  survive: focus and tab-activation checks call `inspectDocument(..., "")` (`conflict.go:68`) and re-register the
  same conflict between Keep mine and Save, because Keep mine never starts a Save itself
  (`frontend/src/app/useExternalChanges.ts`).
- Autosave eligibility (`autosaveEligibleLocked`, `autosave.go:165-174`) excludes documents whose metadata line
  ending is mixed (`file.LineEndingMixed`, as used at `conflict.go:532`). Both the timer path and
  `flushAutosaveForClose` go through it (`autosave.go:53, 183`), so neither mints over the pending normalization
  token.

Consent is preserved: Skip or an edit mints a fresh, unaccepted normalization token.

- Rejected: a second token through Save, Save As and the close plan. It changes two bound signatures,
  `ClosePlanDecision`, about twelve frontend files and thirty test call sites for the same outcome.
- Rejected: making Keep mine imply normalization; that rewrites line endings without consent.

### 4. Post-save baseline from the written bytes

`characteristicsForWrittenSnapshot` (`save.go:639-659`) leaves `LFCount`, `CRLFCount` and `FirstEnding` at zero, but
`characteristicsEqual` (`conflict.go:545-547`) compares them, so the next disk check after any save differs from a
fresh read. Save As writes the source's BOM (`encodeWrite`, `save.go:555-558`) yet sets the metadata BOM to absent
(`save.go:400`), so the next Save drops it. Classify the written bytes with the same function the reader uses:
extract the size-independent part of `classifyDocumentBytes` (`internal/file/document_reader.go:229`) into an
exported helper in `internal/file` taking the bytes and file mode, use it after every committed write, and delete
`characteristicsForWrittenSnapshot`. The BOM comes from the encoder's outcome.

The `failedWrite` field and `markFailedWrite` (`save_status.go:43`, no callers) are removed in the same slice, with
their reads at `save_status.go:34,53`, `document.go:79`, `conflict.go:429` and `lifecycle.go:36,84`. Dirty state is
the OR of content ≠ baseline, `ContentRevision > committedRevision`, detached, untitled and non-empty, and
`failedWrite`; the last term is always false, so removing it changes nothing.

### 5. File permissions

- New target: `atomic_replace.go` only copies the mode when the target exists (`:174-178`), so `os.CreateTemp`'s 0600
  (`:111`) survives. When the target does not exist, chmod the temporary file to `0666 &^ umask` before the rename, so
  the mode recorded by §4's classifier equals the file on disk and no false permission conflict follows. The umask is
  read once at process start on Unix (the only portable read sets and restores it, which is safe before any goroutine
  creates files); Windows has no umask and the mode stays as Go reports it.
- Write-protected input: the reader decides capability at `document_reader.go:239-255` from `ReadCapability`
  (`:23-30`). Add `write-protected-read-only`, chosen when the owner-write bit is missing (on Windows the read-only
  attribute maps to that bit in `os.FileMode`) and the bytes would otherwise be writable. It reuses every existing
  read-only behaviour; the regenerated binding carries the value, and `frontend/src/ui/components/readOnlyReason.ts`
  maps it to the catalogue string "The file is write-protected.".
- Save As is the one command it keeps (actions-shortcuts "Read-only documents"). The availability rule in the action
  registry allows Save As when the capability is `write-protected-read-only`, and the backend gates that refuse every
  non-writable capability today (`SaveAs` at `save.go:116-118`, `snapshotForWrite` at `save.go:281-283`) let that
  capability through for Save As only; Save, autosave and the close plan's Save keep refusing it. After Save As the
  target is classified afresh by §4's classifier, so the tab becomes writable.
- Conflict choices: the comparison preview's `ReadOnly` (`conflict.go:521`) is computed from the open document's
  capability or the disk read's capability, so a file that became write-protected on disk offers only Reload from disk
  and Cancel (external-change-conflict "Choices for a read-only document"). Keep mine can therefore never replace a
  write-protected file. So that unsaved edits are not trapped, `SaveAs` skips the source-path conflict check
  (`save.go:140-144`) when the document's queued conflict has a write-protected disk side: the source file is not
  written, so the conflict does not concern the target. Save and the close plan's Save still stop at the conflict.
- Permission changes on disk already raise a conflict (`DiskVersion.Equal` and `characteristicsEqual` compare the
  mode); the spec now states this, and Reload from disk re-reads, so it re-evaluates the capability.

### 6. Reporting save and sync outcomes

- `WriteResult` has one `Error` field (`internal/apperr/results.go:493-503`). In `save.go:427-457` choose one warning
  by fixed precedence instead of letting the last one win: durability (the post-commit error from
  `atomic_replace.go:200-206`, today only setting `resyncRequired` at `save.go:445-447`), then Recent Items
  (`:438-444`), then view state (`:430-435`).
- `save.go:311-313` maps every encode failure to a retryable I/O error; map the codec sentinels (`codec.go:31-46`) to
  `unsupported-input` with no remediation. The frontend shows Retry only when the remediations include it
  (`frontend/src/logic/store/classifiedNotification.ts:179`).
- The committed branch of `finishWrite` (`frontend/src/app/useDocumentWrites.ts:196-235`) ignores `result.error`;
  show it with the existing `notifyToast({severity: 'warning'})` pattern (`useDocumentWrites.ts:72-79`) under new
  notification codes and catalogue strings for Recent Items, view state and durability.
- Buffer sync: `appModelAdapter.ts:575` swallows `sendPendingBuffer` failures; a failed snapshot is already kept as
  pending (`:551-555`) and is sent with the next edit, flush or save. Add one adapter listener API,
  `subscribeBufferSyncErrors(listener)` next to `subscribeAsyncErrors` (`:905`), that reports the first failure and
  stays silent until a send succeeds. `AppWorkflows` subscribes and shows it through `notifyError`.
- `ApplicationMenubar.tsx:164-168` (`onFullscreen`) gets a rejection handler that reports through `notifyError`, as
  `ApplicationMenubar.tsx:195` already does.

### 7. Editor-focused shortcuts: capture phase, scoped to the editor text area

Monaco's keybinding service stops propagation for Cmd+K (hover chord), Cmd+E on macOS (find with selection) and
Ctrl+PageUp/PageDown on macOS (scroll), so the bubble-phase `window` listeners never see them. Register the
executor's listener (`frontend/src/ui/widgets/useEditorActionExecutor.ts:96-114`, formatting and find commands), the
tab listener (`frontend/src/ui/widgets/DocumentTabs/DocumentTabs.tsx:484-546`, the only tab handler) and the shell
listener (`frontend/src/logic/actions/useShellShortcuts.ts`, which owns Mod+S, the File menu and Mod+Enter) in the
capture phase, acting only when the event target is the editor's
text area and the key resolves to an available catalogue command; then `preventDefault` and `stopPropagation`.
Events from the Find/Replace inputs and every other control keep the current bubble path, which preserves "Key
handled by the Find input".

Tab switching: in `actionRegistry.ts:441-448` and `shortcutRegistry.ts:11-17`, make physical `Ctrl+Tab` /
`Ctrl+Shift+Tab` the displayed `shortcut` on every platform and keep `Ctrl+PageDown` / `Ctrl+PageUp` as aliases;
`Mod+Tab` is removed. `shortcutForKeyEvent` already matches physical Ctrl on macOS (`shortcutRegistry.ts:74-76`).
`formatShortcut` (`:26-38`) upper-cases unknown keys today ("⌘TAB"); teach it the macOS Control symbol (⌃) and the
key symbols ⇥ (Tab), ⇞/⇟ (PageUp/PageDown) on macOS and "Tab", "PageUp", "PageDown" elsewhere.

- Rejected: registering each catalogue shortcut as a Monaco command. It needs the executor plumbed into
  `CodeEditor`, a binding converter and a second registration path for the same catalogue.

Text navigation and line editing: `monacoSetup.ts` loads `editor.api`, `coreCommands` and three contributions
only. `coreCommands` already binds line start/end and document start/end with VS Code's platform defaults (⌘←/→ and
⌘↑/↓ on macOS, Home/End and Ctrl+Home/End elsewhere), but word move/select/delete lives in the `wordOperations`
contribution, which is not loaded, so Option+arrows do nothing. Import the `wordOperations` and `linesOperations`
contributions there. Their overlaps with the catalogue are Mod+Enter (insert line below versus Distraction-free
reading) and the Mod+K chord (Mod+K Mod+X trim whitespace, beside hover's Mod+K Mod+I); the capture-phase dispatch
above runs the catalogue command first, so neither chord can start. `monacoLanguages.test.ts` mocks each Monaco
import, so the two new imports get mocks there. Monaco's read-only mode already refuses
the line edits.

- Rejected: importing `editor.all`. It also brings suggest, folding, code actions and more, works against the bundle
  goal in §12, and adds bindings that would need their own conflict review.
- Rejected: custom keybindings for word movement. They would re-implement Monaco's word-separator logic.

### 8. Visible startup and render failures

- Startup watchdog: `NativeWindowService.Restore` (`internal/application/native_window.go:53-90`) arms a 12-second
  timer; if the window is still hidden it calls the existing native show. Headless mode never shows. Today the window
  is shown only by `showIfReadyLocked` (`:113-124`) once restored and frontend-ready. The clock is injected the same
  way as `ShutdownClock` (`shutdown.go:68-77`) so the integration test uses a fake. `WindowReady` is not reused
  because it also marks the frontend ready for shutdown (`shutdown.go:203-210`).
- Root error boundary: a class component in `frontend/src/app/` wraps the content `AppContents` renders
  (`EditorSessionProvider` and below, `frontend/src/app/App.tsx:130-143`), not `AppContents` itself. `useDocumentSession`,
  `useBootstrap` and `useShutdown` stay above the boundary, so the native close-request listener (`useShutdown.ts:92-97`)
  survives a crash. Its screen reuses the layout and token styles of `frontend/src/ui/widgets/StartupFailure/StartupFailure.tsx`.
- Reload interface flushes every open document's pending buffer through the adapter's `flushBuffer`
  (`appModelAdapter.ts:789`) for the ids in `state.documents.orderedIds`, waiting at most 1 second, then calls
  `window.location.reload()`. Bootstrap runs again and calls `WindowReady` again; a second `FrontendReady` is
  harmless (`native_window.go:111-112` returns once shown, `shutdown.go:203-219` only sets the flag), and the backend
  still holds every document, so the tabs come back.
- Quit and window close on the screen: the boundary passes `useShutdown` an override for the close confirmation while
  the screen is shown. It reads dirty documents from `appModelAdapter.getState`; with none it authorizes the quit
  (`nativeLifecycleAdapter.authorizeQuit`), otherwise it shows the discard confirmation from app-shell "Quitting from
  the error screen" and authorizes or cancels (`cancelQuit`). The Quit button calls `nativeLifecycleAdapter.requestQuit`
  (`frontend/src/logic/adapter/index.ts:619`), so button, window close and quit shortcut share that one path.
- The preview's existing class component `CommittedPreview` (`frontend/src/ui/components/MarkdownView.tsx:190`)
  becomes its error boundary and shows the existing inline preview error (`preview.renderError`, `:229`). Today only
  pipeline exceptions are caught (`:271-290`). While in the error state, `commitSuccessfulRender` (`:198-213`) does
  not commit the failing candidate, so the retained preview stays the last good one; the error state resets when the
  candidate content or the document changes, so removing the failing content renders the preview again.

### 9. Preview measurement

`useLivePreview`'s byte count (`frontend/src/logic/hooks/useLivePreview.ts:32-39`, called every render at `:114`) runs
even while the preview is hidden, because `EditorStage.tsx:307` calls the hook before the `if (!visible)` return at
`:385`. The hook takes a `visible` input, skips the measurement while hidden, and memoizes it on the content. One
shared UTF-8 byte-length helper in `frontend/src/logic/` replaces the private counter and the `new Blob([text]).size`
calls in `frontend/src/app/useTidyCommands.ts:162` and `frontend/src/logic/tidy/chunking.ts:40`.

- Rejected: `useDeferredValue` for the preview source. The Markdown parse runs synchronously in one `useMemo`
  (`MarkdownView.tsx:274-288`) and React yields only between components, so it would not unblock keystrokes. The
  existing 2 MiB pause stays the protection for large documents.

### 10. Layout persistence

- `useWindowGeometry` sends `windowMaximized` only when it changes.
- `persistLayout` increments `service.sequence` under `service.mu` (`internal/appmodel/service.go:600`).
- `DrainBeforeClose` (`close_drain.go:23-25`) logs a layout flush failure, drops the pending layout and continues;
  document write failures stay fatal. This refines ADR-0013's "flushed on close" to "flushed on close when possible".

### 11. End-to-end isolation (exception to the no-test-branch rule)

The reveal port and clipboard writer are wired unconditionally in
`internal/application/application_context_holder.go:90-93`, which then appends `options.AppModelOptions`; a later
option overrides an earlier one (`internal/appmodel/options.go:109-117`). When `E2EHeadlessEnabled()` is true,
`main.go` (`:104`) adds `WithRevealPort` and `WithClipboardWriter` options that install recorders with recorders that append each call as one line to a file in the isolated e2e
configuration folder (the harness already isolates `HOME`/`XDG_CONFIG_HOME`). The real OS commands keep their own
coverage in `tests/go/integration/file/reveal_unix_test.go` and `clipboard_unix_test.go`. The frontend
`recordLinkBridge` in `preview-links.test.ts:223-260` passes calls through to the backend, which is how a real Finder
window opens today; with the recorder installed it reaches the recorder instead. The headless flag's two uses (hidden
window, recording ports) are recorded together as ADR-0041; the flag stays confined to `main.go` and
`native_window.go`.

Playwright's `chromium-native` project (`frontend/playwright.config.ts:60-67` macOS subset, `:84-91` normal) runs
only when `E2E_NATIVE_CLIPBOARD=1` or in the macOS subset. The variable is set in `release.yml` and in the `push.yml`
job that selects `chromium-native` through `E2E_PROJECTS` (`push.yml:165`). A shared fixture saves the
clipboard text before each native-clipboard test and restores it afterwards, replacing the per-test restores.

### 12. Build and bundle

Evidence from the 2026-10-10 run reports and the scripts:

- `GOMARKEDIT_E2E_REUSE_DIST` already exists (`frontend/tests/support/prepare.ts:111,130-141`) but only
  `release.yml:134` sets it. `scripts/verify` sets it for the E2E stage when Build passed in the same run, so the
  frontend and generators are not run twice.
- `scripts/build` passes `-skipbindings` (bindings are generated just before) and `-trimpath` to `wails build`.
- The e2e binary drops `-gcflags all=-N -l` (`prepare.ts:243`); no debugger is attached.
- golangci-lint gets an explicit package list so it no longer loads the Go package inside
  `frontend/node_modules/flatted` (`scripts/lib/stages.sh:9`).
- Both Jest stages run with `--maxWorkers=50%` instead of `--runInBand` (`stages.sh:45,53`) after two consecutive green runs prove no
  ordering dependence; if any test proves order-dependent it is fixed, not re-serialized.
- The release workflow builds the versioned app once and verifies against it.
- `rehype-highlight` is given the app's 26 grammars (`src/logic/markdown/highlight.ts:31-58,108-116`), but its static
  `import {common}` (`node_modules/rehype-highlight/lib/index.js`) still bundles lowlight's whole common set. A small
  rehype plugin on `createLowlight()` with only the registered grammars, reading code text with `hast-util-to-text`
  (already a direct dependency), replaces it, keeping class names and the unknown-language behaviour. The unused direct `mdast-util-math`
  dependency is removed.
- Product metadata: `wails.json` gains an `info` block (company, product, copyright, version). `productVersion` must
  be numeric `X.Y.Z`, because `build/windows/wails.exe.manifest` renders `{{.Info.ProductVersion}}.0`. The bundle
  identifier `io.github.sanyokkua.gomarkedit` replaces `com.wails.{{.Name}}` in `build/darwin/Info.plist:11`,
  `build/darwin/Info.dev.plist:11` and `build/windows/wails.exe.manifest:3`.

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
  macOS, the watchdog-shown failure screen, and Quit from the "Something went wrong" screen.

## Risks / Trade-offs

- [Cached models raise memory use with many large open documents] → only writable documents (≤ 10 MiB) are cached
  and models are disposed with their tab; 40 × 10 MiB is the theoretical bound, the same order as the backend copy.
- [A capture-phase listener could steal keys from inputs] → it acts only for events targeted at the editor text area
  and only for available catalogue commands; Find/Replace inputs and dialogs keep the bubble path; covered by the
  existing "Key handled by the Find input" e2e test.
- [Reload interface after a crash could lose the last 50 ms of typing] → flush every pending buffer before
  reloading, waiting at most 1 second.
- [Jest parallelism could expose hidden shared state] → require two consecutive green runs; fix any shared state.
- [Replacing rehype-highlight could change highlighted output] → existing preview and highlight tests must pass
  unchanged; compare rendered output for each registered language in a unit test.
- [Changing the bundle identifier resets the webview's local storage on macOS] → only the startup theme mirror lives
  there; it is rewritten on the first settings load.

## Migration Plan

No data migration. Each task lands as its own commit on `feature/stabilize-for-beta`; any task can be reverted on
its own.

## Open Questions

None. Decided during review: bundle identifier `io.github.sanyokkua.gomarkedit`; Save As stays available for
write-protected files; Quit from the crash screen confirms before discarding unsaved changes; preview work is limited
to §9.
