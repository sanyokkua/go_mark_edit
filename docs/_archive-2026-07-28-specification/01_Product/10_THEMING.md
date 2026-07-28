**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester
**Last Updated:** 2026-07-25
**Cross-references:** `00_Foundation/04_DESIGN_DECISIONS.md`, `01_Product/01_FUNCTIONAL_REQUIREMENTS.md`, `01_Product/02_EDITOR_AND_VIEWER_MODES.md`, `01_Product/07_EXPORT.md`, `01_Product/11_SETTINGS.md`, `02_Architecture/03_FRONTEND_REACT.md`, `mockups/gomarkedit-mockup.html`, ADR-0005, ADR-0029

# Theming

Three themes × three appearances, delivered purely as a token layer (DD-28, DD-29, DD-30). Refines
`01_FUNCTIONAL_REQUIREMENTS.md#fr-theming`. Implemented in `logic/theme` and `ui/styles/tokens.css`.

## Table of Contents

1. [Themes](#themes)
2. [Appearance (Auto, Light, Dark)](#appearance-auto-light-dark)
3. [Unified theme](#unified-theme)
4. [Token model](#token-model)
5. [Canonical theme tokens](#canonical-theme-tokens)
6. [Structural tokens](#structural-tokens)
7. [The two syntax palettes](#the-two-syntax-palettes)
8. [Editor theme](#editor-theme)
9. [Diagrams and maths](#diagrams-and-maths)
10. [Print and export](#print-and-export)
11. [Boot without a flash](#boot-without-a-flash)
12. [Reading mode chrome](#reading-mode-chrome)
13. [No custom themes, and no custom accent](#no-custom-themes-and-no-custom-accent)
14. [Edge cases](#edge-cases)

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
appearance is valid (nine combinations, six distinct palettes), all driven by the same tokens.

The user's **choice** (`auto`/`light`/`dark`) and the **resolved** value (`light`/`dark`) are two
separate stored things. Collapsing them into one — storing the resolved value as though the user had
picked it — silently destroys the Auto state on first run and is a mistake a shipped reference
implementation makes.

## Unified theme

A **single** theme+appearance selection drives **both** the editor and the preview/reader (DD-29).
There is no separate editor theme setting.

"Unified" needs a mechanism, not just an assertion, because **Monaco cannot read CSS custom
properties**. It takes literal colours through `monaco.editor.defineTheme()`. So the editor's colours
are *generated* from this document's token values at build time rather than inherited at runtime — see
[Editor theme](#editor-theme) and ADR-0029. The same generation feeds the preview's highlight
stylesheet, which is what makes a Go snippet look identical on the left and the right of a split view.

## Token model

The theme is a **token layer only** (DD-30): one shared layout, with CSS custom properties whose values
are keyed by **`data-theme`** × **`data-mode`** attributes on the document element
(`document.documentElement`). `logic/theme` (`resolveEffectiveTheme`, `applyTheme`, `initTheme`,
`watchSystemTheme`) sets `data-theme` (glass/material/minimal) and `data-mode` (light/dark, resolved
from appearance). No component hard-codes colours; every colour, spacing, radius, font, shadow,
duration and stacking level comes from a token. Because the mode lives on the root element, portals and
overlays inherit it correctly.

**The table below and the mockup are one artefact in two files.** A token used in
`gomarkedit-mockup.html` and absent here, or named here and absent there, is a defect in both. Token
names are normative and are never renamed — which is only a safe promise if the first naming is
complete, so it is completed here rather than grown later.

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
| `--accent` | `#7aa2ff` | `#4f6bed` | `#10b981` |
| `--accent2` (secondary hue, gradients only) | `#c58bff` | `#4f6bed` | `#10b981` |
| `--accent-ink` (text on accent-soft) | `#cdd8ff` | `#0a1a52` | `#047857` |
| `--accent-soft` (accent container) | `rgba(122,162,255,.16)` | `#dfe4ff` | `#ecfdf5` |
| `--accent-contrast` (text on accent) | `#0b1024` | `#ffffff` | `#ffffff` |
| `--canvas` (window backdrop) | aurora: radials `#3b2f7a` + `#1d4e8f` + `#7a2f6a` over linear `#0d1022 → #0a0d1c → #0b0f1e` | `#d9d7e6` | `#e9e9ec` |
| `--app-bg` (app surface / base) | `rgba(255,255,255,.10)` (translucent) | `#faf8ff` | `#fbfbfa` |
| `--surface` (panel / card) | `rgba(28,30,54,.82)` | `#ffffff` | `#ffffff` |
| `--elevated` | `rgba(28,30,54,.82)` | `#f3f1fb` | `#ffffff` |
| `--surface-2` | `rgba(255,255,255,.07)` | `#eceaf6` | `#f3f3f2` |
| `--surface-3` | `rgba(255,255,255,.16)` | `#e6e3f2` | `#eaeae9` |
| `--stroke` | `rgba(255,255,255,.18)` | `#e3e1ee` (outline `#c6c5d4`) | `#e4e4e7` |
| `--stroke-soft` | `rgba(255,255,255,.11)` | `#eceaf6` | `#ececee` |
| `--text` | `#eaf0ff` | `#1b1b22` | `#1f2328` |
| `--muted` | `rgba(234,240,255,.60)` | `#5c5c69` | `#6b7280` |
| `--faint` | `rgba(234,240,255,.32)` | `#9aa1ab` | `#9aa1ab` |
| `--hover` (row/menu hover overlay) | `rgba(255,255,255,.16)` | `rgba(0,0,0,.05)` | `rgba(0,0,0,.04)` |
| `--user-bubble` (assistant chat, user turn) | `rgba(122,162,255,.14)` | `#dfe4ff` | `#ecfdf5` |
| `--win-radius` | **16px** | **16px** | **12px** |
| `--win-shadow` | `0 24px 80px rgba(0,0,0,.55)` | `0 12px 32px rgba(27,27,34,.16)` | `0 8px 24px rgba(31,35,40,.10)` |
| `--blur` (backdrop filter) | `blur(28px) saturate(160%)` | `none` | `none` |
| `--font` (UI + prose) | system/SF (`-apple-system, "SF Pro Display", "Segoe UI", Inter, …`) | **Roboto** (`"Roboto", "Segoe UI", Inter, …`) | **Inter** (`"Inter", -apple-system, …`) |
| `--mono` (code + editor) | `"SF Mono", "JetBrains Mono", ui-monospace, …` | same | same |
| Character | translucent, soft-glow, glossy top highlight | solid, elevation shadows, rounded pill controls | flat, hairline borders, typography-forward |

Derived (counterpart) appearances — **Glass Light, Material Dark, Minimal Dark** — keep the same
accent hue, window radius, font, blur and shadow character, and invert surfaces/text to the opposite
mode.

**Roboto and Inter are bundled**, as woff2 subsets, in `frontend/src/ui/fonts/`. Nothing is fetched at
runtime (DD-32, `03_NonFunctional/04_OFFLINE.md`), and neither font can be assumed present on a user's
machine. If they are not bundled, Material and Minimal silently fall back to the same system stack and
two of the three themes stop being distinguishable — which is a checkable failure, not a matter of
taste. They are listed in `05_Dependencies/02_FRONTEND_DEPENDENCIES.md` §7 with every other bundled
asset.

## Structural tokens

Values that are not colours but are still theme-scoped or app-wide. They exist so that no component
hard-codes a number that a theme might want to change, and so that overlay stacking is decided once.

**Status colours** are appearance-scoped (light vs dark), not theme-scoped:

| Token | Light | Dark |
|---|---|---|
| `--ok` | `#1f8a54` | `#39d98a` |
| `--warn` | `#b7791f` | `#ffcf6b` |
| `--err` | `#b3261e` | `#ff7a90` |

**Interaction tokens** — every one of these is a surface a user sees constantly and that looks broken
when it falls back to a browser or OS default:

| Token | Meaning | Notes |
|---|---|---|
| `--selection-bg` | text-selection background | Without it, a dark Liquid Glass document gets the OS default blue. Applies to `::selection` **and** to the editor's selection colour. |
| `--selection-fg` | text-selection foreground | |
| `--focus-ring` | the visible focus indicator | A two-layer ring (`0 0 0 2px var(--app-bg), 0 0 0 4px var(--accent)`) so it reads on every surface. Every phase's "reachable by keyboard alone" is untestable without it. |
| `--scrollbar-track` | scrollbar trough | Six palettes with default OS scrollbars looks like six unfinished palettes. |
| `--scrollbar-thumb` | scrollbar thumb | |
| `--scrollbar-thumb-hover` | scrollbar thumb, hovered | |

**Stacking** — a fixed scale, so a portal never has to guess a number. The mockup currently hard-codes
`z-index` at 1, 2, 10, 30, 60, 70, 75, 78, 80 and 90; those become:

| Token | Value | Used by |
|---|---|---|
| `--z-base` | `1` | in-flow raised content |
| `--z-sticky` | `10` | sticky headers, the tab strip |
| `--z-dropdown` | `30` | menus, context menus, comboboxes |
| `--z-overlay` | `60` | the modal scrim |
| `--z-modal` | `70` | dialogs |
| `--z-popover` | `80` | tooltips and popovers over dialogs |
| `--z-toast` | `90` | notifications, above everything |

**Motion** — durations and easings are tokens so that a theme can differ and so a single rule can
disable them:

| Token | Value |
|---|---|
| `--dur-fast` | `120ms` |
| `--dur-base` | `180ms` |
| `--dur-slow` | `300ms` |
| `--ease-out` | `cubic-bezier(.2,.8,.2,1)` |
| `--ease-in-out` | `cubic-bezier(.4,0,.2,1)` |

Every animated property uses one of these, and a single `@media (prefers-reduced-motion: reduce)` rule
collapses all durations to `0ms`. The theme flip itself is **not** animated: a 300 ms cross-fade of six
palettes across the whole window reads as a glitch, not a transition.

## The two syntax palettes

A Markdown editor colours **two different things**, and they are not the same palette. Conflating them
is why the mockup has one set of code colours and needs two.

**`--md-*` — the Markdown source, in the editor.** These colour the document you are typing: the `#` of
a heading, the `**` of bold, a link's target, a blockquote's `>`. They exist only in the editor; the
preview shows the *result*, not the syntax.

| Token | Colours | Light | Dark |
|---|---|---|---|
| `--md-heading` | `#`, heading text | `#3056d3` | `#8fb4ff` |
| `--md-strong` | `**bold**` | `#b45309` | `#ffd479` |
| `--md-emphasis` | `_italic_`, inline maths | `#7c3aed` | `#c58bff` |
| `--md-quote` | `>` blockquote | `#0369a1` | `#7fe3b5` |
| `--md-link` | link text, target, image path | `#be123c` | `#ff9d7a` |
| `--md-comment` | HTML comments, fence info strings | `#9aa1ab` | `#8a93b8` |
| `--md-marker` | list bullets, numbers, `---` | `#9aa1ab` | `#8a93b8` |
| `--code-fg` | base foreground for any monospace surface | `#30343b` | `#dfe6ff` |
| `--gutter` | line numbers | `#c9ccd3` | `rgba(255,255,255,.22)` |

These eight are the mockup's existing values, promoted to normative names. Until 2026-07-25 they lived
only in the mockup's CSS as `--c-h`, `--c-b`, `--c-em`, `--c-q`, `--c-c`, `--c-fn`, `--c-code` and
`--gutter`, which is precisely how a token table and an implementation drift apart. `--md-marker` is
new; the rest are renames of values that were already fixed.

**`--hl-*` — programming-language tokens, inside fenced code.** These colour a Go snippet, and they are
used **twice**: by the highlight.js stylesheet in the preview, and by the generated Monaco theme for the
embedded language inside a fence. One family, two consumers — that is what makes the split view agree.

| Token | Colours | Light | Dark |
|---|---|---|---|
| `--hl-keyword` | `func`, `if`, `return` | `#7c3aed` | `#c58bff` |
| `--hl-string` | string and character literals | `#0369a1` | `#7fe3b5` |
| `--hl-comment` | comments | `#9aa1ab` | `#8a93b8` |
| `--hl-number` | numeric and boolean literals | `#b45309` | `#ffd479` |
| `--hl-function` | function and method names | `#3056d3` | `#8fb4ff` |
| `--hl-type` | types, classes, constants | `#0f766e` | `#5eead4` |
| `--hl-attr` | attributes, properties, tags | `#be123c` | `#ff9d7a` |
| `--hl-punct` | operators and punctuation | `#5c5c69` | `#9aa1ab` |

This family is **new**: the mockup had no equivalent, because it renders a fenced block as flat text.
Six of the eight reuse a `--md-*` hue deliberately — a keyword and an emphasis marker being the same
purple is what makes the editor read as one document rather than two colour schemes stacked. `--hl-type`
and `--hl-punct` are the two genuinely new hues.

**Both families are scoped by appearance, not by theme** — sixteen values, not forty-eight. Glass Light
and Minimal Light show the same code colours. This is deliberate: syntax colouring is a legibility
system, and three variants of it would be three sets to keep readable for no gain the user asked for.
The theme still changes everything *around* the code — the fence background, the border, the font, the
gutter.

Shipping `rehype-highlight` without a stylesheet that maps these tokens onto its classes produces a
monochrome code block that has paid the full cost of parsing. Both reference implementations do exactly
that, and neither author noticed, so a phase's acceptance must assert **more than one distinct colour**
in a rendered fence rather than merely that it rendered.

## Editor theme

Six Monaco themes — three themes × light and dark — are **generated from the tables above at build
time** (ADR-0029). They are not hand-tuned, and no colour appears in a `defineTheme()` call that is not
traceable to a token in this document.

Each generated theme sets, at minimum:

| Monaco key | From |
|---|---|
| `editor.background` | `--app-bg` |
| `editor.foreground` | `--text` |
| `editorLineNumber.foreground` | `--gutter` |
| `editorLineNumber.activeForeground` | `--text` |
| `editorCursor.foreground` | `--accent` |
| `editor.selectionBackground` | `--selection-bg` |
| `editor.selectionHighlightBackground` | `--selection-bg` at reduced alpha |
| `editor.lineHighlightBackground` | `--hover` |
| `editorGutter.background` | `--app-bg` |
| `editorWidget.background` / `.border` | `--surface` / `--stroke` |
| `editorSuggestWidget.*` | `--surface`, `--text`, `--accent-soft` |
| `minimap.background` | `--app-bg` |
| `scrollbarSlider.background` / `.hoverBackground` | `--scrollbar-thumb` / `--scrollbar-thumb-hover` |
| `editorError.foreground` | `--err` |
| `editorWarning.foreground` | `--warn` |
| token rules for the Markdown grammar | the `--md-*` family |
| token rules for embedded fenced languages | the `--hl-*` family |

`editorWidget.background` is not an incidental entry: it is the **find widget**, which ships white by
default and is unmissable in a dark Liquid Glass window. Find and replace is a Phase 09 feature, but its
colours belong to Phase 02's generated themes, because that is where colours are decided.

## Diagrams and maths

**Mermaid does not read CSS custom properties either.** It bakes resolved colours into the SVG at render
time from `mermaid.initialize({ theme, themeVariables })`. Styling `.gme-mermaid svg` from the outside
reaches almost nothing. Therefore:

- `themeVariables` is built from the **resolved** token values (`getComputedStyle` on the root):
  `primaryColor` ← `--accent-soft`, `primaryBorderColor` ← `--accent`, `primaryTextColor` ← `--text`,
  `lineColor` ← `--muted`, `background` ← `--surface`, `fontFamily` ← `--font`.
- `mermaid.initialize()` is called **once**, and again only when the effective theme changes — not once
  per diagram per render, which is what makes a document with several diagrams re-initialise a global
  singleton repeatedly and lets a mid-flight theme change interleave palettes.
- **Every open diagram re-renders when the theme or appearance changes.** Without this, flipping to dark
  leaves every diagram in the old palette until its source is edited. One reference implementation gets
  this right and the other does not; the difference is whether the effective theme is in the render
  effect's dependencies.
- `securityLevel: 'strict'`, pinned here rather than left to a library default —
  `01_Product/19_SANITIZATION_AND_CSP.md` explains why the sanitizer does not cover Mermaid output.

**KaTeX** inherits `color` and nothing else, so its treatment is specified rather than inherited:
display maths is a block with `--surface-2` behind it; an equation wider than the reading column scrolls
**inside its own container** and never widens the page; and the error token required by `EC-RENDER-2`
uses `--err` rather than KaTeX's hard-coded `#cc0000`, which would be a colour outside the token system.

## Print and export

Two modes (`07_EXPORT.md#styled-vs-clean`), both selected by a `data-print-style` attribute on the
export root:

- **Clean** — `--font` at 11pt on white, `--text` as near-black, no surface fills, hairline table
  borders, links printed in `--text` with their URL appended in parentheses.
- **Current theme** — the active palette, with one mandatory override: **the export root is forced to
  `data-mode="light"`, `--blur` is `none`, and `--canvas` is white.** Exporting a Liquid Glass dark
  document otherwise means printing a full-page dark gradient behind translucent panels, which comes
  out as either a black page or nothing at all depending on the platform's print engine.

Print engines drop background colours unless told not to, so anywhere a background carries meaning —
fenced code, table header rows, blockquotes — the print stylesheet sets `print-color-adjust: exact`.
The remaining print rules (page margins, break avoidance, long-line wrapping) belong to
`07_EXPORT.md#print-scope`; only the colour half is decided here.

## Boot without a flash

The theme is persisted in SQLite, behind the Go bridge. Left alone, the webview boots, paints in a
default palette, and then learns which of six it should have been — a guaranteed flash on every launch,
against a phase acceptance that says "no unstyled flash".

The app resolves this by writing `data-theme` and `data-mode` into the served `index.html` at
asset-server time, so the first paint is already correct. A `localStorage` mirror read by a blocking
head script is an acceptable alternative — `02_Architecture/03_FRONTEND_REACT.md#state-ownership` already
permits `localStorage` for exactly this class of throwaway value — but the backend remains the source of
truth and the mirror is never read for anything else.

## Reading mode chrome

In Viewer / reading mode the theme still applies, but **all chrome is hidden** (DD-30,
`02_EDITOR_AND_VIEWER_MODES.md#viewer-reading-mode`): the reader surface (`.reader` in the mockup)
shows only the rendered document, styled by the active theme's tokens. Switching theme/appearance while
reading updates the reader live (EC-THEME-2). Reading font size and column width are user-controlled
(DD-72); they are settings, not tokens, and they scale the reader independently of the editor.

## No custom themes, and no custom accent

v1 ships **no user-authored themes** and no theme-editing UI (DD-28). The three themes and their token
sets are fixed and normative. A persisted theme/appearance that is invalid or missing falls back to the
defaults (Material / Auto) (EC-THEME-3).

**There is also no custom accent colour.** This is a separate question from custom themes and is settled
here so it is not reopened later: each theme's accent is part of its identity, the three accents are
chosen to stay legible against that theme's own surfaces, and a user-chosen hue would have to be
validated against six backgrounds, the status colours and both syntax palettes. It is recorded in
`00_Foundation/01_VISION_AND_SCOPE.md#refused-on-2026-07-25-with-reasons`.

## Edge cases

- **EC-THEME-1** — OS toggles light/dark while Auto → live token update, **and** every open Mermaid
  diagram re-renders and the Monaco theme is swapped.
- **EC-THEME-2** — Theme switched during reading mode → reader restyles live.
- **EC-THEME-3** — Invalid/missing persisted theme or appearance → fall back to defaults.
- **EC-THEME-4** — First paint after launch is already in the persisted theme; there is no flash of a
  default palette.
- **EC-THEME-5** — A bundled UI font fails to load → the app falls back to its system stack and remains
  legible. The visual gate detects this by asserting that `document.body`'s computed font is not a
  serif, which doubles as an offline-regression signal since every font is bundled.
- **EC-THEME-6** — Theme changes while a Mermaid diagram is mid-render → the stale render is discarded
  by its generation token (`05_RENDERING_AND_EXTENSIONS.md#mermaid`) and re-run in the new palette.
