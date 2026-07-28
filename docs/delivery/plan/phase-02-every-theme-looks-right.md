# Phase 02 — Every theme looks right, including my code

## What you get

Colour. You pick one of three themes — Liquid Glass, Material, Minimal — in light, dark, or following
the system, from the minimum Appearance dialog and Settings-menu controls. The surfaces Phase 01
already shipped change together: the editor, the preview and the status bar. Nothing on those surfaces
is a browser default any more.

This phase adds only the two minimum controls needed to make theme selection a real user journey.
Phase 03 expands them into the complete Settings dialog and title-bar menu. This phase also establishes
the token vocabulary and generated assets that every later surface and renderer consumes.

## Why now, and not later

`frontend/src/ui/styles/tokens.css` has 62 tokens and not one of them is a colour. Every surface built
before the palette exists gets restyled afterwards.

More specifically: Monaco cannot read CSS custom properties — it needs literal colours handed to
`monaco.editor.defineTheme()` — so a unified editor and preview palette is not something that happens
by writing CSS. Generate the Monaco themes and the preview highlight stylesheet here from one source.
Phase 06 activates that stylesheet when it introduces preview syntax highlighting, Mermaid and KaTeX.

## Build it in this order

1. **The complete token table.** Every colour, and also selection, focus ring, scrollbar, hover,
   elevation, z-index, motion and typography. The rule is that a token used anywhere is named in
   `../spec/product/themes-and-appearance.md`; the mockup and the table never disagree. Take the values from the
   mockup — it already commits to a per-mode palette.
2. **One syntax-token family, two generated outputs.** A single set of `--hl-*` tokens (keyword,
   string, comment, number, function, type, attribute, punctuation) generates both the Monaco theme
   used now and the highlight.js stylesheet Phase 06 will activate in the preview. When that renderer
   arrives, a Go snippet matches across split view by construction rather than by later hand-tuning.
3. **Six generated editor themes.** Three themes × light and dark, generated from the token table
   rather than hand-tuned, covering the editor background and foreground, gutter, cursor, selection,
   current-line, the find widget, the suggest widget, the minimap, the scrollbar, and the error and
   warning colours the lint squiggles will need.
4. **Minimum Appearance controls.** Put theme and appearance in a small Appearance dialog and in a
   compact Settings menu. Both call the existing backend settings command, read the same persisted
   values and update together. Phase 03 expands these shells without replacing this state path.
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

## Deferred integrations

- **Phase 06 owns preview syntax activation, Mermaid and KaTeX.** It consumes the generated highlight
  stylesheet and resolved theme values from this phase, and it proves that diagrams and maths update
  without stale renders.
- **Phase 10 owns print styling.** It consumes this phase's tokens when it introduces the Current theme
  and Clean PDF export entry points.

## Also fix here

- **Bundle the fonts.** `../spec/product/themes-and-appearance.md` gives Material Roboto and Minimal Inter. Neither is in the
  bundled-asset list, and nothing may be fetched at runtime. Bundle them, or drop the per-theme font
  claim — silently falling back to the system font makes two of the three themes look the same.

## Where the details are

- Behaviour: the Phase 02 infrastructure rules in `../spec/product/themes-and-appearance.md` (the
  normative token table, persisted theme and appearance, root attributes, generated editor themes,
  bundled fonts, Auto and first paint). Renderer-specific rules live in
  `../spec/product/rendering-rich-documents.md` for Phase 06; print-specific rules live in
  `../spec/product/exporting-a-document.md` for Phase 10.
- What it looks like: `../spec/surface/mockup.html` — the theme switcher at the top drives every
  screen; see especially `tokens` and `editor-split`
- How theming works: `logic/theme/` (`resolveEffectiveTheme`, `applyTheme`, `watchSystemTheme`),
  three themes as a token layer only (`../adr/0005-token-theming.md`), and editor colours generated at
  build time from one syntax-token family (`../adr/0029-generated-editor-themes.md`)
- Bundled assets: `../architecture/stack.md`, `../spec/constraints.md#nothing-leaves-the-device`

## Questions to settle first

None. Three cross-phase ownership calls were settled on 2026-07-28: Phase 02 owns the minimum
Appearance controls; Phase 06 owns preview syntax activation, Mermaid and KaTeX; Phase 10 owns print
styling. The normative feature files now reflect that split.

Both of the theme-system calls this phase used to leave open are settled in
`../spec/product/themes-and-appearance.md`:

- **Syntax colours are keyed by appearance only, not by theme** — sixteen values, not forty-eight.
  Glass light and Minimal light show the same code colours deliberately: syntax colouring is a
  legibility system, and three variants of it would be three sets to keep readable for no benefit
  anybody asked for. The theme still changes the fence background, the border, the font and the gutter.
- **Every token the mockup uses is named in the feature file**, and every token named there is used in
  the mockup. A value in one and not the other is a defect in both. Any value you find the token table
  does not cover gets added to it as you go — never left only in CSS.

## Done when

Open the Phase 01 document with headings, a table and a fenced Go block in split view. Switch through
all six distinct theme × resolved-appearance palettes from both Appearance controls. Every time: the
existing app surfaces change immediately with no reload and no unstyled flash; the Markdown source and
embedded Go tokens in Monaco use the appearance palette; the preview fence, selection, cursor, scrollbar and
focus ring belong to the theme you picked; and both controls show the same persisted choice. Set
appearance to Auto and change the OS between light and dark — the app and Monaco follow. Relaunch and
see the selected palette on the first frame. Then run the visual gate and see eighteen passing
screenshots.

And the constraints every phase carries: every surface is checked in all three themes across light and
dark; no colour literal exists outside `tokens.css`; the focus ring is visible on every control in all
six palettes; turn on the system's reduced-motion setting and confirm nothing animates; watch the
network for five minutes and confirm nothing is sent, including a font. All of it in a real build.
