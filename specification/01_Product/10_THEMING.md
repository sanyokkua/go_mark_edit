**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester
**Last Updated:** 2026-07-10
**Cross-references:** `00_Foundation/04_DESIGN_DECISIONS.md`, `01_Product/01_FUNCTIONAL_REQUIREMENTS.md`, `01_Product/02_EDITOR_AND_VIEWER_MODES.md`, `01_Product/11_SETTINGS.md`, `02_Architecture/03_FRONTEND_REACT.md`, `mockups/gomarkedit-mockup.html`

# Theming

Three themes × three appearances, delivered purely as a token layer (DD-28, DD-29, DD-30). Refines
`01_FUNCTIONAL_REQUIREMENTS.md#fr-theming`. Implemented in `logic/theme` and `ui/styles/tokens.css`.

## Table of Contents

1. [Themes](#themes)
2. [Appearance (Auto, Light, Dark)](#appearance-auto-light-dark)
3. [Unified theme](#unified-theme)
4. [Token model](#token-model)
5. [Reading mode chrome](#reading-mode-chrome)
6. [No custom themes](#no-custom-themes)
7. [Canonical theme tokens](#canonical-theme-tokens)
8. [Edge cases](#edge-cases)

## Themes

GoMarkEdit ships exactly three themes (DD-28), each with a distinct visual language demonstrated in the
mockup (`mockups/gomarkedit-mockup.html` — switch the Theme control, or deep-link e.g.
`#glass-dark/editor-split`):

- **Liquid Glass** — translucent, layered, soft-glow surfaces.
- **Material** — solid, elevated cards with rounded controls.
- **Minimal** — flat, borderless, typography-forward.

The theme is chosen from the Settings menu swatches and the Settings dialog Appearance group. Default:
**Material** (as shown active in `mockups/gomarkedit-mockup.html`).

## Appearance (Auto, Light, Dark)

Each theme supports three appearances (DD-29): **Auto**, **Light**, **Dark**. **Auto** follows the OS
`prefers-color-scheme` and updates **live** when the OS toggles (EC-THEME-1); the UI notes "follows
system". Light/Dark pin the appearance manually. Appearance is orthogonal to theme: any theme × any
appearance is valid (nine combinations), all driven by the same tokens.

## Unified theme

A **single** theme+appearance selection drives **both** the editor and the preview/reader (DD-29) —
there is no separate editor theme. Monaco's colours, the preview typography, code-highlight colours,
and Mermaid SVG fills all read from the same token set so the whole window is visually consistent.

## Token model

The theme is a **token layer only** (DD-30): one shared layout, with CSS custom properties whose values
are keyed by **`data-theme`** × **`data-mode`** attributes on the document element
(`document.documentElement`). `logic/theme` (`resolveEffectiveTheme`, `applyTheme`, `initTheme`,
`watchSystemTheme`) sets `data-theme` (glass/material/minimal) and `data-mode` (light/dark, resolved
from appearance). The mockup demonstrates this exact model:
`body[data-theme="material"][data-mode="light"]{…}` etc. No component hard-codes colours; every colour,
spacing, radius, and font comes from a token. Because the mode lives on the root element, portals and
overlays inherit it correctly.

## Reading mode chrome

In Viewer / reading mode the theme still applies, but **all chrome is hidden** (DD-30,
`02_EDITOR_AND_VIEWER_MODES.md#viewer-reading-mode`): the reader surface (`.reader` in the mockup)
shows only the rendered document, styled by the active theme's tokens. Switching theme/appearance while
reading updates the reader live (EC-THEME-2).

## No custom themes

v1 ships **no user-authored themes** and no theme-editing UI (DD-28). The three themes and their token
sets are fixed and normative (never rename tokens, per the module inventory). This keeps the surface
small and the offline bundle self-contained. A persisted theme/appearance that is invalid or missing
falls back to the defaults (Material / Auto) (EC-THEME-3).

## Canonical theme tokens

The single mockup `mockups/gomarkedit-mockup.html` is the **visual source of truth** for each theme.
Each theme is shown in its **native appearance** (Glass = Dark, Material = Light, Minimal = Light) —
selecting a theme defaults to it (deep-link e.g. `#glass-dark/editor-split`,
`#material-light/editor-split`, `#minimal-light/editor-split`); Appearance can then be flipped to the
other mode. Every state in the app **must use these exact token values** — one shared layout, only the
tokens differ. `tokens.css` is authored from this table; do not drift it. Every theme keeps **one accent
hue, one corner radius, and one font family across both appearances**; only surfaces/text invert between
Light and Dark.

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
| **Font family** | system/SF (`-apple-system, "SF Pro Display", "Segoe UI", Inter, …`) | **Roboto** (`"Roboto", "Segoe UI", Inter, …`) | **Inter** (`"Inter", -apple-system, …`) |
| Backdrop blur | **`blur(28px) saturate(160%)`** | none | none |
| Character | translucent, soft-glow, glossy top highlight | solid, elevation shadows, rounded pill controls | flat, hairline borders, typography-forward |
| Accent-contrast (text on accent) | `#0b1024` | `#ffffff` | `#ffffff` |

Derived (counterpart) appearances — **Glass Light, Material Dark, Minimal Dark** — keep the same
accent hue, window radius, font, and blur, and invert surfaces/text to the opposite mode. Status
colours are appearance-scoped (light vs dark), not theme-scoped: OK `#1f8a54`/`#39d98a`, Warn
`#b7791f`/`#ffcf6b`, Error `#b3261e`/`#ff7a90` (light/dark).

## Edge cases

- **EC-THEME-1** — OS toggles light/dark while Auto → live token update.
- **EC-THEME-2** — Theme switched during reading mode → reader restyles live.
- **EC-THEME-3** — Invalid/missing persisted theme or appearance → fall back to defaults.
