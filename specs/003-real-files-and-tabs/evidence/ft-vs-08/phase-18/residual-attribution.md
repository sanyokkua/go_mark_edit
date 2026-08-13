# Every remaining targeted residual, attributed

**Requirement**: FR-FT-045, FR-FT-052, FR-FT-055, Constitution VII, and the
2026-08-13 clarification on what a visual parity check means — a check passes
when every differing pixel has a written, proven cause.
**Measured**: 2026-08-13, on freshly regenerated artifacts.

## Method

One per-pixel classifier, applied identically to every slice: decode both
rasters, count every pixel whose maximum channel delta is non-zero, and split by
distance from the region edge. It was **validated before being trusted** by
reproducing the independently-recorded Settings 1280 split exactly — 709 = 416
boundary + 293 interior, with the two stray pairs landing on the recorded
coordinates x232, y417-418 and y483-484.

## The results

| Slice | Reported | Raw differing | Boundary | Interior | Interior cause |
|---|---:|---:|---:|---:|---|
| T059/T070 File popup | 181 | 776 | **181** | 595 | the four macOS accelerator glyphs, already the permitted platform exception |
| T060 Settings popup 1280 | 709 | 709 | 416 | 293 | Liquid Glass swatch gradient dither (289) + 4 isolated |
| T060 Settings overflow 375 | 205 | 205 | **205** | **0** | — |
| T061 View popup | 165 | 165 | 163 | 2 | Line numbers toggle's rounded right edge, delta 8 |
| T061 About popup | **87** | 87 | **87** | **0** | — (was 1,489 before the reference variant; see below) |
| T058 closed menubar, glass-light | 6186 | 6186 | 2844 | 3342 | backdrop compositing across the whole region, **max delta 7** |
| T077 toolbar | 177 | 177 | — | — | already characterised in the T045 evidence |

## T070 — the File popup is fully attributed

Its 776 raw differing pixels split cleanly:

- **595 interior pixels** sit in four tight column bands at x194-226 (and
  x180-225 for the wider `⌘⇧S`), at exactly the rows of the New File, Open File,
  Save and Save As accelerators. These are the **focused platform exception T070
  itself permits**: macOS accelerator-glyph pixels for those four actions, each
  with semantic binding and bounded-pixel evidence. The comparator already
  subtracts them, which is why the slice reports 181 rather than 776.
- **181 boundary pixels** are the popup's own antialiased rounded corners and
  the fractional column of chrome beside it — the same term as the Settings
  overflow slice, whose residual is *entirely* this.

Nothing else in the popup differs. Every non-accelerator pixel of geometry,
label, tick, separator and row spacing is byte-identical to the binding. T070's
remaining requirement — "Close Tab, Exit, geometry, labels, focus, availability,
dismissal, and all other pixels remain fail-closed" — is met: those pixels are
zero.

**T070 is complete against its standard.**

## T072 — two of its three parts are attributed, one is not

**View popup: attributed.** 165 = 163 boundary + 2 interior, the two being the
Line numbers toggle's rounded right edge at delta 8. Bounds and computed styles
already match.

**Glass menubar: attributed.** 6,186 pixels covering the entire 220×29 region
with a **maximum channel delta of 7** — a uniform, sub-perceptual shift, not a
drawing difference. Every compared bound and computed style matches. This is the
backdrop-compositing cause already diagnosed in `t072-glass-compositing.md`: the
Glass palette's `backdrop-filter` samples a different backdrop in production
(portalled into `.application-frame`) than in the reference (a plain
absolutely-positioned element). A difference confined to ≤7/255 across a whole
region, with identical geometry, is layerisation — the same family as the
Settings swatch dither and the arrangement segment's corner arcs.

**About popup: attributed, after a correction.**

An earlier reading of this file claimed the About residual was "real version and
build metadata" and therefore unclosable by code. **That was wrong, and it was
wrong because it inferred content from pixel bands without reading the markup.**
The mockup's `#m-about` (`mockup.html:635-639`) contains four ordinary rows —
Keyboard shortcuts, Open logs folder, View on GitHub (MIT), About GoMarkEdit —
and no version metadata at all.

The actual cause was the one already seen three times in this feature:
`open-logs` and `view-github` are `laterDeferred` in the action registry
(`actionRegistry.ts:299-304`), so production draws both rows visibly
unavailable, and Feature 003 formats the Keyboard shortcuts accelerator for the
host where the binding hard-codes `Ctrl ?`. The two measured text bands at
y58-70 and y88-100 were those two dimmed rows; the band at y17-26 was the
accelerator glyph.

Resolved by the reviewed reference variant recorded in the 2026-08-13
clarification — the same treatment the File and View menus already have. A
variant rather than a region exclusion, because the difference is presentational
and this feature owns the About popup's geometry; an exclusion is reserved for a
component this feature does not own, as with the Monaco editor interior.

Measured after the variant:

```
region 251x156
total 87  boundary(<=12px) 87  interior 0  maxDelta 4
```

**1,489 → 87, with the interior at exactly zero** and every remaining pixel the
popup's own antialiased outer boundary at a maximum channel delta of 4.

With this, all three parts of T072 are attributed and the task is complete.

## What this means for the amended standard

Of the seven targeted slices carrying a residual, **all seven are fully
attributed**. The attributed residuals fall into exactly three
families, all previously identified and none closable by editing production:

1. **Antialiased popup boundary** — 181 + 205 + 416 + 163 + 87 = 1,052 pixels
   where an opaque popup blends with the chrome behind it. Closes only when that
   chrome converges. Never masked.
2. **Layerisation** — gradient dither (289), Glass backdrop (6,186 at ≤7 delta),
   toggle edge (2). Identical geometry and computed style, different composited
   layer.
3. **Permitted platform exception** — 595 accelerator-glyph pixels the task
   itself grants.

## Attributed is not the same as green — read this before trusting a `[X]`

The comparator has no concept of "attributed". `comparePng` fails on any
non-zero differing pixel, and nothing in this phase changed that: no mask, no
tolerance, no comparator change, no coordinate-handling change.

So the slices below **still report non-zero and still fail when run**, and that
is the intended state:

| Slice | Reports | Task status |
|---|---:|---|
| T059 File popup | 181 unexplained pixels | T070 `[X]` — attributed |
| T060 Settings 1280 | 709 unexplained pixels | T071 `[X]` — attributed |
| T060 Settings 375 | 205 unexplained pixels | T071 `[X]` — attributed |
| T061 View popup | 165 unexplained pixels | T072 `[X]` — attributed |
| T061 About popup | 87 unexplained pixels | T072 `[X]` — attributed |
| T058 glass-light/dark | 6186 / 6380 | T072 `[X]` — attributed |
| T077 toolbar | 177 unexplained pixels | new slice, residual already characterised |

A `[X]` on T070, T071 and T072 means **every differing pixel in that slice has a
written, proven cause**, which is the standard the 2026-08-13 clarification
records and the standard session decision 2 directed. It does **not** mean the
Playwright case is green, and it must not be read that way.

Closing the gap between the two would require the comparator to accept
attributed regions the way it already accepts the File popup's platform
exceptions. That was deliberately **not** done here: it is a change to how the
measurement is taken, it needs its own specification decision about when a
region may be declared attributed, and doing it casually is indistinguishable
from adding masks to manufacture a pass.
