# Contract: the five entry-point scripts

Requirements: FR-060 to FR-065, FR-070, FR-071. Every hook, CI job and `just` alias calls these five
scripts and nothing else. All are bash, `set -euo pipefail`, mode `755`, no file extension, and
source `scripts/lib/common.sh` (toolchain table, logging, repository root, format ignore globs) and
`scripts/lib/stages.sh` (the stage graph and the per-tier runner lists). Tool reports are turned
into stage records, concise terminal summaries and the baseline record/comparison by
`tools/verify/results.mjs`.
Every script prints its usage on `-h`/`--help`; every failure exits non-zero with a message naming
the cause (a missing tool, a failed stage, a dirty tree, a missing baseline input).

Every stage prints a header, keeps human-readable command output visible while it runs, and
preserves the wrapped command's exit code. Structured stdout/stderr reports from golangci-lint,
ESLint, Stylelint and Go test are captured as raw files, then parsed into concise summaries and
actionable diagnostics; machine-readable JSON is not dumped into the normal terminal output. Unit
and Integration print separate `Backend` and `Frontend` test-count lines; E2E prints its
frontend/browser count. Counts contain total, passed, failed, skipped and todo values. A count that
cannot be parsed is `unavailable` or `unreliable`, never zero. Warning counts do not fail a stage;
missing or malformed required reports make the stage unreliable. Verification artifacts, including
raw reports and normalized summaries, are temporary and live under
`.local_tmp_files/runs/<run-id>/`.

## `scripts/build [--version X.Y.Z] | setup | dev`

| Form                  | Does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/build`       | check the toolchain (fails naming the missing tool: `wails`, `go`, `node`, `npm`, GTK/WebKit headers on Linux) → `wails generate module` → `node frontend/scripts/generate-editor-themes.mjs` → `wails build` (with `-ldflags -X …/internal/bootstrap.version=<v>` when given; `-tags webkit2_41` on Linux) → restore tracked modes of `frontend/wailsjs/**` → on macOS with `--version`, `plutil -replace` both bundle version keys → bundle scan (lint L27) → assert `git status --porcelain` is empty (fails listing the paths). `wails build` runs the frontend's `npm run build`, which is `vite build` alone: the type check belongs to the Lint stage, so `tsc` runs once per verify (FR-062) |
| `scripts/build setup` | `go mod download`; `go install github.com/wailsapp/wails/v2/cmd/wails@<go.mod version>`; `go install` golangci-lint and shfmt at the pinned versions; `npm ci --prefix frontend`; `npx playwright install chromium` when `--with-browser`; `lefthook install`                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `scripts/build dev`   | `wails dev` (foreground)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

The build never dirties the tree: bindings are generated before the build, and the `runtime/*` mode
churn is normalised from `git ls-files -s` (R14). A build without `--version` reports `dev`.

## `scripts/test <unit|integration|e2e|all>`

| Tier          | Runs                                                                                                                                                                                                      | Fails when                                                                  |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `unit`        | `go test -race -json ./tests/go/unit/...`; `frontend/node_modules/.bin/jest --ci --json --config frontend/jest.config.mjs --selectProjects unit`                                                          | any failure; a package list that ran zero tests; Jest collecting zero tests |
| `integration` | `go test -race -json ./tests/go/integration/... ./internal/...` (the three in-package white-box tests use real files, so they run here); `frontend/node_modules/.bin/jest … --selectProjects integration` | same                                                                        |
| `e2e`         | `frontend/node_modules/.bin/playwright test --config frontend/playwright.config.ts` (harness in [e2e-harness.md](e2e-harness.md))                                                                         | any failure (no retry); "No tests found"                                    |
| `all`         | the three tiers in order                                                                                                                                                                                  | first failing tier                                                          |

Needs: `unit` needs only Go and Node with dependencies installed — no `frontend/dist`, no native
toolchain, no network (FR-024). `integration` additionally writes under `t.TempDir()`/`os.tmpdir()`.
`e2e` needs the Wails toolchain and a usable screen.

Results: one JSON per runner under `.local_tmp_files/runs/<run-id>/` (ignored) in the schema of
[baseline-record.schema.json](baseline-record.schema.json) `stages[].findings`, written by
`tools/verify/results.mjs`. Raw structured reports are kept below the run's `reports/` directory;
the report command also writes a normalized `<tool>.summary.json` beside each raw report. Until G7
relocates the tests, `scripts/lib/stages.sh` maps the tiers onto the existing layout (unit = `go test ./...` + the current Jest config; integration = the Jest
`*.integration.test.tsx` suites; e2e = the current Playwright suite) so the baseline collects on
every stage; from G3 on the unit and integration tiers also collect the new roots (`tests/go/**`,
`frontend/tests/**`) beside the existing layout, and G7 drops the old half. The interim Lint list
is golangci-lint, `tsc` per existing tsconfig, ESLint and `frontend/scripts/archtest.mjs`, each
replaced when its G7 owner lands (the ten commands of the table below are the final list).

## `scripts/verify [<stage>] [--skip e2e]`

Runs the six stages in this order and stops at the first failure:

| #   | Stage        | Command                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Lint         | `golangci-lint run ./...`, `go run ./tools/archlint`, `CGO_ENABLED=0 go build ./internal/... ./tools/...` (L26), `frontend/node_modules/.bin/tsc --noEmit -p frontend/tsconfig.json`, `frontend/node_modules/.bin/tsc --noEmit -p frontend/tsconfig.test.json`, `frontend/node_modules/.bin/tsc --noEmit -p frontend/tsconfig.node.json`, `frontend/node_modules/.bin/eslint frontend tools --format json`, `frontend/node_modules/.bin/stylelint "frontend/src/**/*.css" -f json`, `node tools/lint/tokens.mjs`, `node tools/lint/repo-rules.mjs`; the structured lint reports are summarized by `results.mjs` |
| 2   | Format check | `scripts/format --check`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 3   | Build        | `scripts/build`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 4   | Unit         | `scripts/test unit`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 5   | Integration  | `scripts/test integration`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 6   | E2E          | `scripts/test e2e` (skipped by `--skip e2e`, recorded as `skipped`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

`scripts/verify <stage>` accepts `lint`, `format`, `build`, `unit`, `integration`, `e2e` and runs that
stage alone. Each tool runs at most once per invocation; the frontend is built once (by `wails build`
in stage 3); no `go build` runs inside `go test`. The run's duration, every stage's exit code and
the backend/frontend test counts are written to `.local_tmp_files/runs/<run-id>/summary.json` and
printed as a human-readable stage table. A failed run prints the failure and marks later stages
`NOT RUN`; `--skip e2e` prints `SKIPPED`, never `PASS`. `scripts/verify` never creates or compares
a baseline.

The report helper used by the stage runner is:

```text
node tools/verify/results.mjs report \
  --tool <golangci-lint|eslint|stylelint|go-test> \
  --input <raw-report> \
  --output <normalized-report> \
  --exit-code <command-exit-code>
```

It writes the normalized status, warning/error counts, test counts where applicable and actionable
findings to the output file, prints the concise human summary, and preserves a non-zero tool exit.
An invalid or missing required report is `UNAVAILABLE`/`UNRELIABLE` and makes a successful command
fail closed.

## `scripts/format [--check]`

| Owner                                                | Files                                                                                                                             |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `gofmt`                                              | every tracked `*.go`                                                                                                              |
| Prettier (root config, pinned `prettier-plugin-sql`) | `md`, `yml`, `yaml`, `json`, `css`, `ts`, `tsx`, `js`, `mjs`, `cjs`, `html`, `svg`, `sql`                                         |
| `shfmt -i 2 -ci`                                     | `scripts/build`, `scripts/test`, `scripts/verify`, `scripts/format`, `scripts/baseline`, `scripts/lib/*.sh`, every tracked `*.sh` |

Ignore list (the only exclusions, documented in `.prettierignore` and `scripts/lib/common.sh`):
`.specify/**`, `.claude/skills/speckit-*/**`, `.agents/skills/speckit-*/**`, `frontend/wailsjs/**`,
`frontend/dist/**`, `build/bin/**`, `**/node_modules/**`, `specs/*/evidence/**`, `package-lock.json`,
`go.sum`, and the `justfile` (planning decision 4). Evidence directories are disposable generated
artifacts and are not recreated by verification. `--check` exits `1` listing every file that would
change; without it the files are rewritten.

## `scripts/baseline [--compare]`

| Form                         | Does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/baseline`           | runs the six stages through the same runner as `scripts/verify` (E2E included), records the commit, the SHA-256 of `git diff HEAD` plus untracked file list, tool versions, per-stage exit code, duration, verdict, test counts and finding identities into `.local_tmp_files/baseline/<feature>.json` (`<feature>` from `.specify/feature.json`); exits `0` when the capture is trustworthy even if stages are red; fails when any stage is `unreliable` or a required test count is unavailable/unreliable (the record is not written) |
| `scripts/baseline --compare` | re-runs the six stages, loads the record, fails closed when the record or any of its required fields is missing, and prints per stage: findings gone, findings new, findings remaining; exits `0` only when no finding remains and nothing new appeared and no stage regressed. This is the only baseline operation.                                                                                                                                                                                                                     |

Run by instruction only (never by a hook or CI). In this feature: the scripts land first, then
`scripts/baseline` runs before any other implementation edit; the closing `--compare` result is
recorded as one sentence in [plan.md](../plan.md).

## `just` aliases (the whole `justfile`)

```
build:            scripts/build
test *args:       scripts/test {{args}}
verify *args:     scripts/verify {{args}}
format *args:     scripts/format {{args}}
baseline *args:   scripts/baseline {{args}}
dev:              scripts/build dev
setup:            scripts/build setup
```

## Hooks (`lefthook.yml`, the whole file)

```
pre-commit:  scripts/format --check
pre-push:    scripts/verify
```

## Toolchain declaration (FR-070)

| Tool                                                   | Declared in                                                        | Read by                                                                                 |
| ------------------------------------------------------ | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Go                                                     | `go.mod` (`go 1.25.7`)                                             | `scripts/lib/common.sh`, `actions/setup-go` (`go-version-file`)                         |
| Wails CLI                                              | `go.mod` requirement of `github.com/wailsapp/wails/v2` (`v2.15.0`) | `scripts/build setup` (`go list -m`), CI via the same script                            |
| Node                                                   | `.nvmrc` (`24`)                                                    | `scripts/lib/common.sh` (warns on mismatch), `actions/setup-node` (`node-version-file`) |
| npm packages                                           | `frontend/package-lock.json` (`npm ci`)                            | `scripts/build setup`                                                                   |
| golangci-lint, shfmt                                   | one version table in `scripts/lib/common.sh`                       | `scripts/build setup`, `scripts/verify lint`, `scripts/format`                          |
| Prettier, plugins, stylelint, ESLint, Jest, Playwright | `frontend/package.json` devDependencies (lockfile)                 | the scripts through `frontend/node_modules/.bin`                                        |
