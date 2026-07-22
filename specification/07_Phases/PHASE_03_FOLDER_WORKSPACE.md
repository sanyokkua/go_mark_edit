**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester, reviewer
**Last Updated:** 2026-07-21
**Cross-references:** `00_ROADMAP.md`, `../01_Product/03_FILES_TABS_WORKSPACE.md`, `../02_Architecture/02_BACKEND_GO.md`, `../02_Architecture/04_WAILS_INTEGRATION.md`, `../02_Architecture/05_STATE_AND_PERSISTENCE.md`, `../00_Foundation/04_DESIGN_DECISIONS.md`, `../08_Decisions/0012-drag-and-drop.md`, `../06_Process_and_Traceability/07_PHASE_FORMAT.md`

# Phase 03 — Folder Workspace + Recent

## Goal

Provide a backend-owned folder workspace, a responsive filtered lazy tree, bounded recent files/folders with explicit reopen-last, multi-instance opening, and safe native drag-and-drop. Launch remains clean and no path is restored automatically.

## Phase metadata

| Phase | Kind | Stage / milestone | Depends on | Completion scope |
|---|---|---|---|---|
| PH03 | sequential | Stage 1 / M1 | PH02 | once per implemented revision |

## Scope

- `internal/appmodel` owns the workspace root while `internal/workspace` enumerates filtered children lazily and within explicit bounds.
- `internal/recent` persists bounded MRU file/folder paths in the shared SQLite KV infrastructure and prunes stale entries lazily.
- The projected workspace/recent UI supports expansion, manual refresh, empty/error indicators, tree-to-tab open, and explicit reopen-last.
- Native drop paths are classified and routed through the same file/folder commands; the webview default is suppressed and multi-instance behavior is preserved.

## Out of scope

- Live filesystem watching, automatic session restore, OS association routing policy (PH07), and the default-open-mode settings UI (PH08).
- Drag-and-drop file movement, copying, renaming, upload, or network access.

## Requirement ledger

| ID | Required outcome | Source clauses | Constraints | Work package |
|---|---|---|---|---|
| PH03-R01 | `OpenWorkspace` stores one authoritative workspace root and emits a content-free projection patch. | `01_Product/03_FILES_TABS_WORKSPACE.md#open-folder`; `02_Architecture/02_BACKEND_GO.md#application-model` | DD-62; DD-63; per-process ownership | PH03-W01 |
| PH03-R02 | Workspace enumeration is lazy, bounded, responsive, cycle-safe, permission-tolerant, and manually refreshable. | `01_Product/03_FILES_TABS_WORKSPACE.md#open-folder`; `03_NonFunctional/02_PERFORMANCE.md#4-large-file-handling` | no live watcher; cancellation and stale-result handling | PH03-W02 |
| PH03-R03 | The tree shows directories and only supported non-hidden Markdown/text files, with empty and skipped-node feedback. | `01_Product/03_FILES_TABS_WORKSPACE.md#tree-filter` | DD-06; accessible tree semantics | PH03-W03 |
| PH03-R04 | Selecting a tree file routes through PH02 canonical open/focus behavior and the configured default-open-mode contract. | `01_Product/03_FILES_TABS_WORKSPACE.md#open-folder`; `01_Product/02_EDITOR_AND_VIEWER_MODES.md#default-open-mode` | no duplicate tabs; PH02 precedence conflict remains applicable | PH03-W04 |
| PH03-R05 | Recent files and folders are bounded, MRU-ordered, promoted on successful operations, and lazily prune missing paths. | `01_Product/03_FILES_TABS_WORKSPACE.md#recent`; `02_Architecture/05_STATE_AND_PERSISTENCE.md#recent` | DD-10; multi-instance-safe DB | PH03-W05 |
| PH03-R06 | Reopen-last is explicit, chooses the newest valid recent file or folder, and plain launch performs no restore. | `01_Product/03_FILES_TABS_WORKSPACE.md#reopen-last`; `02_Architecture/05_STATE_AND_PERSISTENCE.md#file-first` | DD-11; no crash recovery or swap file | PH03-W06 |
| PH03-R07 | Opening another file/folder in a new window uses a separate process/model while safely sharing settings/recent persistence. | `01_Product/03_FILES_TABS_WORKSPACE.md#multi-instance`; `02_Architecture/05_STATE_AND_PERSISTENCE.md#multi-instance-db` | DD-08; DD-13; no single-instance lock | PH03-W07 |
| PH03-R08 | Native file/folder drops show accessible feedback, suppress webview navigation, classify current paths, and reuse canonical open commands. | `01_Product/03_FILES_TABS_WORKSPACE.md#drag-and-drop-open`; `02_Architecture/04_WAILS_INTEGRATION.md#file-drop` | DD-56 through DD-59; ADR-0012; zero network | PH03-W08 |
| PH03-R09 | Mixed/multiple drops process files deterministically, focus the last successfully opened file, and run each folder through the workspace/new-window flow without silently dropping inputs. | `01_Product/03_FILES_TABS_WORKSPACE.md#drag-and-drop-open` | UC-DND-2; ordered classification; stale paths fail independently | PH03-W09 |
| PH03-R10 | Replacing an existing workspace with dirty tabs remains blocked by the undefined PH02 multi-dirty close semantics and the workspace-specific cancellation sequence. | `01_Product/03_FILES_TABS_WORKSPACE.md#drag-and-drop-open`; `01_Product/03_FILES_TABS_WORKSPACE.md#dirty-state`; `07_Phases/PHASE_02_FILE_IO_TABS.md#open-specification-conflicts` | PH02-X03; PH03-X01; no content loss | PH03-W09 |

## State and transition model

| ID | Trigger | Preconditions | Ordered behavior | Result | Failure / preservation | Requirements |
|---|---|---|---|---|---|---|
| PH03-T01 | Open Folder | User selects a directory | Canonicalize and validate root; commit workspace ref in appmodel; promote Recent; emit patch; request root children lazily | Workspace label/tree projection represents the accepted root | Cancel changes nothing; failure keeps prior workspace and reports error | PH03-R01, PH03-R05 |
| PH03-T02 | Expand or refresh tree node | Workspace and node identity are current | Start bounded cancellable enumeration; filter/sort; publish only for current workspace generation | Children or an explicit empty/skipped state appear responsively | Discard stale completions; keep other nodes usable; show permission/error indicator | PH03-R02, PH03-R03 |
| PH03-T03 | Select tree file | Path is supported and current | Delegate to PH02 canonical open; focus duplicate or create tab; apply resolved open-mode precedence | One matching tab is active | Missing/stale path reports error and tree remains intact | PH03-R04 |
| PH03-T04 | Show Recent or choose an entry | Recent repository is available | Read MRU; validate lazily; prune missing paths; open selected valid target through canonical command | Ordered live entries and selected target open | A stale target is removed and reported without affecting current work | PH03-R05 |
| PH03-T05 | Reopen last | No automatic restore has occurred | Read and prune MRU; choose newest valid file/folder; invoke its canonical open flow | Prior target opens only on explicit command | Empty list is a defined no-op state | PH03-R06 |
| PH03-T06 | Open in new window | Target path is validated | Launch separate native process with target routing data; initialize independent appmodel; share WAL database | Current window is untouched and new instance opens target | Launch failure reports error and preserves current state | PH03-R07 |
| PH03-T07 | Drag enters/leaves window | Native drop support is active | Suppress default navigation; validate file payload; show/remove overlay | Accessible drop feedback reflects eligibility | Non-file payload is ignored without state change | PH03-R08 |
| PH03-T08 | Drop files and folders | Payload contains current filesystem paths | Preserve input order; classify each path; open files through PH02; focus the last successfully opened file; run folder flow for each folder | Every valid item is handled deterministically | Unsupported/missing items fail independently with toast; no network or navigation | PH03-R08, PH03-R09 |
| PH03-T09 | Dropped folder targets occupied workspace | Existing workspace is open | Prompt current-window versus new-window; if replacement is chosen and dirty tabs exist, stop before mutation until PH02-X03 and PH03-X01 are resolved | Clean-workspace replacement or new-window choice follows the selected flow | Cancel preserves the current workspace; no multi-dirty ordering or partial-progress behavior is assumed | PH03-R09, PH03-R10 |

## Cross-phase contracts

| ID | Producer | Consumer | Interface / invariant | Availability / lifetime | Ordering / concurrency | Source | Requirements |
|---|---|---|---|---|---|---|---|
| PH03-C01 | PH02 canonical open/save lifecycle | PH03 tree, recent, and drop routes | Every file path uses canonical dedupe, flush, dirty, and Result behavior | Document/tab lifetime | Path validation and dedupe precede tab creation | `01_Product/03_FILES_TABS_WORKSPACE.md#new-open-save` | PH03-R04, PH03-R08, PH03-R09 |
| PH03-C02 | PH03 workspace service | PH09 asset policy and PH13 workspace tools | Canonical workspace root plus bounded allowlisted child enumeration | Workspace lifetime | Generation/cancellation prevents stale tree publication | `01_Product/03_FILES_TABS_WORKSPACE.md#open-folder` | PH03-R01, PH03-R02, PH03-R03 |
| PH03-C03 | PH03 recent service | PH07 associations and PH08 menus/settings | Bounded MRU file/folder repository with lazy pruning | Shared database lifetime | Concurrent processes use WAL and busy timeout | `02_Architecture/05_STATE_AND_PERSISTENCE.md#recent` | PH03-R05, PH03-R06, PH03-R07 |
| PH03-C04 | PH03 native drop path | PH07 open-target routing | Stat-classified path delegates to the same file/folder command surface | Window lifetime | Classification occurs at consumption time; missing paths fail safely | `02_Architecture/04_WAILS_INTEGRATION.md#file-drop` | PH03-R08, PH03-R09 |
| PH03-C05 | PH02 dirty lifecycle | PH03 workspace replacement | Single-target Save, Discard, Cancel is available; multi-dirty orchestration remains PH02-X03 and PH03-X01 work | Window and document lifetime | No workspace commit before the unresolved dirty decisions complete | `07_Phases/PHASE_02_FILE_IO_TABS.md#open-specification-conflicts` | PH03-R10 |
| PH03-C06 | PH03 shell projection | PH11 assistant sidebar | Workspace tree occupies left region without restructuring reserved right region | Application lifetime | Tree updates are projected and independent of assistant visibility | `00_Foundation/06_IMPLEMENTATION_STAGES.md#stage-1-must-leave-open` | PH03-R03 |

## Edge and failure cases

| Edge case | Role | Source clause | Requirements | Expected behavior | Evidence |
|---|---|---|---|---|---|
| EC-WS-1 | primary | `01_Product/01_FUNCTIONAL_REQUIREMENTS.md#workspace-ws` | PH03-R02 | Large folders use bounded lazy enumeration and keep UI responsive. | `internal/workspace/service_test.go::TestLargeFolderGuard (EC-WS-1)` |
| EC-WS-2 | primary | `01_Product/01_FUNCTIONAL_REQUIREMENTS.md#workspace-ws` | PH03-R03 | No matching files produces an explicit empty-tree state. | `frontend/src/ui/widgets/FileExplorer.test.tsx::empty tree (EC-WS-2)` |
| EC-WS-3 | primary | `01_Product/01_FUNCTIONAL_REQUIREMENTS.md#workspace-ws` | PH03-R02 | Deleted or moved nodes fail gracefully and refresh removes stale entries. | `internal/workspace/service_test.go::TestStaleNode (EC-WS-3)` |
| EC-WS-4 | primary | `01_Product/01_FUNCTIONAL_REQUIREMENTS.md#workspace-ws` | PH03-R02, PH03-R03 | Permission-denied subtree is skipped with an indicator while siblings continue. | `internal/workspace/service_test.go::TestPermissionDeniedSubtree (EC-WS-4)` |
| EC-WS-5 | primary | `01_Product/01_FUNCTIONAL_REQUIREMENTS.md#workspace-ws` | PH03-R02 | Symlink cycles terminate within the traversal bound. | `internal/workspace/service_test.go::TestSymlinkCycle (EC-WS-5)` |
| EC-WS-6 | primary | `01_Product/01_FUNCTIONAL_REQUIREMENTS.md#workspace-ws` | PH03-R02 | Manual refresh reflects external create/rename without a live watcher. | `frontend/src/ui/widgets/FileExplorer.test.tsx::manual refresh (EC-WS-6)` |
| EC-WS-7 | primary | `01_Product/01_FUNCTIONAL_REQUIREMENTS.md#workspace-ws` | PH03-R03 | Hidden, dot, and unsupported files never appear. | `internal/workspace/service_test.go::TestTreeFilter (EC-WS-7)` |
| EC-DOCS-1 | primary | `01_Product/03_FILES_TABS_WORKSPACE.md#edge-cases` | PH03-R05 | A missing Recent entry reports an error and is pruned before the list is offered again. | `internal/recent/service_test.go::TestMissingRecentPathIsPruned (EC-DOCS-1)` |
| EC-DND-1 | primary | `01_Product/03_FILES_TABS_WORKSPACE.md#drag-and-drop-open` | PH03-R08 | File drop with no document or an empty untitled document uses the current tab. | `frontend/e2e/file-drop.spec.ts::current tab (EC-DND-1)` |
| EC-DND-2 | primary | `01_Product/03_FILES_TABS_WORKSPACE.md#drag-and-drop-open` | PH03-R08 | Folder drop with no workspace opens in the current window. | `frontend/e2e/file-drop.spec.ts::first workspace (EC-DND-2)` |
| EC-DND-3 | primary | `01_Product/03_FILES_TABS_WORKSPACE.md#drag-and-drop-open` | PH03-R09, PH03-R10 | Occupied-workspace drop prompts current/new window; replacement awaits the resolved dirty-tab policy. | `frontend/e2e/file-drop.spec.ts::workspace choice (EC-DND-3)` |
| EC-DND-4 | primary | `01_Product/03_FILES_TABS_WORKSPACE.md#drag-and-drop-open` | PH03-R08 | Dropping an open canonical path focuses its tab. | `frontend/e2e/file-drop.spec.ts::focus duplicate (EC-DND-4)` |
| EC-DND-5 | primary | `01_Product/03_FILES_TABS_WORKSPACE.md#drag-and-drop-open` | PH03-R08 | Unsupported file shows a toast and opens nothing. | `frontend/e2e/file-drop.spec.ts::unsupported file (EC-DND-5)` |
| EC-DND-6 | primary | `01_Product/03_FILES_TABS_WORKSPACE.md#drag-and-drop-open` | PH03-R09 | Mixed files and folders follow deterministic per-item flows and the last opened file receives focus. | `frontend/e2e/file-drop.spec.ts::mixed drop focuses last file (EC-DND-6)` |
| EC-DND-7 | primary | `01_Product/03_FILES_TABS_WORKSPACE.md#drag-and-drop-open` | PH03-R08 | Non-file drop is ignored safely. | `frontend/e2e/file-drop.spec.ts::non-file ignored (EC-DND-7)` |
| EC-DND-8 | primary | `01_Product/03_FILES_TABS_WORKSPACE.md#drag-and-drop-open` | PH03-R08 | Webview default navigation is suppressed on every OS. | `docs/phase-evidence/PH03-drop-runtime.md (EC-DND-8)` |
| EC-DND-9 | primary | `01_Product/03_FILES_TABS_WORKSPACE.md#drag-and-drop-open` | PH03-R09 | A disappeared path reports an error and opens nothing. | `internal/fileassoc/service_test.go::TestDroppedPathDisappears (EC-DND-9)` |

### Edge cases

Compatibility anchor for story citations created before the normative edge ledger.

## Non-normative work packages

| ID | Capability | Size | Modules | Artifacts | Requirements | Depends on |
|---|---|---|---|---|---|---|
| PH03-W01 | Own and project the workspace root. | M | `internal/appmodel/`; `internal/workspace/`; `logic/adapter/`; `logic/store/` | generated bindings | PH03-R01 | PH02-C03; PH01-C05 |
| PH03-W02 | Enumerate workspace children lazily and safely. | M | `internal/workspace/`; `internal/file/` | filesystem fixtures | PH03-R02 | PH03-W01 workspace identity |
| PH03-W03 | Build the accessible filtered tree and refresh states. | M | `logic/store/`; `ui/components/`; `ui/widgets/` | responsive Playwright baseline | PH03-R03 | PH03-W02 enumeration contract |
| PH03-W04 | Route tree selections into canonical tab open. | S | `logic/adapter/`; `logic/store/`; `ui/widgets/` | none | PH03-R04 | PH03-W03 selection; PH03-C01 |
| PH03-W05 | Persist bounded multi-instance-safe recent paths. | M | `internal/recent/`; `internal/db/`; `internal/apperr/` | additive migration if required | PH03-R05 | PH00-C04; PH02-C02 |
| PH03-W06 | Surface Recent and explicit reopen-last without auto-restore. | M | `logic/adapter/`; `logic/store/`; `ui/widgets/` | menu wiring | PH03-R06 | PH03-W05 MRU contract; PH03-C01 |
| PH03-W07 | Open validated targets in a separate app instance. | M | `internal/application/`; `internal/fileassoc/`; `logic/adapter/` | `main.go`; platform launch wiring | PH03-R07 | PH00-C01; PH03-W05 shared DB contract |
| PH03-W08 | Capture native drops and expose safe overlay feedback. | M | `internal/fileassoc/`; `internal/application/`; `logic/hooks/`; `ui/components/` | `main.go`; `wails.json` | PH03-R08 | PH03-C01; PH03-W01 workspace command |
| PH03-W09 | Orchestrate mixed and occupied-workspace drops. | M | `logic/hooks/`; `logic/adapter/`; `ui/widgets/` | cross-platform drop evidence | PH03-R09, PH03-R10 | PH03-W07 new-window contract; PH03-W08 drop capture; PH02-X03 and PH03-X01 resolution for PH03-R10 |

## Phase exit evidence

| ID | Requirements | Tier | Proof / artifact | Platform / scope | Owner | Freshness | Blocking |
|---|---|---|---|---|---|---|---|
| PH03-E01 | PH03-R01, PH03-R02, PH03-R03 | automated | workspace service bounds/filter/cycle tests and projected tree integration tests | all | tester | current HEAD | yes |
| PH03-E02 | PH03-R04 | automated | tree selection duplicate-focus and open-mode integration matrix | all entry modes | tester | current HEAD | yes |
| PH03-E03 | PH03-R05, PH03-R06, PH03-R07 | automated | recent MRU/pruning/concurrency and clean-launch tests | multi-process | tester | current HEAD | yes |
| PH03-E04 | PH03-R08, PH03-R09 | automated | native drop classification, stale-path, mixed ordering, and overlay tests | all | tester | current HEAD | yes |
| PH03-E05 | PH03-R10 | automated | occupied-workspace dirty-tab sequence after both PH02-X03 and PH03-X01 resolutions | all dirty-tab combinations | tester | resolution revision | yes |
| PH03-E06 | PH03-R01, PH03-R02, PH03-R03, PH03-R04, PH03-R05, PH03-R06, PH03-R07 | real-runtime | `docs/phase-evidence/PH03-wails-runtime.md` | macOS, Windows, Linux | tester | current HEAD and platform matrix | yes |
| PH03-E07 | PH03-R08, PH03-R09 | real-runtime | `docs/phase-evidence/PH03-drop-runtime.md` | macOS, Windows, Linux including WebKitGTK | tester | current HEAD and platform matrix | yes |
| PH03-E08 | PH03-R03, PH03-R08 | human | `docs/phase-evidence/PH03-workspace-approval.md` | responsive tree and drop overlay | product owner | current release candidate | yes |

### Phase exit checklist

Compatibility anchor for story citations created before the normative exit-evidence table.

## Open specification conflicts

| ID | Conflicting or missing sources | Required decision | Blocked requirements |
|---|---|---|---|
| PH03-X01 | `01_Product/03_FILES_TABS_WORKSPACE.md#drag-and-drop-open`; `07_Phases/PHASE_02_FILE_IO_TABS.md#open-specification-conflicts` require workspace replacement to reuse dirty-tab handling, while PH02-X03 leaves multi-dirty ordering/atomicity unresolved and no source defines multi-folder cancellation after a replacement choice. | Resolve PH02-X03, then define only the workspace/multi-folder cancellation boundary without choosing partial-progress behavior here. | PH03-R10 |
| PH03-X02 | `00_Foundation/06_IMPLEMENTATION_STAGES.md#2-stage--phase-mapping`; `07_Phases/00_ROADMAP.md#roadmap`; `07_Phases/PHASE_02_FILE_IO_TABS.md#phase-metadata` place PH03 in Stage 1 while making it depend on Stage-2 PH02 capability. | Define the stage checkpoint chronology that allows PH03 to consume PH02 without claiming an impossible Stage-1 completion order. | PH03-R01, PH03-R02, PH03-R03, PH03-R04, PH03-R05, PH03-R06, PH03-R07, PH03-R08, PH03-R09, PH03-R10 |

## Clarification revision

2026-07-21 — Reframed the phase around authoritative workspace identity, bounded asynchronous enumeration, canonical path consumers, MRU lifetime, and deterministic native-drop transitions. Added primary Recent pruning, last-file drop focus, PH02 dirty-lifecycle dependency, and the unresolved Stage-1/PH02 chronology without selecting policy.
