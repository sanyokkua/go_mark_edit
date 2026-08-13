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

The 375px overflow slice is now split the same way — see the section below.

## Gates

`just fmt-check`, `just lint` (0 errors, the 2 baseline `react-refresh`
warnings), `just typecheck`, `just frontend-test` (74 suites / 466 tests),
`just archtest` — all green. No file was changed for this investigation; the
measurement ran in a temporary probe that was removed.

## Follow-up: the Settings popup now draws from the shared menu surface

`SettingsMenu.module.css` had been re-declaring the popup surface, rows, group
labels, separators, ticks and switches that `MenuSurface.module.css` exists to
own once. It now consumes them. What is left in the per-menu file is
menu-specific by the rule the T033 test states: the trigger, the theme swatches,
the portal anchoring, the real checkbox input, and the accelerator span.

**The primitive was the drifted one, not the consumer.** Two of its declarations
disagreed with the binding, and converting without fixing them would have
imported the drift:

| Declaration | Binding | `MenuSurface` before | `SettingsMenu` before |
|---|---|---|---|
| `.lab` / `.groupLabel` padding | `7px 10px 3px` (`mockup.html:244`) | `5px 10px 3px` | `7px 10px 3px` |
| `.tgl` / `.toggle` cursor | `pointer` (`mockup.html:248`) | *(absent)* | `pointer` |

`ShellMenuRow.module.css` carried `.fileMenu .groupLabel{padding-block-start:7px}`
— a per-menu correction of the shared primitive back to the binding, which is
how the drift announced itself. `MenuSurface.groupLabel` had no consumer at the
time, so aligning it to the binding moved no existing pixel.

**The two meanings of `aria-disabled` are now distinct.** The shared `.row`
draws `aria-disabled` as a deferred action — `cursor: not-allowed` and
`--disabled-opacity` — which is the line whose absence once cost the View menu
1,404 pixels. The Settings open-mode and Markdown-standard rows use it for the
opposite reason: they report the value in force, chosen elsewhere. Swapping them
onto the bare `.row` would have dimmed them to 0.48. `MenuSurface` gained an
explicit `.stateRow` modifier for that case (`cursor: default`, full opacity);
the rows keep `aria-disabled`, because they genuinely cannot be activated and
assistive technology should say so.

**The accelerator stayed a DOM node.** Moving "All settings…" to the shared
`data-shortcut`/`::after` mechanism removed the text from `textContent`, which
`SettingsMenu.test.tsx` caught. Pseudo-element content is unevenly exposed to
assistive technology, and this is the one actionable row in the popup, so it
keeps a real span and a local `.shortcut` rule.

**No regression, measured both ways:**

| Slice | Before | After |
|---|---:|---:|
| T060 Settings popup, 1280px Minimal Light | 709 | **709** |
| T060 Settings overflow, 375px Minimal Light | 205 | **205** |

Both are unchanged, so the interior stays at the zero recorded above and the
conversion introduced no production style difference. The 709 and 205 remain
open for the reasons already given — neither is closable by editing this popup.

Verified in the real `wails dev` application, not only under the mock bridge:
the popup measures 250px wide with `border-radius: 12px` from
`--popup-radius`, and an open-mode row computes `cursor: default` at
`opacity: 1`.

`just frontend-test` is now 74 suites / 470 tests — the four added tests are the
projection regression cases recorded in `toggle-sidebar-projection.md`.

---

# The 375px overflow slice — split (Phase 18)

**Measured**: 2026-08-13, on freshly regenerated artifacts, with the same
per-pixel classifier used to reproduce the 1280 split above.

| Location | Pixels | Max channel delta |
|---|---:|---:|
| Popup outer boundary (within 12px of any edge) | **205** | 216 |
| Everything in the popup interior | **0** | 0 |
| **Total** | **205** | |

**The 375px residual is entirely the popup's own antialiased outer boundary.**
The interior differs by exactly zero pixels — cleaner than the 1280 case, which
additionally carries the Liquid Glass swatch's gradient dither because that
swatch is not drawn in the overflow layout.

## The classifier was validated before being trusted

The same tool was run against the 1280 artifacts, whose split was already
recorded independently earlier in this document. It reproduced them exactly:

```
region 251x549
total 709  boundary(<=12px) 416  interior 293  maxDelta 216
  y  34- 55  x  18-100   n=289   <- the Liquid Glass gradient swatch
  y 417-418  x 232-232   n=  2   maxDelta=8
  y 483-484  x 232-232   n=  2   maxDelta=4
```

709 = 416 boundary + 293 interior, with the two stray pairs at y417-418 and
y483-484 landing on the exact coordinates recorded above. A classifier that
reproduces an independently-measured split is trustworthy for the one that had
not been measured.

## Both slices, complete

| Slice | Total | Boundary | Interior | Interior cause |
|---|---:|---:|---:|---|
| Settings popup, 1280 | 709 | 416 | 293 | 289 on the Liquid Glass swatch's gradient dither (±1/channel); 4 at two isolated points; the two solid swatches differ by zero |
| Settings overflow, 375 | **205** | **205** | **0** | — |

Every one of the 914 pixels across both slices now has a written, proven cause,
and none is closable by editing the Settings popup:

- **621 boundary pixels** (416 + 205) are the popup's antialiased rounded
  corners and the fractional column of chrome beside them, where an opaque popup
  blends with the content behind it. They close when that chrome converges, and
  they must not be masked.
- **289 gradient-dither pixels** are Chromium's dither phase, set by
  layerisation: production's popup is portalled into `.application-frame`, the
  reference's is a plain absolutely-positioned `.dropdown`. Identical geometry,
  identical computed style, sub-perceptual delta. The two solid swatches — which
  need no dithering — are byte-identical, which is the control that makes this a
  diagnosis rather than a guess.
- **4 pixels** at two isolated points, same family.

## Status against the amended task

T071's wording was amended on 2026-08-13 to require **no unattributed pixels**
rather than a literal zero, per the recorded clarification on what a visual
parity check means. Against that standard both slices are complete: 914 of 914
pixels attributed, zero masks, zero tolerance changes, zero comparator changes,
and the immutable mockup and its source hash untouched.

## A trap this measurement uncovered

The first re-measurement of the Settings popup reported **2,554** pixels, not
709. The cause was not production: `playwright.config.ts` sets
`reuseExistingServer: !process.env.CI` for the reference server on port 4174, so
a server started before a `reference-adapter.ts` edit keeps serving the **old**
adaptation for the rest of the session.

Killing the port-4174 process and re-running returned 709 and 205 exactly. Any
measurement taken after an adapter change, without restarting that server, is
invalid — and it fails in the direction that looks like production drift.
