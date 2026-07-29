# STORY-063 — Complete and apply unified editor palettes

**STATUS:** stub — not buildable. Run `/plan-story 063` to expand.
**Phase:** 02

## What you'll be able to do

Open a Markdown document containing headings, links and a fenced Go block, then switch among all six
palettes and see the app surfaces and Monaco restyle together. The ten palette rows STORY-058 omitted
are completed as part of applying the palette to the real editor, so this is an observable repair
rather than a token-only layer. The same syntax source generates the preview highlight stylesheet that
Phase 06 will activate; this story does not add preview syntax highlighting.

## Rules this story owns

- **Markdown source and code inside fences use separate appearance palettes** —
  `spec/product/themes-and-appearance.md#two-syntax-palettes`
  Nine `--md-*` tokens colour Markdown source and eight `--hl-*` tokens colour programming-language
  tokens inside fences; both families have one light and one dark value and never vary by theme.

- **Six Monaco themes are generated from the normative tokens** —
  `spec/product/themes-and-appearance.md#editor-theme-is-generated`
  Build-time generation produces three themes × light and dark, mapping the editor, gutter, cursor,
  selection, current line, widgets, minimap, scrollbar, diagnostics, Markdown grammar and embedded
  languages to traceable token values rather than hand-written colours.

## Shared constraints carried

- **Every surface works in three themes across light and dark** —
  `spec/constraints.md#every-surface-is-themed`
  Monaco and the Phase 01 app surfaces are checked in Liquid Glass, Material and Minimal at both
  resolved appearances, and no component contains a colour literal.

- **Nothing leaves the device** — `spec/constraints.md#nothing-leaves-the-device`
  Theme generation and application make no outbound request, and the app still sends nothing before
  the assistant exists.

- **Every rendering asset is bundled** — `spec/constraints.md#every-asset-is-bundled`
  Monaco, both bundled UI fonts and the generated highlight stylesheet resolve from the application
  bundle with the network disconnected.

- **Anything a mocked bridge cannot prove gets a live-test case** —
  `spec/constraints.md#live-checks-exist`
  Real Monaco rendering and computed font, selection, gutter, widget and scrollbar colours get a
  numbered live case against the built binary.

## Depends on

STORY-058, which shipped the persisted theme and appearance choices, the root applier, both controls,
the bundled fonts and most palette tokens. This story also repairs the ten missing rows of
`theme-identity-is-stable`, a rule STORY-058 already owns historically, while delivering their first
observable consumer instead of duplicating ownership in a token-only story.
