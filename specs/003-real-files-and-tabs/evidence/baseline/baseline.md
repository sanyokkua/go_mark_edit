# Baseline — 003-real-files-and-tabs

Captured by `just baseline 003-real-files-and-tabs`. Do not edit by hand.

| | |
|---|---|
| commit | `216bcf7` (`216bcf7c3f60b106787d3a594503736d5550125f`) |
| captured | 2026-08-07 21:15 UTC |
| working tree | clean |
| coverage | 65.5% (mean of 11 packages) |

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

Raw output for every gate is kept in `baseline.logs/`.

## Failing tests at baseline (0)

*(none)*

## Static-analysis findings at baseline (0)

A finding present here was not caused by this story. A finding absent here was.

*(none)*
