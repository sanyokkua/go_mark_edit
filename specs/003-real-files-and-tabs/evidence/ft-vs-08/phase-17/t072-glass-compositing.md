# T072 — the Glass menubar drift is not in the menubar

**Requirement**: FR-FT-045, FR-FT-053, FR-FT-054, FR-FT-055, SC-FT-009.
**Status**: **diagnosed, not closed.** The dominant causes are measured and
neither is production UI drift. Closing them needs a capture-condition decision,
so nothing was changed.
**Branch**: `feature/v1-implementation--003-t071-settings-parity`.

## What the difference actually looks like

T058 glass-light reports 6,187 unexplained pixels and glass-dark 6,380. The
menubar is 220×29 = **6,380 pixels**, so in glass-dark *every* pixel differs.

The difference is not a shape, an edge or a glyph. It is a near-uniform
brightening of the whole region, production over reference:

| Signed delta (act − ref) | Pixels |
|---|---:|
| `+4/+5/+5` | 946 |
| `+4/+5/+4` | 747 |
| `+3/+4/+4` | 548 |
| `+5/+6/+6` | 496 |
| `+5/+6/+5` | 435 |

Maximum channel delta 7. Every compared bound and computed style already
matched, and the canvas gradient is byte-identical — verified property by
property, not assumed:

| Property | Reference | Production |
|---|---|---|
| `body` background-image | four gradients, `radial-gradient(1100px 700px at 12% -12%, …)` first | **identical string** |
| `body` background-color / size / position / attachment / origin | `rgba(0,0,0,0)`, `auto`, `0% 0%`, `scroll`, `padding-box` | **identical** |
| `html` background | none | **identical** |
| `body` rect | `0,0 1280×720` | **identical** |
| frame background / backdrop-filter / box-shadow | `rgba(255,255,255,0.42)`, `blur(28px) saturate(1.5)`, `rgba(50,60,120,0.28) 0 34px 90px` | **identical** |

So the per-element styles are not the story. The compositing stack is.

## Two measured causes, neither in production's UI

`backdrop-filter: blur(28px) saturate(1.5)` on the application frame samples the
**backdrop image**, not merely the pixels under the element. Two properties of
the *reference page's own layout* therefore reach into the compared region.

### 1. The mockup harness bleeds through the blur

The mockup's `<body>` holds `svg`, `div.harness`, `div#app`, `div#tokref`,
`p.foot` and a `script`. The harness chrome is painted above and beside the app,
and the menubar sits only 8.5px below the frame's top edge — well inside a 28px
blur radius. Production's body holds only the frame's wrapper.

Hiding every non-`#app` body child on the reference, changing nothing else,
moves the dominant delta from `+4/+5/+5` to `-9/-7/0`.

### 2. The app sits 94px lower in the reference document

Both pages scroll to 0 and both bodies are `0,0 1280×720`, but the app's
document position differs because the mockup's harness occupies space above it:

| | Reference `#app` | Production `.application-frame` |
|---|---:|---:|
| document y | **224** | **130** |
| document x | 19.203125 | 19.203125 |
| scrollY | 0 | 0 |

The first gradient is anchored `at 12% -12%` with a 700px vertical extent, so it
is steeply position-dependent over exactly this range. Moving the reference app
to production's document y — by layout margin, not a transform, so no new
stacking context — moves the dominant delta from `+4/+5/+5` to `-17/-12/+3`.

### The two partially cancel

That is why the observed delta is small and uniform: the harness brightens the
reference's backdrop while the 94px offset darkens it, and the residue is the
difference.

| Reference state | Differing px | Max delta | Dominant delta |
|---|---:|---:|---|
| As captured | 6,187 | 7 | `+4/+5/+5` |
| App moved to production's document y | 6,220 | 19 | `-17/-12/+3` |
| Harness chrome hidden | 6,204 | 10 | `-9/-7/0` |
| **Both** | 6,154 | **4** | **`-3/-2/0`** |

Neutralising both roughly halves the maximum channel delta. A third, smaller
effect remains — production's menubar carries `transform: matrix(1,0,0,1,177.125,0)`
where the reference's does not, which puts it on its own composited layer above
a backdrop-filtered ancestor; its bounds still match exactly.

## What this means

**The Glass menubar cannot converge by changing production's menubar.** Its
pixels are a function of content outside the compared region — the immutable
mockup's own harness, and where that harness places the app over a
position-dependent gradient. No per-element style change can reach them.

This is a capture-condition question, which FR-FT-054 owns: it requires the two
pages to be captured under identical conditions, and for translucent palettes
the backdrop behind the compared region is one of those conditions. It is not
currently equalised. Candidate remedies, each needing a decision because each
changes how every Glass case is captured:

1. Place both apps at the same document position and neutralise the mockup
   harness for the capture, so the backdrop behind the compared region is the
   same gradient region on both pages.
2. Declare the backdrop a named reviewed capture condition for translucent
   palettes only, with the same explicit-variant discipline the other Feature
   003 differences use.

**Nothing was changed here.** Masking the region, widening tolerance, or tuning
a Glass colour to absorb the difference would each hide a real, measured
compositing difference rather than resolve it.

## Determinism

Checked before any of the above was called drift, per
`t062-renderer-determinism.md`: both pages produce a single stable raster, and
every measurement in this note was reproduced across repeated captures within
one run.

## Gates

`just fmt-check`, `just lint` (0 errors, the 2 baseline `react-refresh`
warnings), `just typecheck`, `just frontend-test` (74 suites / 466 tests),
`just archtest` — all green. No production or reference file was modified for
this investigation; every experiment was performed in-page inside a temporary
probe that was removed.
