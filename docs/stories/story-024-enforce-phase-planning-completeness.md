---
id: STORY-024
title: Enforce phase planning completeness
status: done
spec_clauses:
  - 06_Process_and_Traceability/02_STORY_FORMAT.md#front-matter-schema-copy-exactly
  - 06_Process_and_Traceability/03_TRACEABILITY.md#the-two-commands
  - 06_Process_and_Traceability/06_DEFINITION_OF_DONE.md#phase-level-exit-criteria
  - 07_Phases/PHASE_00_SCAFFOLD.md#phase-exit-checklist
phase_requirements:
  - PH00-R12
modules:
  - internal/application/
acceptance_criteria:
  - STORY-024-AC-1
  - STORY-024-AC-2
  - STORY-024-AC-3
  - STORY-024-AC-4
  - STORY-024-AC-5
  - STORY-024-AC-6
edge_cases: []
depends_on:
  - STORY-020
adrs: []
phase: 00
owner: coder
estimate: M
---

# STORY-024 — Enforce phase planning completeness

## Goal

Make phase and story plans complete enough that an implementation model receives every required outcome,
lifecycle boundary, dependency, consumer contract, failure path, and proving-evidence obligation before it
changes application code.

## In scope

- Define and validate a normative Markdown phase format with stable requirement and work-package ids.
- Extend story and generated-trace metadata from phase requirements through ACs and tests.
- Add structural and claimed-completion phase gates and include the structural gate in `just check`.
- Strengthen the canonical phase/story planning commands and their Codex wrappers.
- Clarify Phase 00–15 documents without making new product choices, and retrofit existing story metadata.

## Out of scope

- Phase 01 application defects owned by STORY-021–023.
- Resolving conflicts between accepted specification clauses without user direction and, where significant,
  a mutable ADR.
- Rewriting custom-agent prompts or implementing later-phase product behavior.

## Spec inputs

- `06_Process_and_Traceability/02_STORY_FORMAT.md#front-matter-schema-copy-exactly` — stories are the
  machine-readable implementation contract.
- `06_Process_and_Traceability/03_TRACEABILITY.md#the-two-commands` — generated traceability is the
  bidirectional conformance record and gate.
- `06_Process_and_Traceability/06_DEFINITION_OF_DONE.md#phase-level-exit-criteria` — phase completion is
  stronger than completion of each isolated story.
- `07_Phases/PHASE_00_SCAFFOLD.md#phase-exit-checklist` — Phase 00 owns the planning and validation
  toolchain needed by later phases.

## Design constraints

- Markdown remains the single readable authority; do not add a parallel phase manifest.
- Preserve permanent story/AC/edge ids and generate `docs/traceability.yaml`; never hand-edit it.
- A ready implementation story is S or M. L is a non-ready epic and must be split.
- Structural validation does not claim an unfinished phase is complete; completion validation requires
  done stories, AC tests, exact edge evidence, and durable runtime/human artifacts.
- This controlled clarification may update phase/process specification documents and done-story metadata
  only; it must not reinterpret product behavior or change done-story AC text.
- No network behavior, application runtime surface, Wails binding, database, or generated binding changes.

## Acceptance criteria

### STORY-024-AC-1
**Satisfies:** PH00-R12

`just phase-check` accepts all Phase 00–15 documents only when every mandatory ledger/table is structurally
complete, identifiers and source anchors resolve, phase dependencies are acyclic, requirements own work and
exit evidence, and every recorded edge case has exact evidence and exactly one primary phase owner; story
validation rejects reserved global ids in work packages and any implementation-ready L story.

### STORY-024-AC-2
**Satisfies:** PH00-R12

Story frontmatter declares `phase_requirements`, every AC declares the same mapping through
`**Satisfies:**`, and generated traceability indexes each phase requirement to its source clauses, stories,
ACs, and deduplicated proving tests; disagreement or an undefined requirement fails validation.

### STORY-024-AC-3
**Satisfies:** PH00-R12

`just phase-complete-check NN` rejects a claimed-complete phase when a requirement, transition, contract,
edge case, or exit item lacks done-story/AC/test evidence, or when required runtime/human evidence lacks an
existing artifact and approval owner.

### STORY-024-AC-4
**Satisfies:** PH00-R12

The Justfile exposes `phase-check` and parameterized `phase-complete-check`, and `just check` runs the
structural phase gate without asserting that unfinished phases are complete.

### STORY-024-AC-5
**Satisfies:** PH00-R12

Both canonical planning commands and Codex wrappers require inverse coverage, lifecycle/adversarial hazard
analysis, external-consumer proof, low-context implementation packets, strong final-postcondition tests,
durable manual evidence, independent skeptical/conformance review, and S/M implementation stories.

### STORY-024-AC-6
**Satisfies:** PH00-R12

Phase 00–15 documents use stable phase-local identifiers and capability dependencies, existing stories carry
metadata-only phase mappings, Phase 00 passes its completion check, and Phase 01 truthfully reports the
unresolved STORY-021–023 remediation requirements plus every recorded specification/evidence blocker.

## Test plan

- STORY-024-AC-1 — architecture — `internal/application/phase_validation_test.go` —
  `TestPhaseCheckerValidatesNormativePhaseDocuments`
- STORY-024-AC-2 — architecture — `internal/application/phase_validation_test.go` —
  `TestTraceabilityValidatesPhaseRequirementMappings`
- STORY-024-AC-3 — architecture — `internal/application/phase_validation_test.go` —
  `TestPhaseCompleteCheckerRequiresCoverageAndDurableEvidence`
- STORY-024-AC-4 — architecture — `internal/application/toolchain_test.go` —
  `TestJustfileExposesPhaseValidationGates`
- STORY-024-AC-5 — architecture — `internal/application/phase_validation_test.go` —
  `TestPlanningCommandsRequirePhaseAndStoryCompletenessGates`
- STORY-024-AC-6 — architecture — `internal/application/phase_validation_test.go` —
  `TestRepositoryPhaseMigrationIsCompleteAndTruthful`

## Definition of done

- [ ] Every AC has a passing test naming this story id on its first line.
- [ ] Validator fixture tests cover every required negative case from this story.
- [ ] `just phase-check`, story frontmatter validation, `just trace`, and `just trace-check` pass.
- [ ] `just phase-complete-check 00` passes.
- [ ] `just phase-complete-check 01` fails truthfully for STORY-021–023 and recorded specification/evidence blockers.
- [ ] `just check` and `git diff --check` pass.
- [ ] Phase/process clarifications introduce no product choice or application runtime change.
