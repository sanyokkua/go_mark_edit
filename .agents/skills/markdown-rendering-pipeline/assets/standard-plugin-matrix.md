# Standard × Plugin Matrix — Fill-In Template

Copy this template when proposing a new capability/plugin for the Markdown rendering pipeline.
Fill in one new row, then implement the change **only** in `frontend/src/logic/markdown/renderer.ts`
(`pluginsFor`) — see `references/plugin-sets.md`. This file is a planning aid; it is not consumed
by any code, and it does not replace the table in `references/plugin-sets.md`, which you must also
update once the change lands.

## Current matrix (mirror of `references/plugin-sets.md` — keep in sync)

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

## Blank row — copy and fill in for a proposed capability

| Capability | Plugin(s) | Minimal | GFM (default) | Full |
|---|---|:--:|:--:|:--:|
| _(what does this render? e.g. "Emoji shortcodes")_ | _(remark/rehype package name(s))_ | _(yes/no)_ | _(yes/no)_ | _(yes/no)_ |

Questions to answer before filling the row in:

- Which standard level(s) should enable it? (Most new capabilities land at Full first — see
  `DD-14` for the rationale behind Minimal staying CommonMark-only and GFM staying table-stakes.)
- Does the plugin emit markup that the sanitize schema doesn't yet allow? If yes, the sanitize
  schema needs a matching update — see `references/mermaid-and-sanitization.md` §"Sanitize schema
  requirements" before this capability can ship, or its output will be silently stripped.
- Does the plugin require a bundled asset (fonts, CSS, wasm)? If yes, it must be bundled via a
  local `import`, never a CDN reference — see `references/mermaid-and-sanitization.md` §"Bundled
  assets / offline (DD-32)".
- Does this plugin need to run before or after `rehype-sanitize`? (Almost always **before** —
  `rehype-sanitize` must stay last in the rehype list, no exceptions.)

## Reminder: single source of truth

The mapping lives **only** in `pluginsFor` inside `renderer.ts`. This matrix (and the table in
`references/plugin-sets.md`) is documentation that must be kept in sync with that function — it is
never itself read by the app. If this file and `renderer.ts` disagree, `renderer.ts` is correct;
fix the docs.
