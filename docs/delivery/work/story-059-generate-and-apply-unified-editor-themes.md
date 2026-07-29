# STORY-059 — Generate and apply unified editor themes

**STATUS:** stub — superseded and not buildable. Re-planned as STORY-063.
**Phase:** 02

## What you'll be able to do

Open a Markdown document containing headings, links and a fenced Go block, then switch among all six
palettes and see Monaco restyle immediately. Markdown punctuation and embedded-language tokens use
their specified light or dark syntax palette, while the editor background, gutter, selection, widgets,
minimap, scrollbar and diagnostics belong to the selected app theme. The same source also generates
the preview highlight stylesheet that Phase 06 will activate; this story does not add a preview
renderer.

## Rules this story owns

- **Markdown source and code inside fences are two different palettes** —
  `spec/product/themes-and-appearance.md#two-syntax-palettes`
  Two token families, each keyed by appearance only and never by theme: nine `--md-*` tokens
  (`--md-heading`, `--md-strong`, `--md-emphasis`, `--md-quote`, `--md-link`, `--md-comment`,
  `--md-marker`, `--code-fg`, `--gutter`) colouring the Markdown *source*, and eight `--hl-*` tokens
  (`--hl-keyword`, `--hl-string`, `--hl-comment`, `--hl-number`, `--hl-function`, `--hl-type`,
  `--hl-attr`, `--hl-punct`) colouring programming-language tokens *inside a fenced block* — each with
  one light and one dark value, so sixteen values rather than forty-eight.

- **The editor theme is generated from these tokens** —
  `spec/product/themes-and-appearance.md#editor-theme-is-generated`
  Six Monaco themes — three themes × light and dark — are generated at build time from those two
  tables, with no colour in a `defineTheme()` call that is not traceable to a token; each sets at
  least `editor.background` from `--app-bg`, `editor.foreground` from `--text`,
  `editorLineNumber.foreground` from `--gutter`, `editorCursor.foreground` from `--accent`,
  `editor.selectionBackground` from `--selection-bg`, `editor.lineHighlightBackground` from
  `--hover`, `editorWidget.background` and `editorWidget.border` from `--surface` and `--stroke`,
  `minimap.background` from `--app-bg`, `scrollbarSlider.*` from `--scrollbar-thumb` and
  `--scrollbar-thumb-hover`, `editorError.foreground` from `--err` and `editorWarning.foreground`
  from `--warn`.

## Shared constraints carried

- **Every surface works in three themes across light and dark** —
  `spec/constraints.md#every-surface-is-themed`
  The editor is checked in Liquid Glass, Material and Minimal, in light and dark — six combinations —
  and no component carries a colour literal.

- **Nothing leaves the device** — `spec/constraints.md#nothing-leaves-the-device`
  The generator and the themes it produces make no outbound request; before the assistant exists the
  app makes no outbound request at all.

- **Every rendering asset is bundled** — `spec/constraints.md#every-asset-is-bundled`
  Monaco and the highlight token styles are imported from the bundle and resolved at build time, so
  the editor styles correctly with the network disconnected.

- **Anything a mocked bridge cannot prove gets a live-test case** —
  `spec/constraints.md#live-checks-exist`
  Monaco's real rendering in the built binary — not `wails dev` — gets a numbered case in
  `plan/testing/live-plan.md`.

## Depends on

**STORY-062 first.** It adds the ten surface and text tokens (`--canvas`, `--elevated`,
`--surface-2`, `--surface-3`, `--stroke`, `--stroke-soft`, `--muted`, `--faint`, `--hover`,
`--user-bubble`) that STORY-058 shipped without. Two of them are named directly by
`#editor-theme-is-generated` above: `--stroke` for `editorWidget.border` and `--hover` for
`editor.lineHighlightBackground`. Generating editor themes from an incomplete palette would repeat
STORY-058's failure one layer up.

Then STORY-058, for the root token table, the persisted choice, and the applier that sets
`data-theme` and `data-mode`.
