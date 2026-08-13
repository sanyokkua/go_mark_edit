# T071 — what the Settings popup's 709 pixels actually are

**Requirement**: FR-FT-045, FR-FT-052, FR-FT-055, Constitution VII.
**Status**: **measured and fully attributed.** No production style difference
remains; the residual splits into a boundary term and one gradient-dither term.
**Branch**: `feature/v1-implementation--003-t071-settings-parity`.

The waiver is removed and the slice gates. This note replaces the earlier
estimate ("401 of 824 were outer-edge and 423 were the three theme swatches")
with an exact split at the current 709.

## The split

Popup region 251×549 on both pages, bounds and computed styles already matching.

| Location | Pixels | Max channel delta |
|---|---:|---:|
| Popup outer boundary (within 12px of any edge) | **416** | — |
| Theme swatch 1, the Liquid Glass gradient | **286** | 8 |
| Two stray pairs at y 417–418 and y 483–484 | **4** | ≤8 |
| Everything else in the popup interior | **0** | — |
| **Total** | **709** | |

Note what is *not* in that table: the second and third theme swatches differ by
**zero** pixels. The earlier note attributed 423 pixels to "the three theme
swatches"; only the first one differs, and only where it is a gradient.

## The swatch difference is dither phase, not style

The binding declares
`.swatches i{width:22px;height:22px;border-radius:6px;border:1px solid var(--stroke)}`
(`mockup.html:247`) with the first swatch's gradient inline
(`linear-gradient(135deg,#7aa2ff,#c58bff)`, `:613`). Production's computed values
are the same declaration:

| Property | Reference `<i>` | Production `<button>` |
|---|---|---|
| box | 22×22 | 22×22 |
| `background-image` | `linear-gradient(135deg, rgb(122,162,255), rgb(197,139,255))` | **identical** |
| `border-radius` | `6px` | `6px` |
| `border` | `1px solid rgb(228,228,231)` | **identical** |
| selected outline | `2px solid rgb(16,185,129)`, offset `2px` | **identical** |

And the pixels differ by ±1 on a single channel, alternating sign along the
gradient axis — read directly from row y=44:

```
x=18 ref=139,157,255  act=139,156,255   d=0/-1/0
x=19 ref=141,156,255  act=141,157,255   d=0/+1/0
x=20 ref=143,156,255  act=142,155,255   d=-1/-1/0
x=21 ref=144,155,255  act=145,155,255   d=+1/0/0
…
x=25 ref=152,153,255  act=152,153,255   d=0/0/0
```

That alternation is Chromium's gradient dithering, whose phase depends on where
the element lands in its composited layer. The two solid-colour swatches, which
need no dithering, are byte-identical — which is the control that makes the
diagnosis solid rather than a guess.

The two rendering paths differ in layerisation: production's popup is portalled
into `.application-frame`, the reference's is a plain absolutely-positioned
`.dropdown`. This is the same family as the arrangement segment's corner arcs
recorded in `t045-toolbar-sizing-model.md` — identical geometry and computed
style, sub-perceptual delta, different composited layer.

## Determinism

Checked before calling any of it drift, per `t062-renderer-determinism.md`: six
captures of the popup on each page produced exactly **one** raster per page. The
difference is stable on both sides, so it is not renderer noise — it is a real
difference that no per-element style change can reach.

## The boundary term

416 pixels lie within 12px of the popup's edge — its own antialiased rounded
corners plus the fractional column of chrome beside it that the bounding box
includes. This is the pattern already recorded for the File popup and now the
View popup: an opaque popup blending with the content behind it. It closes when
that chrome converges, cannot be closed by changing the popup, and is not
masked.

## What this means for T071

T071 requires "zero unexplained pixels at 1280px and 375px with zero
masks/tolerance changes". Every one of the 709 is now explained, but none of the
three terms is closable by editing the Settings popup:

- 416 depend on the chrome behind the popup converging.
- 286 are a gradient dither phase set by layerisation.
- 4 are the same at two isolated points.

The 375px overflow slice (205 pixels) has not been split this way yet.

## Gates

`just fmt-check`, `just lint` (0 errors, the 2 baseline `react-refresh`
warnings), `just typecheck`, `just frontend-test` (74 suites / 466 tests),
`just archtest` — all green. No file was changed for this investigation; the
measurement ran in a temporary probe that was removed.
