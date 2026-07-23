---
id: STORY-038
title: Guard external file changes with revision-bound decisions
status: draft
spec_clauses:
  - 01_Product/01_FUNCTIONAL_REQUIREMENTS.md#documents--files-docs
  - 01_Product/03_FILES_TABS_WORKSPACE.md#edge-cases
  - 07_Phases/PHASE_02_FILE_IO_TABS.md#state-and-transition-model
  - 07_Phases/PHASE_02_FILE_IO_TABS.md#edge-and-failure-cases
phase_requirements:
  - PH02-R07
  - PH02-R10
  - PH02-R13
modules:
  - internal/appmodel/
  - internal/docs/
  - internal/apperr/
acceptance_criteria:
  - STORY-038-AC-1
  - STORY-038-AC-2
  - STORY-038-AC-3
  - STORY-038-AC-4
  - STORY-038-AC-5
  - STORY-038-AC-6
edge_cases:
  - EC-DOCS-2
  - EC-DOCS-3
depends_on:
  - STORY-036
  - STORY-037
adrs:
  - ADR-0014
  - ADR-0024
  - ADR-0021
  - ADR-0022
phase: 02
owner: coder
estimate: M
---

# STORY-038 — Guard external file changes with revision-bound decisions

## Goal

Detect a changed or deleted backing file before overwrite and let the user reload or deliberately keep the
working copy without authorizing a later, different disk version.

## In scope

- Add disk-version checks and external-conflict state to appmodel.
- Add Reload and revision-bound Keep-mine execution.
- Model deleted backing files as recoverable detached documents.

## Out of scope

- Focus/save checkpoint hooks, owned by STORY-042.
- Prompt presentation, owned by STORY-043.
- Background file watching, which Phase 02 excludes.

## Spec inputs

- `01_Product/01_FUNCTIONAL_REQUIREMENTS.md#documents--files-docs` — detect external modification and
  deletion without silent overwrite.
- `01_Product/03_FILES_TABS_WORKSPACE.md#edge-cases` — retain recoverable content and explicit choices.
- `07_Phases/PHASE_02_FILE_IO_TABS.md#state-and-transition-model` — implement PH02-T08 preservation.
- `07_Phases/PHASE_02_FILE_IO_TABS.md#edge-and-failure-cases` — prove modification and deletion rows.

## Design constraints

- A disk version combines canonical path, size, modification time, and SHA-256 raw-byte digest.
- The story adds one aggregate exported appmodel seam,
  `ResolveExternalChange(ExternalChangeCommand)`, whose Check/Reload/KeepMine variants use private
  fingerprint, classification, and token helpers.
- Filesystem work occurs outside the model lock; commit revalidates document identity/revision.
- ADR-0024 allows Reload-only for read-only conflicts and Reload/Keep mine for writable conflicts.
- ADR-0021 supplies active reload content only through a bound acknowledgement; patches stay content-free.
- ADR-0022 governs successful Keep-mine writes whose following patch cannot be delivered.
- Preserve layering, Result envelopes, DD-62–64, ADR-0014, adapter-only Wails imports, tokens, and offline.

## Acceptance criteria

### STORY-038-AC-1
**Satisfies:** PH02-R10

External comparison identifies the exact canonical path, size, modification time, and raw-byte SHA-256
version observed before a write.

### STORY-038-AC-2
**Satisfies:** PH02-R10, PH02-R13

**Given** the observed disk version differs from the document baseline, **when** a check runs, **then** the
backend records a conflict without replacing canonical content or writing disk. (satisfies EC-DOCS-2)

### STORY-038-AC-3
**Satisfies:** PH02-R10, PH02-R13

Reload re-reads and atomically replaces canonical content, BOM/encoding, LF/CRLF/mixed metadata, read-only
capability, disk baseline, and dirty state; an active reload returns a matching active-buffer acknowledgement
and an inactive reload emits no content.

### STORY-038-AC-4
**Satisfies:** PH02-R10, PH02-R13

Keep mine is available only for an editable document and issues one token bound to document identity,
canonical path, and exact observed disk version; a read-only conflict offers Reload only and receives no
write token.

### STORY-038-AC-5
**Satisfies:** PH02-R10, PH02-R13

A writable Keep-mine token is invalidated by reload, successful Save, successful Save As, close, path
change, use, or a second disk change; an invalid token performs no write and requires a current decision.
(satisfies EC-DOCS-2)

### STORY-038-AC-6
**Satisfies:** PH02-R07, PH02-R10

A deleted backing file becomes detached and dirty while retaining canonical content; an explicit Save
recreates it through the ordinary guarded atomic path. (satisfies EC-DOCS-3)

## Test plan

- STORY-038-AC-1 — unit — `internal/appmodel/external_change_test.go` —
  `TestSTORY038AC1BuildsExactDiskVersion`.
- STORY-038-AC-2 — integration — `internal/appmodel/external_change_test.go` —
  `TestSTORY038AC2DetectsWithoutOverwriting_EC_DOCS_2`.
- STORY-038-AC-3 — integration — `internal/appmodel/external_change_test.go` —
  `TestSTORY038AC3ReloadUsesBoundAcknowledgement`.
- STORY-038-AC-4 — unit — `internal/appmodel/external_change_test.go` —
  `TestSTORY038AC4ReadOnlyReloadOnlyAndEditableKeepMine`.
- STORY-038-AC-5 — race/integration — `internal/appmodel/external_change_test.go` —
  `TestSTORY038AC5InvalidatesKeepMineAtEveryLifecycleBoundary_EC_DOCS_2`.
- STORY-038-AC-6 — integration — `internal/appmodel/external_change_test.go` —
  `TestSTORY038AC6DeletedFileCanBeRecreated_EC_DOCS_3`.

## Definition of done

- [ ] Every AC and declared edge has explicit passing evidence.
- [ ] Adversarial tests change bytes while retaining size/mtime and change again after prompt creation.
- [ ] Reload/Keep-mine tokens cannot cross document or path identity.
- [ ] Tests prove the one aggregate external-change seam and private supporting helpers.
- [ ] Reload reclassification and read-only Reload-only behavior are atomic and exact.
- [ ] No content appears in ordinary patches.
- [ ] Backend race, formatting, vet, and lint gates pass; bindings are drift-free.
- [ ] Architecture, adapter, token, and offline invariants hold.
- [ ] `just trace` and `just trace-check` pass.
- [ ] The module inventory is unchanged.
