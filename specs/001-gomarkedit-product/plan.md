# Implementation Plan: Window and Launcher Shell

**Branch**: `001-gomarkedit-product` | **Date**: 2026-07-31 | **Spec**: [spec.md](spec.md)

**Input**: Plan the next dependency-bounded Viewer slice after the verified appearance frontier:
launcher state, custom window chrome, minimum and resize behavior, durable layout, settings and
notification shells, keyboard focus, and responsive states. File opening, tabs, rendering, packaging,
Editor expansion, and Assistant work remain downstream.

## Summary

The appearance frontier is delivered by `53af8e4`; the next actionable implementation slice is the
native window shell around the existing application. It makes the Wails window frameless and hidden
until its acknowledged layout is restored, adds platform-appropriate controls and the in-window menu,
implements the exact drag/maximize/full-screen/resize behavior, persists window size and shell layout
with last-change-wins semantics across processes, repairs notifications, and turns the existing
Appearance popup into an accessible settings shell. The real shell is then proven at 375, 768, and
1280 pixels in all six palettes and exercised in a native build.

The launcher contract is designed in this plan because zero documents and the launcher are the next
state of the centre region. Full FR-011 ownership is not transferred yet: enabled New, Open file, and
Open folder actions require the safe document/workspace lifecycle assigned to the following capability
group. This slice must not ship enabled no-op controls, fake recent items, an empty future settings
group, or a visible Assistant placeholder. Task generation may implement the window shell now; it may
activate the complete launcher only when the next slice brings the real commands into scope.

## Technical Context

**Language/Version**: Go 1.25.7; TypeScript 5.8.3; React 19.1.1

**Primary Dependencies**: Wails v2.12.0, React, Redux Toolkit, Radix Dropdown Menu and Toast,
modernc.org/sqlite; no dependency upgrade or new UI framework

**Storage**: Existing CGO-free SQLite key/value store in WAL mode. Layout fields use versioned values
carrying change time, writer identity, and sequence so a stale close flush cannot overwrite a newer
change from another process.

**Testing**: Go service/repository/lifecycle tests; Jest and Testing Library; adapter and dev-bridge
parity tests; Playwright at 375/768/1280 against the mock bridge; current-platform live checks in the
real Wails app; retained format, typecheck, lint, architecture, build, and baseline verification gates

**Target Platform**: macOS, Windows, and Linux desktop; one process per window; frameless native window;
minimum 375 x 480 pixels; full chrome verification repeated on all platforms at the Viewer release gate

**Project Type**: Single-process Wails desktop application with a Go backend and embedded React webview

**Performance Goals**: Restore acknowledged geometry before the first visible frame; keep resize and
divider interaction responsive; persist continuous layout intent after a 250 ms pause and flush the
pending final value before close; discrete toggles persist immediately

**Constraints**: Go owns canonical layout; Redux is a projection; all UI/runtime calls cross the
adapter; generated bindings remain adapter-only; no background network access; all strings localized;
all colors tokenized; keyboard/focus/reduced-motion behavior ships with each surface; errors never
auto-dismiss; no production placeholders or no-op actions

**Scale/Scope**: One native window per process, concurrent writers to one SQLite database, three
responsive widths, six palette combinations, at most three visible toasts, and only the shell actions
whose production consumers exist in this slice

## Constitution Check

_GATE: Passed before Phase 0 research and passed again after Phase 1 design._

| Principle                  | Planning gate                                                                                                                                                                                                                                                               | Result |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Normative authority        | FR-012 through FR-014 and affected unmigrated cross-cutting clauses are copied into [contracts/window-launcher-shell.md](contracts/window-launcher-shell.md). FR-011 action ownership remains explicitly deferred; delivered appearance clauses are consumed, not re-owned. | PASS   |
| Vertical slices            | The actionable batch produces a usable native shell, durable layout, settings/error surfaces, and responsive behavior. Launcher activation is held behind its real command dependency.                                                                                      | PASS   |
| Backend authority          | Appmodel owns acknowledged layout and persistence intent; Redux renders projections; Wails runtime access is adapter-only.                                                                                                                                                  | PASS   |
| Offline, private, safe     | The shell adds no network path, remote asset, telemetry, update check, or unsafe error detail.                                                                                                                                                                              | PASS   |
| Data and platforms         | SQLite stays CGO-free/WAL; per-field conditional writes protect latest changes; native behavior has current-host and later three-platform gates.                                                                                                                            | PASS   |
| Accessible coherent UI     | All new surfaces use the delivered palettes, catalogue, focus ring, keyboard semantics, reduced motion, and authoritative responsive states.                                                                                                                                | PASS   |
| Evidence before completion | A reliable feature baseline precedes edits; direct backend, adapter, browser, native, and build evidence is named in the quickstart.                                                                                                                                        | PASS   |

No constitutional exception is required. The pinned Wails desktop runtime has no public begin-resize
API for a 12 px corner. The selected design isolates its existing `resize:<direction>` invocation
behind the adapter, characterizes the pinned contract, and requires native live checks. Access from a
component or an unguarded dependency on global runtime state is not allowed.

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
main.go, main_test.go                   # Wails options, lifecycle, native menu, composition
internal/
├── appmodel/                           # canonical acknowledged shell layout and projection
├── application/                        # repository/runtime injection and shutdown order
├── apperr/                             # typed layout/notification result contracts
├── db/                                 # existing KV persistence and conditional layout writes
└── settings/                           # acknowledged settings and delivered-scope reset

frontend/src/
├── logic/adapter/                      # sole Wails binding/runtime and begin-resize boundary
├── logic/actions/                      # one registry for shipped shell actions and shortcuts
├── logic/store/                        # layout and notification projections
├── ui/primitives/                      # dialog, dropdown, toast, focus behavior
├── ui/widgets/                         # title bar, shell, settings shell; later launcher activation
├── ui/styles/                          # tokens and responsive shell rules
├── dev/bridge-mock/                    # deterministic shell/runtime parity
└── i18n/locales/en.json                # every visible/accessibility string

frontend/e2e/                           # palette x responsive shell journeys
docs/delivery/plan/testing/live-plan.md # reference location for native numbered cases
```

**Structure Decision**: Extend the existing vertical seams. Add no second layout store, browser
localStorage layout cache, server, UI framework, or future-feature component. A typed appmodel layout
repository is an appmodel-owned interface; its SQLite implementation is wired at the composition root.

## Phase 0: Research Decisions

Research is consolidated in [research.md](research.md). The decisions are:

1. Restore the window from hidden startup and show it only after native geometry and frontend
   acknowledged layout are ready.
2. Persist layout per field with original change identity; close flushes only still-pending local
   fields and cannot turn close order into authority.
3. Use the pinned Wails private resize invocation only behind an injected adapter to obtain the exact
   eight zones; characterize and live-test it.
4. Keep per-document arrangement authoritative for a document. The application arrangement is only
   the last-used fallback for a document with no saved view.
5. Ship only real settings groups/actions/notification consumers. Future groups, file commands, and
   Assistant content do not appear as working controls.
6. Treat the mockup as visible authority with explicit platform variants and runtime corrections
   recorded in the shell contract.

No unresolved planning marker remains for the actionable shell slice. Full launcher activation has a
named entry gate rather than an unresolved implementation assumption.

## Phase 1: Design and Contracts

### Actionable slice A — Native window shell

1. Configure a frameless, start-hidden 1024 x 768 window with a 375 x 480 minimum. Install the native
   App/Edit menu on macOS only. Apply valid stored size/maximized state during startup; invalid values
   fall back independently; show only after restored layout is ready.
2. Add the tokenized title area. Empty title space drags; every interactive child opts out of both drag
   mechanisms; double-click toggles maximize/restore; F11 toggles full screen; drag and resize are inert
   in full screen.
3. Add platform controls: macOS close/minimize/zoom on the left; Windows/Linux
   minimize/maximize/close on the right. The mockup traffic lights are the macOS variant only.
4. Add 6 px edge and 12 px corner resize zones above content and below overlays, with matching cursors.
   The adapter owns the pinned runtime invocation and disables zones while maximized/full-screen.
5. Bind the real three-region shell to acknowledged backend layout. Persist window size/maximized,
   sidebar visibility/width, and the last-used arrangement fallback. Keep Assistant width zero and do
   not mount Assistant content.
6. Persist discrete values immediately and continuous values after 250 ms. Flush only pending local
   fields on close using their original change identity. A failed write leaves the last acknowledged
   projection active and raises a classified notification.
7. Introduce one shell action registry. Register only working window, full-screen, sidebar, settings,
   and About actions. About reads the injected application version and reports `dev` when none is
   injected. Standard macOS clipboard/undo roles remain platform-owned. Modal settings suppresses
   background shortcuts.
8. Repair notifications: severity and subject, refresh/count repeated dedup keys, at most three visible,
   errors never auto-dismiss or get evicted, and specified timed dismissal for non-errors.
9. Expand the current Appearance surface into an accessible settings shell with focus trap, Escape,
   return focus, synchronized menu/dialog state, and reset of delivered settings only. Do not show empty
   Editor/Export/AI groups or controls with no consumer.
10. Implement the authoritative 768 px icon rail/Assistant collapse and 375 px off-canvas sidebar,
    menu overflow, stacked centre panes, and no horizontal clipping. Preserve all six palettes and
    reduced-motion behavior.
11. Converge startup failure onto one hidden-startup outcome: `GoMarkEdit could not start` and
    `GoMarkEdit could not initialize its local settings. Please try again.`, with Retry and no normal
    window show until initialization succeeds.

### Entry-gated slice B — Complete launcher activation

The launcher design is fixed in [contracts/window-launcher-shell.md](contracts/window-launcher-shell.md):
zero documents is valid, no session content restores, the centre region shows the launcher, and recent
items are bounded to six. It becomes task-ready only when the safe file/workspace lifecycle supplies
real New, Open file, Open folder, recent-item mutation, and close-last commands. At that point:

- `activeDocumentId` and `activeBuffer` become optional through Go, generated DTOs, the adapter, Redux,
  editor-session identity, and the dev bridge;
- every launcher action dispatches a real registered command;
- cancelled pickers change nothing and produce no failure;
- no fake recent entry or enabled placeholder is permitted.

This gate preserves the deliberate boundary before file opening, tab lifecycle, decoding, size limits,
workspace enumeration, rendering, OS-open, and packaging.

## Requirement and Evidence Ownership

- This shell plan owns FR-012, FR-013, FR-014 and the affected unmigrated shell portions of FR-001,
  FR-002, FR-004 through FR-007, FR-078, FR-079, and the development-version subset of FR-080.
- It consumes the already delivered appearance behavior in FR-015 through FR-017 and
  [appearance-contract.md](appearance-contract.md); it does not re-own it.
- FR-011 remains governed by the product specification until complete launcher command behavior is
  mapped and approved with the safe file lifecycle. This plan owns its design and entry gate, not a
  completion claim.
- FR-008, FR-009, and numeric file/workspace limits have no complete consumer in this slice and remain
  downstream.
- Each eventual task owns one behavior and names direct Go/Jest/Playwright evidence plus the applicable
  native live case. Documentation-only identifier checks are not product evidence.
- Current-platform native evidence is required now. Windows/Linux/macOS repetition remains a Viewer
  release gate and must not be reported as already proven.

## Complexity Tracking

| Deliberate complexity                        | Why needed                                                                                       | Containment                                                                                               |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Version-pinned Wails begin-resize invocation | Public Wails v2.12 has no API that starts native resize from the specified 12 px corners.        | Adapter-only wrapper, injected mock, pinned-runtime characterization, eight-zone native live case.        |
| Per-field layout value envelope              | An older pending resize flushed on close must not overwrite a newer change from another process. | Existing KV table, one repository contract, conditional transaction, backward-compatible scalar fallback. |

Neither item creates a second state owner or weakens an architecture boundary.
