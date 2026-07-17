# The envelope pattern, Result variants, and the ErrorCode catalog

Authority: `specification/02_Architecture/06_ERROR_HANDLING.md` (error codes, Wire, Result
envelopes), `specification/02_Architecture/02_BACKEND_GO.md` (error envelope section). Design
decision **DD-03** (typed error envelope + two-phase DI). Governing rule:
`.claude/rules/go-error-envelope.md`. Canonical code: `internal/apperr/{apperr.go,wire.go,results.go}`
and each `internal/<feature>/handler.go`.

## The envelope pattern — copy exactly

```go
// internal/docs/handler.go
const panicFmt = "panic: %v"

// SaveDocument is Wails-bound: no context.Context param, returns a Result envelope.
func (h *DocsHandler) SaveDocument(req SaveDocRequest) (res apperr.DocResult) {
    defer func() {
        if r := recover(); r != nil {
            wire := apperr.ToWire(h.zlog, apperr.Internal(fmt.Errorf(panicFmt, r)))
            res = apperr.DocResult{Error: &wire}
        }
    }()
    doc, err := h.service.Save(h.ctx, req) // service keeps (ctx, req) (Document, error)
    if err != nil {
        wire := apperr.ToWire(h.zlog, err)
        return apperr.DocResult{Error: &wire}
    }
    return apperr.DocResult{Data: &doc}
}
```

Four things are non-negotiable in every bound method:

1. **No `context.Context` parameter** — Wails strips it from the bound signature; a ctx arg produces
   a wrong TS binding.
2. **A concrete `apperr.*Result` return** — never `(T, error)`.
3. **A named return (`res`) plus `defer/recover`** that converts any panic to `apperr.Internal`
   (`CodeInternal`) — a service panic must never crash the app.
4. **Exactly one of `Data` / `Error` is meaningful.** `Error` is `*WireError` with `omitempty`.

`apperr` owns `AppError`, the `ErrorCode` catalog + one constructor per code, `WireError`, `ToWire`,
and every `*Result`. The `cause` field is **unexported and never serialized** — `ToWire` logs the
full error chain **once** at the boundary and strips it. Never log the same error at another layer
(that produces duplicate log lines).

## A user cancel is success, not an error

A dismissed dialog (open/save cancelled) returns a **success with empty data** — do not synthesize an
error for it. The frontend distinguishes "nothing to do" from a real failure by seeing `Data` unset
**and** `Error` unset.

## Result envelope variants (`internal/apperr/results.go`)

| Envelope | Data field | Use for |
|---|---|---|
| `VoidResult` | — | Ops with no payload (delete, clear recent) |
| `StringResult` | `Data string` | A single string return |
| `DocResult` | `Data *Document` | Open / Save one document |
| `DocListResult` | `Data []Document` | List of documents |
| `TreeResult` | `Data *TreeNode` | Workspace tree |
| `RecentResult` | `Data *RecentItems` | Recent files / folders |
| `SettingsResult` | `Data *Settings` | Settings group read |

Add a new `<Feature>Result` in `internal/apperr` when no existing shape fits — keeping `apperr`
importing no other internal package (see the leaf rule below).

## ErrorCode catalog (`06_ERROR_HANDLING.md`)

Codes: `validation`, `not_found`, `io`, `permission`, `busy`, `timeout`, `cancelled`, `unsupported`,
`internal`.

Constructors (one per code):

| Constructor | Code | Use for |
|---|---|---|
| `apperr.Validation(field, expected, got)` | `validation` | Bad/rejected input |
| `apperr.NotFound(path)` | `not_found` | Missing file/record |
| `apperr.IO(op, cause)` | `io` | Disk/read/write failure |
| `apperr.Permission(path)` | `permission` | OS permission denied |
| `apperr.Busy()` | `busy` | The long-op gate rejected a concurrent op |
| `apperr.Internal(cause)` | `internal` | Catch-all / panic guard |

`ErrorCode` reaches TypeScript as a **real enum** via `EnumBind` in `main.go` (see the
`wails-dev` skill and `references/two-phase-di.md`) — so the frontend can branch on codes
without magic strings.

## The `apperr` leaf rule

`internal/apperr` is the bottom of the import graph; an import **from** it into any other `internal/*`
package is a hard failure — the import-graph check in `just check` rejects it. If you are tempted to
import a feature type into `apperr`, move the type instead (or model the payload with a primitive on
the `*Result`).

## Keeping detail safe

Put only curated, safe values into `Message` / `Details` — a file's base name, an env-var *name*,
never an absolute path or secret. The rich `cause` chain stays unexported and is logged once by
`ToWire`, then dropped before the envelope crosses the bridge.
