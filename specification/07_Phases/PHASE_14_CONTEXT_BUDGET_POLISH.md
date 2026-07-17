**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester
**Last Updated:** 2026-07-14
**Cross-references:** `00_ROADMAP.md`, `../01_Product/18_TOKENIZER_AND_CONTEXT.md`, `../01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md`, `../01_Product/17_PROVIDERS_MODELS_SETTINGS.md`, `../02_Architecture/08_LLM_INTEGRATION.md`, `../00_Foundation/04_DESIGN_DECISIONS.md`, `../00_Foundation/06_IMPLEMENTATION_STAGES.md`, `../06_Process_and_Traceability/01_MODULE_INVENTORY.md`, `../06_Process_and_Traceability/06_DEFINITION_OF_DONE.md`

# Phase 14 — Context Budgeting & Polish

## Goal

Make the assistant robust and predictable at the edges of the model's context window and finish the Stage-3
UX. This phase adds the **explicit context budgeter** (allocate the window across system prompt, tool
schemas, document/selection, and history), the **over-context warn/chunk** path for whole-document actions,
**history trimming** by sliding window (default) or summarization (setting), a session **run transcript**
(messages + tool calls + applied edits), and **provider/model UX + limits/safety hardening**. Completes
Stage 3 and Milestone M3.
Refines: `../01_Product/14_LLM_ASSISTANT_OVERVIEW.md#assistant-sidebar` (the Stage-3 umbrella).

## Depends on

- Phase 13 (bounded loop, chat, workspace tools, streaming, cancellation — STORY-085..090).
- Phase 11 (tokenizer + AI Context settings — STORY-073/077) which this phase's budgeter consumes.

## Scope

- `internal/llm/context` — the `Budget` allocator: split the window across system / tool schemas / document / history using the tokenizer, with reply reserve and safety margin.
- Over-context strategy: for a whole-document action that will not fit, **warn** (default) and offer **process a chunk / the selection**; chunking opt-in (DD-50).
- History strategy: `Trim` by **sliding window** (default) or **summarize** (setting); tool schemas + system prompts kept concise.
- Session **run transcript** view/export (messages, tool calls, applied edits) — local only, session-scoped.
- Provider/model UX polish: model picker refresh, params validation, clearer verify/error toasts, max-iteration surfacing.
- Limits/safety hardening: consistent `Busy`/limit/cancel error surfacing; guard rails around params and iterations.

## Out of scope

- Persistent cross-launch assistant history — not in v1 (transcript is session-only; DD-55 leaves persistence optional and local-only if ever added).
- New provider kinds beyond the six from Phase 11 — none planned in v1.
- Any change that restructures the Stage-1/2 Viewer/Editor contracts destructively (only additive; a required change is a new story + ADR).

## Suggested stories / tasks

> Planned backlog for this phase. The `architect` generates the actual story files into `../docs/stories/` during implementation (one story per session), assigning the ids shown.


| Story id | Title | Est(S/M/L) | Modules | Spec clauses | depends_on |
|---|---|---|---|---|---|
| STORY-091 | Implement the explicit context budgeter allocating the window across system, tools, document, and history | L | `internal/llm/context/`, `internal/llm/tokenizer/`, `internal/llm/agent/` | `01_Product/18_TOKENIZER_AND_CONTEXT.md#context-budget`, `01_Product/18_TOKENIZER_AND_CONTEXT.md#reply-reserve`, `02_Architecture/08_LLM_INTEGRATION.md#context-budgeter`, `00_Foundation/04_DESIGN_DECISIONS.md#11-llm-assistant-stage-3` | STORY-073, STORY-085 |
| STORY-092 | Add the over-context warn-and-chunk path for whole-document actions that will not fit the window | M | `internal/llm/context/`, `ui/widgets/assistant/`, `logic/llm/` | `01_Product/18_TOKENIZER_AND_CONTEXT.md#over-context-strategy`, `01_Product/18_TOKENIZER_AND_CONTEXT.md#fit-meter`, `02_Architecture/08_LLM_INTEGRATION.md#context-budgeter` | STORY-091 |
| STORY-093 | Add history trimming by sliding window (default) or summarization (setting) within the budget | M | `internal/llm/context/`, `internal/llm/agent/`, `logic/store/assistant/` | `01_Product/18_TOKENIZER_AND_CONTEXT.md#history-strategy`, `01_Product/18_TOKENIZER_AND_CONTEXT.md#context-budget`, `02_Architecture/08_LLM_INTEGRATION.md#context-budgeter` | STORY-091 |
| STORY-094 | Provide the session run transcript (messages, tool calls, applied edits) with local-only export | M | `ui/widgets/assistant/`, `logic/store/assistant/`, `logic/llm/` | `01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md#chat`, `01_Product/14_LLM_ASSISTANT_OVERVIEW.md#privacy-and-network`, `00_Foundation/04_DESIGN_DECISIONS.md#11-llm-assistant-stage-3` | STORY-089 |
| STORY-095 | Polish provider/model UX and harden limits and safety (Busy/limit/cancel surfacing, params validation) | M | `ui/widgets/assistant/`, `ui/widgets/settings/`, `internal/llm/agent/` | `01_Product/17_PROVIDERS_MODELS_SETTINGS.md#inference-params`, `01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md#limits`, `01_Product/14_LLM_ASSISTANT_OVERVIEW.md#privacy-and-network`, `02_Architecture/08_LLM_INTEGRATION.md#error-codes` | STORY-092, STORY-093, STORY-094 |

## Edge cases

- **EC-LLM-10** — A whole-document action over the window → the budgeter reports non-fit; the UI warns and offers chunk/selection; the reactive context-window error is the backstop (STORY-091/092).
- **EC-LLM-15** — Despite a green/amber estimate the provider rejects the request for length → the classified context-window error is surfaced with an offer to narrow scope or enable chunking, never a blind retry (STORY-092).
- **EC-LLM-21** — History exceeds the budget → trimmed by sliding window (or summarized per setting); oldest turns drop first; the current turn and directive are never trimmed away (STORY-093).
- **EC-LLM-20** — A stream is interrupted → the transcript still reflects a consistent final state (STORY-094).
- **EC-LLM-1** — Iteration-limit surfacing is clear and consistent with the Busy/cancel messaging (STORY-095).
- **EC-LLM-7** — A timeout during a long budgeted run surfaces as a `timeout` toast without corrupting the transcript (STORY-095).

## Phase exit checklist

Automated:

- [ ] The budgeter allocates the window (system + tools + document + history + reply reserve) and reports fit deterministically (STORY-091).
- [ ] A whole-document over-context action warns and offers chunk/selection; a chunked run stays within budget (STORY-092, EC-LLM-10).
- [ ] Over-budget history is trimmed by sliding window (default) / summarize (setting); the directive and current turn survive (STORY-093, EC-LLM-21).
- [ ] The session transcript records messages, tool calls, and applied edits and exports locally only (STORY-094).
- [ ] Busy / iteration-limit / cancel / timeout all surface through consistent toasts; params validation rejects out-of-range values (STORY-095, EC-LLM-1/7).
- [ ] `just check` and `just trace-check` are green; bindings regenerated with no drift.

Manual:

- [ ] In `wails dev`: run Proofread on a document larger than the model window → warned, choose a chunk/selection → completes; hold a long chat → old turns trim without losing the directive; open the transcript.
- [ ] Full Stage-3 exit walkthrough: configure a local provider; Proofread selection + whole document; apply a diff and save; multi-turn chat with a custom instruction; over-context warn fires; a network trace shows requests only to the configured endpoint and only on user action; telemetry/auto-update absent.

DoD reference: `06_Process_and_Traceability/06_DEFINITION_OF_DONE.md`. Completes the Stage-3 exit criteria
(`00_Foundation/06_IMPLEMENTATION_STAGES.md#5-stage-exit-criteria`). Contributes to Milestone **M3**.
