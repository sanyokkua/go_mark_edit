---
id: STORY-035
title: Create and open backend documents with authoritative tab order
status: draft
spec_clauses:
  - 01_Product/02_EDITOR_AND_VIEWER_MODES.md#per-document-view-state
  - 01_Product/02_EDITOR_AND_VIEWER_MODES.md#default-open-mode
  - 01_Product/03_FILES_TABS_WORKSPACE.md#new-open-save
  - 01_Product/03_FILES_TABS_WORKSPACE.md#tabs
  - 02_Architecture/02_BACKEND_GO.md#application-model
  - 02_Architecture/05_STATE_AND_PERSISTENCE.md#in-memory-application-model
  - 02_Architecture/05_STATE_AND_PERSISTENCE.md#kv-schema
  - 07_Phases/PHASE_02_FILE_IO_TABS.md#state-and-transition-model
phase_requirements:
  - PH02-R01
  - PH02-R03
  - PH02-R05
  - PH02-R10
  - PH02-R12
modules:
  - internal/appmodel/
  - internal/docs/
  - internal/settings/
acceptance_criteria:
  - STORY-035-AC-1
  - STORY-035-AC-2
  - STORY-035-AC-3
  - STORY-035-AC-4
  - STORY-035-AC-5
  - STORY-035-AC-6
edge_cases:
  - EC-DOCS-11
  - EC-TABS-1
depends_on:
  - STORY-009
  - STORY-011
  - STORY-028
  - STORY-029
  - STORY-033
  - STORY-034
adrs:
  - ADR-0014
  - ADR-0024
phase: 02
owner: coder
estimate: M
---

# STORY-035 — Create and open backend documents with authoritative tab order

## Goal

Let users explicitly create or open documents while the backend owns stable identity, canonical content,
tab order, and the view state applied consistently by every future open route.

## In scope

- Add backend New and path-based Open commands.
- Add authoritative ordered tabs and file/view metadata to appmodel state.
- Persist only per-document view metadata through settings.

## Out of scope

- Native UI command wiring, owned by STORY-039.
- Tab switching/reorder/close, owned by STORY-036.
- Save and external-conflict behavior, owned by STORY-037 and STORY-038.

## Spec inputs

- `01_Product/02_EDITOR_AND_VIEWER_MODES.md#per-document-view-state` — restore backend-owned document view
  state without persisting content.
- `01_Product/02_EDITOR_AND_VIEWER_MODES.md#default-open-mode` — apply the accepted global-mode precedence.
- `01_Product/03_FILES_TABS_WORKSPACE.md#new-open-save` — create empty Editor documents and open supported
  paths through one lifecycle.
- `01_Product/03_FILES_TABS_WORKSPACE.md#tabs` — keep one tab per canonical path.
- `02_Architecture/02_BACKEND_GO.md#application-model` — compose docs/settings under appmodel authority.
- `02_Architecture/05_STATE_AND_PERSISTENCE.md#in-memory-application-model` — start with no restored session.
- `02_Architecture/05_STATE_AND_PERSISTENCE.md#kv-schema` — persist lightweight view values only.
- `07_Phases/PHASE_02_FILE_IO_TABS.md#state-and-transition-model` — implement PH02-T01/T02 preservation.

## Design constraints

- Appmodel owns document identity, canonical content, metadata, ordered tabs, active identity, and revision;
  filesystem I/O occurs outside its global lock.
- The story adds one aggregate exported appmodel seam,
  `ApplyDocumentOpen(DocumentOpenCommand)`, whose discriminated New/Open variants share private creation,
  canonicalization, deduplication, and view-precedence helpers.
- Canonicalize before duplicate detection. One path-based service command is reusable by dialog, OS, drop,
  and tree producers.
- Apply ADR-0024: Reading/Editor first; in Editor restore document view, then last arrangement, then Split.
- Settings holds no document content and requires no schema migration.
- Bound handlers use Handler → Service → Repository, concrete `apperr.*Result`, no `context.Context`, and
  recover to `CodeInternal`; wiring remains in `internal/application`.
- Preserve DD-10–12, DD-27, DD-60, DD-62–64, ADR-0014, adapter-only `wailsjs/`, tokens, and offline behavior.

## Acceptance criteria

### STORY-035-AC-1
**Satisfies:** PH02-R01, PH02-R05

**Given** an initialized application with zero documents, **when** New is commanded, **then** one empty,
never-saved Editor document is appended and activated; startup itself creates no phantom document.

### STORY-035-AC-2
**Satisfies:** PH02-R01, PH02-R05, PH02-R10

**Given** a path already represented by an open canonical path, **when** it is opened through any equivalent
path spelling, **then** the existing document is activated and no duplicate identity is created. (satisfies
EC-DOCS-11 and EC-TABS-1)

### STORY-035-AC-3
**Satisfies:** PH02-R03, PH02-R05

An opened document receives stable identity, canonical content, disk baseline/fingerprint, encoding and
line-ending metadata, file capability, dirty state, and view metadata in one backend commit.

### STORY-035-AC-4
**Satisfies:** PH02-R05

The backend snapshot and every successful New/Open patch expose authoritative tab order and a tab-set
revision without exposing inactive document content.

### STORY-035-AC-5
**Satisfies:** PH02-R01, PH02-R12

Dialog, OS, drop, and tree path opens use the same precedence: Reading first, otherwise persisted document
view, then last arrangement, then Split; New always uses Editor.

### STORY-035-AC-6
**Satisfies:** PH02-R05, PH02-R12

Per-document view mode and arrangement persist through typed KV values, while canonical content, raw bytes,
disk baseline, and open tab membership are never persisted.

## Test plan

- STORY-035-AC-1 — unit — `internal/appmodel/file_lifecycle_test.go` —
  `TestSTORY035AC1ExplicitNewAndEmptyStartup`.
- STORY-035-AC-2 — integration — `internal/appmodel/file_lifecycle_test.go` —
  `TestSTORY035AC2CanonicalOpenDeduplication_EC_DOCS_11_EC_TABS_1`.
- STORY-035-AC-3 — integration — `internal/appmodel/file_lifecycle_test.go` —
  `TestSTORY035AC3CommitsDocumentMetadataAtomically`.
- STORY-035-AC-4 — unit — `internal/appmodel/file_lifecycle_test.go` —
  `TestSTORY035AC4ProjectsAuthoritativeTabOrderWithoutContent`.
- STORY-035-AC-5 — unit — `internal/appmodel/file_lifecycle_test.go` —
  `TestSTORY035AC5AppliesUniformOpenPrecedence`.
- STORY-035-AC-6 — integration — `internal/settings/service_test.go` —
  `TestSTORY035AC6PersistsViewMetadataOnly`.

## Definition of done

- [ ] Every AC and declared edge has a passing named test.
- [ ] Path aliases and all four entry sources exercise one canonical deduplication contract.
- [ ] Filesystem work is proven outside the appmodel lock.
- [ ] Tests prove the one aggregate New/Open seam and no additional exported command family.
- [ ] Zero-document startup and content-free snapshots remain valid.
- [ ] Backend format, vet, lint, race tests, and binding generation pass.
- [ ] Layering, Result envelopes, backend authority, adapter boundary, tokens, and offline behavior hold.
- [ ] `just trace` and `just trace-check` pass during implementation.
- [ ] The module inventory is unchanged.
