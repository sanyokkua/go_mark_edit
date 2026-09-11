# Adding a theme token

Every visual value in GoMarkEdit is a CSS custom property in
`frontend/src/ui/styles/tokens.css`. There are three themes — `glass`, `material`, `minimal` — and two
resolved appearances — `light`, `dark` — so a colour has six values, not one. That is the whole reason
this pattern exists: a literal colour is right in at most one of the six and invisible in the other
five.

## Where the value goes

`tokens.css` has two kinds of block.

**Structural values** — spacing, radii, widths, durations — do not vary by theme and live in the plain
`:root` block. That block is what exists today: 62 layout tokens and no colours.

```css
:root {
  --status-bar-min-height: 1.75rem;
  --shell-assistant-collapsed-width: 0;
}
```

**Colour and character values** are keyed by both attributes:

```css
:root[data-theme='material'][data-mode='light'] {
  --accent: #4f6bed;
  --app-bg: #faf8ff;
  --surface: #ffffff;
  --text: #1b1b22;
  --stroke: #e3e1ee;
}

:root[data-theme='material'][data-mode='dark'] {
  --accent: #4f6bed;   /* the accent hue does not change between appearances */
  --app-bg: #14141a;
  --surface: #1c1c24;
  --text: #eceaf6;
  --stroke: #2c2c38;
}
```

A theme keeps **one accent hue, one corner radius and one font family across both appearances**. Only
the surfaces and the text invert.

Two families are scoped by appearance only, in a `:root[data-mode='light']` block with no theme
selector — the status colours (`--ok`, `--warn`, `--err`) and the two syntax palettes (`--md-*` for
Markdown source, `--hl-*` for code inside fences). Sixteen syntax values, not forty-eight: syntax
colouring is a legibility system and three variants of it would be three sets to keep readable for no
gain.

## Adding one

1. **Name it after what it is, not where it is used.** `--surface-2`, not `--sidebar-background` — the
   second name is wrong the moment a second thing uses it.
2. **Add all six values at once**, or all two if it is appearance-scoped. A token defined for one theme
   falls back to nothing in the others, which renders as transparent or as the browser default.
3. **Consume it through `var()` in a CSS Module**, never inline:

```css
/* frontend/src/ui/widgets/EditorView.module.css */
.pane {
  background: var(--surface);
  color: var(--text);
  border: var(--editor-pane-border-width) solid var(--stroke);
  border-radius: var(--win-radius);
}
```

4. **Check it in all six combinations.** Switch theme and appearance in the running app, or open
   `../../spec/surface/mockup.html` and use its theme control.

## The two consumers that cannot read a custom property

This catches people out, so it is written down rather than discovered.

**Monaco** takes literal colours through `monaco.editor.defineTheme()`. It cannot read `var(--text)`.
The six editor themes are therefore *generated* from these token values at build time — no colour
appears in a `defineTheme()` call that is not traceable to a token here.

**Mermaid** bakes resolved colours into the SVG at render time from
`mermaid.initialize({ theme, themeVariables })`. Styling the rendered SVG from outside reaches almost
nothing. So `themeVariables` is built by reading the resolved values off the root element:

```ts
const styles = getComputedStyle(document.documentElement);
mermaid.initialize({
  startOnLoad: false,
  securityLevel: 'strict',
  themeVariables: {
    primaryColor: styles.getPropertyValue('--accent-soft'),
    primaryBorderColor: styles.getPropertyValue('--accent'),
    primaryTextColor: styles.getPropertyValue('--text'),
    lineColor: styles.getPropertyValue('--muted'),
    background: styles.getPropertyValue('--surface'),
    fontFamily: styles.getPropertyValue('--font'),
  },
});
```

`mermaid.initialize()` is called once, and again only when the effective theme changes — not once per
diagram per render. And every open diagram re-renders when the theme changes, or flipping to dark leaves
every diagram in the old palette until someone edits its source.

## Applying the theme

`logic/theme` sets both attributes on the document element, and only there:

```ts
export function applyTheme(theme: ThemeName, mode: EffectiveMode): void {
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  root.setAttribute('data-mode', mode); // always 'light' or 'dark' — never 'auto'
}
```

The user's *choice* (`auto` | `light` | `dark`) and the *resolved* value (`light` | `dark`) are two
separate stored things. Collapsing them — storing the resolved value as though the user had picked it —
destroys the Auto state on first run.

Setting the attributes on the root element rather than on an app wrapper is what makes Radix portals,
which render at the end of `<body>`, inherit the theme.

## Checklist

- [ ] Name says what the value is, not where it is used
- [ ] All six theme × mode values present — or both appearance values, for a `--md-*`, `--hl-*` or status token
- [ ] Consumed as `var(--name)` from a CSS Module; no literal colour anywhere under `frontend/src/ui/` outside `tokens.css`
- [ ] If it affects the editor, the generated Monaco theme maps it
- [ ] If it affects diagrams, it is in `themeVariables` and diagrams re-render on theme change
- [ ] Checked in three themes × light and dark in the running app
- [ ] `just archtest` passes — its colour-literal scan is what catches the value you left behind
