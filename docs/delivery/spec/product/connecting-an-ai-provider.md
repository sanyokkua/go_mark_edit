# Connecting an AI provider

## What it's for

The assistant needs a model to talk to, and the honest position is that most people running this will
point it at something on their own machine — Ollama or LM Studio, on localhost — because that is what
keeps a document private. Everything here is built so that the default install sends nothing anywhere,
and so that the person who *does* want a remote model has to make that choice explicitly and knows they
have made it.

The second thing this exists for is telling you, before your first Proofread rather than during it,
whether the model you picked can actually do the job.

## What you can do

Settings → AI · Providers. Choose a kind — Ollama, LM Studio, llama.cpp, OpenAI, Azure OpenAI, or a
generic OpenAI-compatible endpoint — and fill in the base URL, which is prefilled with that kind's
default. Pick an authentication scheme if the endpoint needs one, and name the environment variable
that holds your key. The key itself is never stored.

Four buttons test the configuration before you save it: **Test connection**, **Test models**,
**Test inference** and **Test tools**. Then pick a model from the list the provider reported, and set
temperature, maximum output tokens and context length.

The model list has a filter box above it, because a provider like OpenRouter reports several hundred
models. Type any part of a model id — `:free`, or a vendor name — and the header tells you how many of
how many you are looking at. The filter is remembered per provider.

Until a provider is saved and verified, the assistant sidebar stays hidden.

## Rules

### One client, six kinds, and a kind is a row of configuration {#one-client-many-kinds}
- There is one HTTP client. A provider kind is a profile — base URL, authentication scheme, completion
  path, models path, discovery strategy — registered in a factory.
- Adding a kind means adding a profile row, never writing a second client.

| Kind | Default base URL | Authentication | Models path |
|---|---|---|---|
| `ollama` | `http://127.0.0.1:11434` (local) | none | `/api/tags` |
| `lmstudio` | a local OpenAI-compatible endpoint | none | `/v1/models` |
| `llamacpp` | a local `server` endpoint | none | `/v1/models` |
| `openai` | `https://api.openai.com` | bearer, from an environment variable | `/v1/models` |
| `azure` | the user's endpoint plus a deployment | API-key header, from an environment variable | profile-specific |
| `compat` | the user's endpoint | none, bearer, or API-key header | `/v1/models` |

Examples: adding a seventh kind → one profile row and one settings entry · a second `Chat`
implementation → the difference being handled belongs in the profile.

### The default provider is local {#default-provider-is-local}
- The shipped default points at a local endpoint, so a default installation keeps every byte of document
  text on the machine.
- A remote provider is opt-in and requires the user to enter their own endpoint and credential
  reference.

Examples: a fresh install → nothing leaves the machine even after the assistant is configured · a
default pointing at a hosted API → a user's private notes go to a third party because they accepted a
default.

### An API key is an environment-variable name, never a value {#keys-are-env-var-names}
- What is stored is the **name** of an environment variable. The value is read from the environment at
  request time.
- The key is never written to the settings store, never written to the providers table, never returned
  across the bridge, and never put into a log field or an error's details.
- **If** the named variable is unset when a request is made, **then** the call fails with
  `The API key isn't set` and the remediation names the variable to set.

Examples: `OPENAI_API_KEY` stored as a name → the settings database contains no secret and can be copied
or backed up freely · the key stored as a value → it is in a file, in a backup, and one screenshot away
from being public.

### Nothing is sent without a user action {#no-request-without-a-user-action}
- An outbound request happens only when the user invokes an action, sends a message, or presses one of
  the four test buttons.
- There is no connection on startup, no keep-alive, no periodic health check and no background refresh
  of the model list.

Examples: the app open all day with a provider configured and untouched → zero requests · a persistent
"connected" indicator → it would need polling, which is why the status bar reports the **last call's**
outcome instead.

### A configuration is verified as a draft, before it is saved {#verify-before-save}
- The provider tab edits a **draft**. The four test buttons run against the draft.
- **Test connection** reaches the endpoint. **Test models** lists them. **Test inference** performs one
  real completion. **Test tools** sends a one-tool schema and asserts the response contains a tool call.
- Test inference and Test tools acquire the single long-operation gate, exactly as a real run does.
- All four run against the **currently selected model**, so filtering the list to a free model and
  selecting it is how you test a provider without paying for it — see `#every-model-picker-filters`.

Examples: a wrong port → Test connection fails and nothing is saved · filter to `:free`, select
`deepseek/deepseek-r1:free`, press all four → four results and no charge · saving first and finding out
later → the user has a persisted configuration that cannot work, and no obvious way to tell which field
is wrong.

### Tool support is a property of the model, not of the provider kind {#tool-support-is-per-model}
- Whether tool calls work is recorded against the pair `(provider, model)`, not against the kind.
- **Test tools** is how a user finds out before their first action rather than during it.
- A provider response indicating tools are unsupported maps to the non-retryable code
  `tools_unsupported`.

Examples: one Ollama server on one port serving one model that supports tools and another that does not,
at the same time → capability recorded per model, correctly · capability recorded per kind → the app is
confidently wrong about half the models a local-first user has installed.

*Why this is not a detail:* a local user's model list is mostly models without tool support. With
capability keyed by kind, Ollama returns a 400 about tools, nothing recognises it, it classifies as a
generic upstream error marked retryable, and the user gets four identical failures. LM Studio and
llama.cpp are worse: they frequently accept the request, **ignore the tools array**, and return prose —
so the loop sees no tool call, treats the prose as the answer, and the user is shown a model narrating
what it would like to read.

### Without tool support the assistant degrades rather than failing {#single-shot-fallback}
- **While** the selected model does not support tools, every action whose output is a rewrite of its
  scope runs a **single-shot** path: scope in, edited text out, presented as the same reviewable
  proposal.
- Actions that genuinely need to read other files are **disabled, with the reason on the row**.

Examples: Proofread on a 3B model with no tool support → it works, through the single-shot path · a
workspace-wide action on the same model → disabled, and the row says why · requiring tool support →
"install a different model" is not an acceptable answer from a local-first application.

### Configuration is per provider, and the model comes from discovery {#provider-config-fields}
- A provider carries: base URL, authentication scheme (None, Bearer, API-Key), optional extra request
  headers, the selected model, and the inference parameters below.
- The model is chosen from what discovery reported, not typed by hand.

Examples: an Azure gateway needing an API-version header → the headers field · typing a model name →
a typo produces a 404 that reads like an outage.

### Every model picker filters {#every-model-picker-filters}
- **Every surface that lists models carries a filter box above the list.** There are two: the Settings
  model picker in AI · Providers, and the model chip in the assistant's sidebar header.
- **When** text is typed, the list narrows to models whose **id contains that text, case-insensitively,
  matching anywhere in the id** — not a prefix match. `:free` finds `deepseek/deepseek-r1:free`, and
  `qwen` finds `qwen/qwen3-8b:free`.
- The list header reads **`N of M shown`**, so it is never unclear that a list is filtered.
- A clear control empties the filter and restores the full list.
- **The filter persists per provider.** Reopening Settings, or reopening the app, shows the same filter
  still applied to that provider. Each provider keeps its own.
- **If** the filter matches nothing, **then** the list reads `No model matches "<query>"` with the clear
  action — not an empty box.
- The filter narrows what is **displayed**. It never changes which model is **selected**, and clearing it
  never deselects.

*Why it persists:* the reason to filter is to work inside a subset — testing on free models, or staying
within one vendor's family. Re-typing it on every visit makes the filter a chore rather than a mode.

Examples: a provider serving 327 models, filter `:free` → 12 shown, header reads `12 of 327 shown` ·
the filter cleared → `327 of 327 shown` · filter `zzz` → `No model matches "zzz"` and a clear action ·
a model selected, then a filter typed that the selected model does not match → it is **still selected and
still shown**, because a filter that silently deselects loses the configuration · reopen Settings a day
later → the filter is still `:free`.

### Inference parameters are unset until they are set {#unset-is-not-zero}
- Temperature, maximum output tokens and context length are **optional**. An unset parameter is omitted
  from the request entirely and the endpoint applies its own default.
- `replyReserve ≤ maxOutputTokens < contextWindow`.

Examples: temperature left alone → the field is absent from the request body · sending `0` for
"not configured" → the model is asked for a temperature of zero, which is a real and different setting.

### Distinct failures get distinct codes and distinct messages {#errors-are-classified}
- A transport failure, a rejected credential, a missing models path, a context-length rejection, a
  truncated reply and an unsupported model are six different things a user can do six different things
  about, and each maps to its own error code and message.
- `finish_reason == "length"` maps to `output_truncated`, meaning "raise Max output tokens". It never
  surfaces as a tool failure or as an empty completion.
- **`empty_completion` is not retryable.** On a reasoning model with a low output cap, the cap is
  consumed by hidden reasoning tokens before any visible output begins. Retrying spends three identical
  inferences to produce the same nothing.
- **When** a provider supplies a retry delay, it is shown: `Rate limited — try again in about 20
  seconds.`

Examples: a wrong base URL → `Couldn't reach the AI provider` naming the setting · a rejected key →
`The API key isn't set` naming the variable · one generic "the provider failed" for all six → the user
cannot tell "my key was rejected" from "I typed the model name wrong", which is the state a reviewed
reference implementation shipped in.

### Only retryable failures are retried, and attempts are counted once {#retry-policy}
- Attempts are **`1 + maxRetries`**, stated in exactly one place. Three retries means four attempts.
- Only classified-retryable errors are retried, with backoff, honouring a provider-supplied retry delay.
- Retries, timeouts and iterations are **not** three independent limits — see
  `chatting-about-a-document.md#one-wall-clock-budget`.

Examples: a transport timeout → retried · a rejected credential → not retried, because the second
attempt will be rejected identically · "a bounded attempt count" with no number → it has cost a real
project a release cycle of dead code.

### The sidebar stays hidden until a provider is configured {#hidden-until-configured}
- **While** no provider is saved and verified, the assistant sidebar is collapsed.
- **When** the title-bar toggle is used in that state, a short affordance reads "Configure a provider to
  use the assistant" and links to Settings → AI · Providers.
- Once a provider is saved, the sidebar becomes available and remembers its last shown or hidden state.

Examples: a fresh install → no assistant, no empty panel, no confusion about why nothing works.

### Changing the configuration does not affect a run in flight {#config-change-affects-next-run}
- **When** the provider or model is changed while a run is in flight, the in-flight run is unaffected.
  The change applies to the **next** run.

Examples: switching model mid-run → the current run finishes on the old model, the next uses the new one
· mutating the in-flight run → the transcript records one model and the request used another.

## What it looks like

- Settings → AI · Providers — `../surface/mockup.html#material-light/settings-ai-providers`
- The provider chip in the assistant header — `../surface/mockup.html#material-light/assistant-chat`
- The reserved but empty assistant region, before a provider exists —
  `../surface/mockup.html#material-light/assistant-reserved`
- Content and privacy, where the network statement lives —
  `../surface/mockup.html#material-light/settings-privacy`

## When things go wrong

| Situation | What the user sees | What they can do |
|---|---|---|
| The endpoint cannot be reached | `Couldn't reach the AI provider` · `Check the base URL in Settings → AI → Providers, and that the provider is running.` | Start the provider, or fix the URL |
| The named environment variable is unset | `The API key isn't set` · `Set the environment variable named in Settings → AI → Providers, then restart GoMarkEdit.` | Set it and restart |
| The model does not support tools | `This model can't use tools` · `GoMarkEdit will use a simpler single-step mode. Choose a different model for workspace-wide actions.` | Keep going, or pick another model |
| The reply was cut off | `The model ran out of room to answer` · `Raise Max output tokens in Settings → AI → Context, then try again.` | Raise the setting |
| Another inference is already running | `Something else is running` · `Wait for the current operation to finish, or cancel it.` | Wait, or cancel |
| The provider rate-limited the request | `Rate limited — try again in about 20 seconds.` | Wait that long |

## Edge cases

**Test inference is pressed while a run is in flight**
- *Trigger:* an action is running and the user opens settings and presses Test inference.
- *Expected:* it is refused immediately with the busy message. It shares the gate exactly as a run does.
- *Avoid:* running two inferences at once, which is the thing the gate exists to prevent.

**A provider reports zero models**
- *Trigger:* Test models against a running Ollama with nothing pulled.
- *Expected:* the list shows its empty state saying no models were reported, and the model field cannot
  be set.
- *Avoid:* an empty dropdown that looks like a loading state.

**The environment variable is set after the app started**
- *Trigger:* the user sets the variable in a shell and returns to the running app.
- *Expected:* it is not picked up. The message says to restart, because a process's environment is fixed
  at launch.
- *Avoid:* implying it will be noticed.

**Context length is set higher than the model actually supports**
- *Trigger:* 200,000 set against a model whose real ceiling is 131,072.
- *Expected:* requests may still succeed, because the provider silently reloads the model at its own
  ceiling. The app cannot detect this, which is why the fit meter is the real protection — see
  `how-much-fits-in-context.md#the-meter-is-the-real-protection`.
- *Avoid:* treating a successful response as confirmation that the configured window was honoured.

**The provider is changed while the assistant sidebar is open and busy**
- *Trigger:* provider swapped mid-run.
- *Expected:* the run completes against the original provider; the header chip updates for the next run.
- *Avoid:* a transcript that attributes a reply to a model that did not produce it.

## Not this

- **No bundled model and no model download.** The app never fetches a model. The provider is the user's.
- **No key stored anywhere.** A stored key is in a file, in a backup, and one screenshot away from being
  public. What is stored is the name of the environment variable to read.
- **No background connection or health check.** See `#no-request-without-a-user-action`.
- **No multi-provider fallback chain.** One configured provider. Automatic failover to a second means
  document text going somewhere the user did not choose for this request.
- **No third-party multi-provider SDK.** It is a heavy, fast-churning dependency against a CGO-free,
  offline-first backend, and the six kinds differ by a base URL and a header.
- **No telemetry on assistant usage.** There is none anywhere in the app.

## Decisions

- *2026-07-25* — Tool support is per model, probed by a fourth test button and remembered; when tools are
  unavailable the assistant runs a single-shot path rather than failing. Recorded in
  `../../adr/0034-assistant-execution-contract.md`.
- *2026-07-25* — `finish_reason == "length"` maps to its own actionable code, and `empty_completion` is
  not retryable.
- *2026-07-10* — One OpenAI-compatible client parameterised by a per-kind profile, rather than a client
  per provider or a third-party SDK. Recorded in `../../adr/0007-llm-provider-abstraction.md`.
- *2026-07-28* — **Every model picker filters, and the filter persists per provider.** A provider like
  OpenRouter serves several hundred models, and the free ones — the ones you would use to test a
  configuration or to try the assistant at no cost — are scattered through a flat list by a `:free`
  suffix with no way to isolate them. Matching anywhere in the id rather than as a prefix is what makes
  `:free` work at all. The filter never changes the selection, because a filter that silently deselects
  loses the configuration.

## Open questions

*(none — ready to build)*
