# Themes and appearance

## What it's for

People read and write in this editor for hours. Somebody working at night in a dark room and somebody
working in an office at midday need different palettes, and neither should have to accept a compromise
between them. Three themes exist because "looks right" is not one thing: some people want a translucent
layered window, some want solid cards, some want as little visual furniture as possible. Without the
theme system, every screen would be built once in one palette and would have to be rebuilt when the
second appearance arrived.

## What you can do

Pick a theme from the Settings menu's swatch row, or from Settings → Appearance. There are three:
**Liquid Glass**, **Material** and **Minimal**. Pick an appearance in the same two places: **Auto**,
**Light** or **Dark**. The two choices are independent, so all nine combinations are valid and they
produce six distinct palettes.

Auto follows the operating system and changes the moment the system does. The control says "follows
system" so it is clear that the app is not just showing light.

One selection drives everything: the editor, the preview, the reading view, dialogs, menus and diagrams
all change together. There is no separate editor theme.

## Rules

### Three themes, and no way to add a fourth {#three-themes}
- The app ships exactly three themes: `glass` (Liquid Glass), `material` (Material) and `minimal`
  (Minimal). The default is **Material**.
- There is no theme editor, no imported theme file, and no custom accent colour.

Examples: a persisted theme of `material` → Material · a persisted theme of `dracula` → falls back to
Material, see `#invalid-settings-fall-back`.

*Why no custom accent:* each theme's accent is part of its identity and is chosen to stay legible
against that theme's own surfaces. A user-chosen hue would have to be validated against six backgrounds,
three status colours and both syntax palettes, and there is no way to do that at the moment they pick it.

### Auto follows the system and updates live {#auto-follows-the-system}
- **While** the appearance is Auto, the resolved appearance is `dark` when the operating system reports
  `prefers-color-scheme: dark` and `light` otherwise.
- **When** the operating system switches while Auto is selected, the palette changes immediately without
  a relaunch, every open Mermaid diagram re-renders in the new palette, and the Monaco editor theme is
  swapped.
- **While** the appearance is Light or Dark, the system setting is ignored and the app does not subscribe
  to it.

Examples: macOS switches to dark at sunset with Auto selected → the window darkens, the code fence in
the preview recolours, and a rendered flowchart redraws · the same with Dark pinned → nothing changes ·
a diagram left in the old palette after a switch → a defect, and the specific one that happens when the
effective theme is missing from the render effect's dependency list.

### The choice and the resolved value are stored separately {#choice-and-resolved-are-separate}
- Two values are kept: the user's **choice**, one of `auto`, `light`, `dark`; and the **resolved**
  appearance, one of `light`, `dark`.
- The `data-mode` attribute always carries the resolved value. The literal string `auto` never reaches
  the DOM.
- **When** the appearance is read back from storage, it is the choice that is read.

Examples: choice `auto` on a light system → stored choice `auto`, `data-mode="light"` · restart on a
now-dark system → still `auto`, now `data-mode="dark"` · storing only `light` because that is what it
resolved to on first run → Auto is silently destroyed and the user's setting never worked.

### Every visual value is a token on the root element {#tokens-on-the-root-element}
- Colours, spacing, radii, fonts, shadows, durations and stacking levels are CSS custom properties whose
  values are selected by `data-theme` and `data-mode` on `document.documentElement`.
- Both attributes are set on the document element and on no other element.
- No component contains a colour literal.

Examples: a dropdown rendered through a portal at the end of `<body>` picks up the theme, because the
attribute is above it · setting the attributes on the app shell instead → every menu, tooltip and toast
renders unthemed.

### Each theme has one accent, one radius and one font across both appearances {#theme-identity-is-stable}
- Within a theme, `--accent`, `--win-radius`, `--font` and the blur and shadow character are the same in
  light and dark. Only surfaces and text invert.

| Token | Liquid Glass | Material | Minimal |
|---|---|---|---|
| `--accent` | `#7aa2ff` | `#4f6bed` | `#10b981` |
| `--accent2` (gradients only) | `#c58bff` | `#4f6bed` | `#10b981` |
| `--accent-ink` (text on `--accent-soft`) | `#cdd8ff` | `#0a1a52` | `#047857` |
| `--accent-soft` | `rgba(122,162,255,.16)` | `#dfe4ff` | `#ecfdf5` |
| `--accent-contrast` (text on `--accent`) | `#0b1024` | `#ffffff` | `#ffffff` |
| `--canvas` (window backdrop) | aurora: radials `#3b2f7a` + `#1d4e8f` + `#7a2f6a` over linear `#0d1022 → #0a0d1c → #0b0f1e` | `#d9d7e6` | `#e9e9ec` |
| `--app-bg` | `rgba(255,255,255,.10)` | `#faf8ff` | `#fbfbfa` |
| `--surface` | `rgba(28,30,54,.82)` | `#ffffff` | `#ffffff` |
| `--elevated` | `rgba(28,30,54,.82)` | `#f3f1fb` | `#ffffff` |
| `--surface-2` | `rgba(255,255,255,.07)` | `#eceaf6` | `#f3f3f2` |
| `--surface-3` | `rgba(255,255,255,.16)` | `#e6e3f2` | `#eaeae9` |
| `--stroke` | `rgba(255,255,255,.18)` | `#e3e1ee` | `#e4e4e7` |
| `--stroke-soft` | `rgba(255,255,255,.11)` | `#eceaf6` | `#ececee` |
| `--text` | `#eaf0ff` | `#1b1b22` | `#1f2328` |
| `--muted` | `rgba(234,240,255,.60)` | `#5c5c69` | `#6b7280` |
| `--faint` | `rgba(234,240,255,.32)` | `#9aa1ab` | `#9aa1ab` |
| `--hover` | `rgba(255,255,255,.16)` | `rgba(0,0,0,.05)` | `rgba(0,0,0,.04)` |
| `--user-bubble` | `rgba(122,162,255,.14)` | `#dfe4ff` | `#ecfdf5` |
| `--win-radius` | `16px` | `16px` | `12px` |
| `--win-shadow` | `0 24px 80px rgba(0,0,0,.55)` | `0 12px 32px rgba(27,27,34,.16)` | `0 8px 24px rgba(31,35,40,.10)` |
| `--blur` | `blur(28px) saturate(160%)` | `none` | `none` |
| `--font` | system stack — `-apple-system, "SF Pro Display", "Segoe UI", Inter, …` | `"Roboto", "Segoe UI", Inter, …` | `"Inter", -apple-system, …` |
| `--mono` | `"SF Mono", "JetBrains Mono", ui-monospace, …` | same | same |

The values above are each theme's **native** appearance — Glass dark, Material light, Minimal light. The
counterpart appearance inverts surfaces and text and keeps everything else.

Examples: Material dark keeps `--accent: #4f6bed` and `--win-radius: 16px` · Material dark with a
different accent → the theme reads as a fourth theme rather than the same one at night.

### Roboto and Inter are bundled {#fonts-are-bundled}
- Roboto and Inter ship as woff2 subsets in `frontend/src/ui/fonts/` and are loaded from the bundle.
- Nothing is fetched at runtime.

Examples: the app launched with no network → Material still renders in Roboto · the fonts left
unbundled → Material and Minimal both fall back to the same system stack and two of the three themes
stop being distinguishable, which is checkable rather than a matter of taste.

### Status colours follow the appearance, not the theme {#status-colours-follow-appearance}
- `--ok`, `--warn` and `--err` have two values each, keyed by `data-mode` only.

| Token | Light | Dark |
|---|---|---|
| `--ok` | `#1f8a54` | `#39d98a` |
| `--warn` | `#b7791f` | `#ffcf6b` |
| `--err` | `#b3261e` | `#ff7a90` |

Examples: an error toast in Minimal light and in Material light → the same red.

### Selection, focus and scrollbars are tokens {#interaction-tokens}
- `--selection-bg` and `--selection-fg` set the text-selection colours, and they apply to `::selection`
  in the preview **and** to the editor's own selection colour.
- `--focus-ring` is a two-layer ring, `0 0 0 2px var(--app-bg), 0 0 0 4px var(--accent)`, so it reads on
  every surface.
- `--scrollbar-track`, `--scrollbar-thumb` and `--scrollbar-thumb-hover` style the scrollbars.

Examples: selecting a paragraph in dark Liquid Glass → the app's selection colour, not the operating
system's default blue · six palettes shipped with default operating-system scrollbars → six palettes
that all look unfinished.

### Overlay stacking is a fixed scale {#stacking-scale}
- Nothing sets a numeric `z-index`. Every stacked surface uses one of eight tokens.

| Token | Value | Used by |
|---|---|---|
| `--z-base` | `1` | raised in-flow content |
| `--z-sticky` | `10` | sticky headers, the tab strip |
| `--z-resize` | `20` | the window's own resize zones |
| `--z-dropdown` | `30` | menus, context menus, comboboxes |
| `--z-overlay` | `60` | the modal scrim |
| `--z-modal` | `70` | dialogs |
| `--z-popover` | `80` | tooltips and popovers over dialogs |
| `--z-toast` | `90` | notifications |

Examples: an error raised by a dialog → the toast is visible above the dialog, because `--z-toast`
exceeds `--z-modal` · a resize zone along the top edge sits above the title bar it overlaps, because
`--z-resize` exceeds `--z-sticky`, and still below an open menu, because it is under `--z-dropdown` —
see `the-app-window.md#the-window-has-its-own-resize-zones`.

### Motion is tokenised and the theme flip is not animated {#motion-tokens}
- Every animated property uses `--dur-fast` (`120ms`), `--dur-base` (`180ms`) or `--dur-slow` (`300ms`),
  with `--ease-out` (`cubic-bezier(.2,.8,.2,1)`) or `--ease-in-out` (`cubic-bezier(.4,0,.2,1)`).
- **While** the operating system reports `prefers-reduced-motion: reduce`, one rule sets every duration
  token to `0ms`.
- Switching theme or appearance is **not** animated.

Examples: a menu opening → 120 ms · switching from Material light to Glass dark → instant · the same
switch cross-faded over 300 ms → six palettes changing at once reads as a rendering glitch, not a
transition.

### Markdown source and code inside fences are two different palettes {#two-syntax-palettes}
- The `--md-*` family colours the Markdown **source** in the editor: the `#` of a heading, the `**` of
  bold, a link's target, a blockquote's `>`.
- The `--hl-*` family colours **programming-language tokens inside a fenced block**, and it is used
  twice — by the preview's highlight stylesheet and by the generated Monaco theme for the embedded
  language.
- Both families are keyed by appearance only, not by theme. Sixteen values, not forty-eight.

| `--md-*` token | Colours | Light | Dark |
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

| `--hl-*` token | Colours | Light | Dark |
|---|---|---|---|
| `--hl-keyword` | `func`, `if`, `return` | `#7c3aed` | `#c58bff` |
| `--hl-string` | string and character literals | `#0369a1` | `#7fe3b5` |
| `--hl-comment` | comments | `#9aa1ab` | `#8a93b8` |
| `--hl-number` | numeric and boolean literals | `#b45309` | `#ffd479` |
| `--hl-function` | function and method names | `#3056d3` | `#8fb4ff` |
| `--hl-type` | types, classes, constants | `#0f766e` | `#5eead4` |
| `--hl-attr` | attributes, properties, tags | `#be123c` | `#ff9d7a` |
| `--hl-punct` | operators and punctuation | `#5c5c69` | `#9aa1ab` |

Examples: a Go snippet in Glass light and in Minimal light → identical token colours, different fence
background, border, font and gutter · a rendered fence showing exactly one colour → the highlighter ran
and its stylesheet did not, which is why a test asserts **more than one distinct colour** in a rendered
fence rather than that it rendered.

*Why one syntax palette across themes:* syntax colouring is a legibility system. Three variants of it
would be three sets to keep readable, for no benefit anybody asked for. The theme still changes
everything around the code.

### The editor theme is generated from these tokens {#editor-theme-is-generated}
- Six Monaco themes — three themes × light and dark — are generated at build time from the tables above.
  No colour appears in a `defineTheme()` call that is not traceable to a token here.
- Each generated theme sets at least: `editor.background` from `--app-bg`, `editor.foreground` from
  `--text`, `editorLineNumber.foreground` from `--gutter`, `editorLineNumber.activeForeground` from
  `--text`, `editorCursor.foreground` from `--accent`, `editor.selectionBackground` and
  `editor.selectionHighlightBackground` from `--selection-bg`, `editor.lineHighlightBackground` from
  `--hover`, `editorGutter.background` from `--app-bg`, `editorWidget.background` and
  `editorWidget.border` from `--surface` and `--stroke`, `editorSuggestWidget.*` from `--surface`,
  `--text` and `--accent-soft`, `minimap.background` from `--app-bg`, `scrollbarSlider.background` and
  `scrollbarSlider.hoverBackground` from `--scrollbar-thumb` and `--scrollbar-thumb-hover`,
  `editorError.foreground` from `--err`, `editorWarning.foreground` from `--warn`, plus token rules for
  the Markdown grammar from `--md-*` and for embedded fenced languages from `--hl-*`.

*Why generated:* Monaco cannot read a CSS custom property. It takes literal colours through
`monaco.editor.defineTheme()`, so "the editor and the preview share one theme" needs a mechanism, not an
assertion.

Examples: the same Go snippet in the editor and in the preview, side by side → identical token colours ·
a `defineTheme()` call containing a colour that is in no table above → rejected, because the generator is
the only thing allowed to produce those values.

`editorWidget.background` is on that list deliberately: it is the find widget, which ships white and is
unmissable in a dark Liquid Glass window. Find is built later, but its colours are decided here, because
this is where colours are decided.

### Diagrams take resolved colours, once {#diagram-theming}
- Mermaid's `themeVariables` is built from resolved token values read off the root element:
  `primaryColor` from `--accent-soft`, `primaryBorderColor` from `--accent`, `primaryTextColor` from
  `--text`, `lineColor` from `--muted`, `background` from `--surface`, `fontFamily` from `--font`.
- `mermaid.initialize()` is called once, and again only when the effective theme changes — not once per
  diagram per render.
- `securityLevel` is `'strict'`.
- **When** the theme or appearance changes, every open diagram re-renders.

Examples: a document with four diagrams, theme switched → one `initialize`, four re-renders ·
`initialize` per diagram per render → a global singleton is reconfigured repeatedly and a theme change
mid-flight interleaves two palettes in one document.

*Why:* Mermaid bakes resolved colours into the SVG at render time. Styling the rendered SVG from outside
reaches almost nothing.

### Maths is styled explicitly {#maths-styling}
- Display maths sits in a block with `--surface-2` behind it.
- **If** an equation is wider than the reading column, **then** it scrolls inside its own container and
  never widens the page.
- A maths parse error renders in `--err`, not KaTeX's built-in `#cc0000`.

Examples: a 200-character equation in a 700-pixel column → a horizontal scrollbar on the equation, the
paragraph below still at its normal width.

### The first paint is already in the right theme {#no-flash-on-launch}
- **When** the window first paints after launch, it is already in the persisted theme and appearance.
  There is no moment in a default palette.
- This is achieved by writing `data-theme` and `data-mode` into the served `index.html` at asset-server
  time. A `localStorage` mirror read by a blocking script in `<head>` is an acceptable alternative; the
  database remains the source of truth and the mirror is read for nothing else.

Examples: launching with Glass dark persisted → the window is dark from the first frame · reading the
theme from the database after the webview boots → a guaranteed light-to-dark flash on every launch.

### Printing forces a light background {#print-forces-light}
- Export has two styles, selected by a `data-print-style` attribute on the export root.
- **Clean** prints `--font` at 11pt on white, `--text` as near-black, no surface fills, hairline table
  borders, and links in `--text` with the URL appended in parentheses.
- **Current theme** prints the active palette with three mandatory overrides: the export root is forced
  to `data-mode="light"`, `--blur` becomes `none`, and `--canvas` becomes white.
- Anywhere a background carries meaning — a fenced block, a table header row, a blockquote — the print
  stylesheet sets `print-color-adjust: exact`.

Examples: exporting a Glass dark document in Current theme → a light page with the Glass accent and
radius · without the override → a full-page dark gradient behind translucent panels, which prints as
either a black page or a blank one depending on the platform's print engine.

## What it looks like

- The theme swatches in the Settings menu — `../surface/mockup.html#material-light/menu-settings`
- Settings → Appearance — `../surface/mockup.html#material-light/settings-appearance`
- The full token reference — `../surface/mockup.html#material-light/tokens`
- Each theme at its native appearance — `#glass-dark/editor-split`,
  `#material-light/editor-split`, `#minimal-light/editor-split`
- The focus ring on every control type — `../surface/mockup.html#material-light/focus`

## When things go wrong

| Situation | What the user sees | What they can do |
|---|---|---|
| The stored theme name is not one of the three | Material, silently | Nothing — it is corrected on the next write |
| The stored appearance is not `auto`, `light` or `dark` | Auto, silently | Nothing |
| A bundled font fails to load | The system font stack; everything stays legible | Nothing — it is a build defect, not a user problem |
| A Mermaid diagram fails to re-render after a theme change | The diagram's error placeholder in `--err` | Edit the diagram, or switch the theme back |

## Edge cases

**The operating system switches appearance while Auto is selected**
- *Trigger:* macOS moves to dark at sunset; the app is open with Auto.
- *Expected:* the tokens update, every open Mermaid diagram re-renders, and the Monaco theme is swapped —
  all three, in one change.
- *Avoid:* updating the CSS tokens only, leaving the editor in its old theme and every diagram in its
  old palette until the user edits something.

**The theme is switched while reading mode is active**
- *Trigger:* the user is in distraction-free reading and picks a different theme.
- *Expected:* the reader restyles live. Chrome stays hidden.
- *Avoid:* exiting reading mode to apply the theme.

**A stored theme or appearance is missing or invalid**
- *Trigger:* a first run, or a value written by a future version.
- *Expected:* Material and Auto, and the app starts normally.
- *Avoid:* refusing to start, or leaving the document element with no `data-theme` at all, which renders
  every token as its fallback and produces an unstyled window.

**The theme changes while a Mermaid diagram is mid-render**
- *Trigger:* a large diagram is rendering when the operating system flips to dark.
- *Expected:* the in-flight render is discarded by its generation token and re-run in the new palette.
- *Avoid:* letting the stale render land and paint a light diagram into a dark document.

**A bundled UI font fails to load**
- *Trigger:* a build that dropped the woff2 subsets.
- *Expected:* the app falls back to its system stack and stays legible.
- *Avoid:* shipping it. The visual gate catches this by asserting that the computed font on
  `document.body` is not a serif, which doubles as an offline-regression signal since every font is
  bundled.

## Not this

- **No user-authored themes and no theme editor.** Three token sets are three sets to keep readable
  across six palettes, two syntax families and a print stylesheet. An arbitrary user theme is a set
  nobody validated.
- **No custom accent colour.** Separate from the above and settled here so it is not reopened: an
  arbitrary hue would have to be legible against six backgrounds, three status colours and both syntax
  palettes, and nothing checks that at the moment the user picks it.
- **No separate editor theme setting.** One selection drives the editor and the preview. Two settings
  means a split view that looks like two applications.
- **No animated theme transition.** Six palettes cross-fading across the whole window at once reads as a
  rendering glitch, not as a transition.
- **No per-document theme.** The theme is the application's, not the document's.

## Decisions

- *2026-07-25* — The seven syntax colours that existed only in the mockup as `--c-h`, `--c-b`, `--c-em`,
  `--c-q`, `--c-c`, `--c-fn` and `--c-code` were given normative names in the `--md-*` family. Two token
  families that existed in neither the mockup nor the prose — `--hl-*` and the stacking scale — were
  added to both. A token in one and not the other is how a token table and an implementation drift apart.
- *2026-07-25* — Colour emoji were removed from the product interface. A colour emoji is a bitmap: it
  cannot take a token colour and it renders differently, or not at all, on each platform. Icons are one
  monochrome SVG sprite tinted from `currentColor`.
- *2026-07-25* — Editor and preview colours are generated at build time from one syntax-token family
  rather than hand-tuned per theme. Recorded in `../../adr/0029-generated-editor-themes.md`.

## Open questions

*(none — ready to build)*
