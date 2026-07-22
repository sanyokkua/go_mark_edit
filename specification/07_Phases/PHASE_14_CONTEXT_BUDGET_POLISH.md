**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester, reviewer
**Last Updated:** 2026-07-21
**Cross-references:** `00_ROADMAP.md`, `../00_Foundation/06_IMPLEMENTATION_STAGES.md`, `../01_Product/14_LLM_ASSISTANT_OVERVIEW.md`, `../01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md`, `../01_Product/17_PROVIDERS_MODELS_SETTINGS.md`, `../01_Product/18_TOKENIZER_AND_CONTEXT.md`, `../02_Architecture/08_LLM_INTEGRATION.md`, `../03_NonFunctional/03_SECURITY_AND_PRIVACY.md`, `../08_Decisions/0009-tokenizer-context-budget.md`, `../06_Process_and_Traceability/07_PHASE_FORMAT.md`

# Phase 14 — Context Budgeting & Polish

## Goal

Complete Stage 3 by making every provider turn fit an explicit context budget, handling over-context documents and long histories predictably without altering the visible backend-owned transcript, and proving the assistant's limits, privacy, and end-to-end UX.

## Phase metadata

| Phase | Kind | Stage / milestone | Depends on | Completion scope |
|---|---|---|---|---|
| PH14 | sequential | Stage 3 / M3 completion | PH10, PH11, PH12, PH13 | once per context/transcript policy revision |

## Scope

- Per-iteration allocation across system prompt, tool schemas, scoped content, history, safety margin, and reply reserve.
- Green/amber/red fit, Warn and opt-in Chunk over-context strategies, and reactive provider-overflow handling.
- Sliding-window and opt-in summarization history strategies without changing the visible transcript.
- Provider/model/params/limits polish and consistent Busy/limit/cancel/error UX over PH13's visible session transcript.
- Full Stage-3 runtime, network/privacy, responsive, and human-approval evidence plus PH10 recertification.

## Out of scope

- Persistent cross-launch assistant/chat history or cloud transcript storage.
- Transcript export in any format; no accepted v1 clause authorizes an export feature.
- New provider kinds, autonomous background inference, silent proposal apply, or new tool privileges.
- Destructive changes to Stage-1/2 document, layout, settings, formatting, or diff contracts.

## Requirement ledger

| ID | Required outcome | Source clauses | Constraints | Work package |
|---|---|---|---|---|
| PH14-R01 | Before every provider iteration, a deterministic budget subtracts reply reserve and safety margin then allocates system prompt, valid tool schemas, scoped content, and history with directive/content priority. | `01_Product/18_TOKENIZER_AND_CONTEXT.md#context-budget`; `01_Product/18_TOKENIZER_AND_CONTEXT.md#reply-reserve`; `02_Architecture/08_LLM_INTEGRATION.md#context-budgeter`; `08_Decisions/0009-tokenizer-context-budget.md#decision-outcome` | DD-50; DD-51; ADR-0009; never silently exceed known window | PH14-W01 |
| PH14-R02 | Live fit recomputes for document/selection/config changes and a red Whole-document run under Warn sends nothing until the user selects a smaller scope/chunk choice. | `01_Product/18_TOKENIZER_AND_CONTEXT.md#fit-meter`; `01_Product/18_TOKENIZER_AND_CONTEXT.md#over-context-strategy` | DD-50; explicit user choice; estimator remains approximate | PH14-W02 |
| PH14-R03 | Opt-in Chunk divides source into within-budget overlapping windows and assembles one reviewable proposal without duplicate/lost content or automatic apply. | `01_Product/18_TOKENIZER_AND_CONTEXT.md#over-context-strategy`; `02_Architecture/08_LLM_INTEGRATION.md#tokenizer` | DD-42; DD-50; algorithm/merge blocked by PH14-X01 | PH14-W03 |
| PH14-R04 | A provider context-window rejection is non-retryable for the identical request, preserves transcript/proposal state, and offers narrower scope or configured chunking. | `01_Product/18_TOKENIZER_AND_CONTEXT.md#over-context-strategy`; `02_Architecture/08_LLM_INTEGRATION.md#error-codes` | DD-48; DD-50; reactive backstop | PH14-W02 |
| PH14-R05 | Sliding-window history keeps the most recent turns fitting its allocation, drops oldest sent turns first, and never removes the current directive/scoped content or alters the visible transcript. | `01_Product/18_TOKENIZER_AND_CONTEXT.md#history-strategy`; `01_Product/18_TOKENIZER_AND_CONTEXT.md#context-budget` | DD-51; default strategy; per-document session | PH14-W04 |
| PH14-R06 | Opt-in Summarize uses a provider inference inside the same user-initiated run and already-held app-wide single-flight gate to replace eligible older sent turns with a compact running summary, while preserving directive/current-turn facts and leaving the backend-visible transcript unchanged. | `01_Product/18_TOKENIZER_AND_CONTEXT.md#history-strategy`; `02_Architecture/08_LLM_INTEGRATION.md#context-budgeter`; `08_Decisions/0009-tokenizer-context-budget.md#decision-outcome` | DD-47; DD-51; no background/independent summary call; detailed summary contract blocked by PH14-X02 | PH14-W05 |
| PH14-R08 | Provider/model settings validate parameter ranges and clearly surface Busy, agent-limit, cancel, timeout, auth, rate-limit, and context-window states consistently through typed Result/toast/UI status. | `01_Product/17_PROVIDERS_MODELS_SETTINGS.md#inference-params`; `01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md#limits`; `02_Architecture/08_LLM_INTEGRATION.md#error-codes` | DD-47; DD-48; DD-52; no secret/path leakage | PH14-W07 |
| PH14-R09 | Stage-3 completion proves local-provider actions, selection/whole-document proposal apply/save, multi-turn custom chat, workspace read, limits/cancel, over-context behavior, and network/telemetry boundaries without changing earlier seams. | `00_Foundation/06_IMPLEMENTATION_STAGES.md#5-stage-exit-criteria`; `01_Product/14_LLM_ASSISTANT_OVERVIEW.md#forward-compat`; `03_NonFunctional/03_SECURITY_AND_PRIVACY.md#9-llm-data-flow-and-privacy` | F1–F9; DD-54; PH10 recertification; human/runtime evidence | PH14-W08 |

## State and transition model

| ID | Trigger | Preconditions | Ordered behavior | Result | Failure / preservation | Requirements |
|---|---|---|---|---|---|---|
| PH14-T01 | Agent prepares a provider iteration | Run snapshot, tools, scoped content, history, and model limits exist | Estimate fixed inputs; subtract reserve/margin; allocate directive/content; trim history; assemble in defined priority order; verify fit | Request is explainably within configured budget | Impossible fixed overhead/scope returns non-fit before provider | PH14-R01, PH14-R05, PH14-R06 |
| PH14-T02 | Whole-document fit is red under Warn | No provider request has started | Block send; show exact fit state; offer Selection or one chunk; capture user's choice; recompute | Only explicitly narrowed input may proceed | Dismiss sends nothing and preserves transcript/buffer | PH14-R02 |
| PH14-T03 | Whole-document fit is red under Chunk | Chunking is opted in | Segment with overlap; budget each chunk; process in order/defined concurrency; reconcile overlaps; compute one proposal/diff | Reviewable assembled result fits per call | Exact segmentation/reconciliation/retry semantics are blocked by PH14-X01; no partial auto-apply | PH14-R03 |
| PH14-T04 | History exceeds allocation under Sliding window | Current directive/content must be retained | Remove oldest eligible sent turns until fit; keep visible transcript intact | Request contains recent bounded history | If fixed/current content cannot fit, use over-context path rather than trim it | PH14-R05 |
| PH14-T05 | History exceeds allocation under Summarize | User-initiated run holds the single-flight gate, its immutable provider/config snapshot exists, and older turns are eligible | Select eligible turns; invoke the snapshotted provider for summary within the same run/gate; validate the summary; rebudget; replace only the sent-context representation; continue the originating run | Long chat retains compact gist without a second gate owner or visible-transcript mutation | Prompt/schema, threshold, accounting/provenance, and failure fallback are blocked by PH14-X02; summary failure cannot spawn an independent/background retry | PH14-R06 |
| PH14-T06 | Provider rejects request for context length | Request was estimated green/amber | Classify context-window; do not retry identical request; finalize coherent run state; offer narrow/chunk | User sees reactive backstop without transcript corruption | Gate releases and partial proposal is not applied | PH14-R04, PH14-R08 |
| PH14-T08 | Stage-3 candidate requests completion | PH11-PH14 code and PH10 re-entry scope exist | Run automated gates; exercise native end-to-end flows; record network trace; obtain visual/UX approval | Evidence binds Stage-3 completion to one revision | Missing runtime/human/network evidence blocks completion | PH14-R09 |

## Cross-phase contracts

| ID | Producer | Consumer | Interface / invariant | Availability / lifetime | Ordering / concurrency | Source | Requirements |
|---|---|---|---|---|---|---|---|
| PH14-C01 | PH11 | PH14 | Offline estimator, margin/reserve/window settings, provider error mapping, and typed params | Per run/iteration snapshot | Snapshot limits before budget assembly | `01_Product/18_TOKENIZER_AND_CONTEXT.md#token-estimation` | PH14-R01, PH14-R02, PH14-R04, PH14-R08 |
| PH14-C02 | PH13 | PH14 | Backend-canonical visible transcript, current send history, valid tool schemas, and per-iteration assembly hook | Per-document backend session | Trim/summarize only the derived request context; never canonical visible history | `01_Product/18_TOKENIZER_AND_CONTEXT.md#history-strategy` | PH14-R01, PH14-R05, PH14-R06 |
| PH14-C03 | PH12 | PH14 | Proposal/diff/stale/apply contracts consume assembled chunk outcome | Proposal lifetime | Assemble and review before explicit Apply | `01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md#apply-and-diff` | PH14-R03 |
| PH14-C04 | PH14 | PH10 | Final Stage-3 strings/routes/network/performance state triggers cross-cutting recertification | Stage-3 release candidate | Complete PH11-PH14 before PH10 evidence refresh/PH15 release | `07_Phases/PHASE_10_I18N_PACKAGING.md#scope` | PH14-R09 |
| PH14-C05 | PH14 | PH15 | A fully evidenced Stage-3 candidate is eligible for release orchestration | Release candidate lifetime | Phase completion/gates precede tag publication | `00_Foundation/06_IMPLEMENTATION_STAGES.md#5-stage-exit-criteria` | PH14-R09 |

## Edge and failure cases

| Edge case | Role | Source clause | Requirements | Expected behavior | Evidence |
|---|---|---|---|---|---|
| EC-LLM-1 | regression | `01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md#agentic-loop` | PH14-R08 | Agent-limit messaging remains consistent and releases gate. | `frontend/src/ui/widgets/assistant/AssistantSidebar.test.tsx::limit status (EC-LLM-1)` |
| EC-LLM-7 | regression | `01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md#limits` | PH14-R08 | Timeout preserves coherent transcript and typed error. | `frontend/src/ui/widgets/assistant/AssistantSidebar.test.tsx::timeout status (EC-LLM-7)` |
| EC-LLM-10 | primary | `01_Product/18_TOKENIZER_AND_CONTEXT.md#over-context-strategy` | PH14-R02, PH14-R03 | Known over-context request never sends unmodified; Warn/Chunk follows selected policy. | `internal/llm/context/context_test.go::TestOverContextStrategy (EC-LLM-10)` |
| EC-LLM-15 | primary | `01_Product/18_TOKENIZER_AND_CONTEXT.md#over-context-strategy` | PH14-R04 | Reactive overflow is classified and identical request is not retried. | `internal/llm/agent/agent_test.go::TestReactiveContextOverflow (EC-LLM-15)` |
| EC-LLM-20 | regression | `01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md#streaming` | PH14-R08 | Context/error polish preserves PH13's resolved interrupted-stream state in the visible transcript. | `frontend/src/ui/widgets/assistant/AssistantSidebar.test.tsx::interrupted stream status (EC-LLM-20)` |
| EC-LLM-21 | primary | `01_Product/18_TOKENIZER_AND_CONTEXT.md#history-strategy` | PH14-R05, PH14-R06 | Over-budget sent history trims/summarizes while directive/current turn/visible history remain. | `internal/llm/context/context_test.go::TestHistoryStrategy (EC-LLM-21)` |

## Non-normative work packages

| ID | Capability | Size | Modules | Artifacts | Requirements | Depends on |
|---|---|---|---|---|---|---|
| PH14-W01 | Implement deterministic per-iteration context allocation. | M | `internal/llm/context/`; `internal/llm/tokenizer/`; `internal/llm/agent/` | budget corpus fixtures | PH14-R01 | PH11 tokenizer; PH13 iteration hook |
| PH14-W02 | Integrate fit/Warning/reactive-overflow UX. | M | `internal/llm/context/`; `logic/llm/`; `ui/widgets/assistant/` | threshold/provider-error fixtures | PH14-R02, PH14-R04 | PH14-W01 |
| PH14-W03 | Implement opt-in chunk segmentation and proposal assembly. | M | `internal/llm/context/`; `internal/llm/agent/`; `logic/llm/` | boundary/overlap fixtures | PH14-R03 | PH14-W01; PH12 proposal contract; PH14-X01 |
| PH14-W04 | Implement sliding-window sent-history trimming. | M | `internal/llm/context/`; `internal/llm/agent/` | multi-turn fixtures | PH14-R05 | PH14-W01; PH13 transcript contract |
| PH14-W05 | Implement provider-generated summarized sent history inside the originating run/gate. | M | `internal/llm/context/`; `internal/llm/agent/`; `internal/llm/providers/`; `logic/store/assistant/` | snapshot/prompt/schema/gate/accounting/provenance/failure fixtures | PH14-R06 | PH14-W01; PH14-W04; PH13 canonical transcript; PH14-X02 |
| PH14-W07 | Validate params and unify provider/limit/error UX. | M | `ui/widgets/assistant/`; `ui/widgets/settings/`; `internal/llm/agent/` | boundary/error fixtures | PH14-R08 | PH11 typed errors/settings; PH13 loop |
| PH14-W08 | Complete Stage-3 conformance and release-readiness evidence. | M | `internal/llm/agent/`; `logic/store/assistant/`; `ui/widgets/assistant/` | Stage-3 runtime/network/visual evidence | PH14-R09 | PH14-W02–PH14-W05; PH14-W07; PH10 recertification |

## Phase exit evidence

| ID | Requirements | Tier | Proof / artifact | Platform / scope | Owner | Freshness | Blocking |
|---|---|---|---|---|---|---|---|
| PH14-E01 | PH14-R01, PH14-R02, PH14-R04, PH14-R05 | automated | budget/fit/warn/reactive/sliding-window deterministic suites | model/window boundary corpus | tester | current HEAD | yes |
| PH14-E02 | PH14-R03 | automated | chunk boundary/overlap/retry/assembly/proposal suites | long Markdown/code/link fixtures | tester | current HEAD | yes |
| PH14-E03 | PH14-R06 | automated | summary trigger/snapshot/prompt/schema/same-run gate/accounting/provenance/failure/rebudget/no-background-call suites | long multi-turn history | tester and security reviewer | current HEAD | yes |
| PH14-E05 | PH14-R08 | automated | parameter boundary and consistent status/toast suites | all typed LLM errors | tester | current HEAD | yes |
| PH14-E06 | PH14-R09 | real-runtime | `docs/phase-evidence/PH14-stage3-exit.md` | native Wails; local provider; actions/chat/workspace/over-context/cancel | reviewer | current release candidate | yes |
| PH14-E07 | PH14-R06, PH14-R09 | real-runtime | network/privacy and gate trace in `docs/phase-evidence/PH14-stage3-exit.md` | summary inference uses originating user action/provider/run/gate only; no background call, telemetry, or update | security reviewer | current release candidate | yes |
| PH14-E08 | PH14-R08, PH14-R09 | human | `docs/phase-evidence/PH14-stage3-approval.md` | responsive assistant/transcript/error states | product owner | current release candidate | yes |

## Open specification conflicts

| ID | Conflicting or missing sources | Required decision | Blocked requirements |
|---|---|---|---|
| PH14-X01 | `01_Product/18_TOKENIZER_AND_CONTEXT.md#over-context-strategy` requires overlapping chunks and an assembled edit but does not define boundary selection, overlap size, sequential/parallel ordering, per-chunk prompt context, partial failure/retry, or overlap-conflict reconciliation. | Define deterministic chunk segmentation and assembly semantics that preserve Markdown/code boundaries and yield one reviewable proposal. | PH14-R03 |
| PH14-X02 | `01_Product/18_TOKENIZER_AND_CONTEXT.md#history-strategy`, `02_Architecture/08_LLM_INTEGRATION.md#context-budgeter`, and ADR-0009 settle Summarize as a provider-generated compact history representation within the current user-initiated run, but do not define which immutable provider/model/config snapshot is used, the summary prompt/schema, iteration/token accounting while the gate remains held, exact network evidence, refresh threshold, retained provenance, validation, or failure fallback. | Define the in-run summary request/response schema, snapshot and budget accounting, trigger/refresh threshold, provenance, validation, and deterministic failure fallback without adding a second gate owner or background call. | PH14-R06 |

## Clarification revision

2026-07-21 — Split context work into allocation, Warn, Chunk, sliding history, in-run provider summarization, UX hardening, and conformance capabilities. Removed the unauthorized transcript-export feature, bound summarization to the originating user action and single-flight gate, and retained only the unresolved summary snapshot/prompt/schema/accounting/threshold/provenance/fallback details plus chunk assembly as explicit conflicts.
