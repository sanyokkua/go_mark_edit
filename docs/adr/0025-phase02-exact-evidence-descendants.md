# ADR-0025 — Restrict Phase 02 evidence descendants to exact artifacts and metadata fields

**Status:** accepted
**Date:** 2026-07-23
**Deciders:** project owner, architect
**Supersedes:** ADR-0023

## Context and problem statement

ADR-0023 allowed Phase 02 evidence metadata descendants by path, but its directory-wide evidence allowance
and story-file allowance were structurally too broad. A descendant could change unrelated evidence or weaken
STORY-051 acceptance criteria while remaining inside an allowed path. Exact-revision freshness must permit
the unavoidable evidence commit without permitting contract changes hidden in metadata files.

## Decision drivers

- Keep the exact tested revision independently verifiable.
- Permit only the two Phase 02 runtime/human artifacts required by PH02-E07 and PH02-E08.
- Allow STORY-051 lifecycle/evidence completion metadata without allowing its implementation contract to
  change.
- Fail closed on an allowed-path change that weakens ACs, dependencies, ADRs, or test mappings.
- Keep three-platform runtime and product-owner approval gates blocking.

## Considered options

- A. Retain ADR-0023's path-only allowance.
- B. Require the final evidence revision to equal `HEAD`.
- C. Permit exact files and validate invariant fields/content across every descendant.

## Decision outcome

Chosen: **Option C**.

Phase 02 evidence may cite an exact tested ancestor only when every descendant change is one of:

- `docs/phase-evidence/PH02-wails-runtime.md`;
- `docs/phase-evidence/PH02-tabs-approval.md`;
- STORY-051 lifecycle status or explicitly defined evidence metadata/checklist completion in
  `docs/stories/story-051-produce-phase02-completion-evidence.md`;
- `docs/stories/README.md` synchronization caused only by that STORY-051 lifecycle change; or
- generated `docs/traceability.yaml` changes caused only by those exact allowed metadata changes.

Across the tested revision and descendant, STORY-051's `spec_clauses`, `phase_requirements`, acceptance
criterion ids, AC text, `Satisfies:` mappings, dependencies, ADR citations, Test plan, Design constraints,
Goal, In scope, Out of scope, title, phase, owner, estimate, modules, and edge cases must be byte- or
semantically identical. Only lifecycle status and a schema-defined evidence checklist/result field may
change.

Validation inspects both changed paths and parsed content. It rejects:

- any other file under `docs/phase-evidence/`;
- any source, specification, ADR/policy, script, test, or other-story change;
- AC deletion, rewording, weakened assertion, or changed `Satisfies:` mapping inside the otherwise allowed
  STORY-051 path;
- dependency, ADR, test-plan/test-identity, module, clause, scope, design-constraint, or title changes;
- story-board changes not exactly implied by STORY-051's permitted lifecycle transition; and
- generated traceability changes not exactly reproduced from the allowed metadata state.

PH02-E07 still requires current exact evidence for macOS, Windows, and Linux. PH02-E08 still requires the
product owner's exact release-candidate approval. This policy records evidence; it waives neither row.

### Consequences

- Positive: evidence commits remain possible without granting a directory- or file-level contract bypass.
- Positive: allowed-path AC weakening and dependency/test-map drift are detected.
- Positive: unrelated evidence cannot inherit Phase 02 freshness.
- Negative: validation must compare parsed invariant fields and regenerate expected board/trace consequences.
- Neutral: evidence that names current `HEAD` remains valid.

## Pros and cons of the options

### Option A — Path-only allowance

- Good: simple validator.
- Bad: an allowed path can contain unrelated evidence or weakened contract content.

### Option B — Require current HEAD

- Good: no descendant comparison.
- Bad: a committed evidence record becomes self-invalidating.

### Option C — Exact artifacts plus content invariants

- Good: permits only unavoidable metadata while preserving the tested contract.
- Bad: requires adversarial structural and semantic comparison tests.

## Links

- Design decisions: DD-37, DD-62, DD-63, DD-64
- Spec clauses: `specification/06_Process_and_Traceability/06_DEFINITION_OF_DONE.md#phase-level-exit-criteria`,
  `specification/07_Phases/PHASE_02_FILE_IO_TABS.md#phase-exit-evidence`
- Stories: STORY-033, STORY-051
