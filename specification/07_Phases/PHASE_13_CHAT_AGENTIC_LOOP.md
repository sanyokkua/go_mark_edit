**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester
**Last Updated:** 2026-07-14
**Cross-references:** `00_ROADMAP.md`, `../01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md`, `../01_Product/14_LLM_ASSISTANT_OVERVIEW.md`, `../02_Architecture/08_LLM_INTEGRATION.md`, `../00_Foundation/04_DESIGN_DECISIONS.md`, `../00_Foundation/06_IMPLEMENTATION_STAGES.md`, `../06_Process_and_Traceability/01_MODULE_INVENTORY.md`, `../06_Process_and_Traceability/06_DEFINITION_OF_DONE.md`

# Phase 13 — Chat & Agentic Tool Loop

## Goal

Turn the single-shot run of Phase 12 into a full agentic conversation: a **bounded multi-turn tool-call
loop** (hard iteration + time limits, cancellation checked each turn), the **workspace-file tools**
(`list_workspace_files`, `read_workspace_file`) gated by the Stage-1 asset allowlist and only when a
folder workspace is open, **streaming** assistant text into the transcript, robust **cancellation**, and a
**multi-turn chat UI** with free-text custom instructions. Chat history is kept per document/tab for the
session only. Least-privilege, read-mostly tools; the model never writes files (edits stay proposals).
Refines: `../01_Product/14_LLM_ASSISTANT_OVERVIEW.md#assistant-sidebar` (the Stage-3 umbrella).

## Depends on

- Phase 12 (single-shot orchestrator, action catalog, `read_document`/`read_selection`/`propose_edit`, sidebar shell, apply-as-diff — STORY-078..084).
- Phase 03 (folder workspace tree + `internal/workspace` — the source of allowlisted files the workspace tools read).
- Seams: F1 (sidebar slot), F5 (gate + DI), asset allowlist reuse (traversal-rejected, DD-41).

## Scope

- `internal/llm/agent` — generalise STORY-080's single call into a **bounded loop**: dispatch tool calls, append observations, re-prompt; stop at the iteration/time limit with a clear error; check cancellation each turn.
- `internal/llm/tools` — add `list_workspace_files` + `read_workspace_file`, allowlisted to the workspace root, traversal-rejected, **unavailable when no folder is open**.
- Provider **streaming** (`internal/llm/providers`) plumbed through agent events into the `run`/`chat` slices; non-streaming fallback.
- End-to-end **cancellation**: a Cancel control aborts within one iteration and releases the gate.
- `ui/widgets/assistant` chat: multi-turn transcript (messages, tool calls + observations, edit-proposal cards), composer, custom-instruction directive.
- `logic/store/assistant` `chat` slice: per document/tab session transcript.

## Out of scope

- The explicit context budgeter, over-context chunking, and history sliding-window / summarize trimming — Phase 14 (STORY-091..093). This phase keeps the whole transcript in the loop up to the model limit; trimming is a Phase-14 policy.
- Persistent chat history across launches — not in v1 (DD-44); session-only here, transcript export is Phase 14 (STORY-094).
- Any write tool / shell / arbitrary-filesystem tool — **deliberately never** (DD-41).

## Suggested stories / tasks

> Planned backlog for this phase. The `architect` generates the actual story files into `../docs/stories/` during implementation (one story per session), assigning the ids shown.


| Story id | Title | Est(S/M/L) | Modules | Spec clauses | depends_on |
|---|---|---|---|---|---|
| STORY-085 | Generalise the run into a bounded agentic tool-call loop with iteration/time limits and per-turn cancellation | L | `internal/llm/agent/`, `internal/llm/tools/`, `internal/gate/` | `01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md#agentic-loop`, `01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md#limits`, `01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md#cancellation`, `02_Architecture/08_LLM_INTEGRATION.md#agent-loop`, `02_Architecture/08_LLM_INTEGRATION.md#gate-and-cancellation` | STORY-080 |
| STORY-086 | Add the list_workspace_files and read_workspace_file tools, allowlisted to the workspace root and unavailable without a folder | M | `internal/llm/tools/`, `internal/workspace/`, `internal/assets/` | `01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md#tool-scope`, `01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md#tools`, `02_Architecture/08_LLM_INTEGRATION.md#tool-registry`, `00_Foundation/04_DESIGN_DECISIONS.md#11-llm-assistant-stage-3` | STORY-085, STORY-079 |
| STORY-087 | Stream assistant text from the provider through agent events into the transcript, with a non-streaming fallback | M | `internal/llm/providers/`, `internal/llm/agent/`, `logic/store/assistant/` | `01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md#streaming`, `02_Architecture/08_LLM_INTEGRATION.md#streaming`, `02_Architecture/08_LLM_INTEGRATION.md#events` | STORY-085 |
| STORY-088 | Wire end-to-end cancellation so a Cancel control aborts within one iteration and releases the gate | M | `internal/llm/agent/`, `logic/adapter/`, `logic/store/assistant/` | `01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md#cancellation`, `02_Architecture/08_LLM_INTEGRATION.md#gate-and-cancellation`, `01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md#limits` | STORY-085, STORY-081 |
| STORY-089 | Build the multi-turn chat UI (transcript, composer, custom-instruction directive) with a per-tab session slice | L | `ui/widgets/assistant/`, `logic/store/assistant/` | `01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md#chat`, `01_Product/14_LLM_ASSISTANT_OVERVIEW.md#modes-actions-chat`, `00_Foundation/04_DESIGN_DECISIONS.md#11-llm-assistant-stage-3` | STORY-085, STORY-082 |
| STORY-090 | Render tool calls and observations in the transcript and gate the workspace tools on folder-open state in the UI | M | `ui/widgets/assistant/`, `logic/store/assistant/`, `logic/llm/` | `01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md#tools`, `01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md#tool-scope`, `01_Product/14_LLM_ASSISTANT_OVERVIEW.md#assistant-sidebar` | STORY-089, STORY-086 |

## Edge cases

- **EC-LLM-1** — The loop reaches the iteration limit → it stops with a clear `limit-reached` error and no partial file write (STORY-085).
- **EC-LLM-5** — Cancel mid-run → aborts within one iteration, releases the gate, discards partial output (STORY-085/088).
- **EC-LLM-3** — The model emits malformed tool-call arguments → rejected as an error observation; the loop continues or ends gracefully, never crashes (STORY-085).
- **EC-LLM-2** — A tool call fails at runtime (file missing, read error, buffer unavailable) → a structured error observation is fed back and the loop continues, never crashing the run (STORY-085).
- **EC-LLM-14** — A workspace tool is asked for a path outside the allowlist / with traversal → rejected as an error observation (STORY-086).
- **EC-LLM-13** — A workspace tool is invoked with no folder open → reported unavailable; the tool is not offered in the UI (STORY-086/090).
- **EC-LLM-4** — A second run while one is in flight → `Busy` (single-flight gate) (STORY-085).
- **EC-LLM-20** — Streaming is interrupted mid-stream → the transcript finalises gracefully / falls back to non-streaming without a corrupt message (STORY-087).

## Phase exit checklist

Automated:

- [ ] The loop dispatches a tool call, appends its observation, and re-prompts; it stops at the configured iteration/time limit with a clear error (STORY-085, EC-LLM-1).
- [ ] Cancellation aborts within one iteration and releases the gate; a malformed tool call becomes an error observation without crashing (STORY-085/088, EC-LLM-5/3/2).
- [ ] `read_workspace_file` rejects out-of-allowlist / traversal paths and is unavailable with no folder open (STORY-086, EC-LLM-14/13).
- [ ] Streaming text appends incrementally to the transcript; an interrupted stream finalises cleanly (STORY-087, EC-LLM-20).
- [ ] Chat is multi-turn per tab with a custom-instruction directive; a second concurrent run reports `Busy` (STORY-089, EC-LLM-4).
- [ ] `just check` and `just trace-check` are green; bindings regenerated with no drift.

Manual:

- [ ] In `wails dev` with a folder open and a local provider: hold a multi-turn chat that reads another workspace file, proposes an edit, and applies it; Cancel mid-generation stops promptly.
- [ ] Network trace shows requests **only** to the configured provider endpoint and **only** on send.

DoD reference: `06_Process_and_Traceability/06_DEFINITION_OF_DONE.md`. Honours Stage-3 exit criteria
(`00_Foundation/06_IMPLEMENTATION_STAGES.md#5-stage-exit-criteria`) and the least-privilege tool rule
(DD-41). Contributes to Milestone **M3**.
