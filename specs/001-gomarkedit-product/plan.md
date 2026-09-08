# Implementation Plan: Native Window Shell

**Branch**: `001-gomarkedit-product` | **Date**: 2026-08-01 | **Spec**: [spec.md](spec.md)

**Input**: Plan only the approved `FR-WS-001` through `FR-WS-020` dependency-complete native window
shell slice after the delivered appearance frontier. Launcher activation, File commands, real tabs,
file lifecycle, rendering expansion, packaging, Editor expansion, and Assistant behavior remain
downstream.

## Summary

The next actionable slice places the existing document experience inside an ordinary
operating-system-managed framed window on macOS, Windows, and Linux. The application does not draw
replacement title controls, drag regions, or resize targets. Wails supplies the native frame and
minimum size; Go restores acknowledged geometry before showing the normal shell and synchronously
flushes pending layout intent before close. React supplies one in-app Settings, View, About menu row
directly below the native title bar on every platform; File remains absent until real file commands
exist, while macOS also retains native App and Edit roles.

The slice keeps Go/appmodel authoritative, Redux projection-only, frontend Wails imports adapter-only,
and SQLite layout arbitration newest-change-wins across processes. It consumes the delivered six-palette
appearance contract, completes the responsive and accessible shell, adds delivered-only Settings reset,
notifications, and build identity, and proves honest future-surface absence. Automated evidence includes
the complete 18-combination viewport/palette matrix, static source and bundle network safeguards, one
short request-instrumented browser journey, and at least 20 resize plus 20 divider samples. One
representative current-host real-build walkthrough covers native operations and the complete shell
interaction set without requiring Windows/Linux native runtime tests before the whole application is
implemented.

## Technical Context

**Language/Version**: Go 1.25.7; TypeScript 5.8.3; React 19.1.1

**Primary Dependencies**: Wails v2.12.0, React, Redux Toolkit, Radix Dropdown Menu and Toast,
modernc.org/sqlite; no dependency upgrade, runtime fork, native plugin, or new UI framework

**Storage**: Existing CGO-free SQLite key/value store in WAL mode with a five-second busy timeout.
Layout fields use versioned values carrying original change time, writer identity, and sequence; a
conditional transaction returns the stored winner when an older process attempts a stale write.

**Testing**: Go repository/service/appmodel/lifecycle tests; Jest and Testing Library; adapter and
dev-bridge parity tests; Playwright at 375/768/1280 in all six palettes; current-host real-build
walkthrough; retained format, typecheck, lint, architecture, build, and reliable-baseline gates

**Target Platform**: macOS, Windows, and Linux desktop; one process per window; ordinary framed native
window; default 1024 x 768; exact minimum 375 x 480; current-host native evidence in this slice and
Windows/Linux native runtime repetition only at whole-application completion

**Project Type**: Single-process Wails desktop application with a Go backend and embedded
React/TypeScript webview

**Performance Goals**: Restore valid acknowledged geometry before the first normal-shell frame. Across
at least 20 automated window-resize samples and 20 automated divider-drag samples, at least 95% of
visible updates follow input within 100 ms, no visible freeze exceeds 250 ms, and the final durable
value is acknowledged within 500 ms after input stops. Continuous layout intent persists after 250 ms
and flushes before close; discrete changes persist immediately.

**Constraints**: The OS exclusively owns frame, movement, native title gestures, resize borders, and
minimize/maximize/restore/close. Go owns canonical layout and acknowledgement; Redux is a projection;
frontend generated bindings and public Wails runtime calls remain in `frontend/src/logic/adapter/`;
Go-side Wails lifecycle calls remain behind an injected native-window port wired in `main.go`. No
background network access; all strings localized; all colors tokenized; keyboard/focus/reduced-motion
behavior ships with each surface; errors never auto-dismiss; no production placeholder or no-op action

**Scale/Scope**: One framed window per process, concurrent writers to one SQLite database, three
responsive widths, six palette combinations, at most three visible toasts, and only shell actions with
production consumers in this slice

## Constitution Check

_GATE: Passed before Phase 0 research and passed again after Phase 1 design._

| Principle                  | Planning gate                                                                                                                                                                                                       | Result |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Normative authority        | Approved `FR-WS-001` through `FR-WS-020` are preserved in [contracts/window-launcher-shell.md](contracts/window-launcher-shell.md); the 2026-08-01 clarification explicitly supersedes the old frameless mechanism. | PASS   |
| Vertical slices            | The batch produces a usable framed native shell, durable layout, Settings/error surfaces, responsive behavior, and direct evidence. Launcher and file behavior remain behind real command dependencies.             | PASS   |
| Backend authority          | Appmodel owns acknowledged layout and persistence intent; Redux renders projections; frontend Wails access is adapter-only; close flush stays synchronous in Go lifecycle ownership.                                | PASS   |
| Offline, private, safe     | Static source/bundle safeguards plus one short request-instrumented browser journey prove zero outbound attempts; no duration claim substitutes for request evidence.                                               | PASS   |
| Data and platforms         | SQLite remains CGO-free/WAL; conditional per-field writes protect newest change; native behavior is checked on the current host now, while Windows/Linux runtime tests wait for whole-application completion. | PASS   |
| Accessible coherent UI     | The in-app row, Settings, notifications, sidebar states, focus lifecycle, localization, longer text, reduced motion, and all six palettes are explicit obligations.                                                 | PASS   |
| Evidence before completion | A reliable baseline precedes edits; direct backend, adapter, browser, performance, native, and build evidence is named in [quickstart.md](quickstart.md).                                                           | PASS   |

No constitutional exception or unresolved clarification remains. The pinned Wails v2.12.0 runtime
already supports framed windows, start-hidden lifecycle, minimum dimensions, public size/state/full-screen
operations, usable-screen inspection, and macOS menu roles. Therefore no private resize invocation,
custom hit-testing, custom title control, Wails fork, or native compatibility shim is justified.

## Project Structure

### Documentation (this feature)

```text
specs/001-gomarkedit-product/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── appearance-contract.md
├── surface/mockup.html
└── contracts/
    ├── application-state.md
    ├── command-boundaries.md
    ├── delivery-stages.md
    ├── migration-readiness.md
    └── window-launcher-shell.md
```

### Source Code (repository root)

```text
main.go, main_test.go                   # Wails options, native roles, lifecycle, version wiring
internal/
├── appmodel/                           # canonical acknowledged layout and projection
├── application/                        # startup/close orchestration and injected native-window port
├── apperr/                             # typed layout/settings/notification result contracts
├── db/                                 # KV persistence and conditional layout writes
└── settings/                           # acknowledged settings and atomic delivered reset

frontend/src/
├── logic/adapter/                      # sole generated binding and frontend Wails runtime access
├── logic/actions/                      # one catalogue for real shell actions and shortcuts
├── logic/store/                        # layout and notification projections
├── ui/primitives/                      # dialog, dropdown, banner, toast, focus behavior
├── ui/widgets/                         # in-app menu row, shell, Settings, About
├── ui/styles/                          # delivered tokens and responsive shell rules
├── dev/bridge-mock/                    # deterministic shell/runtime parity
└── i18n/locales/en.json                # visible and accessible shell strings

frontend/e2e/                           # 18-case matrix, requests, timings, real component journeys
specs/001-gomarkedit-product/evidence/  # slice baseline, browser logs, timings, native walkthrough
```

**Structure Decision**: Extend the existing vertical seams. Add no second layout store, localStorage
layout cache, server, dependency fork, platform-specific frontend chrome, or future-feature component.
The appmodel-owned layout repository and native-window ports are implemented by SQLite and Wails
adapters wired at the composition root.

## Phase 0: Research Decisions

Research is consolidated in [research.md](research.md). The decisions are:

1. Keep Wails framed on every platform; the OS owns movement, resize, title gestures, and native controls.
2. Start hidden, restore valid size/maximized state through a Go lifecycle adapter, hydrate the frontend
   projection, and show the normal shell only when both native and frontend state are ready.
3. Persist layout per field with its original comparable change identity; close flushes only still-pending
   local fields synchronously and cannot turn close order into authority.
4. Keep each document's arrangement authoritative; application layout stores only the last-used fallback.
5. Put Settings, View, and About in one responsive in-app row below the native title bar on all platforms;
   omit File until real commands and retain native App/Edit roles on macOS.
6. Use only public pinned Wails configuration/runtime operations through declared adapters. Delete the
   frameless title, drag, resize-zone, private invocation, and compatibility-shim design.
7. Ship only real settings groups, actions, and notification consumers. Future groups, File, launcher,
   real tabs, and Assistant surfaces stay absent.
8. Reset all delivered Appearance settings in one backend transaction and prove repository, service,
   boundary, projection, UI, failure, and second-window behavior.
9. Prove offline behavior with static source/bundle checks and one short request-instrumented browser
   journey; no five-minute duration or manual packet capture is required.
10. Automate the full 18-case visual matrix and retain at least 20 resize and 20 divider samples against
    the 100/250/500 ms thresholds.
11. Complete one representative current-host real-build walkthrough of native window operations, menus,
    Settings reset/focus, sidebar states, About, notifications, and future-surface absence.
12. Do not require Windows/Linux native runtime tests until the whole application is implemented; use
    current-host and host-independent evidence for this slice and intermediate stages.
13. Give every `FR-WS-*` requirement one plan owner; the regenerated task file preserves each as exactly
    one primary implementation owner without creating documentation-only or duplicate owners.

## Phase 1: Design and Contracts

### Actionable slice — Native window shell

1. (`FR-WS-001`, `FR-WS-002`, `FR-WS-005`, `FR-WS-006`) Configure the ordinary framed Wails window at
   1024 x 768, exact minimum 375 x 480, and start hidden. Restore valid size/maximized state independently,
   correct oversized results to a usable display, never restore position/full screen, then show once.
2. (`FR-WS-003`, `FR-WS-004`) Preserve OS-owned movement and title-bar gestures without DOM drag handling.
   Route F11 through the action catalogue and adapter to public native full-screen operations, preserving
   the preceding normal/maximized state as the sole durable window state.
3. (`FR-WS-007`, `FR-WS-009`, `FR-WS-010`) Bind the three-region shell to acknowledged backend layout.
   Persist window size/maximized, workspace visibility/width, and last-used arrangement fallback; keep
   document arrangement in `DocView`; reserve Assistant at zero width with no child or control.
4. (`FR-WS-011`, `FR-WS-012`) Persist discrete changes immediately and continuous resize/divider changes
   after 250 ms. On close, Go synchronously flushes only pending local fields using their original identity.
   Failure retains the last acknowledgement; stale refusal reloads the newer winner without an error.
5. (`FR-WS-014`, `FR-WS-019`, `FR-WS-020`) Add one canonical shell action catalogue and one in-app row in
   Settings, View, About order. Register only working actions. Keep File absent, install/retain native macOS
   App/Edit roles, suppress background shortcuts under Settings, and show one injected version with `dev`
   fallback in About.
6. (`FR-WS-016`) Complete notification classification, code-plus-subject deduplication, localized count,
   4/6/8-second non-error timing, non-dismissable/non-evictable errors, ordered overflow errors, banners,
   safe remediation, and overlay order using real shell consumers only.
7. (`FR-WS-015`, `FR-WS-017`) Expand delivered Appearance into the accessible Settings shell: acknowledged
   synchronization, initial focus, trap, Escape, opener restoration, longer text, reduced motion, and atomic
   reset of all and only delivered Appearance values. Keep future groups absent.
8. (`FR-WS-008`, `FR-WS-017`) Implement the 768 px 46-pixel workspace rail and 375 px 230-pixel off-canvas
   workspace, menu overflow, stacked centre panes, one-row toolbar, and no clipping. Do not render a tab strip.
9. (`FR-WS-013`) Replace exit-on-initialization-failure with the exact recovery surface while the normal
   shell stays hidden. Retry repeats initialization; success restores and shows once; repeated failure
   exposes no raw detail.
10. (`FR-WS-018`) Add shell-wide static source and built-bundle network guards plus one short automated
    request-instrumented browser journey that retains its request log and fails on any outbound attempt.
11. (`FR-WS-008`, `FR-WS-017`) Retain the complete automated 18-combination matrix and collect at least
    20 resize and 20 divider samples against the exact 95%-within-100-ms, no-freeze-over-250-ms, and
    final-acknowledgement-within-500-ms thresholds.
12. (`FR-WS-001` through `FR-WS-020`) Walk one current-host real build through native movement, resize,
    minimize, maximize/restore, close, full screen, menus, Settings/reset/focus, sidebar states, About,
    notifications, and absence of File/launcher/tabs/Assistant/future Settings surfaces.

### Downstream entry gates

- **Launcher and File**: Wait for real New, Open file, Open folder, recent mutation, and close-last
  commands plus a valid zero-document model. No launcher control or File menu appears now.
- **Real tabs and file lifecycle**: Wait for optional active identity, safe open/save/close, decoding,
  size limits, workspace, and document lifecycle. No empty tab strip appears now.
- **Rendering expansion and packaging**: Remain separate Viewer dependencies after file lifecycle.
- **Editor expansion and Assistant**: Remain downstream of their document, operation, provider, and
  capability contracts. No settings group or visible placeholder is pre-created.

## Requirement and Evidence Ownership

These owner keys identify the responsibility preserved by the regenerated `tasks.md`. Each key has
exactly one primary implementation task; tests and evidence support owners without claiming the
requirement independently.

| Requirement | Plan owner | Complete responsibility                                                         | Direct evidence                                                             |
| ----------- | ---------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| FR-WS-001   | OWS-001    | Framed multi-process native composition                                         | Go option/composition tests; current-host independent-window case           |
| FR-WS-002   | OWS-002    | OS frame/controls on all platforms and macOS App/Edit roles                     | option/menu tests; current-host frame inspection; final whole-application cross-platform gate |
| FR-WS-003   | OWS-003    | OS-owned movement and title gestures; no app drag interception                  | source/component absence checks; native movement/title-gesture case         |
| FR-WS-004   | OWS-004    | F11 and public native full-screen state transition                              | action/adapter tests; native full-screen case                               |
| FR-WS-005   | OWS-005    | OS-owned resizing and exact 375 x 480 minimum                                   | option tests; native resize/minimum case                                    |
| FR-WS-006   | OWS-006    | Hidden restore, independent validation, usable-display correction, show-once    | lifecycle/repository tests; cold-start cases                                |
| FR-WS-007   | OWS-007    | Three structural regions with zero-width empty Assistant reservation            | rendered shell tests; browser inspection                                    |
| FR-WS-008   | OWS-008    | Exact 768/375 transformations, menu overflow, and no fake tab strip             | complete 18-case Playwright matrix                                          |
| FR-WS-009   | OWS-009    | Exact durable and excluded layout field model                                   | repository/appmodel tests; relaunch case                                    |
| FR-WS-010   | OWS-010    | Per-document arrangement with application fallback precedence                   | appmodel tests for saved/unsaved views                                      |
| FR-WS-011   | OWS-011    | Immediate/debounced/synchronous-close persistence and newest-change arbitration | fake-clock tests; two-connection stale-close test                           |
| FR-WS-012   | OWS-012    | Acknowledged projection, failure retention, notification, stale-winner reload   | service/appmodel failure/conflict tests                                     |
| FR-WS-013   | OWS-013    | Hidden startup failure and Retry recovery                                       | lifecycle/UI tests; current-host repeated-failure case                      |
| FR-WS-014   | OWS-014    | One action catalogue, in-app Settings/View/About row, modal suppression         | registry uniqueness; keyboard/menu journeys                                 |
| FR-WS-015   | OWS-015    | Synchronized Appearance surfaces and atomic delivered-only reset                | repository/service/handler/projection/UI/second-window tests                |
| FR-WS-016   | OWS-016    | Notification severity, banners, timing, capacity, dedup, and error queue        | fake-timer tests; browser queue journey                                     |
| FR-WS-017   | OWS-017    | Catalogue, focus, palettes, longer text, reduced motion, accessibility          | a11y tests; 18-case matrix; timing evidence                                 |
| FR-WS-018   | OWS-018    | Zero-request shell and no prohibited controls                                   | source/bundle guards; short request-instrumented log                        |
| FR-WS-019   | OWS-019    | Single injected build version with exact `dev` fallback                         | Go injection and About rendering tests                                      |
| FR-WS-020   | OWS-020    | Absence of every future-behavior facsimile                                      | rendered absence assertions; browser and real-build inspection              |

The delivered [appearance-contract.md](appearance-contract.md) is consumed, not re-owned. Current-host
native evidence is required for this slice and every intermediate stage; it must be labelled with the
tested host. Windows/Linux native runtime repetition is intentionally deferred until the whole
application is implemented and is not a Viewer release gate.

## Complexity Tracking

| Deliberate complexity           | Why needed                                                                                              | Containment                                                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Per-field layout value envelope | An older pending resize flushed on close must not overwrite a newer change from another process.        | Existing KV table, one repository contract, conditional transaction, backward-compatible scalar fallback.          |
| Hidden two-sided readiness      | Native geometry and the frontend projection must both be ready before the normal shell becomes visible. | One application lifecycle coordinator, injected native-window port, explicit show-once state, failure/Retry tests. |

Neither item creates a second state owner or weakens an architecture boundary. The former private
resize compatibility design is removed rather than tracked as accepted complexity.
