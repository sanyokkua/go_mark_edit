# Editor-stage verification

Captured 2026-08-04.

## T061-T062 fresh verification

| Evidence                                                                         | Result                                                                                                                                                                                           |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T061 focused registry/dispatcher/UI suites                                       | Passed: 9 suites, 42 tests                                                                                                                                                                       |
| `just fmt-check`                                                                 | Passed                                                                                                                                                                                           |
| `npm --prefix frontend run typecheck`                                            | Passed                                                                                                                                                                                           |
| `just archtest`                                                                  | Passed: Go architecture, CGO-free build, migration immutability, frontend boundaries, colour tokens, and offline checks                                                                          |
| `npm run verify:ui -- e2e/editor-stage.test.ts --reporter=line` from `frontend/` | Passed: 54/54 in one Playwright worker across 1280/768/375 and six palettes                                                                                                                      |
| `just verify 002-editor-stage-formatting`                                        | Passed: fresh sequential M1-M6 all passed, including M3 with real Go analysis and no no-files-analyzed reliability failure                                                                       |
| `just build`                                                                     | Passed: fresh Wails v2.12.0 self-signed `darwin/arm64` bundle at `/Users/ok/Development/GitHub/go_mark_edit/build/bin/GoMarkEdit.app`                                                            |
| `just gen-check`                                                                 | Exit 1 tracking result: regeneration reports the required `EditorSettings`/`Settings.editor`/`UpdateEditor` generated diff and generator-owned `0755` modes; no generated output was hand-edited |
| `git diff --check`                                                               | Exit 2 only at generated `frontend/wailsjs/go/models.ts:346` and `:350` trailing-whitespace lines; no source-file whitespace finding                                                             |

The official verifier was run non-concurrently after the browser matrix and after the T061 lint repair.
Its raw result was M1 format PASS, M2 types PASS, M3 static analysis PASS, M4 tests PASS, M5 architecture
PASS, and M6 build PASS. The earlier M3 no-files-analyzed statement is superseded and is not a current
release blocker.

The generated-binding and `git diff --check` rows are recorded separately as worktree tracking results.
The generated files are required outputs from the existing settings implementation and were regenerated
by Wails; they were not hand-edited. They remain pending normal tracked-workflow handling and do not
change the fresh M1-M6 verification result.

## T063 bounded formatter repair

The T063 red test failed at the prior whole-document `source.split` in `lineBounds`. The green repair uses
newline-indexed line offsets and a selected-line `substring` window, with no whole-document split or
prefix-copy path. The regression uses a 50,000-line unrelated suffix, guards whole-document string
operations, and proves the exact `##` heading removal range remains line 1, columns 1–12.

The named focused formatter/document-command/Monaco/EditorView suites passed 4/4 with 49/49 tests; the
full frontend suite passed 53/53 with 239/239 tests. The reliable escalated `just lint` and official
`just verify 002-editor-stage-formatting` both passed; the official verifier reported M1 through M6 PASS.

## Prior retained commands

The following record predates T054-T060 and is retained for historical traceability:

- `npm run verify:ui -- e2e/editor-stage.test.ts` from `frontend/`: 27/27 passed, including local-origin
  request instrumentation.
- `just fmt-check`: passed.
- `just typecheck`: passed.
- `just lint`: passed with 0 golangci issues and 0 ESLint errors.
- `just test`: passed.
- `just archtest`: passed.
- `just frontend-build`: passed; production network guard passed.
- `just check`: passed with the isolated generated-binding index described in
  `editor-stage-focused.md`.
- `just verify 002-editor-stage-formatting`: M1 through M6 all passed against the trustworthy baseline.
- `just build`: passed and produced the signed current-host app at
  `build/bin/GoMarkEdit.app/Contents/MacOS/GoMarkEdit`.
- Post-repair focused coverage: 50 Jest suites and 198 tests passed; the repaired toolbar/context-menu
  pointer-selection regressions are included.

The baseline is the regenerated trustworthy capture at commit `cf9d92f`; no gate was recorded as
`UNRELIABLE` in the final comparison.

## Convergence rerun

On 2026-08-04, after T043-T047 and the deferred-keyboard regression repair:

- `just fmt-check`, `just typecheck`, escalated `just lint`, `just test`, `just archtest`,
  `just frontend-build`, and `just build` passed.
- The named convergence Jest set passed 13 suites and 80 tests; the full suite passed 50 suites and
  208 tests.
- `npx playwright test e2e/editor-stage.test.ts` passed all 27 viewport/palette cases.
- `just verify 002-editor-stage-formatting` passed M1-M6.
- `just check` stopped at its first `gen-check` step on pre-existing dirty generated Wails DTO/handler
  and mode differences; the generated output was not edited by hand. `git diff --check` likewise reports
  only the two pre-existing generated-model whitespace lines.

## Phase 13 final verification (2026-08-05)

| Gate | Result |
| --- | --- |
| `just fmt-check`, `just typecheck`, `just lint` | Passed; ESLint and golangci-lint reported no findings. |
| `just test` | Passed: 54 Jest suites / 253 tests and Go race tests. |
| `just archtest` | Passed all backend, adapter, token, and offline boundaries. |
| `just gen-check` | Passed after `wails generate module`; the six generator-owned binding updates are staged and none were hand-edited. |
| `just e2e-test` and direct `editor-stage.test.ts` | Passed; the complete current 108-path editor-stage width/palette/mode matrix completed without error. |
| `just build` | Passed and produced the signed `darwin/arm64` GoMarkEdit bundle exercised in the native retry. |
| `just verify 002-editor-stage-formatting` | Passed M1-M6. |
| `git diff --check` and `git diff --cached --check` | Passed. |

No current gate was unreliable or treated as a substitute for the live and packaged checks.

## T076 deferred Command palette verification (2026-08-05)

The red run of the registry, dispatcher, context-menu, and shortcut-dialog suites failed only because Command
palette was registry-available, enabled in the context menu, and returned `unsupported` instead of the deferred
result. The minimal registry-only repair made the entry deferred. The green focused run passed 4 suites and 23
tests, proving exact context order, disabled presentation, localized shortcut-help availability, and zero
invocation for the deferred dispatcher result. `npm run format:check`, `npm run typecheck`, `just lint`, `just
test` (54 Jest suites / 253 tests plus Go race tests), `just archtest`, `just build`, and `just gen-check` all
passed. The unchanged `just verify 002-editor-stage-formatting` rerun completed successfully after an earlier
terminal-session interruption yielded no result; no gate was waived or treated as unreliable.

## Phase 15 T077–T079 browser and real-bridge verification (2026-08-05)

- T077 replaced obsolete visible-text selectors with the toolbar's stable accessible action identities. The
  focused T055 matrix completed across all 27 width/theme/mode combinations; it retained toolbar, platform
  shortcut, and editor-context-menu Bold formatting, both sidebar directions, 768px Link reachability through
  toolbar overflow, page-level no-scroll, and local-only request instrumentation.
- T078's red reproduction showed File's Radix modal layer intercepting the View trigger, and the inverse View to
  File route failed similarly. The focused 27-case T070 matrix completed after each shell popup became a
  non-modal competing surface while `ShellMenuRow` retained one active menu and restored the saved opener on
  dismissal. The matrix verifies viewport geometry, Escape dismissal, focus restoration, and a reachable
  underlying Toggle Sidebar control rather than assuming `document.body` is topmost.
- T079's focused `e2e/window-shell.test.ts` coverage completed after replacing retired File/tab-absence,
  `Show Workspace`, unscoped Close, and direct-About-dialog assumptions. It retains native resize/timing,
  screenshot, and local-only-request evidence while asserting the File/Settings/View/About order, disabled
  visual tabs, current scoped menu/dialog roles, deferred controls, and only contained 375px tab-strip scroll.
- The final unrestricted `just e2e-test` completed after all three repairs. `npm run typecheck`, focused
  `ShellMenuRow`/`ViewMenu` Jest coverage (2 suites, 8 tests), `npm run format:check`, and `git diff --check`
  for the T077–T079 paths also completed successfully.

Real-bridge checks used `just dev` at `http://localhost:34115`. At 1280px, toolbar, Cmd/Ctrl+B, and
context-menu Bold each produced `**hello**`; File → View and View → File each left only the requested menu
active, and Escape returned focus to File. At 768px, the contained toolbar overflow exposed Link and the page
width remained 768px. At 375px, the page width remained 375px while the 351px tab strip retained its permitted
512px contained horizontal scroll. File, visual tabs, Assistant, Image, Format, Compact, Lint, tidy,
renderer, and network behavior remained unavailable or inert.

## Phase 16 T080 release-evidence rerun (2026-08-05) — blocked

This is an evidence-only rerun: no application source, task scope, or deferred boundary was changed. The raw
terminal records are retained separately so a summary cannot be mistaken for raw proof:

| Command | Exact retained record | Result |
| --- | --- | --- |
| unrestricted `just e2e-test` | `phase-16-e2e.raw.log` | **FAIL**: Playwright ran all 148 tests; 105 passed and 43 failed in 3.0m; the wrapper exited 1. |
| `just verify 002-editor-stage-formatting` | `phase-16-verify.raw.log` | PASS: the verifier ran build, format, types, lint, tests, architecture, and reported M1–M6 PASS against the reliable feature baseline. |
| `just build` | `phase-16-build.raw.log` | PASS: Wails v2.12.0 produced and self-signed the fresh `darwin/arm64` bundle. |

The E2E failure is real rather than an unreliable/no-analysis result: the raw runner output names 43 failed
tests. It includes all 18 T070 popup-ownership cases plus current appearance, core-editor, and window-shell
failures. T080 therefore remains unchecked; the passing verifier does not waive the failed unrestricted E2E
proof.

The build output was retained before launching the exact package at
`build/bin/GoMarkEdit.app/Contents/MacOS/GoMarkEdit`. The current-host walkthrough is retained in
`editor-stage-native.md`; it is evidence of the package but cannot convert the failed browser gate into a pass.

## Phase 17 T083 release-evidence rerun (2026-08-05)

The Phase 16 failure remains historical evidence: it was neither removed nor relabelled. After T081 repaired
the real View opener capture and T082 reconciled the current browser journeys, fresh records are retained
separately:

| Command | Retained raw record | Result |
| --- | --- | --- |
| unrestricted `just e2e-test` | `phase-17-e2e.raw.log` | PASS: `verify:ui`/Playwright completed successfully with the current 148-test inventory. |
| isolated-cache `just verify 002-editor-stage-formatting` | `phase-17-verify.raw.log` | PASS against the reliable baseline; no no-analysis lint result occurred. |
| `just build` | `phase-17-build.raw.log` | PASS: freshly packaged and self-signed `darwin/arm64` bundle. |

Focused evidence also passed: the red T081 unit assertion reproduced File incorrectly receiving focus after
View dismissal; its repaired `ShellMenuRow`/`ViewMenu` run passed 2 suites and 9 tests, TypeScript passed, and
the T070 popup matrix completed with `PASS (27) FAIL (0)`. The E2E and unit results prove File → View
ownership and View focus restoration; the packaged app is documented separately for current-host behavior.

## Phase 18 T084 raw terminal records (2026-08-05)

The Phase 16 failed records remain unchanged. The new records below are unabridged command streams, not
summaries; their command output contains each runner's final result and exit code.

| Command | Retained raw record | Exact result |
| --- | --- | --- |
| unrestricted `just e2e-test` | `phase-18-e2e.raw.log` | **FAIL**: 147 passed and 1 failed in 1.4m. The failure is the 13-pixel `appearance-minimal-light.png` screenshot mismatch; the wrapper reports `verify-ui` and `e2e-test` exit code 1. |
| isolated-cache `just verify 002-editor-stage-formatting` | `phase-18-verify.raw.log` | **FAIL**: M1 format, M3 static analysis, and M4 tests failed; M2 types, M5 architecture, and M6 build passed. The verifier reports `verify ...: FAILED` and exit code 1. |

The failures are real and analyzed rather than unreliable: `appearance.test.ts` is not Prettier-formatted and
its minimal-light screenshot is unstable; `ShellMenuRow.tsx` has one unused callback and three render-time ref
accesses; `App.test.tsx` has two deterministic assertions that no longer match the current View-menu and
document-projection behavior. No source, test, gate, deferred boundary, or historic Phase 16 evidence was
altered during this evidence-only task.
