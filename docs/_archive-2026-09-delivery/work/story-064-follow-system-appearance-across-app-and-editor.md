# STORY-064 — Follow system appearance across the app and editor

**STATUS:** stub — not buildable. Run `/plan-story 064` to expand.
**Phase:** 02

## What you'll be able to do

Choose Auto, change the operating system between light and dark and see the document root and Monaco
switch together without a reload. Choosing Light or Dark stops watching the operating system and
leaves the app pinned, while the persisted choice remains Auto whenever Auto is selected.

## Rules this story owns

- **Auto follows the operating system and updates live** —
  `spec/product/themes-and-appearance.md#auto-follows-the-system`
  Auto resolves from `prefers-color-scheme`, subscribes only while Auto is selected, and changes the
  root palette and Monaco theme in one update; pinned Light or Dark ignores and does not watch the
  system setting.

## Shared constraints carried

- **Every surface works in three themes across light and dark** —
  `spec/constraints.md#every-surface-is-themed`
  A live system switch exercises both resolved appearances for Liquid Glass, Material and Minimal and
  keeps Monaco in the same palette as the surrounding app.

- **Motion respects the reduced-motion preference** —
  `spec/constraints.md#motion-respects-the-preference`
  Theme and appearance changes are never animated, and reduced motion collapses the 120 ms, 180 ms and
  300 ms duration tokens to `0ms` without disabling the switch.

- **Anything a mocked bridge cannot prove gets a live-test case** —
  `spec/constraints.md#live-checks-exist`
  A real operating-system appearance change gets a numbered live case against the built binary because
  a mocked bridge cannot prove platform observation.

## Depends on

STORY-058 for the persisted choice, resolved root mode and Appearance controls, then STORY-063 for the
six generated Monaco themes that must switch in the same update as the app surfaces.
