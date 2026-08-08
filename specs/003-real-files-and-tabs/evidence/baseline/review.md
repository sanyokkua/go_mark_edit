# Reviewed baseline — Feature 003 (real files and tabs)

Companion to `baseline.md`, which is generated and must not be hand-edited. This note records the
T002 inspection of every gate exit code, raw log, and reliability judgment. Raw output remains
unabridged in `baseline.logs/`; this note does not replace it.

| | |
|---|---|
| capture | `GOCACHE=/private/tmp/gomarkedit-gocache GOLANGCI_LINT_CACHE=/private/tmp/gomarkedit-lint-cache just baseline 003-real-files-and-tabs` |
| commit | `4abb423` (`4abb423a1beeb1a361752e232abba50f4cac19fe`) |
| captured | 2026-08-08 15:55 UTC |
| working tree | clean |
| coverage | 64.9% (mean of 11 packages) |
| verdict | **RELIABLE — safe to build on; baseline test failures retained** |

## Why this baseline is trustworthy

The first unchanged baseline attempt reported golangci-lint exit 5 with no findings because the
local cache loader could not load the Go context. Per the repository rule, that result was treated
as `UNRELIABLE`, its generated evidence was discarded, and the unchanged official gate was rerun
with usable local Go and golangci-lint caches. The corrected capture has no `UNRELIABLE` gate.

| gate | exit | verdict | inspected evidence |
|---|---:|---|---|
| `frontend-build` | 0 | clean | Vite emitted real chunks and the production network guard reported `ok` |
| `fmt-check` | 0 | clean | Go format check was empty and Prettier reported all files matched |
| `typecheck` | 0 | clean | `tsc --noEmit` completed with no diagnostics |
| `lint` | 0 | clean | golangci-lint printed `0 issues.` and ESLint ran to completion |
| `test` | 1 | ok-with-findings | Go race tests ran and three parsed failures were retained below |
| `archtest` | 0 | clean | Go architecture, CGO-free build, migration, and frontend checks ran and passed |
| `coverage` | 0 | n/a | All 11 packages reported coverage percentages in `coverage.log` |

`baseline.logs/*.code` was inspected for all seven gates. Every corresponding raw `.log` was
inspected; no gate is unreliable. Architecture is green outright and was not baseline-diffed.

## Baseline failures retained

The test gate is red but reliable: it parsed these pre-existing corrupt-database recovery failures:

- `TestOpenCorruptRecoveryHelperProcess`
- `TestOpenRejectsCorruptOrUnsupportedSchemaSafely`
- `TestOpenRejectsCorruptOrUnsupportedSchemaSafely/EC`

The helper reports a SQLite disk I/O error while opening the replacement database. No Feature 003
source, test, retry, threshold, or quality configuration was changed to hide or reinterpret this
finding. A new failure absent from `baseline.failing-tests` is attributable to Feature 003.

## Caveats

1. `archtest.log` includes a sandbox-only Go module-cache stat-cache warning during the CGO-free
   build, but the command exit was 0 and every architecture subcheck passed.
2. `internal/db/store` reports 0.0% coverage and has no tests because it is generated code.
3. Coverage is a mean of 11 packages; the per-package values remain in `coverage.log`.

## Inspection result

The baseline is suitable for implementation. Its captured red test findings are preserved in the
generated report and raw logs, and no source was changed during capture.

`just verify 003-real-files-and-tabs` may now be diffed against this baseline, and Feature 003
implementation (T003 onward) may begin. The three listed SQLite failures remain baseline findings.
