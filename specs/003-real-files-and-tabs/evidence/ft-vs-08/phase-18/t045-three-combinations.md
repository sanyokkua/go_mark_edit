# T045 — the three representative combinations, measured

**Requirement**: FR-FT-045, FR-FT-050, FR-FT-052; the 2026-08-14 clarification
reducing T045 to three combinations at 1280px, one per colour family
(`t045-scope-reduction.md`).
**Source**: the 2026-08-14 unrestricted matrix run, `parity/manifest-report.json`.
**Mapped region**: `#app.no-assistant .content` ↔ `section[aria-label="Editor view"]`.

## The measurement

| Combination | Unattributed pixels | Feature 002 style rows | Reference hash stable | Actual hash stable |
|---|---:|---:|---|---|
| `primary:editor-split:1280:minimal-light` | **182** | 8 | yes (3/3) | yes (3/3) |
| `primary:editor-split:1280:material-light` | **72,996** | 8 | yes (3/3) | yes (3/3) |
| `primary:editor-split:1280:glass-light` | **309,561** | 8 | yes (3/3) | **no — 2 distinct** |

Each figure is identical across all three repetitions.

## The reduction did the job it was reduced to do

The scope reduction kept three combinations for one stated reason: *"Three is
enough to catch a palette-specific mistake. That is the only failure mode a
wider sweep could find that the measured combination cannot."*

**It caught one immediately.** Minimal is at 182 pixels — the residual already
characterised in the phase-17 T045 evidence. Material is **400×** that, and
Glass **1,700×**. The single measured combination that the earlier evidence
rested on was the *best* of the three by three orders of magnitude, and reading
it as representative would have been badly wrong.

This is worth stating plainly because the reduction was argued on the grounds
that the other combinations would "all carry the same Feature 002 editor font
and scrolling difference, so they cannot pass either and add 17 runs for one
signal". The first half was right — all three carry the same eight Feature 002
style rows. The second half was wrong: they carry very different pixel counts,
and the difference is the finding.

## Two hypotheses, neither yet tested

**(a) Glass and Material may be the same compositing term as the menubar, over a
larger region.** The targeted `closed-menubar:1280:glass-light` slice measures
6,186 differing pixels over its region at a **maximum channel delta of 7**, with
every compared bound and computed style identical — attributed as
`glass-backdrop-compositing`, a whole-region sub-perceptual shift caused by
`backdrop-filter` sampling a different backdrop in production than in the
reference. 309,561 is 55% of this region's 559,104 pixels, which is the shape a
whole-region shift takes. If the maximum channel delta here is likewise small,
this is layerisation and attributable rather than geometry drift.

**(b) Or it is real drift that Minimal does not expose.** Minimal is the flat,
separator-led palette; Glass carries translucency, blur and saturation, and
Material a filled hierarchy. A surface that resolves correctly under Minimal and
wrongly under the other two is exactly the palette-specific mistake this
reduction exists to find.

**The measurement that separates them is the per-pixel maximum channel delta**,
which this run does not record for primary families — only the count. Taking it
is the next step for T045, and it must be taken before any estimate is put on
closing these two.

## A second finding: Glass actual captures are not deterministic

`glass-light`'s actual hash differs between repetition 1 (`3656adeb`) and
repetitions 2 and 3 (`61a20e7d`). The reference hash is stable across all three,
and both other palettes are stable on both sides.

FR-FT-054 requires that "three consecutive unchanged captures MUST produce
identical image hashes". Glass does not currently satisfy that, so its pixel
figure is not yet a trustworthy measurement of anything — a comparison against a
non-deterministic capture cannot distinguish drift from noise.

`playwright.config.ts` already disables partial raster for exactly this class of
problem, and its comment records that the fix made both pages deterministic 12
of 12 on the T062 tab-strip slice. Whatever remains in Glass is a different
source and needs its own diagnosis. **This must be resolved before the Glass
figure above is used for anything**, and it may also explain part of the 918
pixel-drift failures across the wider matrix, since Glass accounts for a third
of every palette sweep.

## Status

T045 stays open. Its outcome clause requires that "the fixed editor-family
mappings no longer report the observed bounds/style/pixel drift", and all three
combinations still report it. What has changed is that the drift is now measured
per colour family instead of extrapolated from one, and two specific next
measurements are named.
