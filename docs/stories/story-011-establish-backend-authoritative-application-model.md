---
id: STORY-011
title: Establish the backend-authoritative in-memory application model
status: done
spec_clauses:
  - 02_Architecture/02_BACKEND_GO.md#application-model
  - 02_Architecture/05_STATE_AND_PERSISTENCE.md#in-memory-application-model
  - 02_Architecture/04_WAILS_INTEGRATION.md#bind-enumbind
  - 02_Architecture/06_ERROR_HANDLING.md#result-envelopes
  - 00_Foundation/04_DESIGN_DECISIONS.md#14-application-state-ownership
  - 00_Foundation/06_IMPLEMENTATION_STAGES.md#3-forward-compatibility-constraints-per-stage
  - 07_Phases/PHASE_01_CORE_EDITOR.md#scope
modules:
  - internal/appmodel/
  - internal/apperr/
  - internal/application/
acceptance_criteria:
  - STORY-011-AC-1
  - STORY-011-AC-2
  - STORY-011-AC-3
  - STORY-011-AC-4
  - STORY-011-AC-5
  - STORY-011-AC-6
  - STORY-011-AC-7
edge_cases: []
depends_on:
  - STORY-010
adrs:
  - ADR-0001
  - ADR-0014
phase: 01
owner: coder
estimate: L
---

# STORY-011 — Establish the backend-authoritative in-memory application model

## Goal
Give the first in-memory document one stable backend-owned identity and canonical buffer so the editor, preview, status, and later file and assistant features can rely on one application model without frontend/backend state drift.

## In scope
- Add the mutex-guarded `internal/appmodel` service and handler for exactly one clean untitled document, its canonical content and derived metadata, its per-document view data, and the in-memory application layout.
- Mint an opaque stable document id in the backend. `StateResult.Data` contains a metadata-only `AppStateSnapshot` plus a separate `ActiveBuffer { documentId, content }`; wire values use canonical `utf-8` / `lf` strings while UI formatting remains a frontend concern.
- Add the exact bound surface: `GetState() apperr.StateResult`, `UpdateBuffer(documentId, content) apperr.VoidResult`, `SetDocView(documentId, view) apperr.VoidResult`, and `SetUILayout(layout) apperr.VoidResult`.
- Add a package-owned F2 content accessor and route `UpdateBuffer` through the stable F3 document-command seam rather than mutating a bare string ad hoc.
- Define `AppStatePatch` with a monotonic revision and optional changed sections keyed by document id, explicit replacement/merge semantics, and no content or `activeBuffer` field.
- Define document view input as `editorVisible`, `previewVisible`, cursor/selection, and restorable view data; derive Editor/Split/Preview arrangement from pane visibility.
- Emit exactly one revisioned content-free `state:patch` after every successful `UpdateBuffer`, `SetDocView`, or `SetUILayout`; invalid or failed commands emit none.
- Wire the handler through `internal/application`, `main.go`, and regenerated TypeScript bindings.

## Out of scope
- File open/save, tabs, autosave, workspaces, and durable document identity by path, owned by Phase 02.
- Persisting per-document view state or application layout, owned by Phase 08; Phase 01 keeps both in memory.
- Frontend projection, presentational Monaco integration, synchronization/command seam, and preview rendering, owned by STORY-012 through STORY-019.
- Stage-3 assistant behavior; this story only preserves the F2/F3 seams it will consume.

## Spec inputs
- `02_Architecture/02_BACKEND_GO.md#application-model` — make `internal/appmodel` the mutex-guarded owner of canonical content, document metadata, document view state, and UI layout, exposed through query/command/event shapes.
- `02_Architecture/05_STATE_AND_PERSISTENCE.md#in-memory-application-model` — keep document content in Go memory rather than SQLite or frontend state and retain file-first clean startup semantics.
- `02_Architecture/04_WAILS_INTEGRATION.md#bind-enumbind` — bind only the handler, expose concrete result envelopes, and emit mutations as `state:patch` events.
- `02_Architecture/06_ERROR_HANDLING.md#result-envelopes` — return one payload-specific envelope per bound method and represent failures through `WireError`.
- `00_Foundation/04_DESIGN_DECISIONS.md#14-application-state-ownership` — apply DD-62 through DD-64: backend authority, disposable frontend projection, and a debounce-synced visible buffer with no content echo.
- `00_Foundation/06_IMPLEMENTATION_STAGES.md#3-forward-compatibility-constraints-per-stage` — provide stable document identity, content access, and command seams without building Stage-3 functionality.
- `07_Phases/PHASE_01_CORE_EDITOR.md#scope` — start with one in-memory untitled document, the four Phase-01 query/commands, and no file I/O or durable layout write.

## Design constraints
- Preserve Handler → Service → Repository layering: `AppModelHandler` delegates to `AppModelService`; package-owned interfaces describe event emission and later I/O collaborators; all concrete wiring remains in `internal/application` plus `main.go`.
- `GetState` returns `apperr.StateResult`; `UpdateBuffer`, `SetDocView`, and `SetUILayout` return `apperr.VoidResult`. Bound methods take no `context.Context`, convert panics with `defer/recover` to `CodeInternal`, and leave `internal/apperr` as a leaf.
- `internal/appmodel` is the only owner of canonical document content and live view/layout state; mutations are mutex-guarded and emit content-free derived patches (DD-62, DD-63, DD-64; ADR-0014).
- `StateResult.Data` has the wire shape `{ snapshot: AppStateSnapshot, activeBuffer: ActiveBuffer }`; the metadata-only snapshot carries the current revision, `ActiveBuffer` is `{ documentId, content }`, backend ids are opaque/stable, and encoding/line-ending wire values are canonical lowercase.
- `AppStatePatch` has `revision` plus optional sections: `documents.upsert` is a record keyed by document id whose values replace complete metadata DTOs, `documents.remove` deletes named ids, a present `activeDocumentId` replaces that scalar, and `ui` merges only its named layout fields. No patch contains content or `activeBuffer`.
- `SetDocView` accepts `DocViewInput { editorVisible, previewVisible, cursor, selection, scroll }`, with one-based cursor/selection coordinates and explicit editor/preview scroll offsets; it derives arrangement and rejects both panes hidden, invalid ranges, or negative offsets without mutation or patch emission.
- Every successful mutating command emits exactly one patch after mutation; validation, service, or recovered-panic failures emit none.
- `SetUILayout` is in-memory only in this phase. Phase 08 and ADR-0013 own durable UI-layout persistence; ADR-0013 is deferred context and is not applied by this story.
- Generated Wails bindings may be consumed only through `logic/adapter/`; token-only theming remains unchanged.
- Preserve the Stage-1/2 zero-network invariant, bundled assets, local-only logging, CGO-free Wails v2, and multi-instance behavior (ADR-0001, ADR-0014).

## Acceptance criteria

### STORY-011-AC-1
`GetState` returns one backend-minted stable-ID, clean untitled document with an empty metadata path whose metadata-only `AppStateSnapshot` uses `utf-8`/`lf` wire values and Split view, plus a separate `ActiveBuffer` containing that document id and empty canonical content.

### STORY-011-AC-2
`UpdateBuffer` routes through the package-owned F3 document-command seam, changes canonical Go content exposed by the stable F2 accessor, derives dirty state, and counts non-empty Unicode whitespace-delimited tokens. Returning to the empty baseline clears dirty.

### STORY-011-AC-3
Every successful `UpdateBuffer`, `SetDocView`, and `SetUILayout` emits exactly one `state:patch` with a monotonic revision and explicit keyed section semantics; the patch contains derived changes but no content or active-buffer field, and a failed command emits none.

### STORY-011-AC-4
`SetDocView(documentId, view)` stores validated one-based cursor/selection and editor/preview scroll offsets, derives Editor/Split/Preview arrangement from `editorVisible` and `previewVisible`, and rejects both panes hidden, invalid ranges, or negative offsets without mutation or patch emission.

### STORY-011-AC-5
`SetUILayout` updates and emits the in-memory application layout without writing persistence; durable layout remains Phase 08.

### STORY-011-AC-6
`GetState()` returns `apperr.StateResult`; `UpdateBuffer(documentId, content)`, `SetDocView(documentId, view)`, and `SetUILayout(layout)` return `apperr.VoidResult`; all take no context parameter and convert service panics to `CodeInternal` without emitting a patch.

### STORY-011-AC-7
The handler is wired in the composition root, Wails-bound, and represented by regenerated TypeScript bindings.

## Test plan
Each named test begins with its matching `Proves: STORY-011-AC-N` tag on the first leading-comment line.

- STORY-011-AC-1 — unit — `internal/appmodel/service_test.go` — `TestInitialStateCreatesCleanUntitledDocument`.
- STORY-011-AC-2 — unit — `internal/appmodel/service_test.go` — `TestUpdateBufferUsesDocumentCommandSeamAndContentAccessor`.
- STORY-011-AC-3 — unit — `internal/appmodel/service_test.go` — `TestSuccessfulCommandsEmitOneRevisionedContentFreePatch`.
- STORY-011-AC-4 — unit — `internal/appmodel/service_test.go` — `TestSetDocViewKeepsAtLeastOnePaneVisible`.
- STORY-011-AC-5 — unit — `internal/appmodel/service_test.go` — `TestSetUILayoutUpdatesOnlyInMemoryLayout`.
- STORY-011-AC-6 — unit — `internal/appmodel/handler_test.go` — `TestHandlerReturnsTypedResultsAndRecoversPanics`.
- STORY-011-AC-7 — architecture — `main_test.go` — `TestAppModelHandlerIsBoundAndGenerated`.

## Definition of done
- [ ] Every acceptance criterion has a passing test whose first leading-comment line names its `STORY-011-AC-N` id.
- [ ] Every edge case in `edge_cases:` has a passing test; this story declares none.
- [ ] `internal/appmodel` proves the DTO/revision semantics, stable F2/F3 seam, one-patch-per-success rule, no-patch-on-failure rule, and fixed Unicode whitespace word count.
- [ ] Backend `gofmt`, `go vet`, `golangci-lint`, and `go test -race ./...` pass; frontend quality gates pass for regenerated bindings if touched.
- [ ] Wails bindings are regenerated for the exact bound signatures and have no unexpected drift.
- [ ] Handler → Service → Repository layering, concrete Result envelopes, panic recovery, the `internal/apperr` leaf boundary, backend-authoritative state, adapter-only Wails imports, and token-only theming remain intact.
- [ ] `just trace` regenerates the record and `just trace-check` passes with zero orphans and a fresh record.
- [ ] The module inventory is unchanged, or changes are reflected in `01_MODULE_INVENTORY.md` in the same story.
- [ ] No background/unsolicited network call, telemetry, remote runtime asset, file I/O, content persistence, or premature Phase-08 layout persistence is introduced.
