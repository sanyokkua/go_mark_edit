**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester, reviewer
**Last Updated:** 2026-07-21
**Cross-references:** `00_ROADMAP.md`, `../01_Product/03_FILES_TABS_WORKSPACE.md`, `../02_Architecture/02_BACKEND_GO.md`, `../02_Architecture/03_FRONTEND_REACT.md`, `../02_Architecture/04_WAILS_INTEGRATION.md`, `../02_Architecture/05_STATE_AND_PERSISTENCE.md`, `../00_Foundation/04_DESIGN_DECISIONS.md`, `../06_Process_and_Traceability/07_PHASE_FORMAT.md`

# Phase 02 — File I/O + Tabs

## Goal

Add the Stage-2 file write path and backend-owned tab set: new/open/save/save-as, encoding and line-ending handling, autosave for existing files, dirty prompts, tab lifecycle/reordering, and active-document window title. Every write flushes the editor queue before writing canonical backend content.

## Phase metadata

| Phase | Kind | Stage / milestone | Depends on | Completion scope |
|---|---|---|---|---|
| PH02 | sequential | Stage 2 / M2 | PH01 | once per implemented revision |

## Scope

- `internal/docs` supplies native-dialog-backed, envelope-safe read/write operations and atomic failure behavior.
- `internal/appmodel` composes docs operations and owns every open document, canonical content, dirty state, tab order, active tab, path, encoding, line ending, and view state.
- Adapter/store slices remain metadata projections; file, tab, close, save, and autosave actions are backend commands.
- The UI provides tabs, status encoding/line-ending values, dirty prompts, autosave indication, and window title synchronization.

## Out of scope

- Folder workspace and recent-path UI (PH03), full reading mode/render extensions (PH04), and OS association routing (PH07).
- Live external-file watching or automatic session restoration.

## Requirement ledger

| ID | Required outcome | Source clauses | Constraints | Work package |
|---|---|---|---|---|
| PH02-R01 | New creates an empty never-saved Editor document; Open uses a filtered native dialog and focuses an already-open canonical path. | `01_Product/03_FILES_TABS_WORKSPACE.md#new-open-save`; `02_Architecture/04_WAILS_INTEGRATION.md#dialogs-runtime` | DD-07; DD-12; backend-owned document identity | PH02-W01 |
| PH02-R02 | Save and Save As flush pending buffer state, write only canonical backend content, update path/metadata, clear dirty only on success, and report OS errors. | `01_Product/03_FILES_TABS_WORKSPACE.md#new-open-save`; `01_Product/03_FILES_TABS_WORKSPACE.md#save-as`; `02_Architecture/02_BACKEND_GO.md#file-io` | DD-62; DD-64; Result envelopes; no partial replacement | PH02-W02 |
| PH02-R03 | New files use UTF-8; opened files preserve BOM and LF/CRLF on round trip and expose encoding/line-ending status. | `01_Product/03_FILES_TABS_WORKSPACE.md#encoding-and-line-endings` | DD-15; byte-safe round trip | PH02-W03 |
| PH02-R04 | Non-UTF-8 or binary-ish input behavior is not implemented until lossless edit/save semantics are defined. | `01_Product/03_FILES_TABS_WORKSPACE.md#encoding-and-line-endings` | EC-DOCS-8; blocked by PH02-X02 | PH02-W03 |
| PH02-R05 | `internal/appmodel` owns tab order and active tab and emits revisioned content-free patches for every tab command. | `01_Product/03_FILES_TABS_WORKSPACE.md#tabs`; `02_Architecture/02_BACKEND_GO.md#application-model` | DD-62; DD-63; EC-TABS-7 | PH02-W04 |
| PH02-R06 | The tab UI supports focus, add, close, keyboard/middle-click close, reorder, overflow, duplicate suppression, basename disambiguation, and a defined empty state. | `01_Product/03_FILES_TABS_WORKSPACE.md#tabs` | accessible keyboard behavior; responsive layout | PH02-W05 |
| PH02-R07 | Dirty is computed from canonical backend versus disk content; single-document close uses Save, Discard, Cancel, while multi-dirty window/quit ordering remains blocked. | `01_Product/03_FILES_TABS_WORKSPACE.md#dirty-state`; `02_Architecture/04_WAILS_INTEGRATION.md#lifecycle` | DD-62; DD-64; EC-DOCS-5; blocked by PH02-X03 for multiple dirty documents | PH02-W06 |
| PH02-R08 | Autosave defaults on for existing files only, flushes the active buffer first, writes canonical content, and leaves dirty state intact when disabled or failed. | `01_Product/03_FILES_TABS_WORKSPACE.md#autosave`; `02_Architecture/05_STATE_AND_PERSISTENCE.md#file-first` | DD-12; DD-62; DD-64; no shadow copies | PH02-W07 |
| PH02-R09 | Save/autosave await the active buffer queue; tab switch/close also await applicable view state before transferring or consuming the active session. | `02_Architecture/03_FRONTEND_REACT.md#state-ownership`; `01_Product/03_FILES_TABS_WORKSPACE.md#new-open-save` | latest intent; no frontend text writes | PH02-W02 |
| PH02-R10 | External modification is detected before overwrite and preserves the recoverable buffer; deletion, permission, missing-path, and overwrite conditions have explicit non-destructive outcomes. | `01_Product/01_FUNCTIONAL_REQUIREMENTS.md#documents--files-docs`; `01_Product/03_FILES_TABS_WORKSPACE.md#new-open-save` | no silent overwrite; exact external-change choice set is PH02-R13 | PH02-W08 |
| PH02-R11 | Active document and dirty state are reflected in the native window title from backend projection state. | `07_Phases/00_ROADMAP.md#roadmap`; `01_Product/03_FILES_TABS_WORKSPACE.md#dirty-state`; `02_Architecture/04_WAILS_INTEGRATION.md#lifecycle` | adapter-only Wails runtime access | PH02-W09 |
| PH02-R12 | Fresh-open persisted-arrangement behavior remains blocked until accepted precedence is made consistent. | `01_Product/02_EDITOR_AND_VIEWER_MODES.md#per-document-view-state`; `01_Product/02_EDITOR_AND_VIEWER_MODES.md#default-open-mode` | blocked by PH02-X01; applies to every file-system entry path | PH02-W01 |
| PH02-R13 | The external-modification prompt's exact choices and any Compare-later state remain unimplemented until conflicting accepted sources are reconciled. | `01_Product/01_FUNCTIONAL_REQUIREMENTS.md#documents--files-docs`; `01_Product/03_FILES_TABS_WORKSPACE.md#edge-cases` | blocked by PH02-X04; do not invent deferred comparison state | PH02-W08 |

## State and transition model

| ID | Trigger | Preconditions | Ordered behavior | Result | Failure / preservation | Requirements |
|---|---|---|---|---|---|---|
| PH02-T01 | New | Application is initialized | Create backend document identity and empty canonical buffer; append and activate tab; emit patch | Empty never-saved Editor tab is active and ineligible for autosave | Preserve existing tabs if creation fails | PH02-R01, PH02-R05 |
| PH02-T02 | Open | User selects a supported path | Canonicalize path; focus existing tab or read bytes and metadata; create backend doc; append/activate; emit patch | One tab represents the path | Cancel is no-op; read failure opens nothing and reports error | PH02-R01, PH02-R03, PH02-R05, PH02-R10, PH02-R12 |
| PH02-T03 | Save or autosave | Document has a path | Flush buffer; run enabled pre-save actions later; atomically write canonical backend content; refresh baseline; clear dirty; emit patch | Disk and canonical state agree | On flush/write failure keep dirty and recoverable buffer; do not partially replace file | PH02-R02, PH02-R08, PH02-R09 |
| PH02-T04 | Save As | Document exists | Flush buffer; show native dialog; confirm overwrite natively; write canonical content; assign path/metadata; clear dirty; emit patch | Document tracks chosen path and becomes autosave eligible | Cancel is no-op; failure keeps old path, dirty state, and buffer | PH02-R02, PH02-R09, PH02-R10 |
| PH02-T05 | Switch active tab | Target tab exists | Flush current document queues; enqueue backend SetActiveTab; patch projection; attach active editor session to target | Target content and view become active | Failed flush keeps current tab active; no partial switch | PH02-R05, PH02-R09 |
| PH02-T06 | Close tab or window | One or more documents exist | Flush target state; inspect backend dirty flag; for one dirty target prompt Save, Discard, Cancel; do not execute a multi-dirty batch until PH02-X03 is resolved | A clean or accepted single tab closes and last close yields empty state | Cancel/save failure preserves the target; multi-dirty window/quit remains blocked rather than assuming partial progress | PH02-R06, PH02-R07, PH02-R09 |
| PH02-T07 | Reorder or middle-click/keyboard close | Target tab exists | Send backend command; mutate order/close under lock; emit patch; restore accessible focus | Projection matches authoritative tab set | Reject stale target revision without corrupting order | PH02-R05, PH02-R06 |
| PH02-T08 | External path changed or disappeared | Open document has a path | Detect at defined focus/save checkpoint; compare baseline; prevent overwrite and preserve the working buffer; do not present or execute the unresolved choice flow until PH02-X04 is resolved | No silent overwrite and buffer remains recoverable; choice execution is deferred | Detection/read errors keep dirty content and report status | PH02-R10, PH02-R13 |

## Cross-phase contracts

| ID | Producer | Consumer | Interface / invariant | Availability / lifetime | Ordering / concurrency | Source | Requirements |
|---|---|---|---|---|---|---|---|
| PH02-C01 | PH01 buffer/view queues | PH02 save, tab, and close commands | Save/autosave flush only the pending buffer before canonical writes; hide/switch/close flush the applicable buffer and view state before active-session transfer | Active editor session lifetime | Each boundary joins only its required per-document queues and awaits acknowledgement | `02_Architecture/03_FRONTEND_REACT.md#state-ownership` | PH02-R02, PH02-R09 |
| PH02-C02 | PH02 `internal/docs` | PH02 appmodel and PH03/PH07 open routes | Canonical path read/write service with encoding metadata and Result envelopes | Process lifetime | Appmodel is the sole frontend-facing composer | `02_Architecture/02_BACKEND_GO.md#application-model` | PH02-R01, PH02-R02, PH02-R03 |
| PH02-C03 | PH02 appmodel tab set | PH03 workspace tree, PH07 associations, PH08 default mode | Open/focus/close/reorder commands with stable document identity | Document/tab lifetime | Canonical-path deduplication occurs before adding a tab | `01_Product/03_FILES_TABS_WORKSPACE.md#tabs` | PH02-R05, PH02-R06, PH02-R12 |
| PH02-C04 | PH02 dirty/save lifecycle | PH03 folder replacement and PH07 app close | Single-target Save, Discard, Cancel preserves unsaved content; multi-dirty orchestration is blocked by PH02-X03 | Document and window lifetime | Flush precedes each dirty decision and save; no batch atomicity is assumed | `01_Product/03_FILES_TABS_WORKSPACE.md#dirty-state` | PH02-R07, PH02-R09 |
| PH02-C05 | PH02 file metadata | PH04 reader and PH06 export | Backend path, encoding, line-ending, and canonical-content accessors | Document lifetime | Metadata updates atomically with successful open/save | `02_Architecture/02_BACKEND_GO.md#application-model` | PH02-R02, PH02-R03 |

## Edge and failure cases

| Edge case | Role | Source clause | Requirements | Expected behavior | Evidence |
|---|---|---|---|---|---|
| EC-DOCS-1 | precursor | `01_Product/01_FUNCTIONAL_REQUIREMENTS.md#documents--files-docs` | PH02-R10 | A direct open of a missing path reports a clear error; PH03 owns Recent removal and primary evidence. | `internal/docs/service_test.go::TestMissingPath (EC-DOCS-1)` |
| EC-DOCS-2 | primary | `01_Product/01_FUNCTIONAL_REQUIREMENTS.md#documents--files-docs` | PH02-R10, PH02-R13 | External modification is detected and cannot be silently overwritten; the exact Reload/Keep mine versus Reload/Keep mine/Compare-later choice set is blocked by PH02-X04. | `internal/docs/service_test.go::TestExternalModification (EC-DOCS-2)` |
| EC-DOCS-3 | primary | `01_Product/01_FUNCTIONAL_REQUIREMENTS.md#documents--files-docs` | PH02-R10 | Deleted backing file leaves a dirty detached buffer and Save can recreate it. | `internal/docs/service_test.go::TestDeletedBackingFile (EC-DOCS-3)` |
| EC-DOCS-5 | primary | `01_Product/01_FUNCTIONAL_REQUIREMENTS.md#documents--files-docs` | PH02-R07 | Close or quit prompts Save, Discard, Cancel. | `frontend/src/ui/widgets/ClosePrompt.test.tsx::dirty close choices (EC-DOCS-5)` |
| EC-DOCS-6 | primary | `01_Product/01_FUNCTIONAL_REQUIREMENTS.md#documents--files-docs` | PH02-R08 | A never-saved document is never autosaved. | `frontend/src/logic/hooks/useAutosave.test.ts::skips new buffer (EC-DOCS-6)` |
| EC-DOCS-7 | primary | `01_Product/01_FUNCTIONAL_REQUIREMENTS.md#documents--files-docs` | PH02-R02, PH02-R10 | Permission failure is surfaced and dirty state remains true. | `internal/docs/service_test.go::TestPermissionDenied (EC-DOCS-7)` |
| EC-DOCS-8 | primary | `01_Product/01_FUNCTIONAL_REQUIREMENTS.md#documents--files-docs` | PH02-R04 | No non-UTF-8 edit/save path ships until PH02-X02 defines lossless semantics. | `internal/docs/encoding_test.go::TestNonUTF8Policy (EC-DOCS-8)` |
| EC-DOCS-9 | primary | `01_Product/01_FUNCTIONAL_REQUIREMENTS.md#documents--files-docs` | PH02-R03 | BOM and LF/CRLF are preserved after editing. | `internal/docs/encoding_test.go::TestRoundTripMetadata (EC-DOCS-9)` |
| EC-DOCS-10 | primary | `01_Product/01_FUNCTIONAL_REQUIREMENTS.md#documents--files-docs` | PH02-R02 | Native Save As confirms overwrite and cancellation changes nothing. | `internal/docs/service_test.go::TestSaveAsOverwrite (EC-DOCS-10)` |
| EC-DOCS-11 | primary | `01_Product/01_FUNCTIONAL_REQUIREMENTS.md#documents--files-docs` | PH02-R01, PH02-R05 | Reopening a canonical path focuses its existing tab. | `internal/appmodel/service_test.go::TestOpenExistingPath (EC-DOCS-11)` |
| EC-DOCS-13 | primary | `01_Product/01_FUNCTIONAL_REQUIREMENTS.md#documents--files-docs` | PH02-R02, PH02-R09 | Save and autosave include the newest pending edit and never accept frontend text. | `frontend/src/logic/adapter/appModelAdapter.test.ts::flushes before save (EC-DOCS-13)` |
| EC-TABS-1 | primary | `01_Product/01_FUNCTIONAL_REQUIREMENTS.md#tabs-tabs` | PH02-R05, PH02-R06 | Duplicate open activates the existing tab. | `internal/appmodel/service_test.go::TestDuplicateTabFocus (EC-TABS-1)` |
| EC-TABS-2 | primary | `01_Product/01_FUNCTIONAL_REQUIREMENTS.md#tabs-tabs` | PH02-R06 | Overflow scrolls without breaking layout. | `frontend/e2e/tabs.spec.ts::tab overflow (EC-TABS-2)` |
| EC-TABS-3 | primary | `01_Product/01_FUNCTIONAL_REQUIREMENTS.md#tabs-tabs` | PH02-R07 | Dirty tab close prompts Save, Discard, Cancel. | `frontend/src/ui/widgets/TabBar.test.tsx::dirty close (EC-TABS-3)` |
| EC-TABS-4 | primary | `01_Product/01_FUNCTIONAL_REQUIREMENTS.md#tabs-tabs` | PH02-R06 | Same basenames display disambiguating path hints. | `frontend/src/ui/widgets/TabBar.test.tsx::duplicate basenames (EC-TABS-4)` |
| EC-TABS-5 | primary | `01_Product/01_FUNCTIONAL_REQUIREMENTS.md#tabs-tabs` | PH02-R06 | Closing the final tab produces the defined empty state. | `frontend/src/ui/widgets/TabBar.test.tsx::last tab empty state (EC-TABS-5)` |
| EC-TABS-6 | primary | `01_Product/01_FUNCTIONAL_REQUIREMENTS.md#tabs-tabs` | PH02-R06 | Keyboard, middle-click, and reorder semantics stay consistent and accessible. | `frontend/src/ui/widgets/TabBar.test.tsx::tab interactions (EC-TABS-6)` |
| EC-TABS-7 | primary | `01_Product/01_FUNCTIONAL_REQUIREMENTS.md#tabs-tabs` | PH02-R05 | All tab mutations round-trip through appmodel patches. | `internal/appmodel/service_test.go::TestTabProjectionCommands (EC-TABS-7)` |
| EC-SET-4 | primary | `01_Product/01_FUNCTIONAL_REQUIREMENTS.md#settings-set` | PH02-R08 | Turning autosave off leaves the buffer dirty. | `frontend/src/logic/hooks/useAutosave.test.ts::disabled remains dirty (EC-SET-4)` |

### Edge cases

Compatibility anchor for story citations created before the normative edge ledger.

## Non-normative work packages

| ID | Capability | Size | Modules | Artifacts | Requirements | Depends on |
|---|---|---|---|---|---|---|
| PH02-W01 | Create/open documents through native dialogs and canonical-path deduplication. | M | `internal/docs/`; `internal/appmodel/`; `internal/application/` | generated bindings | PH02-R01, PH02-R12 | PH01-C01; PH02-X01 resolution for PH02-R12 |
| PH02-W02 | Implement canonical save and Save As with ordered flush and atomic failure semantics. | M | `internal/docs/`; `internal/appmodel/`; `logic/adapter/` | generated bindings | PH02-R02, PH02-R09 | PH01-C02; PH02-W01 read contract |
| PH02-W03 | Detect and preserve encoding and line-ending metadata. | M | `internal/docs/` | byte fixtures | PH02-R03, PH02-R04 | PH02-W01 read contract; PH02-X02 resolution for PH02-R04 |
| PH02-W04 | Own tab order and active tab in appmodel. | M | `internal/appmodel/`; `logic/adapter/`; `logic/store/` | generated bindings | PH02-R05 | PH02-W01 identity contract; PH01-C05 |
| PH02-W05 | Build accessible projected tab interactions and overflow. | M | `logic/store/`; `ui/components/`; `ui/widgets/` | responsive Playwright baseline | PH02-R06 | PH02-W04 command/patch contract |
| PH02-W06 | Implement dirty close and quit decisions. | M | `internal/appmodel/`; `logic/hooks/`; `ui/widgets/` | native lifecycle wiring | PH02-R07 | PH02-W02 save contract; PH02-W04 tab lifecycle |
| PH02-W07 | Autosave existing documents through the canonical save path. | M | `logic/hooks/`; `logic/adapter/`; `internal/settings/` | none | PH02-R08 | PH02-W02 save contract; PH00-C04 |
| PH02-W08 | Detect and handle external path failures safely. | M | `internal/docs/`; `internal/appmodel/`; `ui/widgets/` | filesystem fixtures | PH02-R10, PH02-R13 | PH02-W02 save contract; PH02-W06 prompt contract; PH02-X04 resolution for PH02-R13 |
| PH02-W09 | Synchronize native window title from projected active state. | S | `logic/adapter/`; `logic/store/` | Wails runtime wiring | PH02-R11 | PH02-W04 active-tab contract |

## Phase exit evidence

| ID | Requirements | Tier | Proof / artifact | Platform / scope | Owner | Freshness | Blocking |
|---|---|---|---|---|---|---|---|
| PH02-E01 | PH02-R01, PH02-R02, PH02-R09 | automated | docs/appmodel integration tests proving immediate-keystroke save and atomic errors | all | tester | current HEAD | yes |
| PH02-E02 | PH02-R03, PH02-R04 | automated | byte-fixture round-trip suite; PH02-R04 proof after conflict resolution | all supported encodings | tester | current HEAD | yes |
| PH02-E03 | PH02-R05, PH02-R06 | automated | appmodel tab command tests and responsive accessible TabBar tests | 375, 768, 1280 px | tester | current HEAD | yes |
| PH02-E04 | PH02-R07, PH02-R08, PH02-R10 | automated | close/quit/autosave/external-change adversarial tests | all | tester | current HEAD | yes |
| PH02-E05 | PH02-R11 | automated | window-title adapter test | all | tester | current HEAD | yes |
| PH02-E06 | PH02-R12 | automated | file-entry precedence matrix after PH02-X01 resolution | dialog, OS, drop, tree | tester | resolution revision | yes |
| PH02-E07 | PH02-R01, PH02-R02, PH02-R03, PH02-R05, PH02-R07, PH02-R08, PH02-R11 | real-runtime | `docs/phase-evidence/PH02-wails-runtime.md` | macOS, Windows, Linux | tester | current HEAD and platform matrix | yes |
| PH02-E08 | PH02-R06, PH02-R07, PH02-R11 | human | `docs/phase-evidence/PH02-tabs-approval.md` | native desktop | product owner | current release candidate | yes |
| PH02-E09 | PH02-R13 | automated | external-change prompt/state matrix after PH02-X04 resolution | focus and save checkpoints | tester | resolution revision | yes |

### Phase exit checklist

Compatibility anchor for story citations created before the normative exit-evidence table.

## Open specification conflicts

| ID | Conflicting or missing sources | Required decision | Blocked requirements |
|---|---|---|---|
| PH02-X01 | `01_Product/02_EDITOR_AND_VIEWER_MODES.md#per-document-view-state` and `01_Product/02_EDITOR_AND_VIEWER_MODES.md#default-open-mode` prescribe opposite precedence for persisted arrangement on a fresh Editor-mode file-system open. | Define one precedence matrix for dialog, OS, drop, and workspace-tree opens. | PH02-R12 |
| PH02-X02 | `01_Product/03_FILES_TABS_WORKSPACE.md#encoding-and-line-endings` requires tolerantly decoded non-UTF-8/binary-ish text to remain uncorrupted after editable string round trips, but no source defines original encoding detection, byte preservation, or encoding-on-save behavior. | Define supported encodings and the exact byte-preservation/edit/save policy. | PH02-R04 |
| PH02-X03 | `01_Product/03_FILES_TABS_WORKSPACE.md#dirty-state`; `02_Architecture/04_WAILS_INTEGRATION.md#lifecycle` require Save, Discard, Cancel for dirty close/window/quit but do not define multi-document prompt order, whether choices are gathered before mutation, or what Cancel/save failure means after earlier saves. | Define multi-dirty close/window/quit ordering, atomicity, and cancellation/failure semantics. | PH02-R07 |
| PH02-X04 | `01_Product/01_FUNCTIONAL_REQUIREMENTS.md#documents--files-docs` requires Reload, Keep mine, and Compare-later for EC-DOCS-2, while `01_Product/03_FILES_TABS_WORKSPACE.md#edge-cases` lists only Reload and Keep mine and no accepted source defines Compare-later state or later comparison behavior. | Define the authoritative external-modification choice set and, if retained, Compare-later state semantics. | PH02-R13 |

## Clarification revision

2026-07-21 — Replaced component-biased story suggestions with canonical write, queue, tab-lifecycle, error, and consumer contracts. Split all work into S/M packages and recorded unresolved file-open precedence, non-UTF-8 preservation, multi-dirty close, and external-change choice semantics.
