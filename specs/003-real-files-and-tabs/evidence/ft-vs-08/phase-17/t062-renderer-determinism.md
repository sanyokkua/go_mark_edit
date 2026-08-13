# Parity renderer determinism — Chromium partial raster

**Requirement**: FR-FT-045, FR-FT-054, FR-FT-055, SC-FT-009.
**Status**: **resolved.** T062 and T064 now pass at zero tolerance; T060 improved.
**Branch**: `feature/v1-implementation--003-t071-settings-parity`.

## What was wrong

T062 (tab-strip, 1280px Minimal Light) reported a stable-looking `42 unexplained
pixels`. The residual was recorded as production drift in the T045 chrome list
("the tab-strip add control"). It was not production drift.

The 42 pixels lay entirely inside the tab-strip add control, on the antialiased
arcs of its four 7px rounded corners, at a maximum channel delta of **2/255**.
Every compared property was already identical on both pages, measured directly:

| Property | Reference `.tab-add` | Production `[data-tab-new]` |
|---|---|---|
| bounds | `555.766, 279.500  28x28` | `555.766, 185.500  28x28` |
| border | `1px solid rgb(228,228,231)` | `1px solid rgb(228,228,231)` |
| background / colour | `rgb(251,251,250)` / `rgb(31,35,40)` | identical |
| border-radius, box-sizing | `7px`, `border-box` | identical |
| font | `15px Arial`, weight 400 | identical |
| text-align, line-height | `center`, `normal` | identical |

Both boxes share the same sub-pixel phase (`x` fractional `.766`, `y` fractional
`.5`), so the raster grid alignment is the same on both pages.

## Root cause

Chromium's **partial raster** optimisation re-rasters only the invalidated
sub-rectangle of a tile and reuses the surrounding pixels. The full-raster and
partial-raster paths quantise an antialiased arc one step differently.

The direction of causality is what proves this is not production drift:

| Page | Distinct rasters over 12 identical runs |
|---|---|
| Production | **1** — byte-identical every run |
| Immutable reference | **2** — split 8 / 4 |

One of the reference's two rasters was byte-identical to production's single
raster. A production defect cannot make the reference page nondeterministic.
Confirmed again from the test's own retained artifacts over six real runs:
`actual.png` hashed `dd80a2d0ebd6` in all six, while `reference.png` alternated
between `dd80a2d0ebd6` (pass) and `93096179ba6d` (42-pixel fail).

Ruled out by measurement, each leaving the split unchanged: the parity
`z-index` and `backdrop-filter` rules on the tab strip, the frame's
`box-shadow`, the rounded `overflow:hidden` clip, page scroll position (the
reference scrolls 94px during the editor-surface capture; the raster is
identical at scroll 0, 10, 50 and 171), a 1.2s settle, and two forced animation
frames. The last two only made the flip rarer — 1 in 6 rather than 4 in 12 —
which is the signature of a race, not a fix.

## Change

`frontend/playwright.config.ts` — `launchOptions.args: ['--disable-partial-raster']`.

With the flag, the reference produced one raster in 12 of 12 runs, and T062
passed 6 of 6 real test runs. This changes no tolerance, mask, selector
mapping, coordinate handling or comparator, and applies equally to both pages:
it removes a renderer race rather than hiding a difference. That it does not
suppress real drift is shown by T058 glass-light (6,187) and T059 (181) being
unchanged by it.

`frontend/e2e/targeted-parity.test.ts`, `frontend/e2e/real-files-parity.test.ts`
— freeze parity pixels *before* driving the reference harness switches instead
of after. The binding animates `.sidebar` and `.assistant` width over
`--dur-slow` (300ms, `mockup.html:254` and `:337`), so a width or screen click
started a transition that the later freeze could only snap mid-flight. This is
a separate correctness fix, not the cause of the 42 pixels; it did not change
the split on its own.

## Measured effect — every targeted slice, re-run after the change

| Slice | Before | After |
|---|---|---|
| T058 closed menubar, minimal-light | passed | **passed** |
| T058 closed menubar, minimal-dark | not reached | **passed** |
| T058 closed menubar, material-light | not reached | **passed** |
| T058 closed menubar, material-dark | not reached | **passed** |
| T058 closed menubar, glass-light | 6,187 | 6,187 |
| T058 closed menubar, glass-dark | not reached | 6,380 |
| T059 File popup | 181 | 181 |
| T060 Settings popup | 823 | **709** |
| T060 Settings overflow, 375px | not reached | 205 |
| T061 View popup | `bounds.bottom: 455 != 457` | unchanged |
| T061 About popup | not reached | 1,489 |
| T062 tabs and toolbar | 42 | **passed** |
| T063 editor-status states | — | passed |
| T064 paused preview | 41 | **passed** |

The slices previously marked "not reached" were never measured: the file is
`test.describe.configure({ mode: 'serial' })`, so one failure skips the rest.
Each was re-run individually by name to produce this table; none is a
regression.

## What this means for the recorded residual analysis

The Phase 17 note that the File and Settings popup residuals are "concentrated
on each popup's own antialiased outer boundary" was written against a
comparator that was measuring renderer noise as well as production drift. Those
two slices did not move under the fix, so their residuals are real and the
analysis stands for them. The T062 and T064 residuals were noise and are gone.

## Gates

`just fmt-check`, `just lint` (0 errors, the 2 baseline `react-refresh`
warnings), `just typecheck`, `just frontend-build`, `just frontend-test` (74
suites / 466 tests), `just archtest`, `just go-vet`, `just go-test` — all green.
`just gen-check` still fails only on the baseline generator file-mode drift
(100644 → 100755 on three `frontend/wailsjs/runtime/` files, no content change).
