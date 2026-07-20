# Theme Token Model

The three themes, their nine valid theme×appearance combinations, and the full canonical token
table that `tokens.css` is authored from.

## The three themes × three appearances

| Theme (`data-theme`) | Character | Native appearance | Accent | Window radius | Font |
|---|---|---|---|---|---|
| `glass` (Liquid Glass) | translucent, layered, soft-glow surfaces, glossy top highlight, `blur(28px) saturate(160%)` | Dark | `#7aa2ff` (+ `#c58bff`) | 16px | system/SF (`-apple-system, "SF Pro Display", "Segoe UI", Inter, …`) |
| `material` (default) | solid, elevated cards, rounded-pill controls, elevation shadows | Light | `#4f6bed` | 16px | Roboto (`"Roboto", "Segoe UI", Inter, …`) |
| `minimal` | flat, hairline borders, typography-forward, borderless | Light | `#10b981` | 12px | Inter (`"Inter", -apple-system, …`) |

Each theme supports **Auto / Light / Dark** appearance (DD-29) → **nine valid combinations**.
Appearance is orthogonal to theme: any theme × any appearance is valid, all driven by the same
token set. **Auto** follows the OS `prefers-color-scheme` and updates **live** when the OS toggles
(EC-THEME-1) — the UI labels it "follows system". Light/Dark pin the appearance manually.

Within one theme, **accent hue, window radius, font family, and backdrop blur stay constant across
both appearances** — only surfaces and text invert between Light and Dark. Each theme is shown in
the mockup in its **native appearance** (Glass = Dark, Material = Light, Minimal = Light); selecting
a theme defaults to its native appearance, then Appearance can be flipped to the counterpart mode
(deep-links: `#glass-dark/editor-split`, `#material-light/editor-split`,
`#minimal-light/editor-split`).

**Default: Material / Auto.** An invalid or missing persisted theme/appearance value falls back to
these defaults (**EC-THEME-3**) — never crash or render unstyled on a corrupt setting.

v1 ships **no user-authored themes and no theme-editing UI** (DD-28). The three themes and their
token sets are fixed and normative — **tokens are never renamed** (per the module inventory). This
keeps the surface small and the offline bundle self-contained.

## Token model (DD-30): keyed by `data-theme` × `data-mode` on the root

The theme is a **token layer only** — one shared layout, with CSS custom properties whose values
are keyed by **`data-theme`** × **`data-mode`** attributes set on `document.documentElement`
(never an inner div, so portals/overlays inherit them — see `theme-resolution.md`). No component
hard-codes a color, spacing, radius, or font; every one of those comes from a token.

| `data-theme` \ `data-mode` | `light` | `dark` |
|---|---|---|
| `glass` | Glass Light (derived) | Glass Dark (**native**) |
| `material` | Material Light (**native**) | Material Dark (derived) |
| `minimal` | Minimal Light (**native**) | Minimal Dark (derived) |

Derived (counterpart) appearances keep the same accent hue, window radius, font, and blur as their
native counterpart, and invert only surfaces/text to the opposite mode.

## Canonical theme tokens

`mockups/gomarkedit-mockup.html` is the **visual source of truth**. Every state in the app must use
these exact token values — one shared layout, only the tokens differ. `tokens.css` is authored from
this table; do not let it drift.

| Token | Liquid Glass (native: Dark) | Material (native: Light) | Minimal (native: Light) |
|---|---|---|---|
| Accent | `#7aa2ff` (+ `#c58bff`) | `#4f6bed` | `#10b981` |
| Accent-ink / on-accent-container | `#cdd8ff` | `#0a1a52` | `#047857` |
| Accent-soft / container | `rgba(122,162,255,.16)` | `#dfe4ff` | `#ecfdf5` |
| Canvas (window backdrop) | aurora: radials `#3b2f7a` + `#1d4e8f` + `#7a2f6a` over linear `#0d1022 → #0a0d1c → #0b0f1e` | `#d9d7e6` | `#e9e9ec` |
| App surface / base | `rgba(255,255,255,.10)` (translucent) | `#faf8ff` | `#fbfbfa` |
| Panel / card / elevated | `rgba(28,30,54,.82)` (elevated) | `#ffffff` card, `#f3f1fb` elevated | `#ffffff` |
| Surface-2 / -3 | `rgba(255,255,255,.07)` / `.16` | `#eceaf6` / `#e6e3f2` | `#f3f3f2` / `#eaeae9` |
| Stroke / stroke-soft | `rgba(255,255,255,.18)` / `.11` | `#e3e1ee` / `#eceaf6` (outline `#c6c5d4`) | `#e4e4e7` / `#ececee` |
| Text / muted / faint | `#eaf0ff` / `rgba(234,240,255,.60)` / `.32` | `#1b1b22` / `#5c5c69` / `#9aa1ab` | `#1f2328` / `#6b7280` / `#9aa1ab` |
| **Window radius** | **16px** | **16px** | **12px** |
| **Font family** | system/SF | **Roboto** | **Inter** |
| Backdrop blur | **`blur(28px) saturate(160%)`** | none | none |
| Accent-contrast (text on accent) | `#0b1024` | `#ffffff` | `#ffffff` |

Status colors are **appearance-scoped** (light vs dark), **not** theme-scoped — the same OK/Warn/
Error pair applies regardless of which of the three themes is active:

| Status | Light | Dark |
|---|---|---|
| OK | `#1f8a54` | `#39d98a` |
| Warn | `#b7791f` | `#ffcf6b` |
| Error | `#b3261e` | `#ff7a90` |

## `tokens.css` scope examples

One scope per theme×mode, authored from the canonical table above:

```css
/* frontend/src/ui/styles/tokens.css */

:root[data-theme='material'][data-mode='light'] {
  --bg: #faf8ff;  --ink: #1b1b22;  --muted: #5c5c69;
  --accent: #4f6bed;  --accent-contrast: #ffffff;  --stroke: #e3e1ee;
  --radius: 16px;  --font: 'Roboto', 'Segoe UI', Inter, sans-serif;
  --status-ok: #1f8a54;  --status-warn: #b7791f;  --status-error: #b3261e;
}

:root[data-theme='material'][data-mode='dark'] {
  --bg: #0e1413;  --ink: #e8f1ef;  --muted: rgba(232,241,239,.6);
  --accent: #4f6bed;  --accent-contrast: #ffffff;  --stroke: rgba(255,255,255,.18);
  --radius: 16px;  --font: 'Roboto', 'Segoe UI', Inter, sans-serif;
  --status-ok: #39d98a;  --status-warn: #ffcf6b;  --status-error: #ff7a90;
}

:root[data-theme='minimal'][data-mode='light'] {
  --bg: #fbfbfa;  --ink: #1f2328;  --muted: #6b7280;
  --accent: #10b981;  --accent-contrast: #ffffff;  --stroke: #e4e4e7;
  --radius: 12px;  --font: 'Inter', -apple-system, sans-serif;
  --status-ok: #1f8a54;  --status-warn: #b7791f;  --status-error: #b3261e;
}

:root[data-theme='glass'][data-mode='dark'] {
  --bg: rgba(255,255,255,.10);  --ink: #eaf0ff;  --muted: rgba(234,240,255,.60);
  --accent: #7aa2ff;  --accent-contrast: #0b1024;  --stroke: rgba(255,255,255,.18);
  --radius: 16px;  --font: -apple-system, 'SF Pro Display', 'Segoe UI', Inter, sans-serif;
  --blur: blur(28px) saturate(160%);
  --status-ok: #39d98a;  --status-warn: #ffcf6b;  --status-error: #ff7a90;
}
```

Every theme requires **both** its Light and Dark scopes filled in (nine combinations total across
three themes) — a theme missing its counterpart mode is an incomplete implementation, not an
acceptable gap.

## Components read tokens only

```css
/* Every component reads tokens — no hex, no rgb() outside tokens.css */
.toolbar {
  background: var(--bg);
  color: var(--ink);
  border-bottom: 1px solid var(--stroke);
  border-radius: var(--radius);
}
```

A literal `#hex`/`rgb()`/`rgba()` value in a component `.scss`/`.css`/inline style outside
`tokens.css` is always a defect — add or reuse a token instead of hardcoding.

## No custom themes (ADR-0005)

v1 ships exactly three fixed themes with no theme-editing UI and no user-authored theme surface.
Do not add a "create your own theme" feature, a color picker for theme tokens, or a fourth
built-in theme without revisiting ADR-0005 first.
