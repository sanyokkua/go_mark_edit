# ADR-0023 — Permit exact-revision Phase 02 evidence metadata descendants

**Status:** superseded by ADR-0025
**Date:** 2026-07-23
**Deciders:** project owner, architect
**Supersedes:** (none)

## Context and problem statement

Phase 02 runtime and human evidence must identify the exact tested Git revision. Committing those records
necessarily creates a descendant revision containing the evidence itself. Requiring every record to name
current `HEAD` makes durable evidence stale by construction, while a broad ancestor exception could hide
source or policy changes after testing.

## Decision drivers

- Keep the tested revision exact and independently inspectable.
- Permit Phase 02 evidence records and lifecycle metadata to be committed afterward.
- Keep Windows, Linux, macOS, and product-owner gates blocking.
- Reject any descendant containing source, policy, or unrelated story changes.

## Considered options

- A. Leave final Phase 02 evidence uncommitted.
- B. Require the evidence revision to equal current `HEAD`.
- C. Accept an exact tested ancestor only across a Phase-02-specific metadata allowlist.

## Decision outcome

Chosen: **Option C**.

Phase 02 evidence may cite an exact tested ancestor only when every later changed path is restricted to:

- `docs/phase-evidence/`;
- lifecycle or evidence metadata in
  `docs/stories/story-051-produce-phase02-completion-evidence.md`;
- synchronized `docs/stories/README.md`; or
- generated `docs/traceability.yaml`.

Any application source, specification, ADR/policy, script, test, other story, or other path change after the
tested revision invalidates freshness. The validator inspects the entire descendant diff and fails closed.
This exception permits evidence metadata only; it does not waive PH02-E07's real macOS/Windows/Linux matrix
or PH02-E08's product-owner approval.

### Consequences

- Positive: exact Phase 02 runtime and human evidence can be durable in repository history.
- Positive: intervening product, policy, story, or test changes cannot inherit stale evidence.
- Negative: completion validation must inspect every descendant path and distinguish allowed metadata.
- Neutral: evidence naming current `HEAD` remains valid.

## Pros and cons of the options

### Option A — Leave evidence uncommitted

- Good: no freshness exception.
- Bad: completion proof is not durable.

### Option B — Require current HEAD

- Good: simple comparison.
- Bad: committing the evidence always changes the revision it must name.

### Option C — Narrow metadata descendants

- Good: preserves exact source provenance and durable evidence.
- Bad: requires an independently tested path allowlist.

## Links

- Design decisions: DD-37, DD-62, DD-63, DD-64
- Spec clauses: `specification/06_Process_and_Traceability/06_DEFINITION_OF_DONE.md#phase-level-exit-criteria`,
  `specification/07_Phases/PHASE_02_FILE_IO_TABS.md#phase-exit-evidence`
- Stories: STORY-033, STORY-051
