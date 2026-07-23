# ADR-0019 — Permit an evidence-metadata commit after the tested revision

**Status:** accepted
**Date:** 2026-07-23
**Deciders:** product owner
**Supersedes:** (none)

## Context and problem statement

Phase evidence must name the exact tested Git revision. Committing the evidence record after the native run
creates a later commit that contains only the record, story lifecycle state, and generated traceability. A
validator that requires the record revision to equal current `HEAD` makes a committed evidence record stale
by construction.

## Decision drivers

- Keep the evidence revision exact and independently inspectable.
- Permit committed Phase 01 evidence without allowing source changes after the tested revision.
- Keep the permitted metadata-only delta explicit and narrow.

## Considered options

- A. Leave final evidence uncommitted.
- B. Require the record revision to equal current `HEAD`.
- C. Accept an ancestor revision only when every later change is Phase 01 evidence metadata, STORY-032
  lifecycle state, or generated traceability.

## Decision outcome

Chosen: **Option C**. Phase 01 evidence may cite an exact ancestor revision when the current `HEAD` differs
only by `docs/phase-evidence/`, `docs/stories/story-032-produce-phase01-completion-evidence.md`, and
`docs/traceability.yaml`. Any other source or policy change after the cited revision makes the record stale.

### Consequences

- Positive: native evidence can be committed without losing its exact tested revision.
- Negative: the completion checker must inspect the intervening diff.
- Neutral: a record that names current `HEAD` remains valid.

## Pros and cons of the options

### Option A — leave evidence uncommitted

- Good: no validator change.
- Bad: the completion record is not durable in repository history.

### Option B — require current HEAD

- Good: simplest comparison.
- Bad: a self-referential evidence commit is impossible.

### Option C — allow metadata-only evidence commits

- Good: preserves exact source provenance and committed evidence.
- Bad: requires a narrow diff allowlist.

## Links

- Design decisions: DD-32
- Spec clauses: `06_Process_and_Traceability/06_DEFINITION_OF_DONE.md#phase-level-exit-criteria`,
  `07_Phases/PHASE_01_CORE_EDITOR.md#phase-exit-evidence`
- Stories: STORY-032
