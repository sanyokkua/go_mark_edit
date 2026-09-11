# Extending the Markdown pipeline

One pipeline renders the preview. It lives in `frontend/src/logic/markdown/renderer.ts` and is consumed
by `frontend/src/ui/components/MarkdownView.tsx`. There is never a second parser.

## What is there now

```ts
// frontend/src/logic/markdown/renderer.ts
export const baseGfmRemarkPlugins: PluggableList = [remarkGfm];

export const baseGfmRehypePlugins: PluggableList = [
  [rehypeSanitize, baseGfmSanitizeSchema],
];
```

Two things about the current schema are deliberate and easy to break:

- `clobberPrefix: ''` — `remark-gfm` already prefixes generated footnote ids with `user-content-`.
  Letting the sanitiser prefix them again breaks every footnote's internal link.
- `img` is allowed `alt` and nothing else. The image `src` is stripped, and `markdownComponents.img`
  renders the alt text as a labelled span. That stays until the guarded asset handler and the
  remote-content policy exist; spreading the image props back in would silently reintroduce a fetchable
  URL.

## Adding a plugin

The order is not a style preference. remark plugins transform the Markdown tree, rehype plugins
transform the HTML tree, and **the sanitiser runs last** so it sees everything every other plugin
produced.

```ts
const remarkPlugins: PluggableList = [remarkGfm, remarkMath];

const rehypePlugins: PluggableList = [
  rehypeKatex,       // produces maths markup
  rehypeHighlight,   // produces hljs-* class names
  [rehypeSanitize, schemaForLevel(level)],  // last, always
];
```

A new plugin usually produces markup the current schema strips, so the plugin and the schema change
together:

```ts
// permit exactly what the plugin emits — not everything
const schema: Schema = {
  ...baseGfmSanitizeSchema,
  attributes: {
    ...baseGfmSanitizeSchema.attributes,
    code: [...(baseGfmSanitizeSchema.attributes?.code ?? []), ['className', /^hljs-/, 'language-']],
    span: [...(baseGfmSanitizeSchema.attributes?.span ?? []), ['className', /^katex/]],
  },
};
```

Widen the schema to the specific pattern the plugin emits. Widening it until the symptom disappears —
allowing all `className` values, or dropping the sanitiser for one level — is how a document becomes
able to run script inside a webview that can call the Go backend.

## Plugin sets are chosen by the standard level

The Markdown standard setting picks which plugins run:

```ts
export function pluginsFor(level: StandardLevel): {
  remark: PluggableList;
  rehype: PluggableList;
} {
  switch (level) {
    case 'minimal':
      return { remark: [], rehype: [[rehypeSanitize, minimalSchema]] };
    case 'gfm':
      return { remark: [remarkGfm], rehype: [[rehypeSanitize, gfmSchema]] };
    case 'full':
      return {
        remark: [remarkGfm, remarkMath, remarkDirective, remarkFrontmatter],
        rehype: [rehypeKatex, rehypeHighlight, [rehypeSanitize, fullSchema]],
      };
  }
}
```

Each level has its own schema, because a level that does not run KaTeX has no reason to permit KaTeX's
markup.

## Fenced blocks that are not code

A ` ```mermaid ` fence is intercepted by a `components` override rather than by a plugin, because it
renders asynchronously:

```tsx
export const markdownComponents: Components = {
  code({ className, children }) {
    if (className === 'language-mermaid') {
      return createElement(MermaidBlock, { source: String(children) });
    }
    return createElement('code', { className }, children);
  },
};
```

`MermaidBlock` dynamically imports Mermaid (`await import('mermaid')`), calls `mermaid.parse` before
`mermaid.render` so a syntax error is a message rather than an exception, and guards against the
component unmounting mid-render with a generation token. Its output is the one place
`dangerouslySetInnerHTML` is permitted, and only for SVG that has already been sanitised.

## Everything is bundled

KaTeX's stylesheet and fonts, Mermaid, the highlight token styles and every UI font are imported from
`node_modules` and resolved by Vite. Nothing is fetched at runtime — not a CDN script, not Google Fonts,
not a lazily-downloaded language pack. The app has to render a document with the network off.

```ts
import 'katex/dist/katex.min.css';        // bundled
// <link href="https://cdn.jsdelivr.net/..."> — never
```

## The preview is debounced

Rendering runs on a debounce off the editor's buffer, and above the large-document threshold live
updates pause. Neither is optional at any real document size: re-parsing on every keystroke drops the
typing frame rate long before the file gets big.

## Checklist

- [ ] One pipeline — no second parser, no second renderer
- [ ] `rehype-sanitize` is present and last for every standard level
- [ ] The schema permits the specific pattern the new plugin emits, not a category
- [ ] `clobberPrefix: ''` preserved if footnotes are in play
- [ ] Assets imported from `node_modules`, never fetched
- [ ] Async fences intercepted by a `components` override, cancel-guarded, theme-aware
- [ ] `dangerouslySetInnerHTML` only for already-sanitised SVG
- [ ] A test renders the new syntax and asserts the resulting accessible output
