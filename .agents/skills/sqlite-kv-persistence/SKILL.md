---
name: sqlite-kv-persistence
description: >-
  Use when touching GoMarkEdit settings / recent-files persistence, window size or per-document
  view-mode state, the SQLite KV store (internal/db, internal/settings, internal/recent), a goose
  migration, or sqlc queries. Triggers: "database is locked", a new preference key is needed, adding
  a table, editing internal/db/queries/*.sql, or a temptation to add a CGO SQLite driver or a
  single-instance / flock lock.
allowed-tools: Read, Edit, Write, Bash, Glob, Grep
references:
  - references/kv-store-and-keys.md
  - references/engine-and-migrations.md
  - references/playbook-and-troubleshooting.md
related-skills:
  - go-envelope-and-di: the handler/service/DI vertical that wraps a repository
  - wails-dev: where db.Open is called from the lifecycle hooks
  - testing-wails-app: integration tests that exercise a temp SQLite DB
---

# SQLite KV Persistence

GoMarkEdit is file-first: documents live on disk, and a small SQLite key-value store holds only
preferences and lightweight navigation state. The DB uses the CGO-free `modernc.org/sqlite` driver,
opens WAL + `busy_timeout` with a single-writer pool, runs **no single-instance lock**, and evolves
only through additive goose migrations. This skill is the crisp playbook; the engine rules, KV
schema, and migration catalog live in the references.

## When to use

- Adding or reading a scalar preference (theme, autosave, view mode, window size, remote-content policy).
- Adding structured persisted data (e.g. the recent-items table) or a new goose migration.
- Changing a query in `internal/db/queries/*.sql` (then `sqlc generate`).
- Diagnosing DB open, locking, or multi-instance behaviour.

## When NOT to use

- The handler / service / DI shape that wraps a repository → `go-envelope-and-di`.
- DB open wiring inside `main.go` / lifecycle hooks → `wails-dev`.
- Anything that would transmit persisted data off-device (it never does — logs are local, DD-33).

## Workflow

1. **Decide the shape: KV prefix vs. new table.** A few scalar fields → a new dotted key in the
   generic `settings(key,value,type)` table (**no migration**). Structured/relational data (like the
   recent list) → its own table via an additive migration. See `references/kv-store-and-keys.md` for
   the KV schema, typed accessors, the `type`-string table, and the persisted-vs-not list.
2. **Respect the engine invariants.** `modernc.org/sqlite` only (no CGO ever); WAL + `busy_timeout` +
   `SetMaxOpenConns(1)`; **no** flock / single-instance lock; `internal/db/store/` is sqlc-generated and
   never hand-edited. Full DSN and rules in `references/engine-and-migrations.md`.
3. **For a scalar preference:** add a typed `Get*Config` / `Update*Config` to the repo interface +
   `repository_sqlite.go`, passthrough in `service.go`, and (if bound) an envelope method in
   `handler.go`; run `just gen`.
4. **For structured data:** add a **new additive** numbered goose migration + a query in
   `internal/db/queries/*.sql`, run `sqlc generate`, then wire the repository two-phase in
   `internal/application` (see `go-envelope-and-di`). Migration allowed/forbidden matrix is in
   `references/engine-and-migrations.md`.
5. **Validate.** `just check` clean, `just test` for the persistence unit/integration tests, `just
   build` to confirm the CGO-free build still links. Step-by-step numbering and the symptom→fix table
   are in `references/playbook-and-troubleshooting.md`.

## Reference Index

| Reference | Read it for |
|---|---|
| `references/kv-store-and-keys.md` | What is / isn't persisted, the config/DB/log folders, the `settings` table DDL, typed getters, the `type`-string table, key prefixes |
| `references/engine-and-migrations.md` | The `modernc.org/sqlite` DSN + pragmas, no-flock rationale, sqlc rules, the additive-vs-forbidden migration matrix, hard cross-major startup error |
| `references/playbook-and-troubleshooting.md` | The numbered add-a-preference / add-a-table steps and the symptom → cause → fix table |

## Mandatory validation

- [ ] Driver is `modernc.org/sqlite`; no CGO anywhere in the build.
- [ ] DSN sets WAL + `busy_timeout`; `SetMaxOpenConns(1)`; no single-instance lock / flock / `.lock` file.
- [ ] A scalar config reuses the `settings` KV table (no migration); structured data uses its own table.
- [ ] Any migration is additive-only and numbered; no edit to a shipped migration; no row rewrite/backfill.
- [ ] `internal/db/store/` is not hand-edited; `sqlc generate` was run after any query change.
- [ ] Persistence goes through the repository — no ad-hoc settings file; logs stay local (DD-33).
- [ ] `just check` clean; `just build` links the CGO-free binary.

## Gotchas

- `database is locked` under two instances almost always means a missing WAL / `busy_timeout` /
  `SetMaxOpenConns(1)` — set all three; do **not** "fix" it by adding a lock.
- A CGO SQLite driver (`mattn/go-sqlite3`) breaks cross-compiled `wails build` — only
  `modernc.org/sqlite` is allowed.
- Adding a single-instance flock to "prevent a second window" violates DD-08 / ADR-0006 —
  multi-instance is required; remove it.
- Hand-editing `internal/db/store/` is overwritten on the next `sqlc generate` — edit the `.sql` query
  instead.
- Adding a whole table for one boolean is needless — reuse the `settings` KV table with a new dotted key.
- A new preference lost on restart usually means a wrong `type` string, a missing default, or a
  forgotten `UpsertSetting`.
- On launch the app opens **clean** (DD-11): no session restore, no crash recovery, no swap files — do
  not add any.
