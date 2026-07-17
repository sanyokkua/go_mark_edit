# Format, Compact, and Lint

The three on-demand editing operations that sit next to the rendering pipeline, plus the preview
debounce and large-file pause behavior that keeps live rendering from janking the editor.

## Operations table (DD-16, DD-17, DD-18)

| Operation | Engine | Behavior | Trigger |
|---|---|---|---|
| Format | Prettier standalone / remark-stringify | Pretty-print: pad tables, normalize markers/emphasis, ATX headings, wrap. One undo step, sets dirty. Unparseable → no-op + notice (EC-FMT-1) | Toolbar / `Alt+Shift+F`, optional on-save |
| Compact | remark-stringify | **Conservative** whitespace tighten — collapse blank runs / trailing spaces. **Never** aggressive minify; never alter significant whitespace in code blocks (EC-FMT-3) | Toolbar |
| Lint | remark-lint | Report-only; maps findings to Monaco squiggles + status-bar count. Never mutates (EC-LINT-2/4) | Toolbar / `Alt+Shift+L`, optional on-save |

## Canonical style defaults (DD-18)

Format and Compact both normalize toward the same canonical style, and Lint's rules are defined
relative to it:

- Bullet marker: `-`
- Emphasis marker: `_`
- Heading style: ATX (`#`, not Setext underlines)

These three are the only canonical defaults this pipeline enforces; do not introduce a fourth
without a corresponding `DD-` entry.

## On-save ordering (EC-LINT-3)

When both the "Format on save" and "Lint on save" toggles are enabled, **Format always runs
before Lint**. This matters because Format changes the document (padding tables, normalizing
markers, wrapping), which can change *which* lint findings are still valid — running Lint first
would report against a document state that's about to be rewritten. Any change to the on-save
wiring must preserve this order; do not make the two toggles independent/parallel.

## Lint findings → editor markers

```ts
// frontend/src/logic/lint/lint.ts — findings → editor markers
export interface LintFinding { line: number; column: number; message: string; ruleId: string }
export function toMonacoMarkers(findings: LintFinding[]): editor.IMarkerData[] { /* map ranges */ }
```

Lint is strictly report-only (EC-LINT-2/4): `toMonacoMarkers` (and everything downstream of it —
the squiggles, the status-bar count) must never mutate the document. If a future change wants
Lint to *fix* something, that is a Format-shaped change, not a Lint-shaped one — route it through
the Format engine instead of teaching Lint to write.

## Preview performance (DD-20)

Live preview is **debounced** so typing stays smooth; very large files may **pause** live updates
(a user setting). Editor responsiveness is never sacrificed to preview freshness (EC-RENDER-4).
Concretely:

- The render pass that turns the current document into preview HTML is debounced from keystrokes
  — it does not re-render on every character.
  - The debounce protects the *preview*, never the *editor* — typing must never wait on a render.
- The large-file pause setting, when enabled and the document crosses the size threshold, stops
  live preview updates entirely rather than degrading them (e.g. a stale-but-frozen preview plus
  an affordance to manually refresh), rather than continuing to debounce-and-lag.

## Monaco note

Monaco is the editor engine for v1 and is out of scope for this pipeline's rendering/format/lint
logic — this skill touches the *pipeline* feeding Monaco markers (Lint) and the document text
Monaco holds (Format/Compact), not Monaco's own configuration. When writing or updating tests
against these operations, use `findBy*`/`waitFor` (async, retrying queries), never fixed
`setTimeout`/sleep-based waits — the debounce above means a naive fixed-delay test is either
flaky or slow, and both are wrong.
