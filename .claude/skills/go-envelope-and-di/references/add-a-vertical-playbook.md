# Layering and the add-a-vertical playbook

Authority: `specification/02_Architecture/02_BACKEND_GO.md` (Layering, Packages). Module inventory
(the only valid module paths): `specification/06_Process_and_Traceability/01_MODULE_INVENTORY.md`.
Governing rule: `.claude/rules/go-backend-architecture.md`.

## Layering — strictly inward

```
Wails bindings (main.go: Bind / EnumBind)
        │
Handlers   appmodel · docs · workspace · settings · recent · export · fileassoc
        │   return apperr.*Result · take NO context.Context · defer/recover → CodeInternal
Services   appmodelsvc · docsvc · workspacesvc · settingssvc · recentsvc · exportsvc · assetsvc
        │   keep (T, error) · own business logic · receive ctx
Repos/OS   internal/db + store (sqlc) · internal/file · runtime dialogs · internal/assets handler
        │
Shared     internal/apperr · logging · bootstrap · gate  (bottom of graph)
```

| Layer | Package example | Responsibility | Signature shape |
|---|---|---|---|
| Handler | `internal/docs/handler.go` | Wails boundary; marshal + `ToWire`; envelope out | `func(req R) (res apperr.XResult)` |
| Service | `internal/docs/service.go` | Business logic; classify errors | `func(ctx, req) (T, error)` |
| Repository | `internal/settings/repository_sqlite.go` | SQLite/OS access; implements a **package-owned** interface | `func(ctx, …) (T, error)` |
| Shared leaf | `internal/apperr` | Error model + every `*Result` | imports **no** internal package |

`internal/appmodel` (the backend-authoritative application model, DD-62) is bound like any other
vertical — `AppModelHandler` follows the same envelope rules — but its service **composes** the
docs/workspace/settings/recent services instead of owning a repository, and additionally emits a
`state:patch` event after every mutation (see `.claude/rules/go-backend-architecture.md`).

The repository interface is **owned by the feature package that depends on it** (defined in
`internal/<feature>/repository.go`), not in a shared "interfaces" file — the service depends on its
own abstraction, and `repository_sqlite.go` implements it. This keeps the dependency direction inward
and lets tests supply a fake that satisfies the same interface.

## Playbook — add a vertical

1. **Create `internal/<feature>/`:**
   - `model.go` — DTOs crossing the boundary.
   - `repository.go` — the **interface the service depends on**, owned by this package.
   - `repository_sqlite.go` — the SQLite implementation (see `sqlite-kv-persistence`).
   - `service.go` — business logic, `(T, error)` signatures, takes `ctx`.
   - `handler.go` — the envelope + panic guard (see `references/envelope-and-errorcodes.md`).
2. **Add `apperr.<Feature>Result`** (and any new `ErrorCode` + constructor) in `internal/apperr`,
   keeping it importing no other internal package.
3. **Wire two-phase** (see `references/two-phase-di.md`): Phase 1 constructs the service/handler with a
   `nil` repo in `NewApplicationContextHolder`; Phase 2 injects the real SQLite repo in `Init(ctx)`
   after `db.Open`.
4. **Bind + regenerate:** add the handler to `main.go`'s `Bind:` list (and any new enum to
   `EnumBind:`), then run `just gen` (`wails generate module`) — expect regenerated
   `frontend/wailsjs/` with no drift.
5. **Add a `logic/adapter/` wrapper** so thunks/components never import `wailsjs/` directly.
6. **Validate:**
   - `just check` — fmt + vet + import-graph + lint + test — expect clean.
   - `just test` — fast unit pass (Go `-race` + Jest).
   - `just build` — confirms the CGO-free binary and `//go:embed` still compile.

## Commands

| Command | What it does |
|---|---|
| `just gen` | `wails generate module` — regenerate `frontend/wailsjs/` after a bound-signature change |
| `just check` | fmt + vet + import-graph + lint + test (the local CI mirror) |
| `just test` | Go `-race` unit/integration + Jest |
| `just build` | `wails build` — CGO-free production binary |
