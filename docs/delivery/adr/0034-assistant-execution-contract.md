# ADR-0034 — The assistant's execution contract: per-model capability, a single wall-clock budget, and a reply reserve that matches the scope

**Status:** accepted
**Date:** 2026-07-25
**Deciders:** project owner, architect
**Supersedes:** (none — narrows ADR-0007, ADR-0008 and ADR-0009 without replacing them)

> **Historical vocabulary — this record is not rewritten.** The `DD-…` and `EC-…` identifiers below cite the retired 78-entry design-decision registry, last present in git at `e1bd33f` under `specification/00_Foundation/` as `04_DESIGN_DECISIONS.md`; every one of those decisions now lives in the sentence of the feature file that needs it. Links into `_archive-2026-07-28-specification/` are the pre-conversion specification, kept so a citation still resolves, and **not normative**. See `README.md`. A decision record says what was decided against what was known then, so neither is translated forward.
> A link beginning `07_Phases/` names a retired phase document that was deleted rather than archived; that set is in git at `e1bd33f`.

## Context and problem statement

The assistant is specified as a bounded agentic tool-call loop against any OpenAI-compatible provider,
with a local provider as the default. A review against a shipped application built on exactly that
premise surfaced three assumptions in our specification that do not survive contact with local models.

**1. Tool-call support is treated as a property of the provider kind. It is a property of the model.**
`../../_archive-2026-07-28-specification/02_Architecture/08_LLM_INTEGRATION.md` puts `Capabilities` on `ProviderProfile`, which is keyed by
kind (`ollama`, `lmstudio`, `openai`, …). But one Ollama server on one port serves models that support
tool calling and models that do not, at the same time. A local-first user's installed model list is
mostly the second kind. With no clause covering it, the behaviour we would ship is: Ollama returns
HTTP 400 with a body about tools, nothing recognises it, it classifies as a generic upstream error
marked retryable, and the user gets four identical failures. On LM Studio and llama.cpp it is worse —
they frequently accept the request, **ignore the `tools` array**, and return prose. The loop sees no
tool calls and treats prose as the final answer, so the user is shown the model narrating what it
would like to read.

**2. The run has three independent bounds that multiply.** Retries, a per-attempt timeout and an
iteration cap are each specified separately: "a bounded attempt count" with no number, a per-attempt
timeout, and `maxIterations = 8`. Nothing composes them. At plausible defaults — 60-second timeout,
3 retries, 8 iterations — a single click on "Proofread" can occupy the gate for roughly half an hour
before any limit fires. `PHASE_11_AI_PROVIDER.md` lists the wall-clock ceiling as an unsettled question
with no default.

**3. A whole-document rewrite cannot fit in the specified reply reserve.** This is arithmetic, not
opinion. `18_TOKENIZER_AND_CONTEXT.md` checks `estimate(prompt) + margin + replyReserve ≤ contextWindow`
with a default reserve of 1024 tokens. Proofreading a document requires the model to emit the *entire
corrected document* as a `propose_edit` argument. A 5,000-token document passes the fit check and then
truncates at 1,024 tokens of output, producing a broken JSON argument, a schema-validation failure, and
a message telling the user "a tool call had invalid arguments" — which is true and useless.

## Decision drivers

- The default provider is local, so the default model is small. The design has to work there, not only
  against a frontier API.
- A failure the user can act on is worth far more than a correct-but-generic error.
- The gate holds one inference at a time; anything that can occupy it for half an hour is a bug.
- We would rather refuse a run up front than fail it halfway through.

## Considered options

- **A.** Require tool support; tell the user their model is unsuitable.
- **B.** Detect tool support per model, and fall back to a single-shot path when it is absent.
- **C.** Never use tool calls; make the assistant single-shot for everything.

## Decision outcome

Chosen: **B**, plus two bounds.

**Tool support is per model, probed and remembered.**

- `Capabilities` gains a per-model dimension. Whether a model supports tool calls is recorded against
  `(providerId, modelId)`, not against the provider kind.
- The provider settings gain a fourth verification alongside Test connection / Test models / Test
  inference: **Test tools** — send a one-tool schema and assert the response contains a tool call. It
  shares the gate exactly as Test inference does. This is the only way a user finds out before their
  first Proofread rather than during it.
- A new non-retryable error code, `tools_unsupported`, is recognised from the provider's response body.

**When tools are unavailable, the assistant degrades instead of failing.** A single-shot path — scope in,
edited text out, presented as the same reviewable proposal — is offered for every action whose output is
a rewrite of its scope. The user gets a working Proofread on a 3B model. Actions that genuinely need to
read other files are disabled, with the reason on the row. This path is not a fallback bolted on later;
it is how the assistant works on half the models its default provider will be pointed at.

**One wall-clock budget per run, and it wins.**

- Attempts are **`1 + maxRetries`**, stated once, in one place. Three retries means four attempts. This
  ambiguity has cost a real project a release cycle of dead code.
- Every attempt's deadline is `min(perAttemptTimeout, timeRemainingInRunBudget)`.
- The run budget pre-empts retries and iterations both; it is not a fourth independent limit sitting
  outside them.
- A retry neither consumes an iteration nor emits a new iteration progress event.
- Two further termination rules, because an iteration cap alone does not stop a small model: stop when
  the model requests the *same tool with the same arguments* twice in a row, and end the run on the
  second **consecutive** argument-validation failure. A single validation failure returns an error
  observation **with the schema echoed back** and consumes one iteration — for a small model, malformed
  arguments are the normal case, not an exception.

**The reply reserve follows the scope.** For any action whose expected output is a rewrite of its scope,
the fit check uses `max(replyReserve, estimate(scope) × 1.1)` rather than the flat reserve. The meter
refuses up front instead of truncating halfway. Proposals continue to carry full replacement text rather
than a patch — small models cannot produce a valid unified diff, and the app computes the diff itself —
so this is simply the budgeting admitting what that choice costs.

**`finish_reason` is used.** It is currently captured and never read, in our specification and in the
reference implementation both. `finish_reason == "length"` maps to a distinct, actionable code
(`output_truncated`) meaning "raise Max output tokens". It must never surface as `tool_failed` or as
`empty_completion`.

**`empty_completion` is not retryable.** It is currently marked retryable. On a reasoning model with a
low output cap, the cap is consumed entirely by hidden reasoning tokens before any visible output
begins — a deterministic configuration outcome. Retrying it three times spends three identical
inferences to produce the same nothing. Its message says what to change.

### Consequences

- Positive: the assistant works on the models a local-first user actually has installed.
- Positive: a run has one ceiling a person can reason about and set.
- Positive: the two most common failures — truncated output and an unsupported model — get messages that
  name the setting to change.
- Negative: two execution paths (tool loop and single-shot) instead of one. Both produce the same
  proposal object, so the surface they share is small, but it is two paths.
- Negative: capability is per `(providerId, modelId)`, which means the settings schema carries a
  per-model record rather than a single global one.
- Neutral: `Test tools` makes the provider tab four buttons instead of three.

## Pros and cons of the options

### Option A — require tool support
- Good: one execution path; the cleanest implementation.
- Bad: the assistant does not work on the default provider's most common models. "Install a different
  model" is not an acceptable answer from a local-first application.

### Option B — per-model detection with a single-shot fallback *(chosen)*
- Good: works everywhere; degrades on a known axis rather than an unknown one.
- Bad: two paths.

### Option C — never use tools
- Good: simplest of all; works on everything.
- Bad: gives up reading the workspace, which is the entire premise of "have a conversation about my
  notes". Correct for the rewrite actions, insufficient for the product.

## Links

- Design decisions: DD-38–DD-55, DD-76 (document text is data, never instruction)
- Narrows: ADR-0007 (provider abstraction), ADR-0008 (agentic tool-call loop),
  ADR-0009 (tokenizer and context budget)
- Spec clauses: ../../_archive-2026-07-28-specification/02_Architecture/08_LLM_INTEGRATION.md`,
  ../../_archive-2026-07-28-specification/01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md`,
  ../../_archive-2026-07-28-specification/01_Product/17_PROVIDERS_MODELS_SETTINGS.md`,
  ../../_archive-2026-07-28-specification/01_Product/18_TOKENIZER_AND_CONTEXT.md`
- Phases: `specification/07_Phases/PHASE_11_AI_PROVIDER.md` (Test tools, the wall-clock default),
  `specification/07_Phases/PHASE_12_ASSISTANT_REWRITES.md`,
  `specification/07_Phases/PHASE_13_CONVERSATION.md`
- Stories: not yet written.
