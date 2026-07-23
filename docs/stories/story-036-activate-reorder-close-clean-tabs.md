---
id: STORY-036
title: Activate reorder and close clean tabs through revisioned commands
status: draft
spec_clauses:
  - 01_Product/03_FILES_TABS_WORKSPACE.md#tabs
  - 02_Architecture/02_BACKEND_GO.md#application-model
  - 07_Phases/PHASE_02_FILE_IO_TABS.md#state-and-transition-model
  - 07_Phases/PHASE_02_FILE_IO_TABS.md#cross-phase-contracts
phase_requirements:
  - PH02-R05
  - PH02-R06
  - PH02-R09
modules:
  - internal/appmodel/
  - internal/apperr/
acceptance_criteria:
  - STORY-036-AC-1
  - STORY-036-AC-2
  - STORY-036-AC-3
  - STORY-036-AC-4
  - STORY-036-AC-5
  - STORY-036-AC-6
edge_cases:
  - EC-TABS-5
  - EC-TABS-6
  - EC-TABS-7
depends_on:
  - STORY-019
  - STORY-021
  - STORY-028
  - STORY-035
adrs:
  - ADR-0014
  - ADR-0017
  - ADR-0021
phase: 02
owner: coder
estimate: M
---

# STORY-036 — Activate reorder and close clean tabs through revisioned commands

## Goal

Switch, reorder, and close clean tabs without stale commands corrupting order or late content replacing the
wrong active editor.

## In scope

- Add revision-guarded activation, reorder, and clean-close commands.
- Return the active-buffer acknowledgement and support a true empty state.
- Define deterministic focus after close.

## Out of scope

- Dirty close planning, owned by STORY-044.
- Frontend tab controls, owned by STORY-041.
- External reload, owned by STORY-038.

## Spec inputs

- `01_Product/03_FILES_TABS_WORKSPACE.md#tabs` — preserve order, focus, close, and empty-state semantics.
- `02_Architecture/02_BACKEND_GO.md#application-model` — mutate the authoritative tab set under appmodel.
- `07_Phases/PHASE_02_FILE_IO_TABS.md#state-and-transition-model` — implement PH02-T05/T07 stale-command
  preservation.
- `07_Phases/PHASE_02_FILE_IO_TABS.md#cross-phase-contracts` — expose stable tab identity to downstream
  producers and consumers.

## Design constraints

- Commands validate expected tab-set revision and document identity before mutation.
- The story adds one aggregate exported appmodel seam, `ApplyTabCommand(TabCommand)`, with discriminated
  Activate/Reorder/CloseClean variants; validation, selection, and acknowledgement helpers remain private.
- Activation returns ADR-0021's identity/revision/content acknowledgement; patches remain content-free.
- Closing the final tab produces optional active-document/active-buffer fields, never a phantom.
- Appmodel remains the owner (DD-62–64, ADR-0014); adapter queue ordering is consumed later by STORY-039.
- Bound handlers use concrete Result envelopes, panic recovery, no bound context, and composition-root wiring.
- Preserve adapter-only `wailsjs/`, token-only theming, and zero network.

## Acceptance criteria

### STORY-036-AC-1
**Satisfies:** PH02-R05, PH02-R09

**Given** the expected tab revision, **when** a tab is activated, **then** the backend returns an active-buffer
acknowledgement containing the target identity and accepted content revision.

### STORY-036-AC-2
**Satisfies:** PH02-R05, PH02-R06

**Given** the expected tab revision and a permutation containing each current tab exactly once, **when**
reorder is commanded, **then** the backend commits that order and increments the tab revision.

### STORY-036-AC-3
**Satisfies:** PH02-R05, PH02-R06

A stale activation, reorder, or close command is rejected with a typed conflict result and leaves active
identity and tab order unchanged. (satisfies EC-TABS-7)

### STORY-036-AC-4
**Satisfies:** PH02-R05, PH02-R06

Closing a clean active tab selects the next tab at the same index when available, otherwise the preceding
tab, and emits one backend-confirmed patch.

### STORY-036-AC-5
**Satisfies:** PH02-R06

Closing the final clean tab yields an empty tab order and absent active document/buffer without panic.
(satisfies EC-TABS-5)

### STORY-036-AC-6
**Satisfies:** PH02-R05, PH02-R06, PH02-R09

Activation, reorder, keyboard-equivalent close, and middle-click-equivalent close use the same revisioned
backend commands and ordinary patches never contain document text. (satisfies EC-TABS-6)

## Test plan

- STORY-036-AC-1 — unit — `internal/appmodel/tab_lifecycle_test.go` —
  `TestSTORY036AC1ActivationReturnsBoundAcknowledgement`.
- STORY-036-AC-2 — unit — `internal/appmodel/tab_lifecycle_test.go` —
  `TestSTORY036AC2ReorderAcceptsExactPermutation`.
- STORY-036-AC-3 — unit — `internal/appmodel/tab_lifecycle_test.go` —
  `TestSTORY036AC3RejectsStaleTabCommands_EC_TABS_7`.
- STORY-036-AC-4 — unit — `internal/appmodel/tab_lifecycle_test.go` —
  `TestSTORY036AC4CleanCloseSelectsNearestTab`.
- STORY-036-AC-5 — unit — `internal/appmodel/tab_lifecycle_test.go` —
  `TestSTORY036AC5FinalCloseProducesEmptyState_EC_TABS_5`.
- STORY-036-AC-6 — integration — `internal/appmodel/tab_lifecycle_test.go` —
  `TestSTORY036AC6TabCommandsRemainContentFree_EC_TABS_6`.

## Definition of done

- [ ] Every AC and edge has a passing test with exact evidence markers.
- [ ] Race tests cover concurrent revisioned tab commands.
- [ ] Tests prove the one aggregate tab-command seam and no sibling exported mutation family.
- [ ] Activation/reload acknowledgement DTOs and zero-state Result envelopes are generated without drift.
- [ ] No ordinary patch contains document content.
- [ ] Backend quality gates pass.
- [ ] Layering, authority, adapter, theme, and offline invariants hold.
- [ ] `just trace` and `just trace-check` pass.
- [ ] The module inventory is unchanged.
