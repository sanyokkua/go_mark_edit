---
name: agentic-tool-loop
description: >
  Use when building or adjusting the Stage-3 agent loop, its five tools, run cancellation, the
  single-flight gate, agent event emission, or the edit-proposal (diff) apply path. Triggers: RunAgent,
  AgentHandler, tool registry, read_document, read_selection, list_workspace_files, read_workspace_file,
  propose_edit, JSON-schema arg validation, iteration/wall-clock limit, agent_limit, cancelled, busy,
  gate defer release, agent:progress/token/done/error, replace-range/replace-all, DiffView (F9). Stage-3
  only; additive; a hand-written Go loop over an OpenAI-compatible endpoint (no agent framework).
allowed-tools: Read, Edit, Write, Bash, Glob, Grep
references:
  - references/handler-and-loop.md
  - references/tools-registry.md
  - references/events-and-errors.md
  - references/troubleshooting.md
---

# Agentic Tool Loop

`internal/llm/agent/` is the bounded, multi-turn tool-call orchestrator. `RunAgent` builds messages,
calls the provider, dispatches any tool calls to the registry, appends observations, and iterates until
final text or a hard limit — checking cancellation each iteration, holding the single-flight gate, and
emitting `runId`-carrying events. Edits are always **proposals** (a diff), never disk writes.

## When to use

- Implementing/adjusting `AgentHandler.RunAgent`, the loop, limits, or cancellation.
- Adding/adjusting a tool in `internal/llm/tools/`, its JSON schema, or argument validation.
- Wiring agent events, the run slice, or the edit-proposal → DiffView → apply path.

## When NOT to use

- Provider client, discovery, retry/error mapping, secrets → use `llm-provider-integration`.
- Token estimation, fit meter, context budget, history trimming → use `context-and-tokenizer`.
- Anything in Stages 1–2. The loop is **Stage-3 only** and **additive**: it **consumes** the F2 content
  accessor, the F3/F7 document-command seam, the F5 gate, the F8 Format transform, and the F9 DiffView.
  It restructures none of them — a required change to an earlier contract is a new story (+ ADR).

## Source of truth

- `specification/02_Architecture/08_LLM_INTEGRATION.md` — *Agent loop*, *Tool registry*, *Streaming*,
  *Gate and cancellation*, *Events*, *Error codes*, *Forward-compat seams*.
- `specification/01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md` — `#agentic-loop`, `#tools`, `#tool-scope`,
  `#edit-proposals`, `#apply-and-diff`, `#cancellation`, `#streaming`, `#limits` (EC-LLM-1..7, 12–14).
- `specification/01_Product/14_LLM_ASSISTANT_OVERVIEW.md`, `15_ACTIONS_LIBRARY.md` (actions seed the loop).
- `specification/00_Foundation/04_DESIGN_DECISIONS.md` — DD-40, DD-41, DD-42, DD-43, DD-44, DD-47, DD-49, DD-55.
- `specification/08_Decisions/0008-agentic-tool-call-loop.md` (ADR-0008);
  `0010-assistant-sidebar-apply-edit.md` (ADR-0010).
- `specification/06_Process_and_Traceability/01_MODULE_INVENTORY.md` — the only valid module paths.
- Rules: `.Codex/rules/llm-integration.md`, `offline-and-privacy.md`, `go-error-envelope.md`.

## Workflow

1. **Orient.** Read the *Agent loop / Tool registry / Gate and cancellation / Events / Forward-compat*
   sections of `08_LLM_INTEGRATION.md`, all of `16_CHAT_AND_AGENTIC_WORKFLOW.md`, the cited DDs, and
   ADR-0008/0010 (see Source of truth above).
2. **Handler + gate.** Keep `RunAgent` a bound envelope — returns `apperr.RunResult`, no `context.Context`
   param, panic-guarded — and `TryAcquire`/`defer Release` the single-flight gate. Full code and contract:
   `references/handler-and-loop.md`.
3. **Loop.** Implement/adjust the bounded loop: per-iteration + pre-tool-dispatch cancellation checks,
   iteration + wall-clock ceilings, per-turn tool dispatch, `lastProposal` capture, `agent_limit` vs
   `cancelled` stop reasons. Full code and contract: `references/handler-and-loop.md`.
4. **Tools.** Add/adjust tools in `internal/llm/tools/` with JSON-schema arg validation and
   least-privilege sources — document/selection reads come from the `internal/appmodel` canonical
   buffer (DD-62/DD-64), never the frontend editor; gate the two workspace tools on an open folder + the Stage-1 asset allowlist
   with traversal rejection. Table, Dispatch code, and gating rules: `references/tools-registry.md`.
5. **Apply path.** Route Apply through the F3/F7 command seam (`replace-range` / `replace-all`) and render
   diffs via the F9 DiffView; never touch the editor widget directly; optional Format-after-apply via F8;
   flag stale proposals instead of force-applying. Details: `references/tools-registry.md`.
6. **Events + errors.** Emit the four `runId`-carrying events, wire the adapter `EventsOn` subscription into
   the `run` slice, keep a non-streaming fallback, and map every stop outcome to its fixed `ErrorCode`.
   Table, payloads, and mapping: `references/events-and-errors.md`.
7. **Verify.** Run `just gen` after any bound-signature change; run `just check`; confirm **zero
   `wailsjs/` drift**. Before finishing, walk `references/troubleshooting.md` against your change.

## Reference Index

| Reference file | Load when |
|---|---|
| `references/handler-and-loop.md` | Writing/reviewing `RunAgent` (handler or service loop), the gate contract, iteration/wall-clock limits, or cancellation checks. |
| `references/tools-registry.md` | Adding/adjusting a tool, its JSON schema, workspace-tool gating, or the edit-proposal apply path (F3/F7 seam, F9 DiffView, F8 Format). |
| `references/events-and-errors.md` | Wiring `agent:*` events, the adapter/`run`-slice subscription, streaming vs non-streaming, or the outcome → `ErrorCode` mapping. |
| `references/troubleshooting.md` | Before finishing any change — common mistakes checklist plus the EC-LLM edge-case index. |

## Mandatory validation

- [ ] Loop is bounded (iteration + wall-clock) and checks cancellation each iteration and before each tool.
- [ ] Gate acquired for the run; held → `busy`; released in `defer`; `OnShutdown` cancels in-flight runs.
- [ ] Only the five tools; args schema-validated; workspace tools gated on an open folder + allowlisted +
      traversal-rejected; model never writes files.
- [ ] `read_document`/`read_selection` read the backend's canonical `internal/appmodel` buffer (flushed on
      blur/switch/close/save), never the frontend editor (DD-62/DD-64).
- [ ] `propose_edit` returns a diff; apply goes through F3/F7 seam + F9 DiffView; optional F8 Format-after-apply.
- [ ] Scope defaults correct (selection vs whole document); selection apply replaces only the range; stale
      proposals flagged, not force-applied.
- [ ] Events (`progress/token/done/error`) carry `runId`; streaming falls back to non-streaming cleanly.
- [ ] `RunAgent` is a proper envelope; `just gen` run; `just check` passes; no `wailsjs/` drift.

## Gotchas

- Forgetting the gate `defer` release on an error/cancel path deadlocks the app on the next run.
- An unbounded loop or a missing per-iteration cancel check lets a run become runaway instead of stopping
  at `agent_limit` or cancelling promptly.
- Trusting model tool-args without JSON-schema validation — model output is untrusted input.
- Full mistake list and the EC-LLM edge-case index: `references/troubleshooting.md`.

## Spec references

- `specification/02_Architecture/08_LLM_INTEGRATION.md` (Agent loop, Tool registry, Streaming, Gate and
  cancellation, Events, Error codes, Forward-compat seams)
- `specification/01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md`; `14_LLM_ASSISTANT_OVERVIEW.md`;
  `15_ACTIONS_LIBRARY.md`
- `specification/00_Foundation/04_DESIGN_DECISIONS.md` (DD-40–DD-44, DD-47, DD-49, DD-55);
  `06_IMPLEMENTATION_STAGES.md` (F1–F9 seams)
- `specification/08_Decisions/0008-agentic-tool-call-loop.md`, `0010-assistant-sidebar-apply-edit.md`
- `specification/06_Process_and_Traceability/01_MODULE_INVENTORY.md` (`internal/llm/agent/`,
  `internal/llm/tools/`, `internal/gate/`, `internal/apperr/`, `logic/store/assistant/`, `logic/adapter/`)
- Rules: `.Codex/rules/llm-integration.md`, `offline-and-privacy.md`, `go-error-envelope.md`
