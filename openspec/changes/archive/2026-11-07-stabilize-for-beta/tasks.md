# Tasks

Each group is one vertical slice: production change, its regression tests and its documentation. Run the focused
tests while working and the relevant `scripts/verify` stages before ticking a box. Group 1 goes first so that later
end-to-end runs no longer touch the developer's desktop. New durable decisions go in the "Durable decisions" ADR table
of `docs/architecture.md` (the table ended at ADR-0039 before this change; this change adds ADR-0040 to ADR-0043).
Groups 19 to 22 record work done after the plan above was approved, each with the commit that delivered it.

## 1. End-to-end runs leave the desktop alone

No spec change (test isolation). Design §11. Owners: `main.go`, `internal/application/application_context_holder.go`
(port wiring, `:90-93`), `internal/file` (`reveal.go`, `clipboard.go`), `internal/appmodel/options.go`
(`WithRevealPort`, `WithClipboardWriter`), `frontend/playwright.config.ts`, `frontend/tests/support/`
(`harness.ts`, `nativeClipboard.ts`), `.github/workflows/verification.yml`.

- [x] 1.1 Add recording implementations of `file.RevealPort` and `file.ClipboardWriter` in `internal/file` that append
      one line per call to a file in the application configuration folder, and add them through
      `options.AppModelOptions` in `main.go` only when `application.E2EHeadlessEnabled()` is true. Record the two
      headless-flag uses (hidden window, recording ports) as ADR-0041 in `docs/architecture.md`. Verify with a Go
      unit test of the recorders, a Go integration test that the headless option set replaces the platform ports,
      and `scripts/verify lint` (referenced-path rules).
- [x] 1.2 Add a harness helper that reads the recorded calls from the isolated e2e profile (`harness.ts:40-54` sets
      `HOME` on macOS and `XDG_CONFIG_HOME` elsewhere); change `real-files.test.ts` (Copy path, `:184`; Reveal,
      `:156,180`) to assert the recorded path and drop its `@native-clipboard` tag (`:140`); `preview-links.test.ts`
      keeps asserting `recordLinkBridge` (`:223-260`), whose passthrough now reaches the recorder. Verify both files
      pass and no Finder window opens during a local run.
- [x] 1.3 Run the `chromium-native` Playwright project (`playwright.config.ts:60-67, 84-91`) only when
      `E2E_NATIVE_CLIPBOARD=1` or in the macOS subset. The variable is set in `.github/workflows/verification.yml`
      (the reusable workflow that `push.yml` and `release.yml` call): in the Linux `serial` e2e job, which selects
      `chromium-serial,chromium-native` through `E2E_PROJECTS`, and in the `macos-e2e` job. `release.yml` itself
      runs no end-to-end tests. Add one fixture in `nativeClipboard.ts` that saves
      the clipboard text before each native-clipboard test and restores it after; use it in `rich-rendering`
      (replacing the restore at `:914/:1059`), `reading-mode` (replacing `:538/:546` and covering the unrestored
      test at `:517-528`) and `editor-round-trip` (`:141-172`, which restores nothing today). Document
      `E2E_NATIVE_CLIPBOARD` next to the E2E rows in `docs/index.md` (`:199`) and `docs/architecture.md`
      (`:510-529`). Verify a full local `scripts/verify e2e` leaves `pbpaste` output unchanged and the tagged tests
      pass with the variable set.

## 2. Reload is not undone by a later write

Spec: external-change-conflict "Reload is not undone by a later write". Design §1. Owner:
`frontend/src/logic/hooks/useSyncedBuffer.ts` (`adoptDocument` `:119-129`, activation token `:94-103`).

- [x] 2.1 Write a failing hook test in `frontend/tests/unit/hooks/useSyncedBuffer.test.ts` (reuse the plain
      `EditorSynchronizationAdapter` from "never flushes the outgoing document text or caret into the incoming
      document", `:247`): edit, rerender with a new external epoch and the reloaded text, flush; the flush must not
      send the pre-reload text. Then make adoption key on the activation token and reset content, cursor,
      selection, scroll and view refs from props; verify the test passes and the existing hook and `closeWorkflow`
      integration tests stay green.
- [x] 2.2 Add an e2e test in `real-files.test.ts` for the scenarios "Tab switch after reload with autosave on" and
      "Save right after reload". Verify it fails on the pre-fix code path (revert locally) and passes with the fix;
      exercise the same sequence in the real app.

## 3. Undo survives tab switches

Spec: editor "Editor stage with preserved working state" (scenarios "Switch tabs", "Undo after reload"). Design §2.
Depends on group 2 (activation token adoption). Owners: `frontend/src/app/useDocumentSession.ts`,
`frontend/src/ui/components/CodeEditor.tsx`, `frontend/src/ui/widgets/EditorStage/EditorStage.tsx`,
`frontend/src/ui/widgets/EditorView.tsx`.

- [x] 3.1 Make `externalEpoch` per document in `useDocumentSession` (`:14-19`) and use the document's own epoch for
      the activation token and model path. In `CodeEditor`, keep one model per open writable document in a
      module-local registry keyed by that path: `keepCurrentModel`, no `model.dispose()` in the cleanup
      (`:416-420`), disposal when the id leaves the new `openDocumentIds` prop (passed from `EditorView.tsx:250`
      through `EditorStage`; `EditorView` selects `state.documents.orderedIds`) or a newer epoch appears, and disposal before mount when the cached text differs from
      `initialValue`; read-only documents are not cached. Give the `@monaco-editor/react` mock in
      `frontend/tests/unit/components/CodeEditor.test.tsx` (`:252-289`) a path-to-model map and change the disposal
      assertions (`:699-700`, `:1080-1081`) to the new contract: disposed on close and on reload, kept on tab
      switch, replaced when the backend text differs. Verify the component and `useDocumentSession` tests pass.
- [x] 3.2 Rebind the per-activation state to the kept model on every activation: link provider registration, lint
      decorations, the scroll port and `attachEditor` with the new activation token. Add component tests that after
      A → B → A the links, lint markers and scroll restore work on A and none of B's registrations remain; verify
      they pass with the existing `CodeEditor` and `EditorStage` tests.
- [x] 3.3 Add an e2e test for "Switch tabs" and "Undo after reload". Record the refinement of ADR-0014 as ADR-0040 in
      `docs/architecture.md`; verify the e2e test passes and the behaviour in the real app.

## 4. Keep mine works on mixed-line-ending files

Spec: external-change-conflict "Keep mine together with line-ending normalization"; file-lifecycle "Autosave"
(scenario "Mixed endings wait for the user"). Design §3. Owner: `internal/appmodel` (`save.go:23-28, 77-83, 120-126,
267-296`, `conflict.go:27-35, 150-201, 252-334, 446-459`, `lifecycle.go:118-123`, `close_plan.go:163, 190, 742`,
`autosave.go:165-174`).

- [x] 4.1 Write failing Go integration tests: in `tests/go/integration/appmodel/conflict_test.go` with a file
      `"a\r\nb\n"` (external edit, buffer edit, Save → normalization, Save(N) → conflict, Keep mine, Save(K) →
      committed); the "Skip asks again" and "Keep mine from an earlier conflict" cases; Keep mine, then a focus check
      (`CheckExternalChanges`) for the same disk version, then Save writes the file; and the same flow through the
      close plan in `close_plan_test.go` reusing `writeMixedDocument` (`close_plan_test.go:433`). Implement the
      accepted flag (set in `inspectDocument`, which already receives the token), the copy onto the keep-mine record, the
      keep-mine token in `normalizationAuthorizationForLocked`, the `proposedEnding` check in
      `validNormalizationTokenLocked`, the re-keying on consumption and the version-scoped keep-mine reset in `registerConflict`;
      verify the tests pass with `go test -race`.
- [x] 4.2 Exclude mixed-ending documents in `autosaveEligibleLocked` and add an `autosave_test.go` case using
      `fakeAutosaveClock` (`support_test.go:208`) and `writeMixedDocument`: Save returns the prompt, the clock fires,
      confirming the original token writes once; add a close-drain case showing `flushAutosaveForClose` mints no
      token. Verify they pass and the frontend `saveTidy` keep-mine integration test stays green.

## 5. Post-save state matches the file on disk

Spec: external-change-conflict "What counts as a change" (scenarios "Touched after a save", "Touched after saving an
untitled document without a line break"); file-lifecycle "Byte-preserving encoding" (scenario "BOM kept after Save
As"). Design §4. Owners: `internal/appmodel/save.go` (`:400, 555-558, 639-659`), `internal/file/document_reader.go`
(`classifyDocumentBytes` `:229`), `internal/appmodel/save_status.go`.

- [x] 5.1 Write failing tests: open an LF file, edit, Save, `os.Chtimes`, check external changes → unchanged; the
      same for an untitled document saved as "hello" with no newline; and a BOM file through Save As, edit, Save →
      still starts with EF BB BF and the metadata reports a BOM. Export a byte classifier from `internal/file`, use
      it for every committed write, take the BOM from the encoder outcome and delete
      `characteristicsForWrittenSnapshot`; verify the tests pass.
- [x] 5.2 Remove the unused `failedWrite` field, `markFailedWrite` and their reads (design §4 lists them); verify
      `go vet`, the appmodel unit and integration suites and the frontend dirty-state tests stay green.

## 6. File permissions

Spec: file-lifecycle "Write-protected files" and "Permissions of new files"; actions-shortcuts "Read-only documents"
(scenario "Save As of a write-protected file"); external-change-conflict "What counts as a change" (scenario
"Permissions changed") and "Choices for a read-only document" (scenario "File became write-protected"). Design §5. Depends on group 5 (the post-write classifier records the mode). Owners:
`internal/file/atomic_replace.go` (`:111, 174-178`), `internal/file/document_reader.go` (`ReadCapability` `:23-30`,
decision `:239-255`), `internal/appmodel/save.go` (`:116-118, 281-283`), `internal/appmodel/conflict.go` (`:521`),
`frontend/src/ui/components/readOnlyReason.ts`, the Save As availability rule in
`frontend/src/logic/actions/actionRegistry.ts`, the frontend catalogue.

- [x] 6.1 Chmod a newly created target's temporary file to `0644 &^ umask` before the rename (umask read once at start
      on Unix); assert capped creation permissions under permissive and restrictive masks (`internal/file/atomic_replace_test.go:91`)
      and add appmodel integration tests for Save As to a new path and Save after an external delete, each followed
      by a focus check that raises no conflict; verify they pass.
- [x] 6.2 Add the `write-protected-read-only` capability for files without the owner-write bit, map it in
      `readOnlyReason.ts` to "The file is write-protected." (catalogue string), allow Save As for it in the action
      registry and in the backend Save As gates (Save and autosave keep refusing it), and compute the conflict
      preview's read-only flag from the disk capability too. Add reader
      unit tests, an appmodel integration test that autosave never writes a 0444 file, a chmod → focus check →
      conflict → Reload test that restores writability, a Save As test whose target tab is writable, a
      test that a writable tab whose file became 0444 gets only Reload and Cancel and Keep mine is refused, an
      appmodel integration test and an e2e case for "Unsaved edits when the file became write-protected" (Save As
      writes the user's text, the source is unchanged), and an e2e
      assertion that Save is disabled and Save As enabled; verify all pass, regenerate bindings with the Build stage,
      and update "Document lifecycle" in `docs/architecture.md` (`:552`).

## 7. Save and sync problems are reported

Spec: file-lifecycle "Save outcome reporting" and "Editor changes that cannot be delivered". Design §6. Owners:
`internal/appmodel/save.go` (`:311-313, 427-457`), `frontend/src/app/useDocumentWrites.ts` (`:72-79, 196-235`),
`frontend/src/logic/adapter/appModelAdapter.ts` (`:551-555, 575, 905`), `ApplicationMenubar.tsx` (`:164-168`).

- [x] 7.1 Choose the committed-save warning by the precedence in design §6 (durability, Recent Items, view state) in
      `save.go`; map codec
      encode failures to `unsupported-input` with no remediation; add Go tests for "Recent Items cannot be stored",
      "Durability not confirmed", "Two accompanying failures", "Durability and Recent Items both fail" and
      "Unencodable text". Cover the private committed-write error in the existing white-box
      `internal/appmodel/save_identity_test.go`; verify the tests pass.
- [x] 7.2 Add a typed optional committed-save warning value to `WriteResult`, select it with the existing error and
      normalize it through the adapter; regenerate bindings. Show the committed-save warning in `useDocumentWrites`
      with new notification codes and catalogue strings;
      add `subscribeBufferSyncErrors` to the adapter (first failure reported, silent until a send succeeds) and show
      it through `notifyError` from `AppWorkflows`; surface committed close-plan and autosave warnings through the
      existing asynchronous error event and shared warning presentation; handle a rejected full-screen toggle. Add frontend integration
      tests using the existing adapter fakes for each, including "Delivery fails" and "Delivery recovers" (the
      pending text is sent with the next edit); verify ordinary saves show warnings while the window remains open and
      a successful Quit continues immediately after a committed-save warning without waiting for acknowledgement or
      visibility.

## 8. Shortcuts work while the editor has focus

Spec: actions-shortcuts "Application and window shortcuts", "Shortcut dispatch", "Shortcuts in the editor text
area"; editor "Text navigation and line editing keys". Design §7. Owners:
`frontend/src/ui/widgets/useEditorActionExecutor.ts` (`:96-114`), `frontend/src/ui/widgets/DocumentTabs/DocumentTabs.tsx`
(`:484-546`), `frontend/src/logic/actions/useShellShortcuts.ts`, `frontend/src/logic/actions/actionRegistry.ts`
(`:441-448`), `shortcutRegistry.ts`, `frontend/src/ui/components/monacoSetup.ts`.

- [x] 8.1 Register the executor, tab and shell listeners in the capture phase for events targeted at the editor text
      area, stopping propagation when an available command matches; leave Find/Replace inputs on the bubble path.
      Add e2e tests for "Link in the editor", "Inline code on macOS", "Previous tab from the editor", "Catalogue
      shortcut wins over an editor key", and that "Key handled by the Find input" (`reading-mode.test.ts:128`) still
      passes; verify they pass.
- [x] 8.2 Replace Mod+Tab with physical Ctrl+Tab / Ctrl+Shift+Tab as the displayed bindings on every platform (Ctrl+
      PageDown/PageUp stay aliases), and teach `formatShortcut` ⌃, ⇥ and PageUp/PageDown on macOS and their names
      elsewhere; update the shortcuts dialog and menu hints. Add `shortcutForKeyEvent` and formatting unit tests for
      darwin and other platforms; verify them, and check Control+Tab and Cmd+K/Cmd+E in the real app.
- [x] 8.3 Load Monaco's `wordOperations` and `linesOperations` contributions in `monacoSetup.ts`, configure the
      specified Linux Copy Line Down binding, and add their mocks in
      `frontend/tests/unit/components/monacoLanguages.test.ts`, with a unit test that the word and line commands are
      registered. Add an e2e test covering the scenarios of "Text navigation and line editing keys" (word move,
      select and delete, line start/end, document start/end, line operations, read-only document) using the running
      platform's keys; verify they pass, check Option+arrows and Cmd+arrows in the real app on macOS, and record the
      main-chunk size before and after. `defb77e` strengthened the unit test (`monacoCommands.test.ts`, "monacoSetup
      registers the word and line editing commands") so that it fails when the contributions are not loaded; in the
      same commit the 11.1 test "sends windowMaximized once across N resizes that leave the maximized state
      unchanged" and the 16.1 test "follows a real resize across the 376 and 377 px boundary without writing an
      arrangement" were made to fail without their fixes.

## 9. Startup and rendering failures are visible

Spec: app-shell "Window shown only when ready", "Unexpected interface error", "Quitting from the error screen";
markdown-preview "Live update and degradation". Design §8.

- [x] 9.1 Arm a 12-second watchdog in `NativeWindowService.Restore` (`internal/application/native_window.go:53-90`)
      that shows a still-hidden, non-headless window, with an injected clock like `ShutdownClock`
      (`shutdown.go:68-77`); add a test in `tests/go/integration/application/native_window_test.go` with
      `recordingNativeWindow` and a fake clock that `Show` is called without `FrontendReady` and not called twice;
      verify it passes and, in the real app, that a forced settings-step failure becomes visible.
- [x] 9.2 Make `CommittedPreview` (`frontend/src/ui/components/MarkdownView.tsx:190`) the preview's error boundary,
      showing the existing inline error (`:229`), not committing a failing candidate in `commitSuccessfulRender`
      (`:198-213`) and resetting on new content or document; add a component test with a throwing child, an
      integration test for "Drawing failure" (editor, tabs and menus keep working) and one for "Recovery after a
      drawing failure"; verify they pass.
- [x] 9.3 Add the root error boundary around `AppContents`' rendered content, keeping `useDocumentSession`,
      `useBootstrap` and `useShutdown` above it. Reuse StartupFailure layout/tokens, catalogue strings, Button and
      ModalShell; focus Reload interface. Extend the existing app-model adapter to retain pending/in-flight buffer
      generations before passive editor cleanup and expose unacknowledged document IDs. Flush all open/pending IDs
      with one aggregate 1,000 ms attempt limit; reload only after acknowledgment, retaining text and retry controls
      on rejection/timeout and ignoring late completion. Cancel/await a current frontend-owned close before reload;
      native-owned close blocks reload until a later retry after native Cancel.
      Extend the existing native lifecycle owner/handler/adapter/controller with `AcknowledgeRecoveryClose` and
      `DiscardAndAuthorizeQuit`, and project required `PendingClose.owner` through full bootstrap/hydration.
      Recovery acknowledgment stops the deadline for that ID. Count backend dirty and pending-only IDs once; Cancel
      preserves text/scheduling, confirmed discard starts no document write. Add a reversible model admission fence
      that stops/retains autosave intents, waits counted already-admitted writes and flushes layout; resume only
      latest retained intents on refusal/Cancel. Replace boolean-only write admission with a per-document count
      released exactly once on every terminal path. A ready-frontend ten-second timeout always native-confirms
      possible undelivered text, even with clean backend metadata; normal responsive/pre-readiness close stays intact.
      Serialize ownership transfer with model guards: quit plans capture their frontend-owned native close ID and
      retain documents after executing requested saves. Atomically validate the completed revision-bound quit plan and
      install the discard fence and native ownership at authorization; native-owned hydration never starts normal
      close work, and transfer/Cancel/fresh IDs cannot revive stale plans. Ordinary closes reuse existing removal.
      Add failing adapter/hook/integration tests for crash-unmount retention, older in-flight plus newer pending,
      two-document reload, rejection/timeout/retry/late completion, focus, pending-only discard count and all close
      origins. Add Go race tests for scheduled/admitted/queued writes, timer installation and fence races,
      Cancel/refusal resumption, stale IDs/permits, native fallback versus acknowledgment, and reload/native-Cancel
      preserving tabs/text. Explicitly permit an owner-level white-box admission/terminal-removal test for the
      controlled gap before Commit and final mutation; also test real queued execution. Keep ordinary save/autosave,
      external reload, close workflow and startup regressions green. Update native bridge documentation and durable
      lifecycle decision, run strict OpenSpec validation and all six verification stages, and use an isolated real
      app to verify reload, modified-document Quit/Cancel, native shortcut/window close and unchanged disk bytes
      after confirmed discard (already-admitted atomic writes may finish).

## 10. Preview measurement only while visible

Spec: markdown-preview "Live update and degradation" (behaviour unchanged). Design §9. Owners:
`frontend/src/logic/hooks/useLivePreview.ts` (`:32-39, 114`), `EditorStage.tsx` (`:307, 385`),
`frontend/src/app/useTidyCommands.ts` (`:162`), `frontend/src/logic/tidy/chunking.ts` (`:40`).

- [x] 10.1 Add one UTF-8 byte-length helper in `frontend/src/logic/` (unit-tested with ASCII, multi-byte and surrogate
      pairs) and use it in all three places; give `useLivePreview` a `visible` input that skips the measurement while
      hidden and memoize it on content; verify the existing preview, 2 MiB pause and tidy tests pass and a hook test
      shows no measurement while hidden.

## 11. Layout persistence never blocks

Spec: app-shell "Quitting is not blocked by layout storage". Design §10. Owners: `frontend/src/app/useWindowGeometry.ts`,
`internal/appmodel/service.go`, `internal/appmodel/close_drain.go`.

- [x] 11.1 Send `windowMaximized` only when it changes and add a hook test that N resize events with an unchanged
      maximized state send it once (width and height stay debounced in the backend, `service.go:478-500`), plus a
      backend test that resizes cause no immediate layout repository write; increment the layout sequence under the service lock and add a concurrent `SetUILayout` test under
      `-race`; verify both pass.
- [x] 11.2 Make close drain log and drop a failing layout flush; add a `close_drain_test.go` case with a failing layout
      repository asserting the drain succeeds (replacing `TestDrainBeforeCloseClassifiesALayoutFailure`), keep the
      existing document-write-failure case fatal; update ADR-0013's wording in `docs/architecture.md` (`:871`) to
      "flushed on close when possible"; verify the tests pass.

## 12. UI cleanup

No spec change. Owners: `frontend/src/ui/primitives/Toast.module.css`, `frontend/src/ui/styles/tokens.css`,
`frontend/stylelint.config.mjs`, `frontend/src/ui/widgets/Menubar/Menubar.tsx`.

- [x] 12.1 Give the success toast the success stripe (matching `Banner.module.css`) and remove the unreachable `stuck`
      selector; add a component test of the save-success toast's computed border colour; verify it passes.
      `defb77e` strengthened the test (`Toast.test.tsx`, "gives the success toast the same stripe colour as the
      success banner") so that it fails without the fix.
- [x] 12.2 Remove the overridden declarations and merge duplicate selectors in `tokens.css`, and enable stylelint
      `no-duplicate-selectors` for it; verify regenerated `generatedEditorThemes.ts` and `generatedHighlight.css` are
      byte-identical and `scripts/verify lint` passes.
- [x] 12.3 Extract the File and About menu item lists in `Menubar.tsx` into local render helpers shared by the narrow
      and wide branches; verify the menubar integration and e2e menu tests pass unchanged.

## 13. Faster build and verification, real product metadata

No spec change. Design §12. Owners: `scripts/build`, `scripts/verify`, `scripts/lib/stages.sh`,
`frontend/tests/support/prepare.ts`, `.github/workflows/release.yml` and `verification.yml`, `wails.json`,
`build/darwin/`, `build/windows/`.

- [x] 13.1 Set `GOMARKEDIT_E2E_REUSE_DIST=1` for the E2E stage in `scripts/verify` when Build passed in the same run,
      pass `-skipbindings` and `-trimpath` to `wails build` (`scripts/build:106-126`), drop `-gcflags all=-N -l` from
      the e2e binary (`prepare.ts:243`), and give golangci-lint (`stages.sh:9`) a package list that excludes
      `frontend/node_modules`; verify a full `scripts/verify` passes and compare stage times with
      `scripts/baseline --compare` (the branch baseline is recorded before the change's first edit).
- [x] 13.2 Run both Jest stages with `--maxWorkers=50%`; verify two consecutive green runs of unit and integration and
      fix any test that depends on order.
- [x] 13.3 Do not repeat verification inside the release build. As delivered, `release.yml` validates the version
      and source revision, reuses the newest trusted successful `master` verification of the exact commit or, when
      there is none, calls the reusable `verification.yml`, and then builds each of the five native targets once
      with `scripts/build --release --platform OS/ARCH --version VERSION`. The release build jobs run no tests and
      launch no distributable: the exact release binary is not exercised in CI (`docs/index.md` 10.3). This replaces
      the planned build-once-and-verify-against-it design, and the pipeline is owned by the separate change
      `verification-first-release-ci`; its nine commits on this branch (`006d110`, `6b1a3c5`, `7dba80c`, `9037a3d`,
      `ce5b96a`, `bc329bf`, `e119f6e`, `6ece931`, `6c7a0a9`, the ones that touch
      `openspec/changes/verification-first-release-ci/`) belong to that change and are not part of this one's
      acceptance. The release-job hardening in `569fd87`, `8edac6e`, `3b65a97`, `fa220e3` and the manual container
      job in `5560da1` follow the same design. Verified by the evidence recorded in
      `openspec/changes/verification-first-release-ci/evidence.md` and by its tests under `tools/verify/`.
- [x] 13.4 Add the `info` block to `wails.json` with a numeric `X.Y.Z` `productVersion`, and set the bundle identifier
      `io.github.sanyokkua.gomarkedit` in `build/darwin/Info.plist:11`, `build/darwin/Info.dev.plist:11` and
      `build/windows/wails.exe.manifest:3`; verify with `plutil -p` on the built `Info.plist`, check the rendered
      Windows manifest version is four numeric parts, and update "10.3 CI and Release" in `docs/index.md`.

## 14. Smaller preview bundle

No spec change. Design §12. Owners: `frontend/src/logic/markdown/highlight.ts`, the preview's rehype pipeline,
`frontend/package.json`.

- [x] 14.1 Replace `rehype-highlight` with a small rehype plugin on `createLowlight()` registering only the app's 26
      grammars and reading code text with `hast-util-to-text`, keeping class names and the unknown-language behaviour, and remove the direct `mdast-util-math`
      dependency; add a unit test comparing highlighted output for every registered language; verify preview tests
      pass, `bundle-scan` passes, and the main chunk shrinks (record before and after sizes). The application entry
      fell from 1,469,513 to 1,425,551 bytes (gzip: 439,589 to 429,175 bytes).

## 15. Test hygiene

No spec change. Owners: the nine renamed `frontend/tests/integration/` suites,
`frontend/tests/unit/settings/settingsCommands.acknowledgement.test.ts`,
`frontend/tests/e2e/late-completion.test.ts`, `frontend/tests/support/harness.ts`.

- [x] 15.1 Rename the ten `*.legacy` test files by feature, drop the retired parity-harness comments (`appShell`,
      `editorStage`, `editorStage.view`, `formattingToolbar`), and replace the source-text and regex assertions
      (`appShell`, `editorStage`, `formattingToolbar`, `menubar`) with the existing lint, token and bundle guards
      (confirm each guard covers the case it replaces); verify the unit and integration test counts are unchanged
      apart from the removed source-grep cases.
      Coverage map: Stylelint guards literal colours; existing ESLint ownership and localization rules guard
      shared roles, labels and portals; the scoped shell ESLint restriction guards the five network API names and
      remote URL literals, and bundle-scan guards production assets. Runtime label, absence, popup ownership and
      interaction assertions remain in the renamed suites. Real-backend browser checks cover workspace tracks at
      375/376/377 and 768/769 px, toolbar gap and wrapping, popup position and shadow, menu label ellipsis, and
      foreign requests. `editor-split-resize.test.ts` already covers narrow Split geometry. Computed CSS checks verify
      rendered presentation; token guards do not enforce particular CSS values or variable names.
- [x] 15.2 Let the harness install Playwright's clock before navigation and use it in `late-completion.test.ts`
      (`:103-110`) to advance past the frontend's 10-second stuck-command notice (`boundMs`,
      `frontend/src/logic/adapter/command.ts:75`) instead of waiting 10 seconds of real time, stopping the lock helper right after Retry or Cancel; verify the test
      passes and its duration drops. The measured serial run fell from 32.8 seconds to 5.2 seconds; five repeated
      runs passed with the real SQLite lock and backend bridge.

## 16. Minimum-window Split repair

Existing spec: editor "View arrangements". Owner: `frontend/src/ui/widgets/EditorView.tsx`.

- [x] 16.1 Keep both panes visible in Split at CSS widths of 375 and 376 px, with the existing vertical layout and no
      divider, without changing the stored arrangement or split ratio. Cover resize across 376/377 px with integration
      and real-backend browser geometry tests, and preserve Editor, Preview and Reading behavior.

## 17. System appearance reconciliation

Existing spec: appearance-themes "Auto mode follows the system". Owner: `frontend/src/logic/theme/theme.ts`.

- [x] 17.1 Reconcile the current system appearance after subscribing in Auto mode so a change between the initial
      application and listener registration cannot leave the palette stale. Cover the missed-event interval and
      listener cleanup, and exercise appearance changes in the real-backend browser suite. Delivered in `f269484`
      (`observeSystemAppearance` in `frontend/src/logic/theme/theme.ts` calls the listener once after subscribing;
      unit test "reconciles a system change between applying Auto and subscribing" in `theme.test.ts`).

## 18. Save and conflict feedback follow-up

- [x] 18.1 Give the conflict tab label bounded text geometry; verify inactive and narrow tabs in the real browser.
- [x] 18.2 Show one warning instead of a success toast for a committed explicit save with a warning; cover Save and Save As.
- [x] 18.3 Preserve the post-replacement failure reason across explicit, autosave and close paths and show safe specific localized guidance; cover each failure and unknown fallback using the existing atomic replacement and save identity white-box tests.
- [x] 18.4 Preserve classified asynchronous error explanations and applicable actions with a safe legacy fallback; cover delivery and deduplication.
- [x] 18.5 Run six-stage verification, compare the baseline, validate OpenSpec and exercise the real application; review the changes and update public-surface documentation.

## 19. File replacement guards

Spec: file-lifecycle "A file that appears during creation is never replaced". Design §5 (new targets). Owner:
`internal/file/atomic_replace.go` and its platform files.

- [x] 19.1 Commit a new target (the expected disk state says it does not exist) with a no-replace move:
      `renamex_np` with `RENAME_EXCL` on macOS and `renameat2` with `RENAME_NOREPLACE` on Linux
      (`internal/file/atomic_replace_create_darwin.go`, `_linux.go`), `link(2)` and then an existence check where the
      filesystem lacks exclusive rename (`atomic_replace_create_unix.go`, `atomic_replace_create_other_unix.go`), and a
      move without `MOVEFILE_REPLACE_EXISTING` on Windows (`atomic_replace_windows.go`); classify a collision as a
      conflict and remove the temporary file. Delivered in `19e7414`. Proof: the white-box
      `TestAtomicReplaceNewTargetNeverReplacesFileCreatedBeforeCommit` in `internal/file/atomic_replace_test.go`
      (kept in-package because it creates the competing file between the check and the commit; it asserts the other
      program's bytes survive and no temporary file is left). Docs: the atomic replacement paragraph of "Editing,
      saves and conflicts" in `docs/architecture.md`.
- [x] 19.2 Make `AtomicReplace` refuse an expected existing version that comes without its raw-byte fingerprint,
      instead of fingerprinting whatever is on disk. No spec change (internal contract; no production caller relied
      on it). Delivered in `aa143dc`. Proof: `TestAtomicReplaceRefusesAnExistingBaselineWithoutItsByteFingerprint` in
      `tests/go/unit/file/atomic_replace_public_test.go`; the test executors in `close_plan_test.go` and
      `save_identity_test.go` now pass the snapshot's expected hash. Docs: `docs/architecture.md` (same paragraph).

## 20. Conflict decisions and the application's own writes

Spec: external-change-conflict "Choices for a writable document", "Save As onto the document's own file", "Conflict
found during replacement", "The application's own save is not an external change". Design §3 and §5.1. Owners:
`internal/appmodel/conflict.go`, `save.go`, `write_coordinator.go`.

- [x] 20.1 Keep mine takes effect only when its write commits: match the keep-mine record without consuming it, use
      its disk version and fingerprint as the write's expected state, and adopt the baseline and clear the record
      when the write commits. Delivered in `373d90c`; `dbcab50` added the read-only-target case. Proof in
      `tests/go/integration/appmodel/keep_mine_commit_test.go`
      (`TestCancelledSaveAsAfterKeepMineLeavesTheExternalVersionUndecided`,
      `TestKeepMineSaveThatCannotBeEncodedLeavesTheExternalVersionUndecided`,
      `TestCancelledClosePlanAfterKeepMineLeavesTheExternalVersionUndecided`) and `keep_mine_commit_unix_test.go`
      (`TestKeepMineSaveWhoseReplacementFailsLeavesTheExternalVersionUndecided`,
      `TestKeepMineSaveRetriedAfterAFailedReplacementStillWritesTheBuffer`,
      `TestKeepMineCannotWriteAFileThatBecameReadOnlyAfterAuthorization`); the stale-ending cases
      `TestSaveRefusesANormalizationAuthorizedForAnotherLineEnding` (and the Save As and close-plan variants) live in
      `internal/appmodel/lifecycle_retention_test.go` (`61f4c2a`). Docs: "Editing, saves and conflicts" in
      `docs/architecture.md`; design §3 states the known limitation that a foreground Keep mine is not remembered.
- [x] 20.2 Compare a Save As onto the document's own file (same path, symbolic link or hard link) with the loaded
      version. Delivered in `3cbdf43`. Proof in `tests/go/integration/appmodel/save_as_own_file_test.go`
      (`TestSaveAsOntoTheDocumentsOwnFileComparesAnExternalEditMadeWhileTheDialogWasOpen` for the three aliases,
      `TestSaveAsOntoTheDocumentsOwnFileIgnoresATimestampOnlyTouch`,
      `TestSaveAsOntoTheDocumentsOwnFileAfterKeepMineWritesTheBuffer`). Docs: `docs/architecture.md` (Save As
      paragraph).
- [x] 20.3 Turn a conflict found during replacement of the document's own file into the comparison (different bytes)
      or one more write against the refreshed version (timestamp only). Delivered in `900806f`. Proof in
      `tests/go/integration/appmodel/save_replace_conflict_test.go`
      (`TestSaveThatMeetsAnExternalEditDuringReplacementReturnsTheComparison`,
      `TestSaveThatMeetsATimestampOnlyTouchDuringReplacementCommits`). Docs: `docs/architecture.md`.
- [x] 20.4 Hold a per-document disk claim from replacement until the written baseline is adopted and take it in every
      disk inspection. Delivered in `e0e395a`. Proof: `TestExternalChangeCheckDuringTheAppsOwnSaveFindsNoConflict`
      in `tests/go/integration/appmodel/save_check_race_test.go`. Docs: `docs/architecture.md` (fingerprint
      paragraph).

## 21. Editor updates carry their base revision

Spec: editor "Edits typed before a reload are discarded". Design §1 (second guard). Owners:
`frontend/src/logic/hooks/useSyncedBuffer.ts`, `frontend/src/logic/adapter/appModelAdapter.ts`,
`internal/appmodel/document.go`, `handler.go`, `internal/apperr/results.go`.

- [x] 21.1 Drop an editor session's unsent buffer update when an external reload ends the session. Delivered in
      `93d6d06`. Proof: `useSyncedBufferExternalReplacement.test.ts` ("drops an unsent edit from the editor session
      that an external reload replaced", "still sends edits made in the editor session that follows the reload").
      Docs: the editor-epoch paragraph of "Backend truth and frontend working copy" in `docs/architecture.md`.
- [x] 21.2 Give `UpdateBuffer` the revision its editor session was installed from and answer an update based before
      the latest reload with `BufferUpdateResult{status: "superseded"}`, which the adapter settles silently.
      Delivered in `36ef39f`; the regenerated bindings changed `UpdateBuffer` to take the base revision. Proof:
      `tests/go/integration/appmodel/buffer_base_test.go`
      (`TestBufferUpdateBasedBeforeAReloadIsRefusedAndAutosaveKeepsTheReloadedText`,
      `TestBufferUpdateBasedOnAnEarlierEditOfTheSameSessionIsAccepted`,
      `TestBoundUpdateBufferReportsASupersededBaseWithoutAnError`), the adapter test "sends the base revision and
      silently drops an update the backend reports as superseded" and the third case of
      `useSyncedBufferExternalReplacement.test.ts`. Docs: ADR-0042 and the same architecture paragraph.

## 22. Work added after the plan

No spec change except where named. Each item lists the commit that delivered it.

- [x] 22.1 Fit the status-bar facts within the available width, keeping protected controls and restoring moved labels
      when they fit again (`8027ec2`), and keep its layout state in a data attribute (`4cfdc17`). Proof:
      `frontend/tests/unit/statusBar.test.tsx` ("fits facts to the row, preserves protected controls and restores
      moved labels when they fit") and the e2e tests in `tidy-problems.test.ts` ("keeps Details within the
      minimum-width status row while saving stale findings", "fits the status to the workspace column and restores
      facts as it grows").
- [x] 22.2 Bound the Mermaid style sanitizer's scans (`cc5cc1d`) and simplify them (`9a3fd34`, `scrub.ts`); the same
      commit gives panes and dividers an accessible relationship (`aria-controls`), stops exposing an empty tab list,
      and makes a tidy request for a different document start no work; `d083f0f` documents the splitter pane
      relationships in `docs/architecture.md`. Proof:
      `frontend/tests/unit/markdown/mermaid/scrub.test.ts` ("handles long malformed URL text in safe quoted CSS
      without quadratic work" and its siblings), `Sidebar.test.tsx`, `TabBar.test.tsx`,
      `editorStage.arrangements.test.tsx`, `tidyCommands.test.tsx` ("refuses a tidy request for a different document
      without starting work").
- [x] 22.3 Keep Format, Compact and Lint responsive on malformed or whitespace-heavy input (`f71fcb3` for
      `formatting.ts`, `dc8a838` for `frontend/src/logic/tidy/`). Proof: `frontend/tests/unit/format/formatting.test.ts`
      ("handles long malformed link labels without blocking formatting") and the tidy unit tests ("Format handles long
      interior whitespace without repeated suffix scans", "Compact handles long interior whitespace without repeated
      suffix scans", "Lint handles long interior whitespace without repeated suffix scans", "chunking handles a long
      malformed math opener without repeated scans").
- [x] 22.4 Detect changed bytes with preserved metadata through a raw-byte fingerprint, check every tab activation and
      background document, keep one conflict queue ordered close, write, foreground, and make background Reload leave
      the active editor alone (`39a5599`). Spec: external-change-conflict "What counts as a change" (scenario "Bytes
      change while filesystem metadata is preserved"), "Conflict queue" and "Reload is not undone by a later write"
      (scenario "Reload a background tab"). Proof: `TestExternalChangeWithUnchangedMetadataIsDetected`,
      `TestConflictDecisionsRejectSameMetadataChangedBytes`, `TestKeepMineWritesWhenExternalBytesRevertWithCommittedMetadata`,
      `TestClosingActiveTabChecksNewlySelectedFile`, `TestFingerprintRejectsNamedPipeWithoutWaiting`,
      `frontend/tests/integration/externalChanges.test.tsx` and `external-changes.test.ts`. Docs: design §5.1 and
      "Editing, saves and conflicts" in `docs/architecture.md`.
- [x] 22.5 Add the local SonarQube command and configuration (`f89131b`: `scripts/sonar`, `sonar-project.properties`,
      `tools/verify/sonar.test.mjs`, "Local SonarQube analysis" in `docs/index.md`), and resolve the findings it
      reported in changed code without suppressing a rule (`477be79`, `e45ae49`, `0a2627f`; `5560da1` formats the
      script and adds the manual native AMD64 container job). Proof: `tools/verify/sonar.test.mjs`; the refactors keep
      their existing tests, and `0a2627f` restructured `internal/appmodel/save_identity_test.go` around the changed
      save helpers.
- [x] 22.6 Release verification and the five-target release build (nine commits that touch
      `openspec/changes/verification-first-release-ci/`: `006d110`, `6b1a3c5`, `7dba80c`, `9037a3d`, `ce5b96a`,
      `bc329bf`, `e119f6e`, `6ece931`, `6c7a0a9`) belong to the change `verification-first-release-ci`, not to this
      change's acceptance; see 13.3. Docs: "10.3 CI and Release" in `docs/index.md`.
