---
name: llm-provider-integration
description: >
  Use when adding or adjusting an LLM provider kind (ollama · lmstudio · llamacpp · openai · azure ·
  compat), model discovery, provider verification (Test connection / Test models / Test inference),
  the AI/Providers settings tab, inference params, retry/error classification, or secret (env-var)
  handling for the GoMarkEdit Stage-3 assistant. Triggers: ProviderProfile, ProviderFactory,
  OpenAICompatibleProvider, ResolvedConfig, missing_credential, provider_unreachable, ListModels,
  providers table, os.Getenv env-var name, EnumBind ErrorCode, internal/llm/providers,
  internal/llm/verify. Stage-3 only; additive to Stage-1/2.
allowed-tools: Read, Edit, Write, Bash, Glob, Grep
references:
  - references/provider-profiles.md
  - references/secrets-and-errors.md
  - references/discovery-verification-persistence.md
  - references/troubleshooting.md
assets:
  - assets/provider-profile-template.md
---

# LLM Provider Integration

The provider layer (`internal/llm/providers/`) is the **one** OpenAI-compatible HTTP client that every
provider kind flows through, parameterized by a per-kind `ProviderProfile` and selected by a
`ProviderFactory`. It is a hand-written Go client over an OpenAI-compatible endpoint — no agent
framework, no per-kind client class.

## When to use

- Adding a new provider kind, base URL / auth / path shape, or model-discovery strategy.
- Touching `ListModels`, `verify.TestConnection/TestModels/TestInference`, or the retry/error mapping.
- Wiring the **AI / Providers** settings tab, `ProviderConfig`, `ModelConfig`, or the `providers` table.
- Handling a secret (env-var name), a `missing_credential`/`auth` error, or persistence of provider
  config.

## When NOT to use

- Building the tool-call loop, cancellation, or edit-proposal diff → use `agentic-tool-loop`.
- Token estimation, fit meter, context budget, history trimming → use `context-and-tokenizer`.
- Anything in Stages 1–2. The assistant is **Stage-3 only** and **additive**: it consumes the reserved
  seams (F1–F9) and restructures no existing handler, service, or table. A new provider kind is a new
  **profile row**, never new client code or a rewrite.

## Source of truth

- `specification/02_Architecture/08_LLM_INTEGRATION.md` — *Provider abstraction*, *Model discovery*,
  *Retry + error mapping*, *Error codes*, *Persistence*.
- `specification/01_Product/17_PROVIDERS_MODELS_SETTINGS.md` — provider kinds, config, `#auth-env-var`,
  `#model-discovery`, `#verification`, `#inference-params`, `#persistence`, `#defaults-local`.
- `specification/01_Product/14_LLM_ASSISTANT_OVERVIEW.md` — the sidebar / privacy-and-network posture.
- `specification/00_Foundation/04_DESIGN_DECISIONS.md` — DD-45, DD-46, DD-48, DD-52, DD-53, DD-54
  (and DD-32 revised).
- `specification/08_Decisions/0007-llm-provider-abstraction.md` (ADR-0007);
  `0011-network-policy-llm-exception.md` (ADR-0011).
- `specification/02_Architecture/01_MODULE_INVENTORY.md` — the only valid module paths
  (`internal/llm/providers/`, `internal/llm/verify/`, `internal/settings/`, `internal/gate/`,
  `internal/apperr/`).
- Rules: `.claude/rules/llm-integration.md`, `offline-and-privacy.md`, `go-error-envelope.md`.

## Workflow (load references progressively)

1. **Orient.** Read the *Provider abstraction / Model discovery / Persistence* sections of
   `08_LLM_INTEGRATION.md` plus DD-45/46/48/52/53/54 and ADR-0007 (see Source of truth above).
2. **Add a kind = a profile row, never a new client.** Add a `ProviderProfile` row (auth scheme, base
   URL, path templates, discovery strategy, capabilities) and register it in `NewFactory()`. Full
   `ProviderProfile`/`OpenAICompatibleProvider`/`NewFactory`/`Build` code and the per-kind table
   (ollama/lmstudio/llamacpp/openai/azure/compat) are in
   `references/provider-profiles.md`. A blank fill-in row + checklist is in
   `assets/provider-profile-template.md`.
3. **Wire the secret by env-var name only.** Thread config through `ResolvedConfig`; resolve the
   secret from the env-var name via `os.Getenv` **at call time only**, never persist/log/transcript it;
   unset → `missing_credential`, never an unauthenticated send. Full `ResolvedConfig`/`authHeader` code
   is in `references/secrets-and-errors.md`.
4. **Extend `ListModels` only if genuinely new.** Add a `DiscoveryStrategy` case only when the
   endpoint's model-list shape is not already covered (OpenAI `/v1/models` list vs. Ollama-style
   `/api/tags`) — see `references/discovery-verification-persistence.md`.
5. **Map every outcome to the fixed `ErrorCode` table.** Retry/error classification is owned by the
   **service**, never the `*http.Client`; honor `Retry-After` on 429; add any new `ErrorCode` to the
   `EnumBind` list in `main.go`. Full outcome→code→retryable table is in
   `references/secrets-and-errors.md`.
6. **Persist additively; wire the settings tab.** New `providers` table via an additive goose migration
   (never rewrite/backfill); current-provider id + scalar AI prefs as KV keys in
   `settings(key,value,type)`; secrets never persisted; history stores a name **snapshot**. Wire the
   AI/Providers tab (provider, base URL, auth, model, params, three Test buttons) through
   `logic/adapter/`. Full detail — including `internal/llm/verify` `TestConnection`/`TestModels`/
   `TestInference` and the gate/transcript rules — is in
   `references/discovery-verification-persistence.md`.
7. **Regenerate and verify.** Run `wails generate module` after any bound-signature change; run
   `just check`; confirm **zero `frontend/wailsjs/` drift** (`git diff --exit-code frontend/wailsjs/`).

## Reference Index

| File | Contents |
|---|---|
| `references/provider-profiles.md` | Full `ProviderProfile`/`OpenAICompatibleProvider`/`NewFactory`/`Build` Go code; the "profile row, never a new client" rule; per-kind table (base URL, auth scheme, models path, discovery strategy) for ollama/lmstudio/llamacpp/openai/azure/compat |
| `references/secrets-and-errors.md` | Full `ResolvedConfig`/`authHeader` Go code (env-var NAME only, `os.Getenv` at call time, unset → `missing_credential`); the full outcome→`ErrorCode`→retryable table (DD-48); `EnumBind` requirement |
| `references/discovery-verification-persistence.md` | `ListModels` + `DiscoveryStrategy`; `internal/llm/verify` `TestConnection`/`TestModels`/`TestInference` against the **draft** config, gate acquisition, never-recorded-to-transcript rule; additive persistence (`providers` table, KV keys, `ModelConfig`, secret exclusion, history name snapshot) |
| `references/troubleshooting.md` | Common-mistakes list; quick-lookup index of every `ErrorCode` and its retryability |
| `assets/provider-profile-template.md` | Fill-in template for a new `ProviderProfile` row + registration checklist |

## Mandatory validation (before finishing)

- [ ] New kind is a `ProviderProfile` row + `NewFactory()` registration, reusing
      `OpenAICompatibleProvider` — no new per-kind client class.
- [ ] Secret is env-var-name only; resolved at call time via `os.Getenv`; never persisted/logged/
      transcript-stored; unset → `missing_credential` (never an unauthenticated send).
- [ ] Discovery + retry/error mapping match the fixed tables in `references/secrets-and-errors.md` and
      `references/discovery-verification-persistence.md`; any new `ErrorCode` is added to `EnumBind`.
- [ ] `TestInference` acquires the single-flight `internal/gate` (Busy if held) and is **not** recorded
      to a run transcript.
- [ ] Persistence is additive only (`providers` migration and/or KV keys); no non-additive
      rewrite/backfill migration.
- [ ] Default provider stays local; no network call except a user-invoked inference to the configured
      endpoint (ADR-0011).
- [ ] `wails generate module` run after any bound-signature change; `just check` passes; no
      `frontend/wailsjs/` drift.

## Gotchas

- Writing a new per-kind client instead of a profile row + factory registration violates DD-45 — see
  `references/provider-profiles.md`.
- Baking retry/timeout into the `*http.Client` instead of the service violates DD-48 — see
  `references/secrets-and-errors.md`.
- A non-additive migration on the `providers` table (rewrite/backfill) is never allowed — see
  `references/discovery-verification-persistence.md`.
- Full troubleshooting list (secrets, gate, transcript, `EnumBind` drift) lives in
  `references/troubleshooting.md` — check it before declaring a provider change done.

## Spec references

- `specification/02_Architecture/08_LLM_INTEGRATION.md` (Provider abstraction, Model discovery, Retry +
  error mapping, Error codes, Persistence)
- `specification/01_Product/17_PROVIDERS_MODELS_SETTINGS.md`; `14_LLM_ASSISTANT_OVERVIEW.md`
- `specification/00_Foundation/04_DESIGN_DECISIONS.md` (DD-32 revised, DD-45, DD-46, DD-48, DD-52–DD-54)
- `specification/08_Decisions/0007-llm-provider-abstraction.md`, `0011-network-policy-llm-exception.md`
- `specification/02_Architecture/01_MODULE_INVENTORY.md` (`internal/llm/providers/`,
  `internal/llm/verify/`, `internal/settings/`, `internal/gate/`, `internal/apperr/`)
- Rules: `.claude/rules/llm-integration.md`, `offline-and-privacy.md`, `go-error-envelope.md`
