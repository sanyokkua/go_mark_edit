---
id: STORY-039
title: Project file and tab commands into the active editor session
status: draft
spec_clauses:
  - 02_Architecture/03_FRONTEND_REACT.md#adapter-layer
  - 02_Architecture/03_FRONTEND_REACT.md#store
  - 02_Architecture/03_FRONTEND_REACT.md#state-ownership
  - 07_Phases/PHASE_02_FILE_IO_TABS.md#state-and-transition-model
  - 07_Phases/PHASE_02_FILE_IO_TABS.md#cross-phase-contracts
phase_requirements:
  - PH02-R01
  - PH02-R02
  - PH02-R05
  - PH02-R06
  - PH02-R09
modules:
  - logic/adapter/
  - logic/store/
  - ui/widgets/
acceptance_criteria:
  - STORY-039-AC-1
  - STORY-039-AC-2
  - STORY-039-AC-3
  - STORY-039-AC-4
  - STORY-039-AC-5
  - STORY-039-AC-6
edge_cases:
  - EC-DOCS-13
  - EC-TABS-7
depends_on:
  - STORY-012
  - STORY-019
  - STORY-021
  - STORY-027
  - STORY-028
  - STORY-030
  - STORY-035
  - STORY-036
  - STORY-037
  - STORY-038
adrs:
  - ADR-0014
  - ADR-0017
  - ADR-0021
  - ADR-0022
phase: 02
owner: coder
estimate: M
---

# STORY-039 — Project file and tab commands into the active editor session

## Goal

Connect file and tab commands to the persistent editor session so outgoing edits are acknowledged before
handoff and only the newest backend-confirmed document can supply visible content.

## In scope

- Add typed adapter/store command paths for New, Open, Save, Save As, activation, reorder, and clean close.
- Coordinate active-buffer acknowledgements with the editor session.
- Support zero documents and post-write projection resynchronization.

## Out of scope

- Visual TabBar and empty-state composition, owned by STORY-041.
- Dirty-close and external prompts, owned by STORY-043 and STORY-045.
- Autosave scheduling, owned by STORY-048.

## Spec inputs

- `02_Architecture/03_FRONTEND_REACT.md#adapter-layer` — keep all generated binding and runtime access in
  typed adapters.
- `02_Architecture/03_FRONTEND_REACT.md#store` — update only from backend snapshots and patches.
- `02_Architecture/03_FRONTEND_REACT.md#state-ownership` — flush the working copy before save/switch/close
  and keep document content out of Redux.
- `07_Phases/PHASE_02_FILE_IO_TABS.md#state-and-transition-model` — preserve ordered PH02-T01–T05/T07 flows.
- `07_Phases/PHASE_02_FILE_IO_TABS.md#cross-phase-contracts` — consume queue and tab-set contracts.

## Design constraints

- Only `logic/adapter/` imports `wailsjs/` or Wails runtime; adapters use `guardArity` and `unwrap`.
- The story adds one aggregate exported frontend seam,
  `appModelAdapter.executeDocumentCommand(DocumentCommand)`, whose discriminated variants cover the listed
  file/tab operations; queue, acknowledgement, and resync helpers remain private.
- Activation flushes the outgoing buffer and applicable view intent before dispatch; its acknowledgement is
  applied only for the backend-confirmed identity/revision (ADR-0021).
- Redux remains metadata-only and non-optimistic; Monaco owns only the active working copy.
- ADR-0022's `resyncRequired` creates a command barrier until `GetState` rehydration succeeds.
- Preserve DD-62–64, ADR-0014/0017, Handler → Service → Repository and Result envelopes across the bridge,
  token-only styling, and Stage-2 zero-network behavior.

## Acceptance criteria

### STORY-039-AC-1
**Satisfies:** PH02-R01, PH02-R02, PH02-R05

New, Open, Save, Save As, activate, reorder, and clean-close frontend operations call typed adapter
singletons and reconcile only backend snapshots, acknowledgements, or patches. (satisfies EC-TABS-7)

### STORY-039-AC-2
**Satisfies:** PH02-R02, PH02-R05, PH02-R09

**Given** pending outgoing buffer or view intent, **when** another tab is selected, **then** required queues
are acknowledged before activation and the new buffer acknowledgement is attached.

### STORY-039-AC-3
**Satisfies:** PH02-R05, PH02-R09

A late activation or reload acknowledgement whose document identity or content revision no longer matches
the projection is discarded without changing Monaco.

### STORY-039-AC-4
**Satisfies:** PH02-R01, PH02-R02, PH02-R05, PH02-R06

Successful file and tab commands update controls and metadata only through backend-confirmed state; pending
or failed commands do not optimistically mutate order, active identity, path, or dirty state.

### STORY-039-AC-5
**Satisfies:** PH02-R05, PH02-R06

Startup and final-tab close hydrate a projection with no active document or active buffer and render no
synthetic document session.

### STORY-039-AC-6
**Satisfies:** PH02-R02, PH02-R09

**Given** a successful save acknowledgement marked `resyncRequired`, **when** it reaches the adapter,
**then** later document commands wait until `GetState` rehydration completes and the write is not repeated.
(satisfies EC-DOCS-13)

## Test plan

- STORY-039-AC-1 — unit — `frontend/src/logic/adapter/appModelAdapter.test.ts` —
  `it('STORY-039-AC-1 routes file and tab commands through adapters (EC-TABS-7)')`.
- STORY-039-AC-2 — integration — `frontend/src/ui/widgets/EditorView.integration.test.tsx` —
  `it('STORY-039-AC-2 flushes outgoing queues before active-buffer handoff')`.
- STORY-039-AC-3 — integration — `frontend/src/ui/widgets/EditorView.integration.test.tsx` —
  `it('STORY-039-AC-3 discards stale active-buffer acknowledgements')`.
- STORY-039-AC-4 — unit — `frontend/src/logic/store/appModelProjection.test.ts` —
  `it('STORY-039-AC-4 keeps file and tab state backend-confirmed')`.
- STORY-039-AC-5 — integration — `frontend/src/logic/store/appModelProjection.test.ts` —
  `it('STORY-039-AC-5 represents a zero-document projection')`.
- STORY-039-AC-6 — unit — `frontend/src/logic/adapter/appModelAdapter.test.ts` —
  `it('STORY-039-AC-6 rehydrates before later commands (EC-DOCS-13)')`.

## Definition of done

- [ ] Every AC and edge has passing explicit evidence.
- [ ] Deferred tests cover rapid switches, late acknowledgements, failed flushes, and resync barriers.
- [ ] Import checks prove only adapters import generated bindings/runtime.
- [ ] Tests prove one aggregate frontend document-command seam and no parallel public command family.
- [ ] Redux and patches remain content-free; zero-state hydration is exercised.
- [ ] Frontend format, lint, typecheck, Jest, and applicable bridge-mock tests pass.
- [ ] Backend authority, envelopes, token styling, and offline behavior hold.
- [ ] `just trace` and `just trace-check` pass.
- [ ] The module inventory is unchanged.
