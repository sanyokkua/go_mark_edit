**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester
**Last Updated:** 2026-07-14
**Cross-references:** `00_ROADMAP.md`, `../01_Product/15_ACTIONS_LIBRARY.md`, `../01_Product/14_LLM_ASSISTANT_OVERVIEW.md`, `../01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md`, `../02_Architecture/08_LLM_INTEGRATION.md`, `../00_Foundation/04_DESIGN_DECISIONS.md`, `../00_Foundation/06_IMPLEMENTATION_STAGES.md`, `../06_Process_and_Traceability/01_MODULE_INVENTORY.md`, `../06_Process_and_Traceability/06_DEFINITION_OF_DONE.md`

# Phase 12 — Actions & Proofread/Reformat

## Goal

Deliver the first end-to-end assistant experience: a data-driven **action catalog** (Proofread,
Confluence/Wiki, Article, Q&A, Summarize, Improve clarity, Make formal/concise, plus a Custom-instruction
path), the **assistant sidebar shell** consuming the reserved F1 layout slot (header, scope control with a
live token-fit meter, quick-actions bar), a **single-shot agentic run** that gathers document/selection
context and returns an **edit proposal**, and the **edit-proposal → diff → apply** flow that writes the
change into the editor buffer through the F3/F7 document-command seam (reusing the F9 diff component).
Chat and workspace-file tools are Phase 13.
Refines: `../01_Product/14_LLM_ASSISTANT_OVERVIEW.md#assistant-sidebar` (the Stage-3 umbrella).

## Depends on

- Phase 11 (provider abstraction, verify, tokenizer, AI settings — STORY-070..077).
- Phase 05 (Format/Lint pipeline callable programmatically — F8 — and the reusable diff view — F9).
- Seams: F1 (three-region layout slot), F2 (document model + content/selection accessor), F3/F7 (document-command seam: get-selection / replace-range / replace-all).

## Scope

- `internal/llm/actions` — the action catalog as **data** (id, label, category, system prompt, directive, default scope); custom-instruction bypasses the catalog.
- `internal/llm/tools` — the minimal tool set for single-shot runs: `read_document`, `read_selection`, `propose_edit` (returns a diff; never writes a file). Document/selection reads come from the backend's canonical buffer in `internal/appmodel` (DD-62/DD-64; `../02_Architecture/08_LLM_INTEGRATION.md#tool-registry`) — never from the editor widget.
- `internal/llm/agent` — single-shot run orchestrator: build context, one provider call, tool dispatch, emit progress; acquires the single-flight gate; basic cancellation.
- Agent handler + Wails binding + adapter + `run` slice (progress/stream event subscription).
- `ui/widgets/assistant` sidebar shell: provider/model header, apply-to scope control (Whole document / Selection) + token-fit meter, quick-actions bar.
- Scope resolution (`logic/llm`): selection default when text is selected, else whole document; per-action override.
- Edit-proposal card: render the returned diff (F9), **Apply** (via F3/F7 replace-range / replace-all), review hunks, discard.

## Out of scope

- Multi-turn chat, the bounded multi-iteration loop, and workspace-file tools — Phase 13 (STORY-085+).
- Streaming assistant text into a transcript — Phase 13 (STORY-087).
- Explicit context budgeter + over-context chunking + history trimming — Phase 14.
- Persistent run history across launches — Phase 14 (transcript is session-only, STORY-094).

## Suggested stories / tasks

> Planned backlog for this phase. The `architect` generates the actual story files into `../docs/stories/` during implementation (one story per session), assigning the ids shown.


| Story id | Title | Est(S/M/L) | Modules | Spec clauses | depends_on |
|---|---|---|---|---|---|
| STORY-078 | Define the action catalog as data (Proofread, Confluence/Wiki, Article, Q&A, Summarize, …) with a custom-instruction path | M | `internal/llm/actions/` | `01_Product/15_ACTIONS_LIBRARY.md#action-model`, `01_Product/15_ACTIONS_LIBRARY.md#proofread`, `01_Product/15_ACTIONS_LIBRARY.md#reformat-targets`, `01_Product/15_ACTIONS_LIBRARY.md#confluence-wiki`, `01_Product/15_ACTIONS_LIBRARY.md#article`, `01_Product/15_ACTIONS_LIBRARY.md#qa`, `01_Product/15_ACTIONS_LIBRARY.md#other-actions`, `01_Product/15_ACTIONS_LIBRARY.md#custom-instruction`, `01_Product/15_ACTIONS_LIBRARY.md#extensibility`, `00_Foundation/04_DESIGN_DECISIONS.md#11-llm-assistant-stage-3` | STORY-070 |
| STORY-079 | Implement the read_document, read_selection, and propose_edit tools (propose_edit returns a diff, never writes) | M | `internal/llm/tools/`, `internal/appmodel/` | `01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md#tools`, `01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md#edit-proposals`, `02_Architecture/08_LLM_INTEGRATION.md#tool-registry`, `00_Foundation/04_DESIGN_DECISIONS.md#14-application-state-ownership`, `00_Foundation/04_DESIGN_DECISIONS.md#11-llm-assistant-stage-3` | STORY-070, STORY-101 |
| STORY-080 | Implement the single-shot agentic run orchestrator (context build, one call, tool dispatch, gate, cancellation) | L | `internal/llm/agent/`, `internal/llm/providers/`, `internal/gate/` | `01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md#agentic-loop`, `02_Architecture/08_LLM_INTEGRATION.md#agent-loop`, `02_Architecture/08_LLM_INTEGRATION.md#gate-and-cancellation` | STORY-078, STORY-079, STORY-074 |
| STORY-081 | Bind the agent handler and stream progress/run events into the run slice through the adapter | M | `internal/application/`, `logic/adapter/`, `logic/store/assistant/` | `02_Architecture/08_LLM_INTEGRATION.md#events`, `02_Architecture/08_LLM_INTEGRATION.md#agent-loop`, `01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md#agentic-loop` | STORY-080 |
| STORY-082 | Build the assistant sidebar shell in the reserved F1 slot: header, scope control, token-fit meter, quick-actions bar | L | `ui/widgets/assistant/`, `logic/store/assistant/`, `logic/llm/` | `01_Product/14_LLM_ASSISTANT_OVERVIEW.md#assistant-sidebar`, `01_Product/14_LLM_ASSISTANT_OVERVIEW.md#modes-actions-chat`, `01_Product/18_TOKENIZER_AND_CONTEXT.md#fit-meter`, `00_Foundation/06_IMPLEMENTATION_STAGES.md#3-forward-compatibility-constraints-per-stage` | STORY-081, STORY-073 |
| STORY-083 | Resolve action scope (selection vs whole document) and drive the live token-fit meter through the F2 accessor | M | `logic/llm/`, `ui/widgets/assistant/` | `01_Product/14_LLM_ASSISTANT_OVERVIEW.md#scope-selection-vs-document`, `01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md#tool-scope`, `01_Product/18_TOKENIZER_AND_CONTEXT.md#fit-meter` | STORY-082 |
| STORY-084 | Render the edit proposal as a diff and apply it into the editor buffer through the F3/F7 command seam | L | `ui/widgets/assistant/`, `ui/components/`, `logic/llm/` | `01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md#apply-and-diff`, `01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md#edit-proposals`, `02_Architecture/08_LLM_INTEGRATION.md#forward-compat-seams`, `00_Foundation/04_DESIGN_DECISIONS.md#11-llm-assistant-stage-3` | STORY-083, STORY-081 |

## Edge cases

- **EC-LLM-4** — A second action run while one inference is in flight → `Busy` error via the single-flight gate; the sidebar disables Run (STORY-080/082).
- **EC-LLM-22** — A selection-scoped `propose_edit` replaces **only** the selected range on Apply; nothing is written to disk until save/autosave (STORY-079/084).
- **EC-LLM-5** — Cancel during a single-shot run aborts within the run, releases the gate, and discards partial output (STORY-080).
- **EC-LLM-10** — A whole-document action that will not fit the context window → the fit meter warns before Run; the reactive context-window error remains the backstop (STORY-083; chunking is Phase 14).
- **EC-LLM-9** — No models discovered / none selected (provider unconfigured) → Run is disabled with a "configure a provider" hint pointing to the AI / Providers tab (STORY-082).
- **EC-LLM-11** — Scope is **Selection** but the selection is empty/cleared → the run falls back to **Whole document** and the scope control and token meter reflect the change (STORY-083).
- **EC-LLM-17** — An empty custom instruction is a no-op: the composer send is disabled until non-blank and a whitespace-only submission is ignored rather than starting a run (STORY-078).
- **EC-LLM-12** — The model claims an edit but `propose_edit` returns empty/unparsable content → the assistant message is shown without a card, noting no applicable edit, rather than an empty diff (STORY-079/084).
- **EC-LLM-6** — The buffer changed between proposal and Apply → the proposal is marked **stale** and offered for re-run or hunk-review apply, never blindly overwritten (STORY-084).
- **EC-LLM-16** — Editing the provider/model while a run is in flight applies to the **next** run; the in-flight run keeps its recorded provider/model snapshot (STORY-080).

## Phase exit checklist

Automated:

- [ ] The action catalog resolves each action to its (system prompt, directive, default scope); custom-instruction seeds the directive from user text (STORY-078).
- [ ] `propose_edit` returns a structured diff and writes no file; `read_document`/`read_selection` return the F2 content/selection (STORY-079, EC-LLM-22).
- [ ] A single-shot run acquires the gate, emits progress events, and produces one edit proposal; cancel aborts within the run (STORY-080, EC-LLM-4/5).
- [ ] Applying a selection-scoped proposal replaces only the selected range via the F3/F7 seam and marks the buffer dirty (STORY-084, EC-LLM-22).
- [ ] The token-fit meter updates live as scope changes and warns on over-context (STORY-083, EC-LLM-10).
- [ ] `just check` and `just trace-check` are green; bindings regenerated with no drift.

Manual:

- [ ] In `wails dev` with a local provider: run **Proofread** on a selection and on the whole document; review the diff; Apply; save — formatting/meaning preserved, only the intended range changed.
- [ ] The sidebar occupies the reserved right region without restructuring the Stage-1/2 shell (F1).

DoD reference: `06_Process_and_Traceability/06_DEFINITION_OF_DONE.md`. Honours Stage-3 exit criteria
(`00_Foundation/06_IMPLEMENTATION_STAGES.md#5-stage-exit-criteria`) and seams F1/F2/F3/F7/F8/F9.
Contributes to Milestone **M3**.
