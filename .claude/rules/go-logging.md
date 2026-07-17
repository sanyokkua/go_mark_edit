---
paths:
  - "internal/**/*.go"
---

# Go logging

**Authority:** `specification/00_Foundation/04_DESIGN_DECISIONS.md` (DD-33), `01_MODULE_INVENTORY.md`
(`internal/logging/`, `internal/bootstrap/`). The logger is configured in `internal/logging/logger.go`.

Logs are a **local diagnostic file only** and are never transmitted (DD-33, see `offline-and-privacy.md`).

## DO

- Use structured **zerolog** with explicit fields, not string interpolation:

  ```go
  log.Error().Str("code", string(ae.Code)).Bool("retryable", ae.Retryable).Err(err).Msg(ae.Title)
  ```

- Write files via a rotating sink (`lumberjack`) into the app logs dir resolved by `internal/file`
  (`-Dev` suffix under `wails dev`). Combine console + file with `zerolog.MultiLevelWriter` when both
  are active.
- Default level: `debug` in dev, `warn` in production. Support in-place `Reconfigure` under a lock.
- Log an error **once**, at the handler boundary in `apperr.ToWire` (see `go-error-envelope.md`).

## DON'T

- **`Fatal` must not call `os.Exit`.** Log at fatal level and let the caller show a dialog and exit
  (Wails' `logger.Logger` interface requires a `Fatal` method; keep it side-effect-free beyond logging).
- No PII, secrets, API keys, tokens, or full remote URLs in any log field. Log a path's base name, not a
  user's full home path, when the full path is not needed.
- No network log sink, no telemetry, no analytics -- file/console only.
- Don't log the same error at multiple layers.

## Authoring checklist

- [ ] New log call is zerolog structured with typed fields (no `fmt.Sprintf` message building).
- [ ] Level appropriate; no secret/PII/URL in fields.
- [ ] Any `Fatal` path logs then returns; the exit decision lives in the caller.
- [ ] File sink goes through `internal/logging` + `internal/file` dirs, never a hard-coded path.
