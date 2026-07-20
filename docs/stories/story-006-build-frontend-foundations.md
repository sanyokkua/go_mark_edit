---
id: STORY-006
title: Build the frontend adapter projection-store toast and bridge mock foundations
status: ready
spec_clauses:
  - 02_Architecture/03_FRONTEND_REACT.md#structure
  - 02_Architecture/03_FRONTEND_REACT.md#adapter-layer
  - 02_Architecture/03_FRONTEND_REACT.md#bridge-mock
  - 02_Architecture/01_SYSTEM_ARCHITECTURE.md#data-flow
  - 02_Architecture/01_SYSTEM_ARCHITECTURE.md#layer-boundaries
  - 02_Architecture/06_ERROR_HANDLING.md#frontend-parseerror
  - 02_Architecture/06_ERROR_HANDLING.md#toasts
modules:
  - logic/adapter/
  - logic/store/
  - logic/utils/
  - dev/bridge-mock/
  - ui/primitives/
acceptance_criteria:
  - STORY-006-AC-1
  - STORY-006-AC-2
  - STORY-006-AC-3
  - STORY-006-AC-4
edge_cases: []
depends_on:
  - STORY-005
adrs: []
phase: 00
owner: coder
estimate: L
---

# STORY-006 — Build the frontend adapter projection-store toast and bridge mock foundations

## Goal
Give the webview one typed, mockable command boundary and one consistent user-feedback path before user-facing features arrive.

## In scope
- Adapter singleton, arity guard, unwrap, error normalization, notification projection state, toast primitive, and dev-only bridge mock.

## Out of scope
- Documents, tabs, canonical content, and appmodel state, which begin in Phase 01.

## Spec inputs
- `02_Architecture/03_FRONTEND_REACT.md#adapter-layer` — adapter is the only Wails binding importer.
- `02_Architecture/06_ERROR_HANDLING.md#toasts` — unwrap is the single automatic error-feedback choke point.

## Design constraints
- Redux is a disposable backend projection and never holds canonical document content.
- Components and tests use adapters, never `wailsjs/`; no frontend code opens a network connection.

## Acceptance criteria
### STORY-006-AC-1
Only `logic/adapter` imports generated Wails bindings, and wrappers use arity guards plus unwrap for concrete settings results.

### STORY-006-AC-2
The Redux root supplies typed notification state and is a disposable UI projection rather than a document-content authority.

### STORY-006-AC-3
`parseError` normalizes unknown failures, and `unwrap` emits one notification before throwing the typed wire error.

### STORY-006-AC-4
`npm run dev` uses the bridge mock rather than a Go backend and exercises the same success and error adapter surface.

## Test plan
Each named test begins with its matching `Proves: STORY-006-AC-N` tag.

- STORY-006-AC-1 — unit — `frontend/src/logic/adapter/index.test.ts` — `it('STORY-006-AC-1 guards and unwraps settings calls')`.
- STORY-006-AC-2 — unit — `frontend/src/logic/store/store.test.ts` — `it('STORY-006-AC-2 creates projection-only notification state')`.
- STORY-006-AC-3 — unit — `frontend/src/logic/utils/parseError.test.ts` — `it('STORY-006-AC-3 normalizes adapter failures')`.
- STORY-006-AC-3 — unit — `frontend/src/logic/adapter/index.test.ts` — `it('STORY-006-AC-3 notifies once before throwing')`.
- STORY-006-AC-4 — integration — `frontend/src/dev/bridge-mock/bridge.test.ts` — `it('STORY-006-AC-4 serves the app without Go')`.

## Definition of done
- [ ] Every AC has a tagged proving test using adapter mocks, not Wails bindings.
- [ ] Strict TypeScript, ESLint, and Jest pass.
- [ ] Traceability is regenerated and validated before `done`.
