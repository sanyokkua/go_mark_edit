**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester, reviewer
**Last Updated:** 2026-07-21
**Cross-references:** `00_ROADMAP.md`, `../00_Foundation/06_IMPLEMENTATION_STAGES.md`, `../01_Product/14_LLM_ASSISTANT_OVERVIEW.md`, `../01_Product/15_ACTIONS_LIBRARY.md`, `../01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md`, `../01_Product/18_TOKENIZER_AND_CONTEXT.md`, `../02_Architecture/08_LLM_INTEGRATION.md`, `../08_Decisions/0008-agentic-tool-call-loop.md`, `../08_Decisions/0010-assistant-sidebar-apply-edit.md`, `../06_Process_and_Traceability/07_PHASE_FORMAT.md`

# Phase 12 — Actions & Proofread/Reformat

## Goal

Deliver the first complete user-initiated assistant action: resolve scope, read the backend-authoritative document, run a bounded provider/tool workflow, render a reviewable proposal, and apply only explicit user-approved changes through the existing editor command and save paths.

## Phase metadata

| Phase | Kind | Stage / milestone | Depends on | Completion scope |
|---|---|---|---|---|
| PH12 | sequential | Stage 3 / M3 first end-to-end action | PH01, PH05, PH08, PH10, PH11 | once per action/proposal contract revision |

## Scope

- Data-defined shipped actions and custom-instruction entry.
- Assistant sidebar shell in the reserved right region with provider/model, scope, fit, actions, and run states.
- Minimal bounded action-run orchestration using `read_document`, `read_selection`, and `propose_edit`.
- Result/event/adapter/run-store plumbing with app-wide gate and cancellation.
- Diff, Apply, Review hunks, Discard, stale-proposal protection, and optional Format-after-apply through F3/F7/F8/F9.

## Out of scope

- Multi-turn chat, workspace tools, streaming transcript behavior, and generalized loop UI, owned by PH13.
- Explicit context budget allocation, automatic chunk assembly, and history trimming, owned by PH14.
- Direct file writes, silent apply, arbitrary filesystem/shell/network tools, or a second assistant layout.

## Requirement ledger

| ID | Required outcome | Source clauses | Constraints | Work package |
|---|---|---|---|---|
| PH12-R01 | The shipped Proofread, Confluence/Wiki, Article, Q&A, Summarize, Improve clarity, Make formal, and Make concise actions are data records with stable ids/i18n labels, concise prompts/directives, and declared defaults/preservation contracts; custom instruction bypasses the catalog. | `01_Product/15_ACTIONS_LIBRARY.md#action-model`; `01_Product/15_ACTIONS_LIBRARY.md#proofread`; `01_Product/15_ACTIONS_LIBRARY.md#reformat-targets`; `01_Product/15_ACTIONS_LIBRARY.md#other-actions`; `01_Product/15_ACTIONS_LIBRARY.md#custom-instruction`; `01_Product/15_ACTIONS_LIBRARY.md#extensibility` | DD-39; no action-specific code path/tool; valid Markdown and named preservation rules | PH12-W01 |
| PH12-R02 | The assistant fills the existing F1 right-region slot, persists show/hide state, and exposes Unconfigured/Ready/Busy/Error states without restructuring Viewer/Editor. | `01_Product/14_LLM_ASSISTANT_OVERVIEW.md#assistant-sidebar`; `08_Decisions/0010-assistant-sidebar-apply-edit.md#decision-outcome` | DD-38; F1; token-only; hidden until provider satisfies PH11 save policy | PH12-W02 |
| PH12-R03 | Run scope follows explicit choice, non-empty selection, action default, then global default; empty Selection falls back to Whole document and the live fit meter reflects the resolved scope. | `01_Product/14_LLM_ASSISTANT_OVERVIEW.md#scope-selection-vs-document`; `01_Product/18_TOKENIZER_AND_CONTEXT.md#fit-meter` | DD-43; F2/F7; snapshot selection at run start | PH12-W03 |
| PH12-R04 | `read_document` and `read_selection` read the identified backend canonical buffer/selection, while `propose_edit` returns structured proposal data/diff and cannot mutate buffer or disk. | `01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md#tools`; `01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md#edit-proposals`; `02_Architecture/08_LLM_INTEGRATION.md#tool-registry` | DD-41; DD-42; F2/F3/F7; validated tool arguments | PH12-W04 |
| PH12-R05 | An action/custom instruction runs through one bounded execution path that snapshots provider/model/document/scope, acquires the process gate, invokes only the minimal valid tools, enforces iteration/time limits, and releases on every terminal path. | `01_Product/14_LLM_ASSISTANT_OVERVIEW.md#modes-actions-chat`; `01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md#agentic-loop`; `01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md#limits`; `02_Architecture/08_LLM_INTEGRATION.md#agent-loop`; `02_Architecture/08_LLM_INTEGRATION.md#gate-and-cancellation` | DD-40; DD-47; ADR-0008; cancellation command blocked by PH12-X01 | PH12-W05 |
| PH12-R06 | Bound run/cancel operations return typed Results; run-correlated progress/done/error events enter Redux only through the adapter and stale run ids cannot update the active run. | `02_Architecture/08_LLM_INTEGRATION.md#events`; `02_Architecture/08_LLM_INTEGRATION.md#overview` | Handler-Service layering; adapter-only Wails; generated bindings | PH12-W06 |
| PH12-R07 | Proposal cards use the reusable DiffView, show scope/base identity, and offer Apply, Review hunks, and Discard; no proposal is applied automatically. | `01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md#edit-proposals`; `01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md#apply-and-diff`; `01_Product/14_LLM_ASSISTANT_OVERVIEW.md#modes-actions-chat` | DD-42; F9; reviewable token-only diff | PH12-W07 |
| PH12-R08 | Apply uses replace-range for the captured Selection or replace-all for Whole document as one Monaco undo edit, marks the buffer dirty, enters normal UpdateBuffer synchronization, and reaches disk only through save/autosave. | `01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md#apply-and-diff`; `01_Product/14_LLM_ASSISTANT_OVERVIEW.md#scope-selection-vs-document`; `02_Architecture/08_LLM_INTEGRATION.md#forward-compat-seams` | DD-42; DD-43; F3/F7; no direct Monaco or disk write | PH12-W08 |
| PH12-R09 | Proposal creation records a base identity/revision and Apply detects intervening edits; stale proposals never blindly overwrite and expose only the accepted re-run/hunk-review choices. | `01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md#apply-and-diff` | DD-42; exact base/hunk semantics blocked by PH12-X02 | PH12-W08 |
| PH12-R10 | Optional Format-after-apply calls the same pure PH05 transform only after user Apply and is controlled by one typed, persisted user setting with an explicit default; Apply and Format remain predictable undo-safe operations. | `01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md#apply-and-diff`; `01_Product/14_LLM_ASSISTANT_OVERVIEW.md#forward-compat` | F8; setting contract blocked by PH12-X03; no implicit content loss | PH12-W08 |
| PH12-R11 | Provider/model/config and document/scope are immutable run snapshots; changing settings during Busy affects only the next run and all outbound content follows the PH11 scoped user-action policy. | `01_Product/17_PROVIDERS_MODELS_SETTINGS.md#provider-config`; `01_Product/14_LLM_ASSISTANT_OVERVIEW.md#privacy-and-network` | DD-54; EC-LLM-16; one provider endpoint | PH12-W05 |

## State and transition model

| ID | Trigger | Preconditions | Ordered behavior | Result | Failure / preservation | Requirements |
|---|---|---|---|---|---|---|
| PH12-T01 | User toggles assistant | Provider state and persisted visibility are known | If eligible show reserved region and restore state; otherwise keep disabled/collapsed and deep-link configuration | Shell layout remains unchanged and state is explicit | Unconfigured provider starts no run and exposes no hidden network action | PH12-R02 |
| PH12-T02 | User invokes catalog/custom action | Active document, eligible provider, and nonblank directive exist | Flush pending editor buffer and view/selection state; require backend acknowledgement; resolve scope against acknowledged selection; capture document revision/content/config/limits; update fit; acquire gate; start correlated bounded run; emit progress; return message/proposal | One run outcome is tied to the latest acknowledged immutable inputs | Flush/ack failure aborts before gate acquisition or provider send and preserves the pending editor state; Busy refuses without queue; cancellation protocol is blocked by PH12-X01 | PH12-R01, PH12-R03, PH12-R04, PH12-R05, PH12-R06, PH12-R11 |
| PH12-T03 | Model invokes minimal tool | Active run advertises tool schema | Validate call; read canonical snapshot or compute proposal observation; append observation; continue/finish within limits | Tool result cannot mutate application state | Invalid/failed call is structured; no arbitrary capability is dispatched | PH12-R04, PH12-R05 |
| PH12-T04 | Proposal arrives | Outcome has valid nonempty proposal | Capture base identity/revision/range; compute DiffView; render card/actions | User can review without changing buffer | Empty/malformed proposal yields message/no card | PH12-R07, PH12-R09 |
| PH12-T05 | User applies current proposal | Base still matches current canonical/editor state | Choose replace-range/all; apply one editor edit; enqueue/flush normal buffer sync; if the typed setting is enabled invoke the same PH05 Format transform; mark card applied | Only approved scope changes and becomes dirty | Any mismatch routes to stale flow; undefined Format setting behavior remains blocked by PH12-X03; no partial disk write | PH12-R08, PH12-R10 |
| PH12-T06 | User applies stale proposal or reviews hunks | Current buffer differs from proposal base | Mark stale; present re-run/review choices; validate selected hunks against current content; apply only explicit accepted subset if defined | Blind overwrite is impossible | Exact base comparison/hunk merge behavior remains blocked by PH12-X02 | PH12-R09 |
| PH12-T07 | Run succeeds, errors, limits, or cancels | Gate/run correlation exists | Finalize Result/transcript state; emit one terminal event; ignore later events; release gate once | Sidebar returns Ready/Error with coherent outcome | No partial proposal is applied; stale event cannot revive Busy | PH12-R05, PH12-R06 |

## Cross-phase contracts

| ID | Producer | Consumer | Interface / invariant | Availability / lifetime | Ordering / concurrency | Source | Requirements |
|---|---|---|---|---|---|---|---|
| PH12-C01 | PH01 | PH12 | Stable active-document/selection command seam and backend-synchronized canonical buffer | Active document session in every arrangement | Snapshot/flush before run; Apply uses queued replace operation | `01_Product/14_LLM_ASSISTANT_OVERVIEW.md#forward-compat` | PH12-R03, PH12-R04, PH12-R08 |
| PH12-C02 | PH05 | PH12 | Pure Format/Lint and standalone DiffView | Proposal/application lifetime | Diff before apply; optional Format only after apply | `00_Foundation/06_IMPLEMENTATION_STAGES.md#stage-2-must-leave-open` | PH12-R07, PH12-R10 |
| PH12-C03 | PH11 | PH12 | Eligible provider/config snapshot, tokenizer/fit, typed errors, and shared gate | One run | Snapshot inputs before acquisition/provider call | `02_Architecture/08_LLM_INTEGRATION.md#provider-abstraction` | PH12-R02, PH12-R03, PH12-R05, PH12-R11 |
| PH12-C04 | PH12 | PH13 | Minimal bounded run engine, run events, proposal model, and assistant shell are extensible to chat/workspace/streaming | Stage-3 session | PH13 adds tools/multi-turn state without a parallel execution path | `01_Product/14_LLM_ASSISTANT_OVERVIEW.md#modes-actions-chat` | PH12-R05, PH12-R06, PH12-R07 |
| PH12-C05 | PH12 | PH10 | New action/sidebar/proposal/status strings, routes, responsive states, and user-invoked network scenarios enter PH10's Stage-3 re-entry inventory | Stage-3 candidate | PH12 surfaces land before PH10 refresh; PH10 baseline remains a PH12 dependency | `07_Phases/PHASE_10_I18N_PACKAGING.md#cross-phase-contracts` | PH12-R01, PH12-R02, PH12-R07 |

## Edge and failure cases

| Edge case | Role | Source clause | Requirements | Expected behavior | Evidence |
|---|---|---|---|---|---|
| EC-LLM-4 | primary | `01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md#limits` | PH12-R05 | Second run is refused Busy and first run remains active. | `internal/llm/agent/agent_test.go::TestBusy (EC-LLM-4)` |
| EC-LLM-5 | primary | `01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md#cancellation` | PH12-R05, PH12-R06 | Cancel records cancelled, applies nothing, and releases gate. | `internal/llm/agent/agent_test.go::TestCancel (EC-LLM-5)` |
| EC-LLM-6 | primary | `01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md#apply-and-diff` | PH12-R09 | Changed base marks proposal stale; no blind overwrite. | `frontend/src/ui/widgets/assistant/EditProposal.test.tsx::stale proposal (EC-LLM-6)` |
| EC-LLM-9 | regression | `01_Product/17_PROVIDERS_MODELS_SETTINGS.md#model-discovery` | PH12-R02 | No eligible model disables Run and links configuration. | `frontend/src/ui/widgets/assistant/AssistantSidebar.test.tsx::unconfigured (EC-LLM-9)` |
| EC-LLM-10 | precursor | `01_Product/18_TOKENIZER_AND_CONTEXT.md#over-context-strategy` | PH12-R03 | Fit meter warns; PH14 owns complete warn/chunk execution. | `frontend/src/ui/widgets/assistant/ScopeMeter.test.tsx::over context warning (EC-LLM-10)` |
| EC-LLM-11 | primary | `01_Product/14_LLM_ASSISTANT_OVERVIEW.md#scope-selection-vs-document` | PH12-R03 | Empty Selection falls back to Whole document before send. | `frontend/src/logic/llm/scope.test.ts::empty selection (EC-LLM-11)` |
| EC-LLM-12 | primary | `01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md#edit-proposals` | PH12-R04, PH12-R07 | Empty/unparsable edit creates no empty card. | `frontend/src/ui/widgets/assistant/EditProposal.test.tsx::empty proposal (EC-LLM-12)` |
| EC-LLM-16 | primary | `01_Product/17_PROVIDERS_MODELS_SETTINGS.md#provider-config` | PH12-R11 | Mid-run config edits affect next run only. | `internal/llm/agent/agent_test.go::TestConfigSnapshot (EC-LLM-16)` |
| EC-LLM-17 | primary | `01_Product/15_ACTIONS_LIBRARY.md#custom-instruction` | PH12-R01 | Blank custom instruction starts no run. | `frontend/src/ui/widgets/assistant/Composer.test.tsx::blank directive (EC-LLM-17)` |
| EC-LLM-22 | primary | `01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md#apply-and-diff` | PH12-R08 | Selection Apply replaces only captured range and never writes disk directly. | `frontend/src/ui/widgets/assistant/EditProposal.test.tsx::selection apply (EC-LLM-22)` |

## Non-normative work packages

| ID | Capability | Size | Modules | Artifacts | Requirements | Depends on |
|---|---|---|---|---|---|---|
| PH12-W01 | Define the data-driven action catalog and custom path. | M | `internal/llm/actions/` | action preservation fixtures | PH12-R01 | PH11 provider contract |
| PH12-W02 | Build sidebar shell and eligibility/state handling. | M | `ui/widgets/assistant/`; `logic/store/assistant/`; `ui/styles/` | responsive/mockup fixtures | PH12-R02 | PH08 F1/layout contract; PH11 saved-provider contract |
| PH12-W03 | Resolve scope and drive the live fit meter. | M | `logic/llm/`; `logic/store/assistant/`; `ui/widgets/assistant/` | scope fixtures | PH12-R03 | PH01 F2/F7; PH11 tokenizer |
| PH12-W04 | Implement minimal document/selection/proposal tools. | M | `internal/llm/tools/`; `internal/appmodel/` | JSON-schema/tool fixtures | PH12-R04 | PH01 canonical command seam |
| PH12-W05 | Implement bounded action-run orchestration and snapshots. | M | `internal/llm/agent/`; `internal/llm/providers/`; `internal/gate/`; `internal/llm/actions/`; `internal/llm/tools/` | deferred provider/tool fixtures | PH12-R05, PH12-R11 | PH11 gate/provider; PH12-W01; PH12-W04; PH12-X01 |
| PH12-W06 | Bind run/cancel/events through adapter and run store. | M | `internal/application/`; `internal/llm/agent/`; `logic/adapter/`; `logic/store/assistant/` | generated bindings | PH12-R06 | PH12-W05; PH12-X01 |
| PH12-W07 | Render reviewable DiffView proposal cards. | M | `ui/widgets/assistant/`; `ui/components/`; `logic/llm/` | proposal visual fixtures | PH12-R07 | PH05 F9; PH12-W06 |
| PH12-W08 | Apply/discard/review proposals through F3/F7/F8 with typed Format-after-apply control. | M | `ui/widgets/assistant/`; `ui/widgets/settings/`; `logic/llm/`; `logic/adapter/`; `logic/store/assistant/`; `internal/settings/` | editor and setting integration fixtures | PH12-R08, PH12-R09, PH12-R10 | PH12-W07; PH01 command seam; PH05 F8; PH12-X02; PH12-X03 |

## Phase exit evidence

| ID | Requirements | Tier | Proof / artifact | Platform / scope | Owner | Freshness | Blocking |
|---|---|---|---|---|---|---|---|
| PH12-E01 | PH12-R01 | automated | catalog schema/content/preservation/custom-path suites | all shipped actions | tester | current HEAD | yes |
| PH12-E02 | PH12-R03, PH12-R04, PH12-R05, PH12-R06, PH12-R11 | automated | pending-buffer/selection flush-before-capture, flush-failure no-send, scope/tool/gate/limit/cancel/config-snapshot/event-order suites | deferred fake provider | tester | current HEAD | yes |
| PH12-E03 | PH12-R07, PH12-R08, PH12-R09, PH12-R10 | automated | DiffView/apply/hunk/stale/undo/buffer-sync plus Format-setting default/persistence/enabled/disabled integration suites | Editor, Split, Preview session seam | tester | current HEAD | yes |
| PH12-E04 | PH12-R02, PH12-R03, PH12-R07 | automated | sidebar state/focus/responsive suites and `just verify-ui` | 375/768/1280 | tester | current HEAD | yes |
| PH12-E05 | PH12-R01, PH12-R02, PH12-R05, PH12-R08, PH12-R11 | real-runtime | `docs/phase-evidence/PH12-action-apply.md` | native Wails; local provider; selection/whole document | tester | current release candidate | yes |
| PH12-E06 | PH12-R02, PH12-R07 | human | `docs/phase-evidence/PH12-assistant-approval.md` | frozen mockup; all themes | product owner | current release candidate | yes |

## Open specification conflicts

| ID | Conflicting or missing sources | Required decision | Blocked requirements |
|---|---|---|---|
| PH12-X01 | `01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md#cancellation` and `02_Architecture/08_LLM_INTEGRATION.md#gate-and-cancellation` require frontend cancellation of an in-flight bound run through `context.Context`, but no bound Cancel method, run-id cancellation registry, race semantics, or terminal Result/event ownership is specified. | Define the cancel command/signature, run context registry lifetime, cancel-vs-completion ordering, and exactly one terminal Result/event contract. | PH12-R05, PH12-R06 |
| PH12-X02 | `01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md#apply-and-diff` requires stale detection and offers re-run or best-effort hunk review, but does not define proposal base revision/selection anchoring, hunk matching, conflict handling, or the undo unit for a partially accepted stale proposal. | Define proposal base identity and deterministic hunk-review/apply semantics for current and stale buffers. | PH12-R09 |
| PH12-X03 | `01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md#apply-and-diff` says Format-after-apply is optional and controlled by a setting, but accepted sources do not define the setting key/type/location/default, whether it applies to selection and whole-document proposals alike, or the undo/failure relationship between Apply and Format. | Define the typed Format-after-apply setting contract, user control/default, scope behavior, undo grouping, and Format-failure result. | PH12-R10 |

## Clarification revision

2026-07-21 — Reconstructed Phase 12 around one end-to-end action lifecycle rather than sidebar/component stories, with acknowledged buffer/selection flush before capture, exact scope/config snapshots, least-privilege tools, run events, proposal base identity, F3/F7/F8/F9 consumption, reverse PH10 re-entry ownership, and durable runtime evidence. Recorded the missing cancellation, stale-hunk, and Format-after-apply setting protocols without inventing them.
