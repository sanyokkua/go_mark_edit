# STORY-061 — Launch in the persisted palette without a flash

**STATUS:** stub — superseded and not buildable. Re-planned as STORY-065.
**Phase:** 02

## What you'll be able to do

Relaunch GoMarkEdit and see the persisted theme and resolved appearance on the first painted frame,
with no default-palette flash. The completed Phase 02 journey is exercised in the real build across
three widths and all six palettes, including keyboard focus, reduced motion, the no-document state,
the editor, preview surface and status bar, while offline verification proves that fonts and theme
assets make no request.

## Rules this story owns

- **The first paint is already in the right theme** —
  `spec/product/themes-and-appearance.md#no-flash-on-launch`
  When the window first paints after launch it is already in the persisted theme and appearance, with
  no moment in a default palette. This is achieved by writing `data-theme` and `data-mode` into the
  served `index.html` at asset-server time; a `localStorage` mirror read by a blocking script in
  `<head>` is an acceptable alternative, with the database remaining the source of truth and the
  mirror read for nothing else. Reading the theme from the database after the webview boots is the
  named defect — it guarantees a light-to-dark flash on every launch.

## Shared constraints carried

This story is Phase 02's real-build gate, so it carries the whole constraint set rather than one or
two. That is not deferral: STORY-058 through STORY-060 each satisfy the applicable constraint in the
change that introduces the surface or behaviour. This story is where they are checked together, on a
`just build` binary rather than `wails dev`.

- **Every surface works in three themes across light and dark** —
  `spec/constraints.md#every-surface-is-themed` — all six combinations, on every Phase 02 surface.
- **Every action is reachable by keyboard, and focus is visible** —
  `spec/constraints.md#every-action-is-reachable-by-keyboard` — every focusable element shows the
  two-layer ring `0 0 0 2px var(--app-bg), 0 0 0 4px var(--accent)`.
- **Every list, tree and table has a written empty state** —
  `spec/constraints.md#every-list-has-an-empty-state` — the one that exists in Phase 02 is the
  no-documents-open state: `GoMarkEdit` · New file · Open file… · Open folder….
- **Every user-visible string comes from the catalogue** —
  `spec/constraints.md#every-string-goes-through-t` — including accessible names and tooltips.
- **Notifications coalesce, and success is usually silent** —
  `spec/constraints.md#notifications-coalesce` — a successful theme change raises no toast, ever.
- **Every unbounded input names its bound** — `spec/constraints.md#every-limit-is-named` — Phase 02
  adds no new limit; the check is that none was introduced unnamed.
- **Nothing leaves the device** — `spec/constraints.md#nothing-leaves-the-device` — five minutes with
  a network monitor on the built binary, showing zero requests.
- **Every rendering asset is bundled** — `spec/constraints.md#every-asset-is-bundled` — the app used
  with the network disconnected renders every font and code block.
- **One monochrome icon set, tinted from the current colour** —
  `spec/constraints.md#icons-are-monochrome-svg` — one inline SVG sprite inheriting `currentColor`,
  and no emoji anywhere in the interface.
- **Motion respects the reduced-motion preference** —
  `spec/constraints.md#motion-respects-the-preference` — every duration token collapses to `0ms`.
- **Anything a mocked bridge cannot prove gets a live-test case** —
  `spec/constraints.md#live-checks-exist` — the first painted frame cannot be observed through a
  mocked bridge; it needs a numbered case run against the built binary.

## Depends on

STORY-058 for persistence and the root applier, STORY-059 for the generated Monaco themes that must
also be right on the first frame, and STORY-060 for the Auto resolution this story must persist and
restore. STORY-062 supplies the ten tokens the first frame would otherwise paint without.
