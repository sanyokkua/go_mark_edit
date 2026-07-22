**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester, reviewer
**Last Updated:** 2026-07-21
**Cross-references:** `00_ROADMAP.md`, `../00_Foundation/06_IMPLEMENTATION_STAGES.md`, `../01_Product/06_FORMAT_AND_LINT.md`, `../01_Product/11_SETTINGS.md`, `../01_Product/12_KEYBOARD_SHORTCUTS.md`, `../02_Architecture/07_LARGE_FILES_AND_CONCURRENCY.md`, `../03_NonFunctional/02_PERFORMANCE.md`, `../06_Process_and_Traceability/07_PHASE_FORMAT.md`

# Phase 05 — Format & Lint

## Goal

Provide pure, programmatically callable Format, Compact, and Lint capabilities with safe editor application, ordered on-save behavior, performant problem reporting, and reusable Stage-3 seams.

## Phase metadata

| Phase | Kind | Stage / milestone | Depends on | Completion scope |
|---|---|---|---|---|
| PH05 | sequential | Stage 2 / M2 | PH01, PH02, PH04 | once per implemented revision |

## Scope

- Pure Format and Compact transforms with canonical/user-selected Markdown style.
- Pure remark-lint execution, Monaco markers, hover messages, and status count.
- On-demand and on-save coordination through the active-document command boundary.
- Process-wide long-operation exclusion for large format-all work.
- F8 programmatic Format/Lint APIs and the F9 reusable diff-rendering producer.

## Out of scope

- Shortcut registry/menu/dialog chrome, owned by PH08; this phase exposes actions for it.
- PDF export, owned by PH06 but sharing the same process gate.
- Assistant actions and edit-proposal cards, which consume F8/F9 in PH12.

## Requirement ledger

| ID | Required outcome | Source clauses | Constraints | Work package |
|---|---|---|---|---|
| PH05-R01 | Format is a pure callable transform that normalizes tables, markers, headings, and wrapping using canonical or configured style without editor/UI dependencies. | `01_Product/06_FORMAT_AND_LINT.md#format`; `01_Product/06_FORMAT_AND_LINT.md#canonical-style`; `00_Foundation/06_IMPLEMENTATION_STAGES.md#stage-2-must-leave-open` | DD-16; DD-18; F8 | PH05-W01 |
| PH05-R02 | Compact is a conservative pure transform that removes only redundant whitespace and preserves fenced/indented code bytes and rendered meaning. | `01_Product/06_FORMAT_AND_LINT.md#compact`; `01_Product/06_FORMAT_AND_LINT.md#canonical-style` | DD-16; F8 | PH05-W02 |
| PH05-R03 | Lint is a pure callable analysis using the accepted rule set and never mutates the document. | `01_Product/06_FORMAT_AND_LINT.md#lint`; `01_Product/06_FORMAT_AND_LINT.md#lint-rules`; `00_Foundation/06_IMPLEMENTATION_STAGES.md#stage-2-must-leave-open` | DD-17; F8 | PH05-W03 |
| PH05-R04 | Lint findings map to exact Monaco ranges/messages and an accurate status count; disabled/clean states clear markers and many findings remain bounded. | `01_Product/06_FORMAT_AND_LINT.md#problems-surface`; `03_NonFunctional/02_PERFORMANCE.md#2-editor-responsiveness` | DD-17; no document mutation; capped/virtualized markers | PH05-W04 |
| PH05-R05 | On-demand Format/Compact applies through the stable document-command seam as one undo edit, preserves usable cursor/selection, and marks the canonical document dirty after normal buffer synchronization. | `01_Product/06_FORMAT_AND_LINT.md#format`; `01_Product/06_FORMAT_AND_LINT.md#compact`; `00_Foundation/06_IMPLEMENTATION_STAGES.md#stage-2-must-leave-open` | DD-62–64; F3; F7; no direct Monaco consumer | PH05-W05 |
| PH05-R06 | On save, enabled Format runs before Lint, the formatted buffer is acknowledged before disk save, and failure does not save a partially transformed state. | `01_Product/06_FORMAT_AND_LINT.md#on-save`; `01_Product/03_FILES_TABS_WORKSPACE.md#autosave` | DD-18; one undo step; cursor/selection preservation | PH05-W06 |
| PH05-R07 | Large format-all work participates in the process-wide non-blocking gate shared with export and reports busy/progress without blocking editing. | `01_Product/06_FORMAT_AND_LINT.md#format`; `02_Architecture/07_LARGE_FILES_AND_CONCURRENCY.md#gate`; `02_Architecture/07_LARGE_FILES_AND_CONCURRENCY.md#events-progress` | F5; frontend/backend acquisition contract blocked by PH05-X01 | PH05-W07 |
| PH05-R08 | A standalone reusable DiffView renders before/after changes independently of Format UI so Stage-3 edit proposals can consume it without restructuring. | `00_Foundation/06_IMPLEMENTATION_STAGES.md#stage-2-must-leave-open` | F9; token-only; no assistant implementation | PH05-W08 |
| PH05-R09 | Toolbar, shortcut, menu, save, and future assistant consumers invoke the same public Format/Lint capabilities and observe the same results. | `01_Product/12_KEYBOARD_SHORTCUTS.md#format-shortcuts`; `00_Foundation/06_IMPLEMENTATION_STAGES.md#stage-2-must-leave-open` | F8; single action registry consumer in PH08 | PH05-W05; PH05-W06 |

## State and transition model

| ID | Trigger | Preconditions | Ordered behavior | Result | Failure / preservation | Requirements |
|---|---|---|---|---|---|---|
| PH05-T01 | User invokes Format or Compact | Active editable document and command seam available | Read active buffer; run pure transform; if changed apply one replace operation; enqueue/flush normal buffer sync | One undoable edit; dirty canonical content | Parse failure is a no-op notice; original buffer, selection, and undo history remain usable | PH05-R01, PH05-R02, PH05-R05 |
| PH05-T02 | Save begins with Format-on-save and Lint-on-save enabled | Active document is saveable | Flush pending edit; run Format; apply one undo edit; acknowledge formatted buffer; run Lint on formatted text; save canonical content | Disk, canonical buffer, lint markers, and count describe the same text | Any transform/sync failure stops later steps and preserves unsaved dirty state | PH05-R06 |
| PH05-T03 | User invokes Lint, or a save sequence invokes enabled Lint-on-save | Active document and the applicable accepted snapshot exist | Analyze that snapshot; discard stale analysis; map current findings to markers/count | Markers and count match the explicitly requested or save-ordered snapshot | Analysis failure preserves editing and reports notice; stale results do not replace current results | PH05-R03, PH05-R04 |
| PH05-T04 | Lint is disabled or a clean result settles | Current markers may exist | Clear markers; set zero/hidden indicator as specified | No stale squiggles or count remain | Store cleanup is idempotent | PH05-R04 |
| PH05-T05 | Large format-all is requested | Gate contract exists | Acquire gate; report busy/progress; execute/apply/flush; release on every terminal path | At most one format/export/LLM long op per process | Busy returns without mutation; cancel/failure releases gate and retains original or latest acknowledged buffer | PH05-R07 |

## Cross-phase contracts

| ID | Producer | Consumer | Interface / invariant | Availability / lifetime | Ordering / concurrency | Source | Requirements |
|---|---|---|---|---|---|---|---|
| PH05-C01 | PH05 | PH08, PH12 | Pure programmatic Format, Compact, and Lint functions with typed inputs/results | Module lifetime | Callers do not own transform state; same input/config gives same result | `00_Foundation/06_IMPLEMENTATION_STAGES.md#stage-2-must-leave-open` | PH05-R01, PH05-R02, PH05-R03, PH05-R09 |
| PH05-C02 | PH01 | PH05 | Active-document command seam applies replacements and exposes selection | Active editor session in every supported arrangement | Transform reads before applying; apply enters normal UpdateBuffer queue | `00_Foundation/06_IMPLEMENTATION_STAGES.md#stage-2-must-leave-open` | PH05-R05, PH05-R06 |
| PH05-C03 | PH05 | PH12 | Reusable DiffView accepts before/after content without formatter or assistant ownership | Any mounted consumer | Rendering has no mutation side effect | `00_Foundation/06_IMPLEMENTATION_STAGES.md#stage-2-must-leave-open` | PH05-R08 |
| PH05-C04 | PH00 | PH05, PH06, PH11, PH12, PH13, PH14 | One process-wide long-operation gate | Process lifetime | Non-blocking acquisition; release on all terminal paths | `02_Architecture/07_LARGE_FILES_AND_CONCURRENCY.md#gate` | PH05-R07 |
| PH05-C05 | PH05 | PH02 | Format-before-Lint-before-save ordering over one acknowledged canonical buffer | Duration of a save command | A failed predecessor prevents every successor | `01_Product/06_FORMAT_AND_LINT.md#on-save` | PH05-R06 |
| PH05-C06 | PH00 | PH05 | Stable theme-token boundary styles DiffView without formatter-owned or assistant-owned colors | Application lifetime | Token boundary exists before DiffView; later theme values replace tokens without changing its public seam | `01_Product/10_THEMING.md#token-model`; `02_Architecture/03_FRONTEND_REACT.md#theme` | PH05-R08 |
| PH05-C07 | PH05 | PH08 | Feature-owned typed Markdown style/rule controls plus `format.onSave` and `lint.onSave` keys/defaults and shared action bindings | Application lifetime | PH05 defines validation/defaults/effects before PH08 renders and persists controls; PH08 invokes the same public actions | `01_Product/06_FORMAT_AND_LINT.md#canonical-style`; `01_Product/06_FORMAT_AND_LINT.md#lint-rules`; `01_Product/06_FORMAT_AND_LINT.md#on-save`; `02_Architecture/05_STATE_AND_PERSISTENCE.md#kv-schema` | PH05-R01, PH05-R03, PH05-R06, PH05-R09 |

## Edge and failure cases

| Edge case | Role | Source clause | Requirements | Expected behavior | Evidence |
|---|---|---|---|---|---|
| EC-FMT-1 | primary | `01_Product/06_FORMAT_AND_LINT.md#edge-cases` | PH05-R01, PH05-R05 | Unparseable content produces a notice and no edit. | `frontend/src/logic/format/format.test.ts::unparseable input (EC-FMT-1)` |
| EC-FMT-2 | primary | `01_Product/06_FORMAT_AND_LINT.md#edge-cases` | PH05-R05, PH05-R06 | Format-on-save is one undo step with usable cursor/selection. | `frontend/src/ui/widgets/EditorView.test.tsx::format on save undo (EC-FMT-2)` |
| EC-FMT-3 | primary | `01_Product/06_FORMAT_AND_LINT.md#edge-cases` | PH05-R02 | Fenced and indented code whitespace remains byte-identical. | `frontend/src/logic/format/format.test.ts::compact code preservation (EC-FMT-3)` |
| EC-FMT-4 | primary | `01_Product/06_FORMAT_AND_LINT.md#edge-cases` | PH05-R07 | Large format is exclusive, reports busy, and keeps editing responsive. | `frontend/src/logic/format/format.test.ts::gated large format (EC-FMT-4)` |
| EC-LINT-1 | primary | `01_Product/06_FORMAT_AND_LINT.md#edge-cases` | PH05-R04 | Count stays exact while rendered markers are bounded. | `frontend/src/logic/lint/lint.test.ts::many findings (EC-LINT-1)` |
| EC-LINT-2 | primary | `01_Product/06_FORMAT_AND_LINT.md#edge-cases` | PH05-R04 | Clean content has zero count and no markers. | `frontend/src/logic/lint/lint.test.ts::clean document (EC-LINT-2)` |
| EC-LINT-3 | primary | `01_Product/06_FORMAT_AND_LINT.md#edge-cases` | PH05-R06 | Save orders Format before Lint and Lint observes formatted text. | `frontend/src/logic/hooks/useAutosave.test.tsx::format then lint (EC-LINT-3)` |
| EC-LINT-4 | primary | `01_Product/06_FORMAT_AND_LINT.md#edge-cases` | PH05-R04 | Disabled lint clears squiggles and hides the indicator. | `frontend/src/logic/lint/lint.test.ts::disabled lint (EC-LINT-4)` |

## Non-normative work packages

| ID | Capability | Size | Modules | Artifacts | Requirements | Depends on |
|---|---|---|---|---|---|---|
| PH05-W01 | Implement pure canonical/configurable Format. | M | `logic/format/` | none | PH05-R01 | PH04 standard/config contract |
| PH05-W02 | Implement conservative Compact. | M | `logic/format/` | semantic-equivalence fixtures | PH05-R02 | PH05-W01 parser contract |
| PH05-W03 | Implement pure remark-lint and rule configuration. | M | `logic/lint/` | lint fixtures | PH05-R03 | PH04 Markdown syntax contract |
| PH05-W04 | Project lint findings into markers and problem count. | M | `logic/lint/`; `logic/store/`; `ui/components/` | performance fixture | PH05-R04 | PH05-W03 result contract |
| PH05-W05 | Apply on-demand transforms through the document-command seam. | M | `logic/hooks/`; `ui/components/`; `logic/adapter/` | none | PH05-R05, PH05-R09 | PH01 F3/F7 contract; PH05-W01; PH05-W02 |
| PH05-W06 | Coordinate Format/Lint with save and autosave. | M | `logic/hooks/`; `logic/adapter/`; `logic/store/` | ordered integration fixtures | PH05-R06, PH05-R09 | PH02 save contract; PH05-W03; PH05-W05 |
| PH05-W07 | Integrate large Format with the process gate. | M | `logic/format/`; `logic/adapter/`; `internal/gate/`; `internal/application/` | generated bindings if a bound seam is selected | PH05-R07 | PH00 gate contract; PH05-X01 resolution |
| PH05-W08 | Produce the reusable DiffView seam. | M | `ui/components/` | visual fixtures | PH05-R08 | PH00 token boundary |

## Phase exit evidence

| ID | Requirements | Tier | Proof / artifact | Platform / scope | Owner | Freshness | Blocking |
|---|---|---|---|---|---|---|---|
| PH05-E01 | PH05-R01, PH05-R02, PH05-R03 | automated | pure transform/lint suites and `just check` | all | tester | current HEAD | yes |
| PH05-E02 | PH05-R04, PH05-R05, PH05-R06 | automated | editor/save integration suites with exact sequence assertions | all arrangements | tester | current HEAD | yes |
| PH05-E03 | PH05-R07 | automated | shared-gate contention, failure, cancellation, and release tests | one process | tester | current HEAD | yes |
| PH05-E04 | PH05-R08, PH05-R09 | automated | sibling-consumer and static boundary tests | PH08 and PH12 consumer fixtures | tester | current HEAD | yes |
| PH05-E05 | PH05-R04, PH05-R05, PH05-R06 | real-runtime | `docs/phase-evidence/PH05-runtime.md` | native Wails | tester | current HEAD | yes |
| PH05-E06 | PH05-R08 | human | `docs/phase-evidence/PH05-diff-approval.md` | all themes; responsive widths | product owner | current release candidate | yes |

## Open specification conflicts

| ID | Conflicting or missing sources | Required decision | Blocked requirements |
|---|---|---|---|
| PH05-X01 | `01_Product/06_FORMAT_AND_LINT.md#format` declares Format a frontend operation while `02_Architecture/07_LARGE_FILES_AND_CONCURRENCY.md#gate` requires large format-all to acquire the Go process-wide gate; no bound method, ownership boundary, cancellation path, or Result contract connects them. | Specify the frontend-to-backend gate acquisition/release protocol for Format, including cancellation and crash-safe release. | PH05-R07 |

## Clarification revision

2026-07-21 — Replaced component-biased story suggestions with pure-transform, save-ordering, gate, consumer, and lifecycle requirements. Added the previously omitted F9 DiffView producer, inverse consumer contracts, exact edge evidence, and S/M work packages; recorded the missing frontend-to-Go gate protocol without selecting one.
