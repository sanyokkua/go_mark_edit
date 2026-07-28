# STORY-058 — Choose and persist six complete app palettes

## What you'll be able to do

Open either the compact Settings menu or the minimum Appearance dialog and choose Liquid Glass,
Material or Minimal with Auto, Light or Dark appearance. Both controls show the same choice, write it
through immediately and stay in sync. The current app chrome, preview surface and status bar change
together, using complete root-level tokens, bundled fonts, monochrome icons and reduced-motion-safe
interaction styling. Invalid or missing stored values fall back silently to Material and Auto.

## Rules this story owns

- `themes-and-appearance.md#three-themes`
- `themes-and-appearance.md#choice-and-resolved-are-separate`
- `themes-and-appearance.md#tokens-on-the-root-element`
- `themes-and-appearance.md#theme-identity-is-stable`
- `themes-and-appearance.md#fonts-are-bundled`
- `themes-and-appearance.md#status-colours-follow-appearance`
- `themes-and-appearance.md#interaction-tokens`
- `themes-and-appearance.md#stacking-scale`
- `themes-and-appearance.md#motion-tokens`

## Shared constraints carried

- `constraints.md#every-surface-is-themed`
- `constraints.md#every-action-is-reachable-by-keyboard`
- `constraints.md#every-list-has-an-empty-state`
- `constraints.md#every-string-goes-through-t`
- `constraints.md#notifications-coalesce`
- `constraints.md#every-limit-is-named`
- `constraints.md#nothing-leaves-the-device`
- `constraints.md#every-asset-is-bundled`
- `constraints.md#icons-are-monochrome-svg`
- `constraints.md#motion-respects-the-preference`
- `constraints.md#settings-ship-with-their-feature`

The empty-state and limit constraints are carried here by showing the already-shipped no-document
state in all six palettes and by keeping both new controls closed, finite option sets; this story adds
no list, tree, table or unbounded input. Successful theme and settings writes remain silent.
