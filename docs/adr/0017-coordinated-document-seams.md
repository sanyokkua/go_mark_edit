# ADR-0017 — Coordinate backend snapshots with document-bound editor commands

**Status:** accepted
**Date:** 2026-07-22
**Deciders:** project owner, architect
**Supersedes:** (none)

## Context and problem statement

Later asset, format, and assistant consumers need a coherent active-document identity, path, canonical
content, selection, and revision from the backend. Frontend format/apply consumers also need to operate on
the immediately responsive Monaco working copy, including edits not yet flushed to the backend. The existing
F2 and F3/F7 descriptions require both capabilities but do not define how their identities, availability,
and stale-document failures coordinate. A content-only accessor or an unbound global editor handle could
silently read or edit the wrong document during a tab/session transition.

## Decision drivers

- Preserve `internal/appmodel` as the single canonical owner under DD-62 through DD-64.
- Give backend consumers one coherent, race-safe snapshot instead of separately locked reads.
- Let frontend consumers act on the newest visible working copy without treating it as canonical.
- Make unavailable, detached, and document-mismatch states explicit and typed.
- Keep Redux and `state:patch` content-free and keep sibling consumers independent of Monaco internals.

## Considered options

- A. Expose only the backend canonical snapshot and force every frontend command through it.
- B. Expose only a global Monaco command handle and let backend consumers reconstruct state elsewhere.
- C. Coordinate a one-lock backend canonical snapshot with a document-identity-bound frontend working-copy
  command session.

## Decision outcome

Chosen: **Option C**.

`internal/appmodel` owns one atomic active-document snapshot read. Under the model's single lock it returns
exactly `{ documentId, path, content, selection, revision }`. Its service-level API uses the normal inner
`(T, error)` shape and a typed no-active-document error/result. The snapshot is canonical. It does not put
content into Redux or any `state:*` event, and independently reading fields under separate lock acquisitions
is not an equivalent implementation.

The frontend owns one active editor-session command boundary bound to an expected document identity and
session handle. It exposes current working-copy content, selection, replace-range, and replace-all. Results
are discriminated as `available`, `unavailable`, or `document-mismatch`; no operation silently targets a
new active document or degrades to a no-op. The working copy may be newer than the backend while debounce
sync is pending and is explicitly noncanonical until normal buffer synchronization is acknowledged.
Replacements remain one Monaco undo edit and enter the existing adapter-owned `UpdateBuffer` queue.

Backend consumers use the canonical snapshot when they require an acknowledged revision. Frontend commands
use the identity-bound working copy for interactive transform/apply behavior. A caller that needs both must
flush and acknowledge the working copy before taking the backend snapshot; neither seam impersonates the
other.

### Consequences

- Positive: backend reads are coherent under races and identify their exact revision.
- Positive: frontend edits target the intended session even during active-tab or arrangement changes.
- Positive: later PH05, PH09, and PH12 consumers receive stable, testable contracts.
- Negative: callers must handle explicit unavailable and document-mismatch outcomes.
- Neutral: no document content is added to Redux or backend patch events; Monaco remains the visible working
  copy only.

## Pros and cons of the options

### Option A — Backend snapshot only

- Good: one canonical representation.
- Bad: cannot represent unflushed interactive text or Monaco undo semantics without harming responsiveness.

### Option B — Global Monaco handle only

- Good: easy access to visible text.
- Bad: breaks backend authority, cannot serve backend consumers, and risks wrong-document edits.

### Option C — Coordinated canonical and working-copy seams

- Good: each owner exposes the state it legitimately owns, with explicit identity and freshness.
- Bad: consumers must choose the correct seam and observe flush ordering when crossing them.

## Links

- Design decisions: DD-41, DD-42, DD-62, DD-63, DD-64
- Spec clauses: `specification/02_Architecture/02_BACKEND_GO.md#application-model`,
  `specification/02_Architecture/03_FRONTEND_REACT.md#state-ownership`,
  `specification/00_Foundation/06_IMPLEMENTATION_STAGES.md#stage-1-must-leave-open`,
  `specification/00_Foundation/06_IMPLEMENTATION_STAGES.md#stage-2-must-leave-open`,
  `specification/02_Architecture/08_LLM_INTEGRATION.md#forward-compat-seams`
- Stories: STORY-029, STORY-030
