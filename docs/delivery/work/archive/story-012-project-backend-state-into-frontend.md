---
id: STORY-012
title: Project backend application state into the frontend
status: done
spec_clauses:
  - ../../../_archive-2026-07-28-specification/02_Architecture/03_FRONTEND_REACT.md#adapter-layer
  - ../../../_archive-2026-07-28-specification/02_Architecture/03_FRONTEND_REACT.md#store
  - ../../../_archive-2026-07-28-specification/02_Architecture/03_FRONTEND_REACT.md#state-ownership
  - ../../../_archive-2026-07-28-specification/02_Architecture/01_SYSTEM_ARCHITECTURE.md#data-flow
  - ../../../_archive-2026-07-28-specification/00_Foundation/04_DESIGN_DECISIONS.md#14-application-state-ownership
  - 07_Phases/PHASE_01_CORE_EDITOR.md#scope
phase_requirements:
  - PH01-R02
  - PH01-R05
modules:
  - logic/adapter/
  - logic/store/
  - dev/bridge-mock/
  - ui/widgets/
acceptance_criteria:
  - STORY-012-AC-1
  - STORY-012-AC-2
  - STORY-012-AC-3
  - STORY-012-AC-4
  - STORY-012-AC-5
  - STORY-012-AC-6
  - STORY-012-AC-7
  - STORY-012-AC-8
edge_cases: []
depends_on:
  - STORY-011
adrs:
  - ADR-0014
phase: 01
owner: coder
estimate: L
---

> **Historical vocabulary — this story is not maintained.** The `AC-…`, `EC-…` and `DD-…` identifiers are the scheme of the pre-2026-07-28 specification; `spec_clauses` and `phase_requirements` point into `_archive-2026-07-28-specification/`, which is kept so a citation still resolves and is **not normative**. See `README.md`. If anything here disagrees with the code, the code is the truth.
> A link beginning `07_Phases/` names a retired phase document that was deleted rather than archived; that set is in git at `e1bd33f`.

# STORY-012 — Project backend application state into the frontend

## Goal

Hydrate and continuously reconcile a disposable frontend view of the backend application model so UI features can render document metadata and layout without creating a second source of truth or retaining document content in Redux.

## In scope

- Add `appModelAdapter` query/command wrappers and its single owned `state:patch` subscription with a disposer.
- Add `documents` and `ui` projection slices, one-time `GetState` hydration, and content-free patch reconciliation.
- Add a process-scoped, idempotent bootstrap outside React effects: cache one initialization Promise, call `GetState` once, install one adapter-owned listener, hydrate once, and expose a disposer.
- Return the hydration-only `ActiveBuffer` to ephemeral root/editor-session state while stripping all document content from Redux and `localStorage`.
- Wire the actual application/root bootstrap handoff so React StrictMode remounts reuse the same initialization rather than re-querying or re-subscribing.
- Extend the frontend-only bridge mock with matching `StateResult`, command envelopes, and runtime patch events.
- Update the overfitted done STORY-006 store test only as required to preserve its lasting invariant—notifications plus projection/no-content—rather than expecting notification state to be the store's only slice.

## Out of scope

- Rendering Monaco is owned by STORY-013; synchronizing its working buffer and the editable command seam are owned by STORY-019.
- Rendering Markdown, composing document panes, and live-preview state, owned by STORY-014, STORY-015, and STORY-017.
- Optimistic frontend ownership of document or layout changes; every UI mutation remains a backend command.
- Persisting document content or application state in `localStorage` or SQLite.

## Spec inputs

- `../../../_archive-2026-07-28-specification/02_Architecture/03_FRONTEND_REACT.md#adapter-layer` — keep generated bindings and Wails runtime imports inside typed adapter singletons using `guardArity` and `unwrap`.
- `../../../_archive-2026-07-28-specification/02_Architecture/03_FRONTEND_REACT.md#store` — represent documents and UI as metadata-only Redux slices hydrated from and reconciled with the backend model.
- `../../../_archive-2026-07-28-specification/02_Architecture/03_FRONTEND_REACT.md#state-ownership` — hydrate once through `GetState`, reconcile `state:*` patches, and keep only ephemeral view scaffolding in the webview.
- `../../../_archive-2026-07-28-specification/02_Architecture/01_SYSTEM_ARCHITECTURE.md#data-flow` — retain the command → handler → model → event → projection → render direction and Result-envelope error path.
- `../../../_archive-2026-07-28-specification/00_Foundation/04_DESIGN_DECISIONS.md#14-application-state-ownership` — apply DD-62 through DD-64 and ADR-0014 without storing canonical content or optimistically mutating backend-owned state.
- `07_Phases/PHASE_01_CORE_EDITOR.md#scope` — introduce the documents/UI projection and single Phase-01 hydration handoff without file, tab, or persistence behavior.

## Design constraints

- The Go `internal/appmodel` remains authoritative; Redux is a derived projection containing document metadata and UI state only (DD-62, DD-63, DD-64; ADR-0014).
- Only `logic/adapter/` imports generated `wailsjs/` bindings or the Wails runtime; every query and command is guarded by `guardArity`, unwrapped through the existing envelope/toast path, and exposed by the adapter singleton.
- Command completion does not directly mutate projection state. A later `state:patch` from the backend is the only mutation source after hydration.
- Bootstrap is process-scoped and idempotent, lives outside React effects, caches one initialization Promise, and is safe under React StrictMode remounts.
- Initialization installs the listener before the query, queues incoming patches until hydration completes, then applies only revisions newer than the snapshot revision so a concurrent change cannot be lost or duplicated; teardown disposes the one adapter-owned listener.
- The separate `ActiveBuffer` returned at hydration is handed to ephemeral root/editor-session state and is never inserted into a Redux slice or `localStorage`.
- A `GetState` failure uses the existing `unwrap`/toast path, leaves a safe empty projection, installs or retains no leaked listener, and rejects/returns through a documented bootstrap result rather than crashing React.
- Backend Handler → Service → Repository layering and concrete `apperr.*Result` envelopes remain unchanged; UI styling remains token-only.
- Preserve the Stage-1/2 zero-network invariant: the bridge mock is local development plumbing and neither real nor mock adapters perform background network activity.

## Acceptance criteria

### STORY-012-AC-1

**Satisfies:** PH01-R02, PH01-R05
App-model hydration returns the active buffer separately while Redux stores only document metadata and UI state.

### STORY-012-AC-2

**Satisfies:** PH01-R02
Process-scoped initialization caches one Promise, calls `GetState` once, and hydrates `documents` and `ui` exactly once even when React StrictMode mounts the application twice.

### STORY-012-AC-3

**Satisfies:** PH01-R02, PH01-R05
A newer revisioned `state:patch` updates dirty/count/view/UI fields without adding content to any slice, while duplicate or stale revisions are ignored.

### STORY-012-AC-4

**Satisfies:** PH01-R02
`appModelAdapter` exposes guarded, unwrapped query/command methods; commands do not optimistically mutate projection state.

### STORY-012-AC-5

**Satisfies:** PH01-R02
Event initialization installs one adapter-owned listener before reconciliation begins, and its disposer prevents duplicate or leaked subscriptions across repeated bootstrap consumers.

### STORY-012-AC-6

**Satisfies:** PH01-R02
The frontend-only bridge mock mirrors `StateResult`, command envelopes, and runtime patch events.

### STORY-012-AC-7

**Satisfies:** PH01-R02, PH01-R05
The actual application bootstrap hands the separate hydration `ActiveBuffer` to ephemeral root/editor-session state while Redux contains only document metadata and UI state.

### STORY-012-AC-8

**Satisfies:** PH01-R02
**Given** `GetState` rejects or returns an error envelope, **when** application bootstrap runs, **then** the normal toast path reports the error, Redux remains a safe empty projection, and no state-patch listener leaks.

## Test plan

Each Jest test name begins with its matching `STORY-012-AC-N` id.

- STORY-012-AC-1 — unit — `frontend/src/logic/store/appModelProjection.test.ts` — `it('STORY-012-AC-1 strips content while hydrating projection metadata')`.
- STORY-012-AC-2 — unit — `frontend/src/logic/store/appModelProjection.test.ts` — `it('STORY-012-AC-2 hydrates the projection once')`.
- STORY-012-AC-3 — unit — `frontend/src/logic/store/appModelProjection.test.ts` — `it('STORY-012-AC-3 reconciles revisioned content-free state patches')`.
- STORY-012-AC-4 — unit — `frontend/src/logic/adapter/appModelAdapter.test.ts` — `it('STORY-012-AC-4 wraps app-model commands without optimistic state')`.
- STORY-012-AC-5 — unit — `frontend/src/logic/adapter/appModelAdapter.test.ts` — `it('STORY-012-AC-5 disposes state patch subscriptions')`.
- STORY-012-AC-6 — integration — `frontend/src/dev/bridge-mock/appModel.test.ts` — `it('STORY-012-AC-6 mirrors the app-model bridge contract')`.
- STORY-012-AC-7 — integration — `frontend/src/App.test.tsx` — `it('STORY-012-AC-7 hands the active buffer to ephemeral editor session state')`.
- STORY-012-AC-8 — integration — `frontend/src/App.test.tsx` — `it('STORY-012-AC-8 keeps bootstrap safe when GetState fails')`.

## Definition of done

- [ ] Every acceptance criterion has a passing test whose Jest name begins with its `STORY-012-AC-N` id.
- [ ] Every edge case in `edge_cases:` has a passing test; this story declares none.
- [ ] The process-scoped bootstrap is StrictMode-safe, calls `GetState`/hydrates once, owns one disposable listener, hands off `ActiveBuffer` ephemerally, and fails to a toast plus safe empty projection without leaks.
- [ ] Redux and `localStorage` contain no document content; commands wait for backend patches rather than optimistically mutating projected truth.
- [ ] The STORY-006 store test is updated only to preserve its lasting notifications plus projection/no-content invariant; no done-story proof is silently deleted.
- [ ] Frontend `prettier --check`, ESLint, `tsc --noEmit`, and Jest pass; backend quality gates pass if generated/backend files are touched.
- [ ] Generated bindings remain current with no unexpected drift.
- [ ] Handler → Service → Repository layering, Result envelopes, backend authority, adapter-only Wails imports, and token-only theming remain intact.
- [ ] `just trace` regenerates the record and `just trace-check` passes with zero orphans and a fresh record.
- [ ] The module inventory is unchanged, or changes are reflected in `01_MODULE_INVENTORY.md` in the same story.
- [ ] Applicable bootstrap/UI behavior has an integration proof, and no background/unsolicited network call, telemetry, or remote runtime asset is introduced.
