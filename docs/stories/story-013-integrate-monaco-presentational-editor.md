---
id: STORY-013
title: Integrate Monaco as the presentational Markdown editor
status: ready
spec_clauses:
  - 01_Product/01_FUNCTIONAL_REQUIREMENTS.md#fr-editor
  - 01_Product/02_EDITOR_AND_VIEWER_MODES.md#editor-mode
  - 02_Architecture/03_FRONTEND_REACT.md#components
  - 03_NonFunctional/02_PERFORMANCE.md#2-editor-responsiveness
  - 00_Foundation/04_DESIGN_DECISIONS.md#4-markdown-behaviour
  - 07_Phases/PHASE_01_CORE_EDITOR.md#scope
modules:
  - ui/components/
  - ui/styles/
acceptance_criteria:
  - STORY-013-AC-1
  - STORY-013-AC-2
  - STORY-013-AC-3
  - STORY-013-AC-4
  - STORY-013-AC-5
  - STORY-013-AC-6
edge_cases: []
depends_on:
  - STORY-012
adrs:
  - ADR-0002
  - ADR-0014
phase: 01
owner: coder
estimate: M
---

# STORY-013 — Integrate Monaco as the presentational Markdown editor

## Goal
Provide a responsive, locally bundled Monaco Markdown component with typed editor operations so later synchronization can consume it without coupling the presentational editor to Redux, adapters, or backend timing.

## In scope
- Add `@monaco-editor/react` and `monaco-editor`, package/lock changes, and Vite worker configuration limited to the Markdown contribution and locally bundled workers.
- Add a presentational `CodeEditor` wrapper that lazy-loads Monaco, seeds `initialValue`/model only when a new document identity mounts, and exposes immediate typed change, blur, cursor, selection, and mount callbacks.
- Configure Monaco in Markdown mode with line numbers on, word wrap off, and tokenized 14 px font/minimum-height defaults; measured height at responsive viewports is owned by STORY-018.
- Expose typed imperative primitives for `getSelection`, `replaceRange`, and `replaceAll`; a later document-command owner will compose these without reaching into Monaco from outside the component seam.
- Add component and production-artifact/static-scan proofs that Monaco workers/assets are bundled and contain no remote runtime loader.

## Out of scope
- Persisting line-number, word-wrap, or font-size preferences, owned by Phase 08; this story exposes typed props and uses tokenized defaults.
- File save, tab switch/close, autosave, and flush behavior, owned by Phase 02 and STORY-019; this story exposes only presentational callbacks/editor operations.
- Buffer debounce, adapter ownership, `UpdateBuffer`, state-patch integration, flush ordering, and EC-DOCS-12, all owned by STORY-019.
- Markdown preview rendering and accepted-snapshot preview state, owned by STORY-014 and STORY-017.
- Formatting toolbar actions and lint integration, owned by later Stage-2 phases; this story exposes only the low-level selection/edit primitives required by the later command seam.

## Spec inputs
- `01_Product/01_FUNCTIONAL_REQUIREMENTS.md#fr-editor` — render editable Markdown source in Monaco and debounce-sync its working buffer to the backend-owned canonical model.
- `01_Product/02_EDITOR_AND_VIEWER_MODES.md#editor-mode` — use Markdown syntax mode, line numbers on, word wrap off, Split arrangement, and a 14 px default editor font.
- `02_Architecture/03_FRONTEND_REACT.md#components` — keep `CodeEditor` thin and presentational with typed editor configuration and callbacks.
- `03_NonFunctional/02_PERFORMANCE.md#2-editor-responsiveness` — avoid bridge and preview work on the keystroke path, debounce buffer commands, flush at lifecycle boundaries, and never echo backend text into the focused editor.
- `00_Foundation/04_DESIGN_DECISIONS.md#4-markdown-behaviour` — preserve UTF-8/LF defaults and the later settings-driven Markdown behavior without prematurely persisting editor controls.
- `07_Phases/PHASE_01_CORE_EDITOR.md#scope` — build the Phase-01 `CodeEditor` component while leaving synchronization and persisted preferences to their owning stories/phases.

## Design constraints
- `CodeEditor` is strictly presentational and imports neither Redux nor `logic/adapter/`; it owns no debounce timer, backend command, patch listener, or synchronization policy.
- `initialValue`/Monaco model creation is keyed to document identity. Ordinary metadata prop rerenders never call `setValue`, recreate the model, or disturb cursor/selection.
- Monaco emits edits immediately through typed callbacks. Imperative selection/replace operations are exposed through a narrow typed ref and remain composable by STORY-019's F3/F7 seam.
- Load `@monaco-editor/react`, `monaco-editor`, the Markdown contribution, and workers from package/local bundled modules only; production assets/static scans must prove no CDN, remote runtime URL, fetch, telemetry, or other network path (DD-20; ADR-0002).
- Editor min-height and 14 px default come from existing/new `ui/styles/` tokens and CSS Modules; no static inline styling or hardcoded colors.
- Only `logic/adapter/` may import generated Wails bindings; backend-authoritative state, Handler → Service → Repository layering, and concrete Result envelopes remain unchanged.
- Backend Handler → Service → Repository layering and concrete `apperr.*Result` envelopes remain unchanged.

## Acceptance criteria

### STORY-013-AC-1
`CodeEditor` configures the Markdown contribution with line numbers on, word wrap off, and tokenized 14 px font/minimum-height defaults; responsive rendered geometry is proven by STORY-018.

### STORY-013-AC-2
Monaco and its configured Markdown worker path are lazy-loaded from local bundled modules, and a production artifact/static scan finds no CDN, remote runtime URL, or fetch loader.

### STORY-013-AC-3
Typing changes the Monaco model and invokes the typed change callback immediately without waiting for an adapter, Redux, debounce, or backend response.

### STORY-013-AC-4
The hydration value/model seeds Monaco only when a new document identity mounts; ordinary rerenders for the same identity do not recreate or overwrite the model.

### STORY-013-AC-5
Rerendering `CodeEditor` with changed non-content metadata never calls Monaco `setValue` and preserves cursor and selection; state-patch integration itself remains STORY-019.

### STORY-013-AC-6
`CodeEditor` exposes typed change, blur, cursor-position, selection, `getSelection`, `replaceRange`, and `replaceAll` seams without importing the adapter or Redux.

## Test plan
Each Jest test name begins with its matching `STORY-013-AC-N` id.

- STORY-013-AC-1 — unit — `frontend/src/ui/components/CodeEditor.test.tsx` — `it('STORY-013-AC-1 configures the default Markdown editor tokens and options')`.
- STORY-013-AC-2 — architecture — `frontend/src/ui/components/CodeEditor.bundle.test.ts` — `it('STORY-013-AC-2 bundles Monaco and Markdown workers locally')`.
- STORY-013-AC-3 — unit — `frontend/src/ui/components/CodeEditor.test.tsx` — `it('STORY-013-AC-3 reports Monaco edits immediately')`.
- STORY-013-AC-4 — unit — `frontend/src/ui/components/CodeEditor.test.tsx` — `it('STORY-013-AC-4 seeds a model only for a new document identity')`.
- STORY-013-AC-5 — unit — `frontend/src/ui/components/CodeEditor.test.tsx` — `it('STORY-013-AC-5 preserves the model cursor and selection on metadata rerender')`.
- STORY-013-AC-6 — architecture — `frontend/src/ui/components/CodeEditor.test.tsx` — `it('STORY-013-AC-6 keeps the editor component presentational')`.

## Definition of done
- [ ] Every acceptance criterion has a passing test whose Jest name begins with its `STORY-013-AC-N` id.
- [ ] Every edge case in `edge_cases:` has a passing test; EC-DOCS-12 is deliberately owned by STORY-019.
- [ ] Package/lock and Vite worker configuration include only the required local Monaco/Markdown assets, and the production artifact/static scan finds no remote loader.
- [ ] The component proves immediate editing, document-identity-only seeding, stable model/cursor/selection on metadata rerender, and typed presentational selection/edit primitives.
- [ ] Frontend `prettier --check`, ESLint, `tsc --noEmit`, and Jest pass; backend quality gates pass if backend/generated files are touched.
- [ ] Generated bindings remain current with no unexpected drift.
- [ ] Handler → Service → Repository layering, Result envelopes, backend authority, adapter-only Wails imports, and token-only theming remain intact.
- [ ] `just trace` regenerates the record and `just trace-check` passes with zero orphans and a fresh record.
- [ ] The module inventory is unchanged, or changes are reflected in `01_MODULE_INVENTORY.md` in the same story.
- [ ] Applicable editor layout assertions use the canonical Phase-01 mockup structure, and no background/unsolicited network call, telemetry, or remote runtime asset is introduced.
