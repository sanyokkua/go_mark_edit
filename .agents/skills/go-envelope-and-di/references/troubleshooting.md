# Troubleshooting — envelope, DI, and binding failures

| Symptom | Cause | Fix |
|---|---|---|
| Frontend promise rejects unexpectedly / TS binding has a `ctx` arg | Bound method returns `(T, error)` or takes `context.Context` | Return a concrete `apperr.*Result`; drop the ctx param — Wails strips it anyway |
| A panic in a service crashes the whole app | Handler missing the named-return + `defer/recover` guard | Add the canonical guard mapping panic → `apperr.Internal` |
| `just check` fails on the import graph | Something imported into `internal/apperr` | Keep `apperr` a leaf; move the offending type out of it |
| `nil pointer` on the first repository call | Forgot the phase-2 `SetRepository` in `Init(ctx)` | Wire the real SQLite repo after `db.Open` in `Init` |
| Error text shows an absolute path / secret | Put `cause` detail into `Message`/`Details` | Curate `Details` to safe values (base name, env-var *name*); `cause` stays unexported |
| Same error logged twice | Logged in the service *and* in `ToWire` | Log only in `ToWire` at the handler boundary |
| `frontend/wailsjs/` diff in CI | Bound signature changed without regeneration | Run `just gen`, commit the regenerated bindings |
| `cannot use ... as apperr.*Result` | Returned the wrong `*Result` variant, or a bare value/error | Match the return type to the declared `apperr.<X>Result`; wrap errors via `ToWire` into `Error` |
| Frontend can't branch on error codes | `ErrorCode` not surfaced as a TS enum | Ensure `ErrorCode` is in `main.go`'s `EnumBind:`; run `just gen` |
| Component imports `wailsjs/` directly | Missing `logic/adapter/` wrapper | Add/route through the adapter; components never import `wailsjs/` |
