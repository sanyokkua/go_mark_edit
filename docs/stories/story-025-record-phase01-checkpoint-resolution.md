---
id: STORY-025
title: Record the Phase 01 checkpoint resolution
status: done
spec_clauses:
  - 00_Foundation/06_IMPLEMENTATION_STAGES.md#2-stage--phase-mapping
  - 00_Foundation/06_IMPLEMENTATION_STAGES.md#5-stage-exit-criteria
  - 07_Phases/00_ROADMAP.md#stages
  - 07_Phases/PHASE_01_CORE_EDITOR.md#requirement-ledger
  - 07_Phases/PHASE_01_CORE_EDITOR.md#phase-exit-evidence
  - 07_Phases/PHASE_01_CORE_EDITOR.md#open-specification-conflicts
phase_requirements:
  - PH01-R15
modules:
  - internal/application/
acceptance_criteria:
  - STORY-025-AC-1
  - STORY-025-AC-2
  - STORY-025-AC-3
  - STORY-025-AC-4
  - STORY-025-AC-5
  - STORY-025-AC-6
edge_cases: []
depends_on:
  - STORY-024
adrs:
  - ADR-0016
phase: 01
owner: coder
estimate: M
---

# STORY-025 — Record the Phase 01 checkpoint resolution

## Goal

Give maintainers one mutable, machine-checkable record of what the Phase 01 preview and editing
implementation checkpoints mean, while keeping full Phase 01 completion and deferred platform proof honest.

## In scope

- Add `docs/phase-resolutions/PH01.yaml` as the one repository-owned, versioned, machine-readable PH01-X01
  resolution record consumed by phase validation.
- Record exact preview/editing membership, the editing prerequisite, and full Phase 01 shared obligations.
- Record the exact PH01-E06 current-host exception schema, limitations, deferred targets, and expiry.
- Reject malformed, incomplete, or unresolved resolution-policy records.

## Out of scope

- Implementing checkpoint-aware completion validation, owned by STORY-026.
- Validating a live PH01-E06 record's revision, freshness, or expiry, owned by STORY-026.
- Producing native runtime, network, or visual evidence, owned by STORY-032.
- Editing the frozen stage mapping, roadmap, or Phase 01 specification.

## Spec inputs

- `00_Foundation/06_IMPLEMENTATION_STAGES.md#2-stage--phase-mapping` — preserve the split ownership of
  Phase 01 preview and editing capabilities.
- `00_Foundation/06_IMPLEMENTATION_STAGES.md#5-stage-exit-criteria` — never turn an implementation
  checkpoint into a complete product-stage claim.
- `07_Phases/00_ROADMAP.md#stages` — retain the recorded chronology conflict instead of rewriting it.
- `07_Phases/PHASE_01_CORE_EDITOR.md#requirement-ledger` — partition the exact permanent requirement ids.
- `07_Phases/PHASE_01_CORE_EDITOR.md#phase-exit-evidence` — scope the only temporary platform exception to
  PH01-E06.
- `07_Phases/PHASE_01_CORE_EDITOR.md#open-specification-conflicts` — resolve PH01-X01 through accepted
  ADR-0016 in mutable documentation.

## Design constraints

- `docs/phase-resolutions/PH01.yaml` is the sole mutable implementation-resolution artifact. Validators load
  this repository file in positive tests; negative fixtures are derived from it and cannot replace proof that
  the checked-in record is valid.
- ADR-0016 is binding: preview contains exactly PH01-R01,R02,R05,R08,R11,R12,R13,R14,R16; editing contains
  exactly PH01-R03,R04,R06,R07,R09,R10 and requires preview first; PH01-R15 is shared full-completion work.
- Use the terms **preview implementation checkpoint** and **editing implementation checkpoint**; neither is
  a complete Stage 1, Stage 2, milestone, release, or Phase 01 claim.
- Full Phase 01 additionally requires all PH01-T/C/EC/E obligations. The mutable record supplements the
  frozen sources and never edits or masks their stale conflicting table.
- The PH01-E06 exception must name host, revision/freshness, procedure/result, limitations, accepting
  ADR-0016, deferred Windows/Linux targets, and expiry before Phase 15 release or platform claims. No generic
  waiver exists.
- Preserve Handler → Service → Repository layering, concrete `apperr.*Result` envelopes, `internal/appmodel`
  authority with content-free `state:patch` projection and debounce-synced Monaco (DD-62–64, ADR-0014),
  adapter-only `wailsjs/`, token-only theming, and the scoped offline invariant.

The repository record uses exactly this version-1 top-level shape; STORY-026 fills the `coverage` mappings
without changing these keys or their meaning:

```yaml
schema: gomarkedit.phase-resolution
version: 1
phase: "01"
conflicts:
  PH01-X01:
    status: resolved
    accepted_adr: ADR-0016
checkpoints:
  preview:
    requirements: [PH01-R01, PH01-R02, PH01-R05, PH01-R08, PH01-R11, PH01-R12, PH01-R13, PH01-R14, PH01-R16]
    prerequisites: []
  editing:
    requirements: [PH01-R03, PH01-R04, PH01-R06, PH01-R07, PH01-R09, PH01-R10]
    prerequisites: [preview]
full_completion:
  shared_requirements: [PH01-R15]
  required_ids:
    transitions: [PH01-T01, PH01-T02, PH01-T03, PH01-T04, PH01-T05, PH01-T06, PH01-T07]
    contracts: [PH01-C01, PH01-C02, PH01-C03, PH01-C04, PH01-C05, PH01-C06]
    edge_cases: [EC-DOCS-12, EC-RENDER-4, EC-RENDER-5, EC-RENDER-6, EC-RENDER-7, EC-I18N-1, EC-I18N-2]
    evidence: [PH01-E01, PH01-E02, PH01-E03, PH01-E04, PH01-E05, PH01-E06, PH01-E07, PH01-E08, PH01-E09, PH01-E10, PH01-E11]
exception_policies:
  PH01-E06:
    kind: current-host-native
    accepted_adr: ADR-0016
    required_record_fields: [host, revision, freshness, procedure, result, limitations, deferred_platforms, accepted_adr, expires_before]
    allowed_deferred_platforms: [windows, linux]
    expiry_boundary: before-phase15-release-or-platform-claim
coverage:
  version: 1
  transitions: {}
  contracts: {}
  edge_cases: {}
  evidence: {}
```

## Acceptance criteria

### STORY-025-AC-1
**Satisfies:** PH01-R15

`docs/phase-resolutions/PH01.yaml` has schema `gomarkedit.phase-resolution`, version `1`, phase `"01"`,
resolves PH01-X01 through accepted ADR-0016, and records the preview implementation checkpoint as exactly
PH01-R01, PH01-R02, PH01-R05, PH01-R08, PH01-R11, PH01-R12, PH01-R13, PH01-R14, and PH01-R16.

### STORY-025-AC-2
**Satisfies:** PH01-R15

The record defines the editing implementation checkpoint as exactly PH01-R03, PH01-R04, PH01-R06,
PH01-R07, PH01-R09, and PH01-R10, and declares the preview implementation checkpoint as its prerequisite.

### STORY-025-AC-3
**Satisfies:** PH01-R15

The record's `full_completion` section names PH01-R15 as the shared requirement and enumerates exactly
PH01-T01–T07, PH01-C01–C06, all seven declared edge ids, and PH01-E01–E11 as required id sets.

### STORY-025-AC-4
**Satisfies:** PH01-R15

Validation rejects an unknown requirement id, duplicate membership, overlap, omission from the checkpoint
partition, placement of PH01-R15 in either checkpoint, or a missing editing prerequisite.

### STORY-025-AC-5
**Satisfies:** PH01-R15

The record's PH01-E06 `exception_policies` entry requires `host`, `revision`, `freshness`, `procedure`,
`result`, `limitations`, `deferred_platforms`, `accepted_adr`, and `expires_before`; it permits only Windows
and Linux deferral under ADR-0016 and cannot apply to another evidence row or certify a stage/release/platform.

### STORY-025-AC-6
**Satisfies:** PH01-R15

Policy validation rejects an unresolved PH01-X01 marker or a record that claims to replace the frozen source,
while accepting the mutable record as the implementation-resolution authority. Validation of a concrete
PH01-E06 record's revision, freshness, and expiry is deferred to STORY-026.

## Test plan

- STORY-025-AC-1 — architecture — `internal/application/phase_validation_test.go` —
  `TestRepositoryPhase01ResolutionHasVersionedConflictAndPreviewCheckpoint`.
- STORY-025-AC-2 — architecture — `internal/application/phase_validation_test.go` —
  `TestRepositoryPhase01ResolutionHasExactEditingCheckpointAndPrerequisite`.
- STORY-025-AC-3 — architecture — `internal/application/phase_validation_test.go` —
  `TestRepositoryPhase01ResolutionEnumeratesFullCompletionIDs`.
- STORY-025-AC-4 — architecture — `internal/application/phase_validation_test.go` —
  `TestPhase01ResolutionRejectsInvalidRequirementPartitions`.
- STORY-025-AC-5 — architecture — `internal/application/phase_validation_test.go` —
  `TestRepositoryPhase01ResolutionDefinesExactE06ExceptionPolicySchema`.
- STORY-025-AC-6 — architecture — `internal/application/phase_validation_test.go` —
  `TestPhase01ResolutionRejectsUnresolvedOrSourceReplacingPolicyRecords`.

## Definition of done

- [ ] Every AC has a passing test naming its `STORY-025-AC-N` id on the first leading-comment line.
- [ ] Positive tests load `docs/phase-resolutions/PH01.yaml`; derived negative fixtures prove the exact
  partition, prerequisite, full-completion set, versioned schema, and exception-policy schema.
- [ ] Policy validation does not certify a concrete PH01-E06 record's revision, freshness, or expiry; that
  live-evidence validation is deferred to STORY-026.
- [ ] No done story, frozen specification file, or generated traceability record is edited.
- [ ] Backend quality gates pass for `internal/application`; frontend gates remain unaffected.
- [ ] Handler layering, Result envelopes, backend authority, adapter-only Wails imports, token-only theming,
  and offline behavior remain intact.
- [ ] `just trace` is regenerated during implementation and `just trace-check` passes with zero orphans.
- [ ] The module inventory is unchanged.
