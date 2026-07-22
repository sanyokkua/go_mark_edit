**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester, reviewer
**Last Updated:** 2026-07-21
**Cross-references:** `00_ROADMAP.md`, `../01_Product/14_LLM_ASSISTANT_OVERVIEW.md`, `../01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md`, `../02_Architecture/08_LLM_INTEGRATION.md`, `../03_NonFunctional/03_SECURITY_AND_PRIVACY.md`, `../08_Decisions/0008-agentic-tool-call-loop.md`, `../08_Decisions/0011-network-policy-llm-exception.md`, `../06_Process_and_Traceability/07_PHASE_FORMAT.md`

# Phase 13 — Chat & Agentic Tool Loop

## Goal

Extend the action execution path into a bounded, cancellable, multi-turn conversation with validated least-privilege workspace tools, correlated progress/stream events, and one coherent per-document session transcript.

## Phase metadata

| Phase | Kind | Stage / milestone | Depends on | Completion scope |
|---|---|---|---|---|
| PH13 | sequential | Stage 3 / M3 conversation and tools | PH02, PH03, PH09, PH10, PH11, PH12 | once per loop/tool/stream/session protocol revision |

## Scope

- One bounded action/chat/custom-instruction tool-call loop with iteration and wall-clock limits.
- Five fixed tools, JSON-schema validation, bounded structured observations, and the resolved PH09/workspace authorization contract.
- Backend-owned per-document/tab in-memory session history and transcript lifecycle, projected into Redux and discarded when the backend tab/session ends.
- Provider streaming where supported, non-streaming operation, run-correlated events, and explicit cancellation.
- Composer/context/tool rows and edit-proposal cards using the PH12 proposal/application path.

## Out of scope

- Explicit context allocation, over-context chunk orchestration, and history trimming/summarization, owned by PH14.
- Persistent cross-launch history or remote transcript storage.
- Arbitrary filesystem, shell, process, network, or direct-write tools.

## Requirement ledger

| ID | Required outcome | Source clauses | Constraints | Work package |
|---|---|---|---|---|
| PH13-R01 | The PH12 run engine supports multi-turn Action-to-tool-to-observation iterations, stops on final text/proposal or hard iteration/wall-clock limits, and checks cancellation before each provider/tool boundary. | `01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md#agentic-loop`; `01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md#limits`; `02_Architecture/08_LLM_INTEGRATION.md#agent-loop`; `08_Decisions/0008-agentic-tool-call-loop.md#decision-outcome` | DD-40; DD-47; default max 8; one execution path for all modes | PH13-W01 |
| PH13-R02 | Tool registry exposes exactly `read_document`, `read_selection`, `list_workspace_files`, `read_workspace_file`, and `propose_edit`; every model argument is schema-validated before dispatch and failures become structured observations. | `01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md#tools`; `01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md#tool-scope`; `02_Architecture/08_LLM_INTEGRATION.md#tool-registry` | DD-41; no arbitrary capability; model output untrusted | PH13-W02 |
| PH13-R03 | Workspace tools are advertised only with an open workspace, list/read only authorized Markdown/text, reject relative/absolute/symlink escapes before I/O, and bound listing/read output by explicit count/byte/token/truncation rules. | `01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md#tool-scope`; `03_NonFunctional/03_SECURITY_AND_PRIVACY.md#9-llm-data-flow-and-privacy`; `01_Product/09_ASSETS_AND_SECURITY.md#allowlist`; `01_Product/09_ASSETS_AND_SECURITY.md#path-traversal` | DD-41; root semantics blocked by PH13-X02; output limits blocked by PH13-X03; no absolute path leakage | PH13-W03 |
| PH13-R04 | The backend owns one canonical in-memory chat/action/custom-instruction session per document, including user/assistant turns, tool calls/observations, proposals, apply/discard states, and terminal status; Redux is a derived projection, tab switch isolates sessions, and acknowledged backend tab close disposes the canonical session. | `01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md#chat`; `01_Product/14_LLM_ASSISTANT_OVERVIEW.md#modes-actions-chat`; `02_Architecture/08_LLM_INTEGRATION.md#persistence` | DD-44; DD-55; DD-62–64 ownership; memory-only; no launch persistence | PH13-W04 |
| PH13-R05 | Provider streaming emits correlated assistant-text deltas where supported and non-streaming providers produce the same final correctness/proposal semantics. | `01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md#streaming`; `02_Architecture/08_LLM_INTEGRATION.md#streaming` | DD-49; streaming never required for correctness; recovery blocked by PH13-X01 | PH13-W05 |
| PH13-R06 | Cancel and shutdown abort the active provider/tool work at the defined checkpoint, discard partial proposals, record cancelled, emit one terminal outcome, and release the shared gate. | `01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md#cancellation`; `02_Architecture/08_LLM_INTEGRATION.md#gate-and-cancellation` | DD-47; PH12-X01 must be resolved; idempotent release | PH13-W06 |
| PH13-R07 | Backend session mutations and correlated events are ordered by document/run; adapter/run/chat projections reconcile from backend acknowledgements/events, accept only the matching run/document generation, and ignore stale/duplicate post-terminal events. | `02_Architecture/08_LLM_INTEGRATION.md#events`; `01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md#chat` | backend canonical; Redux projection; runId/document correlation; adapter-only Wails | PH13-W07 |
| PH13-R08 | Assistant chat UI exposes transcript, composer, custom instruction, context availability, tool rows, Cancel, and PH12 proposal cards with accessible Ready/Busy/Error transitions. | `01_Product/14_LLM_ASSISTANT_OVERVIEW.md#assistant-sidebar`; `01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md#chat`; `01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md#tools` | F1; F9; token-only; keyboard reachable | PH13-W08 |
| PH13-R09 | Provider traffic occurs only after the user sends/invokes, to the snapshotted configured endpoint; workspace reads remain local and no tool introduces independent network traffic. | `01_Product/14_LLM_ASSISTANT_OVERVIEW.md#privacy-and-network`; `03_NonFunctional/03_SECURITY_AND_PRIVACY.md#9-llm-data-flow-and-privacy`; `08_Decisions/0011-network-policy-llm-exception.md#decision-outcome` | DD-32; DD-54; one provider HTTP client; no background request | PH13-W01 |

## State and transition model

| ID | Trigger | Preconditions | Ordered behavior | Result | Failure / preservation | Requirements |
|---|---|---|---|---|---|---|
| PH13-T01 | User sends chat/invokes action/custom directive | Active backend document/session/provider and no gate holder | Snapshot run/document/config/backend history/tools; acquire gate; budget current iteration input; call provider; dispatch validated tools; append backend session observations; emit projection events; repeat within limits | Final message and optional PH12 proposal append to the canonical document session | Busy refuses; every terminal path finalizes backend state once and releases gate | PH13-R01, PH13-R02, PH13-R04, PH13-R09 |
| PH13-T02 | Provider requests a tool | Tool is advertised for captured capabilities | Validate name/schema/args and resolved roots/limits; re-check cancellation; execute least-privilege implementation; bound or reject output according to the resolved policy; append backend structured observation; continue loop | Canonical transcript/next prompt records bounded activity | Invalid/failed/oversized tool performs no forbidden action and returns defined error/truncation observation; root and limit semantics are blocked by PH13-X02/X03 | PH13-R02, PH13-R03, PH13-R07 |
| PH13-T03 | Workspace opens/closes or active document changes | Assistant may be idle or Busy | New runs derive new tool schemas/context; existing run retains captured capability snapshot; tab UI switches transcript | No workspace/document authority changes mid-run | Closed/out-of-root file read still revalidates at I/O and fails safely | PH13-R03, PH13-R04 |
| PH13-T04 | Provider emits stream delta | Active backend run awaits assistant text | Correlate document/run/generation; append ordered delta to canonical draft message; emit projection update; keep tools/proposals structured; finalize on terminal response | Streaming and non-streaming converge on one backend transcript state | Interrupted recovery choice is blocked by PH13-X01; stale/post-terminal deltas are ignored by backend and projection | PH13-R04, PH13-R05, PH13-R07 |
| PH13-T05 | User cancels or application shuts down | Active run context/gate exists | Signal captured cancel context; abandon provider request; discard in-flight local result/proposal; emit cancelled terminal; release gate | Ready/closed state with cancelled transcript record | Cancel/completion race obeys resolved PH12-X01 exactly once | PH13-R06, PH13-R07 |
| PH13-T06 | Iteration/time limit is reached | Loop has not converged | Stop further provider/tool calls; preserve allowed partial text for reporting; record limit stop; emit terminal; release gate | Clear agent-limit outcome, never a runaway loop | No proposal/file is applied automatically; no retry beyond limit | PH13-R01, PH13-R07 |
| PH13-T07 | User switches/closes a tab | Backend per-document session may exist | On switch select/project the target backend session; on close cancel its active run if any; await terminal cancellation; dispose canonical backend session with the tab; acknowledge close; clear only that Redux projection | Histories never mix and closed history cannot reappear; no session persists across launch | Close/dispose failure preserves authoritative backend state and reports failure; other document sessions/runs remain unchanged | PH13-R04, PH13-R06, PH13-R07 |

## Cross-phase contracts

| ID | Producer | Consumer | Interface / invariant | Availability / lifetime | Ordering / concurrency | Source | Requirements |
|---|---|---|---|---|---|---|---|
| PH13-C01 | PH12 | PH13 | Minimal run/proposal/sidebar/cancel/event contracts form the single extensible execution path | Stage-3 session | Resolve PH12 cancellation/base semantics before loop extension | `01_Product/14_LLM_ASSISTANT_OVERVIEW.md#modes-actions-chat` | PH13-R01, PH13-R04, PH13-R06, PH13-R08 |
| PH13-C02 | PH03, PH09 | PH13 | Workspace identity plus the resolved assistant-root/asset-allowlist boundary, traversal validation, and bounded file enumeration/read contract | Workspace lifetime; validate per list/read | Capture advertised tools at run start and reauthorize roots/limits before I/O | `01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md#tool-scope` | PH13-R03 |
| PH13-C03 | PH11 | PH13 | Provider streaming capability/client, config snapshot, retry/error mapping, and gate | One run | Snapshot before gate/provider; provider errors terminate through Result path | `02_Architecture/08_LLM_INTEGRATION.md#provider-abstraction` | PH13-R01, PH13-R05, PH13-R06, PH13-R09 |
| PH13-C04 | PH13 | PH14 | Backend-canonical per-document visible transcript/history, tool schemas, and bounded loop input points | Backend session/iteration lifetime | PH14 derives sent context without mutating canonical visible history | `01_Product/18_TOKENIZER_AND_CONTEXT.md#history-strategy` | PH13-R01, PH13-R04, PH13-R07 |
| PH13-C05 | PH13 | PH10 | New chat/tool/transcript/status strings, routes, responsive states, workspace-read scenarios, and provider streaming/network behavior enter PH10's Stage-3 re-entry inventory | Stage-3 candidate lifetime | PH13 surfaces land before PH10 refresh; PH10 baseline remains a PH13 dependency | `07_Phases/PHASE_10_I18N_PACKAGING.md#cross-phase-contracts` | PH13-R08, PH13-R09 |

## Edge and failure cases

| Edge case | Role | Source clause | Requirements | Expected behavior | Evidence |
|---|---|---|---|---|---|
| EC-LLM-1 | primary | `01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md#agentic-loop` | PH13-R01 | Iteration limit stops with agent-limit and no file write. | `internal/llm/agent/agent_test.go::TestIterationLimit (EC-LLM-1)` |
| EC-LLM-2 | primary | `01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md#tool-scope` | PH13-R02 | Tool runtime failure becomes structured observation and loop stays bounded. | `internal/llm/agent/agent_test.go::TestToolFailureObservation (EC-LLM-2)` |
| EC-LLM-3 | primary | `01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md#tool-scope` | PH13-R02 | Malformed arguments are rejected before invocation. | `internal/llm/tools/registry_test.go::TestInvalidArguments (EC-LLM-3)` |
| EC-LLM-4 | regression | `01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md#limits` | PH13-R01 | Second chat/action run remains Busy, not queued. | `internal/llm/agent/agent_test.go::TestChatBusy (EC-LLM-4)` |
| EC-LLM-5 | regression | `01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md#cancellation` | PH13-R06 | Mid-provider/tool cancel discards partial proposal and releases gate. | `internal/llm/agent/agent_test.go::TestMidToolCancel (EC-LLM-5)` |
| EC-LLM-13 | primary | `01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md#tool-scope` | PH13-R03, PH13-R08 | No workspace means tools absent and attempted call returns unavailable observation. | `internal/llm/tools/workspace_test.go::TestNoWorkspace (EC-LLM-13)` |
| EC-LLM-14 | primary | `01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md#tool-scope` | PH13-R03 | Traversal/out-of-root request is rejected before I/O. | `internal/llm/tools/workspace_test.go::TestTraversal (EC-LLM-14)` |
| EC-LLM-20 | primary | `01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md#streaming` | PH13-R05, PH13-R07 | Interrupted stream ends in one consistent transcript state according to PH13-X01. | `internal/llm/providers/stream_test.go::TestInterruptedStream (EC-LLM-20)` |

## Non-normative work packages

| ID | Capability | Size | Modules | Artifacts | Requirements | Depends on |
|---|---|---|---|---|---|---|
| PH13-W01 | Generalize action execution into bounded multi-turn loop. | M | `internal/llm/agent/`; `internal/llm/providers/`; `internal/gate/` | deferred loop fixtures | PH13-R01, PH13-R09 | PH12 run engine/cancel contract |
| PH13-W02 | Harden tool schema registry and structured observations. | M | `internal/llm/tools/`; `internal/llm/agent/` | JSON-schema failure fixtures | PH13-R02 | PH12 minimal tools |
| PH13-W03 | Add authorized and bounded workspace list/read tools. | M | `internal/llm/tools/`; `internal/workspace/`; `internal/assets/` | root/traversal/symlink/count/byte/token/oversize fixtures | PH13-R03 | PH03 workspace; PH09 allowlist; PH13-W02; PH13-X02; PH13-X03 |
| PH13-W04 | Implement backend-canonical per-document sessions and Redux projection lifecycle. | M | `internal/llm/agent/`; `internal/appmodel/`; `internal/application/`; `logic/adapter/`; `logic/store/assistant/` | switch/close/dispose/re-hydration fixtures | PH13-R04 | PH02 tab lifecycle; PH12 run/proposal state |
| PH13-W05 | Implement streaming decode and transcript convergence. | M | `internal/llm/providers/`; `internal/llm/agent/`; `logic/store/assistant/` | SSE/interruption fixtures | PH13-R05 | PH11 provider capability; PH13-W01; PH13-X01 |
| PH13-W06 | Complete run-id cancellation and shutdown release. | M | `internal/llm/agent/`; `logic/adapter/`; `logic/store/assistant/`; `internal/application/` | cancel race fixtures; generated bindings | PH13-R06 | PH12-X01 resolution; PH13-W01 |
| PH13-W07 | Correlate ordered progress/token/tool/terminal events. | M | `logic/adapter/`; `logic/store/assistant/`; `internal/llm/agent/` | deferred event fixtures | PH13-R07 | PH13-W01; PH13-W04; PH13-W05; PH13-W06 |
| PH13-W08 | Build multi-turn transcript/composer/tool-call UI. | M | `ui/widgets/assistant/`; `logic/store/assistant/`; `logic/llm/` | responsive/chat fixtures | PH13-R08 | PH13-W03; PH13-W04; PH13-W07 |

## Phase exit evidence

| ID | Requirements | Tier | Proof / artifact | Platform / scope | Owner | Freshness | Blocking |
|---|---|---|---|---|---|---|---|
| PH13-E01 | PH13-R01, PH13-R02, PH13-R06 | automated | bounded-loop, malformed/error tool, limit, cancel race, and gate-release suites | deferred fake provider/tools | tester | current HEAD | yes |
| PH13-E02 | PH13-R03 | automated | workspace capability/root/allowlist/traversal/symlink/no-workspace plus count/byte/token/truncation/oversize suites | all supported path and output-limit semantics | security reviewer | current HEAD | yes |
| PH13-E03 | PH13-R04, PH13-R07 | automated | backend canonical session, Redux projection/re-hydration, per-tab switch/close/dispose, and stale/duplicate/out-of-order event suites | multi-document session | tester | current HEAD | yes |
| PH13-E04 | PH13-R05 | automated | streaming/non-streaming/interrupted-stream convergence suites | supported/unsupported/failure | tester | current HEAD | yes |
| PH13-E05 | PH13-R08 | automated | chat/composer/tool/proposal/focus/responsive suites and `just verify-ui` | 375/768/1280 | tester | current HEAD | yes |
| PH13-E06 | PH13-R01, PH13-R03, PH13-R04, PH13-R05, PH13-R06, PH13-R09 | real-runtime | `docs/phase-evidence/PH13-agent-chat.md` | native Wails; local provider; workspace; cancel; network trace | tester | current release candidate | yes |
| PH13-E07 | PH13-R08 | human | `docs/phase-evidence/PH13-chat-approval.md` | frozen mockup; tool and stream states | product owner | current release candidate | yes |

## Open specification conflicts

| ID | Conflicting or missing sources | Required decision | Blocked requirements |
|---|---|---|---|
| PH13-X01 | `01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md#streaming` permits either committing partial streamed text or falling back to a new non-streaming completion after interruption; `02_Architecture/08_LLM_INTEGRATION.md#streaming` states the loop falls back, without defining replay/idempotency or whether the partial text remains. These alternatives can produce different transcript content and duplicate provider side effects. | Select one recovery strategy and define partial-text retention, fallback request replay/idempotency, proposal/tool-call handling, and terminal event semantics. | PH13-R05 |
| PH13-X02 | `01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md#tool-scope` says assistant workspace tools operate under the workspace root plus configured roots, while `01_Product/09_ASSETS_AND_SECURITY.md#allowlist` and `02_Architecture/08_LLM_INTEGRATION.md#tool-registry` say to reuse the broader asset allowlist, which also includes the current document folder. The sources do not say whether a loose document folder/configured asset root is readable by assistant workspace tools or merely usable by rendering. | Define the assistant-specific readable root set and its relationship to the PH09 asset allowlist for listing, direct reads, loose files, and configured roots. | PH13-R03 |
| PH13-X03 | `01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md#tool-scope` requires tool arguments and size to be within limits, but no accepted source defines maximum listed-file count, per-file bytes/tokens, total observation budget, deterministic ordering, truncation marker, or reject-vs-truncate behavior for oversized files/results. | Define typed workspace-tool limits and deterministic listing/read truncation or rejection semantics, including what enters the model observation and local log. | PH13-R02, PH13-R03 |

## Clarification revision

2026-07-21 — Replaced oversized loop/chat stories with bounded engine, schema registry, workspace authorization, backend-canonical session history, streaming, cancellation, event projection, and UI capabilities. Added acknowledged tab-close disposal, reverse PH10 re-entry ownership, and exact security/network evidence; recorded interrupted-stream recovery, assistant-root authorization, and workspace output-limit gaps without choosing policy.
