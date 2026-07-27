# Phase 02 — Every theme looks right, including my code

## What you get

Colour. You pick one of three themes — Liquid Glass, Material, Minimal — in light, dark, or following
the system, and the whole app changes: the editor, the preview, the status bar, the code inside a
fenced block, the maths, the diagrams. Nothing is a browser default any more.

This phase adds no new surface. It makes the surfaces Phase 01 already shipped look like the mockup,
and it establishes the token vocabulary every later phase will style against.

## Why now, and not later

`frontend/src/ui/styles/tokens.css` has 62 tokens and not one of them is a colour. Every surface built
before the palette exists gets restyled afterwards.

More specifically: the editor and the preview are two different rendering engines showing the same
document. Monaco cannot read CSS custom properties — it needs literal colours handed to
`monaco.editor.defineTheme()` — so "the editor and the preview share a theme" is not something that
happens by writing CSS. It is a build step, and it has to exist before anyone styles anything on top
of it. Both reference implementations skipped it and both render every code block in a single colour
without having noticed.

## Build it in this order

1. **The complete token table.** Every colour, and also selection, focus ring, scrollbar, hover,
   elevation, z-index, motion and typography. The rule is that a token used anywhere is named in
   `01_Product/10_THEMING.md`; the mockup and the table never disagree. Take the values from the
   mockup — it already commits to a per-mode palette.
2. **One syntax-token family, two consumers.** A single set of `--hl-*` tokens (keyword, string,
   comment, number, function, type, attribute, punctuation) drives *both* the highlight.js stylesheet
   in the preview and the generated Monaco theme in the editor. A Go snippet looks identical on the
   left and the right of a split view because both sides read the same eight values.
3. **Six generated editor themes.** Three themes × light and dark, generated from the token table
   rather than hand-tuned, covering the editor background and foreground, gutter, cursor, selection,
   current-line, the find widget, the suggest widget, the minimap, the scrollbar, and the error and
   warning colours the lint squiggles will need.
4. **Diagrams and maths follow the theme.** Mermaid is initialised once with `themeVariables` built
   from the resolved tokens and re-renders every open diagram when the theme or appearance changes;
   KaTeX inherits colour and gets its display, overflow and error-token treatment defined.
5. **Auto follows the system.** An Auto appearance that resolves to light or dark and changes live
   when the OS does, without a restart. Keep the user's *choice* and the *resolved* value as two
   separate persisted things — collapsing them into one is exactly how an app loses Auto.
6. **No flash on boot.** The theme lives in SQLite behind the Go bridge, so without a deliberate
   answer the webview paints in a default palette and then corrects itself. Decide the mechanism and
   build it here.
7. **Icons, not emoji.** One monochrome icon set that tints from `currentColor`. Emoji are bitmaps:
   they cannot take a token colour, and they render differently on each OS.
8. **The visual gate.** Three widths × six palettes, automated, with screenshots. Eighteen
   combinations checked by eye is a thing nobody does twice.

## Also fix here

- **Bundle the fonts.** `10_THEMING.md` gives Material Roboto and Minimal Inter. Neither is in the
  bundled-asset list, and nothing may be fetched at runtime. Bundle them, or drop the per-theme font
  claim — silently falling back to the system font makes two of the three themes look the same.

## Where the details are

- Behaviour: `01_Product/10_THEMING.md` (the normative token table, the editor theme, Mermaid and
  KaTeX theming, the print stylesheet tokens)
- What it looks like: `mockups/gomarkedit-mockup.html` — the theme switcher at the top drives every
  screen; see especially `tokens` and `editor-split`
- How theming works: `logic/theme/` (`resolveEffectiveTheme`, `applyTheme`, `watchSystemTheme`),
  DD-28…DD-30, DD-69, ADR-0005, ADR-0029
- Bundled assets: `05_Dependencies/02_FRONTEND_DEPENDENCIES.md` §7, `03_NonFunctional/04_OFFLINE.md`

## Questions to settle first

None blocking — ADR-0029 settles how editor colours are produced, and the token table is written
before step 1 rather than discovered during it. Two smaller calls to make as you go:

- **Are syntax colours per mode or per theme?** The mockup defines them per mode only, which means
  Glass-light and Minimal-light have identical code colours. That is defensible and cheaper (six
  values instead of eighteen) but it does contradict "every theme keeps its own character across both
  appearances". Pick one and write it into `10_THEMING.md`.
- **Any value the mockup does not cover** gets recorded in `10_THEMING.md` as you add it, never left
  only in CSS.

## Done when

Open a document with a fenced Go block, a table, an inline formula and a Mermaid diagram in split
view. Switch through all six combinations of theme and appearance. Every time: the app changes
immediately with no reload and no unstyled flash; the code on the left and the code on the right are
the same colours; the diagram re-draws in the new palette rather than staying behind; the selection,
the cursor, the scrollbar and the focus ring all belong to the theme you picked. Set appearance to
Auto and change the OS between light and dark — the app follows. Then run the visual gate and see
eighteen passing screenshots.
