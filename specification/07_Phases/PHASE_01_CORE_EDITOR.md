**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester, reviewer
**Last Updated:** 2026-07-21
**Cross-references:** `00_ROADMAP.md`, `../01_Product/02_EDITOR_AND_VIEWER_MODES.md`, `../01_Product/05_RENDERING_AND_EXTENSIONS.md`, `../02_Architecture/02_BACKEND_GO.md`, `../02_Architecture/03_FRONTEND_REACT.md`, `../02_Architecture/05_STATE_AND_PERSISTENCE.md`, `../03_NonFunctional/02_PERFORMANCE.md`, `../00_Foundation/06_IMPLEMENTATION_STAGES.md`, `../06_Process_and_Traceability/07_PHASE_FORMAT.md`

# Phase 01 — Core Editor + Preview

## Goal

Deliver one backend-owned in-memory Markdown document with a responsive Monaco working copy, a safe debounced CommonMark/GFM preview, Editor/Split/Preview arrangements, and status information. The Redux store remains a content-free projection. File persistence arrives in PH02.

## Phase metadata

| Phase | Kind | Stage / milestone | Depends on | Completion scope |
|---|---|---|---|---|
| PH01 | sequential | Stage 1 / M1 preview; Stage 2 / M2 editing | PH00 | once per implemented revision |

## Scope

- `internal/appmodel` owns one new document's stable identity, canonical content, dirty/count metadata, document view, and application UI layout.
- The adapter hydrates from `GetState`, subscribes before the bootstrap race window, applies revisioned content-free patches, and sends commands back to the model.
- Monaco owns the immediately responsive visible working copy and one active editor session; changes debounce to `UpdateBuffer` and flush at lifecycle boundaries.
- Base CommonMark/GFM rendering is sanitized, local, debounced, and derived from accepted backend content.
- Editor, Split, and Preview arrangements, responsive pane layout, toggle synchronization, and a status bar are usable and accessible.
- F2, F3, and F7 establish a stable active-document command boundary consumable outside the editor widget.

## Out of scope

- File open/save, multiple tabs, autosave, and inactive-document editor models (PH02).
- Reading mode and extended rendering such as math, Mermaid, and highlighting (PH04).
- Format/lint behavior (PH05), production theme values (PH08), and all Stage-3 assistant behavior.

## Requirement ledger

| ID | Required outcome | Source clauses | Constraints | Work package |
|---|---|---|---|---|
| PH01-R01 | `internal/appmodel` is the mutex-guarded authority for the single document and UI state and exposes Result-wrapped query/command/event shapes. | `02_Architecture/02_BACKEND_GO.md#application-model`; `02_Architecture/05_STATE_AND_PERSISTENCE.md#in-memory-application-model` | DD-62; backend envelope; one owner | PH01-W01 |
| PH01-R02 | The frontend projection hydrates without losing patches, rejects stale revisions, and never becomes an independent authority. | `02_Architecture/03_FRONTEND_REACT.md#state-ownership`; `02_Architecture/03_FRONTEND_REACT.md#store` | DD-63; subscribe before snapshot; StrictMode safe | PH01-W02 |
| PH01-R03 | Typing updates Monaco immediately and coalesces buffer synchronization without bridge traffic on each keystroke. | `02_Architecture/03_FRONTEND_REACT.md#state-ownership`; `03_NonFunctional/02_PERFORMANCE.md#2-editor-responsiveness` | DD-64; adapter-owned debounce | PH01-W03 |
| PH01-R04 | Pending buffer work flushes before blur or switch/close boundaries, and pending buffer plus view work flushes before hiding the editor. | `02_Architecture/03_FRONTEND_REACT.md#state-ownership`; `01_Product/02_EDITOR_AND_VIEWER_MODES.md#split-view` | DD-64; ordered acknowledgement; save/autosave ordering belongs PH02 | PH01-W03 |
| PH01-R05 | Backend patches carry derived metadata and revision but never echo focused editor content or disturb cursor and selection. | `02_Architecture/02_BACKEND_GO.md#application-model`; `01_Product/02_EDITOR_AND_VIEWER_MODES.md#edge-cases` | DD-64; EC-DOCS-12; content-free projection | PH01-W02 |
| PH01-R06 | The active Monaco session and model survive Editor, Split, and Preview visibility changes with exact text, cursor, selection, undo history, and usable geometry. | `01_Product/02_EDITOR_AND_VIEWER_MODES.md#split-view`; `01_Product/02_EDITOR_AND_VIEWER_MODES.md#per-document-view-state` | resource lifetime follows active document, not pane visibility | PH01-W04 |
| PH01-R07 | Per-document view updates preserve latest user intent across debounce, explicit arrangement commands, flushes, failures, and out-of-order completions. | `01_Product/02_EDITOR_AND_VIEWER_MODES.md#view-mode-toggle`; `01_Product/02_EDITOR_AND_VIEWER_MODES.md#per-document-view-state` | DD-62; DD-63; serialized per-document command stream | PH01-W05 |
| PH01-R08 | Editor, Split, and Preview arrangements remain synchronized across segmented and menu controls and retain at least one visible pane. | `01_Product/02_EDITOR_AND_VIEWER_MODES.md#split-view`; `01_Product/02_EDITOR_AND_VIEWER_MODES.md#view-mode-toggle` | accessible controls; responsive layout | PH01-W05 |
| PH01-R09 | The active document has a stable command seam exposing content, selection, replace-range, and replace-all without sibling consumers reaching into Monaco. | `00_Foundation/06_IMPLEMENTATION_STAGES.md#stage-1-must-leave-open`; `00_Foundation/06_IMPLEMENTATION_STAGES.md#stage-2-must-leave-open` | F2; F3; F7; one Monaco undo edit per replacement | PH01-W06 |
| PH01-R10 | A non-editor sibling can consume the active-document command seam in Editor, Split, and Preview arrangements for the active session. | `00_Foundation/06_IMPLEMENTATION_STAGES.md#stage-1-must-leave-open`; `00_Foundation/06_IMPLEMENTATION_STAGES.md#stage-2-must-leave-open` | F3; F7; public session boundary | PH01-W06 |
| PH01-R11 | Base CommonMark/GFM content renders sanitized and offline from accepted backend content. | `01_Product/05_RENDERING_AND_EXTENSIONS.md#pipeline`; `01_Product/05_RENDERING_AND_EXTENSIONS.md#gfm-features`; `02_Architecture/03_FRONTEND_REACT.md#markdown-pipeline` | DD-20; DD-32; no runtime CDN or execution | PH01-W07 |
| PH01-R12 | Preview generation is debounced, stale completions cannot replace newer output, and very large input may pause without rolling back accepted content. | `01_Product/05_RENDERING_AND_EXTENSIONS.md#preview-debounce`; `03_NonFunctional/02_PERFORMANCE.md#3-preview-debounce-targets`; `03_NonFunctional/02_PERFORMANCE.md#4-large-file-handling` | DD-20; bounded work; latest generation wins | PH01-W07 |
| PH01-R13 | The status bar reports cursor, counts, arrangement, and placeholder encoding/line-ending state from the proper owner. | `01_Product/02_EDITOR_AND_VIEWER_MODES.md#editor-mode`; `01_Product/03_FILES_TABS_WORKSPACE.md#encoding-and-line-endings` | cursor is ephemeral editor state; counts are backend derived | PH01-W08 |
| PH01-R14 | Story lifecycle status agrees across board/frontmatter/trace, proving tests are collected once, and every declared edge case has exact named evidence. | `06_Process_and_Traceability/03_TRACEABILITY.md#the-two-commands`; `06_Process_and_Traceability/06_DEFINITION_OF_DONE.md#per-story` | STORY-020 ownership; exact EC ids; no duplicate test nodes; ready dependencies done | PH01-W09 |
| PH01-R15 | Phase completion does not conflate PH01's Stage-1 preview checkpoint with its Stage-2 editing checkpoint until the accepted chronology is defined. | `00_Foundation/06_IMPLEMENTATION_STAGES.md#2-stage--phase-mapping`; `00_Foundation/06_IMPLEMENTATION_STAGES.md#5-stage-exit-criteria`; `07_Phases/00_ROADMAP.md#stages` | blocked by PH01-X01; no premature phase/stage completion claim | PH01-W10 |
| PH01-R16 | Core user-facing status strings resolve through the bundled i18n catalog, missing keys fall back to English then key, and adding a locale requires only a bundled resource file. | `01_Product/13_I18N.md#i18n-layer`; `01_Product/13_I18N.md#adding-a-locale`; `01_Product/13_I18N.md#edge-cases` | DD-32; DD-35; EC-I18N-1; EC-I18N-2; no runtime fetch | PH01-W11 |

## State and transition model

| ID | Trigger | Preconditions | Ordered behavior | Result | Failure / preservation | Requirements |
|---|---|---|---|---|---|---|
| PH01-T01 | Application bootstrap | Event bridge and appmodel are available | Subscribe to patches; request snapshot; hydrate by revision; replay or accept only newer patches; release bootstrap state | Projection exactly matches the newest backend revision | Remove failed subscription state; retry starts clean and stale patches remain rejected | PH01-R01, PH01-R02 |
| PH01-T02 | User types | Active Monaco session exists | Update Monaco immediately; replace pending buffer intent; after debounce call `UpdateBuffer`; apply derived patch | Canonical content and dirty/count metadata converge without cursor movement | Retain newest unsent buffer and use the existing error surface | PH01-R03, PH01-R05 |
| PH01-T03 | Editor pane is about to hide | Active session may have pending buffer or view intent | Flush buffer; flush view queue; await acknowledgement; hide pane without disposing the session/model | Preview-only shows accepted content and the editor session remains recoverable | Keep editor/session visible and report failure when required acknowledgement fails | PH01-R04, PH01-R06, PH01-R07 |
| PH01-T04 | User selects Editor, Split, or Preview | Active document exists | Enqueue explicit arrangement after prior view intent; backend commits; patch reconciles controls; update pane visibility | Latest explicit arrangement is active in both control surfaces | Older completions cannot overwrite it; newest failed intent remains retryable | PH01-R07, PH01-R08 |
| PH01-T05 | Preview debounce expires | A newer accepted backend buffer revision exists | Start generation tagged with revision; sanitize result; publish only if still newest | Preview represents newest accepted generation | Discard stale or failed output; never roll back canonical content | PH01-R11, PH01-R12 |
| PH01-T06 | Sibling invokes a document command | Active document session exists in any arrangement | Resolve active session; read selection or apply one replacement; route edit into normal buffer queue | Consumer receives stable command semantics without Monaco access | Return a defined unavailable/error result if no active session; preserve editor state | PH01-R09, PH01-R10 |
| PH01-T07 | Editor arrangement becomes visible again | Same active session was hidden | Reveal existing session; restore layout; focus only when requested | Exact working text, cursor, selection, undo stack, and geometry remain usable | Never reseed from bootstrap content or create a competing model | PH01-R06 |

## Cross-phase contracts

| ID | Producer | Consumer | Interface / invariant | Availability / lifetime | Ordering / concurrency | Source | Requirements |
|---|---|---|---|---|---|---|---|
| PH01-C01 | PH01 `internal/appmodel` | PH02-PH14 | Stable document identity, canonical content accessor, command/event model | Document lifetime in the process | All mutations hold the model lock and emit revisioned patches | `02_Architecture/02_BACKEND_GO.md#application-model` | PH01-R01, PH01-R05 |
| PH01-C02 | PH01 adapter | PH02 file and tab lifecycle | `flushBuffer` acknowledges blur/switch/close boundaries; `flushDocView` additionally joins hide/switch view boundaries | Active session lifetime | Buffer and view queues preserve latest intent; PH02 defines save/autosave ordering | `02_Architecture/03_FRONTEND_REACT.md#state-ownership` | PH01-R03, PH01-R04, PH01-R07 |
| PH01-C03 | PH01 editor session | PH05 formatting and PH12-PH14 assistant consumers | Stable content, selection, replace-range, and replace-all API | Available for active document in Editor, Split, and Preview | Replacements are one undo edit and enter normal buffer synchronization | `00_Foundation/06_IMPLEMENTATION_STAGES.md#stage-2-must-leave-open` | PH01-R09, PH01-R10 |
| PH01-C04 | PH01 Markdown pipeline | PH04 renderer extensions and PH09 asset policy | Sanitized base pipeline with no unsolicited network | Document view lifetime | Tagged generations publish only when current | `02_Architecture/03_FRONTEND_REACT.md#markdown-pipeline` | PH01-R11, PH01-R12 |
| PH01-C05 | PH01 projected state | PH02 tabs and PH03 workspace | Redux contains document/UI metadata but no canonical content | Disposable webview lifetime | Hydrate before reconcile; ignore stale revisions | `02_Architecture/03_FRONTEND_REACT.md#state-ownership` | PH01-R02, PH01-R05 |
| PH01-C06 | PH01 UI composition | PH08 themes and PH11 assistant | Token-only responsive center document region within the reserved three-region shell | Application lifetime | Visibility changes do not own document session lifetime | `00_Foundation/06_IMPLEMENTATION_STAGES.md#stage-1-must-leave-open` | PH01-R06, PH01-R08 |

## Edge and failure cases

| Edge case | Role | Source clause | Requirements | Expected behavior | Evidence |
|---|---|---|---|---|---|
| EC-DOCS-12 | primary | `01_Product/02_EDITOR_AND_VIEWER_MODES.md#edge-cases` | PH01-R03, PH01-R05, PH01-R06 | Content-free patches and arrangement transitions preserve the focused session's text, cursor, and selection. | `frontend/src/ui/widgets/EditorView.integration.test.tsx::STORY-019-AC-3 preserves Monaco state on metadata patches (EC-DOCS-12)` |
| EC-RENDER-4 | precursor | `01_Product/02_EDITOR_AND_VIEWER_MODES.md#edge-cases` | PH01-R12 | Preview-only and split use the same bounded accepted-snapshot behavior; configurable pause/manual refresh completes later. | `frontend/src/logic/hooks/useLivePreview.test.ts::STORY-017-AC-3 bounds large-document preview work (EC-RENDER-4)` |
| EC-RENDER-5 | primary | `01_Product/05_RENDERING_AND_EXTENSIONS.md#edge-cases` | PH01-R11 | Raw HTML and dangerous URLs never execute. | `frontend/src/ui/components/MarkdownView.test.tsx::STORY-014-AC-4 disables raw HTML and dangerous URLs (EC-RENDER-5)` |
| EC-RENDER-6 | precursor | `01_Product/05_RENDERING_AND_EXTENSIONS.md#edge-cases` | PH01-R11 | Base preview leaves higher-tier syntax literal and non-executing; PH04 owns complete standard-level feature gating. | `frontend/src/ui/components/MarkdownView.test.tsx::STORY-014-AC-3 leaves higher-tier syntax and Mermaid safe (EC-RENDER-6)` |
| EC-RENDER-7 | primary | `01_Product/05_RENDERING_AND_EXTENSIONS.md#edge-cases` | PH01-R11 | Local/remote image input remains non-fetching readable fallback until PH09. | `frontend/src/ui/components/MarkdownView.test.tsx::STORY-014-AC-5 blocks document-supplied resource requests (EC-RENDER-7)` |
| EC-I18N-1 | precursor | `01_Product/13_I18N.md#edge-cases` | PH01-R16 | Missing status-bar translation falls back to English and then the key, never blank. | `frontend/src/i18n/catalog.test.ts::falls back to English and then the key without a blank label (EC-I18N-1)` |
| EC-I18N-2 | precursor | `01_Product/13_I18N.md#edge-cases` | PH01-R16 | A dropped-in locale resource is discovered without component changes. | `frontend/src/i18n/catalog.test.ts::discovers a dropped-in locale resource without component changes (EC-I18N-2)` |

### Edge cases

Compatibility anchor for completed Phase 01 story citations; the normative ownership and evidence are in the ledger above.

## Non-normative work packages

| ID | Capability | Size | Modules | Artifacts | Requirements | Depends on |
|---|---|---|---|---|---|---|
| PH01-W01 | Establish the authoritative in-memory application model. | M | `internal/appmodel/`; `internal/apperr/`; `internal/application/` | generated bindings | PH01-R01 | PH00-C01; PH00-C02 |
| PH01-W02 | Hydrate and reconcile the content-free revisioned projection. | M | `logic/adapter/`; `logic/store/`; `logic/utils/` | none | PH01-R02, PH01-R05 | PH01-W01 query/event contract; PH00-C03 |
| PH01-W03 | Synchronize the active Monaco buffer across lifecycle boundaries. | M | `logic/adapter/`; `logic/hooks/`; `ui/components/` | none | PH01-R03, PH01-R04 | PH01-W01 command contract; PH01-W02 revision contract |
| PH01-W04 | Preserve the active editor session across pane arrangements. | M | `logic/store/`; `ui/components/`; `ui/widgets/` | responsive Playwright baseline | PH01-R06 | PH01-W03 flush contract |
| PH01-W05 | Serialize and project per-document view intent. | M | `logic/adapter/`; `logic/store/`; `ui/components/` | none | PH01-R07, PH01-R08 | PH01-W02 projection |
| PH01-W06 | Expose the stable active-document command boundary. | M | `logic/hooks/`; `ui/components/`; `ui/widgets/` | static boundary rule | PH01-R09, PH01-R10 | PH01-W04 session lifetime; PH01-W03 buffer queue |
| PH01-W07 | Render safe debounced CommonMark/GFM preview generations. | M | `logic/markdown/`; `logic/hooks/`; `ui/components/` | bundled dependencies | PH01-R11, PH01-R12 | PH01-W02 accepted revision contract |
| PH01-W08 | Project cursor, counts, arrangement, and encoding placeholders in the status bar. | S | `logic/store/`; `ui/components/` | none | PH01-R13 | PH01-W02 projection; PH01-W04 session |
| PH01-W09 | Validate lifecycle and exact trace evidence. | M | `internal/application/` | `scripts/`; `docs/traceability.yaml`; story board | PH01-R14 | PH00-C06 trace contract |
| PH01-W10 | Define separate PH01 stage-checkpoint completion semantics after user direction. | S | `internal/application/` | phase evidence; trace completion rule | PH01-R15 | PH01-X01 resolution |
| PH01-W11 | Establish the bundled i18n catalog fallback and drop-in locale seam for core UI strings. | S | `i18n/`; `ui/components/` | `frontend/src/i18n/locales/en.json`; locale resource fixtures | PH01-R16 | PH00-C04; PH00-C06 |

## Phase exit evidence

| ID | Requirements | Tier | Proof / artifact | Platform / scope | Owner | Freshness | Blocking |
|---|---|---|---|---|---|---|---|
| PH01-E01 | PH01-R01, PH01-R02, PH01-R05 | automated | `go test -race ./internal/appmodel`; `npm --prefix frontend test -- appModelProjection.test.ts` | all | tester | current HEAD | yes |
| PH01-E02 | PH01-R03, PH01-R04, PH01-R06, PH01-R07 | automated | `npm --prefix frontend test -- appModelAdapter.test.ts EditorView.integration.test.tsx`; `just verify-ui` | 375, 768, 1280 px | tester | current HEAD | yes |
| PH01-E03 | PH01-R08, PH01-R13 | automated | `npm --prefix frontend test -- EditorView.integration.test.tsx`; `just verify-ui` | 375, 768, 1280 px | tester | current HEAD | yes |
| PH01-E04 | PH01-R09, PH01-R10 | automated | `npm --prefix frontend test -- useDocumentCommands.test.ts`; `just check` | all arrangements and import boundaries | tester | current HEAD | yes |
| PH01-E05 | PH01-R11, PH01-R12 | automated | `npm --prefix frontend test -- renderer.test.ts useLivePreview.test.ts MarkdownView.test.tsx` | all | tester | current HEAD | yes |
| PH01-E06 | PH01-R01, PH01-R03, PH01-R04, PH01-R06, PH01-R07, PH01-R08, PH01-R11, PH01-R13 | real-runtime | `docs/phase-evidence/PH01-wails-runtime.md` | native Wails dev on macOS, Windows, Linux | tester | current HEAD and platform matrix | yes |
| PH01-E07 | PH01-R08, PH01-R13 | human | `docs/phase-evidence/PH01-visual-approval.md` | frozen 1280 px mockup and responsive widths | product owner | current release candidate | yes |
| PH01-E08 | PH01-R11 | real-runtime | `docs/phase-evidence/PH01-network-trace.md` | Stage 1 and Stage 2 runtime | security reviewer | current release candidate | yes |
| PH01-E09 | PH01-R14 | automated | `just trace-check` and traceability fixture tests | all | tester | current HEAD | yes |
| PH01-E10 | PH01-R15 | automated | `just phase-complete-check 01` after PH01-X01 resolution and checkpoint-specific evidence | phase and stage claims | reviewer | resolution revision | yes |
| PH01-E11 | PH01-R16 | automated | `npm --prefix frontend test -- catalog.test.ts` | bundled locale resources and exact EC-I18N-1/2 tests | tester | current HEAD | yes |

### Phase exit checklist

Compatibility anchor for completed Phase 01 story citations; the normative blocking evidence is the table above.

## Open specification conflicts

| ID | Conflicting or missing sources | Required decision | Blocked requirements |
|---|---|---|---|
| PH01-X01 | `00_Foundation/06_IMPLEMENTATION_STAGES.md#2-stage--phase-mapping`; `00_Foundation/06_IMPLEMENTATION_STAGES.md#4-what-each-stage-explicitly-does-not-build`; `07_Phases/00_ROADMAP.md#stages` assign PH01 partly to Stage 1 and partly to Stage 2 while sequential phase completion precedes PH02. | Define whether PH01 is completed once after both parts or has separately claimable stage checkpoints. | PH01-R15 |

## Current remediation mapping

This factual mapping records the audit backlog; it does not reserve future story ids in the work-package ledger.

| Phase requirements | Current story | State |
|---|---|---|
| PH01-R14 | STORY-020 — Validate story lifecycle and edge-case trace evidence | done |
| PH01-R07 | STORY-021 — Serialize per-document view commands by latest intent | incomplete |
| PH01-R04, PH01-R06 | STORY-022 — Preserve the active Monaco session across view arrangements | incomplete |
| PH01-R09, PH01-R10 | STORY-023 — Expose document commands through the stable editor-session boundary | incomplete |

## Clarification revision

2026-07-21 — Reconstructed Phase 01 around ownership, ordered lifecycle transitions, adversarial async behavior, stable consumer seams, bundled i18n fallback/discovery, and durable exit proof. Made the audited Monaco lifetime, flush-before-hide, latest-intent, and F3/F7 obligations explicit and recorded the unresolved stage-completion chronology without choosing behavior.
