# ADR-0009 — Offline token estimation with an explicit context budget (warn/chunk over-context)

**Status:** accepted
**Date:** 2026-07-10
**Deciders:** project owner, architect

## Context and problem statement

Every LLM request must fit inside the selected model's **context window**, which has to hold the system
prompt, the tool schemas, the scoped document or selection, the running chat history, **and** enough
reserved room for the model's reply. A whole-document proofread of a large Markdown file can easily exceed
that window. If GoMarkEdit only discovers this reactively — by sending the request and getting a
context-overflow error back — the user wastes a round-trip (and, on a remote provider, tokens and money)
and gets a confusing failure instead of guidance.

We therefore need a **proactive** fit check and an explicit plan for allocating the window, done
**offline** (GoMarkEdit performs no network call to count tokens — that would violate the
no-background-network invariant, ADR-0011). The hard part is that exact token counts differ per model and
provider: a default install may point at any of several local models, each with its own tokenizer, so
bundling and running the exact tokenizer for whichever model the user picked is impractical across the
matrix of supported back-ends. This ADR records the tokenizer + context-budgeter design that
`internal/llm/tokenizer` and `internal/llm/context` implement, and locks DD-50 and DD-51.

## Decision drivers

- **Fit must be checked before sending**, not only discovered on failure, so the UI can warn and offer a
  smaller scope up front (DD-50).
- **Offline only.** Token estimation must never make a network call; it runs entirely on-device
  (DD-50; ADR-0011).
- **Per-model token variance.** Exact counts differ per model/provider; an install can target many local
  models, so a single exact tokenizer per model is impractical to bundle and keep correct across all of
  them.
- **The window is a shared, prioritized resource.** System prompt, tool schemas, scoped content, and
  history all compete for it; over-budget history must be trimmed predictably, and the document is the
  primary payload (DD-51).
- **Room for the reply.** The model needs reserved headroom to answer; the prompt cannot consume the whole
  window (DD-50, DD-52).
- **A reactive backstop is still required** for the case where the estimate under-counts and the provider
  rejects the request at inference time (DD-50).

## Considered options

- **Offline estimate + safety margin + reply reserve, with an explicit budget** — a fast on-device
  estimator produces an approximate prompt-token count; a configurable safety-margin percentage and a
  reply reserve are added/held back; the budgeter allocates the window across system/tools/document/history
  and trims history; over-context drives a warn / chunk-or-selection offer; the provider's context-window
  error is the backstop.
- **Exact per-model tokenizer bundled per model** — ship and run the precise tokenizer for the selected
  model to get an exact count.
- **No proactive counting (reactive only)** — send the request and rely solely on the provider's
  context-window error to detect overflow.

## Decision outcome

Chosen: **an offline estimator plus a configurable safety margin and reply reserve, feeding an explicit
context budget.** `internal/llm/tokenizer` exposes `Estimate(text) int` (an embedded BPE/heuristic
estimator, no network) and a fit check `estimate(prompt) + safetyMargin + replyReserve ≤ contextWindow`.
The estimate is deliberately **approximate**: because real tokenization varies per model/provider, a
configurable **safety-margin** percentage is applied on top of the raw estimate, and a **reply reserve**
is held back so the model has room to answer.

`internal/llm/context` treats the window as an **explicit budget** allocated before each run, in priority
order: (1) system prompt, (2) tool schemas — only those valid for the current scope, (3) the scoped
document/selection (the primary payload), (4) chat history (the trimmable remainder). The reply reserve
and safety margin are subtracted from the window before allocation. **Over-budget history** is trimmed by
**sliding window** (default — drop oldest turns) or **summarization** (a setting that replaces older turns
with a compact summary), favoring **primacy and recency** (keep the system prompt and the most recent
turns; trim the middle first). System prompts and tool schemas are authored tersely so they cost little.

The tokenizer's fit result drives the sidebar **fit meter**: before a whole-document action the app shows
whether the scoped content fits and, when it does not, **warns** and offers to **process a chunk or the
selection** (default: warn; chunking is opt-in in v1). If even the scoped document alone will not fit after
trimming all history, the budgeter surfaces that to the fit check, which drives the same warning. The
provider's reactive `context_window` error remains the **backstop** for when the offline estimate
under-counts. Estimator choice, safety margin, reply reserve, over-context strategy, and history strategy
are all configurable in the AI Context settings tab (DD-53).

### Consequences

- Positive: The user is warned **before** a doomed request, with a concrete smaller-scope offer, instead
  of hitting a confusing overflow error mid-run (DD-50).
- Positive: Fully offline — no network round-trip to count tokens, preserving the no-background-network
  invariant (DD-50; ADR-0011).
- Positive: One estimator works across all supported models; the safety margin absorbs per-model variance
  without needing an exact tokenizer per model (DD-50).
- Positive: The explicit budget makes window allocation predictable and tunable; history trimming has a
  clear, documented policy (sliding window / summarization) rather than ad-hoc truncation (DD-51).
- Negative: An estimate is approximate — it can under-count (relying on the reactive backstop) or
  over-count (warning on content that would actually have fit), and the safety margin trades one against
  the other. Tuning the margin is an inexact compromise.
- Negative: The budgeter and its trim policy add real code and configuration surface (several AI-Context
  settings) that must be tested against edge cases (empty history, oversized single document, tiny
  windows).
- Neutral: Summarization-based trimming itself costs an inference and tokens; it is a non-default option,
  and sliding-window is the zero-cost default.

## Pros and cons of the options

### Option A — Offline estimate + margin + reply reserve + explicit budget (chosen)

- Good: Proactive and offline; model-agnostic; predictable, tunable window allocation and history trimming;
  drives a clear UI fit meter and chunk/selection offer; keeps the reactive provider error as a backstop.
- Bad: Estimate is inherently approximate; margin tuning is a compromise; adds budgeter code and several
  settings to maintain and test.

### Option B — Exact per-model tokenizer bundled per model

- Good: Exact counts, no margin guesswork, no false warnings.
- Bad: Impractical across the many supported local/remote models — each has its own tokenizer to bundle,
  version, and keep correct; bloats the app and still can't cover a model the app has never seen; brittle
  as users point at arbitrary OpenAI-compatible endpoints. Rejected as unmaintainable for a model-agnostic,
  local-first app.

### Option C — No proactive counting (reactive only)

- Good: Zero estimation code; always "accurate" because the provider is the judge.
- Bad: Every over-context request is a wasted round-trip (and tokens/cost on remote providers) ending in a
  confusing error with no guidance; no fit meter, no pre-emptive smaller-scope offer; poor UX for exactly
  the large-document case the assistant most needs to handle well (DD-50). Rejected as user-hostile;
  retained only as the **backstop** layer beneath Option A.

## Links

- Design decisions: **DD-50** (proactive tokenization / context fit: offline estimator + safety margin +
  reply reserve; warn + chunk/selection on over-context; reactive context-window error as backstop),
  **DD-51** (context is an explicit budget across system/tools/document/history; sliding-window default or
  summarization). Related: DD-52 (configurable context length / max output tokens), DD-53 (AI Context
  settings tab), DD-43 (selection vs. whole-document scope).
- Spec clauses: `00_Foundation/04_DESIGN_DECISIONS.md#11-llm-assistant-stage-3`,
  `02_Architecture/08_LLM_INTEGRATION.md#context-budgeter`,
  `02_Architecture/08_LLM_INTEGRATION.md#tokenizer`,
  `03_NonFunctional/04_OFFLINE.md`.
- Stories: Phase 09 (tokenizer + fit estimate) and Phase 11 (explicit context budget, over-context
  warn/chunk, history sliding-window/summarize) per `07_Phases/00_ROADMAP.md` (authored per phase; none
  `done` at ADR time).
