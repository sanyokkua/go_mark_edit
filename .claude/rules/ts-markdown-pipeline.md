---
paths:
  - "frontend/src/logic/markdown/**"
  - "frontend/src/logic/format/**"
  - "frontend/src/logic/lint/**"
---

# TypeScript Markdown pipeline

**Authority:** `specification/00_Foundation/04_DESIGN_DECISIONS.md` (DD-14, DD-16, DD-17, DD-18,
DD-19, DD-20, DD-22, ADR-0003), `01_MODULE_INVENTORY.md` (`logic/markdown/`, `logic/format/`,
`logic/lint/`).

## Rendering (`logic/markdown/`)

- Pipeline is **react-markdown** with plugin sets chosen by the Markdown-standard setting (DD-14:
  Minimal / GFM / Full). Apply plugins in this order:

  ```tsx
  <ReactMarkdown
    remarkPlugins={[remarkGfm, remarkMath]}       // Full adds math/footnotes/directives/frontmatter
    rehypePlugins={[rehypeKatex, rehypeHighlight, rehypeSanitize /* schema below */]}
    components={markdownComponents}
  >{source}</ReactMarkdown>
  ```

- The `components` override intercepts ` ```mermaid ` fences into an async **MermaidBlock** (dynamic
  `await import('mermaid')`, `startOnLoad:false`, `mermaid.parse` then `mermaid.render`, cancel-on-unmount
  guard, theme from the current `data-theme`).
- Preview is **debounced** (DD-20); very large files may pause live updates per setting.
- **Sanitize** rendered HTML (rehype-sanitize with a schema that permits the pipeline's own output --
  math spans, `hljs-*` classes, task-list checkboxes -- and Mermaid SVG). `dangerouslySetInnerHTML`
  is used only for already-sanitized Mermaid SVG.
- Remote document assets (images/CSS) obey the content policy (DD-22, `offline-and-privacy.md`): Ask
  (banner) / Always allow / Always block. Local images resolve relative to the document through the
  guarded asset handler.

## Format (`logic/format/`)

- **Format** (pretty-print) and **Compact** (conservative whitespace tighten -- never aggressive minify;
  Markdown whitespace can be meaningful) via **Prettier standalone** / remark-stringify (DD-16).
- Enforce canonical defaults (DD-18): bullet `-`, emphasis `_`, ATX `#` headings.
- Runs on demand and optionally on save (settings).

## Lint (`logic/lint/`)

- **remark-lint** for consistency (list-marker, emphasis, heading style, ...) (DD-17); map findings to
  Monaco editor markers/squiggles + a status-bar count. On demand and optionally on save (DD-18).

## DO / DON'T

- DO bundle every rendering asset locally (`import 'katex/dist/katex.min.css'`, dynamic `import('mermaid')`,
  local `hljs` token styles) -- no CDN at runtime (`offline-and-privacy.md`).
- DON'T render untrusted HTML without the sanitize step. DON'T fetch a plugin/theme/font from a CDN.
- DON'T aggressively minify in Compact. DON'T diverge bullet/emphasis/heading from the canonical defaults.

## Authoring checklist

- [ ] Plugin set selected by the Markdown-standard setting (DD-14); plugins applied in the order above.
- [ ] Mermaid fences intercepted into the async block; render cancel-guarded and theme-aware.
- [ ] Output sanitized; `dangerouslySetInnerHTML` only for sanitized SVG.
- [ ] Format/Compact use canonical `-`/`_`/`#`; Compact stays conservative.
- [ ] Lint findings mapped to editor markers + status count.
- [ ] All assets bundled locally; preview debounced; remote assets gated by the content policy.
