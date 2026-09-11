# Phase 06 — My documents render richly and safely

## What you get

A document with a table, a maths formula, a code block and a diagram renders as the mockup shows it —
the table with aligned columns, the formula typeset, the fence in more than one colour, the diagram as
an SVG in the current palette. Images stored
next to the document appear. Images from the internet do not load until you say so. And there is a
reading mode that hides everything except the document.

## Build it in this order

1. **Choose how much Markdown.** A standard selector — Minimal, GFM, Full — that changes which
   extensions are active, with the plugin set per level and a visible indication of which is on.
2. **Code, maths and diagrams.** Activate Phase 02's generated highlight stylesheet for fenced code,
   with a plain fallback for unknown languages. Add KaTeX for inline and block maths and Mermaid for
   asynchronous diagrams, both consuming Phase 02's resolved theme values and both contained so one
   failure cannot take down the preview. All three ship their assets locally — nothing is fetched at
   runtime, ever.
3. **Local images.** An image path in the document resolves relative to the document's folder and is
   served through a guarded handler with an allowlist. Path traversal is rejected. A missing image
   shows its alt text, not a broken-image icon.
4. **Remote content.** An image or stylesheet pointing at the internet is blocked by default and a
   banner offers to load it. The policy — Ask, Always allow, Always block — is a setting. This is the
   only place before the AI assistant exists where the app may touch the network, and only after you
   click.
5. **Sanitization.** Whatever HTML a document contains, the rendered output cannot execute script or
   reach anywhere it should not. This is not optional and not last: it is part of the render pipeline
   from the first line of step 1.
6. **A diagram you can actually read.** Clicking a rendered Mermaid diagram opens it full-window with
   zoom and pan; `Esc` closes it. The same SVG, not a re-render. A real architecture diagram in a
   half-width preview pane is unreadable at any usable size, which makes the whole feature look broken
   rather than small.
7. **Reading mode.** Hide every piece of chrome — sidebar, tabs, toolbar, menu bar **and status bar**
   — and show only the document. Leaving reading mode restores the exact arrangement, scroll position
   and focus you had.

## Where the details are

- Behaviour: `../spec/product/choosing-a-markdown-standard.md`, `../spec/product/rendering-rich-documents.md`,
  `../spec/product/images-and-remote-content.md`
- Theme integration: renderer-specific rules live in
  `../spec/product/rendering-rich-documents.md`; Phase 02 supplies tokens and generated assets, while
  this phase owns their live consumers
- Reading mode: `../spec/product/writing-in-the-editor.md`
- Offline rule: `../spec/constraints.md#nothing-leaves-the-device`
- What it looks like: `../spec/surface/mockup.html` → `reading`, `banner`, `preview-only`
- Decisions: the Markdown standard selects the plugin set, and document-referenced remote content is
  governed by an Ask / Always allow / Always block policy
  (`../adr/0030-sanitization-allowlist-and-csp.md`)

## Questions to settle first

**Nothing blocking — both former blockers were closed on 2026-07-25.**

Theme ownership was settled on 2026-07-28: Phase 02 supplies theme infrastructure and generated
syntax assets; this phase owns preview syntax activation, Mermaid and KaTeX, including rerendering on
theme changes and discarding stale generations.

- What HTML a document may contain is now specified in `../spec/product/images-and-remote-content.md`
  (ADR-0030): sanitization is derived from the Markdown standard rather than being a separate control,
  Minimal and GFM escape raw HTML at no cost, and only Full adds `rehype-raw` + `rehype-sanitize`. That
  document also enumerates the CSP, names the two renderers that bypass the sanitizer entirely
  (Mermaid and KaTeX), and carries the adversarial fixture corpus.
- **Configured roots were cut.** The allowlist is the document's folder plus the workspace root, full
  stop. Three documents required "user-configured roots" and none ever defined a setting for them.

Still to settle:

- **How long "Load once" lasts.** Is it until the tab changes, the document re-renders, the
  arrangement changes, or the document closes? Recommendation: until that document is closed or its
  path changes; it survives re-render, tab switch and arrangement change.
- **When a file is too large to preview live.** A configurable threshold is required and no default,
  unit or comparison is given. Recommendation: 2 MB, not user-configurable in v1.
- **Stale async renders.** Mermaid and KaTeX finish out of order. Give each render a generation token
  and discard anything that arrives after a newer one started; the same rule serves PDF export.

## Done when

Open a document containing a GFM table, an inline formula and a display formula, a fenced Go block, a
fenced block in a language we do not know, a Mermaid diagram, an image sitting next to the file, and an
image on the internet. Everything renders correctly; the unknown language falls back to plain; the
local image appears; the remote one is blocked with a banner until you allow it. Switch to reading
mode, scroll, come back, and land exactly where you were. Switch theme and appearance while a diagram
is open: the preview code still matches Monaco, the maths restyles, and every diagram rerenders without
a stale result landing. Watch the network the whole time and see nothing except the remote image you
explicitly allowed.

And the constraints every phase carries: open a 2.1 MB document and confirm the preview pauses with its
banner, and a 1.9 MB one and confirm it does not; every new surface works in three themes across light
and dark; the remote-content banner's actions are reachable by keyboard alone; every new string goes
through `t()`; disconnect the network entirely and confirm every diagram, formula, code block and font
still renders, and that nothing is requested. All of it in a real build.
