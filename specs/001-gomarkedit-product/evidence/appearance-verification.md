# Appearance verification evidence

**Feature:** `001-gomarkedit-product`  
**Status:** complete — automated, in-app-browser, and native acceptance evidence recorded.

## Automated checks — 2026-07-30

The following commands passed after generated output was refreshed and compared:

- `npm --prefix frontend run check:editor-themes`
- `just fmt-check`
- `just typecheck`
- `just lint`
- `just archtest`
- `just test` — 31 suites, 126 tests
- `just frontend-build`
- `just verify STORY-063`
- `npm --prefix frontend run verify:ui -- appearance.test.ts`

`just build` also passed and produced
`build/bin/GoMarkEdit.app/Contents/MacOS/GoMarkEdit`.

## In-app browser evidence — 2026-07-30

Using the running frontend with actual Settings controls:

- Liquid Glass, Material, and Minimal were each selected with Light and Dark.
- Each selection changed the authoritative root attributes to its expected
  `data-theme` and resolved `data-mode` pair.
- At 375 px, 768 px, and 1280 px, all six resolved palettes were selected through
  the real controls: 18 cases in total.
- Every case produced the expected `data-theme` and resolved `data-mode`, kept
  Monaco and preview visible, and had no horizontal overflow.
- Browser console errors were empty.

## Liquid Glass repair — 2026-07-30

Native screenshots exposed an incomplete Liquid Glass presentation: the app used the translucent
content token but did not paint the binding aurora canvas, and legacy raised-surface/border aliases
overrode the binding `--elevated` and `--stroke` layers.

- `base.css` now paints `--canvas` as the page backdrop.
- Existing consumers of raised surface, border, and muted text now resolve to the binding
  `--elevated`, `--stroke`, and `--muted` tokens for every valid theme/mode pair.
- A regression test proves that mapping for Glass Light and Dark.
- Live inspection confirmed Glass Light and Dark now use their specified aurora gradients,
  translucent editor background, elevated surface, and stroke values.
- The production Wails build was regenerated after the repair.

## Native verification — 2026-07-30

Manual verification accepted these native cases as correct:

- pinned Light and Dark ignore an operating-system appearance change; and
- the app made no outbound network request during a five-minute observation.

The packaged app was launched successfully and its native window exposed the editor, preview,
settings menu, and keyboard-visible theme/appearance radio controls. A second process was launched
with `open -n build/bin/GoMarkEdit.app`.

After the production-bridge and preview-scroll repair, the manual retest also confirmed:

- a saved appearance is present from the first visible frame after a full quit and relaunch;
- native text selection and both Monaco and rendered-preview scrolling work; and
- changing the appearance in one `open -n` process does not change the other open window.

The user confirmed all requested native retest steps behaved as expected. No native appearance
blocker remains.

## Production bridge and preview-scroll repair — 2026-07-30

The mock bridge accepted the canonical SpecKit `glass` theme identifier, while the production Go
settings validator still accepted only the retired `liquid-glass` value. The resulting production-only
validation envelope was repaired: new writes accept and persist `glass`; an already-stored
`liquid-glass` value reads as `glass` for compatibility.

The preview content container now has a constrained vertical scroll area, so rendered Markdown can
scroll independently of the Monaco editor. Focused backend, settings persistence, and preview-layout
regressions pass; the production application was rebuilt after the repair.
