---
id: STORY-050
title: Synchronize the native window title from projected state
status: draft
spec_clauses:
  - 01_Product/03_FILES_TABS_WORKSPACE.md#dirty-state
  - 02_Architecture/04_WAILS_INTEGRATION.md#lifecycle
  - 07_Phases/PHASE_02_FILE_IO_TABS.md#requirement-ledger
phase_requirements:
  - PH02-R05
  - PH02-R11
modules:
  - logic/adapter/
  - logic/store/
acceptance_criteria:
  - STORY-050-AC-1
  - STORY-050-AC-2
  - STORY-050-AC-3
  - STORY-050-AC-4
edge_cases: []
depends_on:
  - STORY-039
adrs:
  - ADR-0014
phase: 02
owner: coder
estimate: M
---

# STORY-050 — Synchronize the native window title from projected state

## Goal

Keep the native title aligned with the current backend-confirmed document and dirty state, including the
real zero-document state.

## In scope

- Derive the exact empty, clean, and dirty title strings.
- Update the title for every active-document/path/dirty lifecycle patch.
- Ignore stale title work and keep runtime access inside the adapter.

## Out of scope

- Persisting a title value.
- Menu or recent-file labels.
- Native close handling, owned by STORY-046.

## Spec inputs

- `01_Product/03_FILES_TABS_WORKSPACE.md#dirty-state` — reflect clean/dirty state without changing ownership.
- `02_Architecture/04_WAILS_INTEGRATION.md#lifecycle` — update the native window through Wails runtime.
- `07_Phases/PHASE_02_FILE_IO_TABS.md#requirement-ledger` — implement the exact active-title requirement.

## Design constraints

- Derive title from the newest projected revision; never persist it or make it authoritative.
- Exact forms are `GoMarkEdit`, `filename — GoMarkEdit`, and `● filename — GoMarkEdit`; use basename only.
- Only `logic/adapter/` imports Wails runtime; the store supplies metadata and revision.
- Preserve DD-62–64, ADR-0014, content-free projection, token-only UI, Result envelopes, and offline behavior.

## Acceptance criteria

### STORY-050-AC-1
**Satisfies:** PH02-R05, PH02-R11

With no active document the native title is exactly `GoMarkEdit`.

### STORY-050-AC-2
**Satisfies:** PH02-R05, PH02-R11

A clean active document produces `filename — GoMarkEdit`, and a dirty active document produces
`● filename — GoMarkEdit`, using basename only.

### STORY-050-AC-3
**Satisfies:** PH02-R05, PH02-R11

Activation, dirty change, successful Save As, reload, close, and final-tab close update the title from the
corresponding backend-confirmed projection.

### STORY-050-AC-4
**Satisfies:** PH02-R05, PH02-R11

A stale projection revision cannot overwrite a newer title, and no module outside `logic/adapter/` imports
the Wails title runtime.

## Test plan

- STORY-050-AC-1 — unit — `frontend/src/logic/adapter/windowTitleAdapter.test.ts` —
  `it('STORY-050-AC-1 uses the empty GoMarkEdit title')`.
- STORY-050-AC-2 — unit — `frontend/src/logic/adapter/windowTitleAdapter.test.ts` —
  `it('STORY-050-AC-2 formats clean and dirty basename titles')`.
- STORY-050-AC-3 — integration — `frontend/src/logic/adapter/windowTitleAdapter.test.ts` —
  `it('STORY-050-AC-3 follows the document lifecycle projection')`.
- STORY-050-AC-4 — architecture — `frontend/src/logic/adapter/windowTitleAdapter.test.ts` —
  `it('STORY-050-AC-4 rejects stale titles and preserves runtime import boundary')`.

## Definition of done

- [ ] Every AC has a passing named test.
- [ ] Lifecycle tests cover every listed trigger and out-of-order revisions.
- [ ] Import architecture checks prove adapter-only runtime access.
- [ ] No persisted/optimistic title state is introduced.
- [ ] Frontend quality gates pass.
- [ ] Authority, envelope, token, and offline invariants hold.
- [ ] `just trace` and `just trace-check` pass.
- [ ] The module inventory is unchanged.
