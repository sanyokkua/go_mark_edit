---
id: STORY-004
title: Open the multi-instance-safe SQLite store and generated query layer
status: done
spec_clauses:
  - ../../../_archive-2026-07-28-specification/02_Architecture/05_STATE_AND_PERSISTENCE.md#kv-schema
  - ../../../_archive-2026-07-28-specification/02_Architecture/05_STATE_AND_PERSISTENCE.md#migrations
  - ../../../_archive-2026-07-28-specification/02_Architecture/05_STATE_AND_PERSISTENCE.md#multi-instance-db
  - ../../../_archive-2026-07-28-specification/00_Foundation/04_DESIGN_DECISIONS.md#3-persistence--state
phase_requirements:
  - PH00-R04
modules:
  - internal/db/
  - internal/file/
acceptance_criteria:
  - STORY-004-AC-1
  - STORY-004-AC-2
  - STORY-004-AC-3
  - STORY-004-AC-4
edge_cases:
  - EC-SET-1
  - EC-SET-2
depends_on:
  - STORY-003
adrs:
  - ADR-0001
  - ADR-0004
  - ADR-0006
phase: 00
owner: coder
estimate: M
---

> **Historical vocabulary — this story is not maintained.** The `AC-…`, `EC-…` and `DD-…` identifiers are the scheme of the pre-2026-07-28 specification; `spec_clauses` and `phase_requirements` point into `_archive-2026-07-28-specification/`, which is kept so a citation still resolves and is **not normative**. See `README.md`. If anything here disagrees with the code, the code is the truth.

# STORY-004 — Open the multi-instance-safe SQLite store and generated query layer

## Goal
Create the shared, pure-Go persistence base that settings can use safely from independent app instances.

## In scope
- `modernc.org/sqlite` open path, WAL/busy timeout/single-writer configuration, additive goose migrations, and sqlc-generated store inputs.

## Out of scope
- Settings Handler/Service/Repository behaviour, owned by STORY-005.

## Spec inputs
- `../../../_archive-2026-07-28-specification/02_Architecture/05_STATE_AND_PERSISTENCE.md#multi-instance-db` — WAL, timeout, no flock, and classified failures.
- `../../../_archive-2026-07-28-specification/02_Architecture/05_STATE_AND_PERSISTENCE.md#migrations` — additive migrations only.

## Design constraints
- Use only `modernc.org/sqlite`; never hand-edit `internal/db/store/`; retain no document data in SQLite.

## Acceptance criteria
### STORY-004-AC-1
**Satisfies:** PH00-R04
A `modernc.org/sqlite` database opens with WAL, `busy_timeout`, a single-writer pool, and no flock.

### STORY-004-AC-2
**Satisfies:** PH00-R04
Additive goose migrations run before sqlc-backed settings queries become available.

### STORY-004-AC-3
**Satisfies:** PH00-R04
A briefly locked database retries safely without data loss. (EC-SET-1)

### STORY-004-AC-4
**Satisfies:** PH00-R04
A corrupt or newer-than-supported schema follows the specified safe-default or hard-startup-error path. (EC-SET-2)

## Test plan
Each named test begins with its matching `Proves: STORY-004-AC-N` tag.

- STORY-004-AC-1 — integration — `internal/db/database_test.go` — `TestOpenConfiguresCGOFreeWALDatabase`.
- STORY-004-AC-2 — integration — `internal/db/migrations_test.go` — `TestOpenAppliesAdditiveMigrationsAndGeneratedStoreQueries`.
- STORY-004-AC-3 — integration — `internal/db/database_test.go` — `TestOpenRetriesBriefLockContention` (EC-SET-1).
- STORY-004-AC-4 — integration — `internal/db/database_test.go` — `TestOpenRejectsCorruptOrUnsupportedSchemaSafely` (EC-SET-2).

## Definition of done
- [ ] Every AC and both ECs have a `Proves:` test.
- [ ] Migrations are additive, generated store code is untouched, and the race suite passes.
- [ ] Traceability is regenerated and validated before `done`.
