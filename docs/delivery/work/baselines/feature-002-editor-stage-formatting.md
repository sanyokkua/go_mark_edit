# Baseline — 002-editor-stage-formatting

Captured by `just baseline 002-editor-stage-formatting`. Do not edit by hand.

| | |
|---|---|
| commit | `5a1e93d` (`5a1e93de3404ef66f0ab5112d1aa20cd1bbf9af6`) |
| captured | 2026-08-03 21:54 UTC |
| working tree | **dirty — uncommitted changes are part of this baseline** |
| coverage | 65.8% (mean of 11 packages) |

## Gates

`clean` — exit 0. `ok-with-findings` — non-zero, but findings were extracted, so the gate ran.
`UNRELIABLE` — non-zero **and** nothing extracted: the gate did not analyse anything, and a
later diff against it would pass whatever is written.

| gate | command | exit | verdict | findings |
|---|---|---|---|---|
| lint | `just lint` | 0 | clean | 0 |
| test | `just test` | 1 | ok-with-findings | 1 |
| fmt-check | `just fmt-check` | 0 | clean | 0 |
| typecheck | `just typecheck` | 0 | clean | 0 |
| archtest | `just archtest` | 0 | clean | 0 |
| frontend-build | `just frontend-build` | 0 | clean | 0 |

Raw output for every gate is kept in `feature-002-editor-stage-formatting.logs/`.

## Failing tests at baseline (1)

```
TestWailsBindingsRemainTracked
```

## Static-analysis findings at baseline (0)

A finding present here was not caused by this story. A finding absent here was.

*(none)*
