---
id: STORY-008
title: Add quality tooling and traceability validation for the initial backlog
status: done
spec_clauses:
  - 04_Build_and_Release/03_CI_AND_HOOKS.md#1-justfile-command-taxonomy
  - 04_Build_and_Release/03_CI_AND_HOOKS.md#2-git-hooks-lefthook
  - 06_Process_and_Traceability/03_TRACEABILITY.md#the-two-commands
  - 06_Process_and_Traceability/04_ADR_FORMAT.md#template-copy-docsadrtemplatemd
modules:
  - internal/application/
acceptance_criteria:
  - STORY-008-AC-1
  - STORY-008-AC-2
  - STORY-008-AC-3
  - STORY-008-AC-4
edge_cases: []
depends_on:
  - STORY-007
adrs: []
phase: 00
owner: coder
estimate: M
---

# STORY-008 — Add quality tooling and traceability validation for the initial backlog

## Goal
Make the foundation reproducible and ensure future stories can prove their requirements without changing frozen ADR records.

## In scope
- Just recipes, Lefthook, CI skeleton, trace generator/checker, and validation of frozen initial ADR references.

## Out of scope
- Full packaging/release matrix, which belongs to Phases 10 and 15; authoring or editing ADR-0001…0006.

## Spec inputs
- `04_Build_and_Release/03_CI_AND_HOOKS.md#1-justfile-command-taxonomy` — provide shared commands.
- `06_Process_and_Traceability/03_TRACEABILITY.md#the-two-commands` — generate and validate the record.
- `06_Process_and_Traceability/04_ADR_FORMAT.md#template-copy-docsadrtemplatemd` — initial ADRs are frozen spec records.

## Design constraints
- Tooling follows generated-bindings → frontend → Go ordering; no CI task bypasses quality gates.
- `docs/traceability.yaml` is generated only. ADR-0001…0006 stay under `specification/08_Decisions/` and are never copied or edited.

## Acceptance criteria
### STORY-008-AC-1
`justfile` exposes the specified setup, dev, build, generation, formatting, lint, typecheck, test, verification, drift, security, trace, and composite-check commands.

### STORY-008-AC-2
Lefthook and the CI skeleton preserve generated-bindings → frontend → Go ordering and provide a green lint/type/test skeleton.

### STORY-008-AC-3
`just trace` generates documented trace maps from stories and `Proves:` tags, while `just trace-check` accepts the empty backlog and rejects stale, invalid, orphaned, or cyclic fixtures.

### STORY-008-AC-4
Initial ADR-0001…0006 are treated as frozen accepted records and are neither copied into `docs/adr/` nor edited.

## Test plan
Each named test begins with its matching `Proves: STORY-008-AC-N` tag.

- STORY-008-AC-1 — architecture — `internal/application/toolchain_test.go` — `TestJustfileExposesRequiredCommandTaxonomy`.
- STORY-008-AC-2 — architecture — `internal/application/toolchain_test.go` — `TestHooksAndCISkeletonPreserveBuildOrdering`.
- STORY-008-AC-3 — integration — `internal/application/traceability_test.go` — `TestTraceGeneratorBuildsExpectedMaps`.
- STORY-008-AC-3 — integration — `internal/application/traceability_test.go` — `TestTraceCheckRejectsInvalidFixturesAndAcceptsEmptyBacklog`.
- STORY-008-AC-4 — architecture — `internal/application/traceability_test.go` — `TestFrozenInitialADRsAreReferencedWithoutDuplication`.

## Definition of done
- [x] Every AC has a tagged proving test and CI runs the intended check set.
- [x] The trace record is generated, never hand-edited, and passes `just trace-check`.
- [x] Initial ADR files remain unchanged under the frozen specification.
