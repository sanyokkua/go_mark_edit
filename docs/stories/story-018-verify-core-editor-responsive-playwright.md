---
id: STORY-018
title: Verify the core editor responsively with Playwright
status: done
spec_clauses:
  - 07_Phases/PHASE_01_CORE_EDITOR.md#phase-exit-checklist
  - 01_Product/02_EDITOR_AND_VIEWER_MODES.md#split-view
  - 03_NonFunctional/02_PERFORMANCE.md#2-editor-responsiveness
  - 03_NonFunctional/02_PERFORMANCE.md#3-preview-debounce-targets
  - 03_NonFunctional/05_ACCESSIBILITY.md#2-keyboard-operability
  - mockups/README.md#role-in-the-spec
modules:
  - ui/components/
  - ui/primitives/
  - ui/widgets/
  - dev/bridge-mock/
acceptance_criteria:
  - STORY-018-AC-1
  - STORY-018-AC-2
  - STORY-018-AC-3
  - STORY-018-AC-4
edge_cases: []
depends_on:
  - STORY-016
  - STORY-017
adrs:
  - ADR-0002
  - ADR-0003
  - ADR-0014
phase: 01
owner: coder
estimate: M
---

# STORY-018 — Verify the core editor responsively with Playwright

## Goal
Prove the complete Phase-01 editor flow at phone, tablet, and desktop widths so typing, backend mock synchronization, preview rendering, view-mode controls, shell structure, and status metadata work together without layout regressions or console errors.

## In scope
- Add `@playwright/test`, package/lock changes, `frontend/playwright.config.ts`, the frontend `verify:ui` npm script, and mock app-model fixtures needed by the existing `just verify-ui` command.
- Configure Playwright `testMatch` for `frontend/e2e/**/*.test.ts` so the trace collector sees the tests while the src-only Jest configuration does not.
- Add Playwright coverage at 375, 768, and 1280 px for editor height, horizontal overflow, console errors, accepted live preview, status metadata, and view-mode behavior.
- Add the committed approved/cropped baseline at `frontend/e2e/core-editor.test.ts-snapshots/core-editor-split-1280.png` against `specification/mockups/gomarkedit-mockup.html`.
- Gitignore ephemeral `frontend/playwright-report/` and `frontend/test-results/` output while retaining the committed screenshot baseline.
- Exercise keyboard and pointer interaction through the frontend-only bridge mock while preserving the collapsed assistant slot.
- Add synchronized View-menu pane toggles through the existing app-model command seam.

## Out of scope
- Application runtime networking or external browser assets; Playwright is test tooling only and the shipped application remains fully bundled/offline.
- File I/O, tabs, save/flush-before-write, autosave, and persisted document state, owned by Phase 02 and Phase 08.
- Full rendering tiers, reading mode, configurable live-preview pause, and other Phase-04 extensions.
- CI/release matrices beyond making the existing `just verify-ui` command invoke the Phase-01 frontend suite.

## Spec inputs
- `07_Phases/PHASE_01_CORE_EDITOR.md#phase-exit-checklist` — automate the responsive Monaco, GFM rendering, view-mode, debounce, `state:patch`, and screenshot exit checks.
- `01_Product/02_EDITOR_AND_VIEWER_MODES.md#split-view` — verify equal responsive panes, valid Editor/Split/Preview visibility, and the existing chrome/three-region layout.
- `03_NonFunctional/02_PERFORMANCE.md#2-editor-responsiveness` — confirm typing remains immediate and is not coupled to bridge or preview work on every keystroke.
- `03_NonFunctional/02_PERFORMANCE.md#3-preview-debounce-targets` — confirm accepted preview output appears within the 150–300 ms target after typing settles.
- `03_NonFunctional/05_ACCESSIBILITY.md#2-keyboard-operability` — verify keyboard access to the view arrangement control without stealing normal Monaco editing.
- `mockups/README.md#role-in-the-spec` — use the canonical mockup as the binding structural and visual reference for the approved desktop screenshot baseline.

## Design constraints
- The Playwright target runs the frontend-only bridge mock and mirrors production Result envelopes, `GetState`, commands, and `state:patch` events; it does not bypass the adapter/store path.
- The application remains backend-authoritative: test fixtures model command → accepted mutation → patch, and preview source stays ephemeral (DD-62, DD-63, DD-64; ADR-0014).
- Only `logic/adapter/` may import Wails bindings/runtime; backend Handler → Service → Repository layering and concrete `apperr.*Result` envelopes remain intact.
- UI assertions use accessible roles/names where possible, require keyboard and pointer operation, and preserve the F1 collapsed right-assistant region.
- The keyboard-operable view arrangement radiogroup and View menu render the same command-derived state through Show Editor/Show Preview toggles, never allowing both panes to be hidden.
- Screenshot structure follows `specification/mockups/gomarkedit-mockup.html`; all application styling remains CSS-Module/token-only with no hardcoded colors (DD-28 through DD-30).
- Monaco, renderer assets, and the application under test remain locally bundled with no runtime CDN, fetch, telemetry, or other network call (ADR-0002, ADR-0003).
- End-to-end timing assertions are eventual with a documented CI tolerance; exact 200 ms scheduling is proven only by STORY-019's controlled-clock unit test.
- Screenshot comparison uses an explicitly approved Phase-01 crop/baseline plus independent DOM structural assertions; an implementation session cannot self-approve a new baseline.

## Acceptance criteria

### STORY-018-AC-1
`just verify-ui` launches the bridge-mock app at 375, 768, and 1280 px with Monaco taller than 200 px, no horizontal overflow, and no console errors.

### STORY-018-AC-2
Typing `# Hello` eventually updates the backend mock, dirty/word metadata, status bar, and visible preview within the documented end-to-end tolerance; exact 200 ms scheduling remains a controlled-clock STORY-019 proof.

### STORY-018-AC-3
The committed 1280 px cropped split-view screenshot matches an explicitly approved Phase-01 baseline, and independent assertions verify the canonical mockup's structural regions, panes, toggle, and status bar; the test run cannot self-approve baseline changes.

### STORY-018-AC-4
The keyboard-operable view arrangement radiogroup and synchronized View-menu pointer toggles switch Editor/Split/Preview with exactly the expected panes visible, never hide both panes, and keep the assistant region collapsed.

## Test plan
Each Playwright test name begins with its matching `STORY-018-AC-N` id.

- STORY-018-AC-1 — e2e-smoke — `frontend/e2e/core-editor.test.ts` — `test('STORY-018-AC-1 verifies responsive editor dimensions')`.
- STORY-018-AC-2 — e2e-smoke — `frontend/e2e/core-editor.test.ts` — `test('STORY-018-AC-2 verifies the live editor preview flow')`.
- STORY-018-AC-3 — e2e-smoke — `frontend/e2e/core-editor.test.ts` — `test('STORY-018-AC-3 matches the approved split-view reference')`.
- STORY-018-AC-4 — e2e-smoke — `frontend/e2e/core-editor.test.ts` — `test('STORY-018-AC-4 verifies radiogroup and View-menu interaction')`.

## Definition of done
- [ ] Every acceptance criterion has a passing Playwright test whose name begins with its `STORY-018-AC-N` id.
- [ ] Every edge case in `edge_cases:` has a passing test; this story declares none.
- [ ] Package/lock, `testMatch`, `verify:ui`, mock fixtures, screenshot path, and gitignored ephemeral Playwright output are configured as specified; Jest remains src-only.
- [ ] `just verify-ui` runs the bridge-mock app at 375/768/1280 px with no overflow, collapsed editor, or console error and uses eventual CI-tolerant flow assertions rather than pretending to prove the exact timer.
- [ ] The 1280 px crop/baseline is explicitly human-approved, cannot be self-updated by the test, and is paired with independent structural assertions plus keyboard/pointer checks.
- [ ] The keyboard-operable radiogroup and View-menu toggles issue app-model view commands, reconcile only through `state:patch`, and cannot hide both panes.
- [ ] Manual real-bridge checks in `wails dev` confirm typing updates preview after backend acknowledgement and view modes/status work without bridge-mock-only assumptions.
- [ ] `just check` and `just verify-ui` pass; frontend `prettier --check`, ESLint, `tsc --noEmit`, Jest, and Playwright pass; backend quality gates pass as part of `just check`.
- [ ] Generated bindings remain current with no unexpected drift.
- [ ] Handler → Service → Repository layering, Result envelopes, backend authority, adapter-only Wails imports, and token-only theming remain intact.
- [ ] `just trace` regenerates the record and `just trace-check` passes with zero orphans and a fresh record.
- [ ] The module inventory is unchanged, or changes are reflected in `01_MODULE_INVENTORY.md` in the same story.
- [ ] No background/unsolicited network call, telemetry, remote runtime asset, or document-supplied request is introduced.
