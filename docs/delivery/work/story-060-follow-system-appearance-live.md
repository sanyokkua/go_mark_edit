# STORY-060 — Follow system appearance live

**STATUS:** stub — not buildable. Run `/plan-story 060` to expand.
**Phase:** 02

## What you'll be able to do

Choose Auto, change the operating system between light and dark and see the document root and Monaco
switch together without a reload. Choosing Light or Dark instead stops watching the operating system
and leaves the app pinned. The stored choice remains Auto even though the resolved root mode is always
Light or Dark.

## Rules this story owns

- **Auto follows the system and updates live** —
  `spec/product/themes-and-appearance.md#auto-follows-the-system`
  While the appearance is Auto, the resolved appearance is `dark` when the operating system reports
  `prefers-color-scheme: dark` and `light` otherwise; when the system switches with Auto selected the
  palette changes immediately with no relaunch **and the Monaco editor theme is swapped in the same
  change**; while Light or Dark is pinned the system setting is ignored and the app does not subscribe
  to it at all. The root tokens changing while Monaco stays light is the named defect.

## Shared constraints carried

- **Every surface works in three themes across light and dark** —
  `spec/constraints.md#every-surface-is-themed`
  Both resolved appearances are checked in all three themes, so all six combinations are exercised by
  the switch itself.

- **Motion respects the reduced-motion preference** —
  `spec/constraints.md#motion-respects-the-preference`
  Switching appearance is never animated, and while the system reports
  `prefers-reduced-motion: reduce` one rule collapses `--dur-fast` (120 ms), `--dur-base` (180 ms)
  and `--dur-slow` (300 ms) to `0ms`.

- **Anything a mocked bridge cannot prove gets a live-test case** —
  `spec/constraints.md#live-checks-exist`
  A real operating-system appearance switch cannot be proven against a mocked bridge, so it gets a
  numbered case in `plan/testing/live-plan.md`, run against the built binary.

## Depends on

STORY-058, for the stored choice/resolved split and the root applier — this story adds the watcher
STORY-058 deliberately left out. STORY-059, for the six generated Monaco themes this story must swap
between; without them "the Monaco editor theme is swapped" has nothing to swap to.
