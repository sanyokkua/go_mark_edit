**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester
**Last Updated:** 2026-07-10
**Cross-references:** `00_Foundation/04_DESIGN_DECISIONS.md`, `02_Architecture/02_BACKEND_GO.md`, `02_Architecture/03_FRONTEND_REACT.md`, `02_Architecture/01_MODULE_INVENTORY.md`

# Error Handling

One error model spans the whole app: a typed backend error is classified by an `ErrorCode`, logged with
its cause at the handler boundary, serialized to a sanitized `WireError`, wrapped in a `*Result`
envelope, unwrapped on the frontend, and surfaced as a toast. The contract is tuned to a Markdown
editor's failure modes (files, folders, assets, export).

## Table of Contents

1. Error codes
2. Wire
3. Result envelopes
4. Frontend parseError
5. Toasts

## Error codes

`apperr.ErrorCode` is a string enum, exported to TypeScript via `EnumBind` (`04_WAILS_INTEGRATION.md`
`#bind-enumbind`). The catalog covers GoMarkEdit's domain:

| Code | Constant | When | Retryable |
|---|---|---|---|
| `validation` | `CodeValidation` | Bad argument / precondition (empty path, unsupported extension) | no |
| `not_found` | `CodeNotFound` | File/folder/recent entry no longer exists | no |
| `io` | `CodeIO` | Read/write failure (disk, encoding) | sometimes |
| `permission` | `CodePermission` | OS denied read/write, or asset outside allowlist | no |
| `busy` | `CodeBusy` | Long-ops gate held (export/format-all already running) | no |
| `timeout` | `CodeTimeout` | A long op exceeded its budget | yes |
| `cancelled` | `CodeCancelled` | User/shutdown cancelled an in-flight op | no |
| `unsupported` | `CodeUnsupported` | Operation not available (e.g. export precondition unmet) | no |
| `internal` | `CodeInternal` | Catch-all / panic fallback | yes |

Constructors: `apperr.Validation(field, expected, got)`, `apperr.NotFound(path)`,
`apperr.IO(op, cause)`, `apperr.Permission(path)`, `apperr.Busy()`, `apperr.Cancelled(...)`,
`apperr.Internal(cause)`. Each returns an `*AppError` with a user-facing `Title`/`Message`, a safe
`Details` allowlist, `Retryable`, and an unexported `cause`.

### LLM error codes (Stage 3)

The assistant assistant (`02_Architecture/08_LLM_INTEGRATION.md`) extends this same catalog additively.
These codes are part of the one `apperr.ErrorCode` enum and are exposed to TypeScript via the same
`EnumBind`. `busy`, `timeout`, `cancelled`, `validation`, and `internal` above are reused with their
existing meaning (the gate held → `busy`; deadline → `timeout`; etc.); the assistant-specific additions
are:

| Code | Constant | When | Retryable |
|---|---|---|---|
| `provider_unreachable` | `CodeProviderUnreachable` | Transport failure reaching the endpoint (connection refused / DNS / reset) | yes |
| `auth` | `CodeAuth` | Endpoint returned 401/403 — credential rejected | no |
| `missing_credential` | `CodeMissingCredential` | Configured env-var name is unset in the process environment (secret never sent) | no |
| `model_not_found` | `CodeModelNotFound` | 404 — configured model or endpoint path not found | no |
| `context_window` | `CodeContextWindow` | Prompt overflowed the model's context window (400 at inference, or the reactive backstop) | no |
| `rate_limited` | `CodeRateLimited` | 429 — provider throttling; retry backoff honors `Retry-After` | yes |
| `upstream` | `CodeUpstream` | Other non-2xx upstream failure not otherwise classified | sometimes |
| `empty_completion` | `CodeEmptyCompletion` | 2xx but the model returned no usable text | yes |
| `tool_failed` | `CodeToolFailed` | An agent tool call had invalid arguments or failed to execute | no |
| `agent_limit` | `CodeAgentLimit` | The tool loop hit its iteration or wall-clock limit without converging | no |

The provider **service** owns the mapping from transport/HTTP status to these codes and retries only the
retryable classes with backoff (DD-48); see `02_Architecture/08_LLM_INTEGRATION.md`
`#provider-abstraction` and `#error-codes`. Errors surface through the standard `WireError` + toast path,
and also as the `error` field of the `agent:error` event during a run.

```go
type AppError struct {
    Code      ErrorCode
    Title     string
    Message   string
    Details   map[string]string // safe allowlist only — never secrets or full internal state
    Retryable bool
    cause     error             // never serialized; logged at the boundary
}
```

## Wire

`WireError` is the exact JSON shape that crosses the bridge — the `AppError` fields **minus** `cause`:

```go
type WireError struct {
    Code      ErrorCode         `json:"code"`
    Title     string            `json:"title"`
    Message   string            `json:"message"`
    Details   map[string]string `json:"details,omitempty"`
    Retryable bool              `json:"retryable"`
}

// ToWire logs the full chain (including cause) once, then returns the sanitized WireError.
// A nil or unclassified error maps to CodeInternal.
func ToWire(log zerolog.Logger, err error) WireError
```

The `cause` is **never** serialized — it is logged locally only (DD-33), so implementation detail and
absolute paths beyond the user's own selection never reach the UI or any file that could be shared.
`ToWire` is called exactly once, at the handler boundary.

## Result envelopes

Bound methods return a concrete envelope: exactly one of `Data` / `Error` is meaningful. The set is
per-payload-type (defined in `results.go`):

```go
type VoidResult      struct { Error *WireError `json:"error,omitempty"` }
type StringResult    struct { Data  string      `json:"data"`  Error *WireError `json:"error,omitempty"` }
type DocResult       struct { Data  *Document   `json:"data,omitempty"` Error *WireError `json:"error,omitempty"` }
type DocListResult   struct { Data  []Document  `json:"data"`  Error *WireError `json:"error,omitempty"` }
type TreeResult      struct { Data  *TreeNode   `json:"data,omitempty"` Error *WireError `json:"error,omitempty"` }
type RecentResult    struct { Data  *RecentItems `json:"data,omitempty"` Error *WireError `json:"error,omitempty"` }
type SettingsResult  struct { Data  *Settings   `json:"data,omitempty"` Error *WireError `json:"error,omitempty"` }
type StateResult     struct { Data  *AppState   `json:"data,omitempty"` Error *WireError `json:"error,omitempty"` }
// ...one per domain payload (ExportResult, MetadataResult, …)
```

A successful op sets `Data` and leaves `Error` nil; a failed op sets `Error` and leaves `Data` zero. A
user cancel (dialog dismissed) is a **success with empty data**, not an error.

Application-model **commands** (`OpenDoc`, `UpdateBuffer`, `SetUILayout`, …) follow the same envelope
contract — typically a `VoidResult` — with the resulting model change delivered separately as a
`state:patch` event; the `GetState` query returns the full snapshot as a `StateResult`
(`02_BACKEND_GO.md` `#application-model`).

## Frontend parseError

`logic/utils/parseError` normalizes any thrown/rejected value into a `WireError` so the store and UI
always branch on a stable shape:

```ts
export function parseError(e: unknown): WireError {
    if (isWireError(e)) return e;                 // already an envelope error (thrown by unwrap)
    if (e instanceof Error) return { code: 'internal', title: 'Something went wrong', message: e.message, retryable: true };
    return { code: 'internal', title: 'Something went wrong', message: String(e), retryable: true };
}
```

Thunks pass `parseError(e)` to `rejectWithValue`, so a slice's `rejected` case always carries a typed
`WireError.code` (`03_FRONTEND_REACT.md` `#store`).

## Toasts

The adapter's `unwrap()` is the single choke point that turns an envelope error into user feedback:

```ts
export function unwrap<T>(res: { data?: T; error?: WireError }): T {
    if (res.error) {
        store.dispatch(notifyError(res.error)); // → notifications slice → Toast primitive
        throw res.error;
    }
    return res.data as T;
}
```

Because every adapter call funnels through `unwrap`, error toasting is automatic and consistent — no
component builds its own error string. `notifyError` renders `WireError.title` + `message`; `Retryable`
errors may offer a retry affordance. Diagnostic detail (the `cause`) stays in the local rotating log
(DD-33), never in the toast.
