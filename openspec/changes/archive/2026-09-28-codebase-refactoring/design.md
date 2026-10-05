# Design

## Context

GoMarkEdit is a Wails v2 binary: a Go backend owns state and file I/O, a React frontend projects it. After three feature rounds the document lifecycle had no single owner, shared UI was copied, and verification did not touch the real application. This change restructured owners and tooling without new product capability (except scroll sync and local images).

## Goals / Non-Goals

- Goals: one implementation per common behaviour; a backend that never loses work and always lets the window close; verification of the real app; one set of commands for local use, hooks and CI.
- Non-goals: new product features, code signing or notarisation, a universal binary or disk image, a database compatibility migration (startup applies the embedded `0001_settings.sql` only), and a pixel-parity test stack.

## Decisions

- Entry points: five bash scripts (`build`, `test`, `verify`, `format`, `baseline`) share `scripts/lib`; all JSON handling lives in `tools/verify/results.mjs`. The `justfile` holds one-line aliases only. Go comes from `go.mod`, Node from `.nvmrc`, the Wails CLI from the module requirement.
- Stages: Lint, Format, Build, Unit, Integration, E2E. A required suite that collects zero tests fails. `verify --skip e2e` never reports E2E as passed. `baseline` is the only command that records or compares; an unreliable stage (non-zero exit, nothing parsed) is refused as a baseline.
- Document record: one record per open document (identity by device and inode, typed per platform, falling back to resolved path; canonical path; buffer and committed revisions; a monotonic publication id that rejects older publications; write queue; autosave timer; conflict state). `dispose` is the single exit and runs after started writes finish. Disk I/O happens outside the model lock; events are emitted after unlock; refusal text is built from a snapshot taken under the lock.
- Bridge: every bound method takes `bridge.Request{ID}` first, returns one `apperr.*Result` with a named result, takes no `context.Context`, and starts with `defer bridge.Guard(&result)`. An empty id is a validation failure. A completed outcome is cached 60 s (at most 256, oldest evicted); a call with an in-flight id joins the running call. The adapter mints one UUID per command; Retry re-sends the same id and arguments. Commands have a 10 s deadline once the app is ready, except user-paced ones (open, save as, save of an untitled document, close-plan resolution). Each stuck request shows one notice with Retry and Cancel; a late result withdraws it or is applied silently after Cancel.
- Failures: one `Failure{category, subject, message, remediation}` embedded in every result envelope, built by `bridge.Fail`; `Guard` turns a panic into an `internal` failure.
- Shutdown (`internal/application/shutdown.go`): a native close or quit becomes a numbered request. If the frontend is ready it receives `application:close-requested` and must answer `AuthorizeQuit` or `CancelQuit` within 10 s (a second native request re-emits the same id; stale ids are refused). On timeout or a never-ready frontend, started writes drain, then a native dialog confirms discarding unsaved documents. `GetState` projects `pendingClose` so a late frontend discovers the request.
- Key-value store: dotted namespaces (`appearance.*`, `view.*`, `markdown.*`, `format.*`, `lint.*`, `content.*`, `editor.*`, `file.*`, `layout.*`, `recent.files`, `document.view.*`); a group update is one transaction; absent is distinct from a decode failure; unknown versions read as absent.
- Layering: `ui/widgets` compose components and read the store; `ui/components` and `ui/primitives` take props only; only `logic/adapter` imports generated bindings.
- Shared components, each with one implementation and a consumer inventory in `docs/architecture.md`: Popup (Radix dropdown, portal into the application frame, sizes menu/wide/details), MenuItem, Bar, Island, ToolButton, Button, TabBar, Pane, Sidebar, ModalShell, Segmented, Icon, StatusBar (facts dropped by priority, all listed in Details) and Notifications (error, warning, stuck).
- E2E: Playwright (Chromium, one worker, no retries, `.only` forbidden) drives `wails dev -devserver localhost:34115` with `HOME` or `XDG_CONFIG_HOME` redirected to a temp profile that `tools/e2e-seed` fills; the native window stays hidden; each case starts a fresh app and may relaunch it.
- Scroll sync: a scroll map from source-line anchors in the rendered preview, a controller with editor and preview ports, a persisted View-menu toggle.
- Release: macOS arm64 zip, unsigned, built from `scripts/build --version X.Y.Z`.

### Lint rules (the Lint stage owns every mechanical rule; none may be suppressed or allowlisted to pass)

| Rule                                                                                                                                                                                                                                                                                         | Owner                                                    |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `internal/apperr` imports nothing under `internal/`; `internal/bridge` imports only `apperr`                                                                                                                                                                                                 | golangci-lint depguard                                   |
| `internal/appmodel` imports neither the Wails runtime nor `internal/bootstrap`; handlers import services only; services import repositories, `internal/file`, `internal/kv`; nothing imports `main`                                                                                          | depguard                                                 |
| Bound-handler shape (one `apperr.*Result`, no context, named result, first statement `defer bridge.Guard(&result)`)                                                                                                                                                                          | `tools/archlint`                                         |
| No exported symbol without a production caller (test-only exports are reported)                                                                                                                                                                                                              | `tools/archlint`                                         |
| gofmt, govet, errcheck, staticcheck, ineffassign, unconvert, misspell                                                                                                                                                                                                                        | golangci-lint                                            |
| Only `frontend/src/logic/adapter/**` imports `wailsjs/**`; `ui/primitives` and `ui/components` import nothing from `logic/store`, `logic/adapter`, `logic/actions`                                                                                                                           | ESLint `no-restricted-imports`                           |
| Typed linting (recommendedTypeChecked, floating and misused promises, react-hooks); every TS/JS file belongs to exactly one tsconfig (src, tests and support, node configs and tools)                                                                                                        | ESLint plus `tsc --noEmit`                               |
| No second Popup (portal, menu roles, document-level keydown/pointerdown listeners, application-frame lookup), ModalShell (dialog role, aria-modal, focus-trap strings), TabBar (tab roles), raw `button` element, Segmented (radiogroup role) or Icon (inline svg) outside the owning folder | ESLint `no-restricted-syntax`                            |
| Every user-visible string goes through `t()`                                                                                                                                                                                                                                                 | ESLint `no-restricted-syntax`                            |
| No `.only` in Jest or Playwright                                                                                                                                                                                                                                                             | `eslint-plugin-no-only-tests`, Playwright `forbidOnly`   |
| Colour literals only in `ui/styles/tokens.css`; no theme, mode or parity selectors outside it and the shared component stylesheets; elevation shadows only in Popup and ModalShell stylesheets                                                                                               | stylelint plus ESLint on inline styles                   |
| Every declared token is referenced and every `var(--…)` is declared                                                                                                                                                                                                                          | `tools/lint/tokens.mjs`                                  |
| No task or requirement labels in source, tests, README, AGENTS.md, CLAUDE.md, architecture docs or Go package docs                                                                                                                                                                           | `tools/lint/repo-rules.mjs`                              |
| No test files under `frontend/src`, `frontend/public` or Go production packages, except the listed white-box tests                                                                                                                                                                           | `tools/lint/repo-rules.mjs`                              |
| A required suite that collects zero tests fails                                                                                                                                                                                                                                              | Jest, Playwright, `scripts/test` parsing `go test -json` |
| Every command, file and path named in README, AGENTS.md, CLAUDE.md and the architecture map exists                                                                                                                                                                                           | `tools/lint/repo-rules.mjs`                              |
| `CGO_ENABLED=0 go build ./internal/... ./tools/...` compiles (the desktop binary is not claimed CGO-free)                                                                                                                                                                                    | `scripts/verify lint`                                    |
| The production bundle contains no test file and no remote asset URL                                                                                                                                                                                                                          | `scripts/build` bundle scan                              |

Database migrations are owned by `internal/db`; the lint contract neither compares migration history nor needs a Git ref. Deleted with their prose: the parity-case route budget, evidence-driver import lists, the spec clause count, source-text greps in `main_test.go`, and the colour scan allowlist. Source-text, CSS-text, DTO-shape and documentation-content assertions are deleted and never ported into a linter.

### CI workflows (both call only the five scripts)

- `push.yml`: every push, ubuntu-24.04, 40 min. Steps: checkout, install the Linux Wails packages (GTK 3 and WebKit2GTK 4.1), setup-go from `go.mod`, setup-node from `.nvmrc` with npm cache, `scripts/build setup`, then `scripts/verify --skip e2e` (Build links the real Linux artifact with tag `webkit2_41`). On failure it uploads the diagnostic artifact.
- `release.yml`: on `v*` tags and manual dispatch with a required `X.Y.Z` version; macos-latest, 60 min, `contents: write`. Steps: checkout with full history; derive the version from the tag or input and fail if it is not `X.Y.Z`; guard: a tag not reachable from `origin/master` ends the job successfully with a notice, with no later step running; setup-go and setup-node; `scripts/build setup --with-browser`; `scripts/verify` (all six stages); upload diagnostics on failure; `scripts/build --version`; zip the app with `ditto` as `GoMarkEdit-X.Y.Z-macos-arm64.zip`; on a tag push `gh release create` with notes from the annotated tag (pre-release when the tag has a suffix); on dispatch upload the zip as a dry run.
- Rules: no other job or step list exists (a stage change is a change to `scripts/`); no signing; versions of Node, Go and Wails are never written in a workflow; the workflow makes no network assertion about the app.
- Failure-artifact allowlist (artifact name `verification-runs-${{ github.run_id }}`, `include-hidden-files: true`, `if-no-files-found: ignore`), these path patterns:

```text
.local_tmp_files/runs/**/summary.json
.local_tmp_files/runs/**/lint.json
.local_tmp_files/runs/**/format.json
.local_tmp_files/runs/**/build.json
.local_tmp_files/runs/**/unit.json
.local_tmp_files/runs/**/integration.json
.local_tmp_files/runs/**/e2e.json
.local_tmp_files/runs/**/reports/**
.local_tmp_files/runs/**/*.log
.local_tmp_files/runs/**/*.stderr
.local_tmp_files/runs/**/frontend-*.json
```

This retains stage logs and records, raw and normalized reports, and Jest, Playwright and Go test reports. It intentionally excludes compiler, linter, Jest, Playwright and TypeScript build-info caches.

## Risks / Trade-offs

- A full verify run is slow because each E2E case launches its own app; one fixed port and one worker avoid port conflicts and orphaned processes.
- Eliminating all prose rules relies on tooling coverage; reviewers still grep for source-text assertions on test roots.
- Release artifacts are unsigned and arm64 only; signing remains an open decision.
- Never built: a pixel-parity harness and a runtime offline assertion in CI (offline start is verified on the developer host).
