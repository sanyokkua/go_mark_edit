# Adding a migration

There is one migration today, `internal/db/migrations/0001_settings.sql`:

```sql
-- +goose Up
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    type TEXT NOT NULL
);
```

## First, check you need one

Most new state does not need a migration. A scalar preference — a theme name, a boolean, a width in
pixels — is a row in the existing `settings` table:

```go
func (repository *SqliteSettingsRepository) getBool(ctx context.Context, key string, fallback bool) bool {
	row, err := repository.queries.GetSetting(ctx, key)
	if err != nil {
		return fallback
	}
	parsed, err := strconv.ParseBool(row.Value)
	if err != nil {
		return fallback
	}
	return parsed
}
```

Write a migration only for a list of records with their own identity — the provider profiles are the
example that is actually coming.

## The migration itself

```sql
-- internal/db/migrations/0002_providers.sql
-- +goose Up
CREATE TABLE providers (
    id          TEXT PRIMARY KEY,
    kind        TEXT NOT NULL,
    label       TEXT NOT NULL,
    base_url    TEXT NOT NULL,
    api_key_env TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX providers_kind_idx ON providers (kind);
```

Rules that are not negotiable, because several copies of the app share one database file and a user's
other copy may be an older version:

- **Add only.** No `DROP`, no `ALTER TABLE … DROP COLUMN`, no `UPDATE`, no `DELETE`.
- **A new column is nullable or has a `DEFAULT`**, so rows written by the previous version stay valid.
- **Never edit a committed migration.** Machines that already ran `0001` will never run it again, so an
  edit applies to new installations only and the two schemas diverge silently. A correction is `0003`.
- **Number sequentially** with four digits. goose orders by filename.

The file is picked up automatically — `internal/db` embeds `migrations/*.sql` and runs goose on
`db.Open`, so there is no registration step.

## Then the query, then the generated code

```sql
-- internal/db/queries/providers.sql
-- name: ListProviders :many
SELECT id, kind, label, base_url, api_key_env
FROM providers
ORDER BY label;

-- name: UpsertProvider :exec
INSERT INTO providers (id, kind, label, base_url, api_key_env)
VALUES (sqlc.arg(id), sqlc.arg(kind), sqlc.arg(label), sqlc.arg(base_url), sqlc.arg(api_key_env))
ON CONFLICT(id) DO UPDATE SET
    kind = excluded.kind,
    label = excluded.label,
    base_url = excluded.base_url,
    api_key_env = excluded.api_key_env;
```

```bash
sqlc generate     # rewrites internal/db/store/
just sqlc-check   # fails if the committed store/ disagrees with the SQL
```

`internal/db/store/` is build output. Editing it is always wrong and always silently reverted by the
next person who runs `sqlc generate`.

## Verify before you commit

```bash
just sqlc-check
just go-test                       # internal/db/migrations_test.go runs them against a temp file
CGO_ENABLED=0 go build ./...       # the driver must stay pure Go
```

Then open the app twice at once and change a setting in both windows. WAL plus the 5-second busy
timeout is what makes that work; a migration that takes a long write lock is where it stops working.

## Checklist

- [ ] A scalar preference would not have done instead
- [ ] File is `internal/db/migrations/000N_<what>.sql`, next number, `-- +goose Up` header
- [ ] Adds only — no `DROP`, `UPDATE`, `DELETE`, or column removal
- [ ] New columns are nullable or defaulted
- [ ] No already-committed migration was touched
- [ ] Query added to `internal/db/queries/`, `sqlc generate` run, `store/` committed
- [ ] `just sqlc-check` and `just go-test` pass
