# Baseline — 001-gomarkedit-product

Captured by `just baseline 001-gomarkedit-product`. Do not edit by hand.

|              |                                                           |
| ------------ | --------------------------------------------------------- |
| commit       | `011d2b5` (`011d2b55aff5fb95cd61b5c789f5a84472330d1b`)    |
| captured     | 2026-08-03 08:34 UTC                                      |
| working tree | **dirty — uncommitted changes are part of this baseline** |
| coverage     | 65.8% (mean of 11 packages)                               |

## Gates

`clean` — exit 0. `ok-with-findings` — non-zero, but findings were extracted, so the gate ran.
`UNRELIABLE` — non-zero **and** nothing extracted: the gate did not analyse anything, and a
later diff against it would pass whatever is written.

| gate           | command               | exit | verdict | findings |
| -------------- | --------------------- | ---- | ------- | -------- |
| lint           | `just lint`           | 0    | clean   | 0        |
| test           | `just test`           | 0    | clean   | 0        |
| fmt-check      | `just fmt-check`      | 0    | clean   | 0        |
| typecheck      | `just typecheck`      | 0    | clean   | 0        |
| archtest       | `just archtest`       | 0    | clean   | 0        |
| frontend-build | `just frontend-build` | 0    | clean   | 0        |

Raw output for every gate is kept in `feature-001-gomarkedit-product.logs/`.

## Failing tests at baseline (0)

_(none)_

## Static-analysis findings at baseline (0)

A finding present here was not caused by this story. A finding absent here was.

_(none)_
