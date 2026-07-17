**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester
**Last Updated:** 2026-07-10
**Cross-references:** `00_ROADMAP.md`, `../00_Foundation/04_DESIGN_DECISIONS.md`, `../02_Architecture/01_SYSTEM_ARCHITECTURE.md`, `../02_Architecture/02_BACKEND_GO.md`, `../02_Architecture/04_WAILS_INTEGRATION.md`, `../02_Architecture/05_STATE_AND_PERSISTENCE.md`, `../02_Architecture/06_ERROR_HANDLING.md`, `../04_Build_and_Release/03_CI_AND_HOOKS.md`, `../05_Dependencies/01_GO_DEPENDENCIES.md`, `../06_Process_and_Traceability/01_MODULE_INVENTORY.md`, `../06_Process_and_Traceability/06_DEFINITION_OF_DONE.md`

# Phase 00 — Scaffold & Toolchain

## Goal

Stand up the empty-but-real GoMarkEdit shell that every later phase builds on: a Wails v2 app that
boots a blank window with an embedded React/Vite frontend, the bottom-of-graph backend primitives
(`apperr` envelope, `bootstrap`/`logging`, `file` path service, `db` SQLite open, a `settings` KV
service), the two-phase DI root, the dev-only bridge-mock, a `tokens.css` skeleton, and the project
toolchain (justfile, git hooks, CI skeleton, traceability scripts, ADR-0001..0006). No user-facing
Markdown behaviour yet — this phase exists to make the next ten phases each a thin vertical slice.
Refines: no umbrella FR — this is a process/scaffold phase; implementation of the
`../01_Product/01_FUNCTIONAL_REQUIREMENTS.md` anchors begins with Phase 01.

## Depends on

- Nothing. This is the root phase and unblocks everything else.

## Scope

- Go module init + `main.go` composition root; embed `frontend/dist`; `wails.Run` with a blank view.
- React 19 + Vite + TypeScript frontend that builds to `frontend/dist` and shows an empty app shell.
- `logic/adapter` singletons + Redux store root with the Result-envelope unwrap (`parseError`) and the
  toast surface stub, respecting the layer boundaries and data flow
  (`../02_Architecture/06_ERROR_HANDLING.md#frontend-parseerror`, `../02_Architecture/06_ERROR_HANDLING.md#toasts`,
  `../02_Architecture/01_SYSTEM_ARCHITECTURE.md#data-flow`, `../02_Architecture/01_SYSTEM_ARCHITECTURE.md#layer-boundaries`).
- `internal/apperr` — `AppError`, `ErrorCode` catalog, `WireError`, `ToWire`, `*Result` envelopes, `EnumBind`-ready enum.
- `internal/bootstrap` + `internal/logging` — pre-DB console logger and configured zerolog + lumberjack local file sink.
- `internal/file` — OS config/logs path resolution with `isDev` isolation (`GoMarkEdit` vs `GoMarkEdit-Dev`).
- `internal/db` — SQLite open (modernc), WAL + `busy_timeout`, goose migrations, sqlc `store/`, **no flock** (DD-08).
- `internal/settings` — generic `settings(key,value,type)` KV group (Handler/Service/Repository) exercising the full layering.
- `internal/application` — two-phase `ApplicationContextHolder` (`NewApplicationContextHolder` nil-repos, `Init(ctx)` real repos).
- `dev/bridge-mock` — frontend-only Vite dev bridge so `npm run dev` runs with no Go backend.
- `ui/styles` — `tokens.css` + `base.css` skeleton (variable names reserved; full theme values land in Phase 08).
- Toolchain: `justfile`, git hooks (lefthook), CI skeleton (`.github/workflows`), traceability scripts (`just trace`/`just trace-check`).
- ADR-0001..0006 authored and set to `accepted`.

## Out of scope

- Monaco editor, Markdown rendering, file dialogs, tabs — Phase 01/02.
- Real theme token values, Settings dialog UI — Phase 08.
- Full CI build matrix / packaging — Phase 10 (this phase ships only a green lint+test skeleton).

## Suggested stories / tasks

> Planned backlog for this phase. The `architect` generates the actual story files into `../docs/stories/` during implementation (one story per session), assigning the ids shown.


| Story id | Title | Est(S/M/L) | Modules | Spec clauses | depends_on |
|---|---|---|---|---|---|
| STORY-001 | Scaffold the Wails v2 Go module and embedded React/Vite frontend so a blank window boots | M | `internal/application/`, `dev/bridge-mock/`, `ui/styles/` | `02_Architecture/01_SYSTEM_ARCHITECTURE.md#process-model`, `02_Architecture/01_SYSTEM_ARCHITECTURE.md#layer-boundaries`, `02_Architecture/04_WAILS_INTEGRATION.md#embed`, `00_Foundation/04_DESIGN_DECISIONS.md#1-platform--framework`, `05_Dependencies/01_GO_DEPENDENCIES.md#1-runtime-dependencies`, `05_Dependencies/01_GO_DEPENDENCIES.md#5-go-version` | — |
| STORY-002 | Implement the apperr error envelope, ErrorCode catalog, ToWire, and Result types with EnumBind | M | `internal/apperr/` | `02_Architecture/06_ERROR_HANDLING.md#error-codes`, `02_Architecture/06_ERROR_HANDLING.md#wire`, `02_Architecture/06_ERROR_HANDLING.md#result-envelopes`, `02_Architecture/02_BACKEND_GO.md#error-envelope`, `02_Architecture/04_WAILS_INTEGRATION.md#bind-enumbind` | STORY-001 |
| STORY-003 | Wire the two-phase DI root with zerolog/lumberjack logging and isDev path isolation | M | `internal/application/`, `internal/bootstrap/`, `internal/logging/`, `internal/file/` | `02_Architecture/02_BACKEND_GO.md#di-two-phase`, `02_Architecture/02_BACKEND_GO.md#packages`, `00_Foundation/04_DESIGN_DECISIONS.md#10-non-functional--operations` | STORY-002 |
| STORY-004 | Open the SQLite settings store with modernc, WAL, busy_timeout, goose, and sqlc — multi-instance safe, no flock | M | `internal/db/`, `internal/file/` | `02_Architecture/05_STATE_AND_PERSISTENCE.md#kv-schema`, `02_Architecture/05_STATE_AND_PERSISTENCE.md#migrations`, `02_Architecture/05_STATE_AND_PERSISTENCE.md#multi-instance-db`, `00_Foundation/04_DESIGN_DECISIONS.md#3-persistence--state` | STORY-003 |
| STORY-005 | Expose a settings KV Handler/Service/Repository proving the Handler→Service→Repository layering | M | `internal/settings/`, `internal/db/`, `internal/apperr/` | `02_Architecture/02_BACKEND_GO.md#layering`, `02_Architecture/05_STATE_AND_PERSISTENCE.md#kv-schema`, `01_Product/11_SETTINGS.md#persistence` | STORY-004 |
| STORY-006 | Build the frontend app shell, logic/adapter singletons, Redux store root, and the bridge-mock dev bridge | M | `logic/adapter/`, `logic/store/`, `dev/bridge-mock/`, `ui/styles/` | `02_Architecture/03_FRONTEND_REACT.md#structure`, `02_Architecture/03_FRONTEND_REACT.md#adapter-layer`, `02_Architecture/03_FRONTEND_REACT.md#bridge-mock`, `02_Architecture/01_SYSTEM_ARCHITECTURE.md#data-flow`, `02_Architecture/01_SYSTEM_ARCHITECTURE.md#layer-boundaries`, `02_Architecture/06_ERROR_HANDLING.md#frontend-parseerror`, `02_Architecture/06_ERROR_HANDLING.md#toasts` | STORY-005 |
| STORY-007 | Add the justfile, lefthook git hooks, and the CI skeleton workflow that runs lint/type/test green | S | `internal/application/` | `04_Build_and_Release/03_CI_AND_HOOKS.md#1-justfile-command-taxonomy`, `04_Build_and_Release/03_CI_AND_HOOKS.md#2-git-hooks-lefthook`, `00_Foundation/04_DESIGN_DECISIONS.md#10-non-functional--operations` | STORY-001 |
| STORY-008 | Author ADR-0001..0006 and wire the traceability scripts so `just trace-check` runs on the empty backlog | S | `internal/application/` | `06_Process_and_Traceability/03_TRACEABILITY.md#the-two-commands`, `06_Process_and_Traceability/04_ADR_FORMAT.md#template-copy-docsadrtemplatemd` | STORY-007 |

## Edge cases

Phase 00 lays the persistence + envelope groundwork whose guarantees later stories rely on, and
directly satisfies:

- **EC-SET-1** — Settings DB locked by another instance → WAL + `busy_timeout` retry, no data loss (STORY-004).
- **EC-SET-2** — Corrupt or newer-than-expected schema → safe defaults or hard startup error (STORY-004).

(Feature edge cases — DOCS/WS/TABS/RENDER/etc. — are owned by their phases; Phase 00 only proves the KV/DB edge cases above.)

## Phase exit checklist

Automated:

- [ ] `go build ./...` and `wails build` produce a runnable binary; `wails dev` boots a blank window with no console errors.
- [ ] `internal/apperr` imports no other internal package (architecture test) and `ToWire` never serializes `cause`.
- [ ] `db.Open` yields a WAL-mode connection with `busy_timeout`; a goose migration applies; a settings KV upsert/get round-trips.
- [ ] `just check` (lint, format-check, vet, `go test -race`, jest) passes green on the skeleton.
- [ ] `just trace-check` runs and passes against the current backlog (no orphan clauses for authored stories).
- [ ] `npm run dev` starts the bridge-mock frontend with no Go backend and renders the app shell.

Manual:

- [ ] Launching the built binary shows an empty GoMarkEdit window that closes cleanly.
- [ ] `wails dev` uses the `GoMarkEdit-Dev` config/logs folders and never touches a production DB.
- [ ] ADR-0001..0006 exist, are `accepted`, and are linked from `08_Decisions/README.md`.

DoD reference: every story satisfies `06_Process_and_Traceability/06_DEFINITION_OF_DONE.md` (per-story + architecture invariants) before the phase is called complete. Stage 1 (Viewer); contributes to Milestone **M1**.
