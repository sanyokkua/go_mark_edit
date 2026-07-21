---
id: STORY-016
title: Add the core editor status bar
status: ready
spec_clauses:
  - 01_Product/02_EDITOR_AND_VIEWER_MODES.md#editor-mode
  - 01_Product/03_FILES_TABS_WORKSPACE.md#encoding-and-line-endings
  - 02_Architecture/03_FRONTEND_REACT.md#state-ownership
  - 00_Foundation/04_DESIGN_DECISIONS.md#14-application-state-ownership
  - 07_Phases/PHASE_04_RENDERING_EXTENSIONS.md#scope
modules:
  - ui/components/
  - ui/widgets/
  - logic/store/
  - ui/styles/
acceptance_criteria:
  - STORY-016-AC-1
  - STORY-016-AC-2
  - STORY-016-AC-3
  - STORY-016-AC-4
  - STORY-016-AC-5
edge_cases: []
depends_on:
  - STORY-015
  - STORY-019
adrs:
  - ADR-0014
phase: 01
owner: coder
estimate: L
---

# STORY-016 — Add the core editor status bar

## Goal
Show users the active cursor location and backend-derived document metadata in the editor chrome so the first untitled document communicates position, word count, encoding, line endings, and arrangement without treating frontend text as authoritative.

## In scope
- Add a presentational `StatusBar` for one-based cursor position, backend-derived word count, encoding, line ending, and current arrangement.
- Feed cursor position from ephemeral Monaco events and all document/view metadata from the reconciled Redux projection.
- Compose the status bar into `EditorView`; format canonical `utf-8`/`lf` wire values as `UTF-8`/`LF` labels.

## Out of scope
- Autosave, lint counts, file warnings, binary/non-UTF-8 warnings, and save state, owned by later phases.
- Computing word count from Monaco text or storing content in Redux; the backend's Unicode whitespace-token rule is authoritative.
- Persisting cursor position or per-path file metadata, owned by later document and settings work.
- Reading mode, which hides the status bar and is owned by Phase 04.
- Markdown-standard status labeling, owned by Phase 04; Phase 01 need not show a `GFM` label in the status bar.
- Restorable cursor/selection synchronization, owned by STORY-019; this story consumes its immediate ephemeral cursor signal and backend patch provenance.

## Spec inputs
- `01_Product/02_EDITOR_AND_VIEWER_MODES.md#editor-mode` — include the status bar in editor chrome and use the specified Split, UTF-8/LF, and source-editor defaults.
- `01_Product/03_FILES_TABS_WORKSPACE.md#encoding-and-line-endings` — display encoding and line ending explicitly; Phase 01 uses the untitled UTF-8/LF defaults before file I/O exists.
- `02_Architecture/03_FRONTEND_REACT.md#state-ownership` — keep cursor position as ephemeral active-view scaffolding and read document counts/view state from the backend projection.
- `00_Foundation/04_DESIGN_DECISIONS.md#14-application-state-ownership` — apply DD-62 through DD-64 so counts and arrangement come from backend-derived metadata rather than Monaco content.
- `07_Phases/PHASE_04_RENDERING_EXTENSIONS.md#scope` — defer Markdown-standard selection/badge presentation to the Phase-04 rendering expansion.

## Design constraints
- Word count and view arrangement come only from reconciled backend metadata; neither `StatusBar` nor a selector reads Monaco content or stores document text in Redux (DD-62, DD-63, DD-64; ADR-0014).
- Cursor line/column are one-based ephemeral active-editor state supplied by STORY-019 and update immediately without becoming authoritative application state; restorable cursor/selection still synchronizes through backend-owned `DocView`.
- `StatusBar` remains presentational, typed, and independent of generated bindings; only `logic/adapter/` may import `wailsjs/`.
- `StatusBar` unit tests prove typed prop rendering only. Cursor wiring and backend-patch provenance are proven in a store-connected `EditorView` integration.
- Canonical backend wire values remain `utf-8` and `lf`; the UI alone formats `UTF-8` and `LF` labels.
- Backend commands retain Handler → Service → Repository layering and concrete `apperr.*Result` envelopes.
- Use CSS Modules and existing tokens only; do not introduce hardcoded colors, static inline styling, or a second layout.
- Phase 01 makes no network calls and adds no runtime assets, telemetry, or persistence path.

## Acceptance criteria

### STORY-016-AC-1
Given typed initial props, `StatusBar` renders `Ln 1, Col 1`, `0 words`, `UTF-8`, `LF`, and `Split`.

### STORY-016-AC-2
Monaco cursor changes wired through `EditorView` display one-based line and column values immediately while restorable synchronization remains STORY-019.

### STORY-016-AC-3
A backend metadata patch reconciled through `EditorView` changes the word count without reading Monaco content or storing content in Redux.

### STORY-016-AC-4
A reconciled backend view patch updates the arrangement label through the store-connected `EditorView`.

### STORY-016-AC-5
Before Phase 02 file I/O, canonical `utf-8`/`lf` wire values are formatted by the UI as the explicit `UTF-8`/`LF` untitled labels.

## Test plan
Each Jest test name begins with its matching `STORY-016-AC-N` id.

- STORY-016-AC-1 — unit — `frontend/src/ui/components/StatusBar.test.tsx` — `it('STORY-016-AC-1 renders initial untitled metadata')`.
- STORY-016-AC-2 — integration — `frontend/src/ui/widgets/EditorView.integration.test.tsx` — `it('STORY-016-AC-2 displays live one-based cursor position')`.
- STORY-016-AC-3 — integration — `frontend/src/ui/widgets/EditorView.integration.test.tsx` — `it('STORY-016-AC-3 renders backend-derived word count')`.
- STORY-016-AC-4 — integration — `frontend/src/ui/widgets/EditorView.integration.test.tsx` — `it('STORY-016-AC-4 reflects backend view arrangement')`.
- STORY-016-AC-5 — integration — `frontend/src/ui/widgets/EditorView.integration.test.tsx` — `it('STORY-016-AC-5 formats Phase-01 wire metadata labels')`.

## Definition of done
- [ ] Every acceptance criterion has a passing test whose Jest name begins with its `STORY-016-AC-N` id.
- [ ] Every edge case in `edge_cases:` has a passing test; this story declares none.
- [ ] StatusBar unit tests prove props only; store-connected EditorView tests prove live cursor wiring and backend-derived word/view/encoding/line-ending provenance without document content in Redux.
- [ ] UI formatting maps canonical `utf-8`/`lf` to `UTF-8`/`LF`, and Markdown-standard labeling remains deferred to Phase 04.
- [ ] Frontend `prettier --check`, ESLint, `tsc --noEmit`, and Jest pass; backend quality gates pass if backend/generated files are touched.
- [ ] Generated bindings remain current with no unexpected drift.
- [ ] Handler → Service → Repository layering, Result envelopes, backend authority, adapter-only Wails imports, and token-only theming remain intact.
- [ ] `just trace` regenerates the record and `just trace-check` passes with zero orphans and a fresh record.
- [ ] The module inventory is unchanged, or changes are reflected in `01_MODULE_INVENTORY.md` in the same story.
- [ ] The status bar matches the applicable Phase-01 mockup structure, and no background/unsolicited network call, telemetry, remote runtime asset, file-I/O behavior, or premature persistence is introduced.
