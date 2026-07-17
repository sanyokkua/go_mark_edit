# New-Theme Token Checklist

Fill-in template for authoring (or auditing) a theme's token set. GoMarkEdit ships exactly three
fixed themes (`glass`/`material`/`minimal`, DD-28, ADR-0005) — this checklist is for extending or
verifying one of those three, not for adding a fourth custom theme. Every canonical token name below
must be defined in **both** the `light` and `dark` `data-mode` scopes for the theme
(`:root[data-theme='<theme>'][data-mode='light'] { … }` and the matching `[data-mode='dark']`
scope) — a theme missing either scope is incomplete.

Source of truth: `mockups/gomarkedit-mockup.html` mirrors these exact values — author `tokens.css`
from the mockup table, never invent a value, and **never rename a token** once it exists (per the
module inventory; components across the codebase depend on the exact `--…` names).

Theme name: ______________________  Native appearance (light/dark): ______________________

## Core surface / text tokens

- [ ] `--bg` — app surface / base background
- [ ] `--ink` — primary text color
- [ ] `--muted` — secondary/muted text color
- [ ] `--accent` — the theme's single accent hue (must stay identical between light and dark scopes)
- [ ] `--accent-contrast` — text/icon color rendered on top of `--accent`
- [ ] `--stroke` — border/divider color
- [ ] `--radius` — window/card corner radius (must stay identical between light and dark scopes)
- [ ] `--font` — font-family stack (must stay identical between light and dark scopes; bundled
      locally, never a CDN/Google Fonts reference — offline invariant)

## Status colors (appearance-scoped, shared across all three themes — do not theme these separately)

- [ ] `--status-ok` (light: `#1f8a54` / dark: `#39d98a`)
- [ ] `--status-warn` (light: `#b7791f` / dark: `#ffcf6b`)
- [ ] `--status-error` (light: `#b3261e` / dark: `#ff7a90`)

## Optional / theme-specific extras (fill in only if the theme uses them)

- [ ] `--accent-ink` — on-accent-container text color
- [ ] `--accent-soft` — accent container/soft background
- [ ] `--surface-2` / `--surface-3` — secondary/tertiary surface layers
- [ ] `--stroke-soft` — lighter/secondary border color
- [ ] `--blur` — backdrop-filter value (Glass theme only; e.g. `blur(28px) saturate(160%)`) — leave
      unset/`none` for Material and Minimal

## Before marking the theme complete

- [ ] Both `light` and `dark` `data-mode` scopes are fully populated for this theme.
- [ ] `--accent`, `--radius`, `--font`, and `--blur` (if used) are identical across both scopes —
      only surface/text tokens changed between them.
- [ ] Every value matches `mockups/gomarkedit-mockup.html` exactly — no invented or approximated color.
- [ ] No token name was renamed, removed, or repurposed from what other components already reference.
- [ ] A component reading this theme's tokens uses `var(--…)` only — grep the diff for stray
      `#`/`rgb(`/`rgba(` literals outside `tokens.css`.
