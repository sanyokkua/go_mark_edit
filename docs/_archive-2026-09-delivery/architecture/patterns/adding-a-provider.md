# Adding an AI provider kind

*This pattern applies to the assistant phases (11–13). None of the code below exists yet; it is the
shape it takes when it does.*

There is **one** HTTP client, `OpenAICompatibleProvider`. A provider kind is a row of configuration —
a `ProviderProfile` — registered in the factory. Adding a kind never means adding a client class.

The six kinds are `ollama`, `lmstudio`, `llamacpp`, `openai`, `azure` and `compat`. All six speak a
broadly OpenAI-compatible chat-completions API: the same request and response JSON, the same tool-call
shape, the same streaming format. They differ in base URL, how they authenticate, where they list
models, and which capabilities they have.

## The profile

```go
// internal/llm/providers/profile.go
type ProviderProfile struct {
	Kind                   ProviderKind      // ollama | lmstudio | llamacpp | openai | azure | compat
	DefaultAuthScheme      AuthScheme        // none | bearer | apiKeyHeader
	DefaultBaseURL         string            // "http://127.0.0.1:11434"
	CompletionPathTemplate string            // "/v1/chat/completions"
	ModelsPathTemplate     string            // "/v1/models" or "/api/tags"
	DiscoveryStrategy      DiscoveryStrategy // how ListModels parses the response
	Capabilities           Capabilities      // tools, streaming, model listing
}

// The only client. Nothing kind-specific lives in it.
type OpenAICompatibleProvider struct {
	http    *http.Client
	profile ProviderProfile
}
```

| Kind | Default base URL | Auth | Models path | Discovery |
|---|---|---|---|---|
| `ollama` | `http://127.0.0.1:11434` (local) | none | `/api/tags` | Ollama tag list |
| `lmstudio` | local OpenAI-compatible endpoint | none | `/v1/models` | OpenAI list |
| `llamacpp` | local `server` endpoint | none | `/v1/models` | OpenAI list |
| `openai` | `https://api.openai.com` | bearer, from an environment variable | `/v1/models` | OpenAI list |
| `azure` | the user's endpoint plus a deployment | API-key header, from an environment variable | profile-specific | OpenAI list plus headers |
| `compat` | the user's endpoint | none, bearer, or API-key header | `/v1/models` | OpenAI list |

## Adding a kind, in full

1. Add the constant to `ProviderKind`.
2. Add the profile row in `NewFactory()`.
3. If the endpoint's model list has a shape none of the existing strategies parses, add a
   `DiscoveryStrategy` — a function from response body to `[]ModelInfo`.
4. Add the kind to the picker in the AI / Providers settings tab.
5. Write a test that builds the provider from the factory and asserts the request URL, the
   authorisation header and the parsed model list against a recorded response body.

That is the whole change. If you find yourself writing a second `Chat` implementation, the difference
you are handling belongs in the profile.

## Secrets are environment-variable *names*

```go
type ProviderConfig struct {
	ID        string
	Kind      ProviderKind
	BaseURL   string
	APIKeyEnv string // the NAME of an environment variable — never the value
}

func (c ProviderConfig) resolveKey() string {
	if c.APIKeyEnv == "" {
		return ""
	}
	return os.Getenv(c.APIKeyEnv)
}
```

The key itself is never written to the database, never returned across the Wails bridge, and never put
in a log field or an error's `Details`. What is stored is the name of the variable to read. **If** the
named variable is unset at request time, **then** the call fails with `missing_credential` naming the
variable, so the user is told what to set rather than being told the request failed.

## Nothing happens without a user action

An outbound request is made only when the user invokes an action, sends a message, or presses one of
the three Test buttons. There is no connection on startup, no keep-alive, no model list refreshed in the
background. The default configuration points at a local endpoint, so a default install still sends
nothing off the machine.

## Configuration is verified as a draft, before it is saved

The AI / Providers tab edits a draft. Three buttons run against the draft: **Test connection** reaches
the endpoint, **Test models** lists them, **Test inference** performs one real completion. Only then can
the draft be saved. This is why `internal/llm/verify` exists as its own package — the verification path
runs against a configuration that is not yet persisted.

`TestInference` acquires the shared gate, because it is a real inference and only one may run at once.

## Errors are classified before they cross the bridge

A transport failure, a 401, a 404 on the models path and a context-length rejection are four different
things the user can do four different things about. Map them at the provider boundary into distinct
`apperr` codes with distinct messages — not into one "the provider failed".

## Checklist

- [ ] A profile row was added and no new client class
- [ ] The API key is an environment-variable **name**; the value is never persisted, logged, or returned
- [ ] No request happens without a user action
- [ ] `TestInference` acquires the gate and releases it in a `defer`
- [ ] Distinct failures map to distinct error codes and distinct messages
- [ ] A test asserts the request URL, the auth header and the parsed model list for the new kind
