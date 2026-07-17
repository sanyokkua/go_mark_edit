# Two-phase dependency injection and the Bind / EnumBind surface

Authority: `specification/02_Architecture/02_BACKEND_GO.md` (DI two-phase). Design decision **DD-03**
(two-phase DI), **DD-08 / ADR-0006** (multi-instance, no lock — DB open takes no single-instance
lock), **ADR-0004** (SQLite KV wiring context). Canonical code:
`internal/application/application.go` and `main.go`.

## Why two phases

The SQLite database is **not open** when the application struct is constructed — the file path and DB
handle only exist after startup. So construction and wiring split into two phases, and **both** happen
in exactly one place: `internal/application` + `main.go`. Nothing else constructs a concrete
repository or handler.

## Phase 1 — pure constructor with nil repositories

```go
// internal/application/application.go

// Phase 1 — build services/handlers with NIL repositories.
func NewApplicationContextHolder(appLogger *logging.Logger) *ApplicationContextHolder {
    svc := settings.NewSettingsService(appLogger, nil /* repo */, fileUtils)
    h   := settings.NewSettingsHandler(svc)
    // ... same for docs, workspace, recent, export ...
}
```

## Phase 2 — inject real repositories after `db.Open`

```go
// Phase 2 — after the DB opens (called from OnStartup): inject real repositories.
func (a *ApplicationContextHolder) Init(ctx context.Context) error {
    dbPath, _ := a.fileService.GetAppDatabaseFilePath()
    database, err := db.Open(dbPath) // WAL + busy_timeout; NO single-instance lock (DD-08 / ADR-0006)
    if err != nil {
        return fmt.Errorf("open database: %w", err)
    }
    a.DB = database
    a.SettingsService.SetRepository(settings.NewSqliteSettingsRepository(database))
    a.RecentService.SetRepository(recent.NewSqliteRecentRepository(database))
    return nil
}
```

Each service exposes a `SetRepository`-style method used **only** here. Forgetting a phase-2
`SetRepository` compiles fine and fails at runtime with a `nil` pointer on the first repository call.

## The Bind / EnumBind surface in `main.go`

- **`Bind:`** — every handler the frontend calls is listed here. Adding a vertical means adding its
  handler to this list.
- **`EnumBind:`** — `ErrorCode` (and any other enum the frontend needs as a real TS enum) is listed
  here so it materializes in `models.ts`. A new `ErrorCode` value needs no EnumBind change (the type
  is already bound); a **new enum type** does.

After any change to a bound signature or the `Bind` / `EnumBind` lists, run:

```bash
just gen          # wraps `wails generate module`
```

This regenerates `frontend/wailsjs/`. Commit the result — CI fails on `frontend/wailsjs/` drift. Then
add or update a `logic/adapter/` wrapper so thunks and components import the adapter, never `wailsjs/`
directly.
