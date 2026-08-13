# Phase 17 session status

## Decisions encoded

`spec.md` Clarifications, **Session 2026-08-13** — four entries, integrated
into FR-FT-055, FR-FT-056, the edge-case bullet on excluded regions, and the
`editor-split` / `editor-only` / `preview-only` family rows:

1. **Editor region.** The mapped region stays compared whole with the two pane
   interiors split by owner. The preview pane uses a Feature 003 reference
   variant carrying the in-scope basic-preview content; the Monaco editor pane
   interior is a named reviewed region exclusion whose bounds and computed
   styles are still asserted exactly.
2. **Status states.** Six reviewed reference-adapter status variants are
   permitted, preserving the fixed 546-case / 1,638-comparison contract and the
   raw mockup source hash, and forbidding any production-only
   `comparisonAttempted: false` artifact from counting as a parity pass.
3. **Deferred toolbar controls.** `image`, `format`, `compact` and `lint` are
   deferred, so production draws them visibly unavailable while the mockup has
   no disabled state at all — 751 of the toolbar region's 965 differing pixels
   were that dimming alone. The reference variant now renders those four
   controls at the same single reviewed unavailable opacity FR-FT-056 already
   grants the File menu, so the comparison keeps measuring geometry.
   `t045-deferred-toolbar-controls.md` records it in full.
4. **View menu inventory.** FR-ED-004 requires the View menu to expose Editor,
   Split and Preview "in the original mockup order and grouping", but `#m-view`
   has `Show Editor` and `Show Preview` — the two halves cannot both hold
   against the binding. Production keeps FR-ED-004's inventory and the
   difference is a Feature 003 reference variant, which also covers the two
   deferred rows and Feature 003's host-formatted accelerators.
   `t072-view-presentation.md` records it in full.

## Task status

| Task | Status |
|---|---|
| T069 Settings localization | **complete** |
| T045 editor-region geometry | 6,116 → **182** unexplained px; every one characterised |
| T070 File-popup fail-closed parity | 181 unexplained px |
| T072 View popup | **converged** — 9,036 → 165 px, bounds match; see `t072-view-presentation.md` |
| T072 Glass menubar | **diagnosed, not closed** — cause is the compositing backdrop, not the menubar; see `t072-glass-compositing.md` |
| T071 Settings waiver removal | waiver removed and gating; 709 px **fully attributed** — see `t071-settings-residual.md` |
| T073, T074, T075 | not started |
| T065, T066, T067, T068 | not started |
| T035–T039, T044, T054 | not started |

## Targeted slice results

Every slice gates on whole-region geometry, computed styles and pixels. Each
slice below was re-run individually by name — the file is
`test.describe.configure({ mode: 'serial' })`, so a single failure skips the
rest and "not reached" never meant "passing".

| Slice | Result |
|---|---|
| T058 closed menubar, minimal-light | **passed** |
| T058 closed menubar, minimal-dark | **passed** |
| T058 closed menubar, material-light | **passed** |
| T058 closed menubar, material-dark | **passed** |
| T058 closed menubar, glass-light | 6,187 unexplained px — backdrop compositing, diagnosed |
| T058 closed menubar, glass-dark | 6,380 unexplained px — every pixel of the 220×29 region |
| T059 File popup | 181 unexplained px |
| T060 Settings popup | 709 unexplained px |
| T060 Settings overflow, 375px | 205 unexplained px |
| T061 View popup | **165 unexplained px**, bounds match (was `bounds.bottom: 455 != 457` with 9,036) |
| T061 About popup | 1,489 unexplained px |
| T062 tabs and toolbar | **passed** |
| T063 editor-status states | **passed** |
| T064 paused preview | **passed** |

## Renderer determinism — T062 and T064 were measuring noise

`t062-renderer-determinism.md` records this in full. Chromium's partial-raster
optimisation quantised an antialiased arc one step differently depending on
whether a tile was fully or partially re-rastered. Production captured
byte-identical pixels in 12 of 12 runs; the immutable reference alternated
between two rasters 8 / 4 over the same 12, one of which was byte-identical to
production. Every compared bound, computed style and sub-pixel phase already
matched. `--disable-partial-raster` makes both pages deterministic and changes
no tolerance, mask, mapping or comparator; T058 glass-light and T059 are
unchanged by it, so it suppresses no real drift.

The tab-strip add control is therefore **not** open production drift, and
should be struck from the T045 chrome residual list below.

## Editor-region convergence, 1280px Minimal Light `editor-split`

| Step | Total | Monaco (excluded) | Chrome | Preview | **Unexplained** |
|---|---:|---:|---:|---:|---:|
| Session start | 121,810 | 17,481 | 13,186 | 91,143 | 104,329 |
| Binding Minimal pane and toolbar rules | 104,189 | 17,481 | 6,609 | 80,099 | 86,708 |
| Reference preview variant + Monaco exclusion | 42,575 | 17,481 | 6,577 | 18,517 | 25,094 |
| Binding preview code-block styling | 27,490 | 17,481 | 6,577 | 3,432 | 10,009 |
| Arrangement segment keeps its binding surface | 23,597 | 17,481 | 2,683 | 3,433 | 6,116 |
| Content-derived toolbar widths + segment `--muted` | — | — | 965 | 3,433 | 4,398 |
| Preview line-height, inner `code` family, emphasis | — | — | 965 | 5 | 1,190 |
| Deferred toolbar controls in the reference variant | — | — | **177** | **5** | **182** |

Monaco's own raster is the named reviewed exclusion and is not comparable
between runs, so only the Unexplained column is meaningful across rows.

**All 182 remaining pixels are characterised, none masked** — see
`t045-toolbar-sizing-model.md`, `t045-preview-typography.md` and
`t045-deferred-toolbar-controls.md` for the per-element measurements:

- **Closed to zero pixels:** the `SEL 42W` and `● PREVIEW · LIVE` pane metadata;
  the whole tab strip; the toolbar's group and segment geometry, now exact in
  x and width including the weight-600 widening of the selected arrangement
  option; the preview code block; the image-fallback emphasis colour.
- **Open, cause identified, 65 px:** the Format and Lint marker glyphs. The
  binding draws `⌁ Format` as one text run; production's `::before` marker makes
  it two inline boxes, which Chromium rounds separately — measured at exactly
  +1/64px per label. Closing it needs the marker inside the label's own text
  node, which a pseudo-element cannot be.
- **Open, cause identified, 41 px:** the Link icon path approximation.
- **Open, cause NOT identified, 71 px:** the arrangement segment's corner arcs,
  ≤5 channel steps, with every compared bound, computed style and ancestor
  compositing property identical. Ruled out by measurement: nondeterminism (one
  raster per page over six captures) and position-dependent rasterisation (one
  raster over four scroll offsets on the reference alone). **This is the one
  genuinely unexplained residual left in the region.**
- **Open, cause identified, 5 px:** one preview list bullet marker.

**The tab-strip add control is struck from this list.** It was renderer noise,
not drift — see the determinism section above.

## Analysis of the residual popup pixels

The File, Settings and View popup residuals are concentrated on each popup's own
antialiased outer boundary — rounded corners and the fractional edge column —
where an opaque popup blends with the content behind it. Those boundary pixels
close when the chrome behind them converges; they cannot be closed by changing
the popup itself, and must not be masked.

Exact splits, replacing the earlier estimates:

| Popup | Total | Boundary | Interior | Interior cause |
|---|---:|---:|---:|---|
| Settings, 1280 | 709 | 416 | 293 | 286 on the Liquid Glass swatch's gradient dither (±1/channel); the two solid swatches differ by zero |
| View, 1280 | 165 | 163 | 2 | the Line numbers toggle's rounded right edge, delta 8 |

`t071-settings-residual.md` records the Settings split in full, including the
control that proves the swatch term is dither phase and not a style difference.

## Gate state

| Gate | Result |
|---|---|
| `just frontend-build` | OK |
| `just fmt-check` | OK |
| `just lint` | OK — 0 errors, the 2 baseline `react-refresh` warnings |
| `just typecheck` | OK |
| `just frontend-test` | OK — 74 suites / 466 tests |
| `just go-vet`, `just go-test`, `just archtest` | OK |
| `just gen-check` | fails on generator file-mode drift only (100644 → 100755 on three `frontend/wailsjs/runtime/` files, no content change) |
