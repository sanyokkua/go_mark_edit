# Engine rules and migrations

Authority: `specification/02_Architecture/05_STATE_AND_PERSISTENCE.md` (Migrations, Multi-instance
DB), `specification/02_Architecture/02_BACKEND_GO.md` (Persistence). Design decisions **DD-13** (WAL +
`busy_timeout` concurrency), **DD-08 / ADR-0006** (multi-instance, no lock), **ADR-0004** (SQLite KV
store). Governing rules: `.claude/rules/go-persistence-sqlite.md`,
`.claude/rules/offline-and-privacy.md`. Canonical code: `internal/db/db.go`.

## Engine rules — non-negotiable

- **Driver is `modernc.org/sqlite`** (pure Go, no CGO) — required for cross-compiled `wails build`.
  Never substitute `mattn/go-sqlite3` or any CGO driver.
- **Open with WAL + `busy_timeout` + single-writer pool:**

```go
// internal/db/db.go
import _ "modernc.org/sqlite"

dsn := fmt.Sprintf(
    "file:%s?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)"+
        "&_pragma=foreign_keys(ON)&_pragma=synchronous(NORMAL)", path)
database, err := sql.Open("sqlite", dsn)
if err != nil {
    return nil, err
}
database.SetMaxOpenConns(1) // single writer — avoids "database is locked"
```

- **No single-instance lock**, no `gofrs/flock`, no `.lock` file, no "Already running" branch —
  GoMarkEdit runs multiple instances (DD-08 / ADR-0006). WAL + `busy_timeout` make concurrent
  processes safe; writes are infrequent and last-writer-wins is acceptable for preferences.
- **`internal/db/store/` is sqlc-generated — never hand-edit it.** After changing a query in
  `internal/db/queries/*.sql`, run `sqlc generate` to regenerate `store/`.
- **Migrations** (`internal/db/migrations/*.sql`, goose format, numbered, embedded via `//go:embed`)
  run on `db.Open`.

## Migration: additive vs. forbidden

| Additive (allowed) | Forbidden |
|---|---|
| New nullable column | `ALTER ... DROP` / drop a column |
| New table | `UPDATE` / backfill / rewrite of existing rows |
| New index | Editing a **shipped** migration file |
| New numbered file `0002_*.sql` | `DROP TABLE` / destructive rewrite |

A newer-than-expected or cross-major schema is a **hard startup error**, never an auto-downgrade and
never a silent auto-upgrade that rewrites data. The schema evolves only forward, additively, within
the same major version.

## Why single-writer + WAL, not a lock

Two GoMarkEdit windows share one settings DB. WAL lets readers proceed while a writer holds the write
lock; `busy_timeout(5000)` makes a briefly-contended writer wait rather than fail; `SetMaxOpenConns(1)`
serializes this process's own writes so it never contends with itself. Preferences are tiny and
infrequent, so last-writer-wins across instances is acceptable — a coordinating lock would only add a
crash-cleanup problem the no-lock design avoids entirely.
