---
id: STORY-037
title: Save canonical documents with atomic commit semantics
status: draft
spec_clauses:
  - 01_Product/03_FILES_TABS_WORKSPACE.md#new-open-save
  - 01_Product/03_FILES_TABS_WORKSPACE.md#save-as
  - 02_Architecture/02_BACKEND_GO.md#file-io
  - 02_Architecture/03_FRONTEND_REACT.md#state-ownership
  - 07_Phases/PHASE_02_FILE_IO_TABS.md#state-and-transition-model
phase_requirements:
  - PH02-R02
  - PH02-R03
  - PH02-R09
  - PH02-R10
modules:
  - internal/appmodel/
  - internal/docs/
  - internal/apperr/
acceptance_criteria:
  - STORY-037-AC-1
  - STORY-037-AC-2
  - STORY-037-AC-3
  - STORY-037-AC-4
  - STORY-037-AC-5
  - STORY-037-AC-6
edge_cases:
  - EC-DOCS-7
  - EC-DOCS-10
  - EC-DOCS-13
depends_on:
  - STORY-019
  - STORY-021
  - STORY-029
  - STORY-034
  - STORY-035
adrs:
  - ADR-0014
  - ADR-0024
  - ADR-0022
phase: 02
owner: coder
estimate: M
---

# STORY-037 — Save canonical documents with atomic commit semantics

## Goal

Save the backend's newest accepted document content atomically while preserving newer edits and accurately
reporting which side of the disk-commit boundary failed.

## In scope

- Add canonical Save and Save As appmodel workflows.
- Serialize writes per document without holding the global model lock.
- Commit exact written baselines and guarded Save As path changes.

## Out of scope

- Frontend buffer flushing, owned by STORY-039.
- External conflict resolution, owned by STORY-038.
- Mixed-line confirmation UI, owned by STORY-040.

## Spec inputs

- `01_Product/03_FILES_TABS_WORKSPACE.md#new-open-save` — write the current document and clear dirty only
  after success.
- `01_Product/03_FILES_TABS_WORKSPACE.md#save-as` — use a native destination and retain the old path on
  cancellation/failure.
- `02_Architecture/02_BACKEND_GO.md#file-io` — preserve metadata and use the docs write boundary.
- `02_Architecture/03_FRONTEND_REACT.md#state-ownership` — accept no frontend text; appmodel is canonical.
- `07_Phases/PHASE_02_FILE_IO_TABS.md#state-and-transition-model` — satisfy PH02-T03/T04 preservation.

## Design constraints

- The story adds one aggregate exported appmodel seam, `ApplySave(SaveCommand)`, with Save/SaveAs variants.
  It accepts identity, expected revision, destination/decisions, and an optional backend-issued normalization
  authorization—never document text; all write/commit helpers remain private.
- Snapshot under the appmodel lock, release it for I/O, and commit only if identity/path/revision still
  permit the captured result; serialize saves per document.
- An edit during write remains canonical and dirty after the captured snapshot becomes baseline.
- Save As reserves the canonical destination and rejects a path owned by another open document.
- Apply ADR-0022 after irreversible write success and ADR-0024 for suffix/normalization policy.
- Preserve Handler → Service → Repository, Result envelopes, DD-15/DD-62–64, ADR-0014, adapter-only bridge
  imports, tokens, and offline behavior.

## Acceptance criteria

### STORY-037-AC-1
**Satisfies:** PH02-R02, PH02-R09

The aggregate Save command accepts document identity, expected revision, and any required backend-issued
normalization authorization, writes the backend's captured canonical content, and has no request field
through which frontend text can be supplied. (satisfies EC-DOCS-13)

### STORY-037-AC-2
**Satisfies:** PH02-R02, PH02-R09

Concurrent saves for one document serialize while saves for other documents and model commands can proceed
without waiting on filesystem work under the global lock.

### STORY-037-AC-3
**Satisfies:** PH02-R02, PH02-R09

**Given** a newer edit is accepted during a save, **when** the captured write commits, **then** that snapshot
becomes the disk baseline and the newer canonical revision remains dirty.

### STORY-037-AC-4
**Satisfies:** PH02-R02, PH02-R10

Save As canonicalizes and reserves its destination; a represented destination is rejected without change,
while a successful unrepresented destination updates path/fingerprint/metadata only after atomic commit.
(satisfies EC-DOCS-10)

### STORY-037-AC-5
**Satisfies:** PH02-R02, PH02-R03, PH02-R10

**Given** a mixed-ending document, **when** Save or Save As lacks a matching backend-issued authorization,
**then** it is rejected before disk; a matching authorization is bound to document/content revision and is
consumed by one canonical save attempt.

### STORY-037-AC-6
**Satisfies:** PH02-R02, PH02-R10

A pre-commit failure preserves the old baseline and dirty state, while a post-write patch failure commits
the written baseline and returns successful `resyncRequired` without repeating the write. (satisfies
EC-DOCS-7)

## Test plan

- STORY-037-AC-1 — integration — `internal/appmodel/save_lifecycle_test.go` —
  `TestSTORY037AC1SaveUsesCanonicalBackendContent_EC_DOCS_13`.
- STORY-037-AC-2 — race/integration — `internal/appmodel/save_lifecycle_test.go` —
  `TestSTORY037AC2SerializesPerDocumentWithoutGlobalIOLock`.
- STORY-037-AC-3 — race/integration — `internal/appmodel/save_lifecycle_test.go` —
  `TestSTORY037AC3EditDuringSaveRemainsDirty`.
- STORY-037-AC-4 — integration — `internal/appmodel/save_lifecycle_test.go` —
  `TestSTORY037AC4SaveAsReservesAndCommitsDestination_EC_DOCS_10`.
- STORY-037-AC-5 — integration — `internal/appmodel/save_lifecycle_test.go` —
  `TestSTORY037AC5NormalizationAuthorizationIsRevisionBoundAndSingleUse`.
- STORY-037-AC-6 — integration — `internal/appmodel/save_lifecycle_test.go` —
  `TestSTORY037AC6DistinguishesWriteAndPatchFailure_EC_DOCS_7`.

## Definition of done

- [ ] Every AC and edge has a passing named test.
- [ ] Deferred/race tests cover edit-during-write, same-document serialization, and cross-document progress.
- [ ] Tests prove no frontend text field exists and no filesystem call holds the global model lock.
- [ ] Tests prove the one aggregate Save/SaveAs seam; supporting write helpers remain private.
- [ ] Missing, stale, mismatched, and reused normalization authorizations fail before disk.
- [ ] Bindings and bridge mock are regenerated together if the command surface changes.
- [ ] Backend and applicable frontend quality gates pass.
- [ ] Envelope, authority, adapter, theme, and offline invariants hold.
- [ ] `just trace` and `just trace-check` pass.
- [ ] The module inventory is unchanged.
