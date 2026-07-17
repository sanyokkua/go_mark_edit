# ADR-0008 — Drive the assistant with a bounded, agentic tool-call loop (not a fixed prompt or a rigid chain)

**Status:** accepted
**Date:** 2026-07-10
**Deciders:** project owner, architect

## Context and problem statement

The Stage-3 assistant does more than transform a single blob of text. To proofread, reformat, answer
questions, or act on a custom instruction it may need to read the current document or selection, and —
when a folder workspace is open — list and read other Markdown/text files under the workspace root, then
return a proposed edit as a reviewable diff (DD-39, DD-41, DD-42, DD-44). The amount of context it needs,
and how many steps it takes to gather that context, **varies per request**: a quick typo fix needs one
turn; "make this section consistent with the rest of the docs" may need several reads before proposing an
edit.

We must decide the control flow that governs these multi-step interactions. The design must be capable
enough to let the model gather context on demand, yet **safe**: an agentic loop that can call tools and
iterate is, without limits, a runaway risk (unbounded token spend, infinite tool loops, wall-clock hangs),
and the model's tool-call output must be treated as **untrusted input**, never as a trusted instruction to
execute. It must also respect the app-wide "one inference at a time" rule and be promptly cancellable.
This ADR records the loop design that `internal/llm/agent` and `internal/llm/tools` implement, and locks
DD-40, DD-41, DD-42, and DD-47.

## Decision drivers

- **Variable, request-dependent context needs.** Some requests need no reads, some need several; the flow
  must let the model decide what to read rather than hard-coding a fixed pipeline (DD-40, DD-44).
- **Runaway-agent safety.** An agentic loop must be *bounded* — hard iteration and wall-clock limits — so
  it can never spin indefinitely or spend unbounded tokens. This is a well-established requirement for
  tool-using agents.
- **Least-privilege, read-mostly tools.** The tool surface must expose only what's needed (document,
  selection, gated workspace listing/reading) and **no** arbitrary filesystem, shell, or network tools;
  the model **never writes files** (DD-41).
- **Untrusted tool arguments.** Model-produced tool-call arguments are untrusted; every call's args must
  be schema-validated before execution, and an out-of-contract call must fail closed, not be executed
  loosely (DD-41).
- **Edits are proposals, not writes.** The loop must not mutate the buffer or disk; an edit is a diff the
  user reviews and applies (DD-42; see ADR-0010).
- **One inference at a time, cancellable.** The loop must run under the process-wide single-flight gate
  and check cancellation each iteration and before each tool dispatch (DD-47).

## Considered options

- **Agentic, bounded, multi-turn tool-call loop** — build a message set, call the provider, dispatch any
  requested tool calls to a least-privilege registry, append observations, and iterate until the model
  returns final text or a hard limit is hit; cancellation checked each iteration and before each tool.
- **Fixed single-prompt templates** — one prompt per action, filled with the scoped document, sent once;
  the response *is* the result. No tools, no iteration.
- **Rigid predefined multi-step chain** — a hard-coded linear sequence of prompts (e.g. read → analyze →
  rewrite) executed the same way for every request.

## Decision outcome

Chosen: **an agentic, bounded, multi-turn tool-call loop.** `internal/llm/agent` builds the message set
(system prompt + tool schemas + scoped document/selection + trimmed history), calls
`provider.Chat(ctx, …)`, and:

- if the response has **no** tool calls, returns its text as the final outcome;
- if it has tool calls, dispatches each through the tool registry, appends the observations to the
  transcript, and **iterates**.

The loop is **bounded on both axes**: a configurable maximum iteration count and a wall-clock ceiling
(both in the AI Context settings tab, DD-53). Hitting either is a clean stop reported as `agent_limit`
when the model never converged on final text — never an unbounded spin. Tools are **least-privilege and
read-mostly** (DD-41): `read_document`, `read_selection`, `list_workspace_files` and `read_workspace_file`
(advertised only when a folder workspace is open, reusing the Stage-1 asset allowlist with traversal
rejection), and `propose_edit`. There is **no** arbitrary filesystem, shell, or network tool, and no tool
writes to disk.

Model output is treated as **untrusted input**: every tool call's arguments are validated against the
tool's JSON schema before invocation, and a malformed or out-of-contract call fails with `tool_failed`
(surfaced as an observation the loop can recover from, or a run-ending error if unrecoverable) — the model
is never allowed to drive an unchecked action. `propose_edit` **never mutates**; it computes and returns a
**diff** against the scoped content, and applying it is a separate, explicit user action on the frontend
(DD-42; ADR-0010). The whole run holds the process-wide single-flight gate (a second attempt yields
`busy`), and the loop checks `ctx.Err()` **each iteration and before each tool dispatch**, so cancellation
aborts promptly — between turns or mid-tool — and `OnShutdown` cancels any in-flight run (DD-47).

### Consequences

- Positive: The model gathers exactly the context a given request needs — one turn for a typo fix, several
  for a cross-file consistency pass — without a one-size pipeline (DD-40, DD-44).
- Positive: Hard iteration and wall-clock limits make runaway behavior structurally impossible; a
  non-converging run stops cleanly as `agent_limit` (DD-40).
- Positive: The least-privilege, read-mostly, write-never tool set plus schema-validated (untrusted)
  arguments bounds the blast radius of a misbehaving or adversarial model response (DD-41).
- Positive: Because edits are proposals routed through a diff-and-apply step, the loop can never surprise
  the user by changing their document; the human stays in the loop (DD-42).
- Positive: Single-flight + per-iteration cancellation keep resource use predictable and let the user stop
  a long run immediately (DD-47).
- Negative: A tool-call loop is materially more complex than a single prompt — message assembly, a tool
  registry, observation plumbing, limit accounting, and cancellation checks all have to be correct.
- Negative: Multiple turns can mean more total tokens and latency than a single shot for simple requests;
  the limits and the context budgeter (ADR-0009) exist partly to contain this.
- Neutral: Behavior depends on the model's tool-use competence; weaker local models may need more
  iterations or fall back to plain-text turns, which the bounded loop tolerates by design.

## Pros and cons of the options

### Option A — Agentic, bounded, multi-turn tool-call loop (chosen)

- Good: Handles variable context needs; safe by construction via hard limits, least-privilege tools, and
  untrusted-argument validation; edits stay proposals; fits the single-flight gate and cancellation model
  cleanly; extensible by adding a tool (a registry row), not new control flow.
- Bad: The most complex option to build and test; more tokens/latency for trivial requests; depends on
  model tool-use quality.

### Option B — Fixed single-prompt templates

- Good: Simple and predictable; one request/response; easy to reason about token cost; no loop to bound.
- Bad: Cannot gather context on demand — no way to read a selection then the whole doc, or consult another
  workspace file, within one request; forces the whole payload up front (worse context-fit); can't support
  multi-turn chat or custom-instruction workflows well (DD-40, DD-44). Rejected as too weak for the
  assistant's actual jobs.

### Option C — Rigid predefined multi-step chain

- Good: More capable than a single prompt; deterministic step order is easy to test.
- Bad: The fixed sequence is wrong for many requests — it runs steps that aren't needed and can't add one
  that is; brittle as actions grow; still doesn't let the *model* decide what context to fetch. Rejected as
  a rigid middle ground that keeps the chain's costs without the loop's adaptivity.

## Links

- Design decisions: **DD-40** (agentic, tool-call-based, bounded loop — not a single fixed prompt),
  **DD-41** (least-privilege, read-mostly tools; gated workspace access; model never writes files),
  **DD-42** (all edits are proposals the user reviews/applies), **DD-47** (single in-flight inference
  app-wide; per-iteration cancellation). Related: DD-44 (multi-turn chat + custom instructions), DD-48
  (retry/error classification), DD-53 (iteration/time limits configurable).
- Spec clauses: `00_Foundation/04_DESIGN_DECISIONS.md#11-llm-assistant-stage-3`,
  `02_Architecture/08_LLM_INTEGRATION.md#agent-loop`,
  `02_Architecture/08_LLM_INTEGRATION.md#tool-registry`,
  `02_Architecture/08_LLM_INTEGRATION.md#gate-and-cancellation`,
  `03_NonFunctional/03_SECURITY_AND_PRIVACY.md`.
- Stories: Phase 12 (single-shot agentic run, edit-proposal → diff) and Phase 13 (multi-turn chat,
  bounded tool-call loop, tools, streaming, cancellation) per `07_Phases/00_ROADMAP.md` (authored per
  phase; none `done` at ADR time).
