---
name: theming-tokens
description: >-
  Use when adding or adjusting a theme or a design token, or the light/dark/auto appearance
  behavior. Styling is token-only. Triggers: editing `frontend/src/ui/styles/tokens.css`,
  `logic/theme/` (`resolveEffectiveTheme`, `applyTheme`, `initTheme`, `watchSystemTheme`); adding a
  `--color-*`/spacing/radius/font token; wiring `data-theme` × `data-mode` on `document.documentElement`;
  the three themes Liquid Glass / Material / Minimal; Auto following `prefers-color-scheme`; unifying
  editor + preview theming; hiding chrome in reading mode via `.reader`; an EC-THEME-* edge case; a
  portal/overlay losing the theme; a "hardcoded color" review finding.
allowed-tools: Read, Edit, Write, Bash, Glob, Grep
references:
  - references/theme-token-model.md
  - references/theme-resolution.md
  - references/troubleshooting.md
assets:
  - assets/token-checklist.md
---

# Theming and Tokens

Three themes × three appearances, delivered purely as a **token layer** over one shared layout.
A theme adds token values, never component branches. Styling is **token-only** — no hardcoded colors
anywhere.

## When to use

- Adjusting a token value, or adding a new `--…` token under the right scope.
- Extending or fixing a theme's Light/Dark token set.
- Changing Auto / Light / Dark resolution or the live `prefers-color-scheme` watcher.
- Making sure portals/overlays inherit the theme, or reading mode hides all chrome.
- Investigating an EC-THEME-1/2/3 edge case, or a "hardcoded color" review finding.

### When NOT to use

- Rendering / plugins / Mermaid theming *logic* → **markdown-rendering-pipeline** (it *reads* tokens,
  it doesn't define them).
- Component structure / props / a11y roles → `ts-react-frontend.md`.
- Writing proving tests → **testing-wails-app**.

## Source of truth

- Spec: `specification/01_Product/10_THEMING.md` (Themes, Appearance, Unified theme, Token model,
  Reading-mode chrome, No custom themes, Canonical theme tokens table, EC-THEME-1..3),
  `specification/01_Product/02_EDITOR_AND_VIEWER_MODES.md` (Viewer/reading mode hides chrome),
  `specification/02_Architecture/03_FRONTEND_REACT.md`. Visual source of truth:
  `mockups/gomarkedit-mockup.html`.
- Design decisions: `DD-28` (exactly 3 themes, no custom), `DD-29` (Auto/Light/Dark, unified editor+
  preview), `DD-30` (token layer, one layout, reading-mode chrome); `ADR-0005`.
- Governing rules: `.claude/rules/ts-theming-tokens.md`, `.claude/rules/ts-react-frontend.md`.
- Modules (from `01_MODULE_INVENTORY.md`): `frontend/src/ui/styles/` (`tokens.css`, `base.css`, print
  stylesheet — normative tokens, never renamed), `frontend/src/logic/theme/` (`theme/index.ts`).

## Workflow

1. **Orient.** Read `references/theme-token-model.md` for the full three-theme table, the nine valid
   theme×appearance combinations, and the exact canonical token names/values. Confirm `ui/styles/`
   and `logic/theme/` in `01_MODULE_INVENTORY.md`. Expected outcome: you know the exact token names
   and scope(s) involved before touching a file.
2. **Pick your path:**
   - **Adjust an existing token** — change only its value under the correct
     `:root[data-theme='…'][data-mode='…']` scope in `tokens.css` (see the scope examples in
     `references/theme-token-model.md`). Never inline a literal color in a component.
   - **Add or extend a theme** — provide its full Light **and** Dark token sets from the mockup
     table (`mockups/gomarkedit-mockup.html`), keeping accent/radius/font/blur constant across both
     modes. Work through `assets/token-checklist.md` as a fill-in template so no token is missed and
     none is accidentally renamed.
3. **If the change touches resolution/apply/watch logic** (`resolveEffectiveTheme`, `applyTheme`,
   `watchSystemTheme`, `initTheme`, unified editor+preview theming, or reading-mode chrome), read
   `references/theme-resolution.md` for the full `logic/theme/index.ts` code and the
   resolve-before-apply / root-only / subscribe-only-in-auto rules. Verify: the effective theme
   applies on `document.documentElement` only, `auto` is resolved before `applyTheme` is called
   (never `data-mode="auto"` on the DOM), the system watcher runs only while appearance is `auto`,
   editor and preview share one token set, and reading mode hides chrome via `.reader` without
   unmounting the shared layout.
4. If something doesn't look right — un-themed portal, theme not following the OS, mismatched
   light/dark, a hardcoded color flagged in review — check `references/troubleshooting.md` first;
   it's a symptom → cause → fix table plus the EC-THEME-1..3 index.
5. `just check` — expected: lint/`tsc`/tests pass; no hardcoded-color lint finding.
6. `just verify-ui` — expected: **zero** overflow / console errors / contrast failures across widths
   and **both** modes for all three themes.
7. `just verify-smoke` then `just trace` / `just trace-check` — expected: theme-switch and OS-toggle
   flows pass; every EC-THEME id maps to a proving test.

## Reference Index

| Reference file | Load when |
|---|---|
| `references/theme-token-model.md` | You need the three-theme table, the nine theme×appearance combinations, the full canonical token table, `tokens.css` scope examples, or status-color values. |
| `references/theme-resolution.md` | You're touching `resolveEffectiveTheme`/`applyTheme`/`watchSystemTheme`/`initTheme`, unified editor+preview theming, reading-mode chrome-hiding, or a portal-inheritance question. |
| `references/troubleshooting.md` | Something looks wrong (un-themed portal, theme not following OS, mismatched light/dark, hardcoded-color finding) or you need the EC-THEME-1..3 index. |
| `assets/token-checklist.md` | You're adding/extending a theme's token set and want a fill-in checklist so no token is missed or renamed. |

## Mandatory validation (before answering)

- [ ] Exactly three themes (`glass`/`material`/`minimal`); no custom-theme surface added (ADR-0005).
- [ ] New color/spacing/radius/font is a token in `tokens.css` under the correct `data-theme`×`data-mode`.
- [ ] Components read `var(--…)` only; **zero** hardcoded colors.
- [ ] `data-theme` + `data-mode` set on `document.documentElement`; `auto` resolved first; portals inherit.
- [ ] Auto follows OS `prefers-color-scheme` live; watcher only in `auto`; editor + preview unified.
- [ ] Reading mode hides all chrome via `.reader`/tokens, not layout surgery.
- [ ] `just verify-ui` clean across both modes for all three themes; `just trace-check` green.

## Gotchas

- Setting `data-theme`/`data-mode` on an inner div instead of `document.documentElement` silently
  breaks every portal/dialog/toast — full details in `references/troubleshooting.md`.
- `data-mode="auto"` must never reach the DOM — `resolveEffectiveTheme` runs first, always.
- Status colors are appearance-scoped (light/dark), not theme-scoped — the same OK/Warn/Error pair
  is shared by all three themes.
- A theme is incomplete until **both** its Light and Dark scopes are authored — accent/radius/font/
  blur stay fixed across the pair; only surfaces/text invert.
- Fonts must be bundled locally, never fetched from a CDN/Google Fonts `<link>` (offline invariant,
  DD-32) — see `.claude/rules/offline-and-privacy.md`.
- Full symptom/cause/fix table and the EC-THEME-1..3 index live in `references/troubleshooting.md` —
  don't re-derive them from scratch.

## Spec references

- `specification/01_Product/10_THEMING.md`
- `specification/01_Product/02_EDITOR_AND_VIEWER_MODES.md`
- `specification/02_Architecture/03_FRONTEND_REACT.md`
- `mockups/gomarkedit-mockup.html`
- `specification/06_Process_and_Traceability/01_MODULE_INVENTORY.md`
- `.claude/rules/ts-theming-tokens.md`, `.claude/rules/ts-react-frontend.md`
