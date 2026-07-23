---
id: STORY-041
title: Build the accessible tab bar and zero-document state
status: draft
spec_clauses:
  - 01_Product/03_FILES_TABS_WORKSPACE.md#tabs
  - 01_Product/12_KEYBOARD_SHORTCUTS.md#file-shortcuts
  - 07_Phases/PHASE_02_FILE_IO_TABS.md#edge-and-failure-cases
  - mockups/README.md#role-in-the-spec
phase_requirements:
  - PH02-R01
  - PH02-R02
  - PH02-R05
  - PH02-R06
modules:
  - ui/components/
  - ui/widgets/
  - i18n/
acceptance_criteria:
  - STORY-041-AC-1
  - STORY-041-AC-2
  - STORY-041-AC-3
  - STORY-041-AC-4
  - STORY-041-AC-5
  - STORY-041-AC-6
edge_cases:
  - EC-TABS-1
  - EC-TABS-2
  - EC-TABS-4
  - EC-TABS-5
  - EC-TABS-6
depends_on:
  - STORY-036
  - STORY-039
  - STORY-040
adrs:
  - ADR-0014
  - ADR-0021
  - ADR-0024
phase: 02
owner: coder
estimate: M
---

# STORY-041 — Build the accessible tab bar and zero-document state

## Goal

Render the backend-owned tab set as responsive, keyboard-operable controls and show useful New/Open actions
when no document exists.

## In scope

- Build projected tab display, activation, reorder, and close controls.
- Add keyboard-accessible New/Open/Save/Save As controls to the existing app chrome.
- Handle overflow, duplicate basenames, dirty/read-only state, and focus restoration.
- Build the localized zero-document state.

## Out of scope

- Backend tab commands, owned by STORY-036.
- Dirty-close prompt behavior, owned by STORY-045.
- Global shortcut registry/menu binding, owned by Phase 08.
- The full Phase 08 menu/shortcut/settings registry; this story supplies only the Phase 02 user route.

## Spec inputs

- `01_Product/03_FILES_TABS_WORKSPACE.md#tabs` — implement focus, close, reorder, overflow, disambiguation,
  and empty-state behavior.
- `01_Product/12_KEYBOARD_SHORTCUTS.md#file-shortcuts` — expose keyboard-operable New, Open, Save, and
  Save As actions that Phase 08 will later bind through the full platform shortcut registry.
- `07_Phases/PHASE_02_FILE_IO_TABS.md#edge-and-failure-cases` — prove every primary tab edge.
- `mockups/README.md#role-in-the-spec` — match the frozen tab/chrome visual reference.

## Design constraints

- Render authoritative order and metadata only; every interaction calls backend commands through adapters.
- Existing app chrome exposes New/Open and active-document Save/Save As through STORY-039's typed aggregate
  action; the controls are not a second shortcut/menu registry.
- Close controls are keyboard reachable; middle-click invokes the same action; drag reorder preserves focus.
- Same basenames show a stable path hint without exposing content.
- Use React/TypeScript strict types, i18n strings, CSS modules, and token-only colors.
- No component imports `wailsjs/`; preserve DD-30, DD-36, DD-62–64, ADR-0014/0021, envelopes, and offline.

## Acceptance criteria

### STORY-041-AC-1
**Satisfies:** PH02-R05, PH02-R06

The tab bar renders backend order, active state, basename, dirty marker, and read-only state, and duplicate
open focuses the existing rendered tab. (satisfies EC-TABS-1)

### STORY-041-AC-2
**Satisfies:** PH02-R05, PH02-R06

Selecting and dragging tabs invokes revisioned activate/reorder actions, and controls reconcile only after
backend confirmation.

### STORY-041-AC-3
**Satisfies:** PH02-R06

Each close control has an accessible name and keyboard operation; middle-click and Phase-08-ready close
action invoke the same close path and restore reachable focus. (satisfies EC-TABS-6)

### STORY-041-AC-4
**Satisfies:** PH02-R06

At 375, 768, and 1280 pixels, overflow remains scrollable/reachable, long names truncate with an accessible
full name, and same basenames expose disambiguating path hints. (satisfies EC-TABS-2 and EC-TABS-4)

### STORY-041-AC-5
**Satisfies:** PH02-R01, PH02-R06

With no documents, the app renders localized New and Open actions and no tab, Monaco editor, or synthetic
document. (satisfies EC-TABS-5)

### STORY-041-AC-6
**Satisfies:** PH02-R01, PH02-R02, PH02-R06

The existing app chrome exposes keyboard-accessible New, Open, Save, and Save As controls; Save/Save As are
disabled without an active writable document, and each enabled control invokes STORY-039's typed action.

## Test plan

- STORY-041-AC-1 — integration — `frontend/src/ui/components/TabBar.test.tsx` —
  `it('STORY-041-AC-1 renders projected tabs and duplicate focus (EC-TABS-1)')`.
- STORY-041-AC-2 — integration — `frontend/src/ui/components/TabBar.test.tsx` —
  `it('STORY-041-AC-2 commands activation and reorder without optimism')`.
- STORY-041-AC-3 — integration — `frontend/src/ui/components/TabBar.test.tsx` —
  `it('STORY-041-AC-3 keeps close interactions accessible (EC-TABS-6)')`.
- STORY-041-AC-4 — e2e-smoke — `frontend/e2e/tabs.spec.ts` —
  `test('STORY-041-AC-4 tab overflow and disambiguation (EC-TABS-2 EC-TABS-4)')`.
- STORY-041-AC-5 — integration — `frontend/src/ui/widgets/EditorView.integration.test.tsx` —
  `it('STORY-041-AC-5 renders the real empty state (EC-TABS-5)')`.
- STORY-041-AC-6 — e2e-smoke — `frontend/e2e/tabs.spec.ts` —
  `test('STORY-041-AC-6 exposes keyboard-accessible Phase 02 file controls')`.

## Definition of done

- [ ] Every AC and edge has passing explicit evidence.
- [ ] RTL tests use role/name queries and cover keyboard, pointer, middle-click, and reorder focus.
- [ ] Playwright covers 375/768/1280 widths and theme/appearance samples.
- [ ] All strings are localized and styles use tokens only.
- [ ] Frontend quality and UI gates pass.
- [ ] Authority, adapter boundary, envelopes, and offline invariants hold.
- [ ] `just trace` and `just trace-check` pass.
- [ ] The module inventory is unchanged.
