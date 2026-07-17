---
paths:
  - "frontend/src/ui/styles/**"
  - "frontend/src/ui/**"
---

# TypeScript theming + tokens

**Authority:** `specification/00_Foundation/04_DESIGN_DECISIONS.md` (DD-28, DD-29, DD-30, ADR-0005),
`01_MODULE_INVENTORY.md` (`ui/styles/`, `logic/theme/`). Theme resolution lives in `logic/theme/`;
tokens are defined in `ui/styles/tokens.css`.

One shared layout. The theme is a **token layer only**: three themes (**Liquid Glass, Material,
Minimal**), each with **Auto / Light / Dark**, selected by `data-theme` x `data-mode` on
`document.documentElement`. Auto follows the OS `prefers-color-scheme` and updates live. Editor and
preview themes are unified (one selection drives both).

## DO

- Define all visual values as CSS custom properties in `ui/styles/tokens.css`, keyed by theme x mode:

  ```css
  :root[data-theme='material'][data-mode='light'] { --bg: #fff; --ink: #16201e; --accent: #009688; }
  :root[data-theme='material'][data-mode='dark']  { --bg: #0e1413; --ink: #e8f1ef; }
  ```

- Consume tokens only: `background: var(--bg); color: var(--ink);`.
- Resolve/apply the theme in `logic/theme/` and set attributes on `document.documentElement`:

  ```ts
  export function applyTheme(theme: ThemeName, mode: EffectiveMode): void {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    root.setAttribute('data-mode', mode); // 'light' | 'dark' -- 'auto' is resolved first
  }
  // watchSystemTheme(): subscribe to prefers-color-scheme ONLY while appearance is 'auto'; return an unsubscribe.
  ```

- Reading/Viewer mode hides **all** chrome (toolbar, sidebar, status bar) via a token/`.reader` class,
  not by unmounting the shared layout (DD-30).

## DON'T

- No hardcoded colors / hex / `rgb()` outside `tokens.css` -- every color is a token.
- No user-authored / runtime-added themes (ADR-0005) -- exactly the three shipped themes.
- Don't set `data-mode`/theme on an inner element -- portals must inherit it from
  `document.documentElement`. Don't leave `data-mode: auto` on the DOM; resolve it to `light`/`dark`.
- Don't theme editor and preview separately -- one selection drives both.

## Authoring checklist

- [ ] New color/spacing/radius is a token in `tokens.css` under the correct `data-theme`x`data-mode`.
- [ ] Components read `var(--...)`; zero hardcoded colors.
- [ ] Theme applied on `document.documentElement`; `auto` resolved before apply; system watcher only in `auto`.
- [ ] Reading mode hides chrome via tokens/`.reader`, not layout surgery.
