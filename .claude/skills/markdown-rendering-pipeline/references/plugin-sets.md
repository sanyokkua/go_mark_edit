# Plugin Sets

How the Minimal/GFM/Full standard levels map to remark/rehype plugins, and why that mapping must
live in exactly one place.

## Standard level → plugin set (DD-14, one place only)

The standard is a single global user setting; the plugin list is **derived from it in one place**
(`renderer.ts`), never scattered as `if (level === …)` across components.

| Capability | Plugin(s) | Minimal | GFM (default) | Full |
|---|---|:--:|:--:|:--:|
| Core CommonMark | `react-markdown` (remark-parse) | yes | yes | yes |
| Tables / task lists / strikethrough / autolinks / footnotes | `remark-gfm` | no | yes | yes |
| Math `$…$` / `$$…$$` | `remark-math` + `rehype-katex` | no | no | yes |
| Directives / admonitions | `remark-directive` | no | no | yes |
| Frontmatter (YAML) | `remark-frontmatter` | no | no | yes |
| Code highlighting | `rehype-highlight` | yes | yes | yes |
| Mermaid fences | `components` override → `MermaidBlock` | yes | yes | yes |
| HTML sanitization | `rehype-sanitize` | yes | yes | yes |

## Single source of truth

`renderer.ts` owns `pluginsFor(standard)` — the only function that decides which plugins are
active for a given standard. Nothing else re-derives this list: not `MarkdownView`, not any other
component, not a hook. If a new capability needs a new plugin, add one line inside `pluginsFor`
and update the table above; do not add a parallel `if (standard === 'full') { … }` check anywhere
else in the codebase. This keeps the standard→plugin contract auditable from a single diff and
prevents the three levels from drifting out of sync across components.

```ts
// frontend/src/logic/markdown/renderer.ts — the ONE place the mapping lives
import type { PluggableList } from 'unified';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkDirective from 'remark-directive';
import remarkFrontmatter from 'remark-frontmatter';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import rehypeSanitize from 'rehype-sanitize';
import { sanitizeSchema } from './sanitizeSchema';

export type Standard = 'minimal' | 'gfm' | 'full';

export function pluginsFor(std: Standard): { remark: PluggableList; rehype: PluggableList } {
  const remark: PluggableList = [];
  if (std === 'gfm' || std === 'full') remark.push(remarkGfm);
  if (std === 'full') remark.push(remarkMath, remarkDirective, remarkFrontmatter);

  const rehype: PluggableList = [];
  if (std === 'full') rehype.push(rehypeKatex);
  rehype.push(rehypeHighlight);            // every level
  rehype.push([rehypeSanitize, sanitizeSchema]); // sanitize is ALWAYS last
  return { remark, rehype };
}
```

## Sanitize-last invariant

`rehype-sanitize` must be the **last** entry pushed onto the `rehype` list in every code path
through `pluginsFor`, at every standard level, with no exception. Sanitizing before a later
transform runs (e.g. before `rehype-katex` or `rehype-highlight` inject their own markup) would
let that later transform reintroduce unsanitized HTML into the final tree. Any refactor of
`pluginsFor` must preserve this ordering — treat it as a correctness invariant, not a style
preference. See `references/mermaid-and-sanitization.md` for what the sanitize schema itself must
permit.

## MarkdownView consumption

`MarkdownView` (and any other consumer) calls `pluginsFor` and passes the result straight into
`ReactMarkdown` — it never inspects `standard` itself or re-implements the mapping:

```tsx
// ui/components/MarkdownView — consumes the derived sets; never re-derives them
const { remark, rehype } = pluginsFor(standard);
<ReactMarkdown remarkPlugins={remark} rehypePlugins={rehype} components={markdownComponents}>
  {source}
</ReactMarkdown>
```

`components={markdownComponents}` is where the Mermaid override is wired in — see
`references/mermaid-and-sanitization.md` for `MermaidBlock` itself.
