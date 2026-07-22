**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester, reviewer
**Last Updated:** 2026-07-21
**Cross-references:** `00_ROADMAP.md`, `../01_Product/07_PDF_EXPORT.md`, `../01_Product/11_SETTINGS.md`, `../02_Architecture/02_BACKEND_GO.md`, `../02_Architecture/04_WAILS_INTEGRATION.md`, `../02_Architecture/07_LARGE_FILES_AND_CONCURRENCY.md`, `../03_NonFunctional/04_OFFLINE.md`, `../06_Process_and_Traceability/07_PHASE_FORMAT.md`

# Phase 06 — PDF Export

## Goal

Export the current accepted document state through the native webview print path, with render-completion coordination, print-only styling, process-wide exclusion, and cancellation that never fabricates a file or error.

## Phase metadata

| Phase | Kind | Stage / milestone | Depends on | Completion scope |
|---|---|---|---|---|
| PH06 | sequential | Stage 2 / M2 | PH01, PH02, PH04, PH05, PH09 | once per implemented revision |

## Scope

- A concrete Result-enveloped `internal/export` Handler/Service vertical wired through the composition root.
- Flush-to-canonical, print-view creation, Mermaid/KaTeX settlement, native print invocation, and terminal cleanup.
- A print-scoped render surface and stylesheet with Current theme/Clean document settings.
- Process-wide gate participation and progress/done events.

## Out of scope

- Page-size, page-range, header/footer, deterministic pagination, and repeated-header controls.
- Remote-content choice UI and final remote-policy enforcement, owned by PH09; PH06 consumes PH09's policy-filtered rendered-resource contract and performs no second resource load.
- Code signing, notarization, or a custom PDF engine.

## Requirement ledger

| ID | Required outcome | Source clauses | Constraints | Work package |
|---|---|---|---|---|
| PH06-R01 | Export uses the active document's canonical content only after pending editor synchronization is flushed, including unsaved buffers. | `01_Product/07_PDF_EXPORT.md#export-flow`; `01_Product/07_PDF_EXPORT.md#print-scope` | DD-62–64; active-document identity; no disk prerequisite | PH06-W01 |
| PH06-R02 | `internal/export` exposes a concrete Result-enveloped handler/service, participates in the process gate, and emits progress while terminal success/failure remains authoritative in the returned Result. | `02_Architecture/02_BACKEND_GO.md#long-ops-gate`; `02_Architecture/07_LARGE_FILES_AND_CONCURRENCY.md#gate`; `02_Architecture/07_LARGE_FILES_AND_CONCURRENCY.md#events-progress` | Handler to Service; no context parameter; recover to internal; protocol blocked by PH06-X01 | PH06-W02 |
| PH06-R03 | Export creates a print-scoped copy containing only the rendered document and applies paper-safe layout for diagrams, code, and tables while hiding all application chrome. | `01_Product/07_PDF_EXPORT.md#print-scope` | token/print CSS only; no app chrome | PH06-W03 |
| PH06-R04 | PH06 owns the typed `export.pdfStyle` contract (`theme`/`clean`, default `theme`): the persisted value selects Current theme tokens or a neutral Clean document surface without changing content, and is exposed for PH08 to render as a setting control. | `01_Product/07_PDF_EXPORT.md#styled-vs-clean`; `01_Product/11_SETTINGS.md#export-group`; `01_Product/11_SETTINGS.md#defaults`; `02_Architecture/05_STATE_AND_PERSISTENCE.md#kv-schema` | DD-24; generic PH00 settings KV; PH08 is a later consumer | PH06-W04 |
| PH06-R05 | Native print starts only after the export generation's Mermaid/KaTeX work settles; cancellation writes nothing, reports no error, and releases all export resources. | `01_Product/07_PDF_EXPORT.md#export-flow`; `01_Product/07_PDF_EXPORT.md#limitations` | generation identity; cancel-safe cleanup; protocol blocked by PH06-X01 | PH06-W05 |
| PH06-R06 | The print copy consumes PH09's policy-filtered resource outcome already present in its authoritative render generation, keeps blocked remote content absent, starts no second resource load or fetch, and creates no application-originated network traffic. | `01_Product/07_PDF_EXPORT.md#print-scope`; `03_NonFunctional/04_OFFLINE.md#1-the-requirement`; `03_NonFunctional/04_OFFLINE.md#4-document-referenced-remote-assets` | DD-32; PH09 policy result is authoritative | PH06-W03 |
| PH06-R07 | Very long content uses the platform webview's continuous print flow without exposing unsupported pagination controls. | `01_Product/07_PDF_EXPORT.md#limitations` | DD-23; documented v1 limitation | PH06-W03 |

## State and transition model

| ID | Trigger | Preconditions | Ordered behavior | Result | Failure / preservation | Requirements |
|---|---|---|---|---|---|---|
| PH06-T01 | User invokes Export to PDF | Active document exists; no gate holder | Acquire gate; flush buffer; snapshot canonical content/settings/policy; create print generation; render; await async settlement; invoke native print | Native save/print dialog represents one coherent generation | Any predecessor failure prevents print; original document/session remains unchanged; release gate/resources | PH06-R01, PH06-R02, PH06-R03, PH06-R04, PH06-R05 |
| PH06-T02 | A competing long operation owns the gate | Export is requested | Reject non-blockingly through the established Busy Result/toast path | No second export starts | No print surface, progress sequence, or document mutation is created | PH06-R02 |
| PH06-T03 | Async render work settles | Export generation is alive | Associate settlement with generation; ignore foreign/stale results; invoke print only after all required work settles | Printed surface contains settled math/diagrams | Exact ready/settlement handshake is blocked by PH06-X01 | PH06-R05 |
| PH06-T04 | Native print dialog is cancelled | Print surface and gate are active | Receive cancel terminal state; destroy print surface; emit terminal completion as specified; release gate | No file and no user error state | Cancellation is not reclassified as failure; document and normal preview remain intact | PH06-R02, PH06-R05 |
| PH06-T05 | Export succeeds or fails | Print attempt reached a terminal state | Dispose print generation; publish terminal Result/done signal; release gate once | No hidden print view or gate lease survives | Cleanup is idempotent and runs on every failure path | PH06-R02, PH06-R05 |

## Cross-phase contracts

| ID | Producer | Consumer | Interface / invariant | Availability / lifetime | Ordering / concurrency | Source | Requirements |
|---|---|---|---|---|---|---|---|
| PH06-C01 | PH01, PH02 | PH06 | Flush active working buffer and identify canonical active document content | Active document session | Flush acknowledgement precedes snapshot and export | `01_Product/07_PDF_EXPORT.md#export-flow` | PH06-R01 |
| PH06-C02 | PH04 | PH06 | Render-generation settlement for Mermaid/KaTeX plus print-safe rendered content | One print generation | All required async blocks settle before print | `01_Product/07_PDF_EXPORT.md#export-flow` | PH06-R03, PH06-R05 |
| PH06-C03 | PH00 | PH05, PH06, PH11, PH12, PH13, PH14 | One process-wide non-blocking long-op lease | Process lifetime | Export acquisition is mutually exclusive with format-all and inference | `02_Architecture/07_LARGE_FILES_AND_CONCURRENCY.md#gate` | PH06-R02 |
| PH06-C04 | PH06 | PH08 | Typed `export.pdfStyle` key, `theme`/`clean` values, `theme` default, and feature-owned update contract | Application lifetime | PH06 defines the feature contract before PH08 renders and persists its control | `01_Product/07_PDF_EXPORT.md#styled-vs-clean`; `02_Architecture/05_STATE_AND_PERSISTENCE.md#kv-schema` | PH06-R04 |
| PH06-C05 | PH09 | PH06 | Policy-filtered rendered-resource outcome plus authorization context; export accepts that outcome and never initiates a second resource load | Export generation | PH09 filtering precedes render settlement; PH06 prints only the same generation after settlement | `01_Product/07_PDF_EXPORT.md#print-scope`; `01_Product/09_ASSETS_AND_SECURITY.md#remote-content-policy`; `03_NonFunctional/04_OFFLINE.md#4-document-referenced-remote-assets` | PH06-R06 |
| PH06-C06 | PH00 | PH06 | Generic settings registry and stable theme-token boundary host `export.pdfStyle` and Current-theme print styling | Application lifetime | PH00 boundaries exist before PH06 registers the key or styles the print copy | `01_Product/10_THEMING.md#token-model`; `02_Architecture/05_STATE_AND_PERSISTENCE.md#kv-schema` | PH06-R04 |

## Edge and failure cases

| Edge case | Role | Source clause | Requirements | Expected behavior | Evidence |
|---|---|---|---|---|---|
| EC-PDF-1 | primary | `01_Product/07_PDF_EXPORT.md#edge-cases` | PH06-R05 | Print waits for the current generation's Mermaid/KaTeX completion. | `frontend/src/logic/hooks/useExport.test.tsx::render settlement (EC-PDF-1)` |
| EC-PDF-2 | primary | `01_Product/07_PDF_EXPORT.md#edge-cases` | PH06-R01 | Unsaved accepted buffer exports without requiring a path. | `frontend/src/logic/hooks/useExport.test.tsx::unsaved buffer (EC-PDF-2)` |
| EC-PDF-3 | primary | `01_Product/07_PDF_EXPORT.md#edge-cases` | PH06-R02, PH06-R05 | Native cancel writes nothing, shows no error, and releases the gate. | `internal/export/export_test.go::TestCancel (EC-PDF-3)` |
| EC-PDF-4 | primary | `01_Product/07_PDF_EXPORT.md#edge-cases` | PH06-R06 | Policy-blocked remote resources remain absent from the exported surface. | `frontend/src/ui/widgets/PreviewView.test.tsx::blocked export resource (EC-PDF-4)` |
| EC-PDF-5 | primary | `01_Product/07_PDF_EXPORT.md#edge-cases` | PH06-R07 | Very long content uses one continuous platform-managed print flow. | `frontend/e2e/export.spec.ts::long document (EC-PDF-5)` |

## Non-normative work packages

| ID | Capability | Size | Modules | Artifacts | Requirements | Depends on |
|---|---|---|---|---|---|---|
| PH06-W01 | Flush and capture one canonical export snapshot. | M | `logic/adapter/`; `logic/hooks/`; `internal/appmodel/` | none | PH06-R01 | PH01 buffer contract; PH02 active-document contract |
| PH06-W02 | Implement gated Result-enveloped export orchestration. | M | `internal/export/`; `internal/gate/`; `internal/apperr/`; `internal/application/` | generated bindings | PH06-R02 | PH00 gate/envelope contracts; PH06-X01 resolution |
| PH06-W03 | Build the isolated no-second-load print surface and stylesheet. | M | `ui/widgets/`; `logic/markdown/`; `ui/styles/` | print fixtures | PH06-R03, PH06-R06, PH06-R07 | PH04 render contract; PH09 policy-filtered resource contract; PH00 token boundary |
| PH06-W04 | Define, persist, and apply the typed PDF-style contract. | S | `internal/settings/`; `logic/store/`; `ui/styles/` | setting registration fixture | PH06-R04 | PH00 settings registry and token boundary |
| PH06-W05 | Coordinate render readiness, native print, cancel, and cleanup. | M | `logic/hooks/`; `logic/adapter/`; `ui/widgets/`; `internal/export/` | native runtime harness | PH06-R05 | PH06-W01; PH06-W02; PH06-W03; PH06-X01 resolution |

## Phase exit evidence

| ID | Requirements | Tier | Proof / artifact | Platform / scope | Owner | Freshness | Blocking |
|---|---|---|---|---|---|---|---|
| PH06-E01 | PH06-R01, PH06-R02, PH06-R05 | automated | deferred render/print protocol tests, gate tests, and `just check` | all | tester | current HEAD | yes |
| PH06-E02 | PH06-R03, PH06-R04, PH06-R06, PH06-R07 | automated | print DOM/style/policy suites | theme/clean; long input | tester | current HEAD | yes |
| PH06-E03 | PH06-R01, PH06-R03, PH06-R05 | real-runtime | `docs/phase-evidence/PH06-export-matrix.md` | macOS, Windows, Linux native webviews | tester | current release candidate | yes |
| PH06-E04 | PH06-R03, PH06-R04 | human | `docs/phase-evidence/PH06-pdf-approval.md` | current-theme and clean PDFs | product owner | current release candidate | yes |
| PH06-E05 | PH06-R06 | real-runtime | PH06 network trace in `docs/phase-evidence/PH06-export-matrix.md` | Stage 2 air-gapped session | security reviewer | current release candidate | yes |

## Open specification conflicts

| ID | Conflicting or missing sources | Required decision | Blocked requirements |
|---|---|---|---|
| PH06-X01 | `01_Product/07_PDF_EXPORT.md#export-flow` requires Go-owned orchestration to drive frontend render readiness and `window.print()`, while Wails print completion/cancellation and the frontend-to-backend ready/print/cancel message sequence are not specified. | Define the exact bound calls/events, generation token, timeout/failure semantics, native cancel signal, and which side owns gate release. | PH06-R02, PH06-R05 |

## Clarification revision

2026-07-21 — Replaced pre-assigned stories with canonical-snapshot, gated-orchestration, print-surface, settlement, cancellation, and cleanup requirements. Made PH06 the producer of the typed PDF-style contract, made PH09's policy-filtered rendered-resource outcome an explicit prerequisite, and recorded the missing backend/webview ready-print-cancel protocol without inventing it.
