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
7. [The variable has to be in the app's environment, not your shell's](#the-variable-has-to-be-in-the-apps-environment-not-your-shells)
8. [Ranges and defaults](#ranges-and-defaults)
9. [Base URL, and the `/v1` trap](#base-url-and-the-v1-trap)
10. [Custom headers, and redaction](#custom-headers-and-redaction)
11. [Deleting a provider](#deleting-a-provider)
12. [Persistence](#persistence)
13. [Defaults local](#defaults-local)

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

Before saving, the user can run four **draft-config** checks (DD-46) — the mockup's Test buttons, each
with a result badge:

- **Test connection** — reaches the base URL and confirms the endpoint responds (badge `✓`).
- **Test models** — lists models and reports the count (badge `✓ 14 found`).
- **Test inference** — runs one **minimal** inference on the draft config and reports latency (badge
  `✓ 420 ms`). Because it performs real inference, it **acquires the single-flight gate** (DD-46, DD-47),
  so it cannot run concurrently with an assistant run and vice-versa.
- **Test tools** — sends a one-tool schema and asserts the reply contains a tool call (badge `✓ tools`
  or `✗ not supported`). Shares the gate exactly as Test inference does.

**Test tools exists because tool support is a property of the model, not the provider** (ADR-0034).
Without it, a user finds out during their first Proofread instead of while configuring, and the failure
they see is a generic provider error four times over. Its result is recorded against
`(providerId, modelId)`, and a model without tool support runs the assistant's single-shot path rather
than failing.

**Test inference and Test tools apply the saved inference params** — temperature, max output tokens,
context length — rather than library defaults. A diagnostic that exercises a code path production never
takes is a diagnostic that passes while production fails.

**Test connection is deliberately generous:** *any* response from the server means reachable, including
a 404 and a 429. Only `auth` / `missing_credential` and `unreachable` / `timeout` are failures. A
connection test that fails on a 404 is really testing the path, and the path is what Test models is for.

**Test models reports zero models as a failure**, not a success with an empty list, and returns the list
it found so the picker can be populated without a second round trip.

**Cold start is not a fault.** A local provider may have no model loaded; the first inference pays the
full model-load time, which can be tens of seconds where a warm call is under a second. Test inference
labels a first call as such rather than reporting a latency that makes a working provider look broken.
Neither GoMarkEdit nor the reference implementation sets Ollama's `keep_alive`, so a model unloads after
its idle window and the next run pays the load again — one optional wire field, worth knowing about.

Verification is **diagnostic**: it validates a draft and is never recorded to the run transcript. All
three run against the **draft** (unsaved) config so problems are caught before persistence. Failures are
classified (unreachable / timeout / auth / rate-limited / …) and surfaced through the Result-envelope +
toast path (DD-48).

## Inference params

Per selected model, configurable with sensible defaults (DD-52; mockup **Model** group):

- **Temperature** — sampling temperature (mockup default `0.3`). Also shown as a chip in the composer
  row (`🌡 temp 0.3`).
- **Max output tokens** — the `max_tokens` **wire field**, capping generation (mockup default `2048`).
  It is *related to* the reply reserve the tokenizer accounts for, but it is **not the same number**
  (`18_TOKENIZER_AND_CONTEXT.md#reply-reserve`): the reserve is a budgeting figure the fit meter
  subtracts, and equating them means a user who raises one to be safe silently raises the other.
  **`maxOutputTokens` must be less than `contextWindow`** — deriving one from the other silently
  reserves most of the model's real context for "completion" and truncates the prompt before generation,
  which is a regression a reviewed implementation guards with a dedicated test.
- **Context length (num_ctx)** — the model's context window the app targets (mockup default `8192`).
  This value drives the token-fit meter and the context budget
  (`18_TOKENIZER_AND_CONTEXT.md#fit-meter`, `#context-budget`).

Defaults are conservative and per-model where the profile knows them; the user can override each.

## The variable has to be in the app's environment, not your shell's

A GUI application launched from Finder, the Dock or Spotlight **does not inherit `~/.zshrc`,
`~/.bash_profile` or anything else a login shell reads.** So `export OPENAI_API_KEY=…` in a shell profile
— which is exactly what every provider's own documentation tells you to do — leaves the variable simply
absent from GoMarkEdit's process, and `missing_credential` fires for a user who did everything right.

The same is true on Windows for a variable set only in a terminal session, and on Linux for anything set
outside the session's environment.

The settings field therefore explains **where** to set it, per platform, next to the field itself:

| Platform | Where it must be set |
|---|---|
| macOS | `launchctl setenv OPENAI_API_KEY …` for the current login session, or a `launchd` user agent to make it persist. Setting it in `~/.zshrc` works **only** if you launch GoMarkEdit from a terminal. |
| Windows | A user environment variable (System → Environment Variables), not a `set` in one console. |
| Linux | The session environment — `~/.profile` for most display managers, or a systemd user environment. A `~/.bashrc` export reaches terminals only. |

The app **reads the variable at call time, never at launch**, so setting it and then reopening the app is
enough — a full logout is not required on macOS once `launchctl setenv` has run.

`missing_credential`'s message says the variable name and points here rather than saying "not set", which
is the one thing the user already knows.

## Ranges and defaults

DD-75. **Every number lives here once.** The control, the validator and the seeded default cite this
table; none of them carries its own copy. Three disagreeing sources for one range is how an interface
ends up offering a timeout the backend rejects — in the reference implementation the UI accepted
1–3600 seconds, the validator accepted 1–600, and the seeder wrote 60.

| Setting | Range | Step | Default |
|---|---|---|---|
| Request timeout | 1 – 600 s | 5 | 60 |
| Max retries | 0 – 10 | 1 | 3 |
| Run wall-clock budget | 10 – 600 s | 10 | 120 |
| Temperature | 0 – 2 | 0.05 | 0.3 |
| Max output tokens | 1 – 32 000 | 256 | 2 048 |
| Context length (`num_ctx`) | 1 024 – 200 000 | 1 024 | 8 192 |
| Agent iterations | 1 – 16 | 1 | 8 |
| Safety margin | 5 – 40 % | 5 | 15 |
| Reply reserve | 256 – 8 192 tokens | 256 | 1 024 |

Cross-field: **`maxOutputTokens < contextWindow`**, and **`replyReserve ≤ maxOutputTokens`**.

Out-of-range values are **rejected with the range named**, never clamped.

## Base URL, and the `/v1` trap

Providers disagree about whether the base URL includes `/v1`, and naive concatenation produces
`/v1/v1/chat/completions` → a 404 → classified as `model_not_found`, which tells the user their *model*
is wrong when their *URL* is wrong. LM Studio's own server UI shows `http://localhost:1234/v1`;
OpenRouter's documentation says `https://openrouter.ai/api/v1`; Ollama's is a bare origin.

**The stored form is canonical:** a parseable `http`/`https` URL ending in a trailing slash. Paths are
stored **without** a leading slash and joined as `trimSuffix(base,"/") + "/" + trimPrefix(path,"/")`. The
settings field enforces the trailing slash and says so in its validation message.

**Each provider row carries its own path overrides** — `completionPath`, `modelsPath` and `apiVersion` —
defaulting from the kind's profile. This is the escape hatch: a user who pastes
`http://localhost:1234/v1/` sets the completion path to `chat/completions` and it works. Azure needs it
regardless, for its `{deployment}` placeholder and `?api-version=` query.

**Where an override does nothing, the control must not pretend otherwise.** Ollama routes through its
native `/api/chat` endpoint (`02_Architecture/08_LLM_INTEGRATION.md`), so the completion-path override
has no effect for that kind; the field is disabled with the reason shown. A control that looks live and
is not is a defect found by live testing in the reference application.

## Custom headers, and redaction

`ProviderConfig.headers` is a free-form map, so nothing stops a user pasting
`Authorization: sk-…` into it. Secrets are supposed to be env-var names only (DD-45), and this is the
hole in that guarantee.

**One case-insensitive redaction rule covers every path a header value can escape by**: logs, error
messages, events, the run transcript, diagnostics, and any future settings export. Header names matching
`authorization`, `api-key`, `x-api-key`, `token`, `secret` or `cookie` have their values replaced with
`••••` everywhere except the moment of sending. The rule is stated once and applied everywhere, rather
than each surface remembering.

## Deleting a provider

Deleting the **currently selected** provider reassigns the selection to another configured provider.
Deleting the **last** one returns the assistant sidebar to its **Unconfigured** state
(`14_LLM_ASSISTANT_OVERVIEW.md#assistant-sidebar`) — not to a Ready state with nothing behind it, and
not to a blank panel that needs a reload to recover. The reference implementation shipped the blank
panel and had to add a regression test for it.

## Persistence

Assistant configuration is persisted locally (DD-46; F4 additive growth of the settings registry):

- The **selected provider** (its id) and the **selected model** are persisted so the assistant reopens
  with the last choice.
- **Providers are stored** in a `providers` table introduced as an **additive migration** (no rewrite of
  the pre-assistant schema); scalar AI preferences (params, estimator, margins, strategies, max iterations)
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
