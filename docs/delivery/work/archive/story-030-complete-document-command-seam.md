---
id: STORY-030
title: Complete the frontend document command seam
status: done
spec_clauses:
  - ../../../_archive-2026-07-28-specification/00_Foundation/06_IMPLEMENTATION_STAGES.md#stage-1-must-leave-open
  - ../../../_archive-2026-07-28-specification/00_Foundation/06_IMPLEMENTATION_STAGES.md#stage-2-must-leave-open
  - ../../../_archive-2026-07-28-specification/01_Product/02_EDITOR_AND_VIEWER_MODES.md#editor-mode
  - ../../../_archive-2026-07-28-specification/02_Architecture/03_FRONTEND_REACT.md#state-ownership
  - ../../../_archive-2026-07-28-specification/02_Architecture/08_LLM_INTEGRATION.md#forward-compat-seams
  - 07_Phases/PHASE_05_FORMAT_LINT.md#cross-phase-contracts
  - 07_Phases/PHASE_12_ACTIONS_PROOFREAD_REFORMAT.md#cross-phase-contracts
phase_requirements:
  - PH01-R09
  - PH01-R10
modules:
  - logic/hooks/
  - ui/components/
  - ui/widgets/
acceptance_criteria:
  - STORY-030-AC-1
  - STORY-030-AC-2
  - STORY-030-AC-3
  - STORY-030-AC-4
  - STORY-030-AC-5
  - STORY-030-AC-6
edge_cases: []
depends_on:
  - STORY-023
  - STORY-028
  - STORY-029
adrs:
  - ADR-0002
  - ADR-0010
  - ADR-0014
  - ADR-0017
phase: 01
owner: coder
estimate: M
---

> **Historical vocabulary — this story is not maintained.** The `AC-…`, `EC-…` and `DD-…` identifiers are the scheme of the pre-2026-07-28 specification; `spec_clauses` and `phase_requirements` point into `_archive-2026-07-28-specification/`, which is kept so a citation still resolves and is **not normative**. See `README.md`. If anything here disagrees with the code, the code is the truth.
> A link beginning `07_Phases/` names a retired phase document that was deleted rather than archived; that set is in git at `e1bd33f`.

# STORY-030 — Complete the frontend document command seam

## Goal

Let non-editor features safely read and replace the intended document's newest visible working copy in every
arrangement, with explicit outcomes when that editor session is absent, detached, or no longer matches.

## In scope

- Bind the persistent editor-session command API to an expected document id and session handle.
- Add current working content alongside selection, replace-range, and replace-all.
- Return discriminated `available`, `unavailable`, and `document-mismatch` outcomes.
- Preserve one undo edit and normal buffer-queue synchronization for replacements.
- Prove sibling consumption without direct Monaco access in every arrangement and failure state.

## Out of scope

- Backend canonical snapshot implementation, owned by STORY-029.
- Format transforms, assistant UI/tools, diff review, or direct file writes in PH05/PH12.
- A second buffer queue, Redux content field, or command path that bypasses Monaco.

## Spec inputs

- `../../../_archive-2026-07-28-specification/00_Foundation/06_IMPLEMENTATION_STAGES.md#stage-1-must-leave-open` — complete F2/F3 identity-bound content
  access through a first-class document/session seam.
- `../../../_archive-2026-07-28-specification/00_Foundation/06_IMPLEMENTATION_STAGES.md#stage-2-must-leave-open` — expose F7 selection,
  replace-range, and replace-all as the stable mutation surface.
- `../../../_archive-2026-07-28-specification/01_Product/02_EDITOR_AND_VIEWER_MODES.md#editor-mode` — operate on the responsive active Monaco working
  copy and preserve selection/undo behavior.
- `../../../_archive-2026-07-28-specification/02_Architecture/03_FRONTEND_REACT.md#state-ownership` — treat the working copy as noncanonical until
  normal buffer synchronization is acknowledged.
- `../../../_archive-2026-07-28-specification/02_Architecture/08_LLM_INTEGRATION.md#forward-compat-seams` — prevent later sibling consumers from
  reaching into Monaco.
- `07_Phases/PHASE_05_FORMAT_LINT.md#cross-phase-contracts` — support PH05 transforms in all arrangements.
- `07_Phases/PHASE_12_ACTIONS_PROOFREAD_REFORMAT.md#cross-phase-contracts` — provide the identity-safe apply
  seam later proposal consumers require.

## Design constraints

- The command provider is bound to `{expectedDocumentId, sessionHandle}` above pane branching. Every call
  verifies the current session identity before reading or editing (ADR-0017).
- The API exposes working content, selection, replace-range, and replace-all with discriminated results:
  `available`, `unavailable`, or `document-mismatch`. It never silently no-ops or retargets a newly active
  document.
- Working content is the newest Monaco value and may be noncanonical while debounce sync is pending. Callers
  needing backend canonical state flush then use STORY-029; Redux/events never carry content (DD-62–64,
  ADR-0014/0017).
- Each replacement is one Monaco undo edit and triggers the existing change callback into the one
  adapter-owned `UpdateBuffer` queue. No direct disk write or alternate sync path exists.
- `CodeEditor` remains the only Monaco wrapper (ADR-0002). Sibling consumers use the hook/session contract
  and do not import Monaco or `CodeEditorHandle`.
- Only `logic/adapter/` imports `wailsjs/`; backend Result/layering rules remain unchanged. Styling is
  token-only and Stage 1/2 remain zero-network.

## Acceptance criteria

### STORY-030-AC-1
**Satisfies:** PH01-R09, PH01-R10

A non-editor sibling can read discriminated current working content and selection for the expected active
document in Editor, Split, and Preview arrangements.

### STORY-030-AC-2
**Satisfies:** PH01-R09

**Given** no mounted session handle, **when** any command is called, **then** it returns `unavailable` and
performs no edit or buffer synchronization.

### STORY-030-AC-3
**Satisfies:** PH01-R09, PH01-R10

**Given** the active tab/session changes after a consumer captures the expected id, **when** it reads or
replaces, **then** it returns `document-mismatch` and never reads or edits the new document.

### STORY-030-AC-4
**Satisfies:** PH01-R09

`replaceRange` and `replaceAll` each apply exactly one Monaco undo edit to the matching working copy and send
the resulting complete text through the normal `UpdateBuffer` queue.

### STORY-030-AC-5
**Satisfies:** PH01-R09, PH01-R10

Detached/unmounted handles return `unavailable`, stale handles return `document-mismatch`, and neither case
silently succeeds or mutates projection, editor, backend, or disk state.

### STORY-030-AC-6
**Satisfies:** PH01-R10

Architecture tests reject direct Monaco imports, editor-handle ownership, or alternate content access in a
non-editor sibling while accepting the public document command seam.

## Test plan

- STORY-030-AC-1 — integration — `frontend/src/ui/widgets/editorSession.integration.test.tsx` —
  `it('STORY-030-AC-1 reads working content and selection in every arrangement')`.
- STORY-030-AC-2 — unit — `frontend/src/logic/hooks/useDocumentCommands.test.ts` —
  `it('STORY-030-AC-2 returns unavailable when no session handle exists')`.
- STORY-030-AC-3 — integration — `frontend/src/ui/widgets/editorSession.integration.test.tsx` —
  `it('STORY-030-AC-3 rejects active-tab and stale-identity mismatch')`.
- STORY-030-AC-4 — integration — `frontend/src/ui/components/CodeEditor.test.tsx` —
  `it('STORY-030-AC-4 applies one undo edit through the normal buffer queue')`.
- STORY-030-AC-5 — unit — `frontend/src/logic/hooks/useDocumentCommands.test.ts` —
  `it('STORY-030-AC-5 discriminates detached unavailable and stale mismatch')`.
- STORY-030-AC-6 — architecture — `frontend/src/logic/hooks/useDocumentCommands.test.ts` —
  `it('STORY-030-AC-6 keeps sibling consumers independent of Monaco')`.

## Definition of done

- [ ] Every AC has a passing Jest test whose name begins with its `STORY-030-AC-N` id.
- [ ] Tests cover Editor, Split, Preview, no session, detached handle, active-tab change, stale identity, and
  a sibling with no Monaco dependency.
- [ ] Replacement tests prove one undo edit and exactly the existing `UpdateBuffer` queue path.
- [ ] Working text remains ephemeral/noncanonical until flush; Redux/events/local storage remain content-free.
- [ ] Frontend formatting, lint, typecheck, and Jest gates pass.
- [ ] Backend authority, adapter-only Wails imports, token-only styling, and offline behavior remain intact.
- [ ] `just trace` and `just trace-check` are run during implementation; the module inventory is unchanged.
