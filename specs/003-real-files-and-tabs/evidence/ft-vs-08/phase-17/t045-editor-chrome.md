# T045 — editor-region chrome convergence

**Requirement**: FR-FT-045, FR-FT-050, FR-FT-052, CL-15–CL-17.
**Status**: **partial.** Pane metadata closed to zero; toolbar icons and labels
improved; toolbar sizing model still open.
**Branch**: `feature/v1-implementation--003-t071-settings-parity`.

Measured per element at 1280px Minimal Light, `editor-split`, against the live
reference at the binding source hash. Every box below matched exactly on both
pages before and after; only pixels moved.

## Pane metadata — closed

The binding gives the pane header exactly one emphasis, and production had
neither half of it:

| Fragment           | Binding                                                                             | Production before              |
| ------------------ | ----------------------------------------------------------------------------------- | ------------------------------ |
| `● Preview · live` | `rgb(4,120,87)` — `.pane-h .live{color:var(--accent-ink)}` (mockup.html:301)        | `rgb(154,161,171)` (`--faint`) |
| `sel 42w`          | `rgb(4,120,87)` — nested `<span style="color:var(--accent-ink)">` (mockup.html:726) | `rgb(154,161,171)` (`--faint`) |

Everything else already matched byte-for-byte: text, x position, width, family,
10px size, `0.9px` letter-spacing, uppercase transform, weight 400.

| Region              | Before             | After |
| ------------------- | ------------------ | ----- |
| Editor pane header  | 214 px (max Δ 150) | **0** |
| Preview pane header | 413 px (max Δ 150) | **0** |

`sel 42w` moved into its own span to carry the colour, so it now comes from the
catalogue as `editor.metadata.selection` — a bare JSX literal is a Constitution
VI violation and `just archtest` caught it. `EditorView.test.tsx` was updated,
not weakened: it still asserts the metadata reads `UTF-8 · LF · sel 42w`, and
now also asserts the selection metric is its own element.

## Link and Image toolbar icons — improved

The binding draws both in a 24-unit box and renders them at 15px
(`mockup.html:482`, `:483`), so their 1.75 stroke resolves to `1.75 × 15/24`.
Production approximated the paths in the 15-unit space. Adopting the source
viewBox follows the decision already recorded for `file`.

| Button | Before             | After                  |
| ------ | ------------------ | ---------------------- |
| Link   | 139 px (max Δ 220) | **41 px** (max Δ 41)   |
| Image  | 151 px (max Δ 206) | **127 px** (max Δ 114) |

## Format / Compact / Lint labels — improved

The binding's `.tbtn` (mockup.html:287) sets a size but never a family, so a
`<button>` keeps Chromium's UA form-control family — Arial. Production sets
`font: inherit` on `.action`, and the existing parity family rule covered only
`[data-icon]` buttons, which excludes the three textual controls.
`.tbtn.txt` (mockup.html:288) also carries `--muted`, which `.action`'s
`--text` overrode. Both are scoped to the parity route, exactly like the
existing glyph treatment.

| Button  | Before             | After                 |
| ------- | ------------------ | --------------------- |
| Format  | 276 px (max Δ 144) | **240 px** (max Δ 74) |
| Compact | 422 px (max Δ 144) | **342 px** (max Δ 86) |
| Lint    | 211 px (max Δ 255) | **181 px**            |

## What remains, and why

The residual on all five toolbar buttons is dominated by a **sub-pixel layout
offset that production cannot currently reproduce**, because production pins
measured integer widths where the binding derives fractional ones from text
metrics:

| Toolbar child              | Reference                          | Production                         |
| -------------------------- | ---------------------------------- | ---------------------------------- |
| group 1 (bold…inline-code) | x 246.203125, w **135.078125**     | x 246.203125, w **135**            |
| group 2 (headings)         | x **385.28125**, w 107.953125      | x **385.203125**, w 108            |
| group 3 (lists)            | x **497.234375**                   | x **497.203125**                   |
| group 4 (link/image/table) | x **630.234375**                   | x **630.203125**                   |
| arrangement segment        | x **1068.765625**, w **181.03125** | x **1068.515625**, w **181.28125** |

The binding sizes every control from content — `.tbtn{min-width:30px;padding:0
8px}`, `.tgrp{gap:3px;padding:3px}`, `.seg button{font:inherit;font-size:11.5px;
padding:5px 12px}`. Production's parity CSS pins `inline-size: 30px / 34px /
36px / 33px / 66.5625px / 181.28125px`, which is correct to two decimal places
and wrong in the fractional tail; the error accumulates left to right and shifts
every glyph after it by 0.03125px.

Two consequences worth naming:

1. The segment's font is pinned to `Arial` in production, but the binding's
   `.seg button` uses `font: inherit` — the theme family, not the UA family.
   That is the likely source of the 0.25px segment width difference.
2. Closing this means replacing the pinned widths with the binding's own sizing
   model, not adjusting the pinned numbers. Adjusting them re-derives the same
   class of error at a smaller magnitude.

Still open in this region and untouched here: the preview code block's text
position, and the image-fallback emphasis colour.

## Gates

`just fmt-check`, `just lint` (0 errors, the 2 baseline `react-refresh`
warnings), `just typecheck`, `just frontend-build`, `just frontend-test` (74
suites / 466 tests), `just archtest`, `just go-vet`, `just go-test` — green.
`just gen-check` still fails only on the baseline generator file-mode drift.

Every previously green targeted slice re-verified green after the change: T058
minimal-light, minimal-dark, material-light, material-dark, T062, T063, T064.
T059 (181), T060 Settings (709) and T060 overflow (205) are unchanged.
