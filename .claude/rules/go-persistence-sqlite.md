---
paths:
  - "internal/db/**"
  - "internal/settings/**"
  - "internal/recent/**"
---

# Go persistence (SQLite)

**Authority:** `specification/00_Foundation/04_DESIGN_DECISIONS.md` (DD-03, DD-08, DD-10, DD-13,
ADR-0004, ADR-0006), `specification/06_Process_and_Traceability/01_MODULE_INVENTORY.md`
(`internal/db/`, `internal/settings/`, `internal/recent/`). The DB open path lives in
`internal/db/db.go`; the KV-backed repository in `internal/settings/repository_sqlite.go`.

## DO

- Use the **pure-Go, CGO-free** driver: `import _ "modernc.org/sqlite"` and `sql.Open("sqlite", dsn)`.
- Open with WAL + a busy timeout so concurrent app instances share the DB safely (DD-13):

  ```go
  dsn := fmt.Sprintf(
      "file:%s?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)"+
      "&_pragma=foreign_keys(ON)&_pragma=synchronous(NORMAL)", path)
  database, _ := sql.Open("sqlite", dsn)
  database.SetMaxOpenConns(1) // single writer -- avoids "database is locked"
  ```

- Keep migrations **additive only**, goose-format, numbered (`0001_init.sql`, `0002_*.sql`), embedded
  via `//go:embed migrations/*.sql` and run with `goose` `provider.Up(ctx)` on open.
- Regenerate `internal/db/store/` with `sqlc generate` after any query change; treat it as build output.
- Persist small prefs (settings, recent, window size, per-doc view mode) in the generic KV table
  `settings(key TEXT PK, value TEXT NOT NULL, type TEXT NOT NULL)` with typed getters and `UpsertSetting`:

  ```go
  func (r *SqliteSettingsRepository) getBool(key string, def bool) bool {
      v, err := strconv.ParseBool(r.getSetting(key).Value)
      if err != nil { return def }
      return v
  }
  // one INSERT ... ON CONFLICT(key) DO UPDATE SET value=excluded.value, type=excluded.type
  ```

## DON'T

- **No `gofrs/flock` / single-instance lock** and no `.lock` file. GoMarkEdit runs **multiple instances**
  (DD-08 / ADR-0006); there is no flock/`ErrInstanceLocked` / "Already running" branch.
- No CGO SQLite driver (e.g. `mattn/go-sqlite3`) -- it breaks cross-compiled `wails build`.
- Never hand-edit `internal/db/store/` -- it is always overwritten by sqlc.
- Never write a non-additive migration: no `UPDATE`/backfill/`DROP`/`ALTER ... DROP`/rewrite of existing
  rows or columns. Add a new nullable column / new table / new index instead.
- Don't add a new table/migration for a handful of scalar prefs -- reuse the KV table.

## Authoring checklist

- [ ] Driver is `modernc.org/sqlite`; DSN sets WAL + `busy_timeout`; `SetMaxOpenConns(1)`.
- [ ] No flock / single-instance lock anywhere.
- [ ] New migration is additive and numbered; ran on `db.Open`.
- [ ] Queries changed -> `sqlc generate` re-run; `store/` not hand-edited.
- [ ] New pref uses the KV table with an explicit `type` string and a typed getter/default.
