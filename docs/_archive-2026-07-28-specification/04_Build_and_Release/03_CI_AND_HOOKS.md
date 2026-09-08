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
but every gate below is in scope by Phase 08.

## Table of Contents

1. [justfile command taxonomy](#1-justfile-command-taxonomy)
2. [Git hooks (Lefthook)](#2-git-hooks-lefthook)
3. [Ordering: why frontend builds before Go](#3-ordering-why-frontend-builds-before-go)
4. [CI gate set](#4-ci-gate-set)
4b. [Two targets, and why both are needed](#4b-two-targets-and-why-both-are-needed)
4c. [Coverage floors](#4c-coverage-floors)
4d. [The renderer's golden-file corpus](#4d-the-renderers-golden-file-corpus)
4e. [remark and rehype are ESM-only, and Jest is not](#4e-remark-and-rehype-are-esm-only-and-jest-is-not)
4f. [Build the matrix before you need it, and test the upgrade](#4f-build-the-matrix-before-you-need-it-and-test-the-upgrade)
5. [GitHub Actions build & release matrix](#5-github-actions-build--release-matrix)
6. [How work is tracked](#6-how-work-is-tracked)
7. [Example lefthook.yml](#7-example-lefthookyml)
8. [Example .golangci.yml](#8-example-golangciyml)
9. [Example justfile](#9-example-justfile)
10. [Work order: the gates this document describes but the repository does not run](#10-work-order-the-gates-this-document-describes-but-the-repository-does-not-run)

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

**Offline and bundling**

- **No remote URL in the build output** — after `vite build`, no file under `frontend/dist` contains
  `jsdelivr`, `unpkg`, `cdn.` or `googleapis`. This is the single best guard on DD-32, and it is the
  check that would have caught a reviewed reference application shipping a `cdn.jsdelivr.net` Monaco
  loader in its production bundle.
- **Every bundled asset is present** — the KaTeX fonts, the generated highlight stylesheet, the UI
  fonts (Roboto, Inter) and the Monaco worker chunk are all in `frontend/dist`. A build that silently
  externalises one of them still works on the developer's machine and fails air-gapped.
- **The Monaco gate runs with the network disabled.** `verify:ui`'s "editor taller than 200px"
  assertion passes trivially against a live network; with the network aborted it is a real offline
  regression test. One line, and it turns a layout check into an offline check.

No gate validates a document.

No gate depends on the network at runtime; the app itself makes no background or unsolicited network
calls (DD-32 as revised — the sole outbound calls are user-invoked LLM inferences to the configured
provider, from Phase 11 onward) and there is no telemetry (DD-33).

## 4b. Two targets, and why both are needed

**Target A — the bridge mock.** `npm run dev` with `wailsjs/*` aliased to `frontend/src/dev/bridge-mock/`.
Fast, deterministic, no Go toolchain. Everything responsive and visual runs here, and this is what CI
runs.

**Target B — the real backend.** `BASE_URL=http://localhost:34115` against `wails dev`, exercising real
bound methods and a real database. Run locally, not in CI.

Target A alone is not enough, and the reason is measurable rather than theoretical: the mock and the Go
model **already disagree**. The mock computes a document's dirty state as `content.length > 0`; Go
computes it as `content != baseline`. Every Playwright assertion, every visual baseline and every
end-to-end test today runs against the version that is wrong, and no test can see it.

Three mechanisms keep them honest, and they are complementary rather than alternatives:

1. **A shared fixture corpus** — one JSON file of `(input, expected)` cases consumed by a Go table test
   *and* by a Jest test over the mock, so both implementations answer the same questions.
2. **A surface check** — a test enumerating the exported methods of each
   `frontend/src/dev/bridge-mock/go/<pkg>/<Handler>.ts` against the generated
   `frontend/wailsjs/go/<pkg>/<Handler>.d.ts`, failing on any method present in one and missing from the
   other. Cheap, and it catches the common failure: a new bound method with no mock behind it.
3. **A small set of Target-B journeys** that must touch real Go — open → edit → save → assert the bytes
   on disk; open a CRLF file and check the status bar; close the last tab and see the real empty state.

`frontend/playwright.config.ts` needs a `BASE_URL` escape hatch for this; its `webServer` block is
currently unconditional, so there is no way to point the existing specs at a real backend at all.

## 4c. Coverage floors

Floors are a **ratchet**, not a target: measure what the suite covers today, set the floor a few points
below, and raise it as coverage rises. An absolute number picked in advance either blocks every commit
or is met by tests that assert nothing.

`frontend/jest.config.mjs` has no `coverageThreshold` and does not collect coverage; `just frontend-test`
passes `--passWithNoTests`, so a suite that disappears passes. There is no Go coverage step at all.

A floor sits **beneath** `.claude/rules/go-testing.md` and `ts-testing.md`, never in place of them. Those
rules reject a test that proves only that a symbol exists or that a command was invoked — and a
coverage percentage is exactly the metric such a test satisfies.

## 4d. The renderer's golden-file corpus

The renderer is the product, and it is the one subsystem where "it looked right when I checked" is
least trustworthy: three standard levels each map to a different plugin set, so the *same input renders
differently on purpose*, and a regression looks exactly like an intended difference.

`frontend/src/logic/markdown/__fixtures__/` holds input `.md` files with their expected sanitized HTML,
**three variants each — one per standard level**, since the whole point of the level selector is that
they differ.

One fixture per feature: GFM table · task list · footnote · autolink · strikethrough · inline maths ·
display maths · fenced Go · fenced unknown-language · Mermaid · local image · blocked remote image ·
raw HTML · nested blockquote-in-list · YAML frontmatter.

Alongside it, the **adversarial corpus** (`01_Product/19_SANITIZATION_AND_CSP.md#the-adversarial-corpus`)
as a separate set, asserting that nothing executes. At least one of those also runs as a browser smoke
flow, because sanitization is a property of the rendered DOM rather than of a string.

The same corpus proves Format's two properties (`01_Product/06_FORMAT_AND_LINT.md#format`):
`format(format(x)) == format(x)` and `render(format(x)) == render(x)`. Both are cheap table tests, and
both catch the class of Format bug that is otherwise only visible by eye.

Also golden, in the file layer: BOM preserved, CRLF preserved, a suffixless Save As appending `.md`, and
a new document's defaults (UTF-8, no BOM, LF).

## 4e. remark and rehype are ESM-only, and Jest is not

This costs a day if it is discovered rather than read.

`react-markdown`, the remark and rehype plugins and `mermaid` ship **ESM only**. Jest cannot transform
them without `--experimental-vm-modules`, and this project is Vite + ts-jest — it does not get the
free ESM transform a Next.js setup would.

The strategy is **mock at the boundary, and cover the real pipeline elsewhere**: `moduleNameMapper`
entries map each ESM package to a small CJS stub, and a hand-written stub for `react-markdown` still
invokes the `a` and `code` overrides so the override *logic* is genuinely tested. The real pipeline —
plugins, sanitization, KaTeX, Mermaid — is covered by the golden corpus run in a browser, and by
Playwright.

One mapping entry, not fifteen: `'^wailsjs/(.*)$': '<rootDir>/wailsjs/$1'`. A reviewed reference
application carries fifteen, including five different relative-depth spellings of the same path, because
its components import `wailsjs/` directly. Ours do not (`.claude/rules/ts-testing.md` — mock the adapter
seam, never `wailsjs/`), which is the layering rule paying rent in the test config.

Switching to Vitest would remove the problem outright and is the natural pairing with Vite. It is not
proposed here only because the suite already exists on Jest; if the mapping table starts growing, that
is the signal to reconsider.

## 4f. Build the matrix before you need it, and test the upgrade

**A compile-only matrix on every pull request.** `01_BUILD_MATRIX.md` §2 specifies four platform
artifacts. A release job that has never run is not a release pipeline — and the corollary is that the
first tag should not also be the first time `wails build` has been attempted on Windows.

A compile-only job across all four targets, on `pull_request`, proves the code *builds* everywhere
without anyone owning three machines. It also resolves a real tension the phase-02 audit recorded: work
was blocked because cross-platform runtime proof was demanded on a macOS-only machine with no waiver.
Compile proof is automatable; **runtime proof stays a documented, honestly-scoped manual step**, and
Phase 08 already handles that well — *"where a platform is not available to test on, say so plainly in
the release notes rather than implying it was verified."*

**Migrations are tested forward, from committed fixtures.** Migrations are additive-only and
sqlc-generated, and `just sqlc-check` proves the store matches the queries. Nothing proves the thing
that actually bites after the first release: **opening a database written by an older build.**

- One **committed fixture database per shipped schema version**, added at release time. A test opens
  each, migrates forward, and asserts the app starts and the settings survive.
- A test that reads the migration files and **fails on `DROP COLUMN`, `DROP TABLE` or a destructive
  `ALTER`** — additive-only is listed under "Never do this" and is currently enforced by convention.
- **Forward and backward compatibility of the settings registry**: an unknown key must not break
  startup, and a missing key must fall back **per scalar** rather than resetting its whole group. That
  is what makes the registry growable (F4), and nothing currently proves it.

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

## 10. Work order: the gates this document describes but the repository does not run

**Everything in §4 above is what the gate set *should* be. Some of it is not wired.** That is stated
here rather than implied, because a document describing gates that do not run is worse than no
document — it makes a reader believe the branch is protected.

As of 2026-07-25:

| Gate | Specified | In `justfile` | In pre-push | In CI |
|---|---|---|---|---|
| `gofmt`, `go vet`, `go test -race`, `golangci-lint`, `tsc`, `eslint`, `prettier`, `jest` | yes | yes | yes | yes |
| `verify-ui` | yes | yes | **no** | **no** |
| `verify-smoke` | yes | **recipe does not exist** | no | no |
| `govulncheck` | yes | yes (`just vuln`) | **no** | **no** |
| `npm audit` | yes | **no** | no | no |
| `sqlc diff` | yes | yes (`just sqlc-check`) | **no** | **no** |
| `wails doctor` | yes | **no** | no | no |
| coverage floors | yes | **no** | no | no |
| offline asset scan | yes | **no** | no | no |

And the largest one: **CI triggers only on a release tag** (`push: tags: v*.*.*` plus
`workflow_dispatch`). There is no `pull_request` and no `push: branches`, so **nothing above gates a
branch**. Every gate first runs at tag time, which is the worst possible moment to discover a failure.

Three changes land **together**, and the ordering is not optional:

1. **Fix the known-flaky test first.** `internal/db/database_test.go`'s `EC-SET-2` concurrent-processes
   subtest reproduces roughly three times in sixty iterations under CPU contention
   (`docs/KNOWN_ISSUES.md` §7), and a shared CI runner is exactly that environment. Turn branch gating
   on before fixing it and the first thing the project learns about branch gating is that it is flaky —
   which is how gates get switched back off.
2. **Add the missing `just verify-smoke` recipe.** Nine files already reference it — this document,
   `04_VERSIONING_ICON_AND_CICD.md`, `05_Dependencies/02_FRONTEND_DEPENDENCIES.md` and five `.claude`
   skills. An agent told to run it before marking a story done hits a `just` error and, at best, skips
   it silently.
3. **Add `pull_request` and `push: branches` triggers** to the `test` job, leaving the release job
   tag-gated. Reconcile the workflow filename while there: `04_VERSIONING_ICON_AND_CICD.md` §3 names
   `.github/workflows/release.yml` and the repository has `main.yml`.

Then wire the remaining rows into `just check`, the pre-push hooks and CI — **as `just` recipes first**,
referenced everywhere else. That single-command-surface property is this repository's structural
advantage over both applications reviewed, and pasting steps directly into CI YAML would spend it.

`scripts/hooks/require-cli.sh` is a prerequisite for the security rows: §2 promises a helper that fails a
hook with a copy-pasteable install command when `wails`, `sqlc` or `govulncheck` is missing, and
`scripts/hooks/` contains only stubs. Without it, adding those gates just makes pushes fail confusingly
on machines that lack the tools.
