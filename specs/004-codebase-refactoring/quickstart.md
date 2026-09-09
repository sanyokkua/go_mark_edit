# Quickstart: validating Feature 004 end to end

**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | Contracts: [contracts/](contracts/)

These are the runnable checks that prove the feature; each names its requirement and the expected
outcome. Commands assume the repository root. Nothing here needs a network except the one-time
dependency install.

## 0. Prerequisites

- macOS (development host) or Ubuntu 24.04 with `libgtk-3-dev libwebkit2gtk-4.1-dev`.
- Go (per `go.mod`), Node (per `.nvmrc`), `just` optional.
- `scripts/build setup` — installs the Wails CLI at the `go.mod` version, golangci-lint, shfmt, npm
  dependencies from the lockfile, the git hooks; add `--with-browser` for the E2E stage.

## 1. Unit stage from a cold checkout (FR-024, SC-004)

```bash
rm -rf frontend/dist/assets frontend/dist/index.html; scripts/test unit
```

Expected: passes with no native toolchain and no `frontend/dist`; no test file is found under
`frontend/src`, `frontend/public` or a Go production package except the three white-box files listed
in plan.md; the run makes no network call (verify with `nettop`/`lsof -i` while it runs).

## 2. The six stages (FR-060, FR-062, SC-006)

```bash
time scripts/verify
```

Expected: six lines Lint, Format, Build, Unit, Integration, E2E each `ok`; every tool appears once in
`.specify/baseline/runs/<run-id>/summary.json`; the wall-clock time is recorded in plan.md at close.

```bash
scripts/verify lint; scripts/verify --skip e2e
```

Expected: only the Lint stage runs; the second form runs five stages and prints `e2e: skipped`.

## 3. Format coverage (FR-063)

```bash
scripts/format --check
```

Expected: exit 0 on a formatted tree; after touching the formatting of one file of each type
(`.md`, `.yml`, `.json`, `.css`, `.ts`, `.go`, `.sh`, `.sql`) the check exits 1 naming that file;
the ignore list is exactly the root `.prettierignore`.

## 4. Baseline and comparison (FR-064)

```bash
scripts/baseline            # right after the scripts task, before any other edit
scripts/baseline --compare  # at close
```

Expected: `.specify/baseline/004-codebase-refactoring.json` validates against
`contracts/baseline-record.schema.json`; a missing record or input makes `--compare` fail closed
(non-zero, naming the input); at close every recorded finding is gone and nothing new appears (one
sentence in plan.md).

## 5. Build leaves the tree clean (FR-065, FR-068)

```bash
scripts/build && git status --porcelain && echo CLEAN
scripts/build --version 9.9.9 && /usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' build/bin/GoMarkEdit.app/Contents/Info.plist
```

Expected: `CLEAN` with no paths listed; `9.9.9`; a build without `--version` reports `dev` in About.

```bash
env PATH=/usr/bin:/bin scripts/build; echo "exit=$?"
```

Expected (FR-071): a non-zero exit and a message naming `wails` as the missing tool, nothing built.

## 6. Real-backend E2E (FR-025, FR-026, SC-002)

```bash
scripts/test e2e
```

Expected: a `wails dev` child process starts with `HOME`/`XDG_CONFIG_HOME` under a temporary
directory; `ps` shows one Go process per run; the eight cases of
[contracts/e2e-harness.md](contracts/e2e-harness.md) run once each with zero retries; the seeded
Recents entries open the temporary files; assertions read bytes on disk and state after restart.

## 7. Archived-tree regression runs (FR-031, SC-001)

```bash
git worktree add ../gme-archive archive/v1-linear-history-2026-09
# Go: copy the throwaway test into the worktree package and run it there
(cd ../gme-archive && go test -race -run TestAudit… ./internal/appmodel/)
# UI: run the new E2E case against the worktree's wails dev (E2E_REPO is defined in contracts/e2e-harness.md)
E2E_REPO=../gme-archive scripts/test e2e -- --grep "<case title>"
```

Expected: each Story 1 regression fails on the worktree and passes on this tree; the failure is
recorded in plan.md's table (date, commit `bc185c9`, host, observed failure).

## 8. Lint enforces the boundaries (FR-047, FR-069, SC-005, SC-008, SC-009)

```bash
scripts/verify lint
```

Try, then revert, each of: an import of `logic/store` from `ui/components`; a `createPortal` outside
`ui/components/Popup`; a `[data-theme]` selector in a widget stylesheet; a `T123` comment in
`internal/appmodel`; a `.only` in a test. Expected: each fails the Lint stage naming the file.

## 9. Instruction files (FR-072, FR-076, SC-011)

Start a fresh agent session with only `AGENTS.md`, `CLAUDE.md`, `README.md` and
`docs/architecture.md`; ask it to run the six stages and to change the popup radius token. Expected:
it finds `scripts/verify` and the Popup consumer inventory without asking; `scripts/verify lint`
(rule L25) reports every referenced path as existing.

## 10. Repository size (FR-082, SC-012)

```bash
git ls-files | grep -cE 'evidence/|surface/.*\.png$|^test-results/|^frontend/evidence|^cmd/native-evidence|^frontend/public/.*\.test\.|^frontend/src/dev/|^frontend/e2e/|^frontend/scripts/archtest|^sqlc\.yaml$|^internal/gate/|^internal/db/(store|queries)/'
git ls-files -z | xargs -0 du -ch | tail -1
```

Expected: `0`; the total is about 56 MB smaller than at `2b889cb` (65 MB → ≈ 9 MB).

## 11. Walkthrough and offline start (FR-027, FR-028, SC-003)

Build locally (`scripts/build`), disable networking (Wi-Fi off, Ethernet unplugged), and follow the
fifteen steps listed in `docs/architecture.md` (verification section). Record one sentence each in
plan.md: the walkthrough (date, commit, host, outcome) and the cold start with networking disabled
(no outbound connection attempted — `nettop` shows none for the process).

## 12. Release dry run (FR-067, SC-015)

```bash
gh workflow run release.yml -f version=9.9.9 --ref feature/004-codebase-refactoring
```

Expected: the macOS job runs all six stages and uploads `GoMarkEdit-9.9.9-macos-arm64.zip` as a
workflow artifact; no GitHub Release is created; the unzipped app's About dialog reports `9.9.9`.
