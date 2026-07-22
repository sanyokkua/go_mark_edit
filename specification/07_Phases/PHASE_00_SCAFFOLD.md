**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester, reviewer
**Last Updated:** 2026-07-21
**Cross-references:** `00_ROADMAP.md`, `../00_Foundation/04_DESIGN_DECISIONS.md`, `../02_Architecture/01_SYSTEM_ARCHITECTURE.md`, `../02_Architecture/02_BACKEND_GO.md`, `../02_Architecture/04_WAILS_INTEGRATION.md`, `../02_Architecture/05_STATE_AND_PERSISTENCE.md`, `../02_Architecture/06_ERROR_HANDLING.md`, `../04_Build_and_Release/03_CI_AND_HOOKS.md`, `../05_Dependencies/01_GO_DEPENDENCIES.md`, `../06_Process_and_Traceability/07_PHASE_FORMAT.md`

# Phase 00 — Scaffold & Toolchain

## Goal

Stand up the empty-but-real Wails v2 shell and bottom-of-graph backend, frontend, persistence, dependency-injection, development, and verification seams that every later phase consumes. This phase delivers no user-facing Markdown behavior.

## Phase metadata

| Phase | Kind | Stage / milestone | Depends on | Completion scope |
|---|---|---|---|---|
| PH00 | sequential | Stage 1 / M1 foundation | none | once per implemented revision |

## Scope

- A bootable Wails v2 application with embedded React 19, Vite, and TypeScript assets.
- Concrete Result envelopes, two-phase composition, local logging, dev-isolated paths, pure-Go SQLite settings persistence, and multi-instance-safe access.
- The frontend adapter/store/error/toast boundaries, bridge mock, three-region shell reservation, and token skeleton.
- Reproducible local and CI commands, generated-binding and traceability gates, hooks, and the accepted foundation ADR set.

## Out of scope

- Monaco, Markdown rendering, file dialogs, tabs, workspace behavior, and production theme values.
- The release matrix and packaging pipeline, which are completed by the cross-cutting release phases.

## Requirement ledger

| ID | Required outcome | Source clauses | Constraints | Work package |
|---|---|---|---|---|
| PH00-R01 | The native process boots a blank embedded React application through one composition root. | `02_Architecture/01_SYSTEM_ARCHITECTURE.md#process-model`; `02_Architecture/04_WAILS_INTEGRATION.md#embed` | DD-01; DD-02; Wails v2; CGO-free | PH00-W01 |
| PH00-R02 | Bound backend operations use concrete Result envelopes and never expose causes across the bridge. | `02_Architecture/02_BACKEND_GO.md#error-envelope`; `02_Architecture/06_ERROR_HANDLING.md#result-envelopes`; `02_Architecture/06_ERROR_HANDLING.md#wire` | Handler to Service to Repository; panic recovery | PH00-W02 |
| PH00-R03 | Startup constructs exactly one two-phase dependency tree with pre-DB logging and dev-isolated paths; a terminal initialization failure shows a native error dialog and exits non-zero before post-init work. | `02_Architecture/02_BACKEND_GO.md#di-two-phase`; `02_Architecture/02_BACKEND_GO.md#packages`; `02_Architecture/04_WAILS_INTEGRATION.md#lifecycle` | one composition root; local logs only; no nil-repository handler calls | PH00-W03 |
| PH00-R04 | The shared settings database uses pure-Go SQLite, additive migrations, WAL, and busy timeout without a process lock; recognized corruption is preserved before clean recovery, while unsupported/newer schema is a terminal startup error. | `02_Architecture/05_STATE_AND_PERSISTENCE.md#kv-schema`; `02_Architecture/05_STATE_AND_PERSISTENCE.md#migrations`; `02_Architecture/05_STATE_AND_PERSISTENCE.md#multi-instance-db` | DD-03; DD-08; DD-13; modernc.org/sqlite; EC-SET-2 safe-recovery and hard-startup branches | PH00-W04 |
| PH00-R05 | A typed Appearance/Markdown/Content settings registry proves persistence and layering, accepts future groups without schema rewrites, and falls back per scalar for missing, malformed, type-mismatched, or unsupported values without discarding valid siblings. | `02_Architecture/02_BACKEND_GO.md#layering`; `02_Architecture/05_STATE_AND_PERSISTENCE.md#kv-schema`; `01_Product/11_SETTINGS.md#persistence`; `01_Product/10_THEMING.md#edge-cases` | F4; EC-THEME-3; EC-SET-2 safe-default branch; additive growth | PH00-W05 |
| PH00-R06 | The frontend communicates only through adapter singletons, projects backend data, parses envelopes, and exposes toast handling. | `02_Architecture/01_SYSTEM_ARCHITECTURE.md#data-flow`; `02_Architecture/03_FRONTEND_REACT.md#adapter-layer`; `02_Architecture/06_ERROR_HANDLING.md#frontend-parseerror`; `02_Architecture/06_ERROR_HANDLING.md#toasts` | no direct wailsjs imports outside adapter; strict TypeScript | PH00-W06 |
| PH00-R07 | The shell reserves the Stage-3 right-region seam and uses token-only styling without implementing assistant behavior. | `00_Foundation/06_IMPLEMENTATION_STAGES.md#stage-1-must-leave-open`; `02_Architecture/03_FRONTEND_REACT.md#structure` | F1; F6; no Stage-3 UI or network | PH00-W06 |
| PH00-R08 | Local development works with either the real bridge or a backend-free bridge mock. | `02_Architecture/03_FRONTEND_REACT.md#bridge-mock`; `02_Architecture/04_WAILS_INTEGRATION.md#lifecycle` | dev and production data isolation | PH00-W07 |
| PH00-R09 | The repository exposes reproducible format, lint, type, test, build, generation, and traceability gates. | `04_Build_and_Release/03_CI_AND_HOOKS.md#1-justfile-command-taxonomy`; `04_Build_and_Release/03_CI_AND_HOOKS.md#4-ci-gate-set`; `04_Build_and_Release/03_CI_AND_HOOKS.md#6-traceability-gate` | no bypass; generated output authoritative | PH00-W08 |
| PH00-R10 | Foundation architecture decisions are accepted, indexed, and traceable before dependent implementation. | `06_Process_and_Traceability/04_ADR_FORMAT.md#template-copy-docsadrtemplatemd`; `06_Process_and_Traceability/03_TRACEABILITY.md#the-two-commands` | ADR-0001 through ADR-0006; immutable accepted decisions | PH00-W08 |
| PH00-R11 | A dependency-free generic process-wide single-flight gate is available for later long operations without implementing a consumer. | `02_Architecture/07_LARGE_FILES_AND_CONCURRENCY.md#gate`; `00_Foundation/06_IMPLEMENTATION_STAGES.md#stage-1-must-leave-open` | F5; non-blocking TryAcquire; process-wide; no feature policy | PH00-W09 |
| PH00-R12 | Story, traceability, and phase validators enforce their accepted schemas and completeness contracts before implementation is claimed complete. | `06_Process_and_Traceability/03_TRACEABILITY.md#the-two-commands`; `06_Process_and_Traceability/07_PHASE_FORMAT.md#completion-semantics` | STORY-024 process capability; structural and completion checks stay distinct | PH00-W10 |

## State and transition model

| ID | Trigger | Preconditions | Ordered behavior | Result | Failure / preservation | Requirements |
|---|---|---|---|---|---|---|
| PH00-T01 | Native startup | Embedded assets and composition root are available | Create holder; start pre-DB logger; resolve paths; open/migrate DB; inject repositories; bind services; show webview | One initialized dependency tree serves the blank shell | On terminal initialization failure call the native Wails error dialog, exit non-zero through the process seam, and perform no post-init action | PH00-R01, PH00-R03, PH00-R04 |
| PH00-T02 | Frontend calls a bound operation | Bridge is available | Adapter calls generated binding; unwrap Result; update projection or toast | Data or a user-safe error reaches the UI | Preserve prior projection; never serialize internal cause | PH00-R02, PH00-R06 |
| PH00-T03 | A second process opens the settings DB | Migration state is compatible | Open with WAL and busy timeout; serialize writes through SQLite | Both processes remain usable | Retry within the busy policy; return an error without data loss after exhaustion | PH00-R04 |
| PH00-T04 | Developer starts frontend-only mode | No Go bridge exists | Install bridge mock; initialize store and shell; exercise adapter contract | Shell renders without backend | Mock failure uses the same envelope/error surface | PH00-R06, PH00-R08 |
| PH00-T05 | A quality command runs | Tool dependencies are installed | Generate/build in declared order; run static and dynamic checks; validate trace | Deterministic pass or actionable failure | Stop on failure; retain generated sources and user files | PH00-R09, PH00-R10 |
| PH00-T06 | A long-operation consumer attempts acquisition | The shared gate exists | Attempt non-blocking acquire; run only after success; release exactly once | At most one process-local long operation owns the slot | Failed acquisition has no dependency or feature-specific side effect | PH00-R11 |
| PH00-T07 | A phase or story gate runs | Planning authorities and evidence exist | Parse schema; resolve mappings; validate lifecycle, dependencies, and evidence; report violations | Passing state means the requested structural or completion contract is covered | Validation never rewrites its inputs implicitly | PH00-R12 |

## Cross-phase contracts

| ID | Producer | Consumer | Interface / invariant | Availability / lifetime | Ordering / concurrency | Source | Requirements |
|---|---|---|---|---|---|---|---|
| PH00-C01 | PH00 | PH01-PH15 | `internal/application` is the sole two-phase composition root | Process lifetime | Repositories are injected only after DB initialization | `02_Architecture/02_BACKEND_GO.md#di-two-phase` | PH00-R03 |
| PH00-C02 | PH00 | every bound backend vertical | Concrete `apperr.*Result`, `WireError`, and `ToWire` | Every bridge call | Panic conversion and envelope mapping precede return | `02_Architecture/06_ERROR_HANDLING.md#result-envelopes` | PH00-R02 |
| PH00-C03 | PH00 | PH01-PH15 frontend modules | Adapter-only bridge access and disposable Redux projection | Webview lifetime | Hydration precedes event reconciliation | `02_Architecture/03_FRONTEND_REACT.md#adapter-layer` | PH00-R06 |
| PH00-C04 | PH00 | PH01-PH15 | Growable typed Appearance/Markdown/Content registry available to every later settings consumer, with scalar defaults and future groups | Application lifetime | Concurrent processes use WAL/busy timeout; invalid scalars do not erase valid siblings | `00_Foundation/06_IMPLEMENTATION_STAGES.md#stage-1-must-leave-open` | PH00-R04, PH00-R05 |
| PH00-C05 | PH00 | PH11-PH14 | Reserved right shell region and generic backend seams without Stage-3 behavior | Application lifetime | Region remains collapsed until explicitly enabled | `00_Foundation/06_IMPLEMENTATION_STAGES.md#stage-1-must-leave-open` | PH00-R07 |
| PH00-C06 | PH00 | every later phase | Just, hooks, CI, generation, and trace commands are the common verification surface | Repository lifetime | Frontend assets are built before Go embedding | `04_Build_and_Release/03_CI_AND_HOOKS.md#3-ordering-why-frontend-builds-before-go` | PH00-R09, PH00-R10 |
| PH00-C07 | PH00 `internal/gate` | PH05 format, PH06 export, and PH11-PH14 inference | Generic single-slot TryAcquire/Release primitive with no consumer dependency | Process lifetime | Acquire is non-blocking; each successful owner releases exactly once | `02_Architecture/07_LARGE_FILES_AND_CONCURRENCY.md#gate` | PH00-R11 |
| PH00-C08 | PH00 process validators | Every phase/story planner and reviewer | Phase requirements, AC mappings, exact evidence, lifecycle, and completion share one readable authority | Repository lifetime | Structural validation precedes planning; completion validation follows evidence generation | `06_Process_and_Traceability/07_PHASE_FORMAT.md#completion-semantics` | PH00-R12 |

## Edge and failure cases

| Edge case | Role | Source clause | Requirements | Expected behavior | Evidence |
|---|---|---|---|---|---|
| EC-SET-1 | primary | `01_Product/01_FUNCTIONAL_REQUIREMENTS.md#settings-set` | PH00-R04 | Concurrent instances use WAL and busy timeout; exhaustion reports failure without loss. | `internal/db/database_test.go::TestOpenRetriesBriefLockContention (EC-SET-1)` |
| EC-SET-2 | primary | `01_Product/01_FUNCTIONAL_REQUIREMENTS.md#settings-set` | PH00-R04, PH00-R05 | Recognized corrupt DB files are preserved before clean recovery; unsupported/newer schema fails startup; invalid settings use scalar defaults while valid siblings survive. | `internal/db/database_test.go::TestOpenRejectsCorruptOrUnsupportedSchemaSafely (EC-SET-2)`; `internal/settings/repository_sqlite_test.go::TestStoredSettingsFallbackMatrix (EC-SET-2)`; `main_test.go::TestStartupInitFailureShowsDialogAndReturnsNonZero (EC-SET-2)` |
| EC-THEME-3 | precursor | `01_Product/10_THEMING.md#edge-cases` | PH00-R05 | Missing or invalid appearance values fall back to Material/Auto without discarding valid siblings. | `internal/settings/repository_sqlite_test.go::TestStoredSettingsFallbackMatrix (EC-THEME-3)` |

## Non-normative work packages

| ID | Capability | Size | Modules | Artifacts | Requirements | Depends on |
|---|---|---|---|---|---|---|
| PH00-W01 | Boot the embedded native shell. | M | `internal/application/`; `ui/styles/`; `dev/bridge-mock/` | `main.go`; `wails.json`; `frontend/dist/` | PH00-R01 | none |
| PH00-W02 | Establish bridge-safe error envelopes. | M | `internal/apperr/` | generated bindings | PH00-R02 | PH00-W01 boot contract |
| PH00-W03 | Compose startup, logging, and isolated paths. | M | `internal/application/`; `internal/bootstrap/`; `internal/logging/`; `internal/file/` | `main.go` | PH00-R03 | PH00-W02 envelope contract |
| PH00-W04 | Establish multi-instance-safe SQLite persistence. | M | `internal/db/`; `internal/file/` | migrations; sqlc configuration | PH00-R04 | PH00-W03 initialization contract |
| PH00-W05 | Prove the typed settings vertical. | M | `internal/settings/`; `internal/db/`; `internal/apperr/` | none | PH00-R05 | PH00-W04 persistence contract |
| PH00-W06 | Build the projected frontend shell and reserved region. | M | `logic/adapter/`; `logic/store/`; `ui/styles/`; `ui/components/` | none | PH00-R06, PH00-R07 | PH00-W01 shell; PH00-W02 envelope |
| PH00-W07 | Provide real-bridge and mock-bridge development paths. | S | `dev/bridge-mock/`; `logic/adapter/` | `wails.json`; Vite configuration | PH00-R08 | PH00-W06 adapter contract |
| PH00-W08 | Establish repository gates and decision traceability. | M | `internal/application/` | `justfile`; `.github/workflows/`; `.lefthook.yml`; `scripts/`; ADR-0001 through ADR-0006 | PH00-R09, PH00-R10 | PH00-W01 build contract |
| PH00-W09 | Provide the dependency-free generic long-operation gate. | S | `internal/gate/` | none | PH00-R11 | PH00-W03 composition contract |
| PH00-W10 | Enforce phase-planning and completion schemas. | M | `internal/application/` | `scripts/`; `justfile`; process specification | PH00-R12 | PH00-W08 trace contract |

## Phase exit evidence

| ID | Requirements | Tier | Proof / artifact | Platform / scope | Owner | Freshness | Blocking |
|---|---|---|---|---|---|---|---|
| PH00-E01 | PH00-R01, PH00-R03, PH00-R08 | real-runtime | `docs/phase-evidence/PH00-runtime.md` | native development platform; real and mock bridges | tester | current HEAD | yes |
| PH00-E02 | PH00-R02, PH00-R05, PH00-R06 | automated | `just check` and envelope architecture tests | all | tester | current HEAD | yes |
| PH00-E03 | PH00-R04 | automated | `internal/db/database_test.go::TestOpenRetriesBriefLockContention`; `internal/db/database_test.go::TestOpenRejectsCorruptOrUnsupportedSchemaSafely`; `main_test.go::TestStartupInitFailureShowsDialogAndReturnsNonZero` | all | tester | current HEAD | yes |
| PH00-E04 | PH00-R05 | automated | `internal/settings/repository_sqlite_test.go::TestStoredSettingsFallbackMatrix` and typed registry tests | all settings groups | tester | current HEAD | yes |
| PH00-E05 | PH00-R07 | automated | `internal/application/architecture_test.go::TestScaffoldHasNoSingleInstanceOrNetworkPath`; `just check` | shell boundary and zero-network scaffold | tester | current HEAD | yes |
| PH00-E06 | PH00-R09, PH00-R10 | automated | `just check`; `just trace-check`; `just gen-check` | all | tester | current HEAD | yes |
| PH00-E07 | PH00-R11 | automated | `internal/gate/gate_test.go::TestGateRejectsConcurrentAcquisition` | all | tester | current HEAD | yes |
| PH00-E08 | PH00-R12 | automated | phase-validator fixtures, `just phase-check`, and `just phase-complete-check 00` | all phase/story metadata | tester | current HEAD | yes |
| PH00-E09 | PH00-R01 | real-runtime | `docs/phase-evidence/PH00-runtime.md` | native development platform window launch and clean close | tester | current HEAD | yes |
| PH00-E10 | PH00-R03 | automated | `main_test.go::TestStartupInitFailureShowsDialogAndReturnsNonZero` | native lifecycle seam | tester | current HEAD | yes |

### Phase exit checklist

Compatibility anchor for story citations created before the normative exit-evidence table.

## Clarification revision

2026-07-21 — Replaced pre-assigned stories with durable requirements, lifecycle transitions, producer/consumer contracts, exact edge ownership, bounded work packages, and tiered evidence. Clarified the implemented EC-SET-2 schema/settings branches, F4/F5 consumers, and the STORY-024 phase-validation capability.
