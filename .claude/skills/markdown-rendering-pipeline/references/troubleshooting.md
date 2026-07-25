# Troubleshooting

Known symptom → cause → fix pairs for this pipeline, plus the full index of EC-RENDER/EC-FMT/
EC-LINT edge-case ids this skill touches. Check here before improvising a fix.

## Symptom / cause / fix

| Symptom | Cause | Fix |
|---|---|---|
| Script executes / raw HTML injected | `rehype-sanitize` missing or not last in the rehype list | Always append `[rehypeSanitize, sanitizeSchema]` last in `pluginsFor` |
| KaTeX fonts 404 / network request at runtime | Relying on a CDN instead of bundling | `import 'katex/dist/katex.min.css'`; never reference `cdn`/`unpkg`/`jsdelivr` |
| Math/table renders literally as text | Standard is Minimal (or GFM for math) — working as designed (EC-RENDER-6) | Only enable math at Full; do not force plugins on at a lower level |
| Preview crashes on a bad diagram | Rendering Mermaid synchronously / not catching `parse` | Route through async `MermaidBlock`, `parse` then `render`, catch → inline error (EC-RENDER-1) |
| React "setState on unmounted" warning | No cancel guard in the Mermaid effect | Add the `cancelled` flag + cleanup returned from `useEffect` |
| Compact changes rendered output | Aggressive minify stripping meaningful whitespace | Keep Compact conservative; never touch fenced/indented code (EC-FMT-3) |
| Typing janks in large files | Preview not debounced / no large-file pause | Debounce the render; honor the pause setting (DD-20, EC-RENDER-4) |
| Component imports `wailsjs/` | Bypassed the adapter boundary | Go through `logic/adapter/` (`ts-redux-adapter.md`) — pipeline needs no backend anyway |

## Edge-case id index

Every EC-RENDER-*/EC-FMT-*/EC-LINT-* id this skill's territory touches, with a one-line meaning.
Each one you touch should end up with a test that names it.

| Edge case | Meaning |
|---|---|
| `EC-RENDER-1` | Invalid Mermaid syntax must show an inline error, never crash the preview |
| `EC-RENDER-4` | Editor typing responsiveness is never sacrificed to preview freshness (debounce/large-file pause) |
| `EC-RENDER-5` | Sanitization must strip scripts/handlers/dangerous URLs while still permitting KaTeX spans, `hljs-*` classes, read-only task-list checkboxes, and Mermaid SVG |
| `EC-RENDER-6` | Math/GFM syntax at a standard level that doesn't enable it renders as literal text — expected, not a bug |
| `EC-FMT-1` | An unparseable document under Format is a no-op plus a user notice, never a corrupting rewrite |
| `EC-FMT-3` | Compact must never alter significant whitespace inside fenced/indented code blocks |
| `EC-LINT-2` | Lint never mutates the document |
| `EC-LINT-3` | When both on-save toggles are enabled, Format always runs before Lint |
| `EC-LINT-4` | Lint findings map to editor markers/status-bar count only — report-only, same non-mutation guarantee as EC-LINT-2 |

If the source spec (`specification/01_Product/05_RENDERING_AND_EXTENSIONS.md` or
`06_FORMAT_AND_LINT.md`) defines an EC id not listed here (e.g. `EC-RENDER-2/3/7`), treat this
table as non-exhaustive for those ids and confirm the current spec text directly — this index
covers only the edge cases already established in this skill's source material.
