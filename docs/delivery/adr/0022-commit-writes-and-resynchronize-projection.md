# ADR-0022 — Commit successful file writes and resynchronize failed projections

**Status:** accepted
**Date:** 2026-07-23
**Deciders:** project owner, architect
**Supersedes:** (none)

> **Historical vocabulary — this record is not rewritten.** The `DD-…` and `EC-…` identifiers below cite the retired 78-entry design-decision registry, last present in git at `e1bd33f` under `specification/00_Foundation/` as `04_DESIGN_DECISIONS.md`; every one of those decisions now lives in the sentence of the feature file that needs it. Links into `_archive-2026-07-28-specification/` are the pre-conversion specification, kept so a citation still resolves, and **not normative**. See `README.md`. A decision record says what was decided against what was known then, so neither is translated forward.

## Context and problem statement

A Phase 02 save has an irreversible boundary: an atomic file replacement may succeed before the following
`state:patch` emission fails. Reporting the whole operation as failed while retaining the old backend
baseline would misrepresent the disk and encourage another unguarded write. Treating the write as rolled
back is impossible once the replacement commits.

## Decision drivers

- Keep disk and the backend baseline truthful after an irreversible write.
- Prevent the frontend from issuing document commands against a projection known to be stale.
- Preserve content-free patches and backend authority.
- Distinguish pre-write failure from post-write notification failure.

## Considered options

- A. Report failure and keep the old backend baseline.
- B. Attempt to restore the previous file when patch emission fails.
- C. Commit the written baseline and return success marked `resyncRequired`.

## Decision outcome

Chosen: **Option C**.

Before the atomic replacement commits, any error leaves the old disk and backend baseline intact and the
document dirty. After replacement commits, the backend records the exact written snapshot as the disk
baseline even if event delivery fails. The command returns a successful acknowledgement with
`resyncRequired: true`.

On that acknowledgement the adapter blocks subsequent document commands, calls `GetState`, rehydrates the
projection, and resumes only after rehydration succeeds. It does not repeat the write. If the user edited
while the save was in flight, the written snapshot becomes the baseline while the newer canonical revision
remains dirty.

### Consequences

- Positive: backend state never pretends a successful disk write failed or was rolled back.
- Positive: stale projection state cannot drive another document mutation.
- Positive: retries cannot duplicate an already committed write.
- Negative: the adapter needs a temporary command barrier and full-state rehydration path.
- Neutral: normal successful writes still reconcile through content-free patches.

## Pros and cons of the options

### Option A — Keep the old baseline

- Good: simple error return.
- Bad: backend and disk immediately disagree and a retry can overwrite newer disk state.

### Option B — Restore the previous file

- Good: attempts transactional semantics.
- Bad: restoration is another fallible write and can destroy a concurrent external change.

### Option C — Commit and resynchronize

- Good: models the irreversible boundary honestly and restores projection consistency.
- Bad: adds an exceptional full-hydration path.

## Links

- Design decisions: DD-15, DD-62, DD-63, DD-64
- Spec clauses: ../../_archive-2026-07-28-specification/01_Product/03_FILES_TABS_WORKSPACE.md#new-open-save`,
../../_archive-2026-07-28-specification/02_Architecture/02_BACKEND_GO.md#file-io`,
  ../../_archive-2026-07-28-specification/02_Architecture/02_BACKEND_GO.md#application-model`,
../../_archive-2026-07-28-specification/02_Architecture/03_FRONTEND_REACT.md#state-ownership`
- Stories: STORY-037, STORY-038, STORY-039
