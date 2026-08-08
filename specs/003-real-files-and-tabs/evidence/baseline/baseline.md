# Baseline — 003-real-files-and-tabs

Captured by `just baseline 003-real-files-and-tabs`. Do not edit by hand.

| | |
|---|---|
| commit | `96edf75` (`96edf75a6261a26ea7c757bc180af592d8dd77ec`) |
| captured | 2026-08-08 15:16 UTC |
| working tree | **dirty — uncommitted changes are part of this baseline** |
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
