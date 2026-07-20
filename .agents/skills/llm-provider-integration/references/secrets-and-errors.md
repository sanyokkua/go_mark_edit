# Secrets and Errors

Secret handling is by env-var **name** only, never by value; retry/error classification is owned by the
service, never the `*http.Client`.

## Secret handling — env-var NAME only (DD-45, `17_...#auth-env-var`)

Credentials are handled by **reference, never by value** (DD-45). When the auth scheme is **Bearer** or
**Api-Key**, the user enters an **environment-variable NAME** (mockup placeholder `ENV_VAR_NAME`), not
the secret itself. Persist the environment-variable **name**, never the secret. Resolve with
`os.Getenv` at request-construction time; unset → `missing_credential` (never an unauthenticated send).

```go
type ResolvedConfig struct {
    Config ProviderConfig // persisted: kind, name, baseURL, authScheme, headers, envVarName, modelId, params
    Secret string         // resolved at call time; NEVER persisted, transcript-stored, or logged
}

func (p *OpenAICompatibleProvider) authHeader(cfg ProviderConfig) (string, string, error) {
    if cfg.AuthScheme == AuthNone {
        return "", "", nil
    }
    secret := os.Getenv(cfg.EnvVarName) // resolve at request time only
    if secret == "" {
        // Details carries the safe env-var NAME, never a value (go-error-envelope.md).
        return "", "", apperr.MissingCredential(cfg.EnvVarName)
    }
    if cfg.AuthScheme == AuthBearer {
        return "Authorization", "Bearer " + secret, nil
    }
    return cfg.APIKeyHeaderName, secret, nil
}
```

Rules (DD-45, DD-33, ADR-0007):

- The **secret value is never persisted** — not in the KV store, not in the `providers` table, not in
  exported settings — and **never logged**. Only the variable *name* is stored.
- **None** is the correct scheme for local providers that need no auth (Ollama/LM Studio/llama.cpp
  default).
- **EC-LLM-8 — Missing credential.** If the referenced environment variable is unset (or empty) when a
  run or a Test needs it, the app reports an auth-configuration error ("environment variable `NAME` is
  not set") through the standard error path — it does **not** send an unauthenticated request and does
  **not** fabricate a key (DD-48). The variable name is safe to show; the value never exists to show.
- **EC-LLM-18 — Provider auth rejected (401/403).** When the referenced credential **is** present but
  the provider rejects it with `401`/`403`, the app classifies a **non-retryable `auth` error** and
  surfaces it through the standard Result-envelope + toast path; the environment-variable **name** may
  appear in the message, the secret value never does (DD-45, DD-48). Distinct from EC-LLM-8, where the
  variable is unset and the request is refused before any HTTP call.
- Per `go-error-envelope.md`: `Details` is a **safe allowlist only** — never secrets, tokens, or full
  URLs. The unexported `cause` on `AppError` is never serialized; `ToWire` is the only place the full
  chain is logged.

## Retry / error mapping owned by the service (DD-48)

The **service** classifies each outcome — not the `*http.Client`. Retry only retryable classes with
backoff that honors `Retry-After`, bounded attempts, mapped to the fixed `ErrorCode` set. Every code is
exposed to TS via `EnumBind` in `main.go`; errors surface through the `apperr.*Result` envelope + toast.

| Outcome | ErrorCode | Retryable |
|---|---|---|
| Connection refused / DNS / reset | `provider_unreachable` | yes |
| Deadline exceeded past app budget | `timeout` | yes |
| `context.Canceled` (user/shutdown) | `cancelled` | no |
| HTTP 401 / 403 | `auth` | no |
| Env-var name set but unresolved | `missing_credential` | no |
| HTTP 404 (model/endpoint) | `model_not_found` | no |
| HTTP 429 | `rate_limited` | yes (honor `Retry-After`) |
| HTTP 400 recognized as overflow | `context_window` | no |
| Other non-2xx upstream | `upstream` | sometimes |
| 2xx but empty completion | `empty_completion` | yes |
| Gate held (run or TestInference) | `busy` | no |

Stage 3 adds this LLM error set to the `apperr.ErrorCode` catalog. Codes reused from the base catalog
(`busy`, `timeout`, `cancelled`, `validation`, `internal`) keep their existing meaning; two agent-loop
codes are related but owned outside the provider layer — `tool_failed` (invalid/failed tool call) and
`agent_limit` (loop hit its iteration/wall-clock limit) — see `agentic-tool-loop` for those.

Every mapped error becomes an `apperr.AppError` with a user-facing title/message, is logged with its
`cause` once at the handler boundary (`ToWire`, per `go-error-envelope.md`), and reaches the UI only as
a sanitized `WireError` — never a secret, never a full internal path.

**EnumBind requirement.** `ErrorCode` is exposed to TypeScript as a real enum via `EnumBind` in
`main.go`. Adding a new `ErrorCode` without adding it to the `EnumBind` list causes TS enum drift and
`wails generate module` / `just check` to fail — see `references/troubleshooting.md`.

## Spec references

- `specification/02_Architecture/08_LLM_INTEGRATION.md` §*Resolved config + secret handling*,
  §*Retry + error mapping*, §*Error codes*
- `specification/01_Product/17_PROVIDERS_MODELS_SETTINGS.md#auth-env-var`
- `specification/00_Foundation/04_DESIGN_DECISIONS.md` DD-45, DD-48
- `.claude/rules/go-error-envelope.md` — the canonical bound-handler skeleton, `Details` allowlist rule
- `.claude/rules/llm-integration.md` — secret handling and retry/timeout DO/DON'T
