---
paths:
  - "internal/**/*.go"
  - "main.go"
---

# Go backend architecture

**Authority:** `specification/00_Foundation/04_DESIGN_DECISIONS.md` (DD-03, DD-62, DD-63, DD-64),
`specification/02_Architecture/01_MODULE_INVENTORY.md` (layering map),
`specification/02_Architecture/02_BACKEND_GO.md` (incl. `#application-model`),
`specification/02_Architecture/05_STATE_AND_PERSISTENCE.md#in-memory-application-model`,
`docs/adr/0014-backend-authoritative-state.md`. Canonical wiring lives in
`internal/application/application.go` and `internal/settings/handler.go`.

The backend is strictly layered and points **inward only**:

```
Wails bindings (main.go: Bind / EnumBind)
        |
Handlers   -- return apperr.*Result, take NO context.Context
        |
Services   -- keep (T, error) signatures, take ctx as first param
        |
Repos / OS -- SQLite store, file, dialogs, asset handler
        |
Shared     -- apperr . logging . bootstrap . gate  (bottom of graph)
```

## The backend is the single source of truth (DD-62 — MVC "Model")

`internal/appmodel` owns the **single source of truth** for the entire live application model: the open
documents **and their canonical content**, each document's dirty/encoding/line-ending and per-document
view state, the tab set (order + active), the workspace ref, and all UI/layout state (DD-62). The
frontend holds no authoritative state — it renders a projection and drives the model with commands (DD-63).
`internal/appmodel` sits at the **service** layer and follows the same envelope/DI rules as every other
vertical, with a query / command / event contract:

- **Query** — `GetState()` returns a serializable snapshot the frontend hydrates its projection from.
- **Commands** — `OpenDoc`, `CloseTab`, `SetActiveTab`, `ReorderTabs`, `UpdateBuffer` (the debounced editor
  sync, DD-64), `SetDocView`, `OpenWorkspace`, `SetUILayout`, … each mutate `AppState` under a single
  mutex, persist the **durable subset** where applicable (window/UI-layout via `internal/settings`), and
  emit a `state:*` event.
- **Events** — after every mutation the service emits **`state:patch`** carrying only the changed sections;
  the adapter applies it to the Redux projection.

Two non-negotiables:

- **Compose, don't duplicate, the I/O verticals.** `internal/appmodel` calls `internal/docs` for file
  read/write, `internal/workspace` for the tree, and `internal/settings`/`internal/recent` for the durable
  subset — it never reimplements them. It is the model/orchestrator, not a second copy of the I/O logic.
- **Content lives in Go memory; never echo the buffer to the focused editor.** Canonical document content
  lives in the `appmodel` buffers (so inactive tabs cost no webview memory, DD-63). The active buffer is a
  debounced working copy pushed in via `UpdateBuffer` and flushed before save/blur/switch/close (DD-64);
  the backend emits only **derived** state (dirty, counts) — it **never** echoes buffer text back into the
  currently focused editor, which would disturb the cursor/selection. It respects file-first (DD-11): the
  model starts empty on launch (no session restore); documents on disk remain the persistence source of
  truth.

## DO

- Keep each layer one hop: a Handler calls its Service; a Service calls its Repository. Never let a
  handler reach a repository or the DB directly. `internal/appmodel`'s handler is bound like any other and
  its service composes the I/O verticals through their interfaces.
- Give every package that defines a type the interface for it (`SettingsRepositoryAPI` lives in
  `internal/settings/`, not a shared god-file). Consumers depend on the interface; callers inject the
  concrete.
- Bound handler methods: **named return `(res apperr.XxxResult)`**, a top `defer/recover` that maps a
  panic to `apperr.Internal(...)`, **no `context.Context` parameter** (Wails strips it). This holds for the
  `AppModelHandler`'s `GetState` and every command. See `go-error-envelope.md` for the canonical skeleton.
- Keep inner services on `(T, error)` and pass `ctx` through them; the envelope is a handler-boundary
  concern only. Emit `state:*` events from the service via the Wails runtime after the model mutates.
- Wire all concretes in **`internal/application`** + `main.go` only, two-phase: construct the full graph
  with **nil repos** in `NewApplicationContextHolder`, then inject real SQLite repos via
  `SetRepository`/`Configure` setters inside `Init(ctx)` after `db.Open`. `internal/appmodel` is
  constructed here and composed with the docs/workspace/settings/recent services it orchestrates.

```go
// internal/application/application.go -- phase 1 (constructor): nil repo
svc := settings.NewSettingsService(appLogger, nil, fileUtils)
h   := settings.NewSettingsHandler(svc)

// phase 2 Init(ctx): real repo after the DB is open
database, err := db.Open(dbPath)
a.SettingsService.SetRepository(settings.NewSqliteSettingsRepository(database))
```

## DON'T

- Don't return `(T, error)` from a bound handler, and don't add a `context.Context` param to one.
- **Don't hold model truth anywhere but `internal/appmodel`**, and don't duplicate `internal/docs`/
  `internal/workspace`/`internal/settings` logic inside it — compose them.
- **Don't echo buffer text back to the focused editor**; emit only derived state via `state:patch`. Don't
  mutate `AppState` outside its mutex, and don't persist document content to the DB (file-first, DD-11).
- Don't wire concretes anywhere but `internal/application` / `main.go`.
- Don't let `internal/apperr` import any other internal package -- it is the bottom of the graph.
- Don't add cross-layer shortcuts, global singletons, or a shared interfaces file.

## Authoring checklist

- [ ] `internal/appmodel` is the single source of truth (DD-62): `GetState` query + mutating commands +
      `state:patch` events; canonical content held in Go memory, not the DB or the webview.
- [ ] `internal/appmodel` **composes** the I/O verticals (docs/workspace/settings/recent) rather than
      duplicating them.
- [ ] The backend never echoes buffer text into the focused editor; `UpdateBuffer` is debounced and
      flushed before save/blur/switch/close (DD-64).
- [ ] New vertical is Handler -> Service -> Repository, each in its own package.
- [ ] Handler returns `apperr.*Result`, no ctx, named-return + `defer/recover` -> `CodeInternal`.
- [ ] Service keeps `(T, error)`; interface owned by the defining package.
- [ ] Wiring added only in `internal/application` (nil repo in ctor, real repo in `Init`).
- [ ] `internal/apperr` still imports no internal package.
- [ ] Bound-signature change -> `just gen` (`wails generate module`), no drift committed.
