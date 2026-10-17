# Tasks

Each group is one vertical slice: production change, its regression tests and its documentation. Run the focused
tests while working and the relevant `scripts/verify` stages before ticking a box. Group 1 goes first so that later
end-to-end runs no longer touch the developer's desktop.

## 1. End-to-end runs leave the desktop alone

Design §11. Owners: `main.go` (composition root), `internal/file` (reveal and clipboard ports),
`frontend/playwright.config.ts`, `frontend/tests/support/` (`harness.ts`, `nativeClipboard.ts`), `.github/workflows/`.

- [ ] 1.1 Add recording implementations of the reveal port and clipboard writer in `internal/file` that append one line
      per call to a file in the application configuration folder, and wire them in `main.go` only when
      `application.E2EHeadlessEnabled()` is true; verify with a Go unit test of the recorders and by a Go integration
      test that the headless option set replaces the platform ports.
- [ ] 1.2 Add a harness helper that reads the recorded calls from the isolated e2e profile; change
      `real-files.test.ts` (Copy path) to assert the recorded path and drop its `@native-clipboard` tag, and keep
      `preview-links.test.ts` asserting its bridge recorder; verify both files pass and no Finder window opens.
- [ ] 1.3 Run the `chromium-native` Playwright project only when `E2E_NATIVE_CLIPBOARD=1` or in the macOS subset, set
      the variable in `push.yml` and `release.yml`, and replace the ad-hoc clipboard restores in `editor-round-trip`,
      `reading-mode` and `rich-rendering` with one fixture that saves and restores the clipboard text; verify a full
      local `scripts/verify e2e` leaves `pbpaste` output unchanged and the tagged tests pass with the variable set.
- [ ] 1.4 Record the headless recording ports as a durable decision in `docs/architecture.md` (second sanctioned use
      of the headless flag, confined to the composition root) and document `E2E_NATIVE_CLIPBOARD` in `docs/index.md`;
      verify `scripts/verify lint` passes its referenced-path rules.

## 2. Reload is not undone by a later write

Spec: external-change-conflict "Reload is not undone by a later write". Design §1. Owner:
`frontend/src/logic/hooks/useSyncedBuffer.ts`.

- [ ] 2.1 Write a failing hook test in `frontend/tests/unit/hooks/useSyncedBuffer.test.ts` (reuse the plain
      `EditorSynchronizationAdapter` from the "never flushes the outgoing document" test): edit, rerender with a new
      external epoch and the reloaded text, flush; the flush must not send the pre-reload text. Then make adoption key
      on the activation token and reset content, cursor, selection, scroll and view refs from props; verify the test
      passes and the existing hook and `closeWorkflow` integration tests stay green.
- [ ] 2.2 Add an e2e test in `real-files.test.ts`: with Autosave on, change the file on disk, Reload, switch tabs and
      back, wait past the autosave delay; assert the disk bytes equal the reloaded text and the tab is clean. Verify
      it fails on the pre-fix code path (revert locally) and passes with the fix; exercise the same sequence in the
      real app.

## 3. Undo survives tab switches

Spec: editor "Editor stage with preserved working state". Design §2. Depends on group 2 (activation identity).
Owners: `frontend/src/ui/components/CodeEditor.tsx`, `frontend/src/ui/widgets/EditorStage/EditorStage.tsx`.

- [ ] 3.1 Keep one Monaco model per open writable document keyed by document id and external epoch, kept on unmount,
      disposed when the id leaves the open-document list or the epoch changes, and replaced when its text differs
      from the backend buffer on activation; read-only documents are not cached. Update the disposal assertions in
      `frontend/tests/unit/components/CodeEditor.test.tsx` to the new contract (disposed on close and on reload, kept
      on tab switch); verify the component tests pass.
- [ ] 3.2 Add an e2e test: type in A, switch to B and back, press Undo, expect A's previous text; and Reload then Undo
      keeps the reloaded text. Record the refinement of ADR-0014 as a durable decision in `docs/architecture.md`;
      verify the e2e test passes and the behaviour in the real app.

## 4. Keep mine works on mixed-line-ending files

Spec: external-change-conflict "Keep mine together with line-ending normalization"; file-lifecycle "Autosave".
Design §3. Owner: `internal/appmodel` (`save.go`, `conflict.go`, `lifecycle.go`, `close_plan.go`, `autosave.go`).

- [ ] 4.1 Write failing Go integration tests: in `tests/go/integration/appmodel/conflict_test.go` with a file
      `"a\r\nb\n"` (external edit, buffer edit, Save → normalization, Save(N) → conflict, Keep mine, Save(K) →
      committed); the Skip-asks-again and new-conflict-discards-keep-mine cases; and the same flow through the close
      plan in `close_plan_test.go` reusing `writeMixedDocument`. Implement the accepted-normalization flag, the copy
      onto the keep-mine record, the token fallback in `normalizationAuthorizationForLocked` and the keep-mine reset
      in `registerConflict`; verify the tests pass with `go test -race`.
- [ ] 4.2 Exclude documents with mixed endings from autosave eligibility and add an `autosave_test.go` case using
      `fakeAutosaveClock` and `writeMixedDocument`: Save returns the prompt, the clock fires, confirming the original
      token writes once; verify it passes and the frontend `saveTidy` keep-mine integration test stays green.

## 5. Post-save state matches the file on disk

Spec: external-change-conflict "What counts as a change"; file-lifecycle "Byte-preserving encoding". Design §4.
Owners: `internal/appmodel/save.go`, `internal/file/document_reader.go`.

- [ ] 5.1 Write failing tests: open an LF file, edit, Save, `os.Chtimes`, check external changes → unchanged; the
      same for an untitled document saved as "hello" with no newline; and a BOM file through Save As, edit, Save →
      still starts with EF BB BF. Export a byte classifier from the reader, use it for every committed write, take
      the BOM from the encoder outcome and delete `characteristicsForWrittenSnapshot`; verify the tests pass.
- [ ] 5.2 Remove the unused `failedWrite` field, `markFailedWrite` and their dead branches; verify `go vet`, the
      appmodel unit and integration suites and the frontend dirty-state tests stay green.

## 6. File permissions

Spec: file-lifecycle "Write-protected files" and "Permissions of new files". Design §5. Owners:
`internal/file/atomic_replace.go`, `internal/file/document_reader.go`, the read-only reason strings in the frontend
catalogue.

- [ ] 6.1 Give a newly created target `0666 &^ umask` (umask read once at start on Unix); assert the mode in the
      "new target uses normal creation semantics" unit test and add an integration test for Save after an external
      delete; verify both pass.
- [ ] 6.2 Open files without the owner-write bit read-only with the reason "The file is write-protected." (catalogue
      string, shown wherever existing read-only reasons appear); add reader unit tests, an appmodel integration test
      that autosave never writes a 0444 file, a Reload-after-chmod test, and an e2e assertion that Save is disabled;
      verify all pass and update the lifecycle section of `docs/architecture.md`.

## 7. Save and sync problems are reported

Spec: file-lifecycle "Save outcome reporting" and "Editor changes that cannot be delivered". Design §6. Owners:
`internal/appmodel/save.go`, `frontend/src/app/useDocumentWrites.ts`, `frontend/src/logic/adapter/appModelAdapter.ts`,
`ApplicationMenubar.tsx`.

- [ ] 7.1 Keep the first post-commit warning and report durability failure as a warning in `save.go`; classify
      encode failures as unsupported input without Retry; add Go tests for each; verify they pass.
- [ ] 7.2 Show the warning from a committed save in `useDocumentWrites`, report the first failed buffer sync once until
      a send succeeds, and handle a rejected full-screen toggle; add frontend integration tests for each using the
      existing adapter fakes and catalogue strings; verify they pass.

## 8. Shortcuts work while the editor has focus

Spec: editor "Text navigation and line editing keys"; actions-shortcuts "Application and window shortcuts", "Shortcut dispatch", "Shortcuts in the editor text area".
Design §7. Owners: `frontend/src/ui/widgets/useEditorActionExecutor.ts`, `DocumentTabs.tsx`, `useShellShortcuts.ts`,
`frontend/src/logic/actions/actionRegistry.ts`, `shortcutRegistry.ts`, `frontend/src/ui/components/monacoSetup.ts`.

- [ ] 8.1 Register the executor and tab-navigation listeners in the capture phase for events targeted at the editor
      text area, stopping propagation when an available command matches; leave Find/Replace inputs on the bubble
      path. Add e2e tests that Mod+K makes a link, Cmd+E makes inline code on macOS and Ctrl+PageUp switches tab with
      the editor focused, and that Ctrl+Enter in the Find input still does not enter Reading mode; verify they pass.
- [ ] 8.2 Replace Mod+Tab with physical Ctrl+Tab / Ctrl+Shift+Tab on every platform, show ⌃ on macOS in
      `formatShortcut`, and update the shortcuts dialog and menu hints; add `shortcutForKeyEvent` and formatting unit
      tests for darwin and other platforms; verify them, and check Control+Tab and Cmd+K/Cmd+E in the real app.

- [ ] 8.3 Load Monaco's `wordOperations` and `linesOperations` contributions in `monacoSetup.ts` (spec: editor "Text
      navigation and line editing keys"; design §7). Add a unit test next to `monacoLanguages.test.ts` that the word
      and line commands are registered, and an e2e test covering word move/select/delete, line start/end, document
      start/end, move/copy/delete line and Mod+Enter still entering Reading mode with the editor focused, using the
      running platform's keys; verify they pass, check Option+arrows and Cmd+arrows in the real app on macOS, and
      record the bundle-size change for task 14.1.

## 9. Startup and rendering failures are visible

Spec: app-shell "Window shown only when ready", "Unexpected interface error"; markdown-preview "Live update and
degradation" (unchanged). Design §8. Owners: `internal/application/native_window.go`, `frontend/src/app/`,
`frontend/src/main.tsx`, `MarkdownView.tsx`.

- [ ] 9.1 Arm a 12-second watchdog in `NativeWindowService.Restore` that shows a still-hidden, non-headless window, with
      an injected clock; add a test in `tests/go/integration/application/native_window_test.go` with
      `recordingNativeWindow` and a fake clock that `Show` is called without `FrontendReady` and not called twice;
      verify it passes and, in the real app, that a forced settings-step failure becomes visible.
- [ ] 9.2 Add the root error boundary with the "Something went wrong" screen (catalogue strings, focusable Reload
      interface and Quit, theme tokens) that flushes the pending buffer before reloading, and make `CommittedPreview`
      the preview's error boundary; add component tests for both (a throwing child) and an integration test that the
      editor stays usable when the preview throws; verify they pass.

## 10. Preview stays responsive

Spec: markdown-preview "Live update and degradation" (unchanged). Design §9. Owners:
`frontend/src/logic/hooks/useLivePreview.ts`, `MarkdownView.tsx`, `useTidyCommands.ts`, `tidy/chunking.ts`.

- [ ] 10.1 Add one UTF-8 byte-length helper (unit-tested with ASCII, multi-byte and surrogate pairs) and use it in all
      three places; compute the preview byte count only while visible and memoized on content; render the preview
      from a deferred source value; verify the existing preview, pause-threshold and tidy tests pass.

## 11. Layout persistence never blocks

Spec: app-shell "Quitting is not blocked by layout storage". Design §10. Owners: `frontend/src/app/useWindowGeometry.ts`,
`internal/appmodel/service.go`, `internal/appmodel/close_drain.go`.

- [ ] 11.1 Send `windowMaximized` only when it changes and add a hook test that N resize events produce one layout
      call; increment the layout sequence under the service lock and add a concurrent `SetUILayout` test under
      `-race`; verify both pass.
- [ ] 11.2 Make close drain log and drop a failing layout flush; add a `close_drain_test.go` case with a failing layout
      repository asserting the drain succeeds, keep the existing document-write-failure case fatal; update ADR-0013's
      wording in `docs/architecture.md`; verify the tests pass.

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

- [ ] 13.1 Reuse the built frontend for E2E within one `scripts/verify` run, pass `-skipbindings` and `-trimpath` to
      `wails build`, drop the debug `-gcflags` from the e2e binary, and give golangci-lint an explicit package list;
      verify a full `scripts/verify` passes and compare stage times with `scripts/baseline --compare`.
- [ ] 13.2 Run both Jest stages with `--maxWorkers=50%`; verify two consecutive green runs of unit and integration and
      fix any test that depends on order.
- [ ] 13.3 Build the versioned release app once in `release.yml` and verify against it; verify the workflow with
      `actionlint` (or the repository's workflow lint) and a dry read of the job graph.
- [ ] 13.4 Add the `info` block to `wails.json` and set the bundle identifier in the macOS plists and Windows manifest
      (confirm the identifier first; default `io.github.sanyokkua.gomarkedit`); verify with `plutil -p` on the built
      `Info.plist` and update the release section of `docs/index.md`.

## 14. Smaller preview bundle

No spec change. Design §12. Owners: `frontend/src/logic/markdown/highlight.ts`, the preview's rehype pipeline,
`frontend/package.json`.

- [ ] 14.1 Replace `rehype-highlight` with a small rehype plugin on `createLowlight()` registering only the app's 26
      grammars, keeping class names and the unknown-language behaviour, and remove the direct `mdast-util-math`
      dependency; add a unit test comparing highlighted output for every registered language; verify preview tests
      pass, `bundle-scan` passes, and the main chunk shrinks (record before and after sizes).

## 15. Test hygiene

No spec change. Owners: `frontend/tests/integration/*.legacy.test.tsx`, `frontend/tests/unit/settings/`,
`frontend/tests/e2e/late-completion.test.ts`, `frontend/tests/support/harness.ts`.

- [ ] 15.1 Rename the ten `*.legacy` test files by feature, drop the retired parity-harness comments, and replace the
      source-text and regex assertions with the existing lint, token and bundle guards (confirm each guard covers the
      case it replaces); verify the integration test count is unchanged apart from the removed source-grep cases.
- [ ] 15.2 Let the harness install Playwright's clock before navigation and use it in `late-completion.test.ts`
      instead of waiting 10 seconds of real time, stopping the lock helper right after Retry or Cancel; verify the test
      passes and its duration drops.

## Workflow follow-up

- Run the full six-stage `scripts/verify` and compare with the baseline before archiving.
- Get an independent review of the branch, then archive the change on `feature/stabilize-for-beta` and ask whether to
  squash-merge into `master`.
