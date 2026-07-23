---
id: STORY-032
title: Produce Phase 01 completion evidence
status: ready
spec_clauses:
  - 06_Process_and_Traceability/06_DEFINITION_OF_DONE.md#phase-level-exit-criteria
  - 07_Phases/PHASE_01_CORE_EDITOR.md#state-and-transition-model
  - 07_Phases/PHASE_01_CORE_EDITOR.md#cross-phase-contracts
  - 07_Phases/PHASE_01_CORE_EDITOR.md#edge-and-failure-cases
  - 07_Phases/PHASE_01_CORE_EDITOR.md#phase-exit-evidence
  - mockups/README.md#role-in-the-spec
phase_requirements:
  - PH01-R01
  - PH01-R02
  - PH01-R03
  - PH01-R04
  - PH01-R05
  - PH01-R06
  - PH01-R07
  - PH01-R08
  - PH01-R09
  - PH01-R10
  - PH01-R11
  - PH01-R12
  - PH01-R13
  - PH01-R14
  - PH01-R15
  - PH01-R16
modules:
  - internal/application/
acceptance_criteria:
  - STORY-032-AC-1
  - STORY-032-AC-2
  - STORY-032-AC-3
  - STORY-032-AC-4
  - STORY-032-AC-5
  - STORY-032-AC-6
edge_cases: []
depends_on:
  - STORY-026
  - STORY-027
  - STORY-028
  - STORY-029
  - STORY-030
  - STORY-031
adrs:
  - ADR-0014
  - ADR-0016
  - ADR-0017
  - ADR-0018
  - ADR-0019
phase: 01
owner: coder
estimate: M
---

# STORY-032 — Produce Phase 01 completion evidence

## Goal

Assemble fresh, revision-bound automated, native-runtime, and human-approved visual proof so the
Phase 01 checkpoints and full completion gate report exactly what has and has not been certified.

## In scope

- Run and record all PH01-E01 through PH01-E11 procedures at one exact repository revision.
- Produce current-host packaged/native evidence under the exact ADR-0016 PH01-E06 exception.
- Record the accepted ADR-0018 exemption that removes only the manual PH01-E08 packet-capture procedure
  from the completion gate.
- Present a deterministic 1280×720 visual candidate for human approval without self-approving it.
- Run checkpoint, full quality, traceability, and Phase 01 completion gates.

## Out of scope

- Implementing missing product behavior or weakening a failing gate.
- Claiming Windows/Linux, Stage 1/2, milestone, or release completion from current macOS-only proof.
- Approving the visual baseline on behalf of the product owner.
- Editing frozen specification or hand-editing generated traceability.

## Spec inputs

- `06_Process_and_Traceability/06_DEFINITION_OF_DONE.md#phase-level-exit-criteria` — require integrated,
  current, owned automated/runtime/human evidence.
- `07_Phases/PHASE_01_CORE_EDITOR.md#state-and-transition-model` — exercise all seven ordered transitions.
- `07_Phases/PHASE_01_CORE_EDITOR.md#cross-phase-contracts` — prove all six producer/consumer seams.
- `07_Phases/PHASE_01_CORE_EDITOR.md#edge-and-failure-cases` — retain exact named evidence for every edge.
- `07_Phases/PHASE_01_CORE_EDITOR.md#phase-exit-evidence` — produce PH01-E01 through PH01-E11 at their
  declared tier, scope, owner, and freshness.
- `mockups/README.md#role-in-the-spec` — treat the deterministic screenshot as a candidate requiring human
  acceptance, not an automatically approved baseline.

## Design constraints

- All records name one exact revision, command/procedure, timestamp/freshness, host/platform, result,
  limitations, and evidence owner. A rerun at another revision creates/refreshed evidence; it does not reuse a
  stale claim.
- PH01-E06 may use current macOS native/package evidence only through ADR-0016's exact exception: record host,
  deferred Windows/Linux proof, limitations, ADR, and expiry before any Phase 15 release/platform claim.
- ADR-0019 permits E06/E07 to cite an ancestor tested revision only when every intervening committed path is
  Phase evidence metadata, this STORY-032 record, or generated traceability; a source or policy change remains stale.
- The 1280×720 candidate is deterministic and preserves the approved crop if the owner accepts it. The agent
  never self-approves or silently replaces a baseline.
- ADR-0018 removes only PH01-E08's manual packet-capture evidence. The Stage 1/2 offline-by-design
  invariant, bundled assets, and existing automated regression coverage remain unchanged; this does not
  introduce a generic all-stage no-socket rule.
- `internal/application/phase_validation_test.go` reads the checked-in PH01-E06 artifact and validates its
  revision, procedure, owner/scope, result, and limitations. PH01-E08 has no manual artifact under ADR-0018;
  its exemption is validated from the narrow resolution policy. Durable artifacts supplement, rather than
  replace, collected `Proves:` tests.
- PH01-E01–E11, transition, contract, and edge completeness is evaluated from the authoritative version-1
  `coverage` section in `docs/phase-resolutions/PH01.yaml`, never reconstructed from requirement coverage.
- Run `just trace`, never edit `docs/traceability.yaml`; then run `just trace-check`, checkpoint gates,
  `just phase-complete-check 01`, and applicable full quality/UI gates.
- Preserve Handler → Service → Repository, `apperr.*Result`, backend authority/content-free Redux/event state
  with debounce-synced Monaco (DD-62–64, ADR-0014), adapter-only `wailsjs/`, token-only theming, and offline
  behavior.

## Acceptance criteria

### STORY-032-AC-1
**Satisfies:** PH01-R01, PH01-R03, PH01-R04, PH01-R06, PH01-R07, PH01-R08, PH01-R11, PH01-R13

PH01-E06 records a packaged/native run on the current macOS host at the exact tested revision, including the
procedure, results, limitations, ADR-0016 exception, deferred Windows/Linux proof, and pre-Phase-15 expiry;
a collected architecture test reads and validates the repository artifact against the resolution policy and
the narrow ADR-0019 tested-revision rule.

### STORY-032-AC-2
**Satisfies:** PH01-R11

PH01-E08's manual packet-capture artifact, clean-host/VM procedure, security-reviewer sign-off, and digest
are exempt only from the Phase 01 completion gate through ADR-0018; a collected architecture test accepts
their absence only with the exact, narrow resolution policy. The Stage 1/2 offline-by-design invariant and
its existing automated regression coverage remain required.

### STORY-032-AC-3
**Satisfies:** PH01-R08, PH01-R13

A deterministic 1280×720 screenshot candidate and responsive-width results are presented to the product
owner; PH01-E07 is complete only after the owner explicitly approves the named revision/crop, subject to
the same narrow ADR-0019 tested-revision rule.

### STORY-032-AC-4
**Satisfies:** PH01-R01, PH01-R02, PH01-R03, PH01-R04, PH01-R05, PH01-R06, PH01-R07, PH01-R08, PH01-R09, PH01-R10, PH01-R11, PH01-R12, PH01-R13, PH01-R14, PH01-R16

PH01-E01–E05, PH01-E09, and PH01-E11 run at the exact evidence revision and pass using the authoritative
`docs/phase-resolutions/PH01.yaml` row map, including its exact AC/edge mappings and the race, Jest,
responsive UI, import-boundary, i18n, quality, and traceability checks.

### STORY-032-AC-5
**Satisfies:** PH01-R15

The preview implementation checkpoint, then editing implementation checkpoint, then full
`just phase-complete-check 01` are run in order; each result identifies its exact obligation set and no
checkpoint is reported as a complete product stage.

### STORY-032-AC-6
**Satisfies:** PH01-R14, PH01-R15

An evidence audit rejects stale/mismatched revisions, missing owner/approval, omitted transition/contract/edge
rows, expired or overbroad exceptions, and unproved deferred platforms, and reports the remaining limitations
without converting them into a waiver.

## Test plan

- STORY-032-AC-1 — architecture — `internal/application/phase_validation_test.go` —
  `TestPhase01E06ArtifactProvesCurrentHostRuntimeUnderAcceptedException` and
  `TestPhase01EvidenceMetadataCommitAcceptsOnlyAllowlistedAncestorRevisions`; additional durable output:
  `docs/phase-evidence/PH01-wails-runtime.md` (`PH01 E06 current-host packaged native procedure and result`).
- STORY-032-AC-2 — architecture — `internal/application/phase_validation_test.go` —
  `TestPhase01E08ManualCaptureExemptionRequiresADR0018Policy`.
- STORY-032-AC-3 — human/e2e-smoke — `frontend/e2e/core-editor.test.ts` and
  `docs/phase-evidence/PH01-visual-approval.md` —
  `test('STORY-032-AC-3 presents deterministic 1280x720 candidate for owner approval')`.
- STORY-032-AC-4 — architecture — `internal/application/phase_validation_test.go` —
  `TestPhase01AutomatedExitEvidenceConsumesAuthoritativeRowMap`.
- STORY-032-AC-5 — architecture — `internal/application/phase_validation_test.go` —
  `TestPhase01CheckpointAndFullGateEvidenceOrder`.
- STORY-032-AC-6 — architecture — `internal/application/phase_validation_test.go` —
  `TestPhase01EvidenceAuditRejectsStaleIncompleteOrOverbroadClaims`.

## Definition of done

- [ ] Every AC has a collected passing test naming its `STORY-032-AC-N`; runtime/human evidence additionally
  has the exact durable artifact and named owner above.
- [ ] PH01-E01 through PH01-E11, PH01-T01–T07, PH01-C01–C06, and every declared edge case have exact fresh
  evidence at one revision.
- [ ] Current-host PH01-E06 records deferred platforms and expiry; no cross-platform/release claim is made.
- [ ] The product owner, not the agent, explicitly approves the named 1280×720 candidate/crop.
- [ ] Full formatting, lint, typecheck, race-enabled tests, `just verify-ui`, and offline/network checks pass.
- [ ] `just trace` regenerates the record; `just trace-check`, checkpoint gates, and
  `just phase-complete-check 01` pass at the evidenced revision.
- [ ] Handler/envelope/state/adapter/theme/offline invariants remain intact; the module inventory is unchanged.
