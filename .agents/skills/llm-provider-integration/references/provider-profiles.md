# Provider Profiles

One `OpenAICompatibleProvider` client, parameterized by a per-kind `ProviderProfile`; a new kind is a
profile row registered in `NewFactory()`, never a new client class.

## One client, many kinds (DD-45, ADR-0007)

All six provider kinds — `ollama`, `lmstudio`, `llamacpp`, `openai`, `azure`, `compat` — expose a
broadly **OpenAI-compatible** chat-completions surface: the same request/response JSON, tool-call
structure, and streaming format, differing mainly in base URL, authentication scheme, the exact
model-listing endpoint, and small capability quirks (ADR-0007, *Context and problem statement*).
GoMarkEdit deliberately does **not** let each provider metastasize into its own bespoke HTTP client and
does **not** adopt a third-party multi-provider LLM SDK (rejected in ADR-0007 as a heavy, fast-churning
dependency against a CGO-free, offline-first backend). Instead:

- **The rule:** add a kind by adding a `ProviderProfile` row (auth scheme, base URL, path templates,
  discovery strategy, capabilities) and registering it in `NewFactory()`. **Never write a new client.**
- The concrete `OpenAICompatibleProvider` holds only an `*http.Client` and a `ProviderProfile` — nothing
  kind-specific lives in the client itself.
- `NewFactory().Build(ResolvedConfig)` picks the profile for a kind and returns a ready `Provider`, so a
  new OpenAI-compatible endpoint is a **new profile row, not a new client class** (ADR-0007, *Decision
  outcome*).

## The `Provider` interface

```go
type Provider interface {
    // Chat performs one completion turn. It carries tool schemas and may stream.
    Chat(ctx context.Context, req ChatRequest) (ChatResponse, error)
    // ListModels enumerates models the endpoint advertises (model discovery, DD-46).
    ListModels(ctx context.Context) ([]ModelInfo, error)
    // Capabilities reports what this profile supports (tools, streaming, model listing).
    Capabilities() Capabilities
    // Kind identifies the provider kind (ollama | lmstudio | llamacpp | openai | azure | compat).
    Kind() ProviderKind
}

type ChatRequest struct {
    Model       string
    System      string        // system prompt (action family / chat)
    Messages    []Message     // running transcript: user / assistant / tool observations
    Tools       []ToolSchema  // JSON-schema tool definitions (empty = plain chat)
    Temperature *float64      // pointer = "unset, use provider default"
    MaxTokens   *int          // max output tokens (reply reserve, DD-52)
    NumCtx      *int          // context length hint where the kind supports it (DD-52)
    Stream      bool          // request token streaming (DD-49)
}

type ChatResponse struct {
    Content      string        // assistant text (final or interim)
    ToolCalls    []ToolCall    // tool invocations the model requested this turn
    FinishReason string        // stop | tool_calls | length | …
    Usage        Usage         // prompt/completion token counts when the provider reports them
    Duration     time.Duration
}
```

`Temperature`, `MaxTokens`, and `NumCtx` are pointers so "not configured" is distinct from "zero" — an
unset field is omitted from the wire request and the endpoint applies its own default (DD-52).

## The profile + factory (full code)

```go
// internal/llm/providers/profile.go
type ProviderProfile struct {
    Kind                   ProviderKind      // ollama | lmstudio | llamacpp | openai | azure | compat
    DefaultAuthScheme      AuthScheme        // none | bearer | apiKeyHeader
    DefaultBaseURL         string            // e.g. "http://127.0.0.1:11434"
    CompletionPathTemplate string            // e.g. "/v1/chat/completions"
    ModelsPathTemplate     string            // e.g. "/v1/models" or "/api/tags"
    DiscoveryStrategy      DiscoveryStrategy // how ListModels parses the model list
    Capabilities           Capabilities      // tools, streaming, model-listing support
}

// OpenAICompatibleProvider is the ONLY client. Kind-specific behaviour lives in the profile.
type OpenAICompatibleProvider struct {
    http    *http.Client
    profile ProviderProfile
}

// NewFactory maps a ProviderKind → (builder, profile). One builder wraps the shared
// OpenAICompatibleProvider with the kind's profile; there is no per-kind client class.
func NewFactory() *ProviderFactory { /* maps ProviderKind → profile row; no per-kind client */ }

func (f *ProviderFactory) Build(cfg ResolvedConfig) (Provider, error) {
    profile := f.profileFor(cfg.Config.Kind)
    return &OpenAICompatibleProvider{http: f.client, profile: profile}, nil
}
```

## Per-kind profile table

One abstraction, six kinds — each a **provider profile** over the same OpenAI-compatible client
(DD-45; `17_PROVIDERS_MODELS_SETTINGS.md#provider-kinds`). The three "(local)" kinds keep everything
on-device and are the recommended default (DD-32 revised, DD-54).

| Kind | Base URL (default) | Auth scheme | Models path | Discovery strategy |
|---|---|---|---|---|
| `ollama` | `http://127.0.0.1:11434` (local) | none | `/api/tags` | ollama tags list |
| `lmstudio` | local OpenAI-compatible endpoint | none | `/v1/models` | OpenAI list |
| `llamacpp` | local `server` endpoint | none | `/v1/models` | OpenAI list |
| `openai` | `https://api.openai.com` | bearer (env var) | `/v1/models` | OpenAI list |
| `azure` | user endpoint + deployment | apiKeyHeader (env var) | profile-specific | OpenAI list (+ headers) |
| `compat` | user endpoint | none / bearer / apiKeyHeader | `/v1/models` | OpenAI list |

Provider config (the mockup's **Provider** group) carries, per kind:

- **Base URL** — the endpoint root; prefilled from the profile's `DefaultBaseURL`, editable.
- **Auth scheme** — **None** / **Bearer** / **Api-Key**, prefilled from `DefaultAuthScheme`.
- **Headers** — optional extra request headers the profile or user supplies (e.g. an Azure API-version
  header), for compatibility with a specific gateway.
- **Selected model** — chosen from discovery (`references/discovery-verification-persistence.md`).
- **Inference params** — temperature, max output tokens, context length (DD-52).

Configuration is edited as a **draft** and **verified before saving**
(`references/discovery-verification-persistence.md#verification`): the three Test buttons run against
the draft, so a user never persists a config that cannot connect.

**EC-LLM-16 — Config changed mid-run.** Editing the provider/model while a run is in flight does not
mutate the in-flight run; the change applies to the **next** run. Because inference is single-flight
(DD-47), there is no ambiguity about which config a given run used — the run transcript records the
provider/model snapshot it ran with.

## Spec references

- `specification/02_Architecture/08_LLM_INTEGRATION.md` §*Provider abstraction*
- `specification/01_Product/17_PROVIDERS_MODELS_SETTINGS.md` §*Provider kinds*, §*Provider config*
- `specification/00_Foundation/04_DESIGN_DECISIONS.md` DD-45
- `specification/08_Decisions/0007-llm-provider-abstraction.md` (ADR-0007) — full context, decision
  drivers, and rejected options (per-provider bespoke clients; a third-party LLM SDK)
