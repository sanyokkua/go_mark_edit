**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester
**Last Updated:** 2026-07-25
**Cross-references:** `00_Foundation/04_DESIGN_DECISIONS.md`, `01_Product/01_FUNCTIONAL_REQUIREMENTS.md`, `01_Product/05_RENDERING_AND_EXTENSIONS.md`, `01_Product/10_THEMING.md`, `01_Product/11_SETTINGS.md`, `mockups/gomarkedit-mockup.html`

# Export

Getting a document out of GoMarkEdit: as a PDF through the webview's print path (DD-23), as HTML, or on
the clipboard. Refines `01_FUNCTIONAL_REQUIREMENTS.md#fr-pdf`.

## Table of Contents

1. [Export flow](#export-flow)
2. [The print root](#the-print-root)
3. [Readiness](#readiness)
4. [The print stylesheet](#the-print-stylesheet)
5. [Styled vs clean](#styled-vs-clean)
6. [Export as HTML](#export-as-html)
7. [Progress and cancel](#progress-and-cancel)
8. [Platform reality](#platform-reality)
9. [Limitations](#limitations)
10. [Edge cases](#edge-cases)

## Export flow

"Export to PDF…" (`Ctrl/Cmd+Shift+E`, File menu) exports the **current document** only. The flow:

1. The document's canonical content — the backend model's copy, after any pending editor sync is
   flushed (DD-62/DD-64) — is rendered by the standard pipeline
   (`05_RENDERING_AND_EXTENSIONS.md#pipeline`) into a print-scoped copy of the preview.
2. Export **waits** until asynchronous content — Mermaid diagrams and KaTeX math — has finished
   rendering (EC-PDF-1).
3. The webview print path (`window.print()` against the print root) is invoked, producing the OS
   "Save as PDF" dialog.
4. The user chooses a destination and confirms; cancelling writes nothing (EC-PDF-3).

Export orchestration lives in `internal/export` (backend trigger) driving the frontend print view; it
is a gated long op (`internal/gate`) so it cannot overlap with a Format-all or another export.

**The handshake, in full**, because the gate must not be stranded if any step fails:

`Export()` acquires the gate → emits `export:prepare{generation}` → the frontend mounts the print root
and awaits readiness → `export:ready{generation}` → `export:print` → `window.print()` → `afterprint`
→ `export:done{generation}` → the gate is released.

A **wall-clock timeout releases the gate** if the frontend never reports back — a webview that has gone
away must not leave the application permanently "busy" (ADR-0032). A `generation` that does not match
the current export is ignored, so a stale reply from an abandoned export cannot release the gate for a
live one.

## The print root

Export renders into a **separate off-screen root**, not into the live preview with chrome hidden by
`@media print`.

The reason is concrete: the preview pane is a scroll container (`overflow-y: auto`), and printing a
scroll container prints its first page and clips the rest. That is the classic "only page one came out"
bug, and a reviewed reference application ships it. A dedicated root has unconstrained height, is
unaffected by the user's current scroll position or view arrangement, and lets styled-versus-clean be a
single `data-print-style` attribute on one element.

Only the **rendered document** is printed — never the app chrome. Remote content blocked by policy is
simply absent (EC-PDF-4). An unsaved buffer can be exported (EC-PDF-2) because export operates on the
rendered content, not the on-disk file.

## Readiness

`EC-PDF-1` requires export to wait for asynchronous content. "Wait" needs a definition, because there is
no single event that means "the document is finished".

Export proceeds when all three hold:

1. **Every Mermaid block has reported success or failure for the current generation.** The generation
   token is the same one that discards stale renders (`05_RENDERING_AND_EXTENSIONS.md#mermaid`).
2. **`document.fonts.ready` has resolved** — KaTeX renders with its own fonts, and printing before they
   load produces fallback glyphs at the wrong metrics.
3. **Every image in the print root has decoded.**

**Each has a timeout, and a timeout proceeds rather than failing.** A remote image that policy has
blocked never resolves at all; without a bound, export would hang forever waiting for something that
will not happen. This adds a clause to `EC-PDF-4`: blocked remote content is absent from the export
**and does not stall it**.

## The print stylesheet

Named in the architecture as `ui/styles/print.css` and previously undefined. The colour half is in
`10_THEMING.md#print-and-export`; the layout half is here. Every rule below exists because its absence
is a visible defect in a printed document:

| Rule | Prevents |
|---|---|
| `@page { margin: 18mm 16mm }` | Text running to the paper's edge. Also the only lever on the print engine's own header and footer. |
| `pre, code { white-space: pre-wrap; word-break: break-word; overflow: visible }` | **Long code lines being silently cut off.** On screen `pre` scrolls horizontally; on paper horizontal overflow is clipped, and the right-hand end of every long line simply vanishes with no indication. This is the single most common complaint about Markdown-to-PDF and neither reference application handles it. |
| `pre, table, blockquote, figure, .gme-mermaid { break-inside: avoid }` | A fenced block split across a page boundary mid-line. |
| `h1, h2, h3, h4, h5, h6 { break-after: avoid }` | A heading orphaned at the foot of a page. |
| `table thead { display: table-header-group }` | A multi-page table losing its header. This is one line, and it is why `#limitations` no longer claims repeated headers are impossible. |
| `print-color-adjust: exact` on code blocks, table headers and blockquotes | Backgrounds being dropped — print engines omit them by default, so a code block's tint disappears and its border is all that is left. |
| `.gme-mermaid svg { max-width: 100%; max-height: 220mm; height: auto }` | A viewBox'd SVG collapsing or overflowing in an unconstrained print context. |
| `a[href^="http"]::after { content: " (" attr(href) ")" }` in **Clean** only | A printed link whose destination is unknowable. Omitted in Current-theme, where the link is still visibly a link. |

## Styled vs clean

A setting selects PDF styling (DD-24), exposed in the Settings dialog Export group:

- **Current theme** — export using the active theme's tokens (colours, fonts) so the PDF matches what
  the user sees on screen.
- **Clean document** — export with a neutral print stylesheet (black text on white, print-friendly
  fonts) regardless of the active theme, for a document-like result.

Default: **Current theme**. The choice only affects styling; the content and scope are identical.

**Current theme always exports on a light background.** The print root is forced to
`data-mode="light"`, `--blur` becomes `none`, and `--canvas` becomes white. This is not a preference: a
Liquid Glass dark document printed as-is is a full-page dark gradient behind translucent panels, which
comes out as a black page or as nothing at all depending on the platform's print engine. The theme's
accent, fonts and character survive; only the backdrop is neutralised
(`10_THEMING.md#print-and-export`).

## Export as HTML

The sanitized HTML already exists in the render pipeline, so this is nearly free and it is more useful
than PDF for pasting into an email, a wiki or a CMS.

- **Export → HTML…** writes a `.html` file next to a chosen destination.
- **Copy as HTML** puts the same markup on the clipboard.

A setting chooses between **Standalone** — a complete document with the theme's styles inlined, which
opens correctly in any browser — and **Fragment** — the body markup only, which is what a CMS wants
(`11_SETTINGS.md#export-group`). Both go through the same sanitization as the preview
(`19_SANITIZATION_AND_CSP.md`): an export is not a hole in the allowlist.

Images are referenced by their existing paths and are **not** inlined or copied. Standalone HTML that
references `assets/diagram.png` needs that folder beside it, which the export tells the user.

## Progress and cancel

Export holds the single-flight gate, so it shows progress and offers cancel like every other gated
operation (`20_NOTIFICATIONS_AND_EMPTY_STATES.md#progress-and-cancel`). The Export control becomes
Cancel while the export runs. Cancelling before `window.print()` is invoked releases the gate and writes
nothing.

## Platform reality

`window.print()` does not behave the same way on the three platforms, and stating the flow as though it
does would leave an implementer to discover it during a release.

| Platform | Behaviour |
|---|---|
| macOS (WKWebView) | The native print panel opens, with Save as PDF in its PDF menu. |
| Windows (WebView2) | WebView2's own print preview opens, with Save as PDF as a destination. |
| Linux (WebKitGTK) | Historically the weakest path; `window.print()` has not always been wired to a dialog. If it is unavailable on the runtime we ship against, Export reports plainly that PDF export is not available on this platform and offers **Export as HTML** instead — which is why HTML export is not a nice-to-have. |

**Cancellation cannot be detected.** `afterprint` fires identically whether the user saved a file or
dismissed the dialog, and `window.print()` returns synchronously in some engines and blocks in others.
So `afterprint` is treated as *completion regardless of outcome*: unmount the print root, release the
gate, and **never claim a file was written**. Without this rule someone will build a success toast that
lies half the time.

## Limitations

v1 deliberately ships **no paginated-layout controls** (DD-23): no page-size selector, headers/footers,
or explicit page breaks. (Repeated table headers *are* supported — see the print stylesheet; the
earlier claim that they were not was pessimistic by one CSS line.) The document exports as one
continuous flow handled by
the webview's print engine (EC-PDF-5). Deterministic pagination is documented as out of scope in
`00_Foundation/01_VISION_AND_SCOPE.md` §4 and may be revisited post-v1. Exact page breaking is
therefore determined by the platform webview, not by GoMarkEdit.

## Edge cases

- **EC-PDF-1** — Export waits for Mermaid/KaTeX to finish rendering before printing.
- **EC-PDF-2** — Unsaved buffer can be exported (uses current preview).
- **EC-PDF-3** — Cancelling the native print dialog writes no file and shows no error.
- **EC-PDF-4** — Policy-blocked remote content is exported without it, **and does not stall the export**
  — a blocked image never loads, so the readiness wait is bounded by a timeout.
- **EC-PDF-5** — Very long document exports as one continuous flow; no pagination controls in v1.
- **EC-PDF-6** — A code line wider than the page → wrapped, never clipped. Nothing is silently lost.
- **EC-PDF-7** — Export in a dark theme with **Current theme** styling → the page background is white
  and the text is legible; the theme's accent and fonts are preserved.
- **EC-PDF-8** — The frontend never reports readiness (a crashed or closed webview) → the wall-clock
  timeout releases the gate; the app is usable again without a restart.
- **EC-PDF-9** — Export is cancelled before printing → the gate is released, the print root is
  unmounted, and no file is claimed.
- **EC-PDF-10** — `window.print()` is unavailable on the platform → a plain message saying PDF export is
  not available here, offering Export as HTML.
- **EC-PDF-11** — Standalone HTML is exported for a document with local images → the file is written and
  the user is told the images are referenced, not embedded.
