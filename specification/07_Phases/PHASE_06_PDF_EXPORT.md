**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester
**Last Updated:** 2026-07-10
**Cross-references:** `00_ROADMAP.md`, `../01_Product/07_PDF_EXPORT.md`, `../02_Architecture/02_BACKEND_GO.md`, `../02_Architecture/04_WAILS_INTEGRATION.md`, `../02_Architecture/07_LARGE_FILES_AND_CONCURRENCY.md`, `../06_Process_and_Traceability/01_MODULE_INVENTORY.md`, `../06_Process_and_Traceability/06_DEFINITION_OF_DONE.md`

# Phase 06 — PDF Export

## Goal

Let users share a rendered document as a portable file: export the current document to PDF via the
webview print path against a print-scoped copy of the rendered preview, with a setting choosing
**Current theme** or **Clean document** styling. Export waits for Mermaid/KaTeX to finish rendering
first. No paginated-layout controls in v1. Completes Milestone **M2**.
Refines: `../01_Product/01_FUNCTIONAL_REQUIREMENTS.md#fr-pdf`.

## Depends on

- Phase 04 (rendering pipeline, Mermaid/KaTeX completion signals).

## Scope

- `internal/export` Handler/Service orchestrating the webview print trigger — a gated long op behind the
  `internal/gate` single-slot semaphore, reporting progress via `export:progress`/`export:done` events
  (`../02_Architecture/02_BACKEND_GO.md#long-ops-gate`, `../02_Architecture/07_LARGE_FILES_AND_CONCURRENCY.md#gate`,
  `../02_Architecture/07_LARGE_FILES_AND_CONCURRENCY.md#events-progress`).
- Print stylesheet in `ui/styles` (print-scoped render surface).
- `styled vs clean` PDF styling setting.
- Export flow that awaits Mermaid/KaTeX completion before invoking print.

## Out of scope

- Paginated layout / headers-footers / page-range controls (documented v1 limitation).
- Remote-content policy (Phase 09) — export honours whatever the policy already blocked.

## Suggested stories / tasks

> Planned backlog for this phase. The `architect` generates the actual story files into `../docs/stories/` during implementation (one story per session), assigning the ids shown.


| Story id | Title | Est(S/M/L) | Modules | Spec clauses | depends_on |
|---|---|---|---|---|---|
| STORY-041 | Implement the export backend service that triggers the webview print path as a gated long op | M | `internal/export/`, `internal/gate/`, `internal/apperr/` | `01_Product/07_PDF_EXPORT.md#export-flow`, `01_Product/07_PDF_EXPORT.md#print-scope`, `00_Foundation/04_DESIGN_DECISIONS.md#7-export`, `02_Architecture/02_BACKEND_GO.md#long-ops-gate`, `02_Architecture/07_LARGE_FILES_AND_CONCURRENCY.md#gate`, `02_Architecture/07_LARGE_FILES_AND_CONCURRENCY.md#events-progress` | STORY-016 |
| STORY-042 | Add the print stylesheet and a print-scoped copy of the rendered preview | M | `ui/styles/`, `ui/widgets/`, `logic/markdown/` | `01_Product/07_PDF_EXPORT.md#print-scope`, `01_Product/07_PDF_EXPORT.md#styled-vs-clean` | STORY-041 |
| STORY-043 | Add the PDF styling setting (Current theme vs Clean document) | S | `internal/settings/`, `logic/store/`, `ui/styles/` | `01_Product/07_PDF_EXPORT.md#styled-vs-clean`, `01_Product/11_SETTINGS.md#export-group` | STORY-042 |
| STORY-044 | Await Mermaid/KaTeX completion before invoking print and handle print-dialog cancel | M | `logic/hooks/`, `logic/adapter/`, `ui/widgets/` | `01_Product/07_PDF_EXPORT.md#export-flow`, `01_Product/07_PDF_EXPORT.md#limitations` | STORY-041 |

## Edge cases

- **EC-PDF-1** — Export while Mermaid/KaTeX still rendering → wait for completion first (STORY-044).
- **EC-PDF-2** — Export an unsaved buffer → allowed; uses current rendered preview (STORY-041).
- **EC-PDF-3** — User cancels the native print dialog → no file written, no error state (STORY-044).
- **EC-PDF-4** — Remote content blocked by policy → exported without it (STORY-042).
- **EC-PDF-5** — Very long document → single continuous export; no pagination in v1 (STORY-042).

## Phase exit checklist

Automated:

- [ ] `ExportHandler.Export` returns an `apperr.*Result`; a busy gate returns `apperr.Busy()` (P3).
- [ ] The print-scoped surface applies the print stylesheet and, when Clean is selected, drops theme chrome (unit/DOM test).
- [ ] Export waits for pending Mermaid/KaTeX before invoking print (EC-PDF-1, asserted via completion spy).
- [ ] Cancelling the print dialog leaves no file and no error state (EC-PDF-3).
- [ ] `just check` green.

Manual:

- [ ] In `wails dev`: Export a document containing a Mermaid diagram and math → the PDF contains both, rendered.
- [ ] Toggling Current-theme vs Clean produces visibly different PDFs.

DoD reference: `06_Process_and_Traceability/06_DEFINITION_OF_DONE.md`. Milestone **M2** reached.
