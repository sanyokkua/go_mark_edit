**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester
**Last Updated:** 2026-07-10
**Cross-references:** `00_Foundation/04_DESIGN_DECISIONS.md` (DD-03, DD-08, DD-10, DD-13, DD-33), `02_Architecture/01_MODULE_INVENTORY.md`, `04_Build_and_Release/01_BUILD_MATRIX.md`, `05_Dependencies/03_DEPENDENCY_POLICY.md`

# Go Dependencies

The Go (`go.mod`) direct dependency set for GoMarkEdit's backend and dev tooling, with each pin's
purpose and intent. The set is deliberately **minimal** — GoMarkEdit is an
offline-first Markdown editor, so the phases before it carry no HTTP client, tokenizer, or single-instance-lock
dependencies (the assistant provider client is built on the standard library `net/http`; see §3).
Everything below must remain **CGO-free / pure-Go** (DD-03) so `wails build` cross-builds
without a C toolchain.

## Table of Contents

1. [Runtime dependencies](#1-runtime-dependencies)
2. [Dev / CLI tools (not linked)](#2-dev--cli-tools-not-linked)
3. [Explicit exclusions](#3-explicit-exclusions)
4. [Pure-Go / no-CGO requirement](#4-pure-go--no-cgo-requirement)
5. [Go version](#5-go-version)

## 1. Runtime dependencies

Linked into the shipped binary.

| Module                             | Purpose                                                                                                                                                 | Pin intent                                           | Used by                                                                                                        |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `github.com/wailsapp/wails/v2`     | The desktop framework — webview binding, bindings/EnumBind, runtime dialogs, `OnFileOpen`, lifecycle, AssetServer. **v2 stable, not v3 alpha** (DD-02). | Pin exact minor; upgrade deliberately (webview ABI). | `main.go`, `internal/application`, `internal/docs`, `internal/export`, `internal/assets`, `internal/fileassoc` |
| `modernc.org/sqlite`               | **Pure-Go SQLite** driver for the settings/recent KV store — no CGO (DD-03).                                                                            | Pin exact patch; bumps carry the SQLite engine.      | `internal/db`                                                                                                  |
| `github.com/pressly/goose/v3`      | Additive-only schema migrations at `db.Open`.                                                                                                           | Pin minor.                                           | `internal/db`                                                                                                  |
| `github.com/rs/zerolog`            | Structured logging; implements the Wails `logger.Logger` interface. Local file only (DD-33).                                                            | Pin minor.                                           | `internal/logging`, `internal/bootstrap`                                                                       |
| `gopkg.in/natefinch/lumberjack.v2` | Rotating local log-file sink (size/age/backups).                                                                                                        | Pin minor.                                           | `internal/logging`                                                                                             |
| `github.com/google/uuid`           | UUID generation for internal ids (e.g. run/session ids, tab ids where needed).                                                                          | Pin minor.                                           | `internal/*` as needed                                                                                         |

## 2. Dev / CLI tools (not linked)

Installed via `go install` on dev/CI machines; **not** in the shipped binary. Enforced by the git
hooks / CI (`04_Build_and_Release/03_CI_AND_HOOKS.md`).

| Tool                                                     | Purpose                                                                                                                                    | Install                                                                    |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `github.com/wailsapp/wails/v2/cmd/wails`                 | `wails dev` / `wails build` / `wails generate module` / `wails doctor`.                                                                    | `go install github.com/wailsapp/wails/v2/cmd/wails@latest`                 |
| `github.com/sqlc-dev/sqlc/cmd/sqlc`                      | Generates the typed `internal/db/store/` from `migrations/` + `queries/`. Output is **never hand-edited**; `sqlc diff` is a CI drift gate. | `go install github.com/sqlc-dev/sqlc/cmd/sqlc@latest`                      |
| `github.com/golangci/golangci-lint/v2/cmd/golangci-lint` | Aggregated Go linting (low-noise set; `.golangci.yml`).                                                                                    | `go install github.com/golangci/golangci-lint/v2/cmd/golangci-lint@latest` |
| `golang.org/x/vuln/cmd/govulncheck`                      | Dependency vulnerability scan (CI + pre-push).                                                                                             | `go install golang.org/x/vuln/cmd/govulncheck@latest`                      |

## 3. Explicit exclusions

Dependencies GoMarkEdit **must not** carry, and why:

| Excluded                                               | Reason                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `github.com/gofrs/flock`                               | Single-instance advisory lock. GoMarkEdit supports **multiple instances with no single-instance lock** (DD-08). Concurrency safety comes from opening the SQLite DB with **WAL + `busy_timeout`** (DD-13), not a file lock. Adding flock would violate DD-08.                                                                                                                                                                                                  |
| `resty.dev/v3` (Resty HTTP client)                     | The only outbound traffic GoMarkEdit ever originates is the user-invoked assistant LLM inference (DD-32 as revised), and that provider client is built on the standard library `net/http` (`02_Architecture/08_LLM_INTEGRATION.md` `#provider-abstraction`) — no third-party HTTP client belongs in the backend at any stage. Document-referenced remote assets are governed by the frontend content policy and the guarded AssetServer, not a Go HTTP client. |
| `github.com/pkoukk/tiktoken-go` + `tiktoken-go-loader` | Not carried before the assistant exists (no LLM, no tokenization). The assistant offline tokenizer (`internal/llm/tokenizer`) needs an embedded estimator; if an embedded-BPE library is chosen, it is added by that story under the dependency policy (offline, no CGO, MIT-compatible — `05_Dependencies/03_DEPENDENCY_POLICY.md`) and never appears before the assistant phases.                                                                            |

Keeping these out also keeps the transitive graph (and `npm audit`/`govulncheck` surface) smaller.

## 4. Pure-Go / no-CGO requirement

Every runtime dependency above is pure Go or resolves to pure-Go build paths. This is a hard
constraint (DD-03, `CLAUDE.md` "Never do this"):

- **SQLite is `modernc.org/sqlite`** — never a CGO driver (`mattn/go-sqlite3`). A CGO SQLite would
  break `wails build` cross-compilation and require a C toolchain per target.
- The only C-adjacent requirement is the **Linux webview** (`libgtk-3-dev`,
  `libwebkit2gtk-4.1-dev`), a property of Wails on Linux — not a Go module dependency
  (`04_Build_and_Release/01_BUILD_MATRIX.md`).
- Default posture is `CGO_ENABLED=0`.

## 5. Go version

**Go 1.25+** (DD-03; `go.mod` `go 1.25`). CI pins a concrete toolchain (`setup-go`) new enough for
`sqlc` and the Wails CLI. Bumping the minimum Go version is an additive change tracked by a story.
