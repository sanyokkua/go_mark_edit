# The T035 matrix, after the setup and determinism repairs

**Command**: `npx playwright test e2e/real-files-parity.test.ts --reporter=list`
**Duration**: 49.1 minutes (was 40.7; the settle steps cost the difference).
**Result**: `1 failed, 2 passed`. T050 and T057 pass; T035 fails.

**This is the first run whose comparison-level numbers are trustworthy.** The
previous run's are superseded: 31% of its captures were non-deterministic, so an
unknown share of its pixel figures were not measurements. See
`t035-run-2026-08-14.md` for that measurement and why it was taken.

## Accounting

| | Planned | Attempted | Ready | Completed | Passed | Failed | Unresolved |
|---|---:|---:|---:|---:|---:|---:|---:|
| **Pixel comparison** | 1,530 | 1,530 | 1,530 | 1,512 | **0** | 1,512 | 18 |
| **Behaviour verification** | 108 | 108 | 108 | — | **108** | **0** | — |
| **Total** | 1,638 | 1,638 | | | | | |

546 logical keys = 510 pixel-compared + 36 behaviour-verified.

## The two repairs both worked completely

**Setup failures: 270 → 0.** `actualReady` went **1,368 → 1,530**. Every case now
reaches either a comparison or an explicit unresolved contract. The 18 that
remain unresolved are `prompt-normalization`, which has no source-backed
reference condition in the immutable mockup and is correctly reported rather
than passed.

**Capture determinism: 138 unstable keys → 0.**

| | Reference | Actual |
|---|---:|---:|
| captures | 1,512 | 1,512 |
| needed settling | **0** | **0** |
| saw more than one raster | **0** | **0** |
| max attempts | 3 | 3 |
| max settle | 1,122 ms | 938 ms |

`unstableLogicalKeys: 0`. Every key produced one hash across all three
repetitions, which is what FR-FT-054 requires and what the previous run could
not do for 138 keys.

Behaviour verification is clean end to end: **108 of 108 verified, 0 failed.**

### One inefficiency, not a defect

The per-key preparation settle reports `settled: 492`, with 12 in
`neverSettled` — `tab-dirty` and `tab-autosave-in-flight` across the six
palettes. Those are the two states that type into the editor and start Monaco's
caret blinking. **Their captures were nonetheless stable**, because the caret is
now frozen in `PARITY_FREEZE_STYLE` as FR-FT-054 requires; the preparation
settle simply cannot prove quiet within its window and times out. It costs about
6 seconds per key and changes no result. Lowering `consecutive` for the
preparation step, or skipping it where the capture settle already succeeds,
would recover roughly 72 seconds of a 49-minute run — not worth doing before the
drift below is addressed.

## Where the 1,512 failures are, on trustworthy numbers

| Cases | Cause |
|---:|---|
| 1,080 | pixel drift only — every compared style matched, pixels did not |
| 432 | Feature 002 editor-region computed styles (8 properties, handed forward by clarification) |

Pixel distribution across the 1,512:

| Threshold | Under it |
|---|---:|
| 200 px | **36** |
| 1,000 | 117 |
| 5,000 | 240 |
| 20,000 | 348 |
| 100,000 | 729 |

Minimum 165, median **104,781**, maximum 760,837.

The median rose against the previous run (77,061 → 104,781) because 162
previously-unreachable cases now complete, and those are the harder ones — the
settings screens that never opened before. That is a larger denominator of real
measurements, not a regression.

## What this establishes

**The drift is real.** With the determinism confound removed and every compared
computed style matching on 1,080 of the failures, what remains is genuine
unconverged surface rather than noise. The earlier caution — that an unknown
share of the drift might be capture instability — is resolved, and resolved
against the optimistic reading.

**Feature 002 is not the main obstacle.** It accounts for 432 of 1,638. Even
resolving it entirely leaves 1,080 comparisons failing on their own pixels.

**36 cases are within 200 pixels** and 117 within 1,000 — a small converged
core, consistent with the targeted slices (T058–T064) having converged the
menubar, File, Settings, View, About, tabs, toolbar, editor/status and paused
preview. The prompt, launcher, conflict and preview state families were never
targeted-converged, and they are where the large figures sit.

## The next measurement

Unchanged from the previous run and now unblocked: **the per-pixel maximum
channel delta** for the large-figure states. A whole-region difference at a
small delta is compositing, attributable under the 2026-08-13 clarification; the
same count at a large delta is drawing. The targeted runner records this and the
unrestricted runner does not. Adding it would separate "attributable
compositing" from "genuine drift" across the whole matrix in one run, and it is
the cheapest next step by a wide margin — it changes no production code and
decides where the remaining effort should go.
