# ADR-0005 — Token-driven theming; three built-in themes; no user-authored themes

**Status:** accepted
**Date:** 2026-07-10
**Deciders:** project owner, architect

## Context and problem statement

GoMarkEdit ships **three themes** — **Liquid Glass**, **Material**, **Minimal** — each with **Auto /
Light / Dark**, where Auto follows the OS `prefers-color-scheme` and updates live (DD-28, DD-29). The
editor and preview are **unified**: one selection drives both (DD-29). There are **no user-authored
themes** (DD-28). The reading/viewer mode **hides all chrome** (DD-30).

The decision is the theming **mechanism**: how do we express three visual identities × three appearance
modes across the whole app (menu bar, sidebar, tabs, toolbar, editor, preview, dialogs) without forking
layout or scattering colours through components? The mockups (`mockups/gomarkedit-mockup.html`) already demonstrate the intended answer — a **single layout** whose
appearance is swapped entirely by CSS custom properties keyed on `data-theme` × `data-mode`. This ADR
locks DD-28, DD-29, and DD-30.

## Decision drivers

- One shared layout; the theme must be a **token layer only** (CSS custom properties), never a
  structural fork (DD-30).
- Three cohesive visual identities × Auto/Light/Dark, switchable live at runtime (DD-28, DD-29).
- Auto must react to OS `prefers-color-scheme` changes without a restart (DD-29).
- Editor and preview themes must stay **unified** from a single source of truth (DD-29).
- No user-authored themes → a **closed, curated** token set, not an open theming API (DD-28).
- Reading mode hides all chrome by toggling layout state, independent of which theme is active (DD-30).
- Use a proven token approach (`tokens.css`, `var(--…)`, a `.dark` / `data-*` switch on the document
  root).

## Considered options

- **Token-driven theming** — one layout; a `tokens.css` layer of CSS custom properties selected by
  `data-theme` (glass|material|minimal) × `data-mode` (light|dark) on `documentElement`.
- **Per-theme stylesheets** — a separate full CSS bundle per theme, swapped at runtime.
- **CSS-in-JS** — theme objects in JS/TS, styles generated at runtime by a styling library.

## Decision outcome

Chosen: **one token-driven layout**. All colours, spacing, radii, blur, and fonts are CSS custom
properties defined in a single `tokens.css`, selected by two data attributes on `documentElement`:
`data-theme` ∈ {glass, material, minimal} × `data-mode` ∈ {light, dark}. **Auto** resolves live to
light/dark from the OS `prefers-color-scheme` (a media-query listener flips `data-mode`), so it needs no
restart. Because every component — editor and preview alike — reads the same `var(--…)` tokens, the
editor+preview theme is inherently **unified** and a theme switch is a single attribute change with no
re-layout. The token set is **closed**: there is no mechanism for user-authored themes; adding a theme
means adding a curated token block, not exposing an API. Reading mode is a separate layout-state toggle
that hides all chrome and is orthogonal to theme/mode. The data attributes live on `documentElement`
(not an inner div) so portalled content (dialogs, menus) inherits the active theme/mode. This is exactly
the model the mockups render across 3 themes × auto/light/dark.

### Consequences

- Positive: A theme/mode change is one attribute flip on the root — instant, no re-render of structure,
  no flash; trivially cheap at runtime.
- Positive: Editor and preview cannot drift, because both consume the identical token layer (satisfies
  DD-29's unification requirement structurally, not by convention).
- Positive: Small CSS footprint — one layout + N token blocks, not N full stylesheets; easy to audit and
  keep offline-bundled.
- Positive: The mockups double as executable visual acceptance references — the shipped tokens are meant
  to match them.
- Negative: Every visual value must be expressed as a token; a component that hardcodes a colour breaks
  a theme silently, so a "no hardcoded colours / tokens only" lint discipline is required (styling
  outside the token system is banned).
- Negative: Radically different visual identities (e.g. Glass's translucency/blur vs Minimal's flatness)
  must all be expressible through the **same** token schema — the schema must be rich enough up front,
  which constrains how divergent a theme can be.
- Neutral: The closed token set is a deliberate scope boundary — no theming-API surface to design,
  document, secure, or support in v1.

## Pros and cons of the options

### Option A — Token-driven theming (chosen)

- Good: One layout; instant attribute-level switching; structurally unified editor+preview; tiny CSS
  footprint; portals inherit via `documentElement`; a proven approach; mockups map 1:1.
- Bad: Requires strict token discipline (no hardcoded values); the token schema must be expressive
  enough to cover three quite different identities.

### Option B — Per-theme stylesheets

- Good: Each theme fully independent — maximal freedom to diverge; conceptually simple ("just load a
  different CSS").
- Bad: Layout/structure gets duplicated (or drifts) across bundles; switching swaps whole stylesheets
  (heavier, flash-prone); Auto/light/dark multiplies bundles (3 themes × 2 modes = 6); keeping
  editor+preview unified across six files is error-prone; larger offline payload.

### Option C — CSS-in-JS

- Good: Dynamic, programmable theming; co-located component styles; strong TypeScript typing of theme
  objects.
- Bad: Runtime styling cost and hydration overhead in an embedded webview; adds a JS styling dependency
  counter to the lightweight goal; theming becomes a JS API (tempting toward user-authored themes,
  which DD-28 forbids); harder to hand off to the pure-CSS mockups as the visual source of truth.

## Links

- Design decisions: DD-28 (three built-in themes; no user-authored themes), DD-29 (Auto/Light/Dark;
  Auto follows OS live; unified editor+preview theme), DD-30 (one layout; theme = token layer keyed by
  `data-theme` × `data-mode`; reading mode hides all chrome).
- Spec clauses: `00_Foundation/04_DESIGN_DECISIONS.md#9-theming--ux`, `01_Product/10_THEMING.md`,
  `01_Product/02_EDITOR_AND_VIEWER_MODES.md`, `02_Architecture/03_FRONTEND_REACT.md`,
  `mockups/gomarkedit-mockup.html`, `mockups/README.md`.
- Stories: Phase 02 theming stories and Phase 03 settings stories (three themes × auto/light/dark, unified theme, tokens),
  per `07_Phases/00_ROADMAP.md` (authored per phase; none `done` at ADR time).
