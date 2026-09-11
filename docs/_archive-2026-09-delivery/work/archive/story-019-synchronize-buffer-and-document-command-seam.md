---
id: STORY-019
title: Synchronize the active buffer and establish the editable document-command seam
status: done
spec_clauses:
  - ../../../_archive-2026-07-28-specification/01_Product/02_EDITOR_AND_VIEWER_MODES.md#editor-mode
  - ../../../_archive-2026-07-28-specification/02_Architecture/03_FRONTEND_REACT.md#state-ownership
  - ../../../_archive-2026-07-28-specification/02_Architecture/03_FRONTEND_REACT.md#adapter-layer
  - ../../../_archive-2026-07-28-specification/03_NonFunctional/02_PERFORMANCE.md#2-editor-responsiveness
  - ../../../_archive-2026-07-28-specification/00_Foundation/06_IMPLEMENTATION_STAGES.md#3-forward-compatibility-constraints-per-stage
  - ../../../_archive-2026-07-28-specification/00_Foundation/04_DESIGN_DECISIONS.md#14-application-state-ownership
  - 07_Phases/PHASE_01_CORE_EDITOR.md#scope
phase_requirements:
  - PH01-R03
  - PH01-R05
  - PH01-R13
modules:
  - logic/adapter/
  - logic/hooks/
  - logic/store/
  - ui/components/
  - ui/widgets/
acceptance_criteria:
  - STORY-019-AC-1
  - STORY-019-AC-2
  - STORY-019-AC-3
  - STORY-019-AC-4
  - STORY-019-AC-5
  - STORY-019-AC-6
edge_cases:
  - EC-DOCS-12
depends_on:
  - STORY-012
  - STORY-013
adrs:
  - ADR-0002
  - ADR-0014
phase: 01
owner: coder
estimate: L
---

> **Historical vocabulary — this story is not maintained.** The `AC-…`, `EC-…` and `DD-…` identifiers are the scheme of the pre-2026-07-28 specification; `spec_clauses` and `phase_requirements` point into `_archive-2026-07-28-specification/`, which is kept so a citation still resolves and is **not normative**. See `README.md`. If anything here disagrees with the code, the code is the truth.
> A link beginning `07_Phases/` names a retired phase document that was deleted rather than archived; that set is in git at `e1bd33f`.

# STORY-019 — Synchronize the active buffer and establish the editable document-command seam

## Goal

Synchronize the responsive Monaco working copy with the backend's canonical document while exposing one stable selection/edit command seam that later file, formatting, and assistant features can reuse without reaching into the editor component.

## In scope

- Add adapter-owned per-document pending text, generation, 200 ms timer, serialized in-flight ordering, `updateBuffer`, and awaitable `flushBuffer` behavior.
- Consume the bootstrap `ActiveBuffer` exactly once into ephemeral editor-session state; document content never enters Redux or `localStorage`.
- Add a lifecycle-only React hook that connects presentational `CodeEditor` callbacks/refs to the adapter owner and flushes on blur and future switch/close/save boundaries.
- Reconcile live one-based cursor display immediately in ephemeral UI state while `SetDocView` synchronizes cursor, selection, and restorable view data to the backend-owned model.
- Establish a stable F3/F7 `DocumentCommandAPI` exposing `getSelection`, `replaceRange`, and `replaceAll`; programmatic replacement is one Monaco undo edit and routes resulting text through the same `UpdateBuffer` queue.
- Prove in a store-connected widget integration that metadata-only `state:patch` reconciliation never sets Monaco content or moves cursor/selection.
- Route synchronization failures through the normal envelope/toast path while retaining the local working copy for retry or user action.

## Out of scope

- File switch/close/save/autosave implementations, owned by Phase 02; this story supplies and proves the awaitable flush contract they must call.
- Preview-source publication and rendering, owned by STORY-017; this story supplies accepted-generation callbacks after successful acknowledgements.
- Persisted cursor/selection or editor preferences, owned by Phase 08; only the backend in-memory `DocView` is restorable in Phase 01.
- Formatting/lint implementations and Stage-3 edit proposals; they later consume the F3/F7 command interface defined here.

## Spec inputs

- `../../../_archive-2026-07-28-specification/01_Product/02_EDITOR_AND_VIEWER_MODES.md#editor-mode` — keep Monaco responsive, derive backend dirty/count metadata, and let preview consume the backend-accepted working snapshot.
- `../../../_archive-2026-07-28-specification/02_Architecture/03_FRONTEND_REACT.md#state-ownership` — treat Monaco as an ephemeral working copy, keep content out of Redux, and flush before blur/switch/close/save boundaries.
- `../../../_archive-2026-07-28-specification/02_Architecture/03_FRONTEND_REACT.md#adapter-layer` — place per-document debounce/flush ownership behind the adapter singleton and use guarded, unwrapped command calls.
- `../../../_archive-2026-07-28-specification/03_NonFunctional/02_PERFORMANCE.md#2-editor-responsiveness` — avoid bridge traffic on each keystroke, preserve immediate editing/cursor behavior, and serialize flushes safely.
- `../../../_archive-2026-07-28-specification/00_Foundation/06_IMPLEMENTATION_STAGES.md#3-forward-compatibility-constraints-per-stage` — deliver the stable F3/F7 document-command seam with selection, replace-range, and replace-all operations.
- `../../../_archive-2026-07-28-specification/00_Foundation/04_DESIGN_DECISIONS.md#14-application-state-ownership` — apply DD-62 through DD-64: backend canonical content, disposable projection, debounced working copy, and no focused-editor echo.
- `07_Phases/PHASE_01_CORE_EDITOR.md#scope` — synchronize the one Phase-01 untitled buffer while deferring file actions and durable editor state.

## Design constraints

- `logic/adapter/` is the sole owner of pending per-document text, timers, accepted generations, in-flight serialization, guarded Wails calls, and `flushBuffer`; React hooks only attach/detach lifecycle callbacks.
- The one shared interval is exactly 200 ms. A timed push or explicit flush captures one immutable snapshot/generation, awaits its Result, and reports successful acknowledgement to consumers only for that sent snapshot.
- `flushBuffer(documentId)` cancels a pending timer, respects an already in-flight generation, sends the latest unsent text exactly once, and resolves only after all text current at flush invocation is accepted or the Result rejects.
- The bootstrap `ActiveBuffer` seeds editor-session state once per document identity; neither Redux nor `localStorage` stores content.
- Live cursor coordinates are ephemeral for immediate status display. Cursor/selection/restorable state is also coalesced through `SetDocView`; backend patches may update metadata but never write Monaco text or disturb live selection (EC-DOCS-12).
- `DocumentCommandAPI` is the only external editor mutation seam. `replaceRange`/`replaceAll` execute as one Monaco undo edit, preserve the editor's undo model, and enqueue the resulting complete text through `UpdateBuffer`.
- On failure, `unwrap` emits the standard toast and the editor retains its local working copy/pending generation; no optimistic Redux content or rollback `setValue` occurs.
- Only `logic/adapter/` imports `wailsjs/`; backend Handler → Service → Repository layering, concrete Result envelopes, token-only styling, and zero-background-network behavior remain binding (ADR-0002, ADR-0014).

## Acceptance criteria

### STORY-019-AC-1

**Satisfies:** PH01-R03
A burst of edits changes Monaco immediately but the adapter-owned shared 200 ms timer sends exactly one `UpdateBuffer` containing the latest text for that document.

### STORY-019-AC-2

**Satisfies:** PH01-R03
Blur or a future switch/close/save calls awaitable `flushBuffer`, which cancels the pending timer, orders against an in-flight generation, sends the latest unsent text exactly once, and resolves only after acknowledgement.

### STORY-019-AC-3

**Satisfies:** PH01-R05
A metadata-only `state:patch` reconciled through the connected editor widget never calls Monaco `setValue` or changes its cursor/selection. (satisfies EC-DOCS-12)

### STORY-019-AC-4

**Satisfies:** PH01-R13
Live cursor movement updates the status-facing one-based position immediately, while cursor/selection/restorable view data is synchronized through `SetDocView` without making the ephemeral display a second authority.

### STORY-019-AC-5

**Satisfies:** PH01-R03
The stable F3/F7 document-command interface exposes `getSelection`, `replaceRange`, and `replaceAll`; each programmatic replacement is one Monaco undo edit and routes the resulting text through `UpdateBuffer`, with no outside component reaching into Monaco.

### STORY-019-AC-6

**Satisfies:** PH01-R03, PH01-R05
If `UpdateBuffer` or `SetDocView` fails, the normal envelope/toast path reports the error, the local working copy and latest pending generation are retained, and Redux gains no content.

## Test plan

Each Jest test name begins with its matching `STORY-019-AC-N` id.

- STORY-019-AC-1 — unit — `frontend/src/logic/adapter/useSyncedBuffer.test.ts` — `it('STORY-019-AC-1 coalesces edits in the adapter-owned timer')`.
- STORY-019-AC-2 — unit — `frontend/src/logic/adapter/useSyncedBuffer.test.ts` — `it('STORY-019-AC-2 flushes the latest buffer with ordered acknowledgement')`.
- STORY-019-AC-3 — integration — `frontend/src/ui/widgets/EditorView.integration.test.tsx` — `it('STORY-019-AC-3 preserves Monaco state on metadata patches')` (EC-DOCS-12).
- STORY-019-AC-4 — integration — `frontend/src/logic/hooks/useSyncedBuffer.test.ts` — `it('STORY-019-AC-4 separates live cursor display from restorable view synchronization')`.
- STORY-019-AC-5 — integration — `frontend/src/logic/hooks/useDocumentCommands.test.ts` — `it('STORY-019-AC-5 routes the editable command seam through Monaco and UpdateBuffer')`.
- STORY-019-AC-6 — unit — `frontend/src/logic/adapter/useSyncedBuffer.test.ts` — `it('STORY-019-AC-6 retains the working copy after synchronization failure')`.

## Definition of done

- [ ] Every acceptance criterion has a passing test whose Jest name begins with its `STORY-019-AC-N` id.
- [ ] EC-DOCS-12 has a passing store-connected widget integration test.
- [ ] Controlled-clock tests prove the adapter-owned 200 ms timer, per-document generation ordering, awaitable flush semantics, accepted callback, and failure retention.
- [ ] The bootstrap buffer stays ephemeral, Redux/local storage contain no content, cursor display remains immediate, and restorable view data flows through `SetDocView`.
- [ ] The F3/F7 interface is the only external Monaco mutation seam and programmatic replacements form one undo edit before entering the normal buffer queue.
- [ ] Frontend `prettier --check`, ESLint, `tsc --noEmit`, and Jest pass; backend quality gates pass if backend/generated files are touched.
- [ ] Generated bindings remain current with no unexpected drift.
- [ ] Handler → Service → Repository layering, Result envelopes, backend authority, adapter-only Wails imports, and token-only theming remain intact.
- [ ] `just trace` regenerates the record and `just trace-check` passes with zero orphans and a fresh record.
- [ ] The module inventory is unchanged, or changes are reflected in `01_MODULE_INVENTORY.md` in the same story.
- [ ] Applicable editor integration matches the Phase-01 visual structure, and no background/unsolicited network call, telemetry, or remote runtime asset is introduced.
