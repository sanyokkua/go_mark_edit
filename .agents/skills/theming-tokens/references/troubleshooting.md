# Troubleshooting

Symptom-first table for the most common theming/token defects, plus a quick edge-case index.
Confirm a fix against `theme-token-model.md` (token/theme facts) or `theme-resolution.md` (resolve/
apply logic) before editing — this table tells you where to look, not the full rule.

## Symptom / cause / fix

| Symptom | Cause | Fix |
|---|---|---|
| Dropdown / dialog / toast renders un-themed | `data-mode`/`data-theme` set on an inner div, so the portal (rendered at `<body>`) can't inherit | Set both attributes on `document.documentElement` only |
| Theme doesn't follow the OS at runtime | No `matchMedia('change')` listener, or it runs when appearance isn't `auto` | Use `watchSystemTheme`; subscribe only while `auto`; unsubscribe otherwise |
| Colors look right in Light but wrong in Dark | Missing the counterpart `[data-mode='dark']` scope for that theme | Author both scopes; only surfaces/text invert |
| CDN font fetched at runtime | Referencing Google Fonts / a `<link>` | Bundle the font locally; reference it via `--font` (offline invariant, DD-32) |
| Review flags a hardcoded `#hex`/`rgb()` in a component | Literal color outside `tokens.css` | Replace with `var(--…)`; add the token if none fits |
| Editor and preview look different | Themed separately | One selection drives both; both read the same tokens (DD-29) |
| Chrome still visible in reading mode | Unmounting/rebuilding layout instead of hiding via `.reader` | Hide chrome with the `.reader` class/tokens over the shared layout |
| `data-mode="auto"` stuck on the DOM | Applied appearance without resolving | Call `resolveEffectiveTheme` first; only `light`/`dark` reach `applyTheme` |
| Theme flashes wrong/unstyled on app startup | `initTheme` runs after first paint, or doesn't read persisted settings before applying | Resolve + apply the persisted theme/appearance before the UI paints |
| App crashes or renders blank on a corrupted settings file | No fallback for an invalid/missing persisted theme or appearance value | Fall back to defaults (Material / Auto) — never trust the persisted value blindly (EC-THEME-3) |
| Status colors change when switching theme at the same appearance | Status color treated as theme-scoped instead of appearance-scoped | Use the single OK/Warn/Error pair keyed by light/dark only, shared across all three themes |
| Reading mode shows stale styling after a theme switch mid-read | Reader reads a snapshot/cached style instead of live tokens | Reader must read the same root-level `data-theme`/`data-mode` tokens as the rest of the app, live |
| A fourth "custom theme" or theme-editor UI is proposed | Feature request conflicts with the fixed 3-theme surface | Decline / redirect to revisiting ADR-0005 first — v1 ships no theme-authoring UI (DD-28) |

## Edge-case index (EC-THEME-*)

- **EC-THEME-1** — OS toggles light/dark while appearance is Auto → live token update. See
  `theme-resolution.md` § watcher pattern.
- **EC-THEME-2** — Theme or appearance switched while in reading mode → reader restyles live. See
  `theme-resolution.md` § Reading / Viewer mode chrome.
- **EC-THEME-3** — Invalid or missing persisted theme/appearance → fall back to defaults
  (Material / Auto). See `theme-token-model.md` § The three themes × three appearances.

Every EC-THEME id must map to a proving test before `just trace-check` is allowed to pass — see the
Workflow in `SKILL.md`.
