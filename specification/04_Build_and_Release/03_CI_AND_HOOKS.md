**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester
**Last Updated:** 2026-07-10
**Cross-references:** `CLAUDE.md` (Commands), `00_Foundation/04_DESIGN_DECISIONS.md` (DD-32, DD-33, DD-37), `../../docs/stories/README.md`, `04_Build_and_Release/01_BUILD_MATRIX.md`, `04_Build_and_Release/02_PACKAGING_AND_ASSOCIATIONS.md`, `05_Dependencies/*`

# CI and Hooks

The toolchain that keeps GoMarkEdit buildable and correct: the `justfile` command taxonomy, the local
git hooks (Lefthook), the CI gate set, and the GitHub Actions build/release matrix. How work itself is
tracked is §6. The full rigour described here is the **target** — DD-37 stages it in over the phases
(`07_Phases/00_ROADMAP.md`), so the earliest scaffolding stories are not blocked by the full gate set,
but every gate below is in scope by Phase 07.

## Table of Contents

1. [justfile command taxonomy](#1-justfile-command-taxonomy)
2. [Git hooks (Lefthook)](#2-git-hooks-lefthook)
3. [Ordering: why frontend builds before Go](#3-ordering-why-frontend-builds-before-go)
4. [CI gate set](#4-ci-gate-set)
5. [GitHub Actions build & release matrix](#5-github-actions-build--release-matrix)
6. [How work is tracked](#6-how-work-is-tracked)
7. [Example lefthook.yml](#7-example-lefthookyml)
8. [Example .golangci.yml](#8-example-golangciyml)
9. [Example justfile](#9-example-justfile)

## 1. justfile command taxonomy

The canonical developer entry points mirror `CLAUDE.md` § Commands. `just` is the task runner; every
command is a thin wrapper so CI, hooks, and humans invoke identical logic.

| Command | Does | Notes |
|---|---|---|
| `just setup` | Install Go + frontend deps; install git hooks (`lefthook install`) | One-time bootstrap. |
| `just dev` | `wails dev` (hot reload, real Go bridge) | Uses `GoMarkEdit-Dev` isolation (`01_BUILD_MATRIX.md` §7). |
| `just dev-ui` | Frontend-only Vite server against the bridge mock | No Go backend. |
| `just build` | `wails build` → `build/bin` | Prod artifact for the host OS. |
| `just gen` | `wails generate module` | Regenerate TS bindings after any bound-signature change. |
| `just fmt` | `gofmt -w` + `prettier --write` | Auto-fix. |
| `just fmt-check` | `gofmt -l` + `prettier --check` | Non-mutating gate. |
| `just lint` | `golangci-lint run` + `eslint` | |
| `just typecheck` | `tsc --noEmit` | |
| `just test` | `go test -race ./...` + `jest` | Race detector always on. |
| `just verify-ui` | Playwright responsive + smoke | Target A: bridge-mock. |
| `just gen-check` | `wails generate module` then fail on `frontend/wailsjs/` drift | Bindings-in-sync gate. |
| `just sqlc-check` | `sqlc diff` | Schema/query codegen drift gate. |
| `just check` | `fmt-check` + `lint` + `typecheck` + `test` + arch/drift checks | Full local CI mirror. |

## 2. Git hooks (Lefthook)

Two local hooks, installed by `just setup` (`lefthook install`). They are a **local safety net**, not
a replacement for CI; `git push --no-verify` / `LEFTHOOK=0` bypass them (a git feature, never used to
dodge a real failure — `CLAUDE.md` quality gates).

- **`pre-commit`** (parallel) — fast, staged-file-scoped auto-fixers: `gofmt -l -w`, `go vet`,
  `golangci-lint run --new-from-rev=HEAD --fix` on staged `*.go`; `prettier --write` and
  `eslint --fix` on staged `*.ts/*.tsx/*.css` under `frontend/`. Fixed files are re-staged.
- **`pre-push`** (ordered, serial) — a local mirror of the CI `test` job, in three steps whose order
  is load-bearing (§3): **(1)** regenerate Wails bindings, **(2)** frontend build + checks, **(3)** Go
  format/vet/`test -race` + `govulncheck` + `wails doctor` + `sqlc diff`.

A `require-cli.sh` helper fails a hook with a copy-pasteable install command if `wails` / `sqlc` /
`govulncheck` is missing from PATH.

## 3. Ordering: why frontend builds before Go

`main.go` embeds the built frontend via **`//go:embed all:frontend/dist`**. Any Go step that compiles
the package — `go vet`, `go test`, `wails build` — **resolves that embed directive** and fails if
`frontend/dist` is absent. Additionally, the frontend imports Go-generated bindings from
`frontend/wailsjs/` (gitignored, absent on a clean checkout), so those must be generated before the
frontend typechecks/builds. Hence the fixed order everywhere (hooks and CI):

```
wails generate module   →   npm run build (produces frontend/dist)   →   go vet / go test / wails build
```

Getting this wrong produces confusing "pattern all:frontend/dist: no matching files" or "cannot find
module './wailsjs/...'" errors. The `pre-push` step priorities (1→2→3) and the CI step sequence both
encode this.

## 4. CI gate set

The full gate set that must pass (staged in by phase per DD-37). Grouped by area:

**Go**

- `gofmt -l .` — zero unformatted files.
- `go vet ./...`.
- `go test -race ./...` — race-free (`internal/**`, `main_test.go`).
- `golangci-lint run` — the low-noise linter set (§8).
- `govulncheck ./...` — dependency vulnerability scan.

**Frontend**

- `prettier --check` — formatting.
- `eslint` — lint.
- `tsc --noEmit` — strict type-check.
- `jest` (with coverage) — unit/behavioural tests.
- `verify:ui` + `verify:smoke` — Playwright responsive + interaction smoke, headless (Target A:
  bridge-mock). Gates: no horizontal overflow, no console/page errors, no serif on `body`, Monaco
  editor height > 200 px on editor pages, plus the interaction flows.
- `npm audit --audit-level=high`.

**Codegen / schema drift**

- `wails generate module` then `git diff --exit-code frontend/wailsjs/` — bindings in sync.
- `sqlc diff` — the sqlc store matches migrations + queries (`internal/db/store/` never hand-edited).
- `wails doctor` — toolchain sanity.

No gate validates a document.

No gate depends on the network at runtime; the app itself makes no background or unsolicited network
calls (DD-32 as revised — the sole outbound calls are user-invoked LLM inferences to the configured
provider, from Phase 09 onward) and there is no telemetry (DD-33).

## 5. GitHub Actions build & release matrix

The release workflow has **four jobs**, triggered on **`push` of a `v*.*.*` tag** (automatic release)
or **`workflow_dispatch`** (manual, with an optional "create release" toggle). This is an outline;
`04_VERSIONING_ICON_AND_CICD.md#3-release-workflow` is the normative description, including the
workflow's file name:

- **`determine-version`** — computes `version`/`tag` once and shares them downstream.
- **`test`** — runs the entire §4 gate set on `ubuntu-24.04` (installs GTK3/WebKit2GTK 4.1 dev libs,
  Playwright Chromium, Wails CLI, sqlc, govulncheck).
- **`build`** — matrix, one native runner per artifact (`01_BUILD_MATRIX.md` §2, §5):

  | platform | runner | build tags | artifact |
  |---|---|---|---|
  | `darwin/arm64` | `macos-latest` | — | `GoMarkEdit.app` → `.app.zip` |
  | `darwin/amd64` | `macos-13` | — | `GoMarkEdit.app` → `.app.zip` |
  | `windows/amd64` | `windows-latest` | — | `GoMarkEdit.exe` + NSIS installer |
  | `linux/amd64` | `ubuntu-24.04` | `webkit2_41` | binary + `.deb`/`.rpm` (nfpm) |

  Each build patches `wails.json` with the release version, runs `wails build --platform … -ldflags
  "-X gomarkedit/internal/settings.AppVersion=<v>"`, fixes executable permissions, and uploads the
  artifact.

- **`create-release`** — needs `[determine-version, build, test]`; downloads all artifacts, renames
  them with the version, re-zips the macOS `.app` bundles with `-X` (preserve exec bit), generates
  `SHA256SUMS.txt`, and publishes a GitHub Release (pre-release auto-detected from a `-` in the
  version). Artifacts are **unsigned** (DD-34).

## 6. How work is tracked

Work is tracked as **phases** (`07_Phases/`) and **stories** (`../docs/stories/`, format in its
README). There is no traceability gate and no generated traceability record.

There used to be: `just trace`, `just trace-check`, `just phase-check` and
`just phase-complete-check NN`, backed by roughly 2,000 lines of custom validators and 2,200 lines of
Go tests that tested those validators. They were removed on 2026-07-25. They validated the *form* of
documents rather than the behaviour of the application; `phase-complete-check 00` reported a phase
complete while the test suite was red, because for automated evidence it only checked that a recipe
name appeared in a file; and the only failing test in the repository was one of them — failing because
the work it described had been finished.

What replaced them:

- Every acceptance criterion still gets its own test, listed in the story's Tests table.
- Each such test still carries `// Proves: STORY-NNN-AC-N` (Go) or the id in its name (Jest), so a
  failure names the requirement that broke. It is a convention read by humans; nothing generates from
  it and nothing validates it.
- A phase is finished when a person uses the app and confirms that phase's "Done when" paragraph.

## 7. Example lefthook.yml

`sh` scripts under `scripts/hooks/` keep the YAML thin.

```yaml
# Local safety net only — does NOT replace CI (.github/workflows/main.yml runs on
# tag-push/workflow_dispatch). Escape hatch: `git push --no-verify` / `LEFTHOOK=0 git push`.

pre-commit:
  parallel: true
  commands:
    # `glob` does not support brace expansion ("*.{ts,tsx}") — use a YAML array
    # of single-pattern globs instead.
    go-fmt:
      glob: "*.go"
      run: gofmt -l -w {staged_files}
      stage_fixed: true
    go-vet:
      glob: "*.go"
      run: go vet ./...
    go-lint:
      glob: "*.go"
      run: golangci-lint run --new-from-rev=HEAD --fix ./...
      stage_fixed: true
    fe-prettier:
      root: "frontend/"
      glob: ["*.ts", "*.tsx", "*.css"]
      run: npx prettier --write {staged_files}
      stage_fixed: true
    fe-eslint:
      root: "frontend/"
      glob: ["*.ts", "*.tsx"]
      run: npx eslint --fix {staged_files}
      stage_fixed: true

# Ordering is load-bearing: main.go embeds frontend/dist (go:embed all:frontend/dist)
# and the frontend imports frontend/wailsjs/ — so bindings must be generated, then the
# frontend built, before any Go step compiles/tests/vets. (See §3.)
pre-push:
  commands:
    01-bindings:
      priority: 1
      run: sh scripts/hooks/pre-push-bindings-drift.sh   # wails generate module
    02-frontend:
      priority: 2
      run: sh scripts/hooks/pre-push-frontend.sh         # npm build + format:check + lint + tsc + jest + verify:ui/smoke + audit
    03-go:
      priority: 3
      run: sh scripts/hooks/pre-push-go.sh               # gofmt -l + go vet + go test -race + govulncheck + wails doctor + sqlc diff
```

## 8. Example .golangci.yml

A small, low-noise linter set (`default: none` + explicit enable), scoped in
`pre-commit` via `--new-from-rev=HEAD`. The sqlc-generated store is excluded (never hand-edited).

```yaml
version: "2"
linters:
  default: none
  enable:
    - errcheck
    - govet
    - ineffassign
    - misspell
    - staticcheck
    - unconvert
    - unused
  exclusions:
    generated: lax
    presets:
      - comments
      - common-false-positives
      - legacy
      - std-error-handling
    rules:
      - linters: [errcheck]
        path: _test\.go
    paths:
      - internal/db/store       # sqlc-generated — never hand-edited
      - third_party$
      - builtin$
      - examples$
formatters:
  enable:
    - gofmt
  exclusions:
    generated: lax
    paths:
      - third_party$
      - builtin$
      - examples$
```

## 9. Example justfile

```make
# GoMarkEdit task runner. Every entry point CI/hooks/humans share. `just check` is the local CI mirror.

set shell := ["bash", "-uc"]

# --- setup & dev ---------------------------------------------------------------
setup:
    go mod download
    cd frontend && npm ci
    lefthook install

dev:
    wails dev

dev-ui:
    cd frontend && npm run dev          # bridge-mock, no Go backend

build:
    wails build

gen:
    wails generate module

# --- format / lint / type ------------------------------------------------------
fmt:
    gofmt -w .
    cd frontend && npx prettier --write "src/**/*.{ts,tsx,css}"

fmt-check:
    test -z "$(gofmt -l .)"
    cd frontend && npx prettier --check "src/**/*.{ts,tsx,css}"

lint:
    golangci-lint run ./...
    cd frontend && npx eslint .

typecheck:
    cd frontend && npx tsc --noEmit

# --- test ----------------------------------------------------------------------
test:
    go test -race ./...
    cd frontend && npm test

verify-ui:
    cd frontend && npm run verify:ui

# --- drift & security ----------------------------------------------------------
gen-check:
    wails generate module
    git diff --exit-code frontend/wailsjs/

sqlc-check:
    sqlc diff

vuln:
    govulncheck ./...

# --- composite gate ------------------------------------------------------------
check: fmt-check lint typecheck test gen-check sqlc-check vuln
```
