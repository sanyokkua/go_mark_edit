**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester, reviewer
**Last Updated:** 2026-07-21
**Cross-references:** `00_ROADMAP.md`, `../00_Foundation/06_IMPLEMENTATION_STAGES.md`, `../01_Product/02_EDITOR_AND_VIEWER_MODES.md`, `../01_Product/04_MARKDOWN_STANDARDS.md`, `../01_Product/05_RENDERING_AND_EXTENSIONS.md`, `../02_Architecture/07_LARGE_FILES_AND_CONCURRENCY.md`, `../03_NonFunctional/02_PERFORMANCE.md`, `../03_NonFunctional/04_OFFLINE.md`, `../06_Process_and_Traceability/07_PHASE_FORMAT.md`

# Phase 04 — Rendering & Extensions

## Goal

Deliver the complete offline Markdown reading pipeline: standards-selectable parsing, GFM and Full extensions, resilient math/code/Mermaid rendering, responsive large-document preview behavior, and a chrome-free Reader view.

## Phase metadata

| Phase | Kind | Stage / milestone | Depends on | Completion scope |
|---|---|---|---|---|
| PH04 | sequential | Stage 1 / M1 | PH00, PH01 | once per implemented renderer/reading-mode revision |

## Scope

- The global Minimal/GFM/Full standard and its exact plugin map, immediate re-render, and standard badge.
- GFM, Full extensions, KaTeX, bundled syntax highlighting, Mermaid, and sanitized component overrides.
- Debounced preview snapshots, large-file auto-pause/manual refresh, and async renderer isolation.
- Reader mode with no application chrome and theme-token styling.

## Out of scope

- Format and lint behavior, owned by PH05.
- PDF print orchestration, owned by PH06.
- Final guarded local/remote asset policy and CSP enforcement, owned by PH09.
- Production theme token values, owned by PH08; PH04 consumes the stable PH00 token boundary.

## Requirement ledger

| ID | Required outcome | Source clauses | Constraints | Work package |
|---|---|---|---|---|
| PH04-R01 | One global Minimal/GFM/Full setting selects the exact parser/render plugin set, defaults to GFM, re-renders every open document immediately, and updates the standard badge. | `01_Product/04_MARKDOWN_STANDARDS.md#standard-levels`; `01_Product/04_MARKDOWN_STANDARDS.md#standard-setting`; `01_Product/04_MARKDOWN_STANDARDS.md#plugin-mapping` | DD-14; settings KV; content-free projection | PH04-W01 |
| PH04-R02 | GFM and Full expose only their specified capabilities; syntax above the active standard remains literal. | `01_Product/04_MARKDOWN_STANDARDS.md#minimal-commonmark`; `01_Product/04_MARKDOWN_STANDARDS.md#gfm`; `01_Product/04_MARKDOWN_STANDARDS.md#full-extensions` | DD-14; DD-19 | PH04-W01 |
| PH04-R03 | Full-level math uses bundled KaTeX and isolates invalid expressions as inline errors without stopping the remaining render. | `01_Product/05_RENDERING_AND_EXTENSIONS.md#math-katex`; `03_NonFunctional/04_OFFLINE.md#2-bundled-assets` | DD-19; DD-32; token-only styling | PH04-W02 |
| PH04-R04 | Fenced code is highlighted from bundled assets at every level; unknown or absent languages remain plain code blocks. | `01_Product/05_RENDERING_AND_EXTENSIONS.md#code-highlighting`; `01_Product/04_MARKDOWN_STANDARDS.md#plugin-mapping` | DD-19; DD-32; theme tokens | PH04-W03 |
| PH04-R05 | Mermaid fences at every standard render asynchronously through `MermaidBlock`; loading, success, and isolated inline-error states preserve the rest of the document. | `01_Product/05_RENDERING_AND_EXTENSIONS.md#mermaid`; `01_Product/05_RENDERING_AND_EXTENSIONS.md#components-override` | DD-19; DD-32; async completion lifetime blocked by PH04-X02 | PH04-W04 |
| PH04-R06 | Preview rendering uses the accepted debounced buffer snapshot and never blocks editing; a large-document pause retains the last accepted render and exposes one explicit refresh action. | `01_Product/05_RENDERING_AND_EXTENSIONS.md#preview-debounce`; `02_Architecture/07_LARGE_FILES_AND_CONCURRENCY.md#preview-debounce`; `03_NonFunctional/02_PERFORMANCE.md#3-preview-debounce-targets`; `03_NonFunctional/02_PERFORMANCE.md#4-large-file-handling` | DD-20; DD-62–64; 150–300 ms target; threshold blocked by PH04-X01 | PH04-W05 |
| PH04-R07 | Reader mode renders a static document snapshot, hides all chrome, remains keyboard-focusable, and preserves the exact prior application arrangement and document scroll position so exit restores both rather than a default layout. | `01_Product/02_EDITOR_AND_VIEWER_MODES.md#viewer-reading-mode`; `01_Product/02_EDITOR_AND_VIEWER_MODES.md#per-document-view-state`; `01_Product/10_THEMING.md#reading-mode-chrome`; `03_NonFunctional/05_ACCESSIBILITY.md#3-focus-management` | DD-30; token-only; F1 layout remains reserved | PH04-W06 |
| PH04-R08 | Every rendering dependency and font is bundled, sanitized output cannot execute document code, and the rendering pipeline itself performs no network fetch. | `01_Product/05_RENDERING_AND_EXTENSIONS.md#pipeline`; `01_Product/05_RENDERING_AND_EXTENSIONS.md#sanitization`; `03_NonFunctional/04_OFFLINE.md#2-bundled-assets`; `03_NonFunctional/04_OFFLINE.md#3-no-cdn-at-runtime` | DD-32; PH09 owns final CSP/remote policy | PH04-W02; PH04-W03; PH04-W04 |

## State and transition model

| ID | Trigger | Preconditions | Ordered behavior | Result | Failure / preservation | Requirements |
|---|---|---|---|---|---|---|
| PH04-T01 | User changes Markdown standard | One or more documents are open | Validate through PH04's typed contract; persist via the PH00 registry; select mapped plugin set; invalidate all rendered projections; render each from its accepted snapshot; update badge | Every open preview/reader reflects the new standard | Invalid persisted value uses PH04's GFM fallback; document buffers remain unchanged; PH08 later renders the same contract | PH04-R01, PH04-R02 |
| PH04-T02 | Accepted preview snapshot exceeds the pause threshold | Live preview is enabled | Keep the last rendered snapshot; mark live preview paused; expose refresh; continue buffer synchronization | Editing remains responsive while preview stays stable | The numeric threshold is unresolved by PH04-X01; no buffer or cursor rollback | PH04-R06 |
| PH04-T03 | User requests preview refresh | Preview is paused and an accepted snapshot exists | Render that snapshot once; settle contained async blocks; keep auto updates paused | One refreshed preview replaces the prior snapshot | Render failure is contained inline; retain the last successful outer preview | PH04-R03, PH04-R05, PH04-R06 |
| PH04-T04 | Async Mermaid or KaTeX work settles | The originating render generation is still authoritative | Validate generation/lifetime; replace only the originating placeholder | Current render receives the result | Stale/unmounted settlement must not mutate a newer render; exact lifetime is blocked by PH04-X02 | PH04-R03, PH04-R05 |
| PH04-T05 | User enters or exits Reader mode | Active document, accepted render snapshot, current arrangement, document scroll position, and focus owner exist | Capture the exact arrangement and scroll before hiding chrome; render once and move focus to the document region; preserve the same render/session root; on exit restore that arrangement, scroll, then focus | Chrome-free reading state round-trips without model, arrangement, or scroll mutation | Render failure stays inline; no default-layout substitution or lost scroll/cursor | PH04-R07 |

## Cross-phase contracts

| ID | Producer | Consumer | Interface / invariant | Availability / lifetime | Ordering / concurrency | Source | Requirements |
|---|---|---|---|---|---|---|---|
| PH04-C01 | PH01 | PH04 | Accepted debounced source snapshot shared by backend buffer sync and preview | Active document session | Snapshot acceptance precedes render; never render raw keystrokes | `02_Architecture/07_LARGE_FILES_AND_CONCURRENCY.md#preview-debounce` | PH04-R06 |
| PH04-C02 | PH04 | PH06 | Print consumer receives a rendered snapshot plus settlement state for Mermaid/KaTeX | One export generation | Print cannot start before the originating generation settles | `01_Product/07_PDF_EXPORT.md#export-flow` | PH04-R03, PH04-R05 |
| PH04-C03 | PH04 | PH09 | Markdown `components` overrides expose image/link/raw-HTML control points; PH09 supplies guarded resolution, remote policy, and final CSP | Renderer lifetime | Security filtering precedes resource load | `01_Product/05_RENDERING_AND_EXTENSIONS.md#components-override` | PH04-R08 |
| PH04-C04 | PH00 | PH04 | Stable shell/theme-token boundary supplies all renderer and Reader styling inputs | Application lifetime | Token boundary exists before PH04; later theme values replace tokens without restructuring PH04 | `01_Product/10_THEMING.md#token-model`; `02_Architecture/03_FRONTEND_REACT.md#theme` | PH04-R03, PH04-R04, PH04-R07, PH04-R08 |
| PH04-C05 | PH04 | PH08 | Typed Markdown-standard key, allowed values, GFM default, and render-invalidation action contract | Application lifetime | PH04 defines the feature contract before PH08 renders and persists its control | `01_Product/04_MARKDOWN_STANDARDS.md#standard-setting`; `01_Product/11_SETTINGS.md#markdown-group`; `02_Architecture/05_STATE_AND_PERSISTENCE.md#kv-schema` | PH04-R01, PH04-R02 |

## Edge and failure cases

| Edge case | Role | Source clause | Requirements | Expected behavior | Evidence |
|---|---|---|---|---|---|
| EC-RENDER-1 | primary | `01_Product/05_RENDERING_AND_EXTENSIONS.md#edge-cases` | PH04-R05 | Invalid Mermaid shows an inline block error and the rest renders. | `frontend/src/ui/components/MermaidBlock.test.tsx::invalid syntax (EC-RENDER-1)` |
| EC-RENDER-2 | primary | `01_Product/05_RENDERING_AND_EXTENSIONS.md#edge-cases` | PH04-R03 | Invalid KaTeX shows an inline token and rendering continues. | `frontend/src/logic/markdown/renderer.test.tsx::invalid math (EC-RENDER-2)` |
| EC-RENDER-3 | primary | `01_Product/05_RENDERING_AND_EXTENSIONS.md#edge-cases` | PH04-R04 | Unknown language produces a plain code block. | `frontend/src/logic/markdown/renderer.test.tsx::unknown language (EC-RENDER-3)` |
| EC-RENDER-4 | primary | `01_Product/05_RENDERING_AND_EXTENSIONS.md#edge-cases` | PH04-R06 | Large input pauses/debounces preview without blocking the editor. | `frontend/src/ui/widgets/PreviewView.test.tsx::large preview pause (EC-RENDER-4)` |
| EC-RENDER-5 | regression | `01_Product/05_RENDERING_AND_EXTENSIONS.md#edge-cases` | PH04-R08 | Baseline output neutralizes dangerous HTML; PH09 later re-proves the final policy integration. | `frontend/src/logic/markdown/renderer.test.tsx::raw HTML baseline (EC-RENDER-5)` |
| EC-RENDER-6 | primary | `01_Product/04_MARKDOWN_STANDARDS.md#edge-cases` | PH04-R01, PH04-R02 | Higher-level syntax renders literally under a lower level. | `frontend/src/logic/markdown/renderer.test.tsx::feature gating (EC-RENDER-6)` |
| EC-RENDER-7 | regression | `01_Product/05_RENDERING_AND_EXTENSIONS.md#edge-cases` | PH04-R08 | Broken image preserves alt text/layout; PH09 later re-proves guarded asset integration. | `frontend/src/logic/markdown/renderer.test.tsx::broken image baseline (EC-RENDER-7)` |
| EC-SET-3 | primary | `01_Product/04_MARKDOWN_STANDARDS.md#edge-cases` | PH04-R01 | Standard change re-renders all open documents and the badge. | `frontend/src/logic/markdown/renderer.test.tsx::standard change (EC-SET-3)` |
| EC-DOCS-4 | primary | `01_Product/03_FILES_TABS_WORKSPACE.md#edge-cases` | PH04-R06 | Oversized opened content stays editable with paused preview and manual refresh. | `frontend/e2e/rendering.spec.ts::large opened document (EC-DOCS-4)` |

## Non-normative work packages

| ID | Capability | Size | Modules | Artifacts | Requirements | Depends on |
|---|---|---|---|---|---|---|
| PH04-W01 | Implement standards configuration and exact plugin selection. | M | `logic/markdown/`; `logic/store/`; `internal/settings/` | none | PH04-R01, PH04-R02 | PH01 accepted-snapshot contract |
| PH04-W02 | Add Full math and bundled sanitization-safe render assets. | M | `logic/markdown/`; `ui/components/` | bundled KaTeX fonts/styles | PH04-R03, PH04-R08 | PH04-W01 standard map |
| PH04-W03 | Add bundled syntax highlighting and plain fallback. | S | `logic/markdown/`; `ui/components/` | bundled highlight theme | PH04-R04, PH04-R08 | PH04-W01 standard map |
| PH04-W04 | Add generation-safe asynchronous Mermaid rendering. | M | `logic/markdown/`; `ui/components/` | bundled Mermaid package | PH04-R05, PH04-R08 | PH04-W01 component override; PH04-X02 resolution |
| PH04-W05 | Add large-file preview pause and explicit refresh. | M | `logic/markdown/`; `logic/store/`; `ui/widgets/` | none | PH04-R06 | PH01 snapshot contract; PH04-X01 resolution |
| PH04-W06 | Add Reader mode with exact arrangement/scroll/focus round trip. | M | `ui/widgets/`; `logic/store/`; `ui/styles/` | responsive runtime evidence | PH04-R07 | PH01 arrangement/scroll contract; PH00 token boundary |

## Phase exit evidence

| ID | Requirements | Tier | Proof / artifact | Platform / scope | Owner | Freshness | Blocking |
|---|---|---|---|---|---|---|---|
| PH04-E01 | PH04-R01, PH04-R02, PH04-R03, PH04-R04, PH04-R05, PH04-R08 | automated | renderer/component suites plus `just check` | all standards; all themes | tester | current HEAD | yes |
| PH04-E02 | PH04-R06 | automated | large-input deferred-generation tests and `just verify-ui` | 375/768/1280 | tester | current HEAD | yes |
| PH04-E03 | PH04-R07 | automated | Reader enter/exit focus and chrome assertions | 375/768/1280 | tester | current HEAD | yes |
| PH04-E04 | PH04-R03, PH04-R04, PH04-R05, PH04-R08 | real-runtime | `docs/phase-evidence/PH04-runtime.md` | native Wails; air-gapped | tester | current HEAD | yes |
| PH04-E05 | PH04-R07 | human | `docs/phase-evidence/PH04-reader-approval.md` | frozen mockup; native Wails | product owner | current release candidate | yes |

## Open specification conflicts

| ID | Conflicting or missing sources | Required decision | Blocked requirements |
|---|---|---|---|
| PH04-X01 | `02_Architecture/07_LARGE_FILES_AND_CONCURRENCY.md#preview-debounce` and `03_NonFunctional/02_PERFORMANCE.md#3-preview-debounce-targets` require a configurable large-file threshold but define no default value, units, or threshold comparison. | Define the default threshold, unit, configurability surface, and boundary behavior needed for deterministic acceptance tests. | PH04-R06 |
| PH04-X02 | `01_Product/05_RENDERING_AND_EXTENSIONS.md#mermaid` and `#math-katex` require asynchronous/contained rendering but do not define generation identity, unmount behavior, or how stale completions are discarded. | Define async render settlement lifetime and stale-result rules shared with PDF export. | PH04-R03, PH04-R05 |

## Clarification revision

2026-07-21 — Replaced global story suggestions with permanent rendering requirements, explicit snapshot/async/Reader transitions, producer-consumer contracts, exact edge ownership, bounded S/M work packages, and tiered evidence. Recorded the missing large-file threshold and async-settlement lifetime without choosing either.
