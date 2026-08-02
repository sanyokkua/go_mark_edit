# Tasks: GoMarkEdit Product — Native Window Shell

**Input**: Approved design artifacts in `/specs/001-gomarkedit-product/`

**Binding scope**: Deliver exactly `FR-WS-001` through `FR-WS-020` from
`contracts/window-launcher-shell.md` around the existing document. The delivered appearance system is
a dependency, not new work. Ordinary operating-system-managed framed windows are the only window
model in this batch.

**Stop boundary**: Do not add launcher activation, zero-document state, New/Open/Open-folder commands,
recent items, File actions, file lifecycle, real tabs, rendering expansion, packaging, Editor
expansion, Assistant controls, or future Settings groups.

**Tests**: Required. Each implementation group starts with tests that must fail for the missing or
defective behavior. Test infrastructure, automated checks, browser evidence, native walkthroughs, and
documentation use `Supports:` and never claim requirement ownership.

## Format: `[ID] [P?] [Story] Description`

- **[P]** means the task has a disjoint file set and no dependency on another incomplete task.
- **[US1]** identifies the approved native-shell subset of User Story 1, “View Any Supported Markdown
  Document.”
- Each `FR-WS-*` appears in exactly one `Owns:` field. Its `Owner: OWS-*` is the sole plan owner from
  `plan.md`; support tasks refer to those owner keys without duplicating ownership.

## Governing constraints for every task

- Classify each touched seam from current code and direct tests before editing. Preserve conforming
  behavior, repair partial behavior, and implement missing behavior; a historical completion label is
  not evidence.
- Go/appmodel owns acknowledged layout and pending persistence intent. Redux is a projection. Browser
  storage and component state cannot become layout authorities. Each document owns its arrangement;
  application layout stores only the fallback for a document without saved view state.
- Every Wails-bound handler returns one typed `apperr.*Result`, takes no `context.Context`, uses a named
  result, recovers panics in its first statement, and calls its service only. Concrete wiring remains
  in `main.go` and `internal/application/application_context_holder.go`.
- Only `frontend/src/logic/adapter/` may import generated bindings or public Wails runtime operations.
  Generated Wails files are regenerated, never hand-edited.
- The operating system owns the frame, title bar, movement, title gestures, resize borders/cursors,
  minimize, maximize/restore, and close on macOS, Windows, and Linux. The app adds no replacement
  window controls, drag interception, resize target, or private native invocation.
- Use the delivered tokens and all six palettes. New colors belong in
  `frontend/src/ui/styles/tokens.css`; visible and accessible strings belong in
  `frontend/src/i18n/locales/en.json` and render through `t()`.
- Register only working full-screen, sidebar, Settings, View, and About actions. File, launcher,
  recents, real tabs, Assistant, future Settings, fake data, and enabled or disabled facsimiles stay
  absent.
- A failed layout or settings write retains the acknowledged projection. A stale layout write reloads
  the newer stored winner without an error. Errors expose no raw failure, secret, full URL, or private
  path.
- Do not weaken quality or architecture checks, add an architecture allowlist entry, skip or narrow a
  failing test, or accept a gate that analyzed nothing. Do not edit `docs/delivery/spec/` or
  `docs/delivery/architecture/`.

---

## Phase 1: Setup — Trustworthy Pre-Edit Baseline

**Purpose**: Preserve a reliable comparison point before any production edit.

- [X] T001 Run `just baseline 001-gomarkedit-product`, require reliable raw output, exit codes, and findings for every retained gate, and preserve the comparison point; Supports: OWS-001 through OWS-020 in `docs/delivery/work/baselines/feature-001-gomarkedit-product.md` and `docs/delivery/work/baselines/feature-001-gomarkedit-product.logs/`

**Hard stop**: If any gate exits nonzero after analyzing nothing, is marked `UNRELIABLE`, or
`just archtest` is red, stop before T002 and repair the gate or re-plan the batch.

---

## Phase 2: Foundational Test Infrastructure (Blocking)

**Purpose**: Add deterministic helpers used by failing tests and retained evidence. These helpers have
real test consumers in later tasks and own no product requirement.

- [X] T002 [P] Add deterministic clock, timer, writer-identity, failed-write, and two-connection SQLite fixtures consumed by T004–T005; Supports: OWS-006, OWS-009, OWS-010, OWS-011, OWS-012 in `internal/appmodel/layout_test_helpers_test.go`
- [X] T003 [P] Add Playwright request classification, monotonic resize/divider sampling, freeze observation, percentile assertions, and evidence-attachment helpers consumed by T026; Supports: OWS-008, OWS-017, OWS-018 in `frontend/e2e/helpers/shell-observation.ts`

**Checkpoint**: Helpers compile in their test suites and do not alter production behavior.

---

## Phase 3: User Story 1 — Native Window Shell (Priority: P1) MVP

**Goal**: The existing document appears inside a restored, platform-correct, accessible framed native
shell with durable acknowledged layout, working in-app menus, Settings, notifications, responsive
behavior, offline proof, and no future-surface facsimile.

**Independent Test**: Launch from clean, populated, invalid, and concurrently modified settings; use
native window operations and the in-app Settings/View/About row, Settings, sidebar, notifications, and
keyboard actions at 375, 768, and 1280 pixels in all six palettes. Force startup, layout, and settings
failures. Confirm newest-change persistence, exact recovery, atomic reset, focus, response limits, zero
outbound requests, and absence of File, launcher, recents, real tabs, future Settings, and Assistant.

### Group A — Backend-authoritative layout

> Write T004–T005 first and confirm the missing persistence, arbitration, acknowledgement, and
> arrangement assertions fail before T006.

- [X] T004 [US1] Add failing repository tests for exact durable/excluded fields, independent invalid-value fallback, legacy scalar reads, versioned values, atomic newer-only writes, two-connection stale refusal, winner reload, and close-order independence; Supports: OWS-006, OWS-009, OWS-011 in `internal/appmodel/layout_repository_sqlite_test.go`
- [X] T005 [US1] Add failing service, handler, adapter, and projection tests for document-arrangement precedence, immediate and 250-ms persistence, one pending value per field, original-identity close flush, acknowledged failure retention, classified rollback notification, stale-winner projection without error, typed handler envelopes, and Redux projection-only behavior; Supports: OWS-009, OWS-010, OWS-011, OWS-012 in `internal/appmodel/layout_service_test.go`, `internal/appmodel/handler_test.go`, `frontend/src/logic/adapter/appModelAdapter.test.ts`, and `frontend/src/logic/store/appModelProjection.test.ts`
- [X] T006 [US1] Owns: FR-WS-009. Owner: OWS-009. Define only native width/height/maximized state, workspace visibility/desktop width, and last-used arrangement fallback as durable layout; exclude position, full screen, responsive widths, document/content/tab state, document panes, and Assistant state; add versioned per-field validation/defaults and appmodel repository wiring in `internal/apperr/results.go`, `internal/appmodel/layout.go`, `internal/appmodel/layout_repository.go`, `internal/appmodel/layout_repository_sqlite.go`, `internal/appmodel/model.go`, `internal/application/application_context_holder.go`, `frontend/src/logic/store/appModelTypes.ts`, and regenerated `frontend/wailsjs/go/models.ts`
- [X] T007 [US1] Owns: FR-WS-010. Owner: OWS-010. Keep Editor/Split/Preview arrangement and pane state on each document, apply the application fallback only when a document has no saved view, and prevent application layout from overwriting an existing document view in `internal/appmodel/document.go`, `internal/appmodel/service.go`, `frontend/src/logic/store/docViewCommands.ts`, and `frontend/src/logic/adapter/appModelAdapter.ts`
- [X] T008 [US1] Owns: FR-WS-011. Owner: OWS-011. Persist discrete layout intent immediately; retain continuous native-resize and divider intent in Go for 250 ms; keep one pending original identity per field; conditionally commit the newest `(changedAtUnixNano, writerId, sequence)`; and synchronously flush only still-pending fields before database close in `internal/appmodel/layout_persistence.go`, `internal/appmodel/layout_repository_sqlite.go`, `internal/appmodel/service.go`, and `internal/application/application_context_holder.go`
- [X] T009 [US1] Owns: FR-WS-012. Owner: OWS-012. Persist before projecting, retain the prior acknowledged layout after failure, emit one safe classified code-and-subject notification, and project a stale refusal's newer stored winner as a successful acknowledgement in `internal/appmodel/service.go`, `internal/appmodel/handler.go`, `internal/apperr/results.go`, `frontend/src/logic/adapter/appModelAdapter.ts`, and `frontend/src/logic/store/appModelProjectionActions.ts`

### Group B — Ordinary framed native lifecycle

> Write T010 first and confirm the option, platform-role, lifecycle, restore, process, and absence
> assertions fail before T011.

- [X] T010 [US1] Add failing platform-parameterized option and lifecycle tests for an ordinary framed/resizable 1024 × 768 window, exact 375 × 480 minimum, start-hidden behavior, native App/Edit roles only on macOS, no app-owned native About, independent processes, native movement/title gestures/resize ownership, independent restore fallback, usable-display correction, two-sided readiness, show-once, and synchronous close flush; these tests run on the available host and do not require Windows/Linux runtime test hosts before whole-application completion; Supports: OWS-001, OWS-002, OWS-003, OWS-005, OWS-006 in `main_test.go` and `internal/application/application_test.go`
- [X] T011 [US1] Owns: FR-WS-001. Owner: OWS-001. Configure the embedded Wails application as one ordinary framed native process on macOS, Windows, and Linux while preserving independent concurrent windows, the embedded offline frontend, CGO-free SQLite, and the absence of a server, account, companion process, or single-instance takeover in `main.go` and `wails.json`
- [X] T012 [US1] Owns: FR-WS-002. Owner: OWS-002. Retain the operating system's title bar and close/minimize/maximize-or-zoom controls on every platform, install only standard App/Edit roles on macOS, leave native About unset, and install no application-native menu on Windows/Linux in `main.go` and `internal/application/native_menu.go`
- [X] T013 [US1] Owns: FR-WS-003. Owner: OWS-003. Keep movement, title-bar double-click, maximize, and restore exclusively native by rendering the application shell below the operating-system title bar and removing any webview gesture interception from `frontend/src/App.tsx`, `frontend/src/ui/widgets/ShellMenuRow.tsx`, and `frontend/src/ui/widgets/ShellMenuRow.module.css`
- [X] T014 [US1] Owns: FR-WS-005. Owner: OWS-005. Keep native resizing enabled on all platforms, configure the exact 375 × 480 Wails minimum, and leave native borders and cursors as the only resize mechanism in `main.go`
- [X] T015 [US1] Owns: FR-WS-006. Owner: OWS-006. Start from 1024 × 768 while hidden; load and validate saved dimensions/maximized state independently; clamp oversized dimensions through public usable-screen information without restoring position or full screen; coordinate native restore with frontend hydration through a typed application handler; show the normal shell exactly once; and expose a synchronous close-flush port in `main.go`, `internal/application/native_window.go`, `internal/application/application_context_holder.go`, `internal/application/handler.go`, `internal/apperr/results.go`, `frontend/src/logic/adapter/windowAdapter.ts`, `frontend/src/logic/adapter/index.ts`, `frontend/src/logic/store/appModelProjection.ts`, `frontend/src/App.tsx`, and regenerated `frontend/wailsjs/go/application/ApplicationHandler.d.ts` and `frontend/wailsjs/go/application/ApplicationHandler.js`

### Group C — In-app actions, full screen, and build identity

> Write T016 first and confirm registry, adapter, menu-row, modal, and About assertions fail before
> T017.

- [X] T016 [US1] Add failing tests for unique shell action IDs/bindings, localized labels, scope, availability, invocation, Settings modality, Settings/View/About row order, responsive overflow, absent File action, F11 public full-screen routing, session-only full screen, native-state return, and injected/exact-`dev` About identity; Supports: OWS-004, OWS-014, OWS-019, OWS-020 in `frontend/src/logic/actions/shellActions.test.ts`, `frontend/src/logic/actions/useShellShortcuts.test.tsx`, `frontend/src/logic/adapter/windowAdapter.test.ts`, `frontend/src/ui/widgets/ShellMenuRow.test.tsx`, `frontend/src/ui/widgets/AboutDialog.test.tsx`, and `internal/bootstrap/version_test.go`
- [X] T017 [US1] Owns: FR-WS-014. Owner: OWS-014. Create one localized action catalogue and modal-aware dispatcher consumed by one in-app menu row directly below the native title bar on every platform; show working Settings, View, and About actions in that order; move them into overflow at narrow width; suppress background actions while Settings is open; and omit File and every enabled no-op in `frontend/src/logic/actions/shellActions.ts`, `frontend/src/logic/actions/useShellShortcuts.ts`, `frontend/src/ui/widgets/ShellMenuRow.tsx`, `frontend/src/ui/widgets/ShellMenuRow.module.css`, `frontend/src/ui/widgets/SettingsMenu.tsx`, `frontend/src/ui/primitives/ViewMenu.tsx`, and `frontend/src/App.tsx`
- [X] T018 [US1] Owns: FR-WS-004. Owner: OWS-004. Route F11 through the canonical action catalogue and adapter-wrapped public Wails full-screen query/enter/exit operations on every platform, keep full screen session-only, and return to the preceding normal or maximized native state in `frontend/src/logic/adapter/windowAdapter.ts`, `frontend/src/logic/adapter/index.ts`, `frontend/src/logic/actions/shellActions.ts`, and `frontend/src/logic/actions/useShellShortcuts.ts`
- [X] T019 [US1] Owns: FR-WS-019. Owner: OWS-019. Define one Go link-time-injected application version with exact `dev` fallback, project it through appmodel without a second maintained value, regenerate bindings, and display it from the working in-app About action in `internal/bootstrap/version.go`, `main.go`, `internal/appmodel/model.go`, `internal/appmodel/service.go`, `internal/apperr/results.go`, `frontend/wailsjs/go/models.ts`, `frontend/src/ui/widgets/AboutDialog.tsx`, and `frontend/src/ui/widgets/ShellMenuRow.tsx`

### Group D — Notifications, delivered Settings reset, and startup recovery

> Write T020–T021 first and confirm notification, transactional reset, boundary, projection, focus,
> process-retention, and Retry assertions fail before T022.

- [X] T020 [US1] Add failing reducer/component tests for completed-event toasts, continuing-condition banners, code-plus-subject deduplication, localized `×N`, 4/6/8-second timing, three-visible capacity, oldest-non-error displacement, never-dismissed/non-evicted errors, FIFO queued errors, promotion, safe remediation, silent automatic success, and dialog overlay order; Supports: OWS-012, OWS-013, OWS-016 in `frontend/src/logic/store/notificationsSlice.test.ts`, `frontend/src/ui/primitives/Toast.test.tsx`, `frontend/src/ui/primitives/Banner.test.tsx`, and `frontend/src/ui/widgets/StartupFailure.test.tsx`
- [X] T021 [US1] Add failing repository, service, Wails-handler, adapter, projection, and UI tests for one-transaction reset of Theme/Appearance/default-open-mode, full rollback, exact delivered-only membership, unchanged layout/document/recent keys, typed result/arity/named-result/panic recovery, synchronized quick/modal acknowledgement, rejected-write retention, second-process retention until relaunch, focus trap, Escape, opener restoration, and absent future groups; Supports: OWS-015, OWS-017, OWS-020 in `internal/settings/repository_sqlite_test.go`, `internal/settings/service_test.go`, `internal/settings/handler_test.go`, `frontend/src/logic/adapter/services.test.ts`, `frontend/src/logic/store/appModelProjection.test.ts`, `frontend/src/ui/widgets/SettingsDialog.test.tsx`, and `frontend/src/ui/widgets/AppearanceControls.test.tsx`
- [X] T022 [US1] Owns: FR-WS-016. Owner: OWS-016. Replace error-only notification storage with classified severity, subject, toast/banner lifecycle, optional remediation, refresh generation, and queued-error arrival order; implement localized count refresh, 4/6/8-second non-error dismissal, non-evictable errors, FIFO error promotion, safe content, and dialog-above-toast ordering using real startup/settings/layout consumers in `frontend/src/logic/store/notificationsSlice.ts`, `frontend/src/ui/primitives/Toast.tsx`, `frontend/src/ui/primitives/Toast.module.css`, `frontend/src/ui/primitives/Banner.tsx`, `frontend/src/ui/primitives/Banner.module.css`, `frontend/src/ui/widgets/StartupFailure.tsx`, and `frontend/src/App.tsx`
- [X] T023 [US1] Owns: FR-WS-015. Owner: OWS-015. Reset Material/Auto/Editor as all and only delivered Appearance defaults in one SQLite transaction; roll back all values on failure; leave layout, documents, and recent keys unchanged; return one acknowledged typed result without broadcasting to open peers; regenerate bindings; and replace the existing Appearance dialog with an Appearance-only Settings dialog that synchronizes quick controls, traps focus, closes on Escape, restores opener focus, and renders no future group in `internal/settings/repository.go`, `internal/settings/repository_sqlite.go`, `internal/settings/service.go`, `internal/settings/handler.go`, `internal/apperr/results.go`, `frontend/wailsjs/go/settings/SettingsHandler.d.ts`, `frontend/wailsjs/go/settings/SettingsHandler.js`, `frontend/wailsjs/go/models.ts`, `frontend/src/logic/adapter/services.ts`, `frontend/src/logic/adapter/index.ts`, `frontend/src/ui/widgets/AppearanceControls.tsx`, `frontend/src/ui/widgets/AppearanceDialog.tsx`, `frontend/src/ui/widgets/AppearanceDialog.module.css`, `frontend/src/ui/widgets/SettingsDialog.tsx`, and `frontend/src/ui/widgets/SettingsDialog.module.css`
- [X] T024 [US1] Owns: FR-WS-013. Owner: OWS-013. Replace startup exit-on-initialization-failure with the exact localized title, message, and Retry surface while the normal shell stays unmounted; extend the typed application handler so Retry repeats backend initialization; complete restore and show once after success; and keep repeated failure free of raw errors and private paths in `main.go`, `internal/application/application_context_holder.go`, `internal/application/handler.go`, `internal/apperr/results.go`, `frontend/src/logic/adapter/index.ts`, `frontend/src/App.tsx`, `frontend/src/ui/widgets/StartupFailure.tsx`, and `frontend/src/ui/widgets/StartupFailure.module.css`

### Group E — Structural, responsive, accessible, and offline shell

> Write T025–T026 first and confirm real-component, browser-matrix, performance, request, and
> future-surface assertions fail before T027.

- [X] T025 [US1] Add failing real-component tests for three structural regions, zero-width empty Assistant reservation without a visible/accessible Assistant surface, desktop sidebar acknowledgement, 768-pixel 46-pixel rail, 375-pixel 230-pixel off-canvas sidebar, stacked centre panes, menu overflow, one-row toolbar, no responsive durable write-back, no horizontal clipping, catalogue text, keyboard focus, longer text, reduced motion, all six palettes, and absence of File/launcher/recents/real tabs/future Settings/Assistant; Supports: OWS-007, OWS-008, OWS-014, OWS-017, OWS-019, OWS-020 in `frontend/src/App.test.tsx`, `frontend/src/ui/widgets/AppShell.test.tsx`, `frontend/src/ui/widgets/ShellMenuRow.test.tsx`, and `frontend/src/ui/widgets/EditorView.integration.test.tsx`
- [X] T026 [US1] Add failing Playwright journeys using actual shell components for the complete 375/768/1280 × six-palette matrix; Settings/View/About, reset/focus, sidebar, notifications, build identity, and future-surface absence; one short local-origin-only request-instrumented representative journey with no duration requirement; and retained sets of at least 20 resize plus 20 divider samples enforcing 95% visible updates within 100 ms, no observed freeze over 250 ms, and final acknowledged state within 500 ms; Supports: OWS-007, OWS-008, OWS-014, OWS-015, OWS-016, OWS-017, OWS-018, OWS-019, OWS-020 in `frontend/e2e/window-shell.test.ts` and `frontend/e2e/window-shell.test.ts-snapshots/`
- [X] T027 [US1] Owns: FR-WS-007. Owner: OWS-007. Build the left workspace, centre document, and structurally reserved right region around the existing `EditorView`; keep the pre-Assistant right region at zero width with no control, content, landmark, or visible facsimile in `frontend/src/App.tsx`, `frontend/src/ui/widgets/AppShell.tsx`, and `frontend/src/ui/widgets/AppShell.module.css`
- [X] T028 [US1] Owns: FR-WS-008. Owner: OWS-008. Implement acknowledged desktop sidebar behavior, the exact 768-pixel 46-pixel icon rail, and the exact 375-pixel 230-pixel off-canvas sidebar with stacked centre panes, menu overflow, one-row toolbar, no horizontal clipping, no responsive write-back to durable desktop width, and no tab strip in `frontend/src/ui/widgets/AppShell.tsx`, `frontend/src/ui/widgets/AppShell.module.css`, `frontend/src/ui/widgets/ShellMenuRow.tsx`, `frontend/src/ui/widgets/ShellMenuRow.module.css`, `frontend/src/ui/widgets/EditorView.module.css`, and `frontend/src/ui/styles/base.css`
- [X] T029 [US1] Owns: FR-WS-017. Owner: OWS-017. Make every shell control keyboard reachable with correct role, catalogue name, visible two-layer focus, longer-text tolerance, and reduced-motion behavior; remove authored shell strings from components; and consume the delivered six-palette tokens without adding a second appearance owner in `frontend/src/i18n/locales/en.json`, `frontend/src/App.tsx`, `frontend/src/ui/primitives/Toast.tsx`, `frontend/src/ui/primitives/Banner.tsx`, `frontend/src/ui/widgets/AppShell.tsx`, `frontend/src/ui/widgets/EditorView.tsx`, `frontend/src/ui/widgets/ShellMenuRow.tsx`, `frontend/src/ui/widgets/SettingsDialog.tsx`, `frontend/src/ui/widgets/StartupFailure.tsx`, `frontend/src/ui/styles/tokens.css`, and `frontend/src/ui/styles/base.css`
- [X] T030 [US1] Owns: FR-WS-018. Owner: OWS-018. Keep production shell commands local, consume only bundled fonts/assets, and expose no telemetry, analytics, update check, crash upload, remote asset/font, or adjustable networking control in `frontend/src/App.tsx`, `frontend/src/logic/actions/shellActions.ts`, `frontend/src/i18n/locales/en.json`, and `frontend/src/ui/styles/base.css`
- [X] T031 [US1] Owns: FR-WS-020. Owner: OWS-020. Remove and guard the production shell against every File action, launcher control, recent item, zero-document claim, tab strip, Assistant control/content/landmark, empty future Settings group, and enabled or disabled future-behavior facsimile while preserving the existing document consumer in `frontend/src/App.tsx`, `frontend/src/logic/actions/shellActions.ts`, `frontend/src/ui/widgets/AppShell.tsx`, `frontend/src/ui/widgets/ShellMenuRow.tsx`, and `frontend/src/ui/widgets/SettingsDialog.tsx`

**User Story 1 checkpoint**: All 20 owner tasks and their named failing-first tests pass together around
the existing document. No downstream launcher, File, file lifecycle, real-tab, renderer, packaging,
Editor-expansion, or Assistant behavior is present.

---

## Phase 4: Verification, Browser Repair, Real-Build Evidence, and Reconciliation

**Purpose**: Compare the completed slice with the trustworthy baseline and directly observe behavior
that unit tests or mock bindings cannot establish. Every task in this phase is supporting evidence.

- [X] T032 Add and run static production-source and built-bundle network safeguards, run the focused Go/Jest suites and binding-generation checks, inspect every named shell test, and retain raw outcomes before browser repair; Supports: OWS-001 through OWS-020 in `frontend/scripts/archtest.mjs`, `frontend/src/ui/components/CodeEditor.bundle.test.ts`, and `specs/001-gomarkedit-product/evidence/window-shell-verification.md`
- [X] T033 Start `just dev-ui`, open its local URL in the in-app browser, operate actual Settings/View/About, Settings reset/focus, sidebar, notifications, and keyboard actions, fix/reload/recheck every visible defect, then run and retain the complete 18-case matrix, the short request log, at least 20 resize samples, and at least 20 divider samples with the 100/250/500-ms thresholds; Supports: OWS-007, OWS-008, OWS-014, OWS-015, OWS-016, OWS-017, OWS-018, OWS-019, OWS-020 in `specs/001-gomarkedit-product/evidence/window-shell-browser.json` and `specs/001-gomarkedit-product/evidence/window-shell-verification.md`
- [X] T034 Run `just fmt-check`, `just typecheck`, `just lint`, `just test`, `just archtest`, `just frontend-build`, `just build`, and `just verify 001-gomarkedit-product` after browser repair; compare every reliable result with T001, repair every new finding without weakening a gate, and retain commands, exit codes, findings, and verdicts; Supports: OWS-001 through OWS-020 in `specs/001-gomarkedit-product/evidence/window-shell-verification.md`
- [X] T035 Launch the real `just build` binary and record one current-host walkthrough covering native movement, title-bar gestures, border/corner resizing and exact 375 × 480 minimum, minimize, maximize/restore, close during the 250-ms persistence pause, stale-close ordering across two processes, F11 full screen, hidden restore-before-show, isolated startup failure and Retry, Settings/View/About plus keyboard actions and applicable macOS App/Edit roles, Settings acknowledgement/reset/focus, desktop/rail/off-canvas sidebar states, divider acknowledgement, injected and exact-`dev` About identity, notification dedup/timing/error queue/banner behavior, and absence of File/launcher/recents/real tabs/future Settings/Assistant; Supports: OWS-001 through OWS-020 in `specs/001-gomarkedit-product/evidence/window-shell-native.md`
- [X] T036 Reconcile the implemented shell against every `FR-WS-001` through `FR-WS-020`, SC-013 through SC-018, the contract, and T001 baseline; classify every difference as a code defect, approved specification amendment, or unresolved blocker; record the tested host and the explicit deferral of Windows/Linux native runtime testing until whole-application completion; Supports: OWS-001 through OWS-020 in `specs/001-gomarkedit-product/evidence/window-shell-reconciliation.md`

**Batch checkpoint**: Do not claim completion unless the baseline is reliable, architecture is green,
generated assets are current, every named test passes, browser findings were fixed and rechecked, the
automated matrix/request/timing evidence is retained, the real current-host build proves native
behavior, and reconciliation has no unresolved in-scope difference. Windows/Linux native runtime
testing is intentionally deferred and is not an in-scope blocker until the whole application is
implemented.

---

## Dependencies and Execution Order

### Phase dependencies

1. T001 is the first hard gate and blocks every production edit.
2. T002 and T003 may run together after T001 because they use disjoint Go-test and Playwright-helper
   files.
3. T004–T005 fail before T006–T009 implement the exact layout model, document fallback, persistence,
   and acknowledged outcomes. T006 → T007 → T008 → T009 is sequential because the tasks share DTO,
   service, repository, and projection seams.
4. T010 fails before T011–T015 configure the ordinary framed process, platform roles, native ownership,
   exact minimum, hidden restore, and close lifecycle. T011 → T012 → T013 → T014 → T015 is sequential
   because `main.go`, application lifecycle, and shell placement converge in that order.
5. T016 fails before T017 establishes the catalogue/menu row, T018 adds F11 through that catalogue,
   and T019 adds About identity. These tasks share action, adapter, row, and appmodel files and are
   sequential.
6. T020–T021 fail before T022 repairs notifications, T023 adds transactional delivered reset, and T024
   adds recoverable startup. These tasks are sequential because Settings/layout/startup failures are
   production notification consumers.
7. T025–T026 fail before T027 builds the shell, T028 adds responsive states, T029 completes
   accessibility/localization/palettes, T030 constrains offline production behavior, and T031 enforces
   the honest delivery boundary. Shared `App.tsx`, shell, row, Settings, and style files make the owner
   tasks sequential.
8. T032 → T033 → T034 → T035 → T036 is sequential: focused/static checks, browser repair and retained
   automated evidence, current quality gates, current-host real-build evidence, then reconciliation.

### User-story dependency graph

```text
trustworthy baseline
      |
disjoint Go-test and Playwright helpers
      |
failing layout tests -> acknowledged durable layout owners
      |
failing native tests -> framed lifecycle owners
      |
failing registry/menu/About tests -> action, F11, identity owners
      |
failing notification/Settings tests -> feedback, reset, recovery owners
      |
failing component/browser tests -> shell, responsive, accessible, offline, boundary owners
      |
static/focused checks -> browser repair and automated evidence -> current gates
      |
current-host real build -> reconciliation
      |
STOP: safe file lifecycle, launcher, and every later product slice remain entry-gated
```

### Parallel opportunities

```text
After T001, T002 and T003 may run in parallel: their complete file sets are disjoint and neither
consumes the other's output. No later task is marked [P]; test and owner groups intentionally serialize
shared repository, main.go, adapter, App.tsx, shell, Settings, action, style, and evidence files.
```

---

## Implementation Strategy

### Suggested MVP scope

The MVP is the complete authorized native shell batch, T001–T036. A framed window alone is not an
independently correct increment because acknowledged layout, recovery, menus, Settings,
notifications, responsive/accessibility/offline behavior, automated evidence, and current-host native
evidence are all part of the approved shell contract.

### Incremental delivery

1. Capture the reliable feature baseline.
2. Add only consumed test helpers and make each implementation group's named tests fail meaningfully.
3. Deliver backend-authoritative layout, native lifecycle, actions/About, notifications/Settings/retry,
   and the responsive accessible shell in dependency order.
4. Run static and focused checks, repair the running browser surface, and retain the matrix, request,
   and timing evidence.
5. Re-run current quality gates, walk the real current-host build, and reconcile every shell rule.

### Deliberate stop boundary

After T036, stop decomposition. Launcher and File work waits for safe New/Open/recent/close-last
commands and a valid zero-document model. Real tabs, file lifecycle, rendering expansion, packaging,
Editor expansion, and Assistant work remain later approved slices.
