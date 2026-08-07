# Reviewed baseline — Feature 003 (real files and tabs)

Companion to `baseline.md`, which is generated and must not be hand-edited. This note records the
**inspection** required by task T002: every gate's exit code, every raw log, and the judgment about
whether each gate actually analysed anything. Raw output is retained unabridged in `baseline.logs/`;
nothing here replaces it.

| | |
|---|---|
| capture | `just baseline 003-real-files-and-tabs` |
| commit | `216bcf7` (`216bcf7c3f60b106787d3a594503736d5550125f`) |
| captured | 2026-08-07 21:15 UTC |
| working tree | clean |
| coverage | 65.5% (mean of 11 packages) |
| verdict | **RELIABLE — safe to build on** |

## Why this baseline is trustworthy

Every gate exited 0, so no gate is `UNRELIABLE` by the definition in `baseline.sh` (non-zero exit
with nothing parsed). But exit 0 with zero findings has a mirror-image failure mode: a gate that
analysed nothing also reports zero. Each log was therefore read for positive evidence that the gate
did work, not merely that it did not fail.

| gate | exit | verdict | positive evidence that it analysed something |
|---|---|---|---|
| `frontend-build` | 0 | clean | Vite build emitted real chunks (`monacoSetup-*.js`, 2,294 kB); `postbuild` ran `check-production-network.mjs` → `production network guard: ok` |
| `fmt-check` | 0 | clean | `gofmt -l $(git ls-files '*.go')` produced no output; Prettier reported `All matched files use Prettier code style!` (it enumerated files rather than matching none) |
| `typecheck` | 0 | clean | `tsc --noEmit` ran to completion with no diagnostics |
| `lint` | 0 | clean | `golangci-lint run ./...` printed **`0 issues.`** — an explicit count, so the linter loaded and analysed packages; `eslint .` ran with no output |
| `test` | 0 | clean | 10 Go packages `ok`; `node --test` reported `tests 10 / pass 10 / fail 0`; Jest reported **54 suites, 262 tests, all passed** |
| `archtest` | 0 | clean | `TestArchitecture` across `./internal/... .`, plus `CGO_ENABLED=0 go build ./...`, `migrations: no committed file modified in place`, and frontend `archtest.mjs` running boundaries, colour literals and offline-production-sources checks → `archtest (frontend): ok` |
| `coverage` | 0 | n/a | 11 packages each reported a real percentage (74.1 / 68.9 / 74.6 / 83.3 / 65.1 / 81.2 / 100.0 / 69.4 / 74.5 / 28.9 / 0.0) |

`archtest` is green **outright**, as required — it is never diffed against a baseline.

Failing tests at baseline: **0**. Static-analysis findings at baseline: **0**. Both sets are
genuinely empty rather than unparsed, per the evidence above. Any finding or failing test that
appears during Feature 003 is therefore attributable to Feature 003.

## Caveats a later reader should know

These do not make the baseline unreliable, but they bound what it proves.

1. **Go test caching.** `apperr`, `bootstrap`, `db`, `file`, `gate`, `logging` and `settings`
   reported `(cached)` in `test.log`, and most packages reported `(cached)` in `coverage.log`. Go's
   cache is keyed on source and build inputs, so the results are valid for this commit, but they were
   not re-executed during this capture. `archtest` used `-count=1` and did re-execute.
2. **Where the Go architecture assertions live.** In `archtest.log` most packages report
   `[no tests to run]`; `TestArchitecture` is concentrated in `internal/apperr` and the root package.
   The frontend `archtest.mjs` carries the boundary, colour-literal and offline checks. The gate is
   meaningful, but "archtest green" does not mean every Go package holds its own architecture test.
3. **`internal/db/store` reports 0.0% coverage** and `[no test files]`. It is sqlc-generated code
   that is regenerated rather than hand-edited, so this is expected, not a gap Feature 003 introduces.
4. **Coverage is a mean of 11 packages**, not a weighted line-coverage figure. The root package sits
   at 28.9%, which pulls the mean down; treat the per-package numbers in `coverage.log` as the real
   signal.

## Defects found and fixed during this inspection

### 1. Coverage evidence was never committed

`.gitignore` carried a blanket `coverage.*` rule intended for Go coverage profiles
(`coverage.out`, `coverage.html`). It also matched `baseline.logs/coverage.log` and
`baseline.logs/coverage.code`, so **every baseline ever captured committed six of its seven gates
and silently dropped the seventh.** `story-063`, `feature-001-gomarkedit-product` and
`feature-002-editor-stage-formatting` each have those two files on disk and untracked.

Constitution VII requires every gate's exit code and raw output to be captured, so this baseline was
incomplete as first committed. Fixed by narrowly negating the rule for `baseline.logs/coverage.log`
and `baseline.logs/coverage.code` only; `coverage.out` and other stray `coverage.*` artefacts remain
ignored. `scripts/baseline_verify_test.sh` gained the `every gate log is committable` case, which
probes the ignore rules with `git check-ignore --no-index` — without `--no-index` the assertion would
pass merely because the files are already tracked, and could never fail.

The historical baselines were **not** back-filled. Their coverage logs sit on disk untracked, but
there is no way to prove those files are the originals from those captures rather than output from a
later re-run, and committing them would assert a provenance that cannot be verified.

### 2. Working-tree provenance was always "dirty"

`baseline.md` from the first capture attempt recorded
`working tree | **dirty — uncommitted changes are part of this baseline**` even though the checkout
was clean. Cause: `baseline.sh` created its own report, logs and exit file **before** running
`git status --porcelain`, and those outputs are untracked the instant they exist. Every historical
baseline carries the same false verdict — `story-063`, `feature-001-gomarkedit-product` and
`feature-002-editor-stage-formatting` all say "dirty".

A provenance field that always reports the same value records nothing, and specifically cannot
distinguish a contaminated capture from a clean one. Fixed in commit `216bcf7` by sampling the tree
before creating output, with an ordering assertion in `scripts/baseline_verify_test.sh`
(`dirty-state provenance`) so it cannot regress. This baseline was then re-captured from a verified
clean tree, which is why it reads `clean`.

The historical baselines were left untouched: they are immutable evidence of past captures, and
rewriting them would be exactly the silent history edit the workflow forbids.

## Files in this directory

| file | contents |
|---|---|
| `baseline.md` | generated report — commit, timestamp, provenance, gate table, failing tests, findings |
| `baseline.exit` | one `gate=code=verdict=count` line per classified gate |
| `baseline.commit` | full commit SHA the capture was taken at |
| `baseline.failing-tests` | fully-qualified names of failing tests (empty) |
| `baseline.findings` | static-analysis findings as `file:rule:message` (empty) |
| `baseline.logs/*.log` | unabridged raw output for all seven gates, coverage included |
| `baseline.logs/*.code` | exit code for all seven gates, coverage included |

## What this authorises

`just verify 003-real-files-and-tabs` may now be diffed against this baseline, and Feature 003
implementation (T003 onward) may begin. A new finding or failing test that is absent here was
introduced by this feature.
