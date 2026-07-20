# Playbook and troubleshooting

## Playbook

1. **Read the KV schema + Migrations sections** (`references/kv-store-and-keys.md`,
   `references/engine-and-migrations.md`) and decide: **KV prefix** (a few scalars, no migration) vs.
   **new table** (structured/relational data, additive migration).
2. **Scalar preference** (no migration):
   - Add a typed `Get*Config` / `Update*Config` to the repository interface and
     `repository_sqlite.go` (built on `getBool` / `getInt` / `getFloat` / `getString` +
     `UpsertSetting`, each with a default).
   - Passthrough in `service.go`.
   - If the frontend needs it, add an envelope method in `handler.go` (see `go-envelope-and-di`) and
     run `just gen` — expect regenerated bindings, no drift.
3. **Structured data** (new table):
   - Add a **new additive** numbered goose migration (`internal/db/migrations/000N_*.sql`).
   - Add the query in `internal/db/queries/*.sql`; run `sqlc generate` (regenerates
     `internal/db/store/`, which you never hand-edit).
   - Wire the repository two-phase in `internal/application` (nil repo in Phase 1, real SQLite repo in
     `Init(ctx)` after `db.Open` — see `go-envelope-and-di`).
4. **Validate:**
   - `just check` — fmt / vet / import-graph / lint / test — expect clean.
   - `just test` — the persistence unit + integration tests (integration tests use a temp SQLite file,
     never a shared global).
   - `just build` — confirms the CGO-free build still links.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `database is locked` under two instances | Missing WAL / `busy_timeout` / `SetMaxOpenConns(1)` | Set all three in the DSN + pool as shown in `references/engine-and-migrations.md` |
| `wails build` fails cross-compiling / needs a C toolchain | A CGO SQLite driver crept in | Use `modernc.org/sqlite`; import `_ "modernc.org/sqlite"`, open `sql.Open("sqlite", …)` |
| Second launch shows "Already running" / is refused | A single-instance flock was added | Remove it — multi-instance is required (DD-08 / ADR-0006) |
| `sqlc generate` overwrites your edits in `store/` | Hand-edited generated code | Edit the `.sql` query, regenerate; treat `store/` as build output |
| CI / `just check` rejects a migration | Non-additive change or edited a shipped file | Add a new numbered additive migration instead |
| New pref lost on restart | Wrong `type` string / no default / not upserted | Use the matching getter + default and `UpsertSetting` |
| Adding a table for one bool | Needless migration | Reuse the `settings` KV table with a new dotted key |
| Cross-major schema at startup | An older binary met a newer DB | Hard startup error by design — never auto-downgrade/rewrite; ship a forward-compatible additive schema |
