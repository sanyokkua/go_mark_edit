# Baseline — STORY-063

Captured by `just baseline STORY-063`. Do not edit by hand.

| | |
|---|---|
| commit | `fc785fe` (`fc785fe79712fc8545ed2ba33d6ab32ef1aadfa2`) |
| captured | 2026-07-29 13:31 UTC |
| working tree | **dirty — uncommitted changes are part of this baseline** |
| coverage | 69.0% (mean of 11 packages) |

## Gates

`clean` — exit 0. `ok-with-findings` — non-zero, but findings were extracted, so the gate ran.
`UNRELIABLE` — non-zero **and** nothing extracted: the gate did not analyse anything, and a
later diff against it would pass whatever is written.

| gate | command | exit | verdict | findings |
|---|---|---|---|---|
| lint | `just lint` | 0 | clean | 0 |
| test | `just test` | 0 | clean | 0 |
| fmt-check | `just fmt-check` | 0 | clean | 0 |
| typecheck | `just typecheck` | 0 | clean | 0 |
| archtest | `just archtest` | 0 | clean | 0 |
| frontend-build | `just frontend-build` | 0 | clean | 0 |

Raw output for every gate is kept in `story-063.logs/`.

## Failing tests at baseline (0)

*(none)*

## Static-analysis findings at baseline (0)

A finding present here was not caused by this story. A finding absent here was.

*(none)*
