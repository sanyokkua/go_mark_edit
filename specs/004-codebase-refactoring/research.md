# Research: Codebase Refactoring (Feature 004)

**Branch**: `feature/004-codebase-refactoring` | **Date**: 2026-09-08 | **Spec**: [spec.md](spec.md)

Every technical unknown of the plan was resolved by reading the working tree at `2b889cb` (the
audit's line numbers refer to `883fd05`; the archived tree is `bc185c9`, tag
`archive/v1-linear-history-2026-09`). Each entry records the decision, the rationale, and the
alternatives considered. Facts marked _verified_ were read in the code during planning; facts marked
_spike_ are confirmed by the first task that depends on them.

## R1 — Entry-point scripts

**Decision**: five executables `scripts/build`, `scripts/test`, `scripts/verify`, `scripts/format`,
`scripts/baseline`, written in bash (`#!/usr/bin/env bash`, `set -euo pipefail`, no extension, mode
`755`). Shared code lives in `scripts/lib/{common.sh,stages.sh}` (mode `644`, sourced only, never
executed; they are libraries, not entry points). Everything that reads or writes JSON (tool reports,
the per-stage record, the baseline comparison) is one Node script, `tools/verify/results.mjs`,
because bash has no JSON parser and `jq` is not a declared tool. The `justfile` keeps seven
one-line aliases: `build`, `test *args`, `verify *args`, `format *args`, `baseline *args`, `dev` →
`scripts/build dev`, `setup` → `scripts/build setup`. The `set shell := ["zsh", …]` line is dropped;
`just` runs the scripts, nothing else, and stays optional (planning decision 4: the `justfile` is
not tool-formatted).

**Rationale**: the spec fixes the five names and forbids any other recipe than a one-line alias
(FR-060). Bash is already the language of every hook and script; three shells in one gate path
(zsh in `just`, bash scripts, `sh` hooks — _verified_) is one of the drift sources.

**Alternatives**: a Go task runner (`go run ./tools/task`) — rejected, it puts the stage graph behind a
compile step and adds a sixth toolchain path; keeping `just` recipes as owners — rejected by FR-060.

## R2 — One declaration of the toolchain

**Decision**: Go from `go.mod` (`go 1.25.7`); Wails CLI from the module requirement
(`go list -m -f '{{.Version}}' github.com/wailsapp/wails/v2` → `v2.15.0`), installed by
`scripts/build setup` with `go install …/cmd/wails@<that version>`; Node from a new `.nvmrc`
containing `24`; dependencies by `npm ci` (frontend) and `go mod download`; golangci-lint and shfmt
versions pinned in one table in `scripts/lib/common.sh` and installed by `scripts/build setup`;
prettier, its SQL plugin, stylelint, ESLint, Jest and Playwright are `devDependencies` pinned by the
lockfile. CI reads the same sources: `actions/setup-go` with
`go-version-file: go.mod`, `actions/setup-node` with `node-version-file: .nvmrc`, then
`scripts/build setup`. `wails.json`'s `frontend:install` becomes `npm ci`.

**Rationale**: CI installs Wails CLI 2.12.0 while `go.mod` requires 2.15.0, and Node is 22 in CI
versus 24 on the host with no pin file (_verified_). FR-070 wants one declaration shared by local
runs, hooks and CI; deriving from manifests that already exist avoids a second copy.

**Alternatives**: `.tool-versions`/mise — rejected (no Wails plugin, one more tool to install);
`engines` in `package.json` — rejected (a second Node declaration next to `.nvmrc`).

## R3 — Stage graph and `scripts/verify`

**Decision**: the six stages run in the order Lint → Format check → Build → Unit → Integration → E2E.
`scripts/verify` runs all six; `scripts/verify <stage>` runs one; `scripts/verify --skip e2e` runs
five. Each tool runs at most once: Lint = golangci-lint (with depguard) + `go vet` (inside
golangci) + `go run ./tools/archlint` + `tsc --noEmit` once per tsconfig + ESLint (typed) +
stylelint + `node tools/lint/tokens.mjs` + `node tools/lint/repo-rules.mjs`; Format check =
`scripts/format --check`; Build = `scripts/build` (bindings, `wails build`, clean-tree assertion);
Unit / Integration / E2E = `scripts/test <tier>`. The frontend is built once, inside `wails build`;
`vite build` is not repeated by any other stage, and the `prebuild`/`pretest`/`postbuild` hooks are
removed from `frontend/package.json`. No `go build` runs inside `go test` (the two build-tagged
builds in `native_evidence_safeguards_test.go` go with that file). The stage result of every run is
written by `tools/verify/results.mjs` to the ignored `.local_tmp_files/runs/<run-id>/` directory
as one JSON per stage (same schema as the baseline record) so `scripts/baseline` reuses the runner.

**Rationale**: FR-060/062 and the audit's TL-1 table (`release-stack.sh` ran the Wails build six
times, `tsc` five times).

**Alternatives**: keeping Lint after Build so ESLint sees `dist/` — rejected, no rule needs the bundle.

## R4 — Formatting owner and coverage

**Decision** (owner decision 2026-09-08 during planning): `scripts/format [--check]` formats every
tracked text file. Prettier runs from the repository root with a root `.prettierrc.json` (moved from
`frontend/`) covering `md`, `yml`/`yaml`, `json`, `css`, `ts`/`tsx`, `js`/`mjs`, `html`, `svg`
(XML via Prettier's HTML parser) and `sql` (pinned `prettier-plugin-sql`); `gofmt -l/-w` for Go;
`shfmt -i 2 -ci` for `scripts/**`, `scripts/lib/*.sh` and any `*.sh`. The ignore list
(`.prettierignore` at the root plus the same globs in `scripts/lib/common.sh`) names only:
`.specify/**`, `.claude/skills/speckit-*/**`, `.agents/skills/speckit-*/**` (Spec Kit-owned),
`frontend/wailsjs/**` (generated bindings), `frontend/dist/**`, `build/bin/**` (build output),
`**/node_modules/**`, the lockfiles `package-lock.json`, `go.sum`, and the `justfile` (planning
decision 4: its only formatter would make `just` a stage dependency). `build/darwin/*.plist`,
`build/windows/**` and `internal/db/migrations/*.sql` are formatted like any other source because
the migration text is source. Migration application is a runtime responsibility of `internal/db`,
not a Git-history comparison in the Lint stage. The first run is one reformat commit.

**Rationale**: `just fmt` formats less than half the repository today (424 Markdown files, 12 YAML,
22 shell scripts, the `justfile` and all root JSON are untouched — _verified_), and the pre-commit
and pre-push hooks format different sets. The owner confirmed that migrations, docs and archives are
source for formatting purposes and that only Spec Kit-owned paths are exempt.

**Alternatives**: keeping Prettier rooted at `frontend/` with a second invocation for the root —
rejected (two configs drift); treating migrations as immutable — rejected by the owner.

## R5 — Lint owners (one executable owner per mechanical rule)

**Decision**: the full rule table with its executable owners is
[contracts/lint-rules.md](contracts/lint-rules.md). The decisions behind it:

- Go import direction is enforced by golangci-lint `depguard` in `.golangci.yml`, not by a bespoke
  scanner: the linter already parses imports and reports locations.
- Bound-handler shape and callerless exports are one Go program, `tools/archlint` (`go/ast`). It
  derives the set of bound types from the `Bind:` list in `main.go` instead of a type-name suffix
  and is the single owner of the callerless-export rule (golangci-lint's `unused` does not report
  exported identifiers). The embedded settings migration remains owned by `internal/db` and is
  exercised by the database integration tests; archlint does not inspect Git migration history.
- TypeScript linting becomes typed (`typescript-eslint` `recommendedTypeChecked` with
  `projectService`), each file owned by exactly one tsconfig (`tsconfig.json` for `src/`,
  `tsconfig.test.json` for `tests/`, `tsconfig.node.json` for configs and `tools/`), in the single
  `eslint.config.js` (the `eslint.architecture.config.js` split and `frontend/scripts/archtest.mjs`
  go). Second-implementation and import-boundary rules are `no-restricted-syntax` and
  `no-restricted-imports` selectors scoped by file glob.
- stylelint is added as a devDependency: FR-069 wants the colour, theme-selector and elevation rules
  enforced "from parsed CSS", and the existing `archtest.mjs` colour scan is a regex over source text.
- Dead/undefined tokens (`tools/lint/tokens.mjs`) and the repository-level rules — task and
  requirement labels, test-file placement, instruction-file references (`tools/lint/repo-rules.mjs`)
  — are Node scripts because no existing linter owns those inputs.
- Zero collection: Jest runs without `--passWithNoTests` (today injected by the `justfile`),
  Playwright fails on "No tests found", `scripts/test` fails a Go tier whose package list ran zero
  tests (parsed from `go test -json` by `tools/verify/results.mjs`).

**Rationale**: FR-069, FR-079 and the audit's TL-6 table (name-based discovery, duplicate
adapter-only rule, untyped preset, no `forbidOnly`, `--passWithNoTests`).

**Alternatives**: a Go test for the AST gates — rejected (FR-029 moves architecture constraints into
the Lint stage, and a lint tool has no `t.Skip`).

## R6 — Go test roots and constructor options

**Decision**: `tests/go/unit/<package>/` and `tests/go/integration/<package>/` hold external test
packages (`package appmodel_test` etc.). They import `internal/...` because they are inside the
module. Unit tests use no disk, database or bridge; integration tests use `t.TempDir()`, a real
SQLite database opened by `db.Open`, and the real composition root where the behaviour needs it. The
test-only production API is removed (`SetConflictReadersForTesting`, `SetWriteExecutorForTesting`,
`SetBeforeSaveAsRecheck`, `SetLayoutTimer`, `NewAppModelServiceWithLayoutRepositoryAndTimer`,
`NewAppModelServiceWithAutosaveTimer`, the package variable `stableReadBeforeHashHook`, the three
package variables in `main.go` — all _verified_) and replaced by functional options on the production
constructors, wired only in `main.go`: `WithClock`, `WithAutosaveTimer`, `WithWriteExecutor`,
`WithConflictReaders`, `WithDialogs`, `WithEmitter`, `WithVersion`, `WithNativeConfirmation`. The
write snapshot exposes its encoded bytes so an injected executor can write them.

**Rationale**: FR-022/023/054 and the owner's D3. The survey of all 66 in-package files (see
plan.md, white-box list) found every behaviour but three reachable through this public surface.

**Alternatives**: external `_test` packages beside the code — rejected by D3; exporting inspectors
for maps — rejected (test-only API).

## R7 — Frontend integration tier without a bridge stand-in

**Decision**: Jest with jsdom, the real Redux store, the real `en.json` catalogue (the `i18nShim`
mapping goes), and CSS Modules mapped to their class names. The Wails globals are replaced by a
_command recorder_ (`frontend/tests/support/commandRecorder.ts`): every generated binding call is
recorded with its arguments and returns a promise that never settles; a _state-patch driver_ emits
`state:patch` and `state:error` through the same `EventsOn` registration. Tests assert the commands
dispatched and the projection after patches. Fake timers reach the 10-second bound. Nothing answers a
command.

**Rationale**: FR-022's definition ("nothing answering a command, no adapter double, no bridge
stand-in"). A recorder that never answers is what the spec describes; the forbidden thing is a second
backend model that answers (the 2,351-line mock).

**Alternatives**: keeping a slimmed mock bridge for `just dev-ui` — rejected (FR-032 retires that
route); mocking the adapter module — rejected (the adapter is the code under test).

## R8 — Real-backend E2E harness

**Decision**: Playwright, `testDir: frontend/tests/e2e`, `retries: 0`, `forbidOnly: true`,
`workers: 1`, Chromium only. A per-case fixture (`tests/support/harness.ts`) spawns
`wails dev -devserver localhost:34115 -nocolour` from the repository root (or from the directory
named by `E2E_REPO`, the lever for the archive runs of FR-031) with the process environment's `HOME`
(macOS) or `XDG_CONFIG_HOME` (Linux) pointing at a fresh temporary directory seeded for that case,
waits for the served URL, and kills the process tree at the end of the case; a case that asserts
state after a restart relaunches through the same fixture. One launch per case is required because
cases differ in profile contents before launch (a directory at `settings.db`, a rejecting trigger, a
held lock). The dev build resolves its profile to `<config root>/GoMarkEdit-Dev/` (_verified_:
`internal/file/paths.go`, `os.UserConfigDir()`), so the redirect isolates `settings.db` and the logs.
Before launch, `go run ./tools/e2e-seed <profile-dir> seed-recents <files…>` creates and migrates the
database through `internal/db.Open` and writes the `recent.files` row with the production key-value
helper; `add-trigger appearance` installs a rejecting SQLite trigger; `hold-lock <seconds>` opens an
exclusive transaction and releases it on `SIGTERM` or timeout (the accepted lever for the late
completion case — owner decision 2026-09-08). Files are opened through the Recents menu. Chromium
drives `http://localhost:34115`, where the Wails dev server serves the page with its runtime and IPC
scripts and dispatches binding calls and events over the `/wails/ipc` websocket; `window.runtime.Quit()`
from that page reaches `OnBeforeClose` on the same path as the native close button (_verified_ in
the pinned Wails source). On Linux `scripts/build` passes `-tags webkit2_41` (Ubuntu 24.04 ships
WebKitGTK 4.1). `wails dev` also opens the application's own native window, a second frontend on the same backend
that stays idle while Chromium drives the page; cases tolerate it (it receives the same events and
answers nothing the case did not trigger). _Spike_ (first harness task): `wails dev` does not
relaunch the app after a quit; the `assetserver.Options.Handler` route is reached in browser mode
because the dev server falls through to it when Vite answers 404 (an `<img>` request does not carry
`Accept: text/html`, so Vite's SPA fallback does not apply). If the first spike fails (the
application relaunches after a quit), the harness records the app child's PID from the `wails dev`
output, asserts exit on that PID and kills any relaunched child at teardown. If the second fails
(the route is not reachable in browser mode), case 7 keeps its placeholder assertions, the
rendering half moves to walkthrough step 9, and a Go integration test of the route handler proves
the folder rule, the 20 MB bound and the 404. Both consequences are also in the harness contract.

**Rationale**: FR-025/026 and the clarification answers; the seeding tool is not a test hook in the
binary — it is a separate program reusing production packages.

**Alternatives**: driving the packaged binary — rejected (the native window needs OS-level
automation, which CI does not run; the walkthrough covers it); a Vite-only dev server — rejected (no
Go process).

## R9 — Request identity and bounded commands

**Decision**: every bound method takes `bridge.Request` (a struct with `ID string`) as its first
parameter; the generated bindings regenerate. The adapter mints a UUID per command, declares
`OpenDocument`, `SaveAs`, `Save` of an untitled document and `ResolveClosePlan` user-paced, and
applies a 10-second deadline (a `Promise.race` against a timer) to every other command once the
frontend is ready. On the deadline it posts one notice per request in the notification surface with
Retry and Cancel; a late result is applied and withdraws the notice; Cancel dismisses the notice only.
The backend's `bridge.OutcomeCache` keeps completed outcomes for 60 seconds, at most 256 (oldest
evicted), joins an in-flight request with the same ID, and answers a Retry with the original outcome;
after eviction the request is fresh. Event names live in one Go file (`internal/bridge/events.go`)
and one TypeScript module (`logic/adapter/events.ts`).

**Rationale**: FR-019 to FR-021; generated Wails calls have no timeout and no metadata channel
(_verified_: the adapter has no `AbortController` or per-call timer; `main.go` binds 35 methods).

**Alternatives**: a per-call timeout only in the frontend — rejected (a late result could be applied
twice after Retry without backend identity).

## R10 — Shutdown protocol owner

**Decision**: `internal/application/shutdown.go` replaces `CloseCoordinator`. It owns request
identity, acknowledgement, pending-state discovery (`GetState` carries `pendingClose`), confirmed
cancellation (`CancelQuit(request)` acknowledges by ID), timeouts, authorisation and stale-response
rejection. Before ready and clean → exit at once; before ready and dirty, or no acknowledgement
within 10 seconds → finish started writes, then the native confirmation port (`runtime.MessageDialog`
wired at the root) names the documents with unsaved changes and offers "Quit and discard" / "Cancel".
State machine in [contracts/shutdown-protocol.md](contracts/shutdown-protocol.md).

**Rationale**: FR-016 to FR-018, FR-057; the audit's APP-2/APP-5 (emit once, veto forever; frontend
clears its pending flag before the backend confirms — _verified_).

## R11 — Document lifecycle owner

**Decision**: `internal/appmodel/lifecycle.go` introduces one per-document record holding path
identity (typed per-platform device and inode), buffer revision, committed revision, the write queue
(the existing per-document coordinator), the publication commit identity and every per-document
resource (autosave timer, activation token, save reservation, normalisation authorisation, conflict
record). One `dispose(id)` releases all of them. `publish.go` is the single publication path: the
snapshot is produced under the lock, the emit happens after unlock through a post-unlock queue, and a
publication whose commit identity is stale is rejected. Disk I/O stays outside the model lock. The
existing `snapshotForWrite`, `executeWrite`, `waitForIdle`, `effectiveDocumentMetadataLocked` and the
`internal/file` atomic replace are preserved.

**Rationale**: FR-001/003/007/051; audit BE-1 (nine maps synchronised by hand, `writeCoordinators`
never deleted — _verified_) and BE-6.

## R12 — One key-value repository helper, sqlc removed

**Decision**: `internal/kv` exposes `Get`, `Upsert`, `Tx` and versioned-JSON encode/decode over the
`settings(key, value, type)` table; settings, layout, recents and file metadata use it; each settings
group update is one transaction. `sqlc.yaml`, `internal/db/queries` and `internal/db/store` are
deleted. The refactored build starts from defaults, leaves rows it does not own untouched and writes
no migration.

**Rationale**: FR-008/053; four repositories on one table, sqlc used by one (_verified_).

## R13 — Version stamping

**Decision**: `scripts/build [--version X.Y.Z]` passes
`-ldflags "-X github.com/sanyokkua/go_mark_edit/internal/bootstrap.version=X.Y.Z"` to `wails build`;
on macOS it then writes `CFBundleShortVersionString` and `CFBundleVersion` into the built bundle's
`Info.plist` with `plutil -replace` (no tracked file changes); with no `--version` the binary reports
`dev`. The release workflow derives the version from the tag or the dispatch input.

**Rationale**: FR-068; the symbol exists (`internal/bootstrap/version.go`) but no build path passes
it, and `wails.json` has no `info` block, while `build/darwin/Info.plist` is a Wails template that
reads `{{.Info.ProductVersion}}` (_verified_), so with no `info` block the bundle carries no version.

**Alternatives**: writing `info.productVersion` into `wails.json` before the build (go_text's CI does
this with `jq`) — rejected (dirties the tree, FR-065); a restore step after the build would be a
second mechanism for the same value.

## R14 — Clean tree after build

**Decision**: `scripts/build` runs `wails generate module` first (it writes the bindings at mode
`755`), then `wails build`, then restores the tracked modes of `frontend/wailsjs/**` from
`git ls-files -s` if the build rewrote `runtime/*` at `644`, then asserts `git status --porcelain`
is empty for the whole tree.

**Rationale**: FR-065; three `runtime/` files are stored at `644` and `go/` files at `755`
(_verified_), which is the mode churn the old release script compensated for.

## R15 — Baseline record and comparison

**Decision**: `scripts/baseline` runs the same stage runner as `scripts/verify` and writes one JSON
file, `.local_tmp_files/baseline/<feature>.json` (schema in
[contracts/baseline-record.schema.json](contracts/baseline-record.schema.json)), holding the commit,
a SHA-256 of the dirty diff, tool versions, and per stage the exit code, duration, verdict and the
machine-readable finding identities (from `go test -json`, Jest `--json`, the Playwright JSON
reporter, `golangci-lint --out-format json`, `eslint -f json`, `stylelint -f json`, and the
tools' own JSON). `scripts/baseline --compare` re-runs and fails closed on any missing input, marks a
stage `unreliable` when it exited non-zero having reported no finding, and never reports green while
any finding or failing stage remains; the record and the comparison are computed by
`tools/verify/results.mjs`, the same script that writes every verification run. The root `.gitignore` gains `.local_tmp_files/` (the
`.specify/.gitignore` is Spec Kit-owned and is not edited).

**Rationale**: FR-064; the old verifier reported PASS with missing inputs (_verified_: `comm` errors
discarded).

## R16 — CI workflows

**Decision**: `.github/workflows/push.yml` (every push, `ubuntu-24.04`, installs
`libgtk-3-dev libwebkit2gtk-4.1-dev`, sets up Go and Node from the manifests, runs
`scripts/build setup` then `scripts/verify --skip e2e`) and `.github/workflows/release.yml`
(`v*` tags and `workflow_dispatch` with a `version` input; `macos-latest`, arm64; installs Chromium
for Playwright; runs `scripts/verify`; on success `scripts/build --version <v>`; zips the bundle as
`GoMarkEdit-<version>-macos-arm64.zip`; creates a GitHub Release with `GITHUB_TOKEN` only when the
tag's commit is on `master`, otherwise uploads a workflow artifact). Release notes come from the
annotated tag's message (`gh release create --notes-from-tag`); the walkthrough sentence FR-027
requires is written into that message by the owner before tagging (an instruction in the
architecture map), so the workflow needs no notes template. Details in
[contracts/ci-workflows.md](contracts/ci-workflows.md).

**Rationale**: FR-066 to FR-068; the current workflow re-lists nine steps by hand and the release job
is an `echo` (_verified_).

## R17 — Preview links and local images

**Decision**: one link classifier in `logic/markdown/linkPolicy.ts` (anchor, local candidate,
external `http`/`https`, refused scheme) used by the `MarkdownView` link renderer; anchors scroll the
preview; `https`/`http` go to `BrowserOpenURL`; a local candidate is sent as one backend command
`OpenPreviewLink(request, documentID, href)` that resolves the target after symlinks, checks it lies
inside the document's folder and has one of the accepted extensions (`.md`, `.markdown`, `.mdown`, `.txt`), and reuses the open
flow; refused
targets raise one auto-dismissing warning notice naming the target and the reason. Images: the `img`
renderer rewrites a relative `src` to the Wails asset-server route `/preview-image?doc=<id>&src=<rel>`;
the backend handler (registered through `assetserver.Options.Handler`, served in dev browser mode
and in the packaged app) applies the same folder rule and the 20 MB bound and answers with the bytes
or 404, which the renderer shows as the existing placeholder; web images keep the placeholder. Both
are recorded as durable decisions in the architecture map.

**Rationale**: FR-014/049; today anchors are ordinary links and a relative href navigates the page
(_verified_; the dev-server chain is reproduced in the audit).

**Alternatives**: returning image bytes as base64 through a bridge call — rejected (20 MB through
IPC per image); resolving local links purely in the frontend — rejected (the folder check needs the
filesystem).

## R18 — Architecture map

**Decision**: `docs/architecture.md` with the sections: product intent; owners (shared UI with each
component's consumer inventory, commands, document lifecycle, shutdown, persistence, verification
with the walkthrough step list); durable decisions carried from the legacy ADRs 0001, 0002, 0004,
0005, 0006, 0011 (reworded per FR-049), 0013, 0014, 0015 (updated for tag-driven versions), 0017,
0021, 0022, 0024, 0029, 0030, 0031, 0032, 0033, with 0028 recorded as superseded (FR-050) and the
assistant ADRs 0007–0010/0034 listed as planned decisions; this feature's decisions (D1–D12 plus
the three planning decisions); open decisions (signing and notarisation, an `apperr`/wire split,
Windows verification, the remote-content policy owned by the rendering feature).

## R19 — Popup implementation basis

**Decision**: the one Popup (FR-034) is built on the existing `@radix-ui/react-dropdown-menu`
dependency, which already owns the portal, outside-pointer and Escape dismissal, focus restore,
roving focus, type-ahead and collision handling (`collisionBoundary` set to `.application-frame`,
8 px `collisionPadding`, flip and shift). `open` is controlled by the consumer; a trigger anchor is
the consumer's element, while a point or bounds anchor (tab and editor context menus) is a
zero-size element positioned inside the frame and used as the Radix trigger. `MenuItem` wraps the
Radix item primitives so every menu shares the same keyboard model. The raw-portal copy that
`ShellMenuRow` renders at ≤ 376 px is removed: with a frame-bounded collision boundary the same
component serves every width.

**Rationale**: the audit's ten open/close implementations exist because the Radix menus and the
hand-written portals drifted; reusing the dependency that already implements the lifecycle keeps
one implementation and adds no code for behaviour the library owns.

**Alternatives**: a hand-rolled popup — rejected (re-implements what the dependency provides and
is the drift the spec removes); Radix `ContextMenu` for point anchors — rejected (a second
primitive with its own keyboard model).

## Facts that changed a clarification's assumption

- **The FIFO lever is inert.** `CanonicalizeDocumentPath` refuses non-regular files before any read,
  so "a path whose read blocks until released" cannot delay a command in this tree. The owner accepted
  a held exclusive SQLite transaction on the harness's own profile database as the lever for the
  late-completion case (it delays the recents promotion inside `OpenRecentFile` by the 5-second busy
  timeout times three retries).
- **Garbage bytes at `settings.db` self-heal** (corruption quarantine), so the failed-startup lever is
  a directory at the database path or a `0o500` profile directory.
- **Settings reads never fail on content** (every getter falls back to a default), so the read half
  of the isolated-settings-rejection case is split into a frontend integration test and a Go
  integration test; the write half is driven by a rejecting trigger.
