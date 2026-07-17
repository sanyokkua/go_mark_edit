# Troubleshooting

Common mistakes when touching the provider layer, plus a quick-lookup index of every `ErrorCode`.

## Common mistakes

- **Wrote a new per-kind client** instead of a profile row + factory registration (violates DD-45; see
  `references/provider-profiles.md`).
- **Persisted or logged the API key** — only the env-var *name* may be stored, and never in `Details`
  (see `references/secrets-and-errors.md`).
- **Sent unauthenticated when the env var was unset** — that must be `missing_credential`, not a send.
- **Baked retry/timeout into the `*http.Client`** — classification and backoff belong to the
  **service** (DD-48).
- **Ignored `Retry-After` on 429**, or retried a non-retryable class (`auth`, `model_not_found`).
- **Non-additive migration on the `providers` table** (rewrite/backfill) — must be additive only.
- **Forgot to acquire the gate in `TestInference`**, or recorded it to the run transcript — verification
  is diagnostic-only and never recorded (see `references/discovery-verification-persistence.md`).
- **Added a new `ErrorCode` but forgot the `EnumBind` entry** → TS enum drift, `wails generate module`
  / `just check` fails.
- **Config edited mid-run mutated the active run** — it must apply only to the *next* run (EC-LLM-16);
  the in-flight run's transcript keeps the provider/model snapshot it started with.
- **Fabricated a key or silently proceeded** when discovery found zero models (EC-LLM-9) — surface the
  classified error/empty state instead of guessing a model id.
- **Showed the secret value instead of the env-var name** in an `auth` (401/403) error message
  (EC-LLM-18) — the name may appear, the value never does.
- **Opened a network call outside a user action** — the provider HTTP client is the app's only outbound
  socket, and only on user-invoked inference (ADR-0011); no background/unsolicited call is ever
  permitted, even for "just checking" a provider.

## ErrorCode quick-lookup

| Code | When | Retryable |
|---|---|---|
| `busy` | Single-flight gate held — another inference (run or `TestInference`) is active | no |
| `provider_unreachable` | Transport failure reaching the endpoint (refused / DNS / reset) | yes |
| `timeout` | Inference exceeded the app-owned deadline | yes |
| `auth` | Endpoint returned 401/403 (bad/rejected credential) | no |
| `missing_credential` | Configured env-var name is unset in the environment | no |
| `model_not_found` | 404 — configured model/endpoint path not found | no |
| `context_window` | Prompt overflowed the model's context window (400, or the reactive backstop) | no |
| `rate_limited` | 429 — provider throttling; backoff honors `Retry-After` | yes |
| `upstream` | Other non-2xx upstream failure not otherwise classified | sometimes |
| `empty_completion` | 2xx but the model returned no usable text | yes |
| `cancelled` | User or shutdown cancelled the run | no |
| `tool_failed` | A tool call had invalid arguments or failed to execute (agent loop, not provider) | no |
| `agent_limit` | Loop hit the iteration or wall-clock limit without converging (agent loop, not provider) | no |
| `validation` | Bad request argument / precondition on a bound LLM method | no |
| `internal` | Catch-all / panic fallback | yes |

`tool_failed` and `agent_limit` are produced by the agent loop, not the provider layer — see
`agentic-tool-loop` for their handling; they are listed here only so the full catalog is visible in one
place.

## Spec references

- `specification/02_Architecture/08_LLM_INTEGRATION.md#error-codes`
- `specification/01_Product/17_PROVIDERS_MODELS_SETTINGS.md` (EC-LLM-8, EC-LLM-9, EC-LLM-16, EC-LLM-18)
- `.claude/rules/llm-integration.md` — DO/DON'T and authoring checklist
