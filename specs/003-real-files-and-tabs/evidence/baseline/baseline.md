# Baseline — 003-real-files-and-tabs

Captured by `just baseline 003-real-files-and-tabs`. Do not edit by hand.

| | |
|---|---|
| commit | `4abb423` (`4abb423a1beeb1a361752e232abba50f4cac19fe`) |
| captured | 2026-08-08 15:55 UTC |
| working tree | clean |
| coverage | 64.9% (mean of 11 packages) |

## Gates

`clean` — exit 0. `ok-with-findings` — non-zero, but findings were extracted, so the gate ran.
`UNRELIABLE` — non-zero **and** nothing extracted: the gate did not analyse anything, and a
later diff against it would pass whatever is written.

| gate | command | exit | verdict | findings |
|---|---|---|---|---|
| lint | `just lint` | 0 | clean | 0 |
| test | `just test` | 1 | ok-with-findings | 3 |
| fmt-check | `just fmt-check` | 0 | clean | 0 |
| typecheck | `just typecheck` | 0 | clean | 0 |
| archtest | `just archtest` | 0 | clean | 0 |
| frontend-build | `just frontend-build` | 0 | clean | 0 |

Raw output for every gate is kept in `baseline.logs/`.

## Failing tests at baseline (3)

```
TestOpenCorruptRecoveryHelperProcess
TestOpenRejectsCorruptOrUnsupportedSchemaSafely
TestOpenRejectsCorruptOrUnsupportedSchemaSafely/EC
```

## Static-analysis findings at baseline (0)

A finding present here was not caused by this story. A finding absent here was.

*(none)*
