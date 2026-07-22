# ADR-0016 — Separate Phase 01 preview and editing implementation checkpoints

**Status:** accepted
**Date:** 2026-07-22
**Deciders:** project owner, architect
**Supersedes:** (none)

## Context and problem statement

Phase 01 contains render/preview capabilities assigned to Stage 1 and editing capabilities assigned to
Stage 2, while the roadmap otherwise presents sequential phase completion before Phase 02. The frozen
sources do not say whether Phase 01 can be claimed once at the earlier point or only after both groups.
PH01-X01 records that conflict. We need precise, separately testable progress checkpoints without calling
either checkpoint a complete product stage and without weakening full Phase 01 completion.

Phase exit evidence PH01-E06 also requests native Wails runtime proof on macOS, Windows, and Linux. During
ordinary implementation, only the current host may be available. A narrowly bounded evidence rule is needed
so current-host proof is useful without becoming a generic platform waiver or a release claim.

## Decision drivers

- Preserve the frozen Stage 1/Stage 2 capability mapping without inventing a false chronological release.
- Make partial Phase 01 progress claimable and mechanically verifiable.
- Keep full Phase 01 completion stronger than either implementation checkpoint.
- Prevent one requirement's proof from being borrowed to certify an unrelated transition, contract, edge
  case, or evidence row.
- Record honest current-host evidence while deferring, not waiving, Windows and Linux proof.

## Considered options

- A. Treat Phase 01 as complete when its preview work is done.
- B. Permit separately named preview and editing implementation checkpoints, then require both plus the
  shared completion obligations for full Phase 01 completion.
- C. Make Phase 01 unclaimable until every target platform is available locally.

## Decision outcome

Chosen: **Option B**.

The **preview implementation checkpoint** contains exactly PH01-R01, PH01-R02, PH01-R05, PH01-R08,
PH01-R11, PH01-R12, PH01-R13, PH01-R14, and PH01-R16.

The **editing implementation checkpoint** contains exactly PH01-R03, PH01-R04, PH01-R06, PH01-R07,
PH01-R09, and PH01-R10, and requires the preview implementation checkpoint first. These labels are
implementation checkpoints only. They are never called complete product stages, milestone releases, or
substitute phase completion.

Full Phase 01 completion requires both implementation checkpoints, PH01-R15, and exact AC-level proof for
every PH01 transition, cross-phase contract, edge case, and PH01-E01 through PH01-E11 evidence row.
Checkpoint membership is a complete partition of PH01-R01 through PH01-R14 plus PH01-R16: unknown,
duplicate, overlapping, or omitted ids are invalid. PH01-R15 is intentionally shared completion work and
belongs to neither checkpoint.

The only permitted platform deferral is an exact **PH01-E06 current-host exception**. Its record must name
the host OS, exact repository revision, evidence freshness, procedure and result, limitations, Windows and
Linux as deferred where applicable, this accepting ADR, and an expiry before any Phase 15 release or
cross-platform claim. A stale revision, an unresolved PH01-X01 marker, missing fields, or use against any
other evidence row is invalid. This exception does not waive deferred native proof and cannot certify a
product stage, milestone, release candidate, or platform matrix.

The mutable resolution record under `docs/` is the operative implementation truth. It records the accepted
resolution without editing or pretending to repair the frozen contradictory stage table.

### Consequences

- Positive: preview and editing progress can be reported independently with unambiguous membership.
- Positive: full Phase 01 remains gated by all shared lifecycle, contract, edge, and evidence obligations.
- Positive: current-host native testing can be retained as truthful evidence without becoming a platform
  waiver.
- Negative: validation must understand checkpoint partitions, prerequisites, row-level proof, and the
  narrow PH01-E06 exception.
- Neutral: the frozen specification remains unchanged; implementation truth is recorded in mutable docs and
  enforced by repository validators.

## Pros and cons of the options

### Option A — Preview means Phase 01 complete

- Good: simple status model.
- Bad: falsely certifies editing requirements and contradicts Stage 2 ownership.

### Option B — Separate implementation checkpoints plus full completion

- Good: preserves capability chronology and makes progress exact.
- Bad: adds checkpoint-aware validation and evidence records.

### Option C — Require every platform before any useful claim

- Good: no temporary platform deferral mechanism.
- Bad: discards valid current-host evidence and blocks implementation feedback without improving release
  proof.

## Links

- Design decisions: DD-62, DD-63, DD-64
- Spec clauses: `specification/00_Foundation/06_IMPLEMENTATION_STAGES.md#2-stage--phase-mapping`,
  `specification/00_Foundation/06_IMPLEMENTATION_STAGES.md#5-stage-exit-criteria`,
  `specification/07_Phases/00_ROADMAP.md#stages`,
  `specification/07_Phases/PHASE_01_CORE_EDITOR.md#open-specification-conflicts`,
  `specification/07_Phases/PHASE_01_CORE_EDITOR.md#phase-exit-evidence`
- Stories: STORY-025, STORY-026, STORY-032
