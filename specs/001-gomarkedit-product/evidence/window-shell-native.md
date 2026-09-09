# T035 native window shell — current-host real-build evidence

Date: 2026-08-02

Host: macOS 26.5.2 (`Darwin arm64`, build `25F84`)

Built artifact:

- app bundle: `/Users/ok/Development/GitHub/go_mark_edit/build/bin/GoMarkEdit.app`
- packaged binary: `/Users/ok/Development/GitHub/go_mark_edit/build/bin/GoMarkEdit.app/Contents/MacOS/GoMarkEdit`

This file is a one-host report only. Windows/Linux native runtime testing is intentionally deferred
until whole-application completion; this record is sufficient for the shell slice and intermediate
stages and does not claim final whole-application cross-platform completion.

Status meanings used below:

- `observed` — directly verified in the current-host packaged-app walkthrough;
- `supported` — not fully completed in the walkthrough, but backed by retained tests/code/browser evidence;
- `not observed` — not directly completed in the walkthrough and not promoted to a pass claim.

## Direct current-host observations

### Real build

- `rtk just build` with host access → exit 0.
- Result: Wails packaged the app and produced
  `/Users/ok/Development/GitHub/go_mark_edit/build/bin/GoMarkEdit.app/Contents/MacOS/GoMarkEdit`.

### Native packaged-app walkthrough

After killing the stale GoMarkEdit test process and rebuilding sequentially, packaged-app accessibility
inspection succeeded:

- `sky.get_app_state({ app: '/Users/ok/Development/GitHub/go_mark_edit/build/bin/GoMarkEdit.app', disableDiff: true })`
- `sky.get_app_state({ app: 'GoMarkEdit', disableDiff: true })`

Observed native shell facts from that walkthrough:

- Initial packaged-app screenshot was `1024 x 768`.
- Accessibility exposed a standard native window with macOS native close, full-screen, and minimize
  controls, plus the macOS menu bar `GoMarkEdit` and `Edit`.
- Dragging the native bottom-right window corner from `(1020,765)` to `(375,480)` produced a
  `375 x 480` screenshot. At that size the shell stacked editor and preview vertically, retained a
  `46 px` left rail, and showed no visible horizontal clipping.
- Dragging back from `(373,478)` to `(1021,765)` restored the desktop layout; accessibility then
  exposed the shell splitter with `Value 256`.
- The real Settings button opened the real Settings menu with Theme, Appearance choices, and an
  Appearance entry. Opening Appearance showed a real Settings dialog whose accessibility tree included
  a `Settings` heading, the expected help text, Theme and Appearance radio groups, `Reset appearance`,
  and `Close`. Pressing `Escape` closed the dialog and returned to the normal shell.
- The real View button opened a `View` menu with `Show Editor`, `Show Preview`, and `Show Workspace`.
  Pressing `Escape` closed it and returned focus to the View popup button.
- The real About button opened `About GoMarkEdit` with `Version dev` and `Close`. Pressing `Escape`
  closed it.
- The native minimize button was invoked; a later `get_app_state` re-raised and observed the normal
  window again.
- After a fresh packaged launch, clicking AX native close at index `28` returned immediately;
  `sky.list_apps()` then reported `com.wails.GoMarkEdit` with `isRunning: false`.
- Relaunch by the app bundle succeeded after that native close.
- Native zoom secondary action was invoked once to maximize and once to restore.
- Pressing `F11` removed the native title controls while full-screen was active, and a second `F11`
  restored them.
- Native title-bar drag and native double-click were invoked. Double-click visibly toggled the window
  between a normal window and a maximized full-width window.
- The app exposed no DOM drag/resize affordance in accessibility beyond the ordinary OS frame.
- A second real packaged build was produced with
  `wails build -ldflags '-X github.com/sanyokkua/go_mark_edit/internal/bootstrap.version=2.7.4-test+injected'`
  (exit 0). Its About dialog directly showed `Version 2.7.4-test+injected`; the earlier ordinary build
  directly showed the exact fallback `Version dev`.

Cases that were not completed in this pass:

- direct close during pending `250 ms` layout persistence flush;
- two-process stale-close ordering / independent simultaneous packaged windows; a second packaged copy
  was launched in a separate terminal session, but this pass did not distinguish the two windows in
  accessibility, so no visual two-process arbitration claim is made;
- startup-failure rendering and Retry in the packaged app;
- notification lifecycle timing/dedup/queue behavior in the packaged app;
- exact opener-focus target after every modal close.

## Current-host coverage matrix

| Area                                                                                                                           | Status       | Direct current-host evidence                                                                                                                                                                                                                                                                                                                                                                        | Supporting artifacts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OS-managed movement, title-bar gesture, ordinary frame, native controls                                                        | observed     | AX exposed a standard native window with macOS close/full-screen/minimize controls and macOS `GoMarkEdit`/`Edit` menu-bar roles. Native title-bar drag and native double-click were exercised. After a fresh packaged launch, clicking AX native close index `28` terminated the app immediately, and relaunch by app bundle succeeded. No DOM drag/resize control was exposed beyond the OS frame. | Contract: [`window-launcher-shell.md`](../contracts/window-launcher-shell.md). [`main.go`](/Users/ok/Development/GitHub/go_mark_edit/main.go) keeps `Frameless: false` and `DisableResize: false`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Border/corner resizing and exact `375 x 480` native minimum                                                                    | observed     | Dragging the native bottom-right corner to `(375,480)` produced a `375 x 480` screenshot. Resizing back restored the desktop layout.                                                                                                                                                                                                                                                                | [`main.go`](/Users/ok/Development/GitHub/go_mark_edit/main.go) sets `MinWidth: 375`, `MinHeight: 480`. Native restore/clamp tests: [`internal/application/native_window_test.go`](/Users/ok/Development/GitHub/go_mark_edit/internal/application/native_window_test.go), [`internal/application/application_test.go`](/Users/ok/Development/GitHub/go_mark_edit/internal/application/application_test.go).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Minimize, maximize/restore, and `F11` full screen                                                                              | observed     | Native minimize was invoked; later state inspection re-raised the normal window. Native zoom secondary action maximized and restored. `F11` removed native title controls in full screen, and a second `F11` restored them.                                                                                                                                                                         | F11 adapter/action support: [`frontend/src/logic/actions/useShellShortcuts.test.tsx`](/Users/ok/Development/GitHub/go_mark_edit/frontend/src/logic/actions/useShellShortcuts.test.tsx), [`frontend/src/logic/adapter/windowAdapter.test.ts`](/Users/ok/Development/GitHub/go_mark_edit/frontend/src/logic/adapter/windowAdapter.test.ts).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Hidden restore-before-show and no position/full-screen restore claim                                                           | supported    | Initial observed packaged-app size was `1024 x 768`, but this pass did not directly prove the hidden restore-before-show sequence or independently verify the absence of position/full-screen restore.                                                                                                                                                                                              | [`main.go`](/Users/ok/Development/GitHub/go_mark_edit/main.go) sets `StartHidden: true`. [`internal/application/native_window_test.go`](/Users/ok/Development/GitHub/go_mark_edit/internal/application/native_window_test.go) and [`internal/application/application_test.go`](/Users/ok/Development/GitHub/go_mark_edit/internal/application/application_test.go) verify hidden restore, one-shot show-after-readiness, and no full-screen restore ownership.                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Close while a `250 ms` continuous layout persistence is pending, including authoritative flush                                 | supported    | Not completed in this walkthrough. No direct close/flush timing claim is made.                                                                                                                                                                                                                                                                                                                      | [`internal/appmodel/layout_repository_sqlite_test.go`](/Users/ok/Development/GitHub/go_mark_edit/internal/appmodel/layout_repository_sqlite_test.go) covers delayed `250 ms` persistence, synchronous close flush, in-flight timer coordination, and retry identity retention. [`internal/application/application_test.go`](/Users/ok/Development/GitHub/go_mark_edit/internal/application/application_test.go) verifies close waits for the timer-owned flush before database shutdown.                                                                                                                                                                                                                                                                                                                                                                                                      |
| Two-process stale-close ordering and independent windows                                                                       | not observed | A second packaged copy was launched in a separate terminal session, but this pass did not distinguish the two windows in AX, so no direct two-process visual/arbitration claim is made.                                                                                                                                                                                                             | Partial support: [`internal/appmodel/layout_repository_sqlite_test.go`](/Users/ok/Development/GitHub/go_mark_edit/internal/appmodel/layout_repository_sqlite_test.go) proves stale-writer arbitration across two SQLite-backed handles and preserves the stored winner.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Isolated startup failure surface with exact recovery copy and Retry, including repeated-failure safety                         | supported    | Not completed in the packaged app in this pass.                                                                                                                                                                                                                                                                                                                                                     | [`frontend/src/ui/widgets/StartupFailure.test.tsx`](/Users/ok/Development/GitHub/go_mark_edit/frontend/src/ui/widgets/StartupFailure.test.tsx) proves the exact recovery copy and excludes raw paths/errors. [`internal/application/startup_retry_test.go`](/Users/ok/Development/GitHub/go_mark_edit/internal/application/startup_retry_test.go) and [`frontend/src/logic/adapter/windowAdapter.test.ts`](/Users/ok/Development/GitHub/go_mark_edit/frontend/src/logic/adapter/windowAdapter.test.ts) prove typed repeatable Retry wiring.                                                                                                                                                                                                                                                                                                                                                   |
| Settings/View/About and keyboard actions, plus applicable macOS App/Edit roles                                                 | observed     | Settings opened the real menu and Appearance dialog; View opened with `Show Editor`, `Show Preview`, and `Show Workspace`; About opened `About GoMarkEdit` with `Version dev`; `Escape` dismissed each observed surface. AX also showed macOS `GoMarkEdit` and `Edit` menu-bar roles. F11 keyboard behavior is recorded in the separate native full-screen row.                                     | Shipped catalogue/menu support: [`frontend/src/ui/widgets/ShellMenuRow.test.tsx`](/Users/ok/Development/GitHub/go_mark_edit/frontend/src/ui/widgets/ShellMenuRow.test.tsx), [`frontend/src/logic/actions/shellActions.test.ts`](/Users/ok/Development/GitHub/go_mark_edit/frontend/src/logic/actions/shellActions.test.ts), [`internal/application/native_menu.go`](/Users/ok/Development/GitHub/go_mark_edit/internal/application/native_menu.go).                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Settings acknowledgement, reset success/failure support, focus trap, Escape, and opener restoration                            | supported    | This walkthrough directly observed the real Settings dialog, the expected controls/help text, and `Escape` closing the dialog. It did not complete reset success/failure or verify the exact opener-restoration target for every close path.                                                                                                                                                        | [`frontend/src/ui/widgets/SettingsDialog.test.tsx`](/Users/ok/Development/GitHub/go_mark_edit/frontend/src/ui/widgets/SettingsDialog.test.tsx) proves focus trap, Escape close, and opener restoration. [`internal/settings/repository_sqlite_test.go`](/Users/ok/Development/GitHub/go_mark_edit/internal/settings/repository_sqlite_test.go) proves reset changes only delivered appearance keys and rolls back atomically on failure. [`window-shell-verification.md`](window-shell-verification.md) retains earlier shell walkthrough evidence.                                                                                                                                                                                                                                                                                                                                           |
| Desktop, `768 px` rail, `375 px` off-canvas sidebar, and divider acknowledgement                                               | supported    | Directly observed: at `375 x 480` the shell stacked editor/preview, retained a `46 px` left rail, and showed no visible horizontal clipping; resizing back restored the desktop layout; AX later showed splitter `Value 256`. This pass did not perform a dedicated divider drag/acknowledgement check.                                                                                             | Responsive/divider support: [`frontend/src/ui/widgets/AppShell.test.tsx`](/Users/ok/Development/GitHub/go_mark_edit/frontend/src/ui/widgets/AppShell.test.tsx). Automated viewport/divider timing evidence: [`window-shell-verification.md`](window-shell-verification.md), [`window-shell-browser.json`](window-shell-browser.json).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Injected About identity and exact `dev` fallback                                                                               | observed     | The ordinary packaged build directly showed `Version dev`. A second real packaged build made with `wails build -ldflags '-X github.com/sanyokkua/go_mark_edit/internal/bootstrap.version=2.7.4-test+injected'` directly showed `Version 2.7.4-test+injected` in About.                                                                                                                              | [`internal/bootstrap/version.go`](/Users/ok/Development/GitHub/go_mark_edit/internal/bootstrap/version.go) defines the exact fallback `dev`. [`internal/appmodel/service_test.go`](/Users/ok/Development/GitHub/go_mark_edit/internal/appmodel/service_test.go) proves the backend projects one Go build identity. [`frontend/src/ui/widgets/AboutDialog.test.tsx`](/Users/ok/Development/GitHub/go_mark_edit/frontend/src/ui/widgets/AboutDialog.test.tsx) proves the dialog renders the exact projected version.                                                                                                                                                                                                                                                                                                                                                                            |
| Notification deduplication, timing, error queue, and inline banner behavior                                                    | supported    | Not completed in the packaged app in this pass. No native notification lifecycle claim is made.                                                                                                                                                                                                                                                                                                     | [`frontend/src/logic/store/notificationsSlice.test.ts`](/Users/ok/Development/GitHub/go_mark_edit/frontend/src/logic/store/notificationsSlice.test.ts) proves deduplication by classified code + subject, error queue promotion, non-error displacement, and continuing-condition refresh. [`frontend/src/ui/primitives/Toast.test.tsx`](/Users/ok/Development/GitHub/go_mark_edit/frontend/src/ui/primitives/Toast.test.tsx) proves exact 4s/6s/8s dismissal and non-dismissing errors above dialogs. [`frontend/src/ui/primitives/Banner.test.tsx`](/Users/ok/Development/GitHub/go_mark_edit/frontend/src/ui/primitives/Banner.test.tsx) proves inline banner rendering. [`frontend/src/logic/store/appModelProjection.test.ts`](/Users/ok/Development/GitHub/go_mark_edit/frontend/src/logic/store/appModelProjection.test.ts) proves async layout failures become one safe notification. |
| Absence of File, launcher, recents, real tabs, future Settings groups, Assistant controls/content, and other future facsimiles | supported    | This walkthrough directly confirmed native framing without DOM window-control facsimiles and directly exercised the currently shipped Settings/View/About shell. It did not complete a dedicated packaged-app audit for every future-surface absence clause, so no broader native absence claim is made here.                                                                                       | [`frontend/src/App.test.tsx`](/Users/ok/Development/GitHub/go_mark_edit/frontend/src/App.test.tsx) proves no downstream File/launcher/recent/tab/Assistant surfaces. [`frontend/src/ui/widgets/AppShell.test.tsx`](/Users/ok/Development/GitHub/go_mark_edit/frontend/src/ui/widgets/AppShell.test.tsx) proves no Assistant control/content or fake tabs. [`frontend/src/ui/widgets/SettingsDialog.test.tsx`](/Users/ok/Development/GitHub/go_mark_edit/frontend/src/ui/widgets/SettingsDialog.test.tsx) proves future groups stay absent. [`window-shell-verification.md`](window-shell-verification.md) records those absences in the live browser shell at desktop and `375 px`.                                                                                                                                                                                                           |

## T035 status

Current state: complete evidence record for the T035 checklist, with direct current-host observations
where the packaged app could be operated and explicit `supported`/`not observed` boundaries for cases
that require fault injection, timing instrumentation, or process-level inspection unavailable in this
walkthrough.

- The real packaged build requirement was satisfied on this host.
- The packaged app was directly observed for native frame, native resizing/minimum, native close
  invocation/termination, minimize, maximize/restore, full screen, Settings/View/About, and exact
  `Version dev`.
- This file still does **not** claim direct native completion for close/flush timing, two-process
  ordering, startup-failure rendering, packaged-app notification lifecycle, or cross-platform runtime
  behavior. The injected non-`dev` identity is now directly observed.
- Windows and Linux are intentionally untested at this stage. Their native runtime verification belongs
  to the final whole-application completion gate.

Changed file for this pass:

- `specs/001-gomarkedit-product/evidence/window-shell-native.md`

## T039 follow-up after Settings convergence

The fresh darwin/arm64 `just build` completed successfully. The real Wails bridge was also launched
with `just dev`, and its printed `http://localhost:34115` URL was operated in the in-app browser.
Direct current-host observations from that real bridge were:

- at 375 × 480, the workspace measured 230 pixels, centre panes stacked, action overflow was present,
  and the page had no horizontal overflow;
- at 375 × 480 and 1280 × 720, the Settings popup stayed wholly inside the viewport and was a body
  portal above the shell clipping context;
- Theme was changed by pointer and Appearance by keyboard through the real bridge;
- both Close and Escape restored focus to the exact connected desktop Settings opener and narrow More
  actions opener;
- File, launcher, recent items, tab strip, Assistant controls/content, and future Settings groups were
  absent from the directly inspected live surface;
- no browser warning or error log was emitted.

This follow-up does not close every T039 native-only obligation. Native automation did not retain a
post-fix packaged 375 × 480 screenshot after resizing. Pending-close persistence, distinguishable
simultaneous-process stale-close ordering, isolated startup-failure/Retry, divider acknowledgement,
and production notification timing/deduplication/error-queue/banner behavior still lack direct retained
current-host observations. Production exposes no success/info/warning or continuing-condition trigger,
so adding a fake trigger solely for evidence would violate the no-placeholder rule. These cases remain
unresolved in the T038 reconciliation. Windows/Linux runtime testing remains intentionally deferred
until whole-application completion.

## Approved T039 evidence mechanism

The 2026-08-02 clarification approves a build-tagged native evidence driver for the otherwise
unreachable cases above. The driver must be absent from release builds, reuse the real native shell and
production components, and inject deterministic startup, persistence, concurrency, divider, toast, and
banner scenarios only through existing dependency boundaries. It must retain the selected scenario and
directly observed native result. A separate ordinary packaged-build walkthrough remains mandatory for
every naturally reachable behavior; the evidence driver cannot replace it. T039 remains incomplete
until both evidence sets are retained. The Windows/Linux runtime-test deferral is unchanged.

## T039 closure — build-tagged evidence plus ordinary app bundle

The earlier incomplete notes above are historical and are superseded by the retained T039 record at
[`t039-native/manifest.md`](t039-native/manifest.md).

The release-excluded driver directly observed pending-close flush, distinguishable simultaneous-process
stale-close ordering, repeated startup failure followed by successful Retry, exact divider acknowledgement,
4/6/8-second toast timing, duplicate refresh, the three-visible/fourth-queued error rule, promotion after
dismissal, and persistent continuing-banner deduplication in separately identified native Wails windows.

A fresh ordinary `just build` app bundle was separately walked for every naturally reachable case. It
retained the repaired minimum-size off-canvas workspace, stacked panes, separator acknowledgement and
relaunch persistence, Settings reset, Close/Escape opener focus, View, About/version, ordinary OS frame,
and the complete future-surface absence audit. The ordinary walkthrough contains no evidence-driver UI.

T039's current-host observations are complete on macOS 26.5.2 arm64. Windows/Linux runtime repetition
remains intentionally deferred until whole-application completion; no cross-platform runtime claim is
made here.
