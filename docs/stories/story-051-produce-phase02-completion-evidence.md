---
id: STORY-051
title: Produce Phase 02 completion evidence
status: draft
spec_clauses:
  - 06_Process_and_Traceability/06_DEFINITION_OF_DONE.md#phase-level-exit-criteria
  - 07_Phases/PHASE_02_FILE_IO_TABS.md#state-and-transition-model
  - 07_Phases/PHASE_02_FILE_IO_TABS.md#cross-phase-contracts
  - 07_Phases/PHASE_02_FILE_IO_TABS.md#edge-and-failure-cases
  - 07_Phases/PHASE_02_FILE_IO_TABS.md#phase-exit-evidence
  - mockups/README.md#role-in-the-spec
phase_requirements:
  - PH02-R01
  - PH02-R02
  - PH02-R03
  - PH02-R04
  - PH02-R05
  - PH02-R06
  - PH02-R07
  - PH02-R08
  - PH02-R09
  - PH02-R10
  - PH02-R11
  - PH02-R12
  - PH02-R13
modules:
  - internal/application/
acceptance_criteria:
  - STORY-051-AC-1
  - STORY-051-AC-2
  - STORY-051-AC-3
  - STORY-051-AC-4
  - STORY-051-AC-5
  - STORY-051-AC-6
edge_cases: []
depends_on:
  - STORY-033
  - STORY-034
  - STORY-035
  - STORY-036
  - STORY-037
  - STORY-038
  - STORY-039
  - STORY-040
  - STORY-041
  - STORY-042
  - STORY-043
  - STORY-044
  - STORY-045
  - STORY-046
  - STORY-047
  - STORY-048
  - STORY-049
  - STORY-050
adrs:
  - ADR-0014
  - ADR-0017
  - ADR-0024
  - ADR-0025
phase: 02
owner: coder
estimate: M
---

# STORY-051 — Produce Phase 02 completion evidence

## Goal

Assemble exact-revision automated, responsive, native-platform, and product-owner proof that the complete
Phase 02 file and tab lifecycle works without borrowing green labels from incomplete rows.

## In scope

- Map and validate every Phase 02 transition, contract, primary edge, and PH02-E01 through PH02-E09 row.
- Produce exact-revision macOS, Windows, Linux, and human approval records.
- Run all quality, UI, traceability, and Phase 02 completion gates.

## Out of scope

- Implementing missing behavior or weakening a failing gate.
- Self-approving product-owner evidence.
- Claiming a platform or release without its exact current evidence.
- Editing frozen specification or generated traceability by hand.

## Spec inputs

- `06_Process_and_Traceability/06_DEFINITION_OF_DONE.md#phase-level-exit-criteria` — require complete
  requirement/lifecycle/runtime/human proof.
- `07_Phases/PHASE_02_FILE_IO_TABS.md#state-and-transition-model` — prove PH02-T01 through PH02-T08.
- `07_Phases/PHASE_02_FILE_IO_TABS.md#cross-phase-contracts` — prove PH02-C01 through PH02-C05.
- `07_Phases/PHASE_02_FILE_IO_TABS.md#edge-and-failure-cases` — prove every primary edge explicitly.
- `07_Phases/PHASE_02_FILE_IO_TABS.md#phase-exit-evidence` — produce PH02-E01 through PH02-E09 at exact
  tier, scope, owner, and freshness.
- `mockups/README.md#role-in-the-spec` — present, but never self-approve, the tab/title candidate.

## Design constraints

- The Phase 02 resolution coverage map is authoritative for exact transition, contract, edge, evidence,
  AC, test, module, and artifact mappings; aggregate requirement coverage is insufficient.
- Automated records name current revision. PH02-E07 has real native runs on macOS, Windows, and Linux at
  that exact tested revision (or its ADR-0025-permitted metadata descendant); no current-host exception
  exists. PH02-E08 has explicit product-owner approval for the exact release candidate.
- ADR-0025 permits an exact tested ancestor only for the exact PH02 runtime/approval artifacts,
  schema-defined STORY-051 lifecycle/evidence completion metadata, and exactly implied board/generated-trace
  consequences. All STORY-051 clauses, requirements, AC ids/text/mappings, dependencies, ADRs, tests,
  design, goal/scope, modules, edges, title, phase, owner, and estimate remain invariant.
- Runtime/human artifacts record revision, date, platform/scope, procedure, result, limitations, and owner.
- The agent cannot self-approve PH02-E08 or substitute a screenshot test for platform runtime evidence.
- Run `just trace`; never edit `docs/traceability.yaml` directly.
- Preserve Handler → Service → Repository, Result envelopes, backend authority/content-free projection and
  debounce-synced Monaco (DD-62–64, ADR-0014), adapter-only `wailsjs/`, token-only theming, and offline.

## Acceptance criteria

### STORY-051-AC-1
**Satisfies:** PH02-R01, PH02-R02, PH02-R03, PH02-R04, PH02-R08, PH02-R09, PH02-R10

PH02-E01, PH02-E02, and PH02-E04 resolve at the exact evidence revision through collected tests for
immediate-edit save, atomic failures, byte round trips, read-only safety, dirty close, autosave, and external
changes.

### STORY-051-AC-2
**Satisfies:** PH02-R05, PH02-R06

PH02-E03 resolves through backend tab command tests and accessible responsive TabBar tests at 375, 768, and
1280 pixels, including every declared tab edge.

### STORY-051-AC-3
**Satisfies:** PH02-R11, PH02-R12, PH02-R13

PH02-E05, PH02-E06, and PH02-E09 prove window titles, the dialog/OS/drop/tree open-precedence matrix, and
focus/save external-choice state against the accepted resolution revision.

### STORY-051-AC-4
**Satisfies:** PH02-R01, PH02-R02, PH02-R03, PH02-R05, PH02-R07, PH02-R08, PH02-R11

PH02-E07 records successful real Wails runtime procedures on macOS, Windows, and Linux for one exact tested
revision; only ADR-0025-permitted exact-artifact and invariant-contract descendants remain fresh, and any
missing, stale, or different-platform record keeps completion blocked.

### STORY-051-AC-5
**Satisfies:** PH02-R06, PH02-R07, PH02-R11

PH02-E08 is complete only when the product owner explicitly approves the named native tab/dirty/title
release candidate revision; an agent-generated, stale, or non-ADR-0025 descendant approval is rejected and
the gate remains blocking.

### STORY-051-AC-6
**Satisfies:** PH02-R01, PH02-R02, PH02-R03, PH02-R04, PH02-R05, PH02-R06, PH02-R07, PH02-R08, PH02-R09, PH02-R10, PH02-R11, PH02-R12, PH02-R13

An audit rejects any missing/stale requirement, transition, contract, primary edge, evidence row, conflict
resolution, owner, artifact, unrelated evidence edit, or ADR-0025-disallowed path/content mutation, and
`just check`, `just verify-ui`, `just trace-check`, `just phase-check`, and
`just phase-complete-check 02` all pass at the evidenced revision.

## Test plan

- STORY-051-AC-1 — architecture — `internal/application/phase_validation_test.go` —
  `TestSTORY051AC1Phase02FileSafetyAndLifecycleEvidence`.
- STORY-051-AC-2 — architecture/e2e-smoke — `internal/application/phase_validation_test.go` and
  `frontend/e2e/phase02-runtime.spec.ts` —
  `TestSTORY051AC2Phase02TabEvidence` / `test('STORY-051-AC-2 responsive tab evidence')`.
- STORY-051-AC-3 — architecture — `internal/application/phase_validation_test.go` —
  `TestSTORY051AC3Phase02ResolvedMatrixEvidence`.
- STORY-051-AC-4 — architecture/real-runtime — `internal/application/phase_validation_test.go` and
  `docs/phase-evidence/PH02-wails-runtime.md` —
  `TestSTORY051AC4Phase02RuntimePlatformMatrix`.
- STORY-051-AC-5 — architecture/human — `internal/application/phase_validation_test.go` and
  `docs/phase-evidence/PH02-tabs-approval.md` —
  `TestSTORY051AC5Phase02ProductOwnerApproval`.
- STORY-051-AC-6 — architecture — `internal/application/phase_validation_test.go` —
  `TestSTORY051AC6RejectsIncompleteExactArtifactOrInvariantContractDescendants`.

## Definition of done

- [ ] Every AC has collected passing evidence at the exact revision.
- [ ] PH02-T01–T08, PH02-C01–C05, every primary edge, and PH02-E01–E09 have exact mapped proof.
- [ ] macOS, Windows, and Linux real-runtime records exist at the current revision; no host waiver is used.
- [ ] The product owner explicitly approves the exact native release candidate.
- [ ] Full formatting, lint, typecheck, race tests, `just verify-ui`, and architecture/offline checks pass.
- [ ] `just trace` regenerates the record; `just trace-check`, `just phase-check`, and
  `just phase-complete-check 02` pass.
- [ ] Architecture, state, adapter, theme, and offline invariants remain intact.
- [ ] The module inventory is unchanged.
