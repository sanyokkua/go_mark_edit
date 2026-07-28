# STORY-059 — Generate and apply unified editor themes

## What you'll be able to do

Open a Markdown document containing headings, links and a fenced Go block, then switch among all six
palettes and see Monaco restyle immediately. Markdown punctuation and embedded-language tokens use
their specified light or dark syntax palette, while the editor background, gutter, selection, widgets,
minimap, scrollbar and diagnostics belong to the selected app theme. The same source also generates
the preview highlight stylesheet that Phase 06 will activate; this story does not add a preview
renderer.

## Rules this story owns

- `themes-and-appearance.md#two-syntax-palettes`
- `themes-and-appearance.md#editor-theme-is-generated`

## Shared constraints carried

- `constraints.md#every-surface-is-themed`
- `constraints.md#nothing-leaves-the-device`
- `constraints.md#every-asset-is-bundled`
- `constraints.md#live-checks-exist`
