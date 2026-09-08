# T036 native window-shell reconciliation

Date: 2026-08-02

Status: closed by T039. T038's reopened cases now have direct current-host evidence in
[`t039-native/manifest.md`](t039-native/manifest.md); the no-difference result is restored for this
native-shell slice.

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
| FR-WS-008 — 768 rail, 375 off-canvas, stacked panes, no fake tabs | Exact 18-case Playwright command is recorded in [`window-shell-browser.json`](window-shell-browser.json); the repaired ordinary app-bundle minimum-size walkthrough and screenshot are in [`t039-native/manifest.md`](t039-native/manifest.md). | automated + browser/mock + native / macOS arm64 | — |
| FR-WS-009 — exact durable/excluded layout fields | Appmodel/repository tests in [`layout_repository_sqlite_test.go`](/Users/ok/Development/GitHub/go_mark_edit/internal/appmodel/layout_repository_sqlite_test.go) and model definitions in [`model.go`](/Users/ok/Development/GitHub/go_mark_edit/internal/appmodel/model.go). | automated / host-independent | — |
| FR-WS-010 — document-owned arrangement/fallback precedence | Arrangement tests in [`service_test.go`](/Users/ok/Development/GitHub/go_mark_edit/internal/appmodel/service_test.go) and document view projection in [`model.go`](/Users/ok/Development/GitHub/go_mark_edit/internal/appmodel/model.go). | automated / host-independent | — |
| FR-WS-011 — immediate/debounced/close persistence/latest identity wins | Exact focused Go tests are retained in [`layout_repository_sqlite_test.go`](/Users/ok/Development/GitHub/go_mark_edit/internal/appmodel/layout_repository_sqlite_test.go) and [`application_test.go`](/Users/ok/Development/GitHub/go_mark_edit/internal/application/application_test.go); T039 directly retains pending-close flush and distinguishable two-process stale-close ordering in [`t039-native/manifest.md`](t039-native/manifest.md). | automated + native / host-independent + macOS arm64 | — |
| FR-WS-012 — acknowledged failures/stale-winner reload | Failure/conflict tests in [`layout_repository_sqlite_test.go`](/Users/ok/Development/GitHub/go_mark_edit/internal/appmodel/layout_repository_sqlite_test.go), async notification projection in [`appModelProjection.test.ts`](/Users/ok/Development/GitHub/go_mark_edit/frontend/src/logic/store/appModelProjection.test.ts), and direct stored-winner identity after stale close in [`t039-native/manifest.md`](t039-native/manifest.md). | automated + browser/mock + native / host-independent + macOS arm64 | — |
| FR-WS-013 — recoverable startup failure and Retry | Exact recovery copy in [`StartupFailure.test.tsx`](/Users/ok/Development/GitHub/go_mark_edit/frontend/src/ui/widgets/StartupFailure.test.tsx); retry lifecycle in [`startup_retry_test.go`](/Users/ok/Development/GitHub/go_mark_edit/internal/application/startup_retry_test.go); repeated safe failure and successful second Retry are directly retained in [`t039-native/manifest.md`](t039-native/manifest.md). | automated + browser/mock + native / macOS arm64 | — |
| FR-WS-014 — canonical working shell actions/menus | Catalogue tests in [`shellActions.test.ts`](/Users/ok/Development/GitHub/go_mark_edit/frontend/src/logic/actions/shellActions.test.ts) and [`ShellMenuRow.test.tsx`](/Users/ok/Development/GitHub/go_mark_edit/frontend/src/ui/widgets/ShellMenuRow.test.tsx); native Settings/View/About and App/Edit roles in [`window-shell-native.md`](window-shell-native.md). | automated + native / macOS arm64 | — |
| FR-WS-015 — synchronized Settings/atomic reset/focus | Reset transaction tests in [`repository_sqlite_test.go`](/Users/ok/Development/GitHub/go_mark_edit/internal/settings/repository_sqlite_test.go), modal behavior in [`SettingsDialog.test.tsx`](/Users/ok/Development/GitHub/go_mark_edit/frontend/src/ui/widgets/SettingsDialog.test.tsx), and ordinary app-bundle reset plus exact Close/Escape opener restoration in [`t039-native/manifest.md`](t039-native/manifest.md). | automated + native / macOS arm64 | — |
| FR-WS-016 — severity/dedup/timing/capacity/queue/banner | Rules are tested in [`notificationsSlice.test.ts`](/Users/ok/Development/GitHub/go_mark_edit/frontend/src/logic/store/notificationsSlice.test.ts), [`Toast.test.tsx`](/Users/ok/Development/GitHub/go_mark_edit/frontend/src/ui/primitives/Toast.test.tsx), and [`Banner.test.tsx`](/Users/ok/Development/GitHub/go_mark_edit/frontend/src/ui/primitives/Banner.test.tsx); focused native timing/dedup/queue/promotion/banner history is retained in [`t039-native/manifest.md`](t039-native/manifest.md). | automated + browser/mock + native / macOS arm64 | — |
| FR-WS-017 — accessible/localized/palette-coherent shell | `just archtest` raw output is [`t034-final-gates/archtest.log`](t034-final-gates/archtest.log); 18-palette matrix and focus actions are [`window-shell-browser.json`](window-shell-browser.json); native Escape/F11/menu actions are [`window-shell-native.md`](window-shell-native.md). | automated + browser/mock + native / macOS arm64 | — |
| FR-WS-018 — offline shell/zero outbound requests | `just frontend-build` raw output is [`t034-final-gates/frontend-build.log`](t034-final-gates/frontend-build.log); request command/result and all-local request log are [`window-shell-browser.json`](window-shell-browser.json). | automated + browser/mock / current dev UI | — |
| FR-WS-019 — injected identity and exact `dev` fallback | `internal/bootstrap/version.go` and [`version_test.go`](/Users/ok/Development/GitHub/go_mark_edit/internal/bootstrap/version_test.go); ordinary and injected real-build About observations are [`window-shell-native.md`](window-shell-native.md). | automated + native / macOS arm64 | — |
| FR-WS-020 — honest absence of future surfaces | Absence assertions are in [`App.test.tsx`](/Users/ok/Development/GitHub/go_mark_edit/frontend/src/App.test.tsx), [`AppShell.test.tsx`](/Users/ok/Development/GitHub/go_mark_edit/frontend/src/ui/widgets/AppShell.test.tsx), and [`SettingsDialog.test.tsx`](/Users/ok/Development/GitHub/go_mark_edit/frontend/src/ui/widgets/SettingsDialog.test.tsx); the ordinary app-bundle AX absence audit is retained in [`t039-native/manifest.md`](t039-native/manifest.md). | automated + browser/mock + native / macOS arm64 | — |

## Success criteria

| Criterion | Evidence and exact references | Kind / host | Difference classification |
| --- | --- | --- | --- |
| SC-013 — 18 viewport/palette combinations with no clipping/future chrome | Exact command/result is in [`window-shell-browser.json`](window-shell-browser.json): `npm exec -- playwright test e2e/window-shell.test.ts --reporter=json`, `expected: 22`, matrix `18`, `passed: true`; repaired native 375 minimum and ordinary-shell absence audit are in [`t039-native/manifest.md`](t039-native/manifest.md). | browser/mock + native / macOS arm64 | — |
| SC-014 — 20 resize and 20 divider samples under thresholds | `window-shell-browser.json` retains `20` resize and `20` divider samples; T033 command and thresholds are summarized in [`window-shell-verification.md`](window-shell-verification.md). | browser/mock / current dev UI | — |
| SC-015 — two-window latest-wins and failed-write retention | Deterministic two-handle/close-order tests are in [`layout_repository_sqlite_test.go`](/Users/ok/Development/GitHub/go_mark_edit/internal/appmodel/layout_repository_sqlite_test.go); the distinguishable simultaneous-process stored-winner observation is in [`t039-native/manifest.md`](t039-native/manifest.md). | automated + native / host-independent + macOS arm64 | — |
| SC-016 — startup failure hidden, Retry once, no raw/private detail | Exact UI/retry tests are [`StartupFailure.test.tsx`](/Users/ok/Development/GitHub/go_mark_edit/frontend/src/ui/widgets/StartupFailure.test.tsx) and [`startup_retry_test.go`](/Users/ok/Development/GitHub/go_mark_edit/internal/application/startup_retry_test.go); direct native repeated-failure/success and safe-copy screenshots are in [`t039-native/manifest.md`](t039-native/manifest.md). | automated + browser/mock + native / macOS arm64 | — |
| SC-017 — zero outbound attempts with retained request log | Static/bundle commands are [`t034-final-gates/frontend-build.log`](t034-final-gates/frontend-build.log) and [`t034-final-gates/archtest.log`](t034-final-gates/archtest.log); all 151 observed requests are in [`window-shell-browser.json`](window-shell-browser.json) and have local origins. | automated + browser/mock / current dev UI | — |
| SC-018 — current-host real-build walkthrough and final whole-application cross-platform gate | Native operations, menus, identities, close, and absence are in [`window-shell-native.md`](window-shell-native.md); T039's separate evidence-driver and ordinary app-bundle walkthroughs are in [`t039-native/manifest.md`](t039-native/manifest.md). Windows/Linux native runtime testing is intentionally deferred until whole-application completion and is not a shell-slice blocker. | native + automated / macOS arm64 | — |

## Contract and baseline

| Authority | Evidence and exact references | Kind / host | Difference classification |
| --- | --- | --- | --- |
| Native Window Shell contract | Normative contract is [`window-launcher-shell.md`](../contracts/window-launcher-shell.md); it is exercised by T032/T033/T034/T035 artifacts above. No contract file was edited. | automated + browser/mock + native / macOS arm64 | — |
| T001 retained baseline | T034 inspected [`feature-001-gomarkedit-product.md`](../../../docs/delivery/work/baselines/feature-001-gomarkedit-product.md) and retained raw logs; [`t034-final-gates/manifest.md`](t034-final-gates/manifest.md) records `just fmt-check`, `just typecheck`, `just lint`, `just test`, `just archtest`, `just frontend-build`, `just build`, and `just verify 001-gomarkedit-product`, all exit 0/reliable. | automated / authoritative reruns | — |

## Reconciliation result

- T039 directly retained the repaired 230-point off-canvas minimum-size layout, pending-close flush,
  distinguishable simultaneous-process stale-close ordering, startup failure/Retry, Settings reset and
  exact focus restoration, divider acknowledgement, notification timing/deduplication/queue/promotion,
  persistent banner behavior, and the future-surface absence audit.
- Safeguards prove the build-tagged evidence driver is absent from the ordinary release package graph
  and linked binary and that every scenario enters only through an existing dependency boundary.
- The evidence-driver walkthrough supplements, and does not replace, a separate fresh ordinary
  `just build` app-bundle walkthrough for every naturally reachable case.
- No current-host code defect, approved specification amendment, or unresolved blocker remains for
  this native-shell slice. The no-difference reconciliation result is restored.
- The user-approved Windows/Linux runtime-test deferral remains unchanged until whole-application
  completion and is not a T039 blocker. No cross-platform runtime claim is made.
