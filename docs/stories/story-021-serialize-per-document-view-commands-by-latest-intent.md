---
id: STORY-021
title: Serialize per-document view commands by latest intent
status: ready
spec_clauses:
  - 01_Product/02_EDITOR_AND_VIEWER_MODES.md#view-mode-toggle
  - 01_Product/02_EDITOR_AND_VIEWER_MODES.md#per-document-view-state
  - 02_Architecture/03_FRONTEND_REACT.md#adapter-layer
  - 02_Architecture/03_FRONTEND_REACT.md#state-ownership
  - 03_NonFunctional/02_PERFORMANCE.md#2-editor-responsiveness
  - 00_Foundation/04_DESIGN_DECISIONS.md#14-application-state-ownership
  - 07_Phases/PHASE_01_CORE_EDITOR.md#scope
phase_requirements:
  - PH01-R07
modules:
  - logic/adapter/
acceptance_criteria:
  - STORY-021-AC-1
  - STORY-021-AC-2
  - STORY-021-AC-3
  - STORY-021-AC-4
  - STORY-021-AC-5
  - STORY-021-AC-6
edge_cases: []
depends_on:
  - STORY-019
  - STORY-020
adrs:
  - ADR-0014
phase: 01
owner: coder
estimate: M
---

# STORY-021 — Serialize per-document view commands by latest intent

## Goal
Ensure each document's cursor, selection, and explicit view-arrangement changes reach the backend in latest-user-intent order even when bridge requests are delayed or fail.

## In scope
- Replace the separate timed and explicit `SetDocView` paths with one per-document latest-intent queue owned by `appModelAdapter`.
- Serialize timed cursor/selection updates, explicit arrangement and pane-visibility commands, and `flushDocView` through that queue.
- Ensure an older in-flight cursor/selection request cannot become the effective state after a newer explicit arrangement command, regardless of deferred request completion order.
- Coalesce unsent timed updates to the newest view intent and let explicit commands replace older unsent intent for the same document.
- Retain the newest unsent intent after a bridge/envelope failure and preserve the existing toast path.
- Preserve the public adapter method signatures and backend command → `state:patch` ownership.

## Out of scope
- Keeping the Monaco instance mounted while Preview-only is visible, owned by STORY-022.
- Moving `DocumentCommandAPI` to an application/editor-session boundary, owned by STORY-023.
- Changing `AppModelHandler.SetDocView`, its Result envelope, generated bindings, or backend `DocView` ownership.
- Optimistic Redux view mutations or a frontend-authoritative arrangement fallback.

## Spec inputs
- `01_Product/02_EDITOR_AND_VIEWER_MODES.md#view-mode-toggle` — make the primary segmented control and secondary pane toggles converge on one backend-owned arrangement.
- `01_Product/02_EDITOR_AND_VIEWER_MODES.md#per-document-view-state` — preserve each document's cursor, selection, scroll, and arrangement, with explicit user arrangement changes taking precedence.
- `02_Architecture/03_FRONTEND_REACT.md#adapter-layer` — keep guarded/unwrapped Wails calls, serialization, and failure toasting inside the adapter singleton.
- `02_Architecture/03_FRONTEND_REACT.md#state-ownership` — send UI intents as backend commands and render only the resulting `state:patch`; never make the queue a second source of truth.
- `03_NonFunctional/02_PERFORMANCE.md#2-editor-responsiveness` — coalesce cursor/selection traffic off the immediate caret path while retaining flush boundaries.
- `00_Foundation/04_DESIGN_DECISIONS.md#14-application-state-ownership` — apply DD-62/DD-63/DD-64: backend-owned per-document state, disposable projection, and a responsive working editor copy.
- `07_Phases/PHASE_01_CORE_EDITOR.md#scope` — remediate the Phase-01 `SetDocView` command path without expanding into file, tab, or durable-state work.

## Design constraints
- `logic/adapter/` owns one independent queue per document; no two view-intent bindings for the same document execute concurrently, while different documents remain independent.
- Timed cursor/selection changes remain coalesced at the existing 200 ms interval. Explicit arrangement commands and `flushDocView` join the same queue rather than bypassing an in-flight request.
- Queue entries are immutable snapshots with monotonically ordered intent identity. The latest intent replaces older unsent intent; completion of an older sent snapshot cannot enqueue or reapply it after a newer explicit intent.
- A failed Result follows `unwrap` into the existing notification/toast path. Failure retention chooses the newest unsent intent, never overwriting it with the older failed snapshot.
- Existing `setDocView`, `updateDocView`, and `flushDocView` signatures remain stable; no new bound/public backend API is introduced.
- The backend remains authoritative: commands mutate `internal/appmodel`, `state:patch` reconciles Redux, and the queue does not optimistically dispatch view state (DD-62/DD-63/DD-64; ADR-0014).
- Handler → Service → Repository layering and concrete `apperr.*Result` envelopes remain unchanged; only `logic/adapter/` imports `wailsjs/`.
- Styling remains token-only, and no background/unsolicited network call, telemetry, or remote asset is introduced (DD-28 through DD-32, ADR-0011).

## Acceptance criteria

### STORY-021-AC-1
**Satisfies:** PH01-R07
**Given** timed cursor/selection changes, an explicit arrangement command, and a `flushDocView` for one document, **when** they overlap, **then** their `SetDocView` bindings execute serially through one per-document queue.

### STORY-021-AC-2
**Satisfies:** PH01-R07
**Given** an older cursor/selection request in flight and a newer explicit arrangement intent queued behind it, **when** a deferred-promise harness attempts both resolver orders, **then** the newer binding has not started before the older one settles, the final effective command is the newer intent, and the older request is never reissued after it.

### STORY-021-AC-3
**Satisfies:** PH01-R07
**Given** multiple unsent timed view updates followed by a newer replacement intent for one document, **when** the queue advances, **then** only the newest unsent view snapshot is sent.

### STORY-021-AC-4
**Satisfies:** PH01-R07
**Given** a pending timer or in-flight view request, **when** `flushDocView(documentId)` is called, **then** it waits for the queue and resolves only after the newest intent current at invocation has been accepted exactly once.

### STORY-021-AC-5
**Satisfies:** PH01-R07
**Given** a view request failure and a newer unsent intent, **when** the queue reports the failure, **then** the existing toast path is used and the newer intent remains available for the next flush or replacement.

### STORY-021-AC-6
**Satisfies:** PH01-R07
The adapter retains the existing `setDocView`, `updateDocView`, and `flushDocView` signatures; invoking them does not mutate Redux until a backend `state:patch` is reconciled.

## Test plan
- STORY-021-AC-1 — unit — `frontend/src/logic/adapter/appModelAdapter.test.ts` — `it('STORY-021-AC-1 serializes every document view intent')`.
- STORY-021-AC-2 — unit — `frontend/src/logic/adapter/appModelAdapter.test.ts` — `it('STORY-021-AC-2 serializes both attempted resolver orders around newer explicit intent')`.
- STORY-021-AC-3 — unit — `frontend/src/logic/adapter/appModelAdapter.test.ts` — `it('STORY-021-AC-3 replaces unsent view intent with the latest')`.
- STORY-021-AC-4 — unit — `frontend/src/logic/adapter/appModelAdapter.test.ts` — `it('STORY-021-AC-4 flushes the latest document view intent')`.
- STORY-021-AC-5 — unit — `frontend/src/logic/adapter/appModelAdapter.test.ts` — `it('STORY-021-AC-5 retains newest unsent intent after failure')`.
- STORY-021-AC-6 — unit — `frontend/src/logic/adapter/appModelAdapter.test.ts` — `it('STORY-021-AC-6 preserves adapter signatures and command-to-patch ownership')`.

## Definition of done
- [ ] Every acceptance criterion has a passing Jest test whose name begins with its `STORY-021-AC-N` id.
- [ ] Deferred-promise tests cover both attempted resolver orders without concurrent same-document bindings, plus failure, pending replacement, latest-intent retry, and flush while a request is in flight.
- [ ] Per-document queue isolation is proved and all same-document `SetDocView` calls are serialized.
- [ ] Existing adapter signatures, guarded bindings, `unwrap` toast behavior, and backend command → patch ownership are preserved.
- [ ] Frontend `prettier --check`, ESLint, `tsc --noEmit`, and Jest pass; backend gates pass if backend/generated files are touched.
- [ ] Generated bindings remain current with no unexpected drift.
- [ ] Handler → Service → Repository layering, Result envelopes, backend authority, adapter-only Wails imports, and token-only theming remain intact.
- [ ] `just trace` regenerates the record and `just trace-check` passes with zero orphans and a fresh record.
- [ ] The module inventory is unchanged, or changes are reflected in `01_MODULE_INVENTORY.md` in the same story.
- [ ] No background/unsolicited network call, telemetry, or remote runtime asset is introduced.
