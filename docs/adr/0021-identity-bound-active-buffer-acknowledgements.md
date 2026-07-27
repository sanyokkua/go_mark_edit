# ADR-0021 — Bind active-buffer acknowledgements to document identity and revision

**Status:** accepted
**Date:** 2026-07-23
**Deciders:** project owner, architect
**Supersedes:** (none)

## Context and problem statement

DD-64 forbids ordinary backend patches from echoing content into the focused Monaco editor, but Phase 02
must deliberately replace the visible buffer when a different tab becomes active or an external file is
reloaded. A content-bearing global patch can move the cursor or install stale text after a rapid switch.
The existing coordinated document seams do not define this Phase 02 transfer acknowledgement or the
zero-document wire shape.

## Decision drivers

- Keep `state:patch` and Redux document metadata content-free.
- Transfer content only at deliberate active-session boundaries.
- Reject late activation and reload results after another document or revision wins.
- Represent the real empty tab set without a phantom document.
- Preserve ADR-0014 and ADR-0017 ownership boundaries.

## Considered options

- A. Include active document content in every state patch.
- B. Let the frontend fetch content after observing an active-tab metadata patch.
- C. Return one identity-and-revision-bound active-buffer acknowledgement from activation and reload.

## Decision outcome

Chosen: **Option C**.

`SetActiveTab` and active-document Reload return an acknowledgement containing the target document
identity, its accepted content revision, and the buffer text for the new active editor session. The adapter
applies it only when both identity and revision still match the backend-confirmed active projection.
Inactive reloads update only backend state; their content is supplied later by activation.

Ordinary `state:patch` events remain content-free, including patches produced by activation and reload.
The snapshot and patch DTOs make active document and active buffer optional so startup and closing the final
tab represent a true zero-document state. No synthetic Untitled document is constructed during hydration.

### Consequences

- Positive: rapid tab switches and reloads cannot install stale content in Monaco.
- Positive: inactive document content remains out of Redux and webview memory.
- Positive: empty startup and final-tab close have one honest wire representation.
- Negative: activation/reload consumers must correlate and discard acknowledgements.
- Neutral: normal focused-editor debounce synchronization is unchanged.

## Pros and cons of the options

### Option A — Content-bearing patches

- Good: one event stream.
- Bad: violates DD-64 and can overwrite a newer working copy.

### Option B — Fetch after patch

- Good: patches remain metadata-only.
- Bad: creates an extra race between active identity and the later content request.

### Option C — Bound acknowledgement

- Good: transfers identity, revision, and content atomically at the only boundaries that need it.
- Bad: adds a distinct command-result contract the adapter must validate.

## Links

- Design decisions: DD-62, DD-63, DD-64
- Spec clauses: `specification/02_Architecture/02_BACKEND_GO.md#application-model`,
  `specification/02_Architecture/03_FRONTEND_REACT.md#state-ownership`,
  `specification/07_Phases/PHASE_05_REAL_FILES.md`
- Stories: the Phase 05 stories, not yet written. (The stories this ADR originally named — STORY-036,
  038, 039, 041, 043 — were Phase-02 drafts withdrawn on 2026-07-25 without being built.)
