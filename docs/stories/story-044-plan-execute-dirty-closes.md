---
id: STORY-044
title: Plan and execute authoritative dirty-document closes
status: draft
spec_clauses:
  - 01_Product/03_FILES_TABS_WORKSPACE.md#dirty-state
  - 02_Architecture/04_WAILS_INTEGRATION.md#lifecycle
  - 07_Phases/PHASE_02_FILE_IO_TABS.md#state-and-transition-model
  - 07_Phases/PHASE_02_FILE_IO_TABS.md#cross-phase-contracts
phase_requirements:
  - PH02-R06
  - PH02-R07
  - PH02-R09
  - PH02-R10
modules:
  - internal/appmodel/
acceptance_criteria:
  - STORY-044-AC-1
  - STORY-044-AC-2
  - STORY-044-AC-3
  - STORY-044-AC-4
  - STORY-044-AC-5
  - STORY-044-AC-6
edge_cases:
  - EC-DOCS-5
  - EC-TABS-3
depends_on:
  - STORY-036
  - STORY-037
  - STORY-038
adrs:
  - ADR-0014
  - ADR-0024
phase: 02
owner: coder
estimate: M
---

# STORY-044 — Plan and execute authoritative dirty-document closes

## Goal

Close one or many dirty documents without saving, discarding, or closing anything until the complete
backend-authoritative decision can be executed safely.

## In scope

- Add revision-bound close-plan query/command data.
- Bind every requested target and validate choices only for dirty targets.
- Gather all required mixed-ending normalization authorizations before execution.
- Save in tab order and close only after all requested saves succeed.

## Out of scope

- Prompt UI, owned by STORY-045.
- Native window interception, owned by STORY-046.
- Save and external-conflict primitives, owned by STORY-037/038.

## Spec inputs

- `01_Product/03_FILES_TABS_WORKSPACE.md#dirty-state` — offer Save, Discard, Cancel without losing content.
- `02_Architecture/04_WAILS_INTEGRATION.md#lifecycle` — use the same lifecycle for tab/window/quit closure.
- `07_Phases/PHASE_02_FILE_IO_TABS.md#state-and-transition-model` — implement PH02-T06 preservation.
- `07_Phases/PHASE_02_FILE_IO_TABS.md#cross-phase-contracts` — flush queues before dirty decisions.

## Design constraints

- Planning occurs after the frontend flushes applicable buffer/view queues; the plan is bound to tab and
  document revisions.
- The story adds one aggregate exported appmodel seam, `ApplyClose(CloseCommand)`, with Plan/Execute
  variants; target collection, authorization validation, save ordering, and final close helpers stay private.
- Apply ADR-0024: gather all choices and normalization authorizations before mutation; save in tab order;
  no close/discard before all saves.
- Resolve an external conflict before that document's requested save.
- Existing per-document save serialization and irreversible-write semantics are reused.
- Preserve appmodel authority, DD-62–64, Handler → Service → Repository, Result envelopes, adapter-only
  bridge imports, token theming, and offline behavior.

## Acceptance criteria

### STORY-044-AC-1
**Satisfies:** PH02-R07, PH02-R09

The backend close plan is created only after applicable working buffer and view queues are acknowledged and
uses the resulting dirty state.

### STORY-044-AC-2
**Satisfies:** PH02-R06, PH02-R07

The plan binds every requested target, including clean tabs, in authoritative order to tab/document
revisions, while requesting Save/Discard choices only for the dirty subset. (satisfies EC-DOCS-5 and
EC-TABS-3)

### STORY-044-AC-3
**Satisfies:** PH02-R06, PH02-R07

Cancel, a missing dirty choice, a stale plan, or a missing/cancelled mixed-line normalization authorization
is rejected before any save, discard, or close mutation.

### STORY-044-AC-4
**Satisfies:** PH02-R07, PH02-R10

For each requested save with an external conflict, Reload/Keep-mine resolution completes before the close
executor may write that document.

### STORY-044-AC-5
**Satisfies:** PH02-R06, PH02-R07, PH02-R09

All mixed-line confirmations and revision-bound authorizations are gathered before the first batch write;
any missing/cancelled authorization causes zero writes/closes. Requested saves then run in authoritative
tab order; the first failure stops, earlier saves remain clean, every tab remains open, and no discard is
applied.

### STORY-044-AC-6
**Satisfies:** PH02-R06, PH02-R07

Only after every required save succeeds are all requested targets—clean, successfully saved, and
discarded—closed in one validated operation and the deterministic surviving active tab or empty state
emitted.

## Test plan

- STORY-044-AC-1 — integration — `internal/appmodel/close_lifecycle_test.go` —
  `TestSTORY044AC1PlansFromFlushedDirtyState`.
- STORY-044-AC-2 — unit — `internal/appmodel/close_lifecycle_test.go` —
  `TestSTORY044AC2PlanBindsAllTargetsAndDirtyChoices_EC_DOCS_5_EC_TABS_3`.
- STORY-044-AC-3 — unit — `internal/appmodel/close_lifecycle_test.go` —
  `TestSTORY044AC3RejectsCancelIncompleteStaleOrMissingNormalizationBeforeMutation`.
- STORY-044-AC-4 — integration — `internal/appmodel/close_lifecycle_test.go` —
  `TestSTORY044AC4ResolvesExternalConflictBeforeCloseSave`.
- STORY-044-AC-5 — integration — `internal/appmodel/close_lifecycle_test.go` —
  `TestSTORY044AC5GathersNormalizationAndStopsFailedBatchWithoutClosing`.
- STORY-044-AC-6 — integration — `internal/appmodel/close_lifecycle_test.go` —
  `TestSTORY044AC6ClosesMixedCleanSavedAndDiscardedTargetsOnlyAfterAllSavesSucceed`.

## Definition of done

- [ ] Every AC and edge has passing explicit evidence.
- [ ] Adversarial tests cover Cancel, stale plan, incomplete choices, first/middle/last save failure, and
  external change during execution.
- [ ] No failure path partially closes or applies discard.
- [ ] Tests prove the one aggregate close seam and no sibling exported close command family.
- [ ] Missing/cancelled normalization authorization produces zero writes and zero closes.
- [ ] Backend race, formatting, vet, lint, and binding gates pass.
- [ ] Architecture, authority, adapter, token, and offline invariants hold.
- [ ] `just trace` and `just trace-check` pass.
- [ ] The module inventory is unchanged.
