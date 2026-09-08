# ADR-0007 — LLM provider abstraction: one OpenAI-compatible client parameterized by per-kind profiles

**Status:** accepted
**Date:** 2026-07-10
**Deciders:** project owner, architect

> **Historical vocabulary — this record is not rewritten.** The `DD-…` and `EC-…` identifiers below cite the retired 78-entry design-decision registry, last present in git at `e1bd33f` under `specification/00_Foundation/` as `04_DESIGN_DECISIONS.md`; every one of those decisions now lives in the sentence of the feature file that needs it. Links into `_archive-2026-07-28-specification/` are the pre-conversion specification, kept so a citation still resolves, and **not normative**. See `README.md`. A decision record says what was decided against what was known then, so neither is translated forward.
> A link beginning `07_Phases/` names a retired phase document that was deleted rather than archived; that set is in git at `e1bd33f`.

## Context and problem statement

The assistant must talk to a range of LLM back-ends the user might already run: local servers
(Ollama, LM Studio, llama.cpp) and hosted OpenAI-compatible APIs (OpenAI, Azure OpenAI), plus any other
endpoint that speaks the same wire shape ("generic OpenAI-compatible"). All of these expose a broadly
**OpenAI-compatible** chat-completions surface — the same request/response JSON, tool-call structure, and
streaming format — differing mainly in base URL, authentication scheme, the exact model-listing endpoint,
and small capability quirks (DD-45, DD-46).

We must decide how GoMarkEdit models this variety without letting each provider metastasize into its own
bespoke HTTP client. The decision also has to lock down **secret handling**: remote providers require an
API key, and GoMarkEdit's privacy posture forbids ever persisting or logging that secret (DD-45, DD-54).
Finally, the app must be able to **discover** the models an endpoint advertises and **verify** a draft
configuration (connection / models / a trial inference) before the user commits it (DD-46). This ADR
records the provider-layer design that `internal/llm/providers` and `internal/llm/verify` implement, and
locks DD-45, DD-46, and DD-52.

## Decision drivers

- **Many kinds, one wire shape.** Ollama/LM Studio/llama.cpp/OpenAI/Azure/generic all speak
  OpenAI-compatible chat completions; the differences are configuration, not protocol (DD-45).
- **CGO-free, dependency-light backend.** The Go backend is deliberately minimal; pulling in a large
  third-party LLM SDK (often cloud-vendor-specific, frequently churning) works against that and against
  the offline/local-first posture.
- **Secrets must never touch disk or logs.** An API key may only be *referenced* by the name of an
  environment variable; the value is resolved at call time and attached to a header, never stored (DD-45,
  DD-54, security/privacy spec).
- **Discovery + pre-save verification.** The AI/Providers settings tab needs to list an endpoint's models
  and run Test connection / Test models / Test inference against a draft config before it is persisted
  (DD-46).
- **Extensibility without new client code.** Supporting a new OpenAI-compatible endpoint should be adding
  a profile row, not writing and testing a whole new client.
- **App-owned retry/timeout and typed error mapping.** Transport/status outcomes must map to a fixed
  `ErrorCode` set surfaced through the standard Result-envelope path, not be swallowed by an SDK.

## Considered options

- **Single OpenAI-compatible client + per-kind profiles + factory** — one `OpenAICompatibleProvider`
  holding an `*http.Client` and a `ProviderProfile`; a `ProviderFactory` maps a kind to `(builder,
  profile)`. Base URL, auth scheme, path templates, and discovery strategy live in the profile.
- **Per-provider bespoke clients** — a distinct client type per kind (an Ollama client, an OpenAI client,
  an Azure client, …), each with its own request/response code.
- **A third-party LLM SDK** — adopt an existing multi-provider Go LLM library and let it own transport,
  provider quirks, streaming, and retries.

## Decision outcome

Chosen: **a single OpenAI-compatible client parameterized by per-kind provider profiles, selected by a
factory.** The concrete `OpenAICompatibleProvider` implements the `Provider` interface (`Chat`,
`ListModels`, `Capabilities`, `Kind`) and holds only an `*http.Client` and a `ProviderProfile`. The
profile carries everything that varies per kind: `Kind`, `DefaultAuthScheme` (none / bearer / api-key
header), `DefaultBaseURL`, `CompletionPathTemplate`, `ModelsPathTemplate`, `DiscoveryStrategy`, and
`Capabilities`. `NewFactory().Build(ResolvedConfig)` picks the profile for a kind and returns a ready
provider, so a new OpenAI-compatible endpoint is a **new profile row, not a new client class**.

Secrets are handled by reference only: `ProviderConfig` persists an `EnvVarName`, and `ResolvedConfig`
carries the `Secret` resolved from `os.Getenv(EnvVarName)` at request-construction time. The value is
attached to the outgoing `Authorization` / API-key header and **never** written to the DB, transcript, or
any log. If the env-var name is set but unresolved, the service returns `missing_credential` rather than
sending an unauthenticated request.

`ListModels` calls the profile's `ModelsPathTemplate` and parses it per `DiscoveryStrategy` (an OpenAI
`/v1/models` list vs. an Ollama-style `/api/tags`), feeding the model picker and the settings tab.
`internal/llm/verify` runs Test connection / Test models / Test inference against a **draft** config
(gate-guarded so Test inference obeys the single in-flight rule) before it is saved. Retries, timeouts,
and the transport/status → `ErrorCode` mapping are owned by the **service**, not the HTTP client (DD-48),
so every failure surfaces as a typed `AppError` through the standard envelope + toast path. Per-model
inference parameters (`ModelConfig`: temperature, max output tokens, context window / num_ctx) are
configurable with sensible defaults, sent as pointer fields so "unset" is distinct from "zero" (DD-52).

### Consequences

- Positive: One well-tested request/response/stream code path serves every provider kind; adding a kind
  is a profile row plus a discovery strategy, keeping the client surface small and the test matrix bounded
  (DD-45).
- Positive: The default provider is **local**, so a default install talks only to an on-device endpoint;
  remote providers are strictly opt-in and require the user to supply their own base URL and credential
  reference (DD-45, DD-54; see ADR-0011).
- Positive: Secrets never persist — the DB and logs only ever hold an env-var *name*, which is the
  strongest available guarantee against key leakage on a shared or backed-up machine (DD-45).
- Positive: Model discovery and pre-save verification give the user a clear "does this config actually
  work?" answer before committing, reducing silent misconfiguration (DD-46).
- Negative: The abstraction is only as good as the "OpenAI-compatible" assumption; a kind that deviates
  (an odd auth flow, a non-standard streaming frame, a bespoke tool-call shape) needs profile-level special
  casing and, in the worst case, a capability flag that disables a feature for that kind.
- Negative: Owning retry/timeout/error-mapping ourselves is more code than delegating to an SDK, and the
  status→code table must be maintained as providers evolve.
- Neutral: The user must set an environment variable to use a keyed remote provider — slightly less
  convenient than pasting a key into a field, but a deliberate privacy trade (DD-45).

## Pros and cons of the options

### Option A — Single OpenAI-compatible client + per-kind profiles + factory (chosen)

- Good: Maximal code reuse; a new kind is data (a profile), not code; one place to get streaming,
  tool-calls, retry, and error mapping right; CGO-free and dependency-light; discovery/verification layer
  fits naturally on top; secret-by-env-var-name is enforced in one resolution point.
- Bad: Leaks when a provider is not truly OpenAI-compatible; the profile can accrete quirk flags over
  time; we own the retry/error-classification code that an SDK would otherwise provide.

### Option B — Per-provider bespoke clients

- Good: Each client can model its provider's exact quirks with no shared-abstraction compromises; a
  deviant endpoint is easy to accommodate in its own type.
- Bad: Massive duplication of near-identical chat/stream/retry code across kinds; the test matrix and
  maintenance cost scale with the number of providers; secret handling and error mapping must be
  re-implemented (and re-audited) per client, inviting inconsistency and leak risk. Rejected as
  needlessly heavy for endpoints that share one wire shape.

### Option C — A third-party multi-provider LLM SDK

- Good: Off-the-shelf provider coverage, streaming, and retries; least initial code to write.
- Bad: Adds a large, fast-churning dependency (often cloud-vendor-flavored) against a deliberately lean,
  CGO-free, offline-first backend; typically hides transport details we need to own for the app-level
  retry/timeout policy (DD-48) and the typed `ErrorCode` envelope; risks pulling in telemetry or
  network behavior that conflicts with GoMarkEdit's no-background-network invariant (ADR-0011). Rejected
  as misaligned with the project's dependency and privacy posture.

## Links

- Design decisions: **DD-45** (provider abstraction: one OpenAI-compatible client + per-kind profile;
  API keys referenced by env-var name, never persisted/logged), **DD-46** (model discovery + Test
  connection/models/inference on a draft config; selected provider/model persisted; default provider
  local), **DD-52** (configurable inference parameters: temperature, max output tokens, context length).
  Related: DD-48 (app-owned retries/timeouts + error classification), DD-54 (privacy).
- Spec clauses: `../../_archive-2026-07-28-specification/00_Foundation/04_DESIGN_DECISIONS.md#11-llm-assistant`,
  `../../_archive-2026-07-28-specification/02_Architecture/08_LLM_INTEGRATION.md#provider-abstraction`,
  `../../_archive-2026-07-28-specification/02_Architecture/08_LLM_INTEGRATION.md#persistence`,
  `../../_archive-2026-07-28-specification/03_NonFunctional/03_SECURITY_AND_PRIVACY.md`, `../../_archive-2026-07-28-specification/02_Architecture/06_ERROR_HANDLING.md`.
- Stories: Phase 11 (LLM foundation) provider-abstraction, model-discovery, verification, and
  AI/Providers-settings stories per `07_Phases/00_ROADMAP.md`
  conventions (authored per phase; none `done` at ADR time).
