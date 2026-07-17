---
paths:
  - "internal/apperr/**"
  - "internal/**/handler*.go"
---

# Go error envelope

**Authority:** `specification/06_Process_and_Traceability/01_MODULE_INVENTORY.md`
(`internal/apperr/` row), `specification/02_Architecture/02_BACKEND_GO.md`. The error model
lives in `internal/apperr/{apperr.go,wire.go,results.go}`.

`internal/apperr` is the single source of the error model and every bridge-crossing envelope. It
imports **no other internal package**.

## The types

```go
type ErrorCode string

type AppError struct {
    Code      ErrorCode
    Title     string
    Message   string
    Details   map[string]string // safe allowlist only -- never secrets, tokens, or full URLs
    Retryable bool
    cause     error             // UNEXPORTED => never serialized; logged only at the boundary
}
func (e *AppError) Error() string { return e.Message }
func (e *AppError) Unwrap() error { return e.cause }

// wire.go -- the serialized shape; note there is no `cause` field
type WireError struct {
    Code      ErrorCode         `json:"code"`
    Title     string            `json:"title"`
    Message   string            `json:"message"`
    Details   map[string]string `json:"details,omitempty"`
    Retryable bool              `json:"retryable"`
}
```

- One constructor per code (`Validation(...)`, `NotFound(...)`, `Busy()`, `Internal(cause)` is the
  catch-all). Constructors that wrap take `cause error` as the last param.
- `ToWire(log, err)` is the ONLY place the full chain (including `cause`) is logged; it strips `cause`
  and returns a `WireError`. Any nil / unclassified error becomes `CodeInternal`.
- Every bound method returns an `apperr.*Result` (single: `Data *T + Error *WireError`; slice:
  `Data []T + Error *WireError`; no data: `VoidResult{Error *WireError}`). `Error` is a pointer with
  `omitempty`.
- `ErrorCode` is exposed to TypeScript as a real enum via `EnumBind` in `main.go`.

## The canonical bound-handler skeleton (copy exactly)

```go
const panicFmt = "panic: %v"

func (h *DocsHandler) OpenDocument(req OpenRequest) (res apperr.DocumentResult) {
    defer func() {
        if r := recover(); r != nil {
            wire := apperr.ToWire(h.zlog, apperr.Internal(fmt.Errorf(panicFmt, r)))
            res = apperr.DocumentResult{Error: &wire}
        }
    }()
    doc, err := h.service.Open(h.ctx, req)
    if err != nil {
        wire := apperr.ToWire(h.zlog, err)
        return apperr.DocumentResult{Error: &wire}
    }
    return apperr.DocumentResult{Data: &doc}
}
```

## DO / DON'T

- DO keep `cause` unexported; DO curate `Details` to safe values (a path's base name, an env-var *name*).
- DO classify service errors with a specific `apperr.*` constructor before they reach `ToWire`.
- DON'T serialize `cause`, add a `cause`/`json:"cause"` field, or return a bare `error` across the bridge.
- DON'T log the error anywhere but `ToWire` (avoids double-logging the same chain).
- DON'T put a secret, token, API key, or full remote URL into `Message` or `Details`.

## Authoring checklist

- [ ] New error path uses a typed `apperr.*` constructor (or `Internal` as the fallback).
- [ ] Handler returns `apperr.*Result`; `Error` is `*WireError`; happy path sets `Data`.
- [ ] Named return + `defer/recover` -> `apperr.Internal` present.
- [ ] New `ErrorCode` added to the `EnumBind` list in `main.go`.
- [ ] `internal/apperr` imports no other internal package.
