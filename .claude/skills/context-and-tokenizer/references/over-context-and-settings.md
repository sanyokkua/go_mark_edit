# Over-Context Strategy and AI Context Settings

The Warn/Chunk over-context offer, the reactive `context_window` backstop, and the AI Context settings tab.

## Over-context strategy (DD-50, DD-43, `18_TOKENIZER_AND_CONTEXT.md#over-context-strategy`)

For a **whole-document** action whose estimate is red, the app applies the configured over-context
strategy:

- **Warn (default).** The app **warns** and offers to **process the selection instead** or a single
  chunk, rather than sending an over-budget request. The user chooses; **nothing is sent until they do**
  (EC-LLM-10).
- **Chunk (opt-in in v1).** The app splits the document into windowed chunks **with overlap** (to preserve
  continuity across boundaries), processes them within budget, and assembles the proposed edit.

Scope defaults follow DD-43: if text is selected, actions default to the selection; over-context handling
above governs the **whole-document** path specifically.

### EC-LLM-10 — Over-context whole document

A whole-document run whose estimate is red: under **Warn** the app blocks the send and presents the
selection/chunk choice; under **Chunk** it proceeds in overlapped windows. Either way it **never sends a
request known to exceed the window**.

## Reactive backstop (DD-48, DD-50)

If the offline estimate under-counts and the provider returns `context_window` (HTTP 400 / overflow), that
classified error is the backstop — surfaced through the standard error envelope, offering to **narrow
scope** or **enable chunking** rather than retrying the identical over-length request.

### EC-LLM-15 — Reactive context-window overflow

Despite a green/amber estimate, the provider rejects the request for length: the app reports the
classified context-window error and offers to narrow scope or enable chunking, rather than retrying the
identical over-length request.

**Keep both layers.** The proactive fit meter (`references/tokenizer-and-fit.md`) does not replace the
reactive backstop — an estimator is approximate by design (ADR-0009), so the `context_window` error path
must stay wired even after the meter is in place.

## Configurable in AI Context settings tab (DD-52, DD-53)

The following live in the **AI Context** settings tab and must be read live, never hard-coded:

| Setting | Default | Effect |
|---|---|---|
| Token estimator | embedded BPE (`tiktoken (cl100k)` style) + `chars ÷ 4` fallback | Which offline estimator `Estimate` uses |
| Safety margin | 15% | Percentage added on top of the raw estimate in `Fits` |
| Reply reserve | 1024 tok | Tokens held back for the model's response |
| Over-context strategy | Warn | Warn (block + offer selection/chunk) vs. Chunk (opt-in, overlapped windows) |
| Chat history strategy | Sliding window | Sliding window vs. Summarize |
| Max tool iterations | 8 | Caps budgeted round-trips per run (DD-40) |

Temperature, max output tokens, and context length (`num_ctx`) are **per-model params**, not AI Context
settings — but the fit meter reads its **ceiling** from `num_ctx` and its **reserve** from the reply
reserve, so changing either updates the meter live
(`17_PROVIDERS_MODELS_SETTINGS.md#inference-params`, `18_TOKENIZER_AND_CONTEXT.md#reply-reserve`).

Wire these through `logic/adapter/` and `logic/llm/` — never read a settings value once and cache it past
the point where the user could have changed it in the tab.
