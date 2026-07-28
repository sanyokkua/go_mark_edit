**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester
**Last Updated:** 2026-07-10
**Cross-references:** `00_Foundation/04_DESIGN_DECISIONS.md` (DD-32, DD-40, DD-48, DD-50, DD-51, DD-52, DD-53), `01_Product/14_LLM_ASSISTANT_OVERVIEW.md`, `01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md`, `01_Product/17_PROVIDERS_MODELS_SETTINGS.md`, `mockups/gomarkedit-mockup.html`

# Tokenizer & Context

The assistant fits work into a model's context window **proactively** — it estimates token cost before
sending, warns before a whole-document action overflows, and allocates the window as an explicit budget
(DD-50, DD-51). Because true token counts vary per model, the app estimates **with a margin** and keeps
a reactive context-window error as the backstop. This document specifies estimation, the safety margin,
the reply reserve, the fit meter, the over-context strategy, the context budget, and the history
strategy — mirroring the **AI Context** settings tab in `mockups/gomarkedit-mockup.html`.

## Table of Contents

1. [Token estimation](#token-estimation)
2. [Safety margin](#safety-margin)
3. [Reply reserve](#reply-reserve)
4. [Fit meter](#fit-meter)
5. [The meter is load-bearing, not a nicety](#the-meter-is-load-bearing-not-a-nicety)
6. [Over-context strategy](#over-context-strategy)
7. [Context budget](#context-budget)
8. [History strategy](#history-strategy)

## Token estimation

The app estimates token count **offline** — no network, no model round-trip (DD-32, DD-50). The
estimator (mockup **AI Context** → "Token estimator") offers an embedded BPE-style estimate
(`tiktoken (cl100k) + margin` in the mockup) and a cheaper `chars ÷ 4` heuristic fallback. Estimation
runs whenever the scope or document changes so the fit meter is live
(`14_LLM_ASSISTANT_OVERVIEW.md#assistant-sidebar`).

**Estimate, not exact.** Different models tokenize the same text differently, so the app treats the
number as an **estimate** and never claims exactness (DD-50). This is why the margin (below) and the
reactive backstop exist rather than a single precise gate.

## Safety margin

A **configurable safety margin** is added on top of the raw estimate to absorb per-model tokenization
variance (DD-50; mockup default **15%**). The margin is applied before the fit decision, so a document
that estimates close to the limit is treated as over-context rather than optimistically sent. Raising
the margin makes the app more conservative (warns sooner); lowering it packs the window tighter at more
risk of a reactive overflow. The margin is set in **AI Context** settings (DD-53).

## Reply reserve

The app **reserves headroom for the model's response** (DD-50; mockup "Reserve for reply", default
`1024 tok`). The reply reserve is subtracted from the usable window before deciding what input fits, so
the model has room to answer or return an edit without truncation. The effective input budget is
`context length − reply reserve − margin`.

The reserve and **Max output tokens** are related but **not the same number**
(`17_PROVIDERS_MODELS_SETTINGS.md#inference-params`): the reserve is what the fit meter subtracts, and
`max_tokens` is the wire field that caps generation. `replyReserve ≤ maxOutputTokens < contextWindow`.

### For a full rewrite, the reserve follows the scope

**This is arithmetic, not a preference.** Proofread on a whole document requires the model to emit the
*entire corrected document* as the argument of an edit proposal. With the defaults above — an 8 192
window and a 1 024-token reserve — a 5 000-token document **passes the fit check** and then truncates at
1 024 tokens of output, producing a broken JSON argument, a schema-validation failure, and a user told
"a tool call had invalid arguments." Which is true, and useless.

So for any action whose expected output is a rewrite of its scope, the fit check is:

```
estimate(prompt) + margin + max(replyReserve, estimate(scope) × 1.1) ≤ contextWindow
```

The reserve rises to match what the model has to write back, and the meter **refuses up front** rather
than failing halfway through.

Proposals still carry full replacement text rather than a patch — small local models cannot produce a
valid unified diff, and the app computes the diff itself (`16_CHAT_AND_AGENTIC_WORKFLOW.md`). This
formula is simply the budget admitting what that choice costs (ADR-0034).

## Fit meter

The sidebar shows a live **token-fit meter** (the mockup's `.tokenmeter`): a bar plus a label such as
`≈ 1,480 tokens of document` and `fits · 8,192 ctx`. It recomputes when the scope toggles (the mockup
switches to `≈ 96 tokens of selection`) or the document changes.

The meter is a **three-state** signal against the model's context length (DD-50, DD-52):

- **Green — fits.** Estimate + margin + reply reserve is within the window; the label reads `fits`.
- **Amber — tight.** Near the limit (within the margin band); the run will proceed but the user is
  cautioned.
- **Red — over.** Estimate exceeds the usable window; a whole-document action triggers the over-context
  strategy below rather than silently sending.

The meter reads its ceiling from **Context length (num_ctx)** and its reserve from the reply reserve, so
changing either in settings updates the meter immediately.

## The meter is load-bearing, not a nicety

The fit meter is often described as the optimistic path, with the `context_window` error as the safety
net beneath it. **Against local providers that is backwards**, and it matters for how much care the
meter gets.

Live testing of a comparable application found that setting `contextWindow` to 200 000 against real
Ollama **succeeded**: the provider silently reloaded the model at its own 131 072 ceiling. The provider
clamped; the application never knew. Across a whole test matrix the worst observed outcome was a clean
timeout, and the reactive over-context test case had to be recorded as *skipped — not reachable with
the configured providers*.

So the reactive backstop mostly does not fire. What you get instead is a timeout, or a silently
truncated prompt and a plausible-looking but incomplete answer — which is worse than an error, because
nothing tells anyone it happened. **The proactive meter is the actual protection.**

## Over-context strategy

For a **whole-document** action whose estimate exceeds the usable window, the app applies the configured
over-context strategy (DD-50; mockup **AI Context** → "If document exceeds context", options **Warn** /
**Chunk**):

- **Warn (default).** The app **warns** and offers to **process the selection instead** or a single
  chunk, rather than sending an over-budget request. The user chooses; nothing is sent until they do.
- **Chunk — cut from v1.** *Decided 2026-07-25 (`07_Phases/PHASE_13_CONVERSATION.md`).* Nothing defines
  chunk boundaries, overlap size, ordering, or how conflicting overlaps reconcile into **one** reviewable
  edit — and the last of those is the hard part, because the product's central promise is that every
  change arrives as a single proposal you review before applying. Building it would mean inventing the
  specification.

  **Warn is therefore the only strategy in v1**, and the "If document exceeds context" control is not
  shipped: a segmented control with one option is not a choice. It returns if chunking is ever
  specified properly.

**Reactive backstop.** If an estimate is wrong and the provider returns a **context-window** error, that
error is the backstop: it is classified and surfaced through the standard error path, and the run does
not silently fail (DD-48, DD-50).

- **EC-LLM-10 — Over-context whole document.** A whole-document run whose estimate is red:
  the app blocks the send and presents the selection choice. It never sends a request known to exceed
  the window, and it never silently truncates one.
- **EC-LLM-15 — Reactive context-window overflow.** Despite a green/amber estimate, the provider rejects
  the request for length: the app reports the classified context-window error and offers to narrow the scope, rather than
  retrying the identical over-length request.

## Context budget

Context is an **explicit budget**, not an implicit "stuff everything in" (DD-51). Before each iteration
the loop allocates the usable window (context length − reply reserve − margin) across:

1. **System prompt** — the action/role framing (kept concise, DD-51).
2. **Tool schemas** — the tool descriptions, re-sent each call; kept **concise** because each one costs
   tokens on every iteration (DD-40, DD-51; `16_CHAT_AND_AGENTIC_WORKFLOW.md#tools`).
3. **Document / selection** — the scoped content, the largest and most important allocation.
4. **Chat history** — prior turns, trimmed to fit (see [History strategy](#history-strategy)).

**Placement.** The most important context — the directive and the scoped document — is placed at the
**start and end** of the prompt, where models attend most reliably; lower-priority history sits in the
middle and is the first to be trimmed. When allocations compete, the scoped content and current
directive win over older history; tool schemas and system prompt are fixed overhead the app keeps small.

## History strategy

Chat history is bounded to the budget by the configured strategy (DD-51; mockup **AI Context** → "Chat
history strategy", options **Sliding window** / **Summarize**):

- **Sliding window (default).** Keep the most recent turns that fit the history allocation and drop the
  oldest; the current directive and scoped document are never dropped in favour of history.
- **Summarize — cut from v1.** *Decided 2026-07-25.* Nothing defines the summary prompt, its output
  schema, how its own token cost is accounted for **while the gate is held**, or what happens when the
  summarising call itself fails. It is an inference inside an inference, and it is unspecified at every
  one of those points.

  **Sliding window is therefore the only strategy in v1**, and the "Chat history strategy" control is not
  shipped for the same reason as above.

- **EC-LLM-21 — Over-budget history trimmed.** When accumulated chat history exceeds its budget
  allocation, it is trimmed by the **sliding window** (drop oldest turns first) before the request is
  built; the **current turn and the directive are never trimmed
  away**, and trimming affects only what is sent to the model, never the visible transcript (DD-51).

History is per document/tab for the session and is not persisted across launches
(`16_CHAT_AND_AGENTIC_WORKFLOW.md#chat`, DD-44); trimming affects only what is sent to the model, never
what the user sees in the transcript. The **max tool iterations** limit (mockup default `8`) caps how
many budgeted round-trips a single run may take (DD-40; `16_CHAT_AND_AGENTIC_WORKFLOW.md#limits`).
