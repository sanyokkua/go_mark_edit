# Context Budget

The explicit priority allocation of the context window, the `budget.go` implementation, and the chat-history trimming strategies.

## Context is an explicit budget, not "stuff everything in" (DD-51)

`internal/llm/context/` subtracts reply reserve + margin first, then allocates the **usable** window in
strict priority order. Trim over-budget history by the configured strategy; favor **primacy + recency**
(keep the system prompt and most-recent turns; trim the middle first).

| Priority | Segment | Notes |
|---|---|---|
| 1 | System prompt | action/role framing; kept terse (fixed overhead) |
| 2 | Tool schemas | re-sent every iteration; kept terse (fixed overhead) — only the schemas valid for the current scope (ADR-0009) |
| 3 | Scoped document / selection | primary payload; the largest allocation |
| 4 | Chat history | the trimmable remainder |

**Placement.** The most important context — the directive and the scoped document — is placed at the
**start and end** of the prompt, where models attend most reliably; lower-priority history sits in the
middle and is the first to be trimmed. When allocations compete, the scoped content and current directive
win over older history; tool schemas and system prompt are fixed overhead the app keeps small
(`18_TOKENIZER_AND_CONTEXT.md#context-budget`).

## `internal/llm/context/budget.go`

```go
// internal/llm/context/budget.go
type Budget interface {
    Assemble() []providers.Message                              // system + schemas + scoped content + trimmed history
    Trim(history []providers.Message, headroom int) []providers.Message
}

func (b *budget) Assemble() []providers.Message {
    usable := b.window - b.replyReserve - b.marginTokens
    fixed  := tokenizer.Estimate(b.system) + b.toolSchemaTokens
    doc    := tokenizer.Estimate(b.scopedContent)
    histHeadroom := usable - fixed - doc                        // whatever remains after 1–3
    trimmed := b.Trim(b.history, max(histHeadroom, 0))          // sliding window or summarize
    return assemble(b.system, b.toolSchemas, b.scopedContent, trimmed)
}
```

`Assemble()` always computes `usable` from the **live** window/reserve/margin (never cached constants) and
always allocates segments 1–3 before handing whatever remains to `Trim()` for history. If `histHeadroom`
would go negative (system + schemas + document alone exceed the usable window), `Trim` receives `0` —
that "document alone won't fit even with empty history" case is what feeds the fit check and the
over-context strategy (`references/over-context-and-settings.md`), not a panic or a negative-length slice.

## History strategy (DD-51, DD-53, `18_TOKENIZER_AND_CONTEXT.md#history-strategy`)

Chat history is bounded to the budget by the configured strategy:

- **Sliding window (default).** Keep the most recent turns that fit the history allocation; drop the
  oldest. The current directive and scoped document are never dropped in favor of history.
- **Summarize (opt-in).** When history would overflow, replace older turns with a compact running summary
  so long conversations stay within budget while retaining gist. Summarization itself costs an inference
  and tokens (ADR-0009 consequences) — it is a non-default option; sliding-window is the zero-cost default.

**Trimming affects only what is sent to the model — never the visible transcript the user sees.** History
is per document/tab for the session and is not persisted across launches
(`16_CHAT_AND_AGENTIC_WORKFLOW.md#chat`, DD-44).

- **EC-LLM-21 — Over-budget history trimmed.** When accumulated chat history exceeds its budget
  allocation, it is trimmed by the configured strategy — **sliding window** (drop oldest turns first) or
  **summarize** — before the request is built; the **current turn and the directive are never trimmed
  away**, and trimming affects only what is sent to the model, never the visible transcript (DD-51).

The **max tool iterations** limit (default `8`) caps how many budgeted round-trips a single run may take
(DD-40; `16_CHAT_AND_AGENTIC_WORKFLOW.md#limits`) — each iteration re-runs `Assemble()`/`Trim()` against
the then-current history, so a long-running tool loop keeps re-budgeting rather than growing unbounded.
