---
id: STORY-033
title: Record and validate Phase 02 lifecycle resolutions
status: ready
spec_clauses:
  - 06_Process_and_Traceability/02_STORY_FORMAT.md#front-matter-schema-copy-exactly
  - 06_Process_and_Traceability/03_TRACEABILITY.md#phase-commands
  - 06_Process_and_Traceability/06_DEFINITION_OF_DONE.md#phase-level-exit-criteria
  - 06_Process_and_Traceability/07_PHASE_FORMAT.md#open-specification-conflicts
  - 07_Phases/PHASE_00_SCAFFOLD.md#phase-exit-checklist
  - 07_Phases/PHASE_02_FILE_IO_TABS.md#open-specification-conflicts
  - 07_Phases/PHASE_02_FILE_IO_TABS.md#phase-exit-evidence
phase_requirements:
  - PH00-R12
modules:
  - internal/application/
acceptance_criteria:
  - STORY-033-AC-1
  - STORY-033-AC-2
  - STORY-033-AC-3
  - STORY-033-AC-4
  - STORY-033-AC-5
edge_cases: []
depends_on:
  - STORY-024
  - STORY-026
adrs:
  - ADR-0024
  - ADR-0025
phase: 00
owner: coder
estimate: M
---

# STORY-033 — Record and validate Phase 02 lifecycle resolutions

## Goal

Extend the repository's phase-planning toolchain with one machine-checkable Phase 02 policy and evidence map
without misrepresenting policy validation as proof that file or tab behavior exists.

## In scope

- Add the mutable Phase 02 resolution record for PH02-X01 through PH02-X04.
- Generalize phase-resolution validation without weakening the Phase 01 policy.
- Validate exact row, ADR, AC, test, and artifact mappings used by Phase 02 completion.
- Validate the narrow ADR-0025 exact-artifact and invariant-contract descendant policy.

## Out of scope

- Implementing document, tab, prompt, or autosave behavior.
- Satisfying any Phase 02 product requirement through this tooling story.
- Producing Phase 02 runtime or product-owner evidence, owned by STORY-051.
- Editing the frozen Phase 02 document.

## Spec inputs

- `06_Process_and_Traceability/02_STORY_FORMAT.md#front-matter-schema-copy-exactly` — keep tooling work mapped
  to its owning Phase 00 requirement rather than borrowing Phase 02 product coverage.
- `06_Process_and_Traceability/03_TRACEABILITY.md#phase-commands` — preserve the distinction between
  structural phase validation and completion proof.
- `06_Process_and_Traceability/06_DEFINITION_OF_DONE.md#phase-level-exit-criteria` — require exact
  lifecycle and durable evidence in addition to policy records.
- `06_Process_and_Traceability/07_PHASE_FORMAT.md#open-specification-conflicts` — resolve conflicts only
  through an accepted mutable decision and fail completion while unresolved.
- `07_Phases/PHASE_00_SCAFFOLD.md#phase-exit-checklist` — keep phase-planning and validation tooling owned by
  PH00-R12.
- `07_Phases/PHASE_02_FILE_IO_TABS.md#open-specification-conflicts` — cover PH02-X01 through PH02-X04 and
  their exact blocked requirements.
- `07_Phases/PHASE_02_FILE_IO_TABS.md#phase-exit-evidence` — require all nine exact evidence rows and their
  declared automated/runtime/human owners.

## Design constraints

- ADR-0024 is the complete policy authority for the four conflict rows; ADR-0025 is the complete Phase 02
  evidence-descendant freshness exception. Both must be accepted and named exactly.
- Validation must require exact Phase 02 requirements, transition/contract/edge/evidence rows, accepting
  ADR, mapped ACs/tests, and required artifact paths; unknown, duplicate, stale, or omitted entries fail.
- STORY-033 ACs prove PH00-R12 tooling only. They cannot populate Phase 02 requirement coverage or substitute
  for product ACs/tests.
- ADR-0025 permits only the exact PH02 runtime/approval artifacts, schema-defined STORY-051
  lifecycle/evidence completion metadata, and exactly implied board/generated-trace consequences. Every
  STORY-051 contract field remains byte/semantically invariant; PH02-E07 and PH02-E08 remain blocking.
- Existing Phase 01 parsing, checkpoint semantics, evidence exceptions, and adversarial fixtures remain
  unchanged.
- Preserve Handler → Service → Repository, concrete `apperr.*Result` envelopes, backend-authoritative
  `internal/appmodel` with content-free `state:patch` and debounce-synced Monaco (DD-62–64, ADR-0014),
  adapter-only `wailsjs/`, token-only theming, and Stage-2 zero-network behavior.

## Acceptance criteria

### STORY-033-AC-1
**Satisfies:** PH00-R12

The checked-in Phase 02 resolution record marks PH02-X01 through PH02-X04 resolved by accepted ADR-0024 and
records its exact open/suffix, byte/normalization authorization, gather-before-mutate close, read-only
reload, and writable Reload/Keep-mine policies without claiming product implementation.

### STORY-033-AC-2
**Satisfies:** PH00-R12

Phase-resolution validation accepts the repository record only when its phase, conflict ids, accepted
ADR-0024, affected requirements, product ACs/tests, and required artifacts match every Phase 02 requirement,
transition, contract, primary edge, and evidence ledger row exactly.

### STORY-033-AC-3
**Satisfies:** PH00-R12

Validation rejects an unknown, duplicate, missing, unresolved, stale, contradictory, or STORY-033-as-product
Phase 02 mapping and reports the precise invalid row.

### STORY-033-AC-4
**Satisfies:** PH00-R12

Phase 01 resolution, checkpoint, exception, and completion fixtures retain their existing accepted outcomes
after Phase 02 support and the independently narrow ADR-0025 policy are added.

### STORY-033-AC-5
**Satisfies:** PH00-R12

`just phase-complete-check 02` accepts an exact tested ancestor only when descendants change
`PH02-wails-runtime.md`, `PH02-tabs-approval.md`, permitted STORY-051 evidence metadata, and their exact
board/trace consequences; it rejects unrelated evidence and adversarial allowed-path AC weakening,
dependency/ADR/test-map/contract mutations, source/policy/other-story changes, and still blocks without
macOS/Windows/Linux PH02-E07 and product-owner PH02-E08 proof.

## Test plan

- STORY-033-AC-1 — architecture — `internal/application/phase_validation_test.go` —
  `TestSTORY033AC1RepositoryPhase02Resolution`.
- STORY-033-AC-2 — architecture — `internal/application/phase_validation_test.go` —
  `TestSTORY033AC2Phase02ResolutionExactMappings`.
- STORY-033-AC-3 — architecture — `internal/application/phase_validation_test.go` —
  `TestSTORY033AC3RejectsAdversarialPhase02Resolutions`.
- STORY-033-AC-4 — architecture — `internal/application/phase_validation_test.go` —
  `TestSTORY033AC4PreservesPhase01ResolutionValidation`.
- STORY-033-AC-5 — architecture — `internal/application/phase_validation_test.go` —
  `TestSTORY033AC5ValidatesExactPhase02ArtifactsAndStoryContractInvariants`.

## Definition of done

- [ ] Every AC has a passing architecture test naming its `STORY-033-AC-N` id.
- [ ] Positive tests read the checked-in Phase 02 record; derived negative fixtures cover every rejected
  mutation without replacing repository proof.
- [ ] Phase 01 checkpoint and completion validation remains green.
- [ ] No frozen source or generated traceability file is edited by hand.
- [ ] Backend quality gates pass for `internal/application/`.
- [ ] Architecture, adapter, theming, and offline invariants remain intact.
- [ ] `just trace` is regenerated during implementation and `just trace-check` passes.
- [ ] The module inventory is unchanged.
