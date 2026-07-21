---
id: STORY-015
title: Compose the split editor and preview with backend-owned view modes
status: done
spec_clauses:
  - 01_Product/02_EDITOR_AND_VIEWER_MODES.md#split-view
  - 01_Product/02_EDITOR_AND_VIEWER_MODES.md#view-mode-toggle
  - 01_Product/02_EDITOR_AND_VIEWER_MODES.md#per-document-view-state
  - 02_Architecture/03_FRONTEND_REACT.md#state-ownership
  - 00_Foundation/06_IMPLEMENTATION_STAGES.md#3-forward-compatibility-constraints-per-stage
  - 07_Phases/PHASE_01_CORE_EDITOR.md#scope
  - mockups/README.md#role-in-the-spec
modules:
  - ui/primitives/
  - ui/components/
  - ui/widgets/
  - logic/store/
  - ui/styles/
acceptance_criteria:
  - STORY-015-AC-1
  - STORY-015-AC-2
  - STORY-015-AC-3
  - STORY-015-AC-4
  - STORY-015-AC-5
  - STORY-015-AC-6
edge_cases: []
depends_on:
  - STORY-014
  - STORY-019
adrs:
  - ADR-0005
  - ADR-0014
phase: 01
owner: coder
estimate: L
---

# STORY-015 — Compose the split editor and preview with backend-owned view modes

## Goal
Let users switch the active document among source-only, side-by-side, and rendered-only arrangements while preserving the existing application shell and treating the backend's reconciled view state as the rendered truth.

## In scope
- Add accessible `Segmented` and `ViewModeToggle` controls for Editor, Split, and Preview arrangements.
- Add `EditorView` and `PreviewView` composition in the reserved center region, including responsive split panes, pane headers, standard badge, and existing chrome.
- Add tokenized responsive auto-fit equal-width panes that stack vertically at narrow widths without horizontal overflow.
- Dispatch `SetDocView` for arrangement changes and render pane visibility only after the resulting backend patch reaches the projection.
- Keep the left shell region and collapsed empty assistant region structurally intact.

## Out of scope
- Full-chrome-hidden reading mode and `ReaderView`, owned by Phase 04.
- Persisting per-path document arrangements or application-level layout, owned by Phases 02 and 08.
- Divider dragging and arbitrary pane sizing, which are outside v1 unless a later story adds them.
- View-menu UI and its secondary pane-toggle presentation, deferred to Phase 08; this story preserves the shared `SetDocView` invariant seam so a later menu cannot hide both panes.
- Live accepted-snapshot preview synchronization and the status bar, owned by STORY-017 and STORY-016.

## Spec inputs
- `01_Product/02_EDITOR_AND_VIEWER_MODES.md#split-view` — compose evenly sized responsive Editor and Preview panes, prevent both from being hidden, and retain pane headers/badges.
- `01_Product/02_EDITOR_AND_VIEWER_MODES.md#view-mode-toggle` — provide a primary segmented control with exactly one active Editor, Split, or Preview arrangement.
- `01_Product/02_EDITOR_AND_VIEWER_MODES.md#per-document-view-state` — read document arrangement from the backend projection and change it through `SetDocView`.
- `02_Architecture/03_FRONTEND_REACT.md#state-ownership` — treat the UI action as a command and wait for the backend `state:patch` before rendering the new arrangement.
- `00_Foundation/06_IMPLEMENTATION_STAGES.md#3-forward-compatibility-constraints-per-stage` — mount in the F1 center region without restructuring the left/right shell or building Stage-3 assistant behavior.
- `07_Phases/PHASE_01_CORE_EDITOR.md#scope` — compose the Phase-01 split layout and segmented view control while leaving broader menu/settings UI for later phases.
- `mockups/README.md#role-in-the-spec` — treat the canonical mockup as the binding structural/visual reference while behavioral clauses remain authoritative.

## Design constraints
- View arrangement remains backend-owned and in-memory for the Phase-01 untitled document; Redux is only a `GetState`/`state:patch` projection (DD-62, DD-63, DD-64; ADR-0014).
- Selecting a segment dispatches `SetDocView` through the store/adapter command path; no component or thunk optimistically changes projected view state.
- The integration path is `ViewModeToggle` → store command → mock backend `state:patch` → projection → `EditorView` render; a presentational toggle test alone cannot prove the round trip.
- Only `logic/adapter/` may import `wailsjs/`, bound methods retain concrete `apperr.*Result` envelopes, and backend layering remains Handler → Service → Repository.
- The segmented primitive exposes exactly one selected option; Arrow keys move selection, Home/End choose the first/last option, and focus remains on the selected segment.
- Split layout uses responsive auto-fit equal panes and token-owned gap/minimum/stacking values in `ui/styles/`; narrow layouts stack without horizontal overflow.
- Structure follows `specification/mockups/gomarkedit-mockup.html`: the editor/preview pane headers, segmented control, and status/chrome slots use CSS Modules and existing tokens only (DD-28 through DD-30; ADR-0005).
- Preserve F1: left, center, and collapsed right assistant slots remain intact; the right slot contains no assistant or provider behavior.
- Stage 1/2 remains zero-network with bundled assets, no telemetry, and no runtime CDN reference.

## Acceptance criteria

### STORY-015-AC-1
Split mode applies the tokenized responsive auto-fit/equal-pane CSS contract in the existing center region, including the narrow stacking rule, while preserving the left and collapsed assistant slots; measured viewport overflow is owned by STORY-018.

### STORY-015-AC-2
Selecting Editor, Split, or Preview dispatches `SetDocView`; an `EditorView`/store integration proves the mock backend patch is reconciled before rendered panes change.

### STORY-015-AC-3
Editor shows source only, Split shows both panes, and Preview shows rendered content with chrome.

### STORY-015-AC-4
The segmented arrangement and shared `SetDocView` invariant cannot hide both panes; View-menu UI is deferred to Phase 08.

### STORY-015-AC-5
The segmented primitive exposes one selected option; Arrow keys move selection, Home/End select the first/last option, and focus remains on the selected segment.

### STORY-015-AC-6
Pane headers and the segmented control match the editor-split mockup structure using token-only CSS Modules.

## Test plan
Each Jest test name begins with its matching `STORY-015-AC-N` id.

- STORY-015-AC-1 — unit — `frontend/src/ui/widgets/EditorView.test.tsx` — `it('STORY-015-AC-1 applies the responsive split layout contract')`.
- STORY-015-AC-2 — integration — `frontend/src/ui/widgets/EditorView.integration.test.tsx` — `it('STORY-015-AC-2 round trips view mode through the backend patch')`.
- STORY-015-AC-3 — unit — `frontend/src/ui/widgets/EditorView.test.tsx` — `it('STORY-015-AC-3 renders each arrangement')`.
- STORY-015-AC-4 — unit — `frontend/src/ui/widgets/EditorView.test.tsx` — `it('STORY-015-AC-4 prevents an empty document arrangement')`.
- STORY-015-AC-5 — unit — `frontend/src/ui/primitives/Segmented.test.tsx` — `it('STORY-015-AC-5 supports Arrow Home and End selection with stable focus')`.
- STORY-015-AC-6 — unit — `frontend/src/ui/widgets/EditorView.test.tsx` — `it('STORY-015-AC-6 matches the split-view structure')`.

## Definition of done
- [ ] Every acceptance criterion has a passing test whose Jest name begins with its `STORY-015-AC-N` id.
- [ ] Every edge case in `edge_cases:` has a passing test; this story declares none.
- [ ] Editor/Split/Preview changes are proven through command → mock backend patch → projection → render, can never hide both panes, and preserve the F1 shell.
- [ ] Jest proves the responsive auto-fit/equal-pane/narrow-stacking CSS contract and token additions; STORY-018 measures no overflow at 375/768/1280 px. Keyboard Arrow/Home/End behavior, selected state, and stable selected focus are proven here.
- [ ] Landing STORY-015 supersedes STORY-001's temporary blank-center behavior; overfitted STORY-001/STORY-007 tests are updated through explicit supersession while their lasting boot, three-region, collapsed-assistant, token-only, and offline proofs remain.
- [ ] Frontend `prettier --check`, ESLint, `tsc --noEmit`, and Jest pass; backend quality gates pass if backend/generated files are touched.
- [ ] Generated bindings remain current with no unexpected drift.
- [ ] Handler → Service → Repository layering, Result envelopes, backend authority, adapter-only Wails imports, and token-only theming remain intact.
- [ ] `just trace` regenerates the record and `just trace-check` passes with zero orphans and a fresh record.
- [ ] The module inventory is unchanged, or changes are reflected in `01_MODULE_INVENTORY.md` in the same story.
- [ ] The approved Phase-01 split-view mockup structure matches at applicable widths, and no background/unsolicited network call, telemetry, or remote runtime asset is introduced.
