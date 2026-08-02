# T036 native window-shell reconciliation

Date: 2026-08-02

This document reconciles `FR-WS-001` through `FR-WS-020`, `SC-013` through `SC-018`, the native
window contract, and the T001 retained baseline. Evidence is deliberately separated into automated,
browser/mock, and native current-host observations.

Tested native host: macOS 26.5.2, Darwin arm64, build 25F84. The native record is one-host evidence;
Windows/Linux runtime testing is intentionally deferred until whole-application completion. The exact T035 native walkthrough is
[`window-shell-native.md`](window-shell-native.md). The T033 automated matrix/request/timing record is
[`window-shell-browser.json`](window-shell-browser.json) (`task: T033`, `expected: 22`, `passed: true`,
151 local requests). T034 command/exit/reliability records and raw logs are in
[`t034-final-gates/manifest.md`](t034-final-gates/manifest.md). T001 is
[`feature-001-gomarkedit-product.md`](../../../docs/delivery/work/baselines/feature-001-gomarkedit-product.md).

For the required classification vocabulary, the last column contains only `code defect`, `approved
specification amendment`, or `unresolved blocker` when a difference exists. `—` means no difference was
found and therefore nothing is classified. The user-approved runtime-test timing amendment is recorded
in the current specification and supporting plan, so the deferred Windows/Linux gate is not classified
as an unresolved shell-slice difference.

## Functional requirements

| Requirement | Evidence and exact references | Kind / host | Difference classification |
| --- | --- | --- | --- |
| FR-WS-001 — native desktop shell, independent windows, no server/account | `just build` exit 0 in [`t034-final-gates/build.log`](t034-final-gates/build.log); lifecycle/multi-process tests in [`internal/application/native_window_test.go`](/Users/ok/Development/GitHub/go_mark_edit/internal/application/native_window_test.go); packaged app launched/relaunched in [`window-shell-native.md`](window-shell-native.md). | automated + native / macOS arm64 | — |
| FR-WS-002 — ordinary OS frame and macOS App/Edit roles | `Frameless: false` in [`main.go`](/Users/ok/Development/GitHub/go_mark_edit/main.go); native AX close/full-screen/minimize and GoMarkEdit/Edit roles in [`window-shell-native.md`](window-shell-native.md); menu tests in [`internal/application/native_window_test.go`](/Users/ok/Development/GitHub/go_mark_edit/internal/application/native_window_test.go). | automated + native / macOS arm64 | — |
| FR-WS-003 — OS-owned movement/title gestures/maximize/restore | Native title drag/double-click and zoom are recorded in [`window-shell-native.md`](window-shell-native.md); absence of DOM drag handling is enforced by [`frontend/scripts/archtest.mjs`](/Users/ok/Development/GitHub/go_mark_edit/frontend/scripts/archtest.mjs). | automated + native / macOS arm64 | — |
| FR-WS-004 — F11 native full screen | `F11` path is tested in [`useShellShortcuts.test.tsx`](/Users/ok/Development/GitHub/go_mark_edit/frontend/src/logic/actions/useShellShortcuts.test.tsx) and [`windowAdapter.test.ts`](/Users/ok/Development/GitHub/go_mark_edit/frontend/src/logic/adapter/windowAdapter.test.ts); native toggle is recorded in [`window-shell-native.md`](window-shell-native.md). | automated + native / macOS arm64 | — |
| FR-WS-005 — OS resize and exact 375 × 480 minimum | `MinWidth: 375`/`MinHeight: 480` in [`main.go`](/Users/ok/Development/GitHub/go_mark_edit/main.go); native 375 × 480 resize in [`window-shell-native.md`](window-shell-native.md); lifecycle tests in [`native_window_test.go`](/Users/ok/Development/GitHub/go_mark_edit/internal/application/native_window_test.go). | automated + native / macOS arm64 | — |
| FR-WS-006 — hidden restore before display and independent fallback | `StartHidden: true` and restore wiring in [`main.go`](/Users/ok/Development/GitHub/go_mark_edit/main.go); independent fallback/show-once tests in [`application_test.go`](/Users/ok/Development/GitHub/go_mark_edit/internal/application/application_test.go); observed 1024 × 768 launch in [`window-shell-native.md`](window-shell-native.md). | automated + native / macOS arm64 | — |
| FR-WS-007 — three structural regions and zero-width Assistant | AppShell tests in [`AppShell.test.tsx`](/Users/ok/Development/GitHub/go_mark_edit/frontend/src/ui/widgets/AppShell.test.tsx) and T033 matrix assertions in [`window-shell-browser.json`](window-shell-browser.json). | automated + browser/mock / current dev UI | — |
| FR-WS-008 — 768 rail, 375 off-canvas, stacked panes, no fake tabs | Exact 18-case Playwright command is recorded in [`window-shell-browser.json`](window-shell-browser.json); native 375 layout and 46 px rail are in [`window-shell-native.md`](window-shell-native.md). | automated + browser/mock + native / macOS arm64 | — |
| FR-WS-009 — exact durable/excluded layout fields | Appmodel/repository tests in [`layout_repository_sqlite_test.go`](/Users/ok/Development/GitHub/go_mark_edit/internal/appmodel/layout_repository_sqlite_test.go) and model definitions in [`model.go`](/Users/ok/Development/GitHub/go_mark_edit/internal/appmodel/model.go). | automated / host-independent | — |
| FR-WS-010 — document-owned arrangement/fallback precedence | Arrangement tests in [`service_test.go`](/Users/ok/Development/GitHub/go_mark_edit/internal/appmodel/service_test.go) and document view projection in [`model.go`](/Users/ok/Development/GitHub/go_mark_edit/internal/appmodel/model.go). | automated / host-independent | — |
| FR-WS-011 — immediate/debounced/close persistence/latest identity wins | Exact focused Go tests are retained in [`layout_repository_sqlite_test.go`](/Users/ok/Development/GitHub/go_mark_edit/internal/appmodel/layout_repository_sqlite_test.go) and [`application_test.go`](/Users/ok/Development/GitHub/go_mark_edit/internal/application/application_test.go); T034 `just test` output is [`t034-final-gates/test.log`](t034-final-gates/test.log). | automated / host-independent | — |
| FR-WS-012 — acknowledged failures/stale-winner reload | Failure/conflict tests in [`layout_repository_sqlite_test.go`](/Users/ok/Development/GitHub/go_mark_edit/internal/appmodel/layout_repository_sqlite_test.go), async notification projection in [`appModelProjection.test.ts`](/Users/ok/Development/GitHub/go_mark_edit/frontend/src/logic/store/appModelProjection.test.ts). | automated + browser/mock / host-independent | — |
| FR-WS-013 — recoverable startup failure and Retry | Exact recovery copy in [`StartupFailure.test.tsx`](/Users/ok/Development/GitHub/go_mark_edit/frontend/src/ui/widgets/StartupFailure.test.tsx); retry lifecycle in [`startup_retry_test.go`](/Users/ok/Development/GitHub/go_mark_edit/internal/application/startup_retry_test.go); no packaged fault injection was available in T035. | automated + browser/mock / current dev UI | — |
| FR-WS-014 — canonical working shell actions/menus | Catalogue tests in [`shellActions.test.ts`](/Users/ok/Development/GitHub/go_mark_edit/frontend/src/logic/actions/shellActions.test.ts) and [`ShellMenuRow.test.tsx`](/Users/ok/Development/GitHub/go_mark_edit/frontend/src/ui/widgets/ShellMenuRow.test.tsx); native Settings/View/About and App/Edit roles in [`window-shell-native.md`](window-shell-native.md). | automated + native / macOS arm64 | — |
| FR-WS-015 — synchronized Settings/atomic reset/focus | Reset transaction tests in [`repository_sqlite_test.go`](/Users/ok/Development/GitHub/go_mark_edit/internal/settings/repository_sqlite_test.go), modal behavior in [`SettingsDialog.test.tsx`](/Users/ok/Development/GitHub/go_mark_edit/frontend/src/ui/widgets/SettingsDialog.test.tsx), and native dialog/Escape in [`window-shell-native.md`](window-shell-native.md). | automated + native / macOS arm64 | — |
| FR-WS-016 — severity/dedup/timing/capacity/queue/banner | Rules are tested in [`notificationsSlice.test.ts`](/Users/ok/Development/GitHub/go_mark_edit/frontend/src/logic/store/notificationsSlice.test.ts), [`Toast.test.tsx`](/Users/ok/Development/GitHub/go_mark_edit/frontend/src/ui/primitives/Toast.test.tsx), and [`Banner.test.tsx`](/Users/ok/Development/GitHub/go_mark_edit/frontend/src/ui/primitives/Banner.test.tsx); browser consumer evidence is [`window-shell-browser.json`](window-shell-browser.json). | automated + browser/mock / current dev UI | — |
| FR-WS-017 — accessible/localized/palette-coherent shell | `just archtest` raw output is [`t034-final-gates/archtest.log`](t034-final-gates/archtest.log); 18-palette matrix and focus actions are [`window-shell-browser.json`](window-shell-browser.json); native Escape/F11/menu actions are [`window-shell-native.md`](window-shell-native.md). | automated + browser/mock + native / macOS arm64 | — |
| FR-WS-018 — offline shell/zero outbound requests | `just frontend-build` raw output is [`t034-final-gates/frontend-build.log`](t034-final-gates/frontend-build.log); request command/result and all-local request log are [`window-shell-browser.json`](window-shell-browser.json). | automated + browser/mock / current dev UI | — |
| FR-WS-019 — injected identity and exact `dev` fallback | `internal/bootstrap/version.go` and [`version_test.go`](/Users/ok/Development/GitHub/go_mark_edit/internal/bootstrap/version_test.go); ordinary and injected real-build About observations are [`window-shell-native.md`](window-shell-native.md). | automated + native / macOS arm64 | — |
| FR-WS-020 — honest absence of future surfaces | Absence assertions are in [`App.test.tsx`](/Users/ok/Development/GitHub/go_mark_edit/frontend/src/App.test.tsx), [`AppShell.test.tsx`](/Users/ok/Development/GitHub/go_mark_edit/frontend/src/ui/widgets/AppShell.test.tsx), and [`SettingsDialog.test.tsx`](/Users/ok/Development/GitHub/go_mark_edit/frontend/src/ui/widgets/SettingsDialog.test.tsx); browser/native absence notes are [`window-shell-browser.json`](window-shell-browser.json) and [`window-shell-native.md`](window-shell-native.md). | automated + browser/mock + native / macOS arm64 | — |

## Success criteria

| Criterion | Evidence and exact references | Kind / host | Difference classification |
| --- | --- | --- | --- |
| SC-013 — 18 viewport/palette combinations with no clipping/future chrome | Exact command/result is in [`window-shell-browser.json`](window-shell-browser.json): `npm exec -- playwright test e2e/window-shell.test.ts --reporter=json`, `expected: 22`, matrix `18`, `passed: true`; native supplemental 375/desktop is [`window-shell-native.md`](window-shell-native.md). | browser/mock + native / macOS arm64 | — |
| SC-014 — 20 resize and 20 divider samples under thresholds | `window-shell-browser.json` retains `20` resize and `20` divider samples; T033 command and thresholds are summarized in [`window-shell-verification.md`](window-shell-verification.md). | browser/mock / current dev UI | — |
| SC-015 — two-window latest-wins and failed-write retention | Deterministic two-handle/close-order tests are in [`layout_repository_sqlite_test.go`](/Users/ok/Development/GitHub/go_mark_edit/internal/appmodel/layout_repository_sqlite_test.go); native second-copy attempt and its non-claim are in [`window-shell-native.md`](window-shell-native.md). | automated + native attempt / host-independent + macOS arm64 | — |
| SC-016 — startup failure hidden, Retry once, no raw/private detail | Exact UI/retry tests are [`StartupFailure.test.tsx`](/Users/ok/Development/GitHub/go_mark_edit/frontend/src/ui/widgets/StartupFailure.test.tsx) and [`startup_retry_test.go`](/Users/ok/Development/GitHub/go_mark_edit/internal/application/startup_retry_test.go); browser evidence is [`window-shell-browser.json`](window-shell-browser.json). | automated + browser/mock / current dev UI | — |
| SC-017 — zero outbound attempts with retained request log | Static/bundle commands are [`t034-final-gates/frontend-build.log`](t034-final-gates/frontend-build.log) and [`t034-final-gates/archtest.log`](t034-final-gates/archtest.log); all 151 observed requests are in [`window-shell-browser.json`](window-shell-browser.json) and have local origins. | automated + browser/mock / current dev UI | — |
| SC-018 — current-host real-build walkthrough and final whole-application cross-platform gate | Native operations, menus, identities, close, and absence are in [`window-shell-native.md`](window-shell-native.md); T034 real build is [`t034-final-gates/build.log`](t034-final-gates/build.log). Windows/Linux native runtime testing is intentionally deferred until whole-application completion and is not a shell-slice blocker. | native + automated / macOS arm64 | — |

## Contract and baseline

| Authority | Evidence and exact references | Kind / host | Difference classification |
| --- | --- | --- | --- |
| Native Window Shell contract | Normative contract is [`window-launcher-shell.md`](../contracts/window-launcher-shell.md); it is exercised by T032/T033/T034/T035 artifacts above. No contract file was edited. | automated + browser/mock + native / macOS arm64 | — |
| T001 retained baseline | T034 inspected [`feature-001-gomarkedit-product.md`](../../../docs/delivery/work/baselines/feature-001-gomarkedit-product.md) and retained raw logs; [`t034-final-gates/manifest.md`](t034-final-gates/manifest.md) records `just fmt-check`, `just typecheck`, `just lint`, `just test`, `just archtest`, `just frontend-build`, `just build`, and `just verify 001-gomarkedit-product`, all exit 0/reliable. | automated / authoritative reruns | — |

## Reconciliation result

- No code defect was identified. The user-approved amendment that defers Windows/Linux native runtime
  tests until whole-application completion is recorded in the current specification, plan, contract,
  and evidence.
- Every FR-WS requirement and SC-013..018 criterion has one evidence row with file links, exact
  commands or retained artifact identifiers, evidence kind, and host.
- `SC-018` has no unresolved shell-slice difference: the current-host walkthrough is complete, and the
  Windows/Linux native runtime gate is explicitly deferred until whole-application completion.
- T035’s timing, fault-injection, and process-level gaps remain explicitly bounded in its evidence file
  and are backed by deterministic automated tests where available.
