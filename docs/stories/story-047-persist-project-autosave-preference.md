---
id: STORY-047
title: Persist and project the autosave preference
status: draft
spec_clauses:
  - 01_Product/03_FILES_TABS_WORKSPACE.md#autosave
  - 02_Architecture/05_STATE_AND_PERSISTENCE.md#file-first
  - 02_Architecture/05_STATE_AND_PERSISTENCE.md#kv-schema
  - 07_Phases/PHASE_02_FILE_IO_TABS.md#edge-and-failure-cases
phase_requirements:
  - PH02-R08
modules:
  - internal/settings/
  - logic/adapter/
  - logic/store/
acceptance_criteria:
  - STORY-047-AC-1
  - STORY-047-AC-2
  - STORY-047-AC-3
  - STORY-047-AC-4
  - STORY-047-AC-5
edge_cases:
  - EC-SET-4
depends_on:
  - STORY-009
  - STORY-039
adrs:
  - ADR-0006
  - ADR-0014
phase: 02
owner: coder
estimate: M
---

# STORY-047 — Persist and project the autosave preference

## Goal

Keep the default-on autosave preference backend-owned and durable across application instances while
exposing a typed action for later Settings and menu surfaces.

## In scope

- Add the typed `editor.autosave` setting and default.
- Persist it through the existing shared KV store.
- Project and command it through the adapter/store seam.

## Out of scope

- Autosave scheduling, owned by STORY-048.
- The full Settings dialog/menu and shortcut registry, owned by Phase 08.
- Any document-content persistence.

## Spec inputs

- `01_Product/03_FILES_TABS_WORKSPACE.md#autosave` — autosave existing files by default with a toggle.
- `02_Architecture/05_STATE_AND_PERSISTENCE.md#file-first` — never autosave new buffers or store content.
- `02_Architecture/05_STATE_AND_PERSISTENCE.md#kv-schema` — add typed preferences without a migration.
- `07_Phases/PHASE_02_FILE_IO_TABS.md#edge-and-failure-cases` — disabled autosave leaves dirty state intact.

## Design constraints

- Use the generic settings KV repository; no migration, ad-hoc file, or document content.
- Multiple instances retain WAL/busy-timeout behavior and last committed setting value.
- Backend state owns the preference; Redux is hydrated/patched and never updates optimistically.
- Phase 02 exposes one typed action seam but does not build Phase 08 settings/menu UI.
- Preserve Handler → Service → Repository, Result envelopes, DD-10/DD-12/DD-62–64, ADR-0006/0014,
  adapter-only `wailsjs/`, tokens, and offline.

## Acceptance criteria

### STORY-047-AC-1
**Satisfies:** PH02-R08

`editor.autosave` is a registered Boolean setting whose missing-key default is enabled.

### STORY-047-AC-2
**Satisfies:** PH02-R08

Changing the value persists through the existing KV repository and is restored by a new application
instance without a schema migration.

### STORY-047-AC-3
**Satisfies:** PH02-R08

The appmodel snapshot and settings patch expose the backend-confirmed autosave value and setting revision.

### STORY-047-AC-4
**Satisfies:** PH02-R08

The frontend autosave setting action calls the typed adapter command and keeps the previous projection until
the backend confirms the new value. (satisfies EC-SET-4)

### STORY-047-AC-5
**Satisfies:** PH02-R08

A reusable typed action is available for Phase 08 consumers without introducing the full Settings dialog,
menu item, or shortcut binding in Phase 02.

## Test plan

- STORY-047-AC-1 — unit — `internal/settings/service_test.go` —
  `TestSTORY047AC1AutosaveSettingDefaultsEnabled`.
- STORY-047-AC-2 — integration — `internal/settings/repository_test.go` —
  `TestSTORY047AC2AutosavePersistsWithoutMigration`.
- STORY-047-AC-3 — integration — `frontend/src/logic/store/settingsProjection.test.ts` —
  `it('STORY-047-AC-3 hydrates and patches backend autosave state')`.
- STORY-047-AC-4 — unit — `frontend/src/logic/store/settingsProjection.test.ts` —
  `it('STORY-047-AC-4 changes autosave without optimism (EC-SET-4)')`.
- STORY-047-AC-5 — architecture — `frontend/src/logic/adapter/settingsAdapter.test.ts` —
  `it('STORY-047-AC-5 exposes the typed Phase-08-ready autosave action')`.

## Definition of done

- [ ] Every AC and edge has passing explicit evidence.
- [ ] Persistence tests use the real SQLite repository and preserve WAL/busy-timeout behavior.
- [ ] No migration or document-content storage is introduced.
- [ ] Projection tests cover success, failure, and stale settings patches.
- [ ] Backend/frontend quality and binding gates pass.
- [ ] Architecture, adapter, token, and offline invariants hold.
- [ ] `just trace` and `just trace-check` pass.
- [ ] The module inventory is unchanged.
