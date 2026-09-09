**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester
**Last Updated:** 2026-07-14
**Cross-references:** `00_Foundation/04_DESIGN_DECISIONS.md` (DD-32, DD-38–DD-55), `00_Foundation/06_IMPLEMENTATION_STAGES.md` (F1–F10), `02_Architecture/02_BACKEND_GO.md`, `02_Architecture/06_ERROR_HANDLING.md`, `02_Architecture/07_LARGE_FILES_AND_CONCURRENCY.md`, `03_NonFunctional/03_SECURITY_AND_PRIVACY.md`, `03_NonFunctional/04_OFFLINE.md`, `02_Architecture/01_MODULE_INVENTORY.md`, `08_Decisions/ADR-0007`, `08_Decisions/ADR-0008`, `08_Decisions/ADR-0009`, `08_Decisions/ADR-0010`, `08_Decisions/ADR-0011`

# LLM Integration

The assistant is an **agentic, tool-call-based** workflow layered on top of the working Editor
(DD-40). This document is the normative architecture contract for the `internal/llm/*` package group: the
provider abstraction, the bounded tool-call loop, the tool registry, the context budgeter and tokenizer,
streaming, the single-flight gate and cancellation, the frontend event surface, the LLM error codes, and
persistence. It extends — never rewrites — the backend layering (`02_Architecture/02_BACKEND_GO.md`) and
error model (`02_Architecture/06_ERROR_HANDLING.md`), and it consumes the F1–F10 forward-compatibility
seams reserved in the phases before the assistant (`00_Foundation/06_IMPLEMENTATION_STAGES.md`).

Everything here is additive: no pre-assistant handler, service, or table is changed destructively. The
assistant is off by default and the default provider is **local**, so a default install still performs
**zero** network I/O until the user explicitly configures a remote provider and invokes an action
(DD-32, DD-54; `03_NonFunctional/04_OFFLINE.md`).

## Table of Contents

1. Overview
2. Provider abstraction
3. Agent loop
4. Tool registry
5. Context budgeter
6. Tokenizer
7. Streaming
8. Gate and cancellation
9. Events
10. Error codes
11. Persistence
12. Forward-compat seams

## Overview

The assistant adds one new package group and one settings extension (assistant rows of
`02_Architecture/01_MODULE_INVENTORY.md`):

```
internal/llm/
  providers/   Provider interface · OpenAICompatibleProvider · ProviderProfile · ProviderFactory
               · model discovery · retry/error mapping · streaming decode
  verify/      Draft-config diagnostics: TestConnection / TestModels / TestInference (gate-guarded)
  tokenizer/   Offline token estimation + safety margin + reply reserve + fit check
  context/     Context budgeter: allocate the window across system/tools/document/history; trim
  tools/       Agent tool registry + 5 tool implementations (read-mostly, least-privilege)
  agent/       Bounded multi-turn tool-call orchestrator (AgentHandler, RunAgent); emits events
  actions/     Preconfigured action catalog (data): Proofread, Confluence/Wiki, Article, Q&A, …
internal/settings/ (extended)  providers table (additive migration) + AI KV keys
```

The group follows the standard **Handler → Service → Repository** layering: `AgentHandler` and the
`verify`/settings handlers are the only Wails-bound surfaces; they return `apperr.*Result` envelopes,
take **no** `context.Context`, and convert every service error through `apperr.ToWire` (see
`02_Architecture/02_BACKEND_GO.md`). Inner services keep idiomatic `(T, error)` signatures and receive
the Wails `ctx`. `internal/apperr` remains the bottom of the graph.

### Data flow (one run)

```
User invokes an action / sends a chat message
        │  (assistant sidebar composer or quick-action; scope = selection | whole document)
Frontend ui/widgets/assistant → logic/store/assistant thunk → logic/adapter (only layer touching wailsjs)
        │
Wails bound AgentHandler.RunAgent(req) → acquire single-flight gate (Busy if held)
        │
internal/llm/agent RunAgent loop:
   build messages (system + tool schemas + scoped document/selection + trimmed history)
        → provider.Chat(ctx, ChatRequest{Tools, Stream})
        → if ToolCalls: dispatch each to internal/llm/tools Registry, append observations, iterate
        → else: final assistant text → stop
   (per-iteration cancellation check; iteration + wall-clock limits)
        │  emits Wails events throughout ↓
Events: agent:progress · agent:token (streaming) · agent:done · agent:error
        │
Frontend logic/adapter event subscription → logic/store/assistant run slice
        │
Edit proposal (propose_edit tool result = a diff) rendered in the sidebar via the reusable DiffView (F9)
        │  user reviews diff → Apply
Apply-edit → editor document-command seam (F3/F7: replace-range | replace-all)
        → optional Format-after-apply (F8) → updated buffer syncs to the backend model (DD-64)
        → normal save/autosave path
```

Nothing is written to disk by the model or the loop. The only file mutation is the user pressing
**Apply** on a reviewed diff, which routes through the same editor command seam and save path used by
ordinary typing (DD-42).

## Provider abstraction

All provider kinds are served by **one** OpenAI-compatible client, parameterized by a per-kind profile
and selected by a factory (DD-45; ADR-0007). This is a standard OpenAI-compatible request/response shape
with tool-calls and streaming added.

### Interface

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
unset field is omitted from the wire request and the endpoint applies its own default.

### Profile + factory

```go
type ProviderProfile struct {
    Kind                   ProviderKind
    DefaultAuthScheme      AuthScheme // none | bearer | api-key header
    DefaultBaseURL         string     // e.g. local Ollama / LM Studio default
    CompletionPathTemplate string     // e.g. "/v1/chat/completions"
    ModelsPathTemplate     string     // e.g. "/v1/models" or "/api/tags"
    DiscoveryStrategy      DiscoveryStrategy // how ListModels parses the endpoint's model list
    NativeChatPath         string     // non-empty ⇒ use this instead of CompletionPathTemplate
    Capabilities           Capabilities // kind-level only — see "capability is per model" below
}

// NewFactory maps a ProviderKind → (builder, profile). One builder wraps the shared
// OpenAICompatibleProvider with the kind's profile; there is no per-kind client class.
func NewFactory() *ProviderFactory
func (f *ProviderFactory) Build(cfg ResolvedConfig) (Provider, error)
```

The concrete `OpenAICompatibleProvider` holds an `*http.Client` and a `ProviderProfile`; the profile
supplies base URL, auth scheme, path templates, and discovery strategy so a new OpenAI-compatible kind is
a new profile row, not new client code.

### Resolved config + secret handling

```go
type ResolvedConfig struct {
    Config ProviderConfig // persisted: kind, name, baseURL, authScheme, headers, envVarName, modelId, params
    Secret string         // resolved at call time from os.Getenv(Config.EnvVarName); NEVER persisted or logged
}
```

API keys are referenced by **environment-variable name** only; the secret value is read from the process
environment at request-construction time, attached to the outgoing `Authorization`/API-key header, and
never written to the DB, the transcript, or any log (DD-45; `03_NonFunctional/03_SECURITY_AND_PRIVACY.md`).
If `EnvVarName` is set but unresolved in the environment, the service returns `missing_credential`
(see [Error codes](#error-codes)) rather than sending an unauthenticated request.

### Model discovery

`ListModels` calls the profile's `ModelsPathTemplate` and parses it per `DiscoveryStrategy` (OpenAI
`/v1/models` list vs. an Ollama-style `/api/tags`), returning `[]ModelInfo{ID, …}` for the model picker
and the AI/Providers settings tab (DD-46).

### `NativeChatPath`, and why Ollama needs one

**Ollama's OpenAI-compatible endpoint silently ignores `options.num_ctx`.** Its native `/api/chat`
endpoint honours it. Since `17_PROVIDERS_MODELS_SETTINGS.md` promises that the context-length setting
drives the budget, routing Ollama through `/v1` makes that promise false without failing.

So the Ollama profile sets `NativeChatPath: "api/chat"`, and that endpoint has **a different request
shape _and_ a different response shape**: `options{temperature, num_ctx, num_predict}` going out;
`message.content`, `done_reason`, `prompt_eval_count` and `eval_count` coming back, instead of
`choices[]`, `finish_reason` and `usage`. One decoder for all six kinds is therefore wrong, and the
decoder is selected by profile.

A caution from the same source: this behaviour **changed between Ollama versions** — an earlier
observation that `num_ctx` was ignored was refuted by a later one against a newer build. Verify against
the version you ship, not against a note. That is what `docs/testing/LIVE_TESTING_PLAN.md` is for.

### Capability is a property of the model, not of the kind

`Capabilities` on `ProviderProfile` is keyed by `ProviderKind`, which is right for things like
"strip `<think>` blocks" and **wrong for tool calling**.

One Ollama server on one port serves a model that supports tool calls and a model that does not, at the
same time. A local-first user's installed catalogue is mostly the second kind. So **tool support is
recorded against `(providerId, modelId)`**, probed by the _Test tools_ verification
(`17_PROVIDERS_MODELS_SETTINGS.md#verification`), and the assistant **degrades to a single-shot path**
when it is absent rather than failing (ADR-0034).

Getting this wrong is not a graceful failure. Ollama returns HTTP 400 with a body about tools; nothing
recognises it; it classifies as `upstream`, which is retryable; the user gets four identical failures.
LM Studio and llama.cpp are worse — they frequently **accept the request, ignore the `tools` array, and
return prose**, which the loop reads as a final answer. The user is then shown the model narrating what
it would like to read.

### Reasoning models emit `<think>` blocks

Local model catalogues are full of them, and hosted APIs are not — so this is a genuine kind-level
capability, `StripThinkTags`, true for `ollama`, `lmstudio` and `llamacpp`.

The blocks are stripped **before** the empty-content check, so a response that is _entirely_ reasoning
becomes `empty_completion` with an actionable message rather than a `<think>` blob rendered into the
user's chat.

**Under streaming this is materially harder**: you cannot strip a closed tag before `</think>` has
arrived. A naive token emitter streams the model's whole chain of thought into the chat bubble. The
reply is therefore buffered until the closing tag or a bounded prefix length, whichever comes first.

### Retry + error mapping (owned by the service)

Retries and timeouts are owned by the **service**, not the HTTP client (DD-48).

**Attempts are `1 + maxRetries`.** `maxRetries = 3` means four requests reach the provider. This is
stated once, here, and the settings label says the same thing — the ambiguity between "retries" and
"attempts" cost a reviewed reference project a release cycle of dead code, and its own live testing had
to establish the answer empirically.

**Every attempt's deadline is `min(perAttemptTimeout, timeRemainingInRunBudget)`.** Retries do not each
get a fresh full timeout, because three bounds that multiply produce a run nobody bounded: at a
60-second timeout, 3 retries and 8 iterations, one click on Proofread can hold the gate for roughly
half an hour before any limit fires. **The run's wall-clock budget pre-empts retries and iterations
both** (ADR-0034); it is not a fourth independent limit sitting outside them.

Backoff is exponential from 500 ms, capped at 8 s, and a `Retry-After` header overrides it. **The delay
is shown to the user**, not merely used internally — parsing it and then hiding it leaves someone
hitting a real rate limit with no guidance, which is what the reference implementation does.

A retry neither consumes an agent iteration nor emits a new iteration progress event.

The mapping from transport/status to `ErrorCode` is fixed:

| Outcome                                               | ErrorCode              | Retryable                 |
| ----------------------------------------------------- | ---------------------- | ------------------------- |
| Transport error — connection refused / DNS / reset    | `provider_unreachable` | yes                       |
| Deadline exceeded / slow response past budget         | `timeout`              | yes                       |
| `context.Canceled` (user/shutdown)                    | `cancelled`            | no                        |
| HTTP 401 / 403                                        | `auth`                 | no                        |
| Env-var name set but unresolved before send           | `missing_credential`   | no                        |
| HTTP 404 (model/endpoint)                             | `model_not_found`      | no                        |
| HTTP 429                                              | `rate_limited`         | yes (honor `Retry-After`) |
| HTTP 400 recognized as context overflow               | `context_window`       | no                        |
| HTTP 400 recognized as "model does not support tools" | `tools_unsupported`    | **no**                    |
| `finish_reason == "length"`                           | `output_truncated`     | no                        |
| Other non-2xx upstream failure                        | `upstream`             | yes                       |
| 2xx but empty/blank completion                        | `empty_completion`     | **no**                    |

Three rows changed on 2026-07-25 and the reasons are worth keeping:

- **`empty_completion` is not retryable.** It looks transient and is not. On a reasoning-style model with
  a low output cap, the cap is consumed entirely by hidden reasoning tokens before any visible output
  begins — a deterministic _configuration_ outcome. Retrying spends three more identical inferences to
  produce the same nothing. Its message says which setting to change.
- **`upstream` is retryable**, not "sometimes". A rule an implementer has to guess at is not a rule.
- **`output_truncated` is new**, and it is the most actionable diagnostic in the whole surface.
  `finish_reason` is currently captured and never read — in this specification _and_ in the reference
  implementation. `"length"` means "raise Max output tokens", and it must never surface as
  `empty_completion` or `tool_failed`.

**The inner cause must reach the user.** When `tool_failed` or `agent_limit` wraps a real failure, the
notification shows the **inner** code's title and remediation
(`01_Product/20_NOTIFICATIONS_AND_EMPTY_STATES.md#error-copy`). Collapsing five distinct provider
failures into one outer code is exactly the state a reviewed application shipped in, where a user could
not tell a rejected credential from a rate limit from a mistyped model name.

### Recognising a context overflow

`HTTP 400 recognized as context overflow` is where an implementation will guess and get it wrong, so
the recognition is specified rather than left to a regex somebody invents.

**Phrasing varies across providers and within one provider.** The same llama.cpp backend has been
observed emitting both _"exceeds the available context size"_ and _"greater than the context length
(n_keep: … >= n_ctx: …)"_ depending on runtime and quantisation. Recognition is therefore a small set,
case-insensitively: `context_length_exceeded`, or `n_ctx`, or `context` together with one of `exceed`,
`too long`, `greater than`.

**Extracting the limit has a trap.** Try `n_ctx:\s*(\d+)` **first**. A generic
`context (size|length)[^\d]{0,20}(\d+)` applied to `n_keep: 8530 >= n_ctx: 2048` captures **8530** —
the amount _requested_ — and shows the user a context limit that is not their context limit.

Every mapped error becomes an `apperr.AppError` with a user-facing title/message and the sanitized
`WireError` surfaced through the standard envelope + toast path (`02_Architecture/06_ERROR_HANDLING.md`).

## Agent loop

`internal/llm/agent` is the bounded multi-turn orchestrator that replaces a single fixed prompt
(DD-40; ADR-0008). It builds a message set, calls the provider, dispatches any requested tool calls to
the registry, appends their observations, and iterates until the model returns final text or a hard limit
is reached. It checks cancellation **each iteration** and emits progress/stream events throughout.

### Signature sketch (spec-level, not full implementation)

```go
type AgentHandler struct { /* service, gate, event emitter, ctx */ }

// RunAgent is the Wails-bound entry. Result envelope, no ctx param, defer/recover → internal.
func (h *AgentHandler) RunAgent(req RunAgentRequest) (res apperr.RunResult)

type RunAgentRequest struct {
    RunID        string          // frontend-generated correlation id for events
    ActionID     string          // catalog action, or "" for a custom-instruction / chat turn
    Directive    string          // custom instruction text (DD-39) or the chat message
    Scope        Scope           // Selection | WholeDocument (DD-43)
    DocumentID   string          // which open tab/document this run reads (F2 identity)
    History      []Message       // prior chat turns for this document/session (DD-44)
    Stream       bool            // UX enhancement only (DD-49)
}

type RunOutcome struct {
    FinalText  string        // assistant's closing message
    Proposal   *EditProposal // present when the run produced a propose_edit diff (may be nil)
    Transcript []Message      // messages + tool calls + observations for the session (DD-55)
    Stopped    StopReason     // final_text | iteration_limit | time_limit | cancelled | error
}
```

### Loop (pseudocode)

```
func RunAgent(ctx, req) (RunOutcome, error):
    // gate is already held by the handler; see Gate and cancellation
    system   = actions.SystemPrompt(req.ActionID)          // family system prompt, or chat/custom default
    tools    = tools.Registry.Schemas(scopeCaps(req))       // only tools valid for the current scope/workspace
    document = readScoped(req.DocumentID, req.Scope)         // whole doc or selection via the read tools' source
    budget   = context.Budget(system, tools, document, req.History)   // explicit allocation
    messages = budget.Assemble()                            // trimmed history + scoped document + directive

    for i := 0; i < maxIterations; i++:
        if ctx.Err() != nil: return stopped(cancelled)      // per-iteration cancellation (DD-47)
        if elapsed() > maxWallClock: return stopped(time_limit)
        emit(agent:progress{runId, phase:"infer", iteration:i})

        resp, err = provider.Chat(ctx, chatRequest(messages, tools, req.Stream))
        if err != nil: return err                            // mapped ErrorCode surfaces via envelope
        if req.Stream: (agent:token deltas already emitted during decode)

        if len(resp.ToolCalls) == 0:
            emit(agent:progress{phase:"final"})
            return outcome(finalText: resp.Content, proposal: lastProposal, stopped: final_text)

        append(messages, assistantToolCallTurn(resp.ToolCalls))
        for call in resp.ToolCalls:
            if ctx.Err() != nil: return stopped(cancelled)   // abort mid-tool
            emit(agent:progress{phase:"tool", iteration:i, tool: call.Name})
            obs = tools.Registry.Dispatch(ctx, call)         // validates args; least-privilege
            append(messages, toolObservation(call, obs))     // propose_edit obs carries the diff
            if call.Name == "propose_edit": lastProposal = obs.Proposal

    return stopped(iteration_limit)                          // bounded; agent_limit surfaced to UI
```

The loop never itself mutates the document or the disk. A `propose_edit` observation carries a **diff**;
applying it is a separate, explicit user action on the frontend (DD-42; see
[Forward-compat seams](#forward-compat-seams)). Iteration count and wall-clock ceiling are configurable
in the AI Context settings tab (DD-53); hitting either is a clean stop reported as `agent_limit` when the
model never converged on final text.

## Tool registry

`internal/llm/tools` defines the tool schemas and their implementations. Tools are **least-privilege and
read-mostly** (DD-41): five tools, no arbitrary filesystem/shell/network access, and the model never
writes files.

```go
type Tool struct {
    Name        string
    Description string
    Schema      ToolSchema  // JSON-schema for arguments; the model must produce conforming args
    Invoke      func(ctx context.Context, args json.RawMessage) (Observation, error)
}

type Registry interface {
    Schemas(caps ScopeCaps) []ToolSchema         // only the tools valid for the current scope/workspace
    Dispatch(ctx context.Context, call ToolCall) (Observation, error) // validate args → run → observe
}
```

| Tool                   | Purpose                                                               | Source                                                                          | Privilege                                           |
| ---------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------- |
| `read_document`        | Return the current document's full text                               | `internal/appmodel` canonical buffer, via the F2 content accessor (DD-62/DD-64) | read-only                                           |
| `read_selection`       | Return the current selection (or empty)                               | `internal/appmodel` per-document view state (F2/F7 selection accessor)          | read-only                                           |
| `list_workspace_files` | List `.md`/`.markdown`/`.mdown`/`.txt` files under the workspace root | `internal/workspace`                                                            | read-only; **only when a folder workspace is open** |
| `read_workspace_file`  | Read one workspace file by relative path                              | `internal/workspace` + asset allowlist                                          | read-only; allowlisted, traversal-rejected          |
| `propose_edit`         | Return a proposed replacement as a **diff**                           | computed against scoped content                                                 | **never writes**; returns a diff for review         |

Rules:

- **Reads come from the backend's canonical buffer.** `read_document`/`read_selection` read the
  Go-owned model (`internal/appmodel`) — the single source of truth the editor debounce-syncs into
  (DD-62/DD-64) — never the frontend editor. A pending edit is at most one debounce tick behind and is
  flushed on blur/tab-switch/close/save, so the assistant sees what the user sees.
- **Argument validation.** Every call's arguments are validated against the tool's JSON schema before
  invocation; a malformed or out-of-contract call fails with `tool_failed` (an observation the loop can
  surface, or a run-ending error if unrecoverable) — model output is treated as **untrusted input**, not
  a trusted instruction.
- **Workspace tools are gated.** `list_workspace_files`/`read_workspace_file` are advertised only when a
  folder workspace is open, and reuse the asset **allowlist** (document folder + workspace root +
  ) with path-traversal rejection (DD-41; `03_NonFunctional/03_SECURITY_AND_PRIVACY.md`
  `#2-asset-allowlist-and-traversal`). A path escaping the allowlist is rejected, not read.
- **`propose_edit` never mutates.** It computes and returns a diff against the scoped content; applying it
  is a frontend user action through the editor command seam (F3/F7), never a disk write from the tool.

## Context budgeter

`internal/llm/context` treats the model's context window as an **explicit budget** allocated before each
run (DD-51). It partitions the window across, in priority order:

1. **System prompt** (action family / chat) — kept concise.
2. **Tool schemas** — kept concise; only the tools valid for the current scope are included.
3. **Scoped document / selection** — the primary payload.
4. **Chat history** — the trimmable remainder.

```go
type Budget interface {
    Assemble() []Message              // system + schemas + scoped content + trimmed history
    Trim(history []Message, headroom int) []Message
}
```

- The **reply reserve** (headroom for the model's output) and a **safety margin** are subtracted from the
  window before allocation (see [Tokenizer](#tokenizer)).
- **Over-budget history** is trimmed by **sliding window** (default — drop oldest turns) or
  **summarization** (a setting that replaces older turns with a compact summary) (DD-51, DD-53).
- Allocation favors **primacy and recency**: the system prompt and the most recent turns are preserved;
  middle history is trimmed first. Tool schemas and system prompts are authored tersely so they cost
  little of the budget.
- If the scoped document alone will not fit even after trimming all history, the budgeter surfaces this to
  the tokenizer fit check, which drives the UI warning / chunk-or-selection offer (DD-50).

## Tokenizer

`internal/llm/tokenizer` provides an **offline** token estimate — never a network call (DD-50; ADR-0009).

```go
func Estimate(text string) int                 // offline estimator (embedded BPE / heuristic)
func Fits(promptTokens, replyReserve, window, safetyMargin int) FitResult
```

- The estimate is **approximate**, not exact: real tokenization varies per model/provider, so the app
  applies a configurable **safety margin** (a percentage headroom) on top of the raw estimate.
- A **reply reserve** is held back from the window so the model has room to answer; the fit check is
  `estimate(prompt) + safetyMargin + replyReserve ≤ contextWindow`.
- The result drives the sidebar **fit meter**: before a whole-document action the app shows whether the
  scoped content fits, and **warns** (offering to process a chunk or the selection) when it does not
  (DD-50, DD-43). Chunking is opt-in in v1; the default action on over-context is to warn.
- The reactive `context_window` error from the provider (an actual overflow at inference time) remains the
  **backstop** when the offline estimate under-counts. Estimator choice, safety margin, and reply reserve
  are all configurable in the AI Context settings tab (DD-53).

## Streaming

Streaming is a **UX enhancement, never required for correctness** (DD-49). When the provider profile
advertises streaming and the run requests it (`ChatRequest.Stream = true`), the provider decodes the
server-sent token stream and the agent emits `agent:token` deltas that append into the chat transcript in
real time.

- Streaming applies to **assistant text** turns. Tool-call turns are consumed as structured results, not
  streamed token-by-token to the transcript.
- If a provider does not support streaming, or streaming fails mid-turn, the loop **falls back** to
  non-streaming: the same `Chat` call returns the full `ChatResponse.Content` at once and the transcript
  updates on completion. Correctness (final text, proposals, apply) is identical either way.

### Streaming inverts five assumptions the non-streaming path relies on

Every classification rule in this document assumes the whole response body is in hand. Under streaming
it is not, and each of these is a distinct failure the fallback above does not cover.

- **The error arrives inside a 200.** Status-based classification keys off a non-2xx response. With
  server-sent events an upstream failure arrives as an error frame _inside_ an already-successful
  response, so `auth`, `rate_limited` and `context_window` become invisible unless the decoder also
  parses in-stream error frames. It must.
- **Reasoning blocks cannot be stripped incrementally.** You cannot regex a closed `<think>…</think>`
  before `</think>` has arrived, so a naive emitter streams the model's entire chain of thought into the
  user's chat bubble. The reply is buffered until the closing tag or a bounded prefix length, whichever
  comes first.
- **`empty_completion` is only decidable at the end.** It cannot be raised from a delta; it is
  determined when the stream terminates having produced no visible content.
- **A stream that ends without its terminator is its own failure class.** Not `upstream`, not
  `empty_completion`, not a partial success — it is an incomplete response, and it is named
  (`stream_incomplete`) so it can be reported honestly. **Partial text is kept and never replayed
  automatically**: replaying can double-charge a provider and produces two transcripts for one turn.
- **Tool-call arguments arrive fragmented.** They stream as `delta.tool_calls[i].function.arguments`
  string chunks and must be **reassembled per `index`** before JSON-schema validation. The pseudocode
  above shows `if ToolCalls:` as though the array were atomic; under streaming it is assembled, not
  received.

**Cancelling mid-stream** aborts the HTTP read _and_ decides the terminal state, through the same single
normalisation point as every other cancel (`07_LARGE_FILES_AND_CONCURRENCY.md#cancelling-a-run`). The
partial text stays in the transcript, marked as cancelled.

## Gate and cancellation

The assistant reuses the process-wide **single-flight gate** (`internal/gate`, F5) so **at most one LLM
inference runs at a time, app-wide** (DD-47; `02_Architecture/07_LARGE_FILES_AND_CONCURRENCY.md` `#gate`).

- **Acquire / Busy.** `AgentHandler.RunAgent` and `verify.TestInference` both `TryAcquire()` the same
  gate before starting. If it is already held, the handler returns `apperr.Busy()` (`busy` code) and the
  frontend shows a "please wait" toast instead of starting a second run. The gate is released in a
  `defer` when the run ends (success, error, or cancel).
- **Cancellation.** A run is cancellable via its `context.Context`. The loop checks `ctx.Err()` **each
  iteration** and again **before each tool dispatch**, so cancellation aborts promptly — between turns or
  **mid-tool** — rather than only at the end. A cancelled run returns the `cancelled` code, releases the
  gate, and emits `agent:done` with a cancelled stop reason (or `agent:error` for an error path).
- **Shutdown.** `OnShutdown` cancels any in-flight run's context and the deferred release frees the gate.

## Events

Long-running runs surface progress and streamed tokens through **Wails events** (`EventsEmit` on the
backend, `EventsOn` on the adapter), not through the bound method's return value. The adapter subscribes
and dispatches into the `run` slice (`logic/store/assistant/`). All payloads carry the `runId` from the
originating `RunAgentRequest` so the UI can correlate concurrent-looking updates to the single active run.

| Event            | Payload                                    | Meaning                                                                                 |
| ---------------- | ------------------------------------------ | --------------------------------------------------------------------------------------- |
| `agent:progress` | `{ runId, phase, iteration, tool? }`       | Loop advanced: `phase ∈ {infer, tool, final}`; `tool` present when `phase="tool"`       |
| `agent:token`    | `{ runId, delta }`                         | Streaming: a chunk of assistant text to append to the transcript                        |
| `agent:done`     | `{ runId, stopReason, transcriptSummary }` | Run finished; carries a summary of the session transcript (DD-55)                       |
| `agent:error`    | `{ runId, error: WireError }`              | Run failed; `error` is the sanitized envelope error (same shape as any `*Result.Error`) |

`agent:error` reuses the exact `WireError` shape from `02_Architecture/06_ERROR_HANDLING.md`, so the
adapter's normal `notifyError` toast path handles it with no special casing. The bound `RunResult`
envelope still returns the final outcome (or error) for callers that prefer the request/response form;
events are the incremental channel.

## Error codes

The assistant phases add an **LLM error set** to the `apperr.ErrorCode` catalog. Like the pre-assistant codes it is a
string enum exposed to TypeScript via **EnumBind** (`02_Architecture/06_ERROR_HANDLING.md` `#error-codes`;
`04_WAILS_INTEGRATION.md` `#bind-enumbind`), so the frontend branches on typed codes. Codes reused from
the base catalog (`busy`, `timeout`, `cancelled`, `validation`, `internal`) keep their existing meaning;
the assistant-specific additions are:

| Code                   | When                                                                         | Retryable |
| ---------------------- | ---------------------------------------------------------------------------- | --------- |
| `busy`                 | Single-flight gate held — another inference (run or TestInference) is active | no        |
| `provider_unreachable` | Transport failure reaching the endpoint (refused / DNS / reset)              | yes       |
| `timeout`              | Inference exceeded the app-owned deadline                                    | yes       |
| `auth`                 | Endpoint returned 401/403 (bad/rejected credential)                          | no        |
| `missing_credential`   | Configured env-var name is unset in the environment                          | no        |
| `model_not_found`      | 404 — configured model/endpoint path not found                               | no        |
| `context_window`       | Prompt overflowed the model's context window (400, or the reactive backstop) | no        |
| `rate_limited`         | 429 — provider throttling; backoff honors `Retry-After`                      | yes       |
| `upstream`             | Other non-2xx upstream failure not otherwise classified                      | sometimes |
| `empty_completion`     | 2xx but the model returned no usable text                                    | yes       |
| `cancelled`            | User or shutdown cancelled the run                                           | no        |
| `tool_failed`          | A tool call had invalid arguments or failed to execute                       | no        |
| `agent_limit`          | Loop hit the iteration or wall-clock limit without converging                | no        |
| `validation`           | Bad request argument / precondition on a bound LLM method                    | no        |
| `internal`             | Catch-all / panic fallback                                                   | yes       |

Each maps from the provider service's classification (see
[Provider abstraction](#provider-abstraction)) or the loop, becomes an `AppError` with a user-facing
title/message, is logged with its `cause` once at the handler boundary, and reaches the UI only as a
sanitized `WireError` (never a secret, never a full internal path). The full catalog with triggers and
retryable flags is mirrored in `02_Architecture/06_ERROR_HANDLING.md` `#error-codes`.

## Persistence

Assistant configuration extends `internal/settings` **additively** (F4; DD-46):

- A new **`providers` table** via an additive goose migration (never a rewrite/backfill), holding each
  provider config: kind, user-facing `name`, base URL, auth scheme, custom headers, **environment-variable
  name** (not the secret), selected model id, and inference params. The **current-provider id** and other
  scalar AI preferences (estimator choice, safety margin, reply reserve, over-context strategy, history
  strategy, max tool iterations) live as **KV keys** in the existing generic `settings(key, value, type)`
  table, so most of them need no migration at all.
- `ModelConfig{ name, temperature, maxOutputTokens, contextWindow, … }` captures the per-model inference
  parameters (DD-52).
- **Secrets are never persisted.** Only the env-var _name_ is stored; the value is read from
  `os.Getenv` at call time and never written to the DB or a log
  (DD-45; `03_NonFunctional/03_SECURITY_AND_PRIVACY.md`).
- The **session transcript** (messages + tool calls + applied edits) is kept in memory for the current
  session per document/tab and is **not** persisted across launches in v1. If a persistent run history is
  ever added it stores local snapshots only (DD-55).

## Forward-compat seams

The assistant is built entirely by **consuming** the seams reserved before it
(`00_Foundation/06_IMPLEMENTATION_STAGES.md`, F1–F10); it restructures nothing:

- **F1 — three-region layout.** The assistant sidebar drops into the reserved, previously-empty **right**
  region and its show/hide plumbing; the shell is not restructured (DD-38).
- **F2 — document identity + content accessor.** `read_document`/`read_selection` and the run's
  `DocumentID` read content and selection through the **same** first-class document model/accessor —
  the backend-authoritative `internal/appmodel` (DD-62/DD-64) — not by reaching into the editor widget.
- **F3 / F7 — document-command seam.** Applying a reviewed diff calls the editor command interface's
  **replace-range** (selection scope) or **replace-all** (whole-document scope) operations — the exact
  surface the editor phases exposed for editing. No component touches the Monaco instance directly (DD-42).
- **F5 — single-flight gate.** Inference reuses the generic `internal/gate`; a busy gate yields `busy`
  (DD-47).
- **F8 — programmatic Format/Lint.** After an edit is applied, the assistant may run the pure Format
  transform (Format-after-apply) because Format/Lint are callable functions, not only toolbar handlers.
- **F9 — reusable DiffView.** The edit-proposal card renders the `propose_edit` diff with the standalone
  diff component reused from the Format/Lint flow, rather than a bespoke renderer.
- **F6 / offline scoping.** The provider HTTP client is the _only_ outbound socket in the app, opened
  **only** on user action to the **user-configured** provider (local by default). Before the assistant exists, remain
  zero-network; the invariant is "no _background/unsolicited_ network," not "never open a socket"
  (DD-32; `03_NonFunctional/04_OFFLINE.md`).
