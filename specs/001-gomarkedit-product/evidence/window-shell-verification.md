# Native window shell verification

## T032 — production-network safeguard (2026-08-02)

| Command                                                                                 | Exit | Verdict                                                                                                                                  |
| --------------------------------------------------------------------------------------- | ---: | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `npm --prefix frontend test -- --runInBand src/ui/components/CodeEditor.bundle.test.ts` |    0 | PASS — remote request fixtures fail; inert vendor diagnostic strings, bundled Monaco injection, and same-origin preload conditions pass. |
| `just frontend-archtest`                                                                |    0 | PASS — existing stale allowlist notices only.                                                                                            |
| `npm --prefix frontend run build`                                                       |    0 | PASS — source scan and built-bundle safeguard pass. Vite reports existing dynamic-import and chunk-size warnings.                        |
| `just gen`                                                                              |    0 | PASS — generated bindings are current.                                                                                                   |
| `go test ./internal/application ./internal/appmodel ./internal/settings ./internal/db`  |    0 | PASS — 171 tests.                                                                                                                        |

The original syntax-only scan reported Monaco's dependency-default CDN URL and Vite's generated
same-origin module-preload fetch. The safeguard now rejects executable request APIs and remote source assets,
while requiring the application to inject bundled Monaco before the loader returns and Vite to use relative
asset URLs. Vendor diagnostic/default strings alone are not executable request paths. The retained
request-instrumented browser journey remains the runtime proof that every actual request is local.

## T033 — in-app-browser repair and automated shell evidence (2026-08-02)

The mock-backed interface was started with `just dev-ui` at `http://localhost:5175/` and exercised in
the Codex in-app browser. At desktop width, Settings changed and reset Appearance, Escape restored
focus to Settings, View hid and restored the workspace, About showed `Version dev`, and F11 produced no
console error. At 768 px the workspace was a 46 px rail; at 375 px it was a 230 px overlay, the editor
and preview stacked, the menu row moved to the working Settings/View/About overflow, and the page had no
horizontal overflow. File, tab strip, launcher/recents, and Assistant surfaces were absent.

| Command                                                                | Exit | Verdict                                                                                                                        |
| ---------------------------------------------------------------------- | ---: | ------------------------------------------------------------------------------------------------------------------------------ |
| `npm exec -- playwright test e2e/window-shell.test.ts --reporter=list` |    0 | PASS — 22 tests: 18 viewport/palette cases plus actions/focus, local-only requests, and 20 resize + 20 divider timing samples. |

The screenshot assertion has **no pixel-difference tolerance**. It hides only Monaco's cursor and
`decorationsOverviewRuler` canvas, which are transient editor-position artifacts outside the native-shell
contract; every retained full-page visual baseline is otherwise strict. The request log retains all 151
observed requests rather than a representative subset. Raw resize and divider samples record the visible
update, largest animation-frame gap, and the appmodel acknowledgement after input stopped; all 40 visible
updates met the 100 ms target, with acknowledgement remaining below 500 ms. Divider acknowledgement is
counted only when a new matching appmodel patch is emitted after pointer release. Retained machine-readable
matrix, request, and timing evidence is [`window-shell-browser.json`](window-shell-browser.json).

## T034 — final gates and baseline comparison (2026-08-02)

T001 baseline inspected: `docs/delivery/work/baselines/feature-001-gomarkedit-product.md` and its
retained gate logs. Verification also inspected the immutable alias baseline
`docs/delivery/work/baselines/story-063.md`, because `just verify 001-gomarkedit-product` is wired to that
pre-edit baseline rather than the feature-named T001 capture.

| Command | Exit | Reliability | Findings | Comparison | Verdict |
| ------- | ---: | ----------- | -------- | ---------- | ------- |
| `just fmt-check` | 0 | clean | none | Matches T001 clean baseline; no new format drift remains. | PASS |
| `just typecheck` | 0 | clean | none | Matches T001 clean baseline; no new type errors. | PASS |
| `just lint` | 0 | clean | none | Matches T001 clean baseline; no new static-analysis findings. The first sandboxed rerun was `UNRELIABLE` (`no go files to analyze`), so the authoritative result is the host-cache rerun. | PASS |
| `just test` | 0 | clean | none | Matches T001 clean baseline; no new test failures. Final run passed 42 suites / 174 tests. | PASS |
| `just archtest` | 0 | clean | no blocking findings; frontend archtest reports stale reserve notices for `ViewModeToggle.tsx`, `AppShell.tsx`, and `EditorView.tsx` after their known allowed callsites disappeared | Matches T001 clean baseline at the gate level: architecture stayed green. Output is greener than T001 at the string-violation callsites, but the allowlist now over-reserves those files. | PASS |
| `just frontend-build` | 0 | clean | no blocking findings; Vite retained dynamic-import and chunk-size warnings, and the production-network guard passed | Matches T001 clean baseline; no new failing frontend-build findings. | PASS |
| `just build` | 0 | clean | none | T001 did not retain a `just build` row, so there is no direct T001 comparison. This is the additional current-host native-build gate required by T034, and it succeeded on `darwin/arm64`. | PASS |
| `just verify 001-gomarkedit-product` | 0 | clean | none | Compared against the immutable `story-063` verification baseline by contract, not the feature-named T001 row set. `M1` through `M6` all passed. | PASS |

Minimal repairs required before the final clean sweep were: formatting `internal/appmodel/service.go` and
`frontend/src/logic/adapter/appModelAdapter.ts`, removing the unused
`internal/appmodel/layout_repository_sqlite.go::layoutIdentityWins`, fixing the close-failure cleanup in
`main_test.go`, and updating stale frontend test fixtures/expectations so the current shell contract is what
the retained suites actually assert.

Retained raw outputs for the authoritative final T034 runs are bundled in
[`t034-final-gates/manifest.md`](t034-final-gates/manifest.md). The dirty-checkout patch audit is retained in
[`t034-scope-manifest.md`](t034-scope-manifest.md). The archtest raw log in that bundle intentionally keeps
the honest stale reserve notices for `ViewModeToggle.tsx`, `AppShell.tsx`, and `EditorView.tsx`.

## T037–T041 — convergence repairs and focused evidence (2026-08-02)

### T037 architecture reservations

- Pre-edit `just archtest` reported exactly eleven stale string reservations: one for
  `ViewModeToggle.tsx`, three for `AppShell.tsx`, and seven for `EditorView.tsx`. The first combined
  run also hit a sandbox-only Go module-cache write denial and was not treated as a pass.
- After removing only those zero-use reservations, the authoritative host-access `just archtest`
  exited 0. Go architecture tests, CGO-free build, migration immutability, frontend boundaries,
  colour literals, and offline production-source checks all passed with no stale reserve notice.

### T039 responsive native-minimum boundary

- The retained packaged-app observation showed the 375 × 480 native frame rendering the 46-pixel
  rail. A new integrated regression at a 376-pixel CSS viewport represents the one-pixel frame/webview
  rounding boundary. Before repair it failed with `Expected: 230`, `Received: 46`.
- The responsive minimum presentation now includes that one-pixel boundary consistently for workspace
  off-canvas layout, stacked document panes, and action overflow. The focused T039 Playwright rerun
  passed 1/1.

### T040 Settings popup rendering

- The integrated regressions open Settings through the desktop trigger at 768 and 1280 pixels and the
  narrow overflow trigger at 375 pixels. Before repair all three failed because the popup began at
  negative x positions (`-578.328125`, `-548.109375`, and `-548.109375`).
- Settings now renders through a `document.body` portal, uses fixed viewport-clamped positioning, and
  lays both three-choice segmented controls out within a bounded responsive popup. The tests require
  the complete popup inside the viewport, no horizontal document overflow, a portal parent above the
  shell clipping context, pointer-operable Theme, keyboard-operable Appearance mode, and activation of
  the Appearance item. The focused rerun passed 3/3.

### T041 connected opener identity and focus

- Before repair, Close and Escape both dismissed the dialog but failed to focus the opener in all four
  desktop/narrow cases. The application-level inline renderer was being treated as a changing React
  component type, remounting the menu row across state updates.
- The application now uses a stable module-level menu component with context-fed modal state, and the
  exact desktop or overflow opener is carried into the dialog explicitly. Close and Escape each return
  focus only to that still-connected element. The focused rerun passed 4/4.

### Focused automated and real-bridge results

| Command / check | Exit | Result |
| --- | ---: | --- |
| `npm --prefix frontend test -- --runInBand src/App.test.tsx src/ui/widgets/ShellMenuRow.test.tsx src/ui/widgets/AppearanceControls.test.tsx src/ui/widgets/SettingsDialog.test.tsx src/ui/widgets/AppShell.test.tsx` | 0 | PASS — 5 suites, 33 tests. |
| `npm --prefix frontend run typecheck` | 0 | PASS. |
| `npm --prefix frontend run lint` | 0 | PASS. |
| focused Playwright grep `T039|T040|T041` | 0 | PASS — 8 tests. |
| `just build` | 0 | PASS — fresh darwin/arm64 packaged application. |

`just dev` printed the real bridge at `http://localhost:34115`. The in-app browser exercised the
actual bridge at 1280 × 720 and 375 × 480. Desktop popup bounds were x=8, y=53, width=480,
height=127. Narrow popup bounds were x=8, y=53, width=367, height=147. Both were body portals wholly
inside their viewports with no horizontal page overflow. At 375 × 480 the workspace measured 230
pixels. Pointer and keyboard appearance choices acknowledged through the real bridge; Close and Escape
returned focus to a connected desktop `Settings` opener and connected narrow `More actions` opener.
The browser emitted no warning or error logs.

T039 remains incomplete for native-only cases that still lack direct retained current-host evidence.
Production currently exposes no shipped interaction that creates success/info/warning toasts or a
continuing-condition banner, so native timing and banner checks cannot be manufactured with a fake
consumer. Native automation also did not retain a post-fix packaged 375 × 480 screenshot after resize,
although the real-bridge viewport check above directly measured the repaired presentation.
Windows/Linux native runtime repetition remains intentionally deferred until whole-application
completion.

The 2026-08-02 clarification now unblocks those observations by approving a build-tagged native
evidence driver that is excluded from release builds. It must reuse the real native shell and production
components, inject only through existing dependency boundaries, and retain the chosen scenario and
observed result. It may supplement, but never replace, the ordinary packaged-build walkthrough for
naturally reachable behavior. No evidence-driver implementation or new native observation was performed
during clarification, so T039 remains unchecked.

The final post-format sweep then passed `just fmt-check`, `just test` (42 frontend suites / 174 tests
plus the complete Go race suite), `just archtest`, the eight focused T039–T041 Playwright tests, and
`git diff --check`. `just gen` restored generated Wails runtime artifacts after the build without a
hand edit.

## T039 build-tagged native evidence verification

The approved test-only driver and retained observations are indexed by
[`t039-native/manifest.md`](t039-native/manifest.md). The initial focused safeguard run failed 2/2
before the driver and boundary checker existed. After implementation and final formatting, the current
results are:

| Command / check | Exit | Result |
| --- | ---: | --- |
| `go test -run TestNativeEvidence -count=1 .` | 0 | PASS — 2 safeguards: tagged-driver/release exclusion and existing-boundary-only scenario entry. |
| `node frontend/evidence/check-boundaries.mjs` | 0 | PASS — pending-close, both stale-close roles, startup-retry, divider acknowledgement, and notifications. |
| `npm --prefix frontend run typecheck` | 0 | PASS. |
| `npm --prefix frontend run lint` | 0 | PASS. |
| `just fmt-check` | 0 | PASS after removing only disposable `frontend/dist-native-evidence` build output. |
| `just test` | 0 | PASS — 42 frontend suites / 174 tests and complete Go race suite, including the 2 new safeguards. |
| `just archtest` | 0 | PASS — Go architecture, CGO-free build, migration immutability, frontend boundaries/colours/offline. |
| `just build` | 0 | PASS — fresh ordinary darwin/arm64 production app bundle, no evidence build tag. |
| `just gen` | 0 | PASS — generated Wails bindings restored through supported generation. |
| `just verify 001-gomarkedit-product` | 0 | PASS — M1 format, M2 types, M3 static analysis, M4 tests, M5 architecture, and M6 build all pass against immutable STORY-063 evidence. |
| `git diff --check` | 0 | PASS. |

The direct native walkthrough additionally reviewed T039's new code as test-only, confirmed no
placeholder/no-op on a production path, retained the declared evidence-only scope, and completed the
current-host walkthrough. Windows/Linux runtime testing remains deferred until whole-application
completion.

## 2026-08-03 release-gate rerun after T009 rollback repair

`just baseline 001-gomarkedit-product` captured the current dirty worktree in
[`feature-001-gomarkedit-product.md`](../../../docs/delivery/work/baselines/feature-001-gomarkedit-product.md)
with clean, reliable exits for frontend build, format, typecheck, lint, tests, and architecture. Its
raw gate logs remain beside that baseline.

After capture, `just check`, `just build`, and `just verify 001-gomarkedit-product` all exited 0.
The verification alias continues to compare M1–M6 with the immutable STORY-063 baseline; the fresh
feature baseline is retained as the current release-gate record and is not substituted for that
immutable comparison point.

The native-shell evidence was revalidated without weakening its release boundary:

| Command / check | Exit | Result |
| --- | ---: | --- |
| `go test -run TestNativeEvidence -count=1 .` | 0 | PASS — test-only driver remains release-excluded and enters through existing boundaries. |
| `node frontend/evidence/check-boundaries.mjs` | 0 | PASS — adapter-only Wails boundary plus pending-close, stale-close, Retry, divider acknowledgement, and notification routes. |
| `cd frontend && npm exec -- playwright test e2e/window-shell.test.ts --grep 'T039|T040|T041' --reporter=list` | 0 | PASS — 8 focused regressions. |
| `git diff --check` | 0 | PASS. |

The focused Playwright command must run from `frontend/` so its configured base URL loads; a
repository-root invocation fails before navigation and is not evidence. The existing current-host
native walkthrough in [`t039-native/manifest.md`](t039-native/manifest.md) remains applicable.
