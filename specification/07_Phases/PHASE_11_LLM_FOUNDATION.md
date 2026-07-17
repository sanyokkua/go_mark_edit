**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester
**Last Updated:** 2026-07-14
**Cross-references:** `00_ROADMAP.md`, `../01_Product/17_PROVIDERS_MODELS_SETTINGS.md`, `../01_Product/18_TOKENIZER_AND_CONTEXT.md`, `../01_Product/14_LLM_ASSISTANT_OVERVIEW.md`, `../02_Architecture/08_LLM_INTEGRATION.md`, `../03_NonFunctional/03_SECURITY_AND_PRIVACY.md`, `../03_NonFunctional/04_OFFLINE.md`, `../00_Foundation/04_DESIGN_DECISIONS.md`, `../00_Foundation/06_IMPLEMENTATION_STAGES.md`, `../06_Process_and_Traceability/01_MODULE_INVENTORY.md`, `../06_Process_and_Traceability/06_DEFINITION_OF_DONE.md`

# Phase 11 — LLM Foundation

## Goal

Stand up the backend and configuration substrate the assistant needs, with **no assistant UI behaviour
yet beyond settings**. This phase delivers the provider abstraction (a single OpenAI-compatible client
parameterized by a per-kind profile, built by a factory), model discovery, draft-config verification
(Test connection / Test models / Test inference), the app-owned retry/timeout + error-classification
policy, the offline tokenizer (estimate + fit), the additive `providers` table plus AI KV settings keys,
and the two AI Settings tabs (**AI / Providers**, **AI Context**). It reuses the existing single-flight
gate for test inference. On exit, a user can configure and verify a **local** provider and pick a model;
running an action/chat over the document is Phase 12+.
Refines: `../01_Product/14_LLM_ASSISTANT_OVERVIEW.md#assistant-sidebar` (the Stage-3 umbrella this phase's substrate serves).

## Depends on

- Phase 08 (Settings dialog shell + KV settings registry — the F4 growable registry the AI tabs extend).
- Phase 02 (document model + file services — the DB the additive `providers` migration lands in).
- Seam reuse: F5 (generic single-flight gate, `apperr` envelope, DI root), F6 (HTTP-client seam permitted).

## Scope

- `Provider` interface + `OpenAICompatibleProvider` + per-kind `ProviderProfile` + `NewFactory` (Ollama, LM Studio, llama.cpp, OpenAI, Azure OpenAI, generic compatible).
- API-key auth by **environment-variable name only** — never persisted, never logged.
- `ListModels` model discovery parsing the OpenAI-compatible `/v1/models` shape.
- App-owned **retry/timeout + error classification** mapping transport/status failures to `ErrorCode` (unreachable / timeout / auth / rate-limited / context-window / internal).
- `internal/llm/verify` — `TestConnection` / `TestModels` / `TestInference`; `TestInference` acquires the single-flight gate.
- `internal/llm/tokenizer` — offline token `Estimate` + safety margin + reply reserve + `Fits` check (no network).
- `internal/settings` extension — additive `providers` table migration + AI KV keys (selected provider/model, params, estimator, margins, strategies, max iterations).
- Provider/verify Wails bindings + adapter methods.
- **AI / Providers** settings tab (kind, base URL, auth scheme, headers, model, params, the three Test buttons).
- **AI Context** settings tab (estimator, safety margin, reply reserve, over-context strategy, history strategy, max tool iterations).

## Out of scope

- The action catalog, the agent loop, and any document-editing run — Phase 12 (STORY-078+).
- Chat, workspace-file tools, streaming into a transcript — Phase 13.
- The explicit context budgeter (`internal/llm/context`) and over-context chunking — Phase 14 (this phase ships the tokenizer/fit primitive only; budget allocation is STORY-091).
- The assistant sidebar itself (header/scope/actions/transcript) — Phase 12 (STORY-082).

## Suggested stories / tasks

> Planned backlog for this phase. The `architect` generates the actual story files into `../docs/stories/` during implementation (one story per session), assigning the ids shown.


| Story id | Title | Est(S/M/L) | Modules | Spec clauses | depends_on |
|---|---|---|---|---|---|
| STORY-070 | Define the Provider interface, OpenAI-compatible client, per-kind profile, factory, env-var secret, error mapping, and model discovery | L | `internal/llm/providers/`, `internal/apperr/` | `01_Product/17_PROVIDERS_MODELS_SETTINGS.md#provider-kinds`, `01_Product/17_PROVIDERS_MODELS_SETTINGS.md#provider-config`, `01_Product/17_PROVIDERS_MODELS_SETTINGS.md#auth-env-var`, `01_Product/17_PROVIDERS_MODELS_SETTINGS.md#model-discovery`, `02_Architecture/08_LLM_INTEGRATION.md#overview`, `02_Architecture/08_LLM_INTEGRATION.md#provider-abstraction`, `02_Architecture/08_LLM_INTEGRATION.md#error-codes`, `03_NonFunctional/03_SECURITY_AND_PRIVACY.md#9-llm-data-flow-and-privacy` | STORY-002 |
| STORY-071 | Own retries, timeouts, and error classification around provider calls with backoff and Retry-After | M | `internal/llm/providers/`, `internal/apperr/` | `01_Product/17_PROVIDERS_MODELS_SETTINGS.md#verification`, `02_Architecture/08_LLM_INTEGRATION.md#error-codes`, `00_Foundation/04_DESIGN_DECISIONS.md#11-llm-assistant-stage-3` | STORY-070 |
| STORY-072 | Add the additive `providers` table migration and AI KV settings keys to the settings registry | M | `internal/settings/`, `internal/db/` | `01_Product/17_PROVIDERS_MODELS_SETTINGS.md#persistence`, `02_Architecture/08_LLM_INTEGRATION.md#persistence`, `00_Foundation/06_IMPLEMENTATION_STAGES.md#3-forward-compatibility-constraints-per-stage`, `01_Product/14_LLM_ASSISTANT_OVERVIEW.md#forward-compat` | STORY-005 |
| STORY-073 | Implement the offline tokenizer estimate, safety margin, reply reserve, and fit check | M | `internal/llm/tokenizer/` | `01_Product/18_TOKENIZER_AND_CONTEXT.md#token-estimation`, `01_Product/18_TOKENIZER_AND_CONTEXT.md#safety-margin`, `01_Product/18_TOKENIZER_AND_CONTEXT.md#reply-reserve`, `01_Product/18_TOKENIZER_AND_CONTEXT.md#fit-meter`, `02_Architecture/08_LLM_INTEGRATION.md#tokenizer` | STORY-002 |
| STORY-074 | Build the verify service (Test connection / Test models / Test inference) reusing the single-flight gate | M | `internal/llm/verify/`, `internal/gate/`, `internal/llm/providers/` | `01_Product/17_PROVIDERS_MODELS_SETTINGS.md#verification`, `02_Architecture/08_LLM_INTEGRATION.md#gate-and-cancellation`, `03_NonFunctional/04_OFFLINE.md#6-network-policy-revision-stage-3-llm`, `00_Foundation/04_DESIGN_DECISIONS.md#11-llm-assistant-stage-3` | STORY-071 |
| STORY-075 | Bind the provider/verify/model-discovery handlers and expose them through the adapter | M | `internal/application/`, `logic/adapter/`, `logic/store/assistant/` | `01_Product/17_PROVIDERS_MODELS_SETTINGS.md#verification`, `02_Architecture/08_LLM_INTEGRATION.md#events`, `02_Architecture/08_LLM_INTEGRATION.md#provider-abstraction` | STORY-074, STORY-072 |
| STORY-076 | Build the AI / Providers settings tab with kind, base URL, auth, model discovery, params, and the three Test buttons | L | `ui/widgets/settings/`, `logic/store/assistant/`, `ui/primitives/` | `01_Product/17_PROVIDERS_MODELS_SETTINGS.md#provider-config`, `01_Product/17_PROVIDERS_MODELS_SETTINGS.md#inference-params`, `01_Product/17_PROVIDERS_MODELS_SETTINGS.md#defaults-local`, `00_Foundation/04_DESIGN_DECISIONS.md#11-llm-assistant-stage-3` | STORY-075 |
| STORY-077 | Build the AI Context settings tab (estimator, safety margin, reply reserve, over-context and history strategies, max tool iterations) | M | `ui/widgets/settings/`, `logic/store/assistant/` | `01_Product/18_TOKENIZER_AND_CONTEXT.md#context-budget`, `01_Product/18_TOKENIZER_AND_CONTEXT.md#history-strategy`, `01_Product/18_TOKENIZER_AND_CONTEXT.md#over-context-strategy`, `00_Foundation/04_DESIGN_DECISIONS.md#11-llm-assistant-stage-3` | STORY-072, STORY-073 |

## Edge cases

- **EC-LLM-7** — Provider unreachable (connection refused / DNS) or request timeout → classified `unreachable`/`timeout`, retried only if retryable, surfaced after the retry budget; no crash (STORY-071/074).
- **EC-LLM-18** — Auth failure (401/403) → non-retryable `auth` error; the env-var **name** may appear, the key value never does (STORY-070/071).
- **EC-LLM-8** — Configured API-key env-var is unset → clear config error **before** any HTTP request (STORY-070).
- **EC-LLM-9** — Model discovery returns an empty or malformed list → empty model set handled, picker shows "no models", no crash (STORY-070/076).
- **EC-LLM-19** — Rate-limited (429 with `Retry-After`) → honoured backoff, retried within budget (STORY-071).

## Phase exit checklist

Automated:

- [ ] `NewFactory` builds a working provider for each of the six kinds and a chat request serializes to the OpenAI wire shape (STORY-070-AC-1/2).
- [ ] An unset/incorrect API-key env-var produces a config/auth error and **no** secret appears in any log line (EC-LLM-18/8).
- [ ] Transport/status failures map to the correct `ErrorCode`; only retryable classes retry, honouring `Retry-After` (EC-LLM-7/19).
- [ ] `TestInference` acquires the single-flight gate; a concurrent test attempt reports `Busy` (STORY-074).
- [ ] The tokenizer estimate + margin + reply-reserve compute a deterministic `Fits` result offline (STORY-073).
- [ ] The `providers` migration is additive (new table only) and `sqlc diff` is clean (STORY-072).
- [ ] `just check` and `just trace-check` are green; bindings regenerated with no drift (`wails generate module`).

Manual:

- [ ] In `wails dev`: configure a **local** provider (Ollama/LM Studio), run all three Test buttons green, list and select a model, and save — no network request leaves the machine except to the configured local endpoint on the explicit Test action.
- [ ] The AI Context tab persists estimator/margin/strategy/max-iteration settings across relaunch.

DoD reference: `06_Process_and_Traceability/06_DEFINITION_OF_DONE.md`. Honours Stage-3 exit criteria
(`00_Foundation/06_IMPLEMENTATION_STAGES.md#5-stage-exit-criteria`) and forward-compat seams F4/F5/F6.
Contributes to Milestone **M3**.
