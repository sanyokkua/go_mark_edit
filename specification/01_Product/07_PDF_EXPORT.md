**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester
**Last Updated:** 2026-07-10
**Cross-references:** `00_Foundation/04_DESIGN_DECISIONS.md`, `01_Product/01_FUNCTIONAL_REQUIREMENTS.md`, `01_Product/05_RENDERING_AND_EXTENSIONS.md`, `01_Product/10_THEMING.md`, `01_Product/11_SETTINGS.md`, `mockups/gomarkedit-mockup.html`

# PDF Export

Export the current document to PDF via the webview print path (DD-23). Refines
`01_FUNCTIONAL_REQUIREMENTS.md#fr-pdf`.

## Table of Contents

1. [Export flow](#export-flow)
2. [Print scope](#print-scope)
3. [Styled vs clean](#styled-vs-clean)
4. [Limitations](#limitations)
5. [Edge cases](#edge-cases)

## Export flow

"Export to PDF…" (`Ctrl/Cmd+P`, File menu) exports the **current document** only. The flow:

1. The document's canonical content — the backend model's copy, after any pending editor sync is
   flushed (DD-62/DD-64) — is rendered by the standard pipeline
   (`05_RENDERING_AND_EXTENSIONS.md#pipeline`) into a print-scoped copy of the preview.
2. Export **waits** until asynchronous content — Mermaid diagrams and KaTeX math — has finished
   rendering (EC-PDF-1).
3. The webview print path (`window.print()` against the print-scoped view) is invoked, producing the
   OS "Save as PDF" dialog.
4. The user chooses a destination and confirms; cancelling writes nothing (EC-PDF-3).

Export orchestration lives in `internal/export` (backend trigger) driving the frontend print view; it
is a gated long op (`internal/gate`) so it cannot overlap with a Format-all or another export.

## Print scope

Only the **rendered document** is printed — never the app chrome (menu bar, sidebar, tabs, toolbar,
status bar). A dedicated print stylesheet (in `ui/styles`) hides everything except the document body,
sets print-appropriate margins, and ensures diagrams/code/tables lay out for paper. Remote content
that is blocked by policy is simply absent from the export (EC-PDF-4). An unsaved buffer can be
exported (EC-PDF-2) because export operates on the rendered preview, not the on-disk file.

## Styled vs clean

A setting selects PDF styling (DD-24), exposed in the Settings dialog Export group:

- **Current theme** — export using the active theme's tokens (colours, fonts) so the PDF matches what
  the user sees on screen.
- **Clean document** — export with a neutral print stylesheet (black text on white, print-friendly
  fonts) regardless of the active theme, for a document-like result.

Default: **Current theme**. The choice only affects styling; the content and scope are identical.

## Limitations

v1 deliberately ships **no paginated-layout controls** (DD-23): no page-size selector, headers/footers,
explicit page breaks, or repeated table headers. The document exports as one continuous flow handled by
the webview's print engine (EC-PDF-5). Deterministic pagination is documented as out of scope in
`00_Foundation/01_VISION_AND_SCOPE.md` §4 and may be revisited post-v1. Exact page breaking is
therefore determined by the platform webview, not by GoMarkEdit.

## Edge cases

- **EC-PDF-1** — Export waits for Mermaid/KaTeX to finish rendering before printing.
- **EC-PDF-2** — Unsaved buffer can be exported (uses current preview).
- **EC-PDF-3** — Cancelling the native print dialog writes no file and shows no error.
- **EC-PDF-4** — Policy-blocked remote content is exported without it.
- **EC-PDF-5** — Very long document exports as one continuous flow; no pagination controls in v1.
