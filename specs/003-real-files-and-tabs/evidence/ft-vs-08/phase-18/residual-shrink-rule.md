# T085 — the shrink rule, and what it measured

**Requirement**: the 2026-08-13 clarification on what a parity check means, as
extended by the 2026-08-14 clarification recorded in `spec.md`.
**Measured**: 2026-08-14.

## The hole it closes

`attributeDifferences` already failed a term that grew beyond its recorded
`measuredPixels`. A term that **shrank** passed silently, and that is a hiding
place: a term recorded at 416 pixels that now needs 100 leaves **316 pixels of
room** for new drift to sit inside, fully attributed, reported as a pass.

Growth and shrinkage are the same defect seen from two sides — the recorded
number no longer describes the difference. Only one direction was enforced.

## The rule

Two failures, in `frontend/e2e/parity/attributed.ts`:

1. **A term that closed entirely** (`pixels === 0`, `measuredPixels > 0`) fails
   and says to remove the entry. A term contributing nothing is not a smaller
   difference; it is a dead licence.
2. **A term below its shrink floor** fails and names the gap it left.

```
shrinkFloorFor(m) = m - max(RESIDUAL_SHRINK_GRACE_PIXELS, ceil(m * RESIDUAL_SHRINK_RATIO))
RESIDUAL_SHRINK_RATIO        = 0.25
RESIDUAL_SHRINK_GRACE_PIXELS = 8
```

The band is the **larger** of the two on purpose. The ratio governs real terms —
416 → floor 312, so the 100-pixel case above fires and the ceiling gets
tightened. The flat grace governs small terms, so the declared two-pixel arcs
(`settings-isolated-pair-upper`, `line-numbers-toggle-edge`) cannot fire when a
corner quantises one step differently. `shrinkFloorFor(2)` is negative, which is
the intended outcome: for a term that size only rule 1 can fire.

Worst case the band still allows: a quarter of a term's recorded size. For the
largest declared term (`glass-backdrop-compositing`, 6,186) that is 1,547
pixels — but that term is `sub-perceptual` with a measured maximum channel delta
of 7, so what could hide inside it is bounded by the delta cap as well as the
count.

## What it measured against the declared ceilings

`npx playwright test e2e/targeted-parity.test.ts` — **15 passed, 0 failed**
(20.3s), with the rule active.

| Slice key                                      | Declared terms | Fired |
| ---------------------------------------------- | -------------: | ----- |
| `targeted:file-menu:1280:minimal-light`        |              1 | no    |
| `targeted:settings-menu:1280:minimal-light`    |              4 | no    |
| `targeted:settings-overflow:375:minimal-light` |              1 | no    |
| `targeted:view-menu:1280:minimal-light`        |              2 | no    |
| `targeted:about-menu:1280:minimal-light`       |              1 | no    |
| `targeted:closed-menubar:1280:glass-light`     |              1 | no    |
| `targeted:closed-menubar:1280:glass-dark`      |              1 | no    |
| `targeted:toolbar:1280:minimal-light`          |              1 | no    |

**No ceiling in `attributed-residuals.ts` needed tightening.** Every declared
term still reports within its band, which is the expected result for numbers
measured three days earlier on the same renderer — and it means the rule was
added without moving any recorded measurement, so the two changes stay
separable if either is ever questioned.

## Coverage

`frontend/e2e/parity/attributed.test.ts`, 9 cases under Jest — the floor
arithmetic in both regimes, a term at its recorded size, growth still failing,
a shrink inside the band passing, a shrink below the floor failing with the gap
named, a closed term failing, a two-pixel term losing one to quantisation NOT
failing, growth reported in preference to shrinkage, and an unattributed pixel
still failing independently of all of it.
