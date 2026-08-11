# Baseline — 003-real-files-and-tabs

Captured by `just baseline 003-real-files-and-tabs`. Do not edit by hand.

| | |
|---|---|
| commit | `7744cc8` (`7744cc824388e3685c434948822d6e32e6b2edea`) |
| captured | 2026-08-09 12:27 UTC |
| working tree | **dirty — uncommitted changes are part of this baseline** |
| coverage | 63.7% (mean of 11 packages) |

## Gates

`clean` — exit 0. `ok-with-findings` — non-zero, but findings were extracted, so the gate ran.
`UNRELIABLE` — non-zero **and** nothing extracted: the gate did not analyse anything, and a
later diff against it would pass whatever is written.

| gate | command | exit | verdict | findings |
|---|---|---|---|---|
| lint | `just lint` | 0 | clean | 2 |
| test | `just test` | 0 | clean | 0 |
| fmt-check | `just fmt-check` | 1 | failing | 0 |
| typecheck | `just typecheck` | 0 | clean | 0 |
| archtest | `just archtest` | 0 | clean | 0 |
| frontend-build | `just frontend-build` | 0 | clean | 0 |

Raw output for every gate is kept in `baseline.logs/`.

## Failing tests at baseline (0)

*(none)*

## Static-analysis findings at baseline (2)

A finding present here was not caused by this story. A finding absent here was.

```
/Users/ok/Development/GitHub/go_mark_edit/frontend/src/ui/widgets/DocumentIdentity.tsx:react-refresh/only-export-components:warning
/Users/ok/Development/GitHub/go_mark_edit/frontend/src/ui/widgets/Launcher.tsx:react-refresh/only-export-components:warning
```
