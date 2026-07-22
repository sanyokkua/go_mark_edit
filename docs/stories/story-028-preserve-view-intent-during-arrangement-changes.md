---
id: STORY-028
title: Preserve the latest editor view intent during arrangement changes
status: ready
spec_clauses:
  - 01_Product/02_EDITOR_AND_VIEWER_MODES.md#view-mode-toggle
  - 01_Product/02_EDITOR_AND_VIEWER_MODES.md#per-document-view-state
  - 02_Architecture/03_FRONTEND_REACT.md#state-ownership
  - 07_Phases/PHASE_01_CORE_EDITOR.md#state-and-transition-model
phase_requirements:
  - PH01-R04
  - PH01-R06
  - PH01-R07
  - PH01-R08
modules:
  - logic/adapter/
  - logic/store/
  - ui/widgets/
acceptance_criteria:
  - STORY-028-AC-1
  - STORY-028-AC-2
  - STORY-028-AC-3
  - STORY-028-AC-4
  - STORY-028-AC-5
  - STORY-028-AC-6
edge_cases:
  - EC-DOCS-12
depends_on:
  - STORY-021
  - STORY-022
adrs:
  - ADR-0014
phase: 01
owner: coder
estimate: M
---

# STORY-028 — Preserve the latest editor view intent during arrangement changes

## Goal

Keep the user's newest cursor, selection, scroll, and arrangement together when Editor, Split, or Preview
is selected, even while view synchronization or backend patches are pending or failing.

## In scope

- Make arrangement commands partial intents merged in the adapter with the newest editor-session view data.
- Preserve flush-before-hide and backend acknowledgement before controls/panes reconcile.
- Retain failed newest intent for retry without optimistic Redux state.
- Cover pending/in-flight, patch-during-flush, retry, and document-switch interleavings.

## Out of scope

- Replacing the existing per-document serialization queue from STORY-021.
- Monaco session mount/disposal behavior already delivered by STORY-022.
- File/tab persistence or inactive-document Monaco models, owned by Phase 02.

## Spec inputs

- `01_Product/02_EDITOR_AND_VIEWER_MODES.md#view-mode-toggle` — synchronize arrangement controls through one
  backend-owned accepted state.
- `01_Product/02_EDITOR_AND_VIEWER_MODES.md#per-document-view-state` — preserve each document's latest cursor,
  selection, scroll, and arrangement.
- `02_Architecture/03_FRONTEND_REACT.md#state-ownership` — send commands, await acknowledgement, and reconcile
  only content-free backend patches.
- `07_Phases/PHASE_01_CORE_EDITOR.md#state-and-transition-model` — satisfy PH01-T03/T04 ordering, retry, and
  stale-completion behavior.

## Design constraints

- UI arrangement actions submit only pane/arrangement intent. `logic/adapter/` merges it at send time with
  the newest cursor, selection, editor scroll, and preview scroll for the expected document.
- A hide transition flushes buffer then view intent and awaits backend acknowledgement before hiding. An
  arrangement patch observed during either flush cannot replace newer local view fields.
- Pending and in-flight intents remain ordered by STORY-021's per-document queue. A failed newest intent stays
  retryable; switching documents never carries its fields to another id.
- No optimistic Redux/control/pane update occurs. Backend `state:patch` is authoritative and remains
  content-free so EC-DOCS-12 preserves the focused Monaco working copy (DD-62–64, ADR-0014).
- Only `logic/adapter/` imports `wailsjs/`; handlers retain Handler → Service → Repository and concrete
  `apperr.*Result` contracts. Styling is token-only and operation is offline.

## Acceptance criteria

### STORY-028-AC-1
**Satisfies:** PH01-R07, PH01-R08

**Given** a newer cursor, selection, or scroll intent, **when** Editor, Split, or Preview is selected, **then**
the explicit partial arrangement is merged with that newest view data before one ordered backend command.

### STORY-028-AC-2
**Satisfies:** PH01-R04, PH01-R06

**Given** pending buffer or view work, **when** an arrangement would hide the editor, **then** buffer and view
flushes are acknowledged before the pane hides and the persistent session remains available.

### STORY-028-AC-3
**Satisfies:** PH01-R07, PH01-R08

Arrangement controls and pane visibility remain at the last backend-confirmed state while the command is
pending or in flight and reconcile only from the accepted patch.

### STORY-028-AC-4
**Satisfies:** PH01-R06, PH01-R07

**Given** a metadata/arrangement patch arrives during a flush, **when** a newer working cursor, selection, or
scroll exists, **then** the newer fields remain queued and the focused Monaco content and selection are not
echoed or moved. (satisfies EC-DOCS-12)

### STORY-028-AC-5
**Satisfies:** PH01-R07, PH01-R08

**Given** the newest arrangement command fails, **when** the user retries, **then** the same newest intent is
sent with current editor view fields and older completion or patch data cannot overwrite it.

### STORY-028-AC-6
**Satisfies:** PH01-R06, PH01-R07

Pending or failed view intent is keyed to its document identity; switching documents neither sends it for
the new document nor corrupts the new active session.

## Test plan

- STORY-028-AC-1 — unit — `frontend/src/logic/adapter/appModelAdapter.test.ts` —
  `it('STORY-028-AC-1 merges partial arrangement with newest editor view intent')`.
- STORY-028-AC-2 — integration — `frontend/src/ui/widgets/EditorView.integration.test.tsx` —
  `it('STORY-028-AC-2 acknowledges buffer and view before hiding the persistent session')`.
- STORY-028-AC-3 — integration — `frontend/src/logic/store/docViewCommands.test.ts` —
  `it('STORY-028-AC-3 waits for backend patch before reconciling arrangement')`.
- STORY-028-AC-4 — integration — `frontend/src/ui/widgets/EditorView.integration.test.tsx` —
  `it('STORY-028-AC-4 preserves newer editor intent during patch and flush (EC-DOCS-12)')`.
- STORY-028-AC-5 — unit — `frontend/src/logic/adapter/appModelAdapter.test.ts` —
  `it('STORY-028-AC-5 retries the newest failed arrangement intent')`.
- STORY-028-AC-6 — integration — `frontend/src/ui/widgets/EditorView.integration.test.tsx` —
  `it('STORY-028-AC-6 isolates pending view intent across document switch')`.

## Definition of done

- [ ] Every AC has a passing test naming its `STORY-028-AC-N` id.
- [ ] EC-DOCS-12 is named on the patch-during-flush proof.
- [ ] Deferred-promise tests cover pending/in-flight commands, patch during flush, failure/retry, and document
  switch without optimistic projection state.
- [ ] Existing persistent Monaco session, undo, and adapter queue behavior remain intact.
- [ ] Frontend formatting, lint, typecheck, Jest, and applicable Playwright gates pass.
- [ ] Result envelopes, backend authority, adapter-only Wails imports, token-only styling, and offline behavior
  remain intact.
- [ ] `just trace` and `just trace-check` are run during implementation; the module inventory is unchanged.
