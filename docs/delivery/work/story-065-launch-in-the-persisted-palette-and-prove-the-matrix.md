# STORY-065 — Launch in the persisted palette and prove the matrix

**STATUS:** stub — not buildable. Run `/plan-story 065` to expand.
**Phase:** 02

## What you'll be able to do

Relaunch GoMarkEdit and see the persisted theme and resolved appearance on the first painted frame,
with no default-palette flash. The real build then proves the complete Phase 02 journey at three widths
and all six palettes, including keyboard focus, reduced motion, the no-document state, editor, preview
surface and status bar, while offline observation confirms that fonts and theme assets make no request.
The Phase 02 controls also receive one inline monochrome SVG icon set that inherits the current palette,
so no platform-dependent emoji or one-off icon survives the visual gate.

## Rules this story owns

- **The first paint is already in the persisted theme** —
  `spec/product/themes-and-appearance.md#no-flash-on-launch`
  Before the webview paints, `data-theme` and resolved `data-mode` come from the persisted choice through
  asset-server injection or a theme-only local mirror, while SQLite remains authoritative and no
  default palette appears for even one frame.

## Shared constraints carried

- **Every surface works in three themes across light and dark** —
  `spec/constraints.md#every-surface-is-themed`
  The no-document state, controls, editor, preview and status bar are checked at three widths in all six
  palettes, with no colour literal outside `tokens.css`.

- **Every action is reachable by keyboard, and focus is visible** —
  `spec/constraints.md#every-action-is-reachable-by-keyboard`
  Both Appearance entry points and every control can be reached and invoked without a pointer, with the
  two-layer focus ring visible in every palette and accessible names from the catalogue.

- **Every list, tree and table has a written empty state** —
  `spec/constraints.md#every-list-has-an-empty-state`
  With no document open, the launcher shows `GoMarkEdit`, New file, Open file…, Open folder… and the
  specified recent-items behavior instead of a blank themed shell.

- **Every user-visible string comes from the catalogue** —
  `spec/constraints.md#every-string-goes-through-t`
  Appearance labels, help text, tooltips and accessible names are catalogue keys rendered through
  `t()` rather than literals in components.

- **Every error message is distinct and actionable** —
  `spec/constraints.md#every-error-message-is-distinct-and-actionable`
  A failed settings read or write uses its classified title and remediation without exposing a raw
  error, operation prefix or internal path.

- **Notifications coalesce, and success is usually silent** —
  `spec/constraints.md#notifications-coalesce`
  Successful theme changes and settings writes raise no toast, while repeated failures share one dedup
  key rather than stacking duplicate notifications.

- **Nothing leaves the device** — `spec/constraints.md#nothing-leaves-the-device`
  Five minutes of real-build use produces no request, including no font, theme, telemetry or update
  fetch.

- **Every rendering asset is bundled** — `spec/constraints.md#every-asset-is-bundled`
  Monaco, the syntax styles and both UI fonts render correctly with the network disconnected.

- **Every unbounded input names its bound and what happens at it** —
  `spec/constraints.md#every-limit-is-named`
  Phase 02 adds no unbounded input or unnamed limit; the gate confirms the Appearance controls did not
  introduce one.

- **One monochrome icon set is tinted from the current colour** —
  `spec/constraints.md#icons-are-monochrome-svg`
  Every Phase 02 icon comes from the inline monochrome SVG sprite, inherits `currentColor` in all six
  palettes and never uses emoji.

- **Motion respects the reduced-motion preference** —
  `spec/constraints.md#motion-respects-the-preference`
  Reduced motion collapses every duration token to `0ms`, and switching theme or appearance remains
  instantaneous even when motion is enabled.

- **Anything a mocked bridge cannot prove gets a live-test case** —
  `spec/constraints.md#live-checks-exist`
  First-frame persistence, real fonts, platform appearance, native selection and scrollbars, offline
  behavior and the eighteen visual combinations have numbered cases run against `just build` output.

## Depends on

STORY-058 for persisted choices and both controls, STORY-063 for the complete palette and generated
editor themes, and STORY-064 for the Auto watcher and coordinated app-and-Monaco system response.
