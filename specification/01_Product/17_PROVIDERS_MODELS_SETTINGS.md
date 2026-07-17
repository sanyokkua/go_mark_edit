**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester
**Last Updated:** 2026-07-10
**Cross-references:** `00_Foundation/04_DESIGN_DECISIONS.md` (DD-32, DD-45, DD-46, DD-47, DD-48, DD-52, DD-53, DD-54), `01_Product/14_LLM_ASSISTANT_OVERVIEW.md`, `01_Product/18_TOKENIZER_AND_CONTEXT.md`, `01_Product/11_SETTINGS.md`, `mockups/gomarkedit-mockup.html`

# Providers, Models & Settings

The assistant reaches an LLM through a **single OpenAI-compatible client** parameterized by a per-kind
**provider profile** (DD-45). This document specifies the supported provider kinds, provider
configuration, the credential model, model discovery, draft-config verification, inference parameters,
persistence, and the local-first default — mirroring the **AI / Providers** settings tab in
`mockups/gomarkedit-mockup.html`.

## Table of Contents

1. [Provider kinds](#provider-kinds)
2. [Provider config](#provider-config)
3. [Auth env var](#auth-env-var)
4. [Model discovery](#model-discovery)
5. [Verification](#verification)
6. [Inference params](#inference-params)
7. [Persistence](#persistence)
8. [Defaults local](#defaults-local)

## Provider kinds

One abstraction, six kinds, each a **provider profile** over the same OpenAI-compatible client (DD-45).
The **Active provider** selector in the mockup lists exactly these:

- **Ollama (local)** — local server, default base URL `http://127.0.0.1:11434`.
- **LM Studio (local)** — local server, OpenAI-compatible endpoint.
- **llama.cpp (local)** — local `server` OpenAI-compatible endpoint.
- **OpenAI** — hosted; requires a credential (see [Auth env var](#auth-env-var)).
- **Azure OpenAI** — hosted; endpoint + deployment semantics via profile.
- **OpenAI-compatible…** — any other endpoint that speaks the OpenAI Chat Completions API (generic).

The profile encodes the per-kind differences (default base URL, path shape, how models are listed, auth
expectation). The three "(local)" kinds keep everything on-device and are the recommended default
(DD-32, DD-54; [Defaults local](#defaults-local)).

## Provider config

A provider configuration (mockup **Provider** group) has:

- **Base URL** — the endpoint root (e.g. `http://127.0.0.1:11434`); prefilled from the profile and
  editable.
- **Auth scheme** — **None** / **Bearer** / **Api-Key** (see [Auth env var](#auth-env-var)).
- **Headers** — optional extra request headers the profile or user supplies (e.g. an Azure API-version
  header), for compatibility with a specific gateway.
- **Selected model** — chosen from discovery ([Model discovery](#model-discovery)).
- **Inference params** — temperature, max output tokens, context length ([Inference params](#inference-params)).

Configuration is edited as a **draft** and **verified before saving** ([Verification](#verification)):
the three Test buttons run against the draft, so a user never persists a config that cannot connect.

- **EC-LLM-16 — Config changed mid-run.** Editing the provider/model while a run is in flight does not
  mutate the in-flight run; the change applies to the **next** run. Because inference is single-flight
  (DD-47), there is no ambiguity about which config a given run used — the run transcript records the
  provider/model snapshot it ran with.

## Auth env var

Credentials are handled by **reference, never by value** (DD-45). When the auth scheme is **Bearer** or
**Api-Key**, the user enters an **environment-variable NAME** (mockup placeholder `ENV_VAR_NAME`), not
the secret itself. At request time the app reads that variable from the process environment and applies
it per the scheme (`Authorization: Bearer <value>` or the profile's API-key header).

- The **secret value is never persisted** — not in the KV store, not in the `providers` table, not in
  exported settings — and **never logged** (DD-45, DD-33). Only the variable *name* is stored.
- **None** is the correct scheme for local providers that need no auth (Ollama/LM Studio/llama.cpp
  default).
- **EC-LLM-8 — Missing credential.** If the referenced environment variable is unset (or empty) when a
  run or a Test needs it, the app reports an **auth-configuration error** ("environment variable
  `NAME` is not set") through the standard error path — it does not send an unauthenticated request and
  does not fabricate a key (DD-48). The variable name is safe to show; the value never exists to show.
- **EC-LLM-18 — Provider auth rejected (401/403).** When the referenced credential **is** present but the
  provider rejects it with `401`/`403`, the app classifies a **non-retryable auth error** and surfaces it
  through the standard Result-envelope + toast path; the environment-variable **name** may appear in the
  message, the secret value never does (DD-45, DD-48). Distinct from EC-LLM-8, where the variable is unset
  and the request is refused before any HTTP call.

## Model discovery

The app can **list models from the provider** (DD-46). The **Model** selector (mockup **Model** group)
is populated by querying the provider's models endpoint for the current draft config; the mockup shows
discovered models `qwen2.5:7b`, `llama3.1:8b`, `gemma3:4b`, `mistral-nemo` and a "Discovered from the
provider" hint. Discovery is a **user-initiated** network call to the configured provider only (DD-32,
DD-54) — it happens when the user opens/refreshes the provider settings or runs **Test models**, never
in the background.

- **EC-LLM-9 — No models discovered.** If discovery returns an empty list or fails (endpoint down, wrong
  base URL), the model selector shows an empty/"none found" state with the classified error; the user
  can still type a known model id manually where the profile allows, but cannot save a config whose
  model is unverifiable without acknowledging it.

## Verification

Before saving, the user can run three **draft-config** checks (DD-46) — the mockup's Test buttons, each
with a result badge:

- **Test connection** — reaches the base URL and confirms the endpoint responds (badge `✓`).
- **Test models** — lists models and reports the count (badge `✓ 14 found`).
- **Test inference** — runs one **minimal** inference on the draft config and reports latency (badge
  `✓ 420 ms`). Because it performs real inference, it **acquires the single-flight gate** (DD-46, DD-47),
  so it cannot run concurrently with an assistant run and vice-versa.

Verification is **diagnostic**: it validates a draft and is never recorded to the run transcript. All
three run against the **draft** (unsaved) config so problems are caught before persistence. Failures are
classified (unreachable / timeout / auth / rate-limited / …) and surfaced through the Result-envelope +
toast path (DD-48).

## Inference params

Per selected model, configurable with sensible defaults (DD-52; mockup **Model** group):

- **Temperature** — sampling temperature (mockup default `0.3`). Also shown as a chip in the composer
  row (`🌡 temp 0.3`).
- **Max output tokens** — cap on the response length (mockup default `2048`). This is the **reply
  reserve** the tokenizer accounts for (`18_TOKENIZER_AND_CONTEXT.md#reply-reserve`).
- **Context length (num_ctx)** — the model's context window the app targets (mockup default `8192`).
  This value drives the token-fit meter and the context budget
  (`18_TOKENIZER_AND_CONTEXT.md#fit-meter`, `#context-budget`).

Defaults are conservative and per-model where the profile knows them; the user can override each.

## Persistence

Assistant configuration is persisted locally (DD-46; F4 additive growth of the settings registry):

- The **selected provider** (its id) and the **selected model** are persisted so the assistant reopens
  with the last choice.
- **Providers are stored** in a `providers` table introduced as an **additive migration** (no rewrite of
  the Stage-1/2 schema); scalar AI preferences (params, estimator, margins, strategies, max iterations)
  live as KV keys alongside existing settings groups.
- **No secret is ever stored** — only the environment-variable *name* per provider (DD-45).
- Historical run transcripts, if retained, store a **snapshot** of the provider/model name at run time
  (DD-55); renaming or reconfiguring a provider later never rewrites that history.

Assistant settings live in **two dedicated Settings tabs** (DD-53): **AI / Providers** (this document —
provider, base URL, auth, model, params, the three Test buttons) and **AI Context**
(`18_TOKENIZER_AND_CONTEXT.md` — estimator, margins, over-context and history strategies, max
iterations). The **Content & privacy** tab additionally states the on-demand/local-only LLM posture
(`14_LLM_ASSISTANT_OVERVIEW.md#privacy-and-network`).

## Defaults local

**The default provider is local** (DD-32, DD-46, DD-54). On first configuration the app defaults to a
local kind (e.g. Ollama at `http://127.0.0.1:11434`) with auth **None**, so a default install keeps all
document text on-device and makes **zero** calls to any third party. The **AI / Providers** tab states
this plainly ("Local providers keep everything on-device"), and the status bar reflects a connected
local provider (`● Ollama connected`).

Remote kinds (OpenAI, Azure, generic compatible) are strictly **opt-in**: the user must select the
kind, enter the endpoint, and reference their own credential env-var name. Until a provider is
configured and verified, the assistant sidebar stays hidden by default
(`14_LLM_ASSISTANT_OVERVIEW.md#assistant-sidebar`).
