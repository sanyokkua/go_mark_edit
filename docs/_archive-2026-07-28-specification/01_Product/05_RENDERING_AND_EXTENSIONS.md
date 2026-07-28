**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester
**Last Updated:** 2026-07-10
**Cross-references:** `00_Foundation/04_DESIGN_DECISIONS.md`, `01_Product/01_FUNCTIONAL_REQUIREMENTS.md`, `01_Product/04_MARKDOWN_STANDARDS.md`, `01_Product/09_ASSETS_AND_SECURITY.md`, `02_Architecture/07_LARGE_FILES_AND_CONCURRENCY.md`, `mockups/gomarkedit-mockup.html`

# Rendering & Extensions

The rendering pipeline that turns Markdown source into HTML in the preview and reading mode. Refines
`01_FUNCTIONAL_REQUIREMENTS.md#fr-rendering`.

## Table of Contents

1. [Pipeline](#pipeline)
2. [GFM features](#gfm-features)
3. [Math (KaTeX)](#math-katex)
4. [Code highlighting](#code-highlighting)
5. [Mermaid](#mermaid)
6. [Components override](#components-override)
7. [Sanitization](#sanitization)
8. [Preview debounce](#preview-debounce)
9. [Edge cases](#edge-cases)

## Pipeline

The renderer is **react-markdown** configured with remark and rehype plugins whose set is chosen by
the active standard (DD-19, `04_MARKDOWN_STANDARDS.md#plugin-mapping`):

- **remark**: core parse, `remark-gfm` (GFM+), `remark-math` (Full), and Full-only extension plugins.
- **rehype**: `rehype-katex` (Full math), `rehype-highlight` (all levels), plus the sanitization stage.
- **`components` override**: intercepts ` ```mermaid ` fenced code and renders it via the async
  **MermaidBlock** component instead of a `<pre><code>` block.

The rendered output is mounted in the preview pane (the preview root container is `.gme-preview`,
implemented by the `PreviewView` / `ReaderView` component). The
pipeline runs entirely in the webview, offline; no plugin fetches anything from the network (DD-32).

## GFM features

At GFM and Full, `remark-gfm` enables: pipe **tables** (with alignment), **task-list** checkboxes
(rendered read-only in the preview), **strikethrough** (`~~text~~`), literal **autolinks**, and
**footnotes** with back-references. At Minimal these are inactive and their syntax renders literally
(EC-RENDER-6).

## Math (KaTeX)

At the **Full** level, `remark-math` parses inline `$…$` and display `$$…$$` math and `rehype-katex`
renders it with bundled KaTeX fonts (offline, DD-32). Invalid expressions render as an inline KaTeX
error token; rendering of the rest of the document continues (EC-RENDER-2). Math is unavailable at
Minimal/GFM and renders as literal text there.

## Code highlighting

Fenced code blocks are highlighted by `rehype-highlight` at every standard level, using a bundled
highlight theme that reads from theme tokens so it matches the active appearance. An **unknown or
absent language** falls back to a plain, unhighlighted code block (EC-RENDER-3). Highlighting is a
rendering concern and does not depend on the Markdown standard.

## Mermaid

` ```mermaid ` fences are rendered to inline SVG by the async **MermaidBlock** component. Mermaid
renders asynchronously: while a diagram computes, a loading placeholder is shown; on success the SVG
replaces it. **Invalid Mermaid syntax** yields an inline error state within that block, never a crashed
preview (EC-RENDER-1). Mermaid is available at all standard levels because it is handled by the
`components` override, not a remark plugin.

**Mermaid does not read theme tokens.** An earlier revision of this document said its SVG fills
"reference theme tokens such as `--accent` / `--muted`" — that is not how Mermaid works. It bakes
resolved colours into the SVG at render time, and outer CSS can restyle almost none of it. Theming is
therefore done through `themeVariables` built from the resolved token values, and every open diagram
**re-renders when the effective theme changes** (`10_THEMING.md#diagrams-and-maths`).

Four lifecycle rules, each of which a shipped implementation gets wrong:

- **Initialise once**, and again only on a theme change. `mermaid.initialize()` sets module-global
  config; calling it inside the per-block render effect re-initialises the singleton once per diagram
  per render, and a theme change mid-flight yields interleaved palettes across diagrams. Both reference
  implementations do this.
- **A fresh id per render.** `mermaid.render(id, src)` injects a temporary node into the document and
  removes it on success. Re-entrant renders sharing one id collide, and a *failed* parse can leave the
  orphan behind permanently. Mint `${blockId}-r${n}` with a per-block counter.
- **`parse()` before `render()`.** This is the mechanism behind EC-RENDER-1: parsing first yields a
  clean syntax-error message instead of a half-built node.
- **A generation token per render pass.** Mermaid and KaTeX finish out of order; anything arriving after
  a newer pass started is discarded. A cancellation flag that only suppresses `setState` is not enough —
  the in-flight render still mutates the DOM and Mermaid's global state. The same token gates PDF
  export's readiness check (`07_EXPORT.md#readiness`).

**A rendered diagram can be opened full-window.** Clicking a diagram — or its expand affordance —
opens it over the app at full size, with zoom and pan, and `Esc` closes it. A real architecture diagram
in a half-width preview pane is unreadable at any usable zoom level, which makes the feature look
broken rather than small. The expanded view is the same SVG, not a re-render, so it costs nothing
beyond a viewer and inherits the current theme.

Mermaid output is injected with `dangerouslySetInnerHTML` and therefore **bypasses the sanitizer
entirely**; it is governed by `securityLevel: 'strict'`
(`19_SANITIZATION_AND_CSP.md#what-the-sanitizer-does-not-cover`).

## Components override

react-markdown's `components` prop maps element/renderer overrides. The load-bearing override
intercepts fenced code whose info-string is `mermaid` and delegates to MermaidBlock (DD-19). Other
overrides may adjust links/images to route through the guarded asset handler and remote-content policy
(`09_ASSETS_AND_SECURITY.md`), and render task-list items as read-only checkboxes. Overrides must keep
output sanitized (see below).

## Sanitization

Rendered HTML is sanitized according to a **security level** so that document-supplied raw HTML cannot
execute scripts or exfiltrate data (consistent with the offline, no-network posture, DD-32). Raw HTML
in source is either escaped or passed through a sanitizing rehype stage that strips scripts, event
handlers, and dangerous URLs (EC-RENDER-5). Remote resource loading is additionally gated by the
remote-content policy (`09_ASSETS_AND_SECURITY.md#remote-content-policy`) and the app's CSP
(`#csp`).

## Preview debounce

The live preview is **debounced** so typing stays smooth (DD-20). For very large files the preview may
**pause** live updates (a setting; see `02_Architecture/07_LARGE_FILES_AND_CONCURRENCY.md#preview-debounce`),
updating on an explicit trigger or when editing settles. Editor responsiveness is never sacrificed to
preview freshness (EC-RENDER-4, EC-DOCS-4).

Pausing the preview affects **only** the preview. The buffer is not rolled back, the cursor and
selection do not move, and no accepted content is discarded — the document simply stops re-rendering
until the trigger. A render that fails or is superseded leaves the last successfully rendered output in
place rather than blanking the pane.

## Edge cases

- **EC-RENDER-1** — Invalid Mermaid → inline error block; rest of document renders.
- **EC-RENDER-2** — Invalid KaTeX → inline error token; rendering continues.
- **EC-RENDER-3** — Unknown code-fence language → plain code block.
- **EC-RENDER-4** — Very large document → debounce / pause live preview.
- **EC-RENDER-5** — Raw HTML handled per the sanitization security level.
- **EC-RENDER-6** — Higher-level feature at lower standard renders literally.
- **EC-RENDER-7** — Broken/missing image → alt text / placeholder (see `09_ASSETS_AND_SECURITY.md`).
