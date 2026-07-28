---
id: STORY-029
title: Add an atomic backend document snapshot seam
status: done
spec_clauses:
  - ../../../_archive-2026-07-28-specification/02_Architecture/02_BACKEND_GO.md#application-model
  - ../../../_archive-2026-07-28-specification/02_Architecture/05_STATE_AND_PERSISTENCE.md#in-memory-application-model
  - ../../../_archive-2026-07-28-specification/00_Foundation/06_IMPLEMENTATION_STAGES.md#stage-1-must-leave-open
  - ../../../_archive-2026-07-28-specification/02_Architecture/08_LLM_INTEGRATION.md#forward-compat-seams
  - 07_Phases/PHASE_09_ASSETS_SECURITY.md#cross-phase-contracts
  - 07_Phases/PHASE_12_ACTIONS_PROOFREAD_REFORMAT.md#cross-phase-contracts
phase_requirements:
  - PH01-R01
  - PH01-R09
modules:
  - internal/appmodel/
acceptance_criteria:
  - STORY-029-AC-1
  - STORY-029-AC-2
  - STORY-029-AC-3
  - STORY-029-AC-4
  - STORY-029-AC-5
edge_cases: []
depends_on:
  - STORY-011
adrs:
  - ADR-0014
  - ADR-0017
phase: 01
owner: coder
estimate: M
---

> **Historical vocabulary — this story is not maintained.** The `AC-…`, `EC-…` and `DD-…` identifiers are the scheme of the pre-2026-07-28 specification; `spec_clauses` and `phase_requirements` point into `_archive-2026-07-28-specification/`, which is kept so a citation still resolves and is **not normative**. See `README.md`. If anything here disagrees with the code, the code is the truth.
> A link beginning `07_Phases/` names a retired phase document that was deleted rather than archived; that set is in git at `e1bd33f`.

# STORY-029 — Add an atomic backend document snapshot seam

## Goal

Give trusted backend consumers one coherent view of the active document's identity, path, canonical text,
selection, and revision so later asset and assistant work cannot combine fields from different mutations.

## In scope

- Add `DocumentSnapshot` and change the existing `DocumentContentAccessor` surface to return the active
  document atomically.
- Read every snapshot field under one application-model lock.
- Reuse the existing typed `*apperr.AppError`/`CodeNotFound` representation with a safe active-document
  target label when no document is active, without changing `internal/apperr`.
- Prove race safety, field coherence, and the content-free event/projection boundary.

## Out of scope

- A Wails-bound frontend content query or generated binding.
- Frontend working-copy selection and replacement commands, owned by STORY-030.
- Asset authorization, formatting, or assistant tool implementation in later phases.

## Spec inputs

- `../../../_archive-2026-07-28-specification/02_Architecture/02_BACKEND_GO.md#application-model` — read stable identity, canonical content, selection,
  and revision from the one mutex-guarded model.
- `../../../_archive-2026-07-28-specification/02_Architecture/05_STATE_AND_PERSISTENCE.md#in-memory-application-model` — keep live document content in
  Go memory and outside durable/frontend state.
- `../../../_archive-2026-07-28-specification/00_Foundation/06_IMPLEMENTATION_STAGES.md#stage-1-must-leave-open` — complete F2's first-class document
  identity and content/selection accessor.
- `../../../_archive-2026-07-28-specification/02_Architecture/08_LLM_INTEGRATION.md#forward-compat-seams` — let later backend tools consume F2 without
  reaching into Monaco.
- `07_Phases/PHASE_09_ASSETS_SECURITY.md#cross-phase-contracts` — provide stable identity/path context for
  later least-privilege asset resolution.
- `07_Phases/PHASE_12_ACTIONS_PROOFREAD_REFORMAT.md#cross-phase-contracts` — provide the canonical acknowledged
  document/selection snapshot used after editor flush.

## Design constraints

- The sole new exported top-level symbol is `DocumentSnapshot`, with exactly `DocumentID`, `Path`, `Content`,
  `Selection`, and `Revision` fields. Do not add a second accessor interface, result/envelope type, or error.
- Reuse the existing `DocumentContentAccessor` interface and `AppModelService.ContentAccessor()` entry point.
  Replace its content-only method with the exact active-only contract
  `SnapshotActive(ctx context.Context) (DocumentSnapshot, error)`; it accepts no document id, and the existing
  unexported implementation resolves the active id and copies every field under the model's current read lock
  in one critical section (ADR-0017).
- The accessor retains the inner `(T, error)` convention. With no active document it returns a zero
  `DocumentSnapshot` and the existing typed `*apperr.AppError` with `CodeNotFound`, created through the
  existing `apperr.NotFound` helper using the safe target label `active document`. No error/result symbol or
  `internal/apperr` production change is permitted.
- The snapshot is canonical backend state. The visible Monaco working copy may be newer until flushed; this
  API never reads the frontend or claims otherwise (DD-62–64, ADR-0014/0017).
- Reading a snapshot does not mutate revision, emit `state:patch`, or expose content through Redux/events.
- Handler → Service → Repository layering and concrete Result envelopes remain unchanged because this is a
  package-owned backend seam, not a new Wails binding. `internal/apperr` stays an unchanged leaf.
- Adapter-only `wailsjs/`, token-only theming, bundled assets, and no background/unsolicited network remain
  unchanged.

## Acceptance criteria

### STORY-029-AC-1
**Satisfies:** PH01-R01, PH01-R09

The existing `DocumentContentAccessor.SnapshotActive(ctx)` accepts no document id and returns a
`DocumentSnapshot` containing the active document's stable id, path, canonical content, selection, and model
revision; `DocumentSnapshot` is the only new exported top-level symbol.

### STORY-029-AC-2
**Satisfies:** PH01-R01

Concurrent active-document change, mutation, and snapshot tests under `go test -race` observe only one
coherent active document's pre-mutation or post-mutation field set and no data race.

### STORY-029-AC-3
**Satisfies:** PH01-R01, PH01-R09

**Given** no document is active, **when** `SnapshotActive(ctx)` is called, **then** it returns a zero
`DocumentSnapshot` and the existing typed `*apperr.AppError` with `CodeNotFound` and safe `active document`
target semantics through the normal service `(T, error)` contract.

### STORY-029-AC-4
**Satisfies:** PH01-R01

Taking a snapshot does not change the model revision and emits no event; document content remains absent
from `state:patch` and Redux DTOs.

### STORY-029-AC-5
**Satisfies:** PH01-R09

A compile-time test instantiates real fake PH09 and PH12 consumer types against
`DocumentContentAccessor.SnapshotActive(ctx)`, reads the active `DocumentSnapshot`, and proves they require no
Wails binding, frontend type, document-id argument, separate field read, or Monaco dependency.

## Test plan

- STORY-029-AC-1 — unit — `internal/appmodel/service_test.go` —
  `TestDocumentContentAccessorSnapshotActiveReturnsIdentityPathContentSelectionAndRevision`.
- STORY-029-AC-2 — unit — `internal/appmodel/service_test.go` —
  `TestDocumentContentAccessorSnapshotActiveIsCoherentDuringActiveDocumentChanges`.
- STORY-029-AC-3 — unit — `internal/appmodel/service_test.go` —
  `TestDocumentContentAccessorSnapshotActiveReusesTypedNotFoundWhenNoDocumentIsActive`.
- STORY-029-AC-4 — unit — `internal/appmodel/service_test.go` —
  `TestDocumentContentAccessorSnapshotActiveDoesNotMutateEmitOrProjectContent`.
- STORY-029-AC-5 — contract/compile — `internal/appmodel/document_consumer_test.go` —
  `TestSnapshotActiveAccessorCompilesForPH09AndPH12Consumers`.

## Definition of done

- [ ] Every AC has a passing Go test whose first leading-comment line names its `STORY-029-AC-N` id.
- [ ] Race-enabled tests prove one-lock active snapshot coherence under concurrent active-document, content,
  selection, and revision changes.
- [ ] API review proves `DocumentSnapshot` is the sole new exported top-level symbol and the existing
  `DocumentContentAccessor`/`ContentAccessor()` path is replaced rather than duplicated.
- [ ] No Wails binding, generated file, Redux DTO, or patch content field is introduced.
- [ ] `gofmt`, `go vet`, `golangci-lint`, and `go test -race ./...` pass.
- [ ] Handler/service layering, existing `apperr.NotFound`, `internal/apperr` leaf ownership, and backend
  authority remain intact with no `internal/apperr` production edit.
- [ ] Adapter-only Wails access, token-only theming, and offline behavior remain intact.
- [ ] `just trace` and `just trace-check` are run during implementation; the module inventory is unchanged.
