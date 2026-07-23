# ADR-0018 — Remove manual network-capture evidence from Phase 01 completion

**Status:** accepted
**Date:** 2026-07-23
**Deciders:** product owner
**Supersedes:** (none)

## Context and problem statement

PH01-E08 requires a packet capture from a dedicated clean host as blocking Phase 01 evidence. The
product owner has determined that this operational requirement is not proportionate to Phase 01: the
application is offline by design, and a clean host or VM is not available for this milestone. Requiring
that environment prevents phase completion without revealing a product behavior gap.

## Decision drivers

- Preserve the Stage 1/2 offline-by-design invariant: no background or unsolicited application network
  activity, runtime CDN assets, telemetry, or auto-update.
- Remove the dedicated-host packet capture, security-reviewer role, capture artifact, and digest from
  the Phase 01 completion path.
- Keep the frozen specification read-only and make the exception explicit, narrow, and auditable.

## Considered options

- A. Retain the dedicated clean-host packet-capture requirement.
- B. Replace it with a new mandatory runtime network-capture procedure.
- C. Remove PH01-E08 manual capture evidence from the mutable Phase 01 completion resolution while
  retaining the offline design constraints and their existing automated regression coverage.

## Decision outcome

Chosen: **Option C**. PH01-E08 is exempt from the mutable Phase 01 completion gate. No packet capture,
clean host or VM, security-reviewer sign-off, capture PID/window, artifact, or digest is required to
complete Phase 01. This does not permit application networking or change the existing offline product
constraints; it only removes this manual evidence procedure.

### Consequences

- Positive: Phase completion is not blocked on unavailable networking infrastructure.
- Positive: the offline design and its existing automated regression coverage remain intact.
- Negative: Phase 01 does not retain an independently captured runtime network trace.
- Neutral: the frozen PH01-E08 row remains historically visible; the mutable resolution records its
  completion-gate exemption.

## Pros and cons of the options

### Option A — retain dedicated-host capture

- Good: provides an external runtime trace.
- Bad: requires infrastructure unavailable to the project owner and blocks phase completion.

### Option B — require another manual capture

- Good: keeps a distinct manual runtime procedure.
- Bad: retains the same unavailable operational dependency.

### Option C — remove manual capture evidence

- Good: aligns completion work with the offline-by-design architecture and available verification.
- Bad: removes the independent packet-capture artifact.

## Links

- Design decisions: DD-32, DD-33, DD-34
- Spec clauses: `07_Phases/PHASE_01_CORE_EDITOR.md#phase-exit-evidence`,
  `00_Foundation/04_DESIGN_DECISIONS.md#dd-32-offline-first-and-network-policy`
- Stories: STORY-031, STORY-032
