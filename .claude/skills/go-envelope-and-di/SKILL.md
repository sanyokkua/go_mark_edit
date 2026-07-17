---
name: go-envelope-and-di
description: >-
  Use when adding or changing a backend vertical in GoMarkEdit — a Wails-bound handler, its service,
  its repository, a new apperr.*Result / ErrorCode, or the two-phase DI wiring in
  internal/application + main.go. Triggers: "(T, error)" leaking across the bridge, a
  context.Context param on a bound method, an unguarded panic crashing the app, "cannot use ... as
  apperr.*Result", a frontend promise rejecting oddly, a nil-pointer on the first repository call,
  or frontend/wailsjs/ drift in CI after a signature change.
allowed-tools: Read, Edit, Write, Bash, Glob, Grep
references:
  - references/envelope-and-errorcodes.md
  - references/two-phase-di.md
  - references/add-a-vertical-playbook.md
  - references/troubleshooting.md
related-skills:
  - sqlite-kv-persistence: the repository/KV/migration internals a vertical wraps
  - wails-dev: embedding, lifecycle hooks, Bind/EnumBind, asset handler
  - testing-wails-app: the envelope-contract and service tests that prove the vertical
---

# Go Error Envelope and Dependency Injection

Every Wails-bound Go method in GoMarkEdit returns a concrete `apperr.*Result` envelope (never
`(T, error)`), takes **no `context.Context`**, and is panic-guarded. Concrete implementations are
wired in exactly one place — `internal/application` + `main.go` — in two phases (nil repo first,
real SQLite repo after `db.Open`). This skill is the crisp playbook; the exhaustive rules, tables,
and worked shapes live in the references.

## When to use

- Adding a new backend vertical (`internal/<feature>/` handler + service + repository).
- Adding or changing a bound handler signature, an `apperr.*Result`, or an `ErrorCode`.
- Touching `internal/application/application.go` DI wiring or `main.go`'s `Bind` / `EnumBind`.

## When NOT to use

- Persistence / KV / migration internals of the repository → `sqlite-kv-persistence`.
- Embedding, lifecycle hooks, file associations, the asset handler → `wails-dev`.
- Pure frontend Redux/adapter work with no Go signature change → `ts-redux-adapter.md`.

## Workflow

1. **Confirm the layer and its signature shape.** Handler → Service → Repository, strictly inward,
   with `internal/apperr` as a leaf that imports no other internal package. See the layering diagram
   and per-layer signature table in `references/add-a-vertical-playbook.md` before writing code.
2. **Write the handler as the canonical envelope.** Named return + `defer/recover → apperr.Internal`,
   no `ctx` param, exactly one of `Data`/`Error` set. Copy the shape and pick the right `*Result`
   variant and `ErrorCode` constructor from `references/envelope-and-errorcodes.md`.
3. **Keep the service `(T, error)` + `ctx`; keep the repository behind a package-owned interface.**
   Classification (validation vs io vs not_found …) happens in the service; `ToWire` logs the full
   chain once at the handler boundary and strips the unexported `cause`.
4. **Wire it two-phase, in one place only.** Phase 1 constructs the service/handler with a `nil`
   repo in `NewApplicationContextHolder`; Phase 2 injects the real SQLite repo in `Init(ctx)` after
   `db.Open`. Nothing outside `internal/application` / `main.go` constructs a concrete repo/handler.
   Full walkthrough in `references/two-phase-di.md`.
5. **Bind + regenerate.** Add the handler to `main.go`'s `Bind:` list and any new code to `EnumBind:`,
   then run `just gen` (`wails generate module`); add a `logic/adapter/` wrapper so the frontend never
   imports `wailsjs/`. Follow the numbered end-to-end steps in `references/add-a-vertical-playbook.md`.
6. **Validate.** `just check` (fmt + vet + import-graph + lint + test) clean, `just build` links the
   CGO-free binary, and `frontend/wailsjs/` shows no drift. When something misbehaves, consult
   `references/troubleshooting.md`.

## Reference Index

| Reference | Read it for |
|---|---|
| `references/envelope-and-errorcodes.md` | The copy-exact handler shape, the `*Result` variants table, the full `ErrorCode` catalog + constructors, the `cause`/`ToWire` logging rule |
| `references/two-phase-di.md` | Why DI is two-phase, the `NewApplicationContextHolder` / `Init(ctx)` split, `SetRepository`, `main.go` `Bind` / `EnumBind`, `just gen` |
| `references/add-a-vertical-playbook.md` | The layering diagram + signature table, the package-owned interface rule, the numbered add-a-vertical steps |
| `references/troubleshooting.md` | Symptom → cause → fix for envelope/DI/binding failures |

## Mandatory validation

- [ ] Handler returns `apperr.*Result`, takes no `context.Context`, has a named return + `defer/recover` → `apperr.Internal` (`CodeInternal`).
- [ ] Exactly one of `Data` / `Error` is set; a user cancel (dismissed dialog) is success with empty data, not an error.
- [ ] Service keeps `(T, error)` and takes `ctx`; the repository implements an interface **owned by the feature package**.
- [ ] `internal/apperr` still imports no other internal package; `cause` is never serialized; the error is logged only in `ToWire`.
- [ ] Wiring lives only in `internal/application` / `main.go`, two-phase (nil repo → `Init` real repo).
- [ ] Any new `ErrorCode` is in the `EnumBind` list; `just gen` run; no `frontend/wailsjs/` drift.
- [ ] `just check` clean for touched packages; `just build` succeeds.

## Gotchas

- A bound method that returns `(T, error)` or takes `context.Context` produces a wrong TS binding (a
  rejecting promise / a phantom `ctx` arg) — Wails strips ctx anyway; return a `*Result`.
- A handler missing the named-return + `defer/recover` lets a service panic crash the whole app —
  always add the guard mapping panic → `apperr.Internal`.
- Importing anything into `internal/apperr` breaks the import-graph check in `just check` — keep it a
  leaf; move the offending type out.
- Forgetting the phase-2 `SetRepository` in `Init(ctx)` yields a `nil` pointer on the first repo call,
  not a compile error — it fails at runtime.
- Leaking an absolute path or secret into error text: put only curated safe values (base name, an
  env-var *name*) into `Message`/`Details`; `cause` stays unexported.
- Changing a bound signature without `just gen` leaves `frontend/wailsjs/` stale and fails CI — commit
  the regenerated bindings.
