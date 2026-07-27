# Discovery, Verification, and Persistence

Model discovery, draft-config verification, and additive persistence for the provider layer.

## Model discovery (DD-46)

`ListModels` calls the profile's `ModelsPathTemplate` and parses it per `DiscoveryStrategy` (an OpenAI
`/v1/models` list vs. an Ollama-style `/api/tags`), returning `[]ModelInfo{ID, …}` for the model picker
and the AI/Providers settings tab.

The **Model** selector (mockup **Model** group) is populated by querying the provider's models endpoint
for the current draft config; the mockup shows discovered models `qwen2.5:7b`, `llama3.1:8b`,
`gemma3:4b`, `mistral-nemo` and a "Discovered from the provider" hint. Discovery is a **user-initiated**
network call to the configured provider only (DD-32 revised, DD-54) — it happens when the user
opens/refreshes the provider settings or runs **Test models**, never in the background.

**EC-LLM-9 — No models discovered.** If discovery returns an empty list or fails (endpoint down, wrong
base URL), the model selector shows an empty/"none found" state with the classified error; the user can
still type a known model id manually where the profile allows, but cannot save a config whose model is
unverifiable without acknowledging it.

## Verification (DD-46, `17_...#verification`)

`internal/llm/verify` runs three **draft-config** checks — the mockup's Test buttons, each with a
result badge — against the **draft** (unsaved) config, before saving, so problems are caught before
persistence:

- **`TestConnection`** — reaches the base URL and confirms the endpoint responds (badge `✓`).
- **`TestModels`** — lists models and reports the count (badge `✓ 14 found`).
- **`TestInference`** — runs one **minimal** inference on the draft config and reports latency (badge
  `✓ 420 ms`).

Because `TestInference` performs **real inference**, it acquires the same process-wide `internal/gate`
that guards `AgentHandler.RunAgent` (`TryAcquire()`; `busy` if held) — it cannot run concurrently with
an assistant run and vice-versa (DD-46, DD-47). Release the gate in a `defer` on every exit
(success/error/cancel), matching the rule in `.claude/rules/llm-integration.md`.

**Verification is diagnostic: it validates a draft and is never recorded to the run transcript.**
Failures are classified (unreachable / timeout / auth / rate-limited / …) using the same
`ErrorCode` table as ordinary inference (`references/secrets-and-errors.md`) and surfaced through the
Result-envelope + toast path (DD-48).

`internal/llm/verify` module row (module inventory): depends on `providers`, `gate`, `apperr`;
`TestInference` acquires the gate (DD-46/DD-47).

## Persistence — additive (DD-46, DD-52, F4)

Assistant configuration extends `internal/settings` **additively** — no pre-assistant/2 handler, service, or
table is changed destructively:

- A new **`providers` table** via an **additive goose migration** (never a rewrite/backfill), holding
  each provider config: kind, user-facing `name`, base URL, auth scheme, custom headers,
  **environment-variable name** (not the secret), selected model id, and inference params.
- The **current-provider id** and other scalar AI preferences (estimator choice, safety margin, reply
  reserve, over-context strategy, history strategy, max tool iterations) live as **KV keys** in the
  existing generic `settings(key, value, type)` table, so most of them need no migration at all.
- `ModelConfig{ name, temperature, maxOutputTokens, contextWindow }` captures the per-model inference
  parameters (DD-52), sent as pointer fields so "unset" is distinct from "zero".
- **Secrets are never persisted.** Only the env-var *name* is stored; the value is read from
  `os.Getenv` at call time and never written to the DB or a log.
- Historical run transcripts, if retained, store a **snapshot** of the provider/model name at run time
  (DD-55); **renaming or reconfiguring a provider later never rewrites that history.**
- The **session transcript** (messages + tool calls + applied edits) is kept in memory for the current
  session per document/tab and is **not** persisted across launches in v1.

Assistant settings live in two dedicated Settings tabs (DD-53): **AI / Providers** (provider, base URL,
auth, model, params, the three Test buttons) and **AI Context** (estimator, margins, over-context and
history strategies, max iterations — see `context-and-tokenizer`). The **Content & privacy** tab
additionally states the on-demand/local-only LLM posture.

## Defaults local (DD-32 revised, DD-46, DD-54)

**The default provider is local.** On first configuration the app defaults to a local kind (e.g.
Ollama at `http://127.0.0.1:11434`) with auth **None**, so a default install keeps all document text
on-device and makes **zero** calls to any third party. The **AI / Providers** tab states this plainly
("Local providers keep everything on-device"), and the status bar reflects a connected local provider
(`● Ollama connected`).

Remote kinds (OpenAI, Azure, generic compatible) are strictly **opt-in**: the user must select the
kind, enter the endpoint, and reference their own credential env-var name. Until a provider is
configured and verified, the assistant sidebar stays hidden by default.

## Spec references

- `specification/02_Architecture/08_LLM_INTEGRATION.md` §*Model discovery*, §*Persistence*
- `specification/01_Product/17_PROVIDERS_MODELS_SETTINGS.md#model-discovery`, `#verification`,
  `#persistence`, `#defaults-local`
- `specification/00_Foundation/04_DESIGN_DECISIONS.md` DD-32 (revised for the assistant phases), DD-46, DD-52, DD-55
- `specification/02_Architecture/01_MODULE_INVENTORY.md` (`internal/llm/verify/`,
  `internal/settings/` extended row)
- `.claude/rules/offline-and-privacy.md` — the only permitted outbound call is a user-invoked LLM
  inference to the user-configured provider
