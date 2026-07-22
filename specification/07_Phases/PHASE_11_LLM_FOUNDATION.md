**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester, reviewer
**Last Updated:** 2026-07-21
**Cross-references:** `00_ROADMAP.md`, `../00_Foundation/06_IMPLEMENTATION_STAGES.md`, `../01_Product/14_LLM_ASSISTANT_OVERVIEW.md`, `../01_Product/17_PROVIDERS_MODELS_SETTINGS.md`, `../01_Product/18_TOKENIZER_AND_CONTEXT.md`, `../02_Architecture/08_LLM_INTEGRATION.md`, `../03_NonFunctional/03_SECURITY_AND_PRIVACY.md`, `../03_NonFunctional/04_OFFLINE.md`, `../08_Decisions/0007-llm-provider-abstraction.md`, `../08_Decisions/0011-network-policy-llm-exception.md`, `../06_Process_and_Traceability/07_PHASE_FORMAT.md`

# Phase 11 — LLM Foundation

## Goal

Establish the secure, local-first provider, verification, tokenizer, persistence, binding, and settings substrate for Stage 3 without adding document actions, chat, or assistant-side mutation behavior.

## Phase metadata

| Phase | Kind | Stage / milestone | Depends on | Completion scope |
|---|---|---|---|---|
| PH11 | sequential | Stage 3 / M3 foundation | PH00, PH02, PH08, PH09, PH10 | once per supported provider/configuration contract revision |

## Scope

- One OpenAI-compatible provider implementation parameterized by six provider-kind profiles.
- Draft configuration for the complete provider record, env-var-name credential handling, model discovery, app-owned retry/request-timeout/error classification, and three verification diagnostics.
- Additive provider persistence plus selected-model, run wall-clock timeout, and AI Context KV settings.
- Offline token estimation, safety margin, reply reserve, and fit calculation.
- Result-enveloped Wails handlers, adapter/store projections, AI / Providers plus AI Context settings tabs, and the Content & privacy LLM disclosure.

## Out of scope

- The action catalog, assistant sidebar runtime, document tools, edit proposals, and agent runs, owned by PH12.
- Multi-turn chat, workspace tools, streaming transcript, and full loop behavior, owned by PH13.
- Explicit context allocation, chunking, and history trimming, owned by PH14.
- Any background discovery, prewarming, telemetry, or Stage-1/2 provider code.

## Requirement ledger

| ID | Required outcome | Source clauses | Constraints | Work package |
|---|---|---|---|---|
| PH11-R01 | A typed `Provider` interface, factory, and per-kind profile support exactly Ollama, LM Studio, llama.cpp, OpenAI, Azure OpenAI, and generic OpenAI-compatible endpoints through one shared client. | `01_Product/17_PROVIDERS_MODELS_SETTINGS.md#provider-kinds`; `02_Architecture/08_LLM_INTEGRATION.md#provider-abstraction`; `08_Decisions/0007-llm-provider-abstraction.md#decision-outcome` | DD-45; ADR-0007; profile data rather than duplicated clients | PH11-W01 |
| PH11-R02 | The typed provider record validates kind, user-facing name, base URL, auth scheme, custom headers, selected model, nullable inference parameters, and credential environment-variable names; secret values are resolved only at request time and never enter persisted, logged, transcript, event, or WireError data. | `01_Product/17_PROVIDERS_MODELS_SETTINGS.md#provider-config`; `01_Product/17_PROVIDERS_MODELS_SETTINGS.md#auth-env-var`; `02_Architecture/08_LLM_INTEGRATION.md#resolved-config--secret-handling`; `02_Architecture/08_LLM_INTEGRATION.md#persistence` | DD-45; custom-header representation/redaction blocked by PH11-X03 | PH11-W02 |
| PH11-R03 | User-initiated model discovery follows the active draft profile, handles OpenAI/Ollama response shapes, and returns a typed empty/error state without background polling. | `01_Product/17_PROVIDERS_MODELS_SETTINGS.md#model-discovery`; `02_Architecture/08_LLM_INTEGRATION.md#model-discovery` | DD-46; DD-54; network-policy conflict blocked by PH11-X01 | PH11-W03 |
| PH11-R04 | Provider calls use app-owned deadlines, bounded retry/backoff, `Retry-After`, and the fixed typed error classification; non-retryable failures never retry. | `02_Architecture/08_LLM_INTEGRATION.md#retry--error-mapping-owned-by-the-service`; `02_Architecture/08_LLM_INTEGRATION.md#error-codes` | DD-48; sanitized Result envelope; deterministic retry budget | PH11-W04 |
| PH11-R05 | Test connection, Test models, and gate-guarded minimal Test inference run against the unsaved draft and report classified diagnostic results without entering a run transcript. | `01_Product/17_PROVIDERS_MODELS_SETTINGS.md#verification`; `02_Architecture/08_LLM_INTEGRATION.md#gate-and-cancellation`; `08_Decisions/0007-llm-provider-abstraction.md#decision-outcome` | DD-46; DD-47; PH11-X01 and PH11-X02 | PH11-W05 |
| PH11-R06 | An additive migration persists the permitted provider record—kind, user-facing name, base URL, auth scheme, custom headers, selected model id, inference parameters, and credential environment-variable names—while current-provider id and scalar AI preferences use KV storage; no secret value is ever stored. | `01_Product/17_PROVIDERS_MODELS_SETTINGS.md#persistence`; `02_Architecture/08_LLM_INTEGRATION.md#persistence` | F4; additive-only; sqlc-generated store untouched; PH11-X03 | PH11-W06 |
| PH11-R07 | Offline estimation supports embedded BPE and chars-div-4 fallback, applies configurable margin/reply reserve, and returns deterministic fit states without a provider call. | `01_Product/18_TOKENIZER_AND_CONTEXT.md#token-estimation`; `01_Product/18_TOKENIZER_AND_CONTEXT.md#safety-margin`; `01_Product/18_TOKENIZER_AND_CONTEXT.md#reply-reserve`; `01_Product/18_TOKENIZER_AND_CONTEXT.md#fit-meter`; `02_Architecture/08_LLM_INTEGRATION.md#tokenizer` | DD-50; ADR-0009; estimate never presented as exact | PH11-W07 |
| PH11-R08 | Provider/verification/settings handlers obey Handler-Service-Repository and concrete Result-envelope rules; only `logic/adapter/` consumes generated bindings. | `02_Architecture/08_LLM_INTEGRATION.md#overview`; `02_Architecture/02_BACKEND_GO.md#error-envelope`; `02_Architecture/03_FRONTEND_REACT.md#adapter-layer` | no bound context parameter; recover to internal; generated binding drift forbidden | PH11-W08 |
| PH11-R09 | AI / Providers exposes draft kind, user-facing name, base URL, auth scheme, credential env-var name, custom headers, selected model, inference parameters, and diagnostics; the persisted active record changes only through the resolved save policy and never displays/resolves a secret value into frontend state. | `01_Product/17_PROVIDERS_MODELS_SETTINGS.md#provider-config`; `01_Product/17_PROVIDERS_MODELS_SETTINGS.md#auth-env-var`; `01_Product/17_PROVIDERS_MODELS_SETTINGS.md#inference-params`; `01_Product/17_PROVIDERS_MODELS_SETTINGS.md#defaults-local`; `01_Product/17_PROVIDERS_MODELS_SETTINGS.md#verification` | DD-45; DD-46; DD-52; DD-53; PH11-X02; PH11-X03 | PH11-W09 |
| PH11-R10 | AI Context exposes estimator, margin, reply reserve, over-context/history strategies, max iterations, and the per-run wall-clock timeout through typed validation and persistence; every bounded run consumes one immutable validated limits snapshot. | `01_Product/18_TOKENIZER_AND_CONTEXT.md#safety-margin`; `01_Product/18_TOKENIZER_AND_CONTEXT.md#reply-reserve`; `01_Product/18_TOKENIZER_AND_CONTEXT.md#over-context-strategy`; `01_Product/18_TOKENIZER_AND_CONTEXT.md#history-strategy`; `01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md#limits`; `02_Architecture/08_LLM_INTEGRATION.md#agent-loop` | DD-40; DD-47; DD-50–53; timeout default/range blocked by PH11-X04; no budgeter/chunk execution yet | PH11-W10 |
| PH11-R11 | The default configuration is local and no provider operation occurs without an explicit user action to the selected draft/configured endpoint. | `01_Product/17_PROVIDERS_MODELS_SETTINGS.md#defaults-local`; `01_Product/14_LLM_ASSISTANT_OVERVIEW.md#privacy-and-network`; `03_NonFunctional/04_OFFLINE.md#6-network-policy-revision-stage-3-llm` | DD-32; DD-54; F6; diagnostic conflict blocked by PH11-X01 | PH11-W05; PH11-W09 |
| PH11-R12 | Content & privacy plainly states that LLM requests go only to the configured provider and only on user action, local providers keep content on-device, and telemetry/auto-update are absent. | `01_Product/14_LLM_ASSISTANT_OVERVIEW.md#privacy-and-network`; `01_Product/17_PROVIDERS_MODELS_SETTINGS.md#persistence`; `03_NonFunctional/03_SECURITY_AND_PRIVACY.md#9-llm-data-flow-and-privacy` | DD-33; DD-34; DD-54; localized and accessible | PH11-W11 |

## State and transition model

| ID | Trigger | Preconditions | Ordered behavior | Result | Failure / preservation | Requirements |
|---|---|---|---|---|---|---|
| PH11-T01 | User edits provider draft | Settings tab is open | Copy persisted config to draft; validate locally; leave active provider unchanged; enable only applicable diagnostics/save actions | Unsaved edits cannot affect an active run/config | Invalid values stay draft-only and send no request | PH11-R02, PH11-R09 |
| PH11-T02 | User requests model discovery or a diagnostic | Draft passes local validation | Resolve env-var if needed; snapshot draft; acquire gate only for Test inference; call configured endpoint; classify result; release gate | Result badges/model list describe that draft snapshot | Missing credential stops before HTTP; stale result cannot overwrite a newer draft; network permission is blocked by PH11-X01 | PH11-R03, PH11-R04, PH11-R05 |
| PH11-T03 | User saves provider draft | Draft and verification evidence exist | Evaluate required verification policy; persist provider/model/env-var name transactionally; update active selection; project acknowledgement | Next run uses one persisted provider/model snapshot | Save-policy alternatives are blocked by PH11-X02; failure preserves prior active config | PH11-R06, PH11-R09 |
| PH11-T04 | Provider request is prepared | Persisted/draft snapshot selects auth and validated limits | Validate params/headers; resolve secret references; build request from profile; apply request deadline/retry classifier within the captured run ceiling | One request contains only permitted config/credential data | Missing secret prevents send; values and sensitive headers follow the PH11-X03 redaction contract | PH11-R01, PH11-R02, PH11-R04, PH11-R10 |
| PH11-T05 | AI settings initialize | Additive migration and KV store are ready | Load full provider records and typed preferences; validate/fallback; render AI and Content & privacy surfaces; do not contact providers | Settings and disclosure are usable offline on launch | Corrupt values follow persistence error policy; no background discovery; no secret becomes display state | PH11-R06, PH11-R09, PH11-R10, PH11-R11, PH11-R12 |
| PH11-T06 | Scope/text/model or numeric limit settings change | Tokenizer and typed settings registry are available | Validate estimator/margin/reserve/window/iteration/timeout values; persist valid values; estimate offline; classify green/amber/red; publish projection | Consumers receive deterministic settings and approximate fit | Invalid numeric configuration is rejected/falls back; timeout acceptance is blocked by PH11-X04; no network is used | PH11-R07, PH11-R10 |

## Cross-phase contracts

| ID | Producer | Consumer | Interface / invariant | Availability / lifetime | Ordering / concurrency | Source | Requirements |
|---|---|---|---|---|---|---|---|
| PH11-C01 | PH08 | PH11 | Growable typed settings registry and AI-tab insertion surface | Application lifetime | Additive migration/keys precede tab hydration | `00_Foundation/06_IMPLEMENTATION_STAGES.md#stage-1-must-leave-open` | PH11-R06, PH11-R09, PH11-R10 |
| PH11-C02 | PH00 | PH11, PH12, PH13, PH14 | Concrete envelopes, DI root, app-wide gate, and scoped HTTP-client seam | Process lifetime | Test inference and assistant runs share non-blocking gate ownership | `01_Product/14_LLM_ASSISTANT_OVERVIEW.md#forward-compat` | PH11-R04, PH11-R05, PH11-R08, PH11-R11 |
| PH11-C03 | PH11 | PH12, PH13, PH14 | Provider factory/client, resolved config snapshots, typed errors, capabilities, and tokenizer/fit primitives | One request/run snapshot; module lifetime | Config is frozen before gate acquisition/request construction | `02_Architecture/08_LLM_INTEGRATION.md#provider-abstraction` | PH11-R01, PH11-R02, PH11-R04, PH11-R07 |
| PH11-C04 | PH11 | PH10 | New provider/context/privacy strings, settings routes, responsive states, and scoped provider-network behavior enter PH10's Stage-3 re-entry inventory | Stage-3 candidate lifetime | PH11 surfaces land before PH10 refresh; PH10 baseline remains a PH11 dependency | `07_Phases/PHASE_10_I18N_PACKAGING.md#cross-phase-contracts` | PH11-R09, PH11-R10, PH11-R12 |
| PH11-C05 | PH11 | PH12 | Saved-and-verified provider availability controls sidebar enablement; default remains hidden before configuration | Application lifetime | Persist/verify acknowledgement precedes assistant Ready state | `01_Product/14_LLM_ASSISTANT_OVERVIEW.md#assistant-sidebar` | PH11-R05, PH11-R09 |

## Edge and failure cases

| Edge case | Role | Source clause | Requirements | Expected behavior | Evidence |
|---|---|---|---|---|---|
| EC-LLM-7 | primary | `01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md#limits` | PH11-R04 | Unreachable/timeout retries only within policy then returns classified error. | `internal/llm/providers/provider_test.go::TestRetryClassification (EC-LLM-7)` |
| EC-LLM-8 | primary | `01_Product/17_PROVIDERS_MODELS_SETTINGS.md#auth-env-var` | PH11-R02 | Missing env var prevents HTTP and identifies only the variable name. | `internal/llm/providers/provider_test.go::TestMissingCredential (EC-LLM-8)` |
| EC-LLM-9 | primary | `01_Product/17_PROVIDERS_MODELS_SETTINGS.md#model-discovery` | PH11-R03, PH11-R09 | Empty/malformed discovery yields no-model/error UI without crash. | `internal/llm/providers/provider_test.go::TestEmptyModels (EC-LLM-9)` |
| EC-LLM-16 | precursor | `01_Product/17_PROVIDERS_MODELS_SETTINGS.md#provider-config` | PH11-R09 | Draft edits remain isolated; PH12 proves in-flight snapshot behavior. | `frontend/src/ui/widgets/settings/ProvidersTab.test.tsx::draft isolation (EC-LLM-16)` |
| EC-LLM-18 | primary | `01_Product/17_PROVIDERS_MODELS_SETTINGS.md#auth-env-var` | PH11-R02, PH11-R04 | 401/403 is non-retryable and never reveals the secret. | `internal/llm/providers/provider_test.go::TestRejectedCredential (EC-LLM-18)` |
| EC-LLM-19 | primary | `01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md#limits` | PH11-R04 | 429 honors Retry-After within bounded retry budget. | `internal/llm/providers/provider_test.go::TestRateLimitRetryAfter (EC-LLM-19)` |

## Non-normative work packages

| ID | Capability | Size | Modules | Artifacts | Requirements | Depends on |
|---|---|---|---|---|---|---|
| PH11-W01 | Define provider interface, profiles, capabilities, and factory. | M | `internal/llm/providers/` | provider wire fixtures | PH11-R01 | PH00 envelope/DI contracts |
| PH11-W02 | Define and validate the complete provider record and resolve credentials without persistence/logging. | M | `internal/llm/providers/`; `internal/apperr/` | field-schema and redaction fixtures | PH11-R02 | PH11-W01; PH11-X03 |
| PH11-W03 | Implement user-invoked model discovery. | M | `internal/llm/providers/` | OpenAI/Ollama discovery fixtures | PH11-R03 | PH11-W01; PH11-W02; PH11-X01 resolution |
| PH11-W04 | Implement retry, timeout, and typed error classification. | M | `internal/llm/providers/`; `internal/apperr/` | Retry-After/transport fixtures | PH11-R04 | PH11-W01; PH11-W02 |
| PH11-W05 | Implement draft diagnostics and shared-gate inference test. | M | `internal/llm/verify/`; `internal/gate/`; `internal/llm/providers/` | diagnostic fixtures | PH11-R05, PH11-R11 | PH11-W03; PH11-W04; PH11-X01; PH11-X02 |
| PH11-W06 | Persist the complete permitted provider record and AI KV groups. | M | `internal/settings/`; `internal/db/` | additive migration; sqlc queries; no-secret round-trip fixtures | PH11-R06 | PH08 settings contract; PH11-X03 |
| PH11-W07 | Implement offline tokenizer, reserve, margin, and fit result. | M | `internal/llm/tokenizer/` | estimator corpus fixtures | PH11-R07 | none |
| PH11-W08 | Bind provider/verify/settings surfaces through adapter/store. | M | `internal/application/`; `logic/adapter/`; `logic/store/assistant/` | generated Wails bindings | PH11-R08 | PH11-W05; PH11-W06; PH11-W07 |
| PH11-W09 | Build complete AI / Providers draft/configuration UI. | M | `ui/widgets/settings/`; `logic/store/assistant/`; `ui/primitives/` | all-field, diagnostic, redaction, and responsive fixtures | PH11-R09, PH11-R11 | PH11-W08; PH11-X02; PH11-X03 |
| PH11-W10 | Build AI Context settings UI and typed limit validation. | M | `ui/widgets/settings/`; `logic/store/assistant/`; `ui/primitives/` | numeric/strategy/iteration/timeout fixtures | PH11-R10 | PH11-W06; PH11-W07; PH11-W08; PH11-X04 |
| PH11-W11 | Add the Content & privacy LLM disclosure. | S | `ui/widgets/settings/`; `i18n/` | disclosure accessibility/localization fixtures | PH11-R12 | PH10 i18n/settings baseline; PH11-W08 |

## Phase exit evidence

| ID | Requirements | Tier | Proof / artifact | Platform / scope | Owner | Freshness | Blocking |
|---|---|---|---|---|---|---|---|
| PH11-E01 | PH11-R01, PH11-R02, PH11-R03, PH11-R04 | automated | full provider-record/profile/wire/discovery/retry/header/secret-redaction suites | six provider kinds; fake servers | tester | current HEAD | yes |
| PH11-E02 | PH11-R05, PH11-R08 | automated | diagnostic gate/envelope/adapter/binding contract suites and `just gen-check` | draft config; busy/failure paths | tester | current HEAD | yes |
| PH11-E03 | PH11-R06 | automated | complete provider-record/migration/KV round-trip, no-secret persistence, race, and `just sqlc-check` | multi-instance | tester | current HEAD | yes |
| PH11-E04 | PH11-R07, PH11-R10 | automated | deterministic tokenizer/fit/default/range/fallback plus iteration and wall-clock timeout persistence/snapshot suites | offline corpus and limit boundaries | tester | current HEAD | yes |
| PH11-E05 | PH11-R09, PH11-R10, PH11-R12 | automated | AI settings and Content & privacy disclosure interaction/focus/i18n/responsive suites plus `just verify-ui` | 375/768/1280 | tester | current HEAD | yes |
| PH11-E06 | PH11-R05, PH11-R09, PH11-R10, PH11-R11 | real-runtime | `docs/phase-evidence/PH11-provider-verification.md` | native Wails with local provider, timeout boundary, and network trace | tester | current release candidate | yes |
| PH11-E07 | PH11-R09, PH11-R10, PH11-R12 | human | `docs/phase-evidence/PH11-settings-approval.md` | frozen mockup; privacy wording; keyboard/accessibility | product owner | current release candidate | yes |

## Open specification conflicts

| ID | Conflicting or missing sources | Required decision | Blocked requirements |
|---|---|---|---|
| PH11-X01 | `01_Product/17_PROVIDERS_MODELS_SETTINGS.md#model-discovery` and `#verification` require user-invoked Test connection and Test models network calls, while `08_Decisions/0011-network-policy-llm-exception.md#decision-outcome` states the only permitted outbound calls are user-invoked LLM inferences. | Decide whether provider diagnostics/model discovery are permitted outbound classes and update the network policy/evidence wording, or redefine them so no non-inference outbound call occurs. | PH11-R03, PH11-R05, PH11-R11 |
| PH11-X02 | `01_Product/17_PROVIDERS_MODELS_SETTINGS.md#provider-config` says drafts are verified before saving and never persists an unusable config, while `#model-discovery` permits manual model id entry and saving an unverifiable model after acknowledgment; no source defines which of the three tests must pass, evidence freshness after edits, or the acknowledgment path. | Define the exact save eligibility state machine, mandatory checks, invalidation rules, and any explicit override/acknowledgment behavior. | PH11-R05, PH11-R09 |
| PH11-X03 | `01_Product/17_PROVIDERS_MODELS_SETTINGS.md#provider-config` and `02_Architecture/08_LLM_INTEGRATION.md#persistence` permit persisted custom headers, while DD-45 forbids persisting secret values and accepted sources do not define literal-vs-env-reference header values, which header names are sensitive, or redaction in drafts, diagnostics, logs, events, and errors. | Define the custom-header value schema, secret-reference mechanism, validation, persistence boundary, and one reusable case-insensitive redaction policy. | PH11-R02, PH11-R06, PH11-R09 |
| PH11-X04 | `01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md#limits` and `02_Architecture/08_LLM_INTEGRATION.md#agent-loop` require a configurable per-run wall-clock ceiling, but no accepted source defines its default, unit, permitted range, disabled-state policy, or relation to per-request deadlines/retries. | Define the typed wall-clock-timeout setting contract and its interaction with request timeout/retry budgeting. | PH11-R04, PH11-R10 |

## Clarification revision

2026-07-21 — Replaced provider-centric L stories with bounded profile, security, discovery, retry, persistence, tokenizer, binding, and settings capabilities. Enumerated the complete provider record, wall-clock setting, and Content & privacy disclosure; added exact draft/save/request lifetimes, reverse PH10 re-entry ownership, and local-runtime network proof; recorded diagnostic-network, save eligibility, custom-header secret, and timeout-contract gaps without choosing policy.
