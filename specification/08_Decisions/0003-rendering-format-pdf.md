# ADR-0003 — remark/rehype rendering; Prettier/remark formatting; webview-print PDF export

**Status:** accepted
**Date:** 2026-07-10
**Deciders:** project owner, architect

## Context and problem statement

Three closely related frontend capabilities must be pinned together because they share the same
Markdown toolchain and the same "integrate a proven pipeline over inventing one" premise:

1. **Rendering** — how Markdown source becomes the preview (DD-19): the app supports Minimal
   (CommonMark), GFM, and Full (math, footnotes, admonitions, frontmatter) standards (DD-14), plus
   Mermaid diagrams.
2. **Format & Compact** — pretty-printing and conservative whitespace-tightening of the source
   (DD-16), plus consistency **linting** (DD-17).
3. **PDF export** — exporting the current document to PDF (DD-23), offline, with a styled-vs-clean
   choice (DD-24).

A `react-markdown` pipeline is a proven, well-established rendering approach. The open question with
real trade-offs is the **PDF path**: the app is fully offline (DD-32), CGO-free (DD-03), and must not
bundle heavyweight native tooling. This ADR locks DD-16, DD-19, and DD-23.

## Decision drivers

- Adopt a proven `react-markdown` rendering pipeline wholesale (DD-19).
- One toolchain spanning render + format + lint (remark/rehype/Prettier are one ecosystem) — fewer
  parsers, consistent behaviour between what you edit, format, and see.
- Fully offline: no headless browser download, no cloud print service, all assets bundled (DD-32).
- CGO-free and lightweight: avoid bundling or shelling out to a separate Chromium binary (DD-03).
- Format must be safe for Markdown, where whitespace can be meaningful — hence conservative Compact,
  not aggressive minify (DD-16).
- A pragmatic v1 PDF that "just works" via the platform, with a clear upgrade path if fidelity or
  pagination control later becomes a requirement.

## Considered options

**Rendering** (settled by reuse): `react-markdown` + `remark-gfm` + `remark-math` + `rehype-katex` +
`rehype-highlight`, with a `components` override intercepting ` ```mermaid ` fences into an async
`MermaidBlock`. **Formatting** (settled by reuse): Prettier / `remark-stringify` for Format+Compact,
`remark-lint` for linting. The genuinely-weighed axis is **PDF export**:

- **Webview `window.print()`** against a print-scoped copy of the rendered preview.
- **`jsPDF` + `html2pdf`** — client-side JS HTML-to-PDF rasterisation/conversion.
- **Headless Chromium via `chromedp`** — drive a real Chromium from Go to print to PDF.

## Decision outcome

Chosen: **rendering via `react-markdown` + `remark-gfm`/`remark-math`/`rehype-katex`/`rehype-highlight`
+ Mermaid `components` override; Format/Compact via Prettier/`remark-stringify`; lint via `remark-lint`;
and PDF export via the webview's `window.print()` against a print-scoped view.** The render and format
pipelines are effectively pre-decided by the mandate to adopt a proven pipeline and the one-ecosystem benefit.
For PDF, the webview print path is the only option that is fully offline, ships nothing extra, and
reuses the exact rendered DOM the user already sees — the printed output is the preview under a
print-scoped stylesheet, with a setting to choose **Current theme** or **Clean document** (DD-24). v1
deliberately does **not** implement paginated layout controls (headers/footers/page numbers/margins as
first-class settings). Should precise, headless, reproducible PDF become a hard requirement, the
documented upgrade path is a headless-Chromium (`chromedp`) exporter behind the same export boundary —
recorded here, not adopted now.

### Consequences

- Positive: Entire render + format + lint stack is one npm ecosystem, a proven pipeline — minimal
  new code, consistent parsing between edit/format/preview.
- Positive: PDF export ships zero extra binaries and makes zero network calls — it uses the OS webview's
  own print engine, honouring the offline and CGO-free constraints.
- Positive: WYSIWYP — the PDF is the very DOM the user previewed, so what they see is what prints
  (modulo the print stylesheet), and theme-vs-clean is a pure CSS switch.
- Negative: `window.print()` fidelity and available controls depend on each OS's webview print engine
  (WebView2 / WKWebView / WebKitGTK); page breaks, margins, and background rendering can differ per
  platform, and the flow may surface the OS print dialog.
- Negative: No programmatic pagination/margins/headers/footers in v1 — users wanting print-shop-grade
  layout are not served until the chromedp upgrade path is taken.
- Negative: Monaco/Mermaid/KaTeX aside, the render stack is heavy JS that must all bundle for offline
  use (shared cost with ADR-0002).
- Neutral: The export path is isolated behind an `internal/export` + print-scoped `ui/styles` boundary,
  so swapping in a chromedp exporter later needs no product/store changes.

## Pros and cons of the options

### Option A — Webview `window.print()` (print-scoped view)

- Good: Fully offline; nothing extra to bundle or install; reuses the exact rendered preview DOM;
  theme-vs-clean is a CSS toggle; trivially small implementation surface.
- Bad: Fidelity/controls vary by OS webview; limited/no programmatic pagination, margins, or
  headers/footers; may show the native print dialog rather than a silent export.

### Option B — `jsPDF` + `html2pdf`

- Good: Pure client-side and offline; more programmatic control over output than raw print; no external
  process.
- Bad: Notoriously imperfect HTML/CSS fidelity — often rasterises content (fuzzy text, broken
  selectable text), struggles with complex CSS, KaTeX, code highlighting, and long-document page
  breaks; adds a sizeable JS dependency for worse fidelity than the native print engine.

### Option C — Headless Chromium via `chromedp`

- Good: Highest, most reproducible fidelity with full pagination/margin/header-footer control,
  independent of the app's own webview; the natural long-term upgrade for print-grade output.
- Bad: Requires a Chromium present on the machine (bundling one contradicts the lightweight/offline
  goals; relying on a system one is unreliable); heavier build and runtime complexity; a real external
  process to manage. Overkill for v1 — recorded as the future upgrade path instead.

## Links

- Design decisions: DD-16 (Format + conservative Compact via Prettier/remark), DD-19 (react-markdown +
  remark/rehype + Mermaid override), DD-23 (PDF via webview print of a print-scoped view). Related:
  DD-14 (standards), DD-17 (remark-lint), DD-24 (styled vs clean PDF), DD-32 (offline).
- Spec clauses: `00_Foundation/04_DESIGN_DECISIONS.md#5-formatting-linting--standards`,
  `00_Foundation/04_DESIGN_DECISIONS.md#6-rendering--assets`,
  `01_Product/04_MARKDOWN_STANDARDS.md`, `01_Product/05_RENDERING_AND_EXTENSIONS.md`,
  `01_Product/06_FORMAT_AND_LINT.md`, `01_Product/07_PDF_EXPORT.md`,
  `05_Dependencies/02_FRONTEND_DEPENDENCIES.md`.
- Stories: Phase 05 rendering/extensions stories, Phase 08 format/lint stories, and Phase 08 PDF-export
  stories, per `07_Phases/00_ROADMAP.md` (authored per phase; none `done` at ADR time).
