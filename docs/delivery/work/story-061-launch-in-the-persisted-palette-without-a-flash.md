# STORY-061 — Launch in the persisted palette without a flash

## What you'll be able to do

Relaunch GoMarkEdit and see the persisted theme and resolved appearance on the first painted frame,
with no default-palette flash. The completed Phase 02 journey is exercised in the real build across
three widths and all six palettes, including keyboard focus, reduced motion, the no-document state,
the editor, preview surface and status bar, while offline verification proves that fonts and theme
assets make no request.

## Rules this story owns

- `themes-and-appearance.md#no-flash-on-launch`

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
- `constraints.md#live-checks-exist`

The shared constraints repeat here because this story is the real-build phase gate, not because it
defers their implementation: STORY-058 through STORY-060 must satisfy the applicable constraint in the
same change that introduces each surface or behavior.
