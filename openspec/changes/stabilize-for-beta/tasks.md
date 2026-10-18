# Tasks

Each group is one vertical slice: production change, its regression tests and its documentation. Run the focused
tests while working and the relevant `scripts/verify` stages before ticking a box. Group 1 goes first so that later
end-to-end runs no longer touch the developer's desktop. New durable decisions go in the "Durable decisions" ADR table
of `docs/architecture.md` (last existing entry ADR-0039).

## 1. End-to-end runs leave the desktop alone

No spec change (test isolation). Design §11. Owners: `main.go`, `internal/application/application_context_holder.go`
(port wiring, `:90-93`), `internal/file` (`reveal.go`, `clipboard.go`), `internal/appmodel/options.go`
(`WithRevealPort`, `WithClipboardWriter`), `frontend/playwright.config.ts`, `frontend/tests/support/`
(`harness.ts`, `nativeClipboard.ts`), `.github/workflows/push.yml` and `release.yml`.

- [ ] 1.1 Add recording implementations of `file.RevealPort` and `file.ClipboardWriter` in `internal/file` that append
      one line per call to a file in the application configuration folder, and add them through
      `options.AppModelOptions` in `main.go` only when `application.E2EHeadlessEnabled()` is true. Record the two
      headless-flag uses (hidden window, recording ports) as ADR-0041 in `docs/architecture.md`. Verify with a Go
      unit test of the recorders, a Go integration test that the headless option set replaces the platform ports,
      and `scripts/verify lint` (referenced-path rules).
- [ ] 1.2 Add a harness helper that reads the recorded calls from the isolated e2e profile (`harness.ts:40-54` sets
      `HOME` on macOS and `XDG_CONFIG_HOME` elsewhere); change `real-files.test.ts` (Copy path, `:184`; Reveal,
      `:156,180`) to assert the recorded path and drop its `@native-clipboard` tag (`:140`); `preview-links.test.ts`
      keeps asserting `recordLinkBridge` (`:223-260`), whose passthrough now reaches the recorder. Verify both files
      pass and no Finder window opens during a local run.
- [ ] 1.3 Run the `chromium-native` Playwright project (`playwright.config.ts:60-67, 84-91`) only when
      `E2E_NATIVE_CLIPBOARD=1` or in the macOS subset; set the variable in `release.yml` and in the `push.yml` job
      that selects `chromium-native` via `E2E_PROJECTS` (`:165`). Add one fixture in `nativeClipboard.ts` that saves
      the clipboard text before each native-clipboard test and restores it after; use it in `rich-rendering`
      (replacing the restore at `:914/:1059`), `reading-mode` (replacing `:538/:546` and covering the unrestored
      test at `:517-528`) and `editor-round-trip` (`:141-172`, which restores nothing today). Document
      `E2E_NATIVE_CLIPBOARD` next to the E2E rows in `docs/index.md` (`:199`) and `docs/architecture.md`
      (`:510-529`). Verify a full local `scripts/verify e2e` leaves `pbpaste` output unchanged and the tagged tests
      pass with the variable set.

## 2. Reload is not undone by a later write

Spec: external-change-conflict "Reload is not undone by a later write". Design §1. Owner:
`frontend/src/logic/hooks/useSyncedBuffer.ts` (`adoptDocument` `:119-129`, activation token `:94-103`).

- [ ] 2.1 Write a failing hook test in `frontend/tests/unit/hooks/useSyncedBuffer.test.ts` (reuse the plain
      `EditorSynchronizationAdapter` from "never flushes the outgoing document text or caret into the incoming
      document", `:247`): edit, rerender with a new external epoch and the reloaded text, flush; the flush must not
      send the pre-reload text. Then make adoption key on the activation token and reset content, cursor,
      selection, scroll and view refs from props; verify the test passes and the existing hook and `closeWorkflow`
      integration tests stay green.
- [ ] 2.2 Add an e2e test in `real-files.test.ts` for the scenarios "Tab switch after reload with autosave on" and
      "Save right after reload". Verify it fails on the pre-fix code path (revert locally) and passes with the fix;
      exercise the same sequence in the real app.

## 3. Undo survives tab switches

Spec: editor "Editor stage with preserved working state" (scenarios "Switch tabs", "Undo after reload"). Design §2.
Depends on group 2 (activation token adoption). Owners: `frontend/src/app/useDocumentSession.ts`,
`frontend/src/ui/components/CodeEditor.tsx`, `frontend/src/ui/widgets/EditorStage/EditorStage.tsx`,
`frontend/src/ui/widgets/EditorView.tsx`.

- [ ] 3.1 Make `externalEpoch` per document in `useDocumentSession` (`:14-19`) and use the document's own epoch for
      the activation token and model path. In `CodeEditor`, keep one model per open writable document in a
      module-local registry keyed by that path: `keepCurrentModel`, no `model.dispose()` in the cleanup
      (`:416-420`), disposal when the id leaves the new `openDocumentIds` prop (passed from `EditorView.tsx:250`
      through `EditorStage`; `EditorView` selects `state.documents.orderedIds`) or a newer epoch appears, and disposal before mount when the cached text differs from
      `initialValue`; read-only documents are not cached. Give the `@monaco-editor/react` mock in
      `frontend/tests/unit/components/CodeEditor.test.tsx` (`:252-289`) a path-to-model map and change the disposal
      assertions (`:699-700`, `:1080-1081`) to the new contract: disposed on close and on reload, kept on tab
      switch, replaced when the backend text differs. Verify the component and `useDocumentSession` tests pass.
- [ ] 3.2 Rebind the per-activation state to the kept model on every activation: link provider registration, lint
      decorations, the scroll port and `attachEditor` with the new activation token. Add component tests that after
      A → B → A the links, lint markers and scroll restore work on A and none of B's registrations remain; verify
      they pass with the existing `CodeEditor` and `EditorStage` tests.
- [ ] 3.3 Add an e2e test for "Switch tabs" and "Undo after reload". Record the refinement of ADR-0014 as ADR-0040 in
      `docs/architecture.md`; verify the e2e test passes and the behaviour in the real app.

## 4. Keep mine works on mixed-line-ending files

Spec: external-change-conflict "Keep mine together with line-ending normalization"; file-lifecycle "Autosave"
(scenario "Mixed endings wait for the user"). Design §3. Owner: `internal/appmodel` (`save.go:23-28, 77-83, 120-126,
267-296`, `conflict.go:27-35, 150-201, 252-334, 446-459`, `lifecycle.go:118-123`, `close_plan.go:163, 190, 742`,
`autosave.go:165-174`).

- [ ] 4.1 Write failing Go integration tests: in `tests/go/integration/appmodel/conflict_test.go` with a file
      `"a\r\nb\n"` (external edit, buffer edit, Save → normalization, Save(N) → conflict, Keep mine, Save(K) →
      committed); the "Skip asks again" and "Keep mine from an earlier conflict" cases; Keep mine, then a focus check
      (`CheckExternalChanges`) for the same disk version, then Save writes the file; and the same flow through the
      close plan in `close_plan_test.go` reusing `writeMixedDocument` (`close_plan_test.go:433`). Implement the
      accepted flag (set in `inspectDocument`, which already receives the token), the copy onto the keep-mine record, the
      keep-mine token in `normalizationAuthorizationForLocked`, the `proposedEnding` check in
      `validNormalizationTokenLocked`, the re-keying on consumption and the version-scoped keep-mine reset in `registerConflict`;
      verify the tests pass with `go test -race`.
- [ ] 4.2 Exclude mixed-ending documents in `autosaveEligibleLocked` and add an `autosave_test.go` case using
      `fakeAutosaveClock` (`support_test.go:208`) and `writeMixedDocument`: Save returns the prompt, the clock fires,
      confirming the original token writes once; add a close-drain case showing `flushAutosaveForClose` mints no
      token. Verify they pass and the frontend `saveTidy` keep-mine integration test stays green.

## 5. Post-save state matches the file on disk

Spec: external-change-conflict "What counts as a change" (scenarios "Touched after a save", "Touched after saving an
untitled document without a line break"); file-lifecycle "Byte-preserving encoding" (scenario "BOM kept after Save
As"). Design §4. Owners: `internal/appmodel/save.go` (`:400, 555-558, 639-659`), `internal/file/document_reader.go`
(`classifyDocumentBytes` `:229`), `internal/appmodel/save_status.go`.

- [ ] 5.1 Write failing tests: open an LF file, edit, Save, `os.Chtimes`, check external changes → unchanged; the
      same for an untitled document saved as "hello" with no newline; and a BOM file through Save As, edit, Save →
      still starts with EF BB BF and the metadata reports a BOM. Export a byte classifier from `internal/file`, use
      it for every committed write, take the BOM from the encoder outcome and delete
      `characteristicsForWrittenSnapshot`; verify the tests pass.
- [ ] 5.2 Remove the unused `failedWrite` field, `markFailedWrite` and their reads (design §4 lists them); verify
      `go vet`, the appmodel unit and integration suites and the frontend dirty-state tests stay green.

## 6. File permissions

Spec: file-lifecycle "Write-protected files" and "Permissions of new files"; actions-shortcuts "Read-only documents"
(scenario "Save As of a write-protected file"); external-change-conflict "What counts as a change" (scenario
"Permissions changed") and "Choices for a read-only document" (scenario "File became write-protected"). Design §5. Depends on group 5 (the post-write classifier records the mode). Owners:
`internal/file/atomic_replace.go` (`:111, 174-178`), `internal/file/document_reader.go` (`ReadCapability` `:23-30`,
decision `:239-255`), `internal/appmodel/save.go` (`:116-118, 281-283`), `internal/appmodel/conflict.go` (`:521`),
`frontend/src/ui/components/readOnlyReason.ts`, the Save As availability rule in
`frontend/src/logic/actions/actionRegistry.ts`, the frontend catalogue.

- [ ] 6.1 Chmod a newly created target's temporary file to `0666 &^ umask` before the rename (umask read once at start
      on Unix); assert the mode in "new target uses normal creation semantics" (`internal/file/atomic_replace_test.go:91`)
      and add appmodel integration tests for Save As to a new path and Save after an external delete, each followed
      by a focus check that raises no conflict; verify they pass.
- [ ] 6.2 Add the `write-protected-read-only` capability for files without the owner-write bit, map it in
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

- [ ] 7.1 Choose the committed-save warning by the precedence in design §6 (durability, Recent Items, view state) in
      `save.go`; map codec
      encode failures to `unsupported-input` with no remediation; add Go tests for "Recent Items cannot be stored",
      "Durability not confirmed", "Two accompanying failures", "Durability and Recent Items both fail" and
      "Unencodable text"; verify they pass.
- [ ] 7.2 Show the committed-save warning in `useDocumentWrites` with new notification codes and catalogue strings;
      add `subscribeBufferSyncErrors` to the adapter (first failure reported, silent until a send succeeds) and show
      it through `notifyError` from `AppWorkflows`; handle a rejected full-screen toggle. Add frontend integration
      tests using the existing adapter fakes for each, including "Delivery fails" and "Delivery recovers" (the
      pending text is sent with the next edit); verify they pass.

## 8. Shortcuts work while the editor has focus

Spec: actions-shortcuts "Application and window shortcuts", "Shortcut dispatch", "Shortcuts in the editor text
area"; editor "Text navigation and line editing keys". Design §7. Owners:
`frontend/src/ui/widgets/useEditorActionExecutor.ts` (`:96-114`), `frontend/src/ui/widgets/DocumentTabs/DocumentTabs.tsx`
(`:484-546`), `frontend/src/logic/actions/useShellShortcuts.ts`, `frontend/src/logic/actions/actionRegistry.ts`
(`:441-448`), `shortcutRegistry.ts`, `frontend/src/ui/components/monacoSetup.ts`.

- [ ] 8.1 Register the executor, tab and shell listeners in the capture phase for events targeted at the editor text
      area, stopping propagation when an available command matches; leave Find/Replace inputs on the bubble path.
      Add e2e tests for "Link in the editor", "Inline code on macOS", "Previous tab from the editor", "Catalogue
      shortcut wins over an editor key", and that "Key handled by the Find input" (`reading-mode.test.ts:128`) still
      passes; verify they pass.
- [ ] 8.2 Replace Mod+Tab with physical Ctrl+Tab / Ctrl+Shift+Tab as the displayed bindings on every platform (Ctrl+
      PageDown/PageUp stay aliases), and teach `formatShortcut` ⌃, ⇥ and PageUp/PageDown on macOS and their names
      elsewhere; update the shortcuts dialog and menu hints. Add `shortcutForKeyEvent` and formatting unit tests for
      darwin and other platforms; verify them, and check Control+Tab and Cmd+K/Cmd+E in the real app.
- [ ] 8.3 Load Monaco's `wordOperations` and `linesOperations` contributions in `monacoSetup.ts` and add their mocks in
      `frontend/tests/unit/components/monacoLanguages.test.ts`, with a unit test that the word and line commands are
      registered. Add an e2e test covering the scenarios of "Text navigation and line editing keys" (word move,
      select and delete, line start/end, document start/end, line operations, read-only document) using the running
      platform's keys; verify they pass, check Option+arrows and Cmd+arrows in the real app on macOS, and record the
      main-chunk size before and after.

## 9. Startup and rendering failures are visible

Spec: app-shell "Window shown only when ready", "Unexpected interface error", "Quitting from the error screen";
markdown-preview "Live update and degradation". Design §8.

- [ ] 9.1 Arm a 12-second watchdog in `NativeWindowService.Restore` (`internal/application/native_window.go:53-90`)
      that shows a still-hidden, non-headless window, with an injected clock like `ShutdownClock`
      (`shutdown.go:68-77`); add a test in `tests/go/integration/application/native_window_test.go` with
      `recordingNativeWindow` and a fake clock that `Show` is called without `FrontendReady` and not called twice;
      verify it passes and, in the real app, that a forced settings-step failure becomes visible.
- [ ] 9.2 Make `CommittedPreview` (`frontend/src/ui/components/MarkdownView.tsx:190`) the preview's error boundary,
      showing the existing inline error (`:229`), not committing a failing candidate in `commitSuccessfulRender`
      (`:198-213`) and resetting on new content or document; add a component test with a throwing child, an
      integration test for "Drawing failure" (editor, tabs and menus keep working) and one for "Recovery after a
      drawing failure"; verify they pass.
- [ ] 9.3 Add the root error boundary in `frontend/src/app/` around the content of `AppContents` (`App.tsx:130-143`),
      keeping `useDocumentSession`, `useBootstrap` and `useShutdown` above it. The "Something went wrong" screen
      reuses `StartupFailure.tsx`'s layout and tokens, uses catalogue strings, focuses Reload interface, flushes every
      pending buffer via `flushBuffer` (`appModelAdapter.ts:789`, at most 1 second) before reloading, and handles Quit,
      window close and the quit shortcut through `useShutdown`'s close confirmation with the discard prompt
      (`nativeLifecycleAdapter.requestQuit`, `authorizeQuit`, `cancelQuit`; `frontend/src/logic/adapter/index.ts:619`).
      Add component tests for "Reload interface", "Quit with unsaved work" and "Quit with nothing unsaved"; verify
      they pass and check Quit with a modified document in the real app.

## 10. Preview measurement only while visible

Spec: markdown-preview "Live update and degradation" (behaviour unchanged). Design §9. Owners:
`frontend/src/logic/hooks/useLivePreview.ts` (`:32-39, 114`), `EditorStage.tsx` (`:307, 385`),
`frontend/src/app/useTidyCommands.ts` (`:162`), `frontend/src/logic/tidy/chunking.ts` (`:40`).

- [ ] 10.1 Add one UTF-8 byte-length helper in `frontend/src/logic/` (unit-tested with ASCII, multi-byte and surrogate
      pairs) and use it in all three places; give `useLivePreview` a `visible` input that skips the measurement while
      hidden and memoize it on content; verify the existing preview, 2 MiB pause and tidy tests pass and a hook test
      shows no measurement while hidden.

## 11. Layout persistence never blocks

Spec: app-shell "Quitting is not blocked by layout storage". Design §10. Owners: `frontend/src/app/useWindowGeometry.ts`,
`internal/appmodel/service.go`, `internal/appmodel/close_drain.go`.

- [ ] 11.1 Send `windowMaximized` only when it changes and add a hook test that N resize events with an unchanged
      maximized state send it once (width and height stay debounced in the backend, `service.go:478-500`), plus a
      backend test that resizes cause no immediate layout repository write; increment the layout sequence under the service lock and add a concurrent `SetUILayout` test under
      `-race`; verify both pass.
- [ ] 11.2 Make close drain log and drop a failing layout flush; add a `close_drain_test.go` case with a failing layout
      repository asserting the drain succeeds (replacing `TestDrainBeforeCloseClassifiesALayoutFailure`), keep the
      existing document-write-failure case fatal; update ADR-0013's wording in `docs/architecture.md` (`:871`) to
      "flushed on close when possible"; verify the tests pass.

## 12. UI cleanup

No spec change. Owners: `frontend/src/ui/primitives/Toast.module.css`, `frontend/src/ui/styles/tokens.css`,
`frontend/stylelint.config.mjs`, `frontend/src/ui/widgets/Menubar/Menubar.tsx`.

- [ ] 12.1 Give the success toast the success stripe (matching `Banner.module.css`) and remove the unreachable `stuck`
      selector; add a component test of the save-success toast's computed border colour; verify it passes.
- [ ] 12.2 Remove the overridden declarations and merge duplicate selectors in `tokens.css`, and enable stylelint
      `no-duplicate-selectors` for it; verify regenerated `generatedEditorThemes.ts` and `generatedHighlight.css` are
      byte-identical and `scripts/verify lint` passes.
- [ ] 12.3 Extract the File and About menu item lists in `Menubar.tsx` into local render helpers shared by the narrow
      and wide branches; verify the menubar integration and e2e menu tests pass unchanged.

## 13. Faster build and verification, real product metadata

No spec change. Design §12. Owners: `scripts/build`, `scripts/verify`, `scripts/lib/stages.sh`,
`frontend/tests/support/prepare.ts`, `.github/workflows/release.yml`, `wails.json`, `build/darwin/`, `build/windows/`.

- [ ] 13.1 Set `GOMARKEDIT_E2E_REUSE_DIST=1` for the E2E stage in `scripts/verify` when Build passed in the same run,
      pass `-skipbindings` and `-trimpath` to `wails build` (`scripts/build:106-126`), drop `-gcflags all=-N -l` from
      the e2e binary (`prepare.ts:243`), and give golangci-lint (`stages.sh:9`) a package list that excludes
      `frontend/node_modules`; verify a full `scripts/verify` passes and compare stage times with
      `scripts/baseline --compare` (the branch baseline is recorded before the change's first edit).
- [ ] 13.2 Run both Jest stages with `--maxWorkers=50%`; verify two consecutive green runs of unit and integration and
      fix any test that depends on order.
- [ ] 13.3 Build the versioned release app once in `release.yml` (today `scripts/verify` at `:135`/`:140` and
      `scripts/build --version` at `:164-166`) and verify against it; verify with
      `go run github.com/rhysd/actionlint/cmd/actionlint@v1.7.7 .github/workflows/release.yml` and a read of the job
      graph.
- [ ] 13.4 Add the `info` block to `wails.json` with a numeric `X.Y.Z` `productVersion`, and set the bundle identifier
      `io.github.sanyokkua.gomarkedit` in `build/darwin/Info.plist:11`, `build/darwin/Info.dev.plist:11` and
      `build/windows/wails.exe.manifest:3`; verify with `plutil -p` on the built `Info.plist`, check the rendered
      Windows manifest version is four numeric parts, and update "10.3 CI and Release" in `docs/index.md`.

## 14. Smaller preview bundle

No spec change. Design §12. Owners: `frontend/src/logic/markdown/highlight.ts`, the preview's rehype pipeline,
`frontend/package.json`.

- [ ] 14.1 Replace `rehype-highlight` with a small rehype plugin on `createLowlight()` registering only the app's 26
      grammars and reading code text with `hast-util-to-text`, keeping class names and the unknown-language behaviour, and remove the direct `mdast-util-math`
      dependency; add a unit test comparing highlighted output for every registered language; verify preview tests
      pass, `bundle-scan` passes, and the main chunk shrinks (record before and after sizes).

## 15. Test hygiene

No spec change. Owners: `frontend/tests/integration/*.legacy.test.tsx` (nine files),
`frontend/tests/unit/settings/settingsCommands.legacy.test.ts`,
`frontend/tests/e2e/late-completion.test.ts`, `frontend/tests/support/harness.ts`.

- [ ] 15.1 Rename the ten `*.legacy` test files by feature, drop the retired parity-harness comments (`appShell`,
      `editorStage`, `editorStage.view`, `formattingToolbar`), and replace the source-text and regex assertions
      (`appShell`, `editorStage`, `formattingToolbar`, `menubar`) with the existing lint, token and bundle guards
      (confirm each guard covers the case it replaces); verify the unit and integration test counts are unchanged
      apart from the removed source-grep cases.
- [ ] 15.2 Let the harness install Playwright's clock before navigation and use it in `late-completion.test.ts`
      (`:103-110`) to advance past the frontend's 10-second stuck-command notice (`boundMs`,
      `frontend/src/logic/adapter/command.ts:75`) instead of waiting 10 seconds of real time, stopping the lock helper right after Retry or Cancel; verify the test
      passes and its duration drops.

