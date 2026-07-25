# Phase 05 — My documents render richly and safely

## What you get

A document with a table, a maths formula, a code block and a diagram renders properly. Images stored
next to the document appear. Images from the internet do not load until you say so. And there is a
reading mode that hides everything except the document.

## Build it in this order

1. **Choose how much Markdown.** A standard selector — Minimal, GFM, Full — that changes which
   extensions are active, with the plugin set per level and a visible indication of which is on.
2. **Code, maths and diagrams.** Syntax highlighting for fenced code with a plain fallback for unknown
   languages; KaTeX for inline and block maths; Mermaid diagrams rendered asynchronously and contained
   so a broken diagram shows an error in place rather than taking down the preview. All three ship
   their assets locally — nothing is fetched at runtime, ever.
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
6. **Reading mode.** Hide every piece of chrome — sidebar, tabs, toolbar, menu bar **and status bar**
   — and show only the document. Leaving reading mode restores the exact arrangement, scroll position
   and focus you had.

## Where the details are

- Behaviour: `01_Product/04_MARKDOWN_STANDARDS.md`, `01_Product/05_RENDERING_AND_EXTENSIONS.md`,
  `01_Product/09_ASSETS_AND_SECURITY.md`
- Reading mode: `01_Product/02_EDITOR_AND_VIEWER_MODES.md`
- Offline rule: `03_NonFunctional/04_OFFLINE.md`, DD-32
- What it looks like: `mockups/gomarkedit-mockup.html` → `reading`, `banner`, `preview-only`
- Decisions: DD-14, DD-19 (standard → plugin set), DD-22 (remote content policy)

## Questions to settle first

**Blocking — this one is a hole in the specification, not a disagreement.** Nothing anywhere defines
what HTML a document may contain: no sanitization levels, no default allowlist of tags, attributes and
URL schemes, and no actual Content-Security-Policy directives. Three documents require "a level" and
none says what the levels are. Write it before step 1, because sanitization is in the pipeline from
the start.

Also settle:

- **Which images may load from where.** The sources talk about "user-configured roots" but no setting
  key, type, default or UI control exists for them. Recommendation: cut configured roots from v1 — the
  allowlist is the document's folder plus the workspace root, full stop. This also simplifies Phase 11.
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
mode, scroll, come back, and land exactly where you were. Watch the network the whole time and see
nothing except the remote image you explicitly allowed.
