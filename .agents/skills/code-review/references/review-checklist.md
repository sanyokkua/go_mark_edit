# Review Checklist

A priority-ordered reference for reviewing a code change against the health of the whole
repository. Work top-down: a change can be stylistically perfect and still be wrong. Spend your
attention where defects are most expensive.

## Priority order

Review in this order and stop blocking once the higher tiers are satisfied:

1. **Design & correctness** — Does the change do the right thing, in the right place, the right way?
   Is the logic actually correct? Defects here are the most expensive to ship.
2. **Functionality** — Does it do what it claims for the user, including edge cases and failure modes?
3. **Unnecessary complexity** — Is it more complicated than the problem requires? Over-abstraction,
   speculative generality, premature optimization.
4. **Tests** — Is the new behavior covered? Do the tests actually assert the behavior?
5. **Naming** — Do names communicate intent clearly and consistently with the codebase?
6. **Comments** — Do they explain *why*, not restate *what*?
7. **Security / concurrency / performance** — Apply where relevant (any networked, shared-state, or
   hot-path code). Run the fast checks in `security-quick-checks.md`.
8. **GoMarkEdit invariants** — The repository's non-negotiable architecture rules (see the dedicated
   section below). A change that violates one is blocking regardless of how clean the rest is.
9. **Style** — Defer to `just lint`/formatters. Do not hand-review whitespace or import order.

Approve changes that improve overall code health even if imperfect. Distinguish must-fix
(blocking) from preference (nit). Cite technical facts, not taste.

## General correctness

- [ ] **Off-by-one / boundary errors** — loop bounds, slice indices, `<` vs `<=`, inclusive vs exclusive ranges.
- [ ] **Null / None / undefined handling** — every dereference of a value that can be absent is guarded.
- [ ] **Error handling & propagation** — errors are caught at the right level, not swallowed; failures surface to the caller; no empty catch blocks.
- [ ] **Resource cleanup** — files, sockets, connections, locks, cursors released on every path (including error paths). Prefer language constructs (context managers, try-with-resources, `defer`).
- [ ] **Edge cases** — empty input, single element, maximum size, zero, negative, unicode, very large values.
- [ ] **Return value checking** — return codes and error returns are not ignored.
- [ ] **Idempotency** — operations that may be retried (network calls, message handlers, migrations) are safe to run twice.
- [ ] **State mutation** — no surprising mutation of inputs/arguments shared with the caller.
- [ ] **Time & timezones** — no naive local-time assumptions; clock skew and DST considered where relevant.

## Concurrency

- [ ] **Shared mutable state** — every field touched by more than one thread is protected or immutable.
- [ ] **Race conditions** — check-then-act sequences (e.g. "if not exists, create") are atomic or guarded.
- [ ] **Lock ordering / deadlock** — locks always acquired in a consistent global order; no lock held across a blocking call.
- [ ] **Atomicity** — compound updates that must be all-or-nothing use transactions or atomic primitives.
- [ ] **Thread-safety of collections** — concurrent reads/writes use thread-safe collections, not plain ones.
- [ ] **async/await misuse** — no blocking calls inside async functions; CPU-bound work is offloaded.
- [ ] **Missing await** — every promise/future/coroutine is awaited or explicitly fire-and-forget with error handling.
- [ ] **Double-checked locking** — if used, the guarded field has correct memory visibility (e.g. `volatile`).
- [ ] **Visibility / memory model** — writes are visible to other threads (`volatile`, `Atomic`, synchronized, memory fences) — not just "it worked on my machine".

## Performance

- [ ] **N+1 queries** — no per-row database/network call inside a loop; batch or join instead.
- [ ] **Unbounded loops / collections** — input-driven loops and accumulating collections have a bound.
- [ ] **Repeated work in loops** — invariant computation, lookups, or allocations are hoisted out.
- [ ] **Unnecessary allocations** — no needless copies of large structures on hot paths.
- [ ] **Blocking I/O on hot paths** — request-serving threads are not blocked on slow I/O.
- [ ] **Missing pagination** — list endpoints and large queries are paginated or limited.
- [ ] **Inefficient algorithms / data structures** — `O(n^2)` where `O(n)` is easy; list scan where a set/map fits.
- [ ] **Caching opportunities** — expensive, pure, frequently repeated work is memoized where it pays off (without introducing staleness bugs).

## Tests

- [ ] **New behavior covered** — every new branch and behavior has at least one test.
- [ ] **Edge / error cases tested** — not just the happy path; failures, empties, boundaries.
- [ ] **Assert behavior, not implementation** — tests check observable outcomes, not internal calls, so refactors don't break them spuriously.
- [ ] **No flaky dependencies** — no real time (`sleep`, wall clock), network, or randomness without seeding/mocking.
- [ ] **Test names describe intent** — a failing test name tells you what broke.
- [ ] **Tests fail for the right reason** — would this test actually catch the bug it implies it covers?

## Naming, comments, complexity

- [ ] **Why-not-what comments** — comments explain rationale, trade-offs, and non-obvious constraints; they do not narrate the code.
- [ ] **Dead code** — no commented-out blocks, unreachable branches, or unused symbols left behind.
- [ ] **Over-abstraction** — no interface/factory/generic introduced for a single concrete use.
- [ ] **Deep nesting** — guard clauses / early returns instead of deeply nested conditionals.
- [ ] **Long functions** — functions do one thing; extract when a block needs its own comment to explain it.
- [ ] **Consistent naming** — matches existing conventions in the module (casing, domain terms, units in names like `timeout_ms`).

---

## Per-language checks

Concrete, language-specific smells to scan for. These complement the general checks above.

### Python

- [ ] **Mutable default arguments** — `def f(x, items=[])` shares one list across calls; use `None` + init inside.
- [ ] **Bare `except:`** — catches `KeyboardInterrupt`/`SystemExit`; catch specific exceptions or `except Exception`.
- [ ] **`==` vs `is`** — `is` only for `None`/identity, never for value equality of numbers/strings.
- [ ] **f-string / format injection** — user input formatted into SQL, shell, or HTML strings.
- [ ] **GIL: threading vs multiprocessing** — CPU-bound work using `threading` won't parallelize; needs `multiprocessing` or native extensions.
- [ ] **Context managers for resources** — files, locks, connections opened with `with`, not manual open/close.
- [ ] **Type hints** — public functions annotated; hints match actual behavior (e.g. `Optional` where `None` is returned).
- [ ] **Broad `*` imports** — avoid `from module import *` polluting the namespace.

### JavaScript / TypeScript

- [ ] **`==` vs `===`** — use strict equality except the deliberate `== null` idiom.
- [ ] **`var` vs `const`/`let`** — no `var`; prefer `const`, then `let`.
- [ ] **Floating / unawaited promises** — every promise is awaited, returned, or has `.catch`; no unhandled rejections.
- [ ] **`any` overuse (TypeScript)** — `any` defeats the type system; prefer `unknown` + narrowing or precise types.
- [ ] **Prototype pollution** — merging/assigning untrusted keys into objects (`__proto__`, `constructor`).
- [ ] **async error handling** — `try/catch` around awaited calls; `Promise.all` rejections handled.
- [ ] **`== null` checks** — deliberate `x == null` (covers `null` and `undefined`) is fine; document it if used.
- [ ] **Array mutation vs copy** — `sort`/`reverse`/`splice` mutate in place; clone if the source is shared.

### Java

- [ ] **Null handling / `Optional`** — return `Optional<T>` instead of `null` for "maybe absent"; don't `Optional.get()` without checking.
- [ ] **`equals`/`hashCode` contract** — override both together; consistent with each other; used correctly as map/set keys.
- [ ] **try-with-resources** — `AutoCloseable` resources closed via try-with-resources, not manual `finally`.
- [ ] **Concurrency: `synchronized`/`volatile`/`Atomic`** — shared mutable fields are guarded; visibility ensured.
- [ ] **Checked exceptions swallowed** — no empty `catch (Exception e) {}`; at minimum log with context and rethrow/handle.
- [ ] **Stream misuse** — no side effects in `map`/`filter`; streams not reused after a terminal op; parallel streams justified.
- [ ] **Resource leaks** — streams, readers, connections, executors shut down.

### Go

- [ ] **Errors not ignored** — `_ = f()` discarding an error is intentional and justified; wrap with `%w` for context.
- [ ] **Goroutine leaks** — every goroutine has a clear exit; channels/contexts let it terminate.
- [ ] **Nil map writes** — writing to a `nil` map panics; map is initialized with `make`.
- [ ] **`defer` in loops** — `defer` accumulates until function return; in long loops, close explicitly or refactor.
- [ ] **Context propagation** — `context.Context` is the first argument and is passed down to I/O calls.
- [ ] **Data races** — shared variables touched by goroutines use channels, `sync.Mutex`, or `sync/atomic`.
- [ ] **Loop variable capture** — closures capturing the loop variable (pre-Go 1.22 semantics) capture by reference.

### SQL

- [ ] **Injection via concatenation** — queries built by string concatenation of user input; use parameterized queries.
- [ ] **Missing indexes** — new query filters/joins on unindexed columns at scale.
- [ ] **`SELECT *`** — selects only needed columns; avoids fragility and over-fetching.
- [ ] **N+1** — set-based query instead of one query per row.
- [ ] **Transaction scope** — multi-statement invariants wrapped in a transaction with correct isolation.

### Shell

- [ ] **Unquoted variables** — `"$var"` quoted to survive spaces and globbing.
- [ ] **`set -euo pipefail`** — scripts fail fast on errors, unset variables, and pipeline failures.
- [ ] **Command injection** — no `eval` or unquoted interpolation of untrusted input into commands.
- [ ] **Word splitting / globbing** — intentional; otherwise quoted.
- [ ] **Exit codes checked** — important commands' exit status is checked, not assumed.

---

## GoMarkEdit invariants

Repository-specific rules that a change must not violate. Each maps to a `.claude/rules/*` and the
authoritative spec (`specification/**`, ADRs `0001–0012` in `specification/08_Decisions/` plus the
accepted implementation ADRs in `docs/adr/`, `0013+`). A violation is **blocking**. Grounding:
the spec under `specification/` is frozen — review against it, and never propose editing it.

### Backend layering + error envelope (`go-backend-architecture.md`, `go-error-envelope.md`)

- [ ] **Strict Handler → Service → Repository** — a handler calls its service; a service calls its
      repository; a handler never reaches a repository/DB directly, and no cross-layer shortcut.
- [ ] **Bound handler shape** — every Wails-bound method returns a concrete `apperr.*Result` (never
      `(T, error)`), takes **no `context.Context` parameter**, and has a named return +
      top-level `defer/recover` mapping a panic to `apperr.Internal(...)` (`CodeInternal`).
- [ ] **Inner services keep `(T, error)`** and take `ctx` as the first param; the envelope is a
      handler-boundary concern only.
- [ ] **`internal/appmodel` is the single source of truth** (DD-62, ADR-0014) — model truth (open docs +
      canonical content, tabs, workspace ref, UI/layout) is held nowhere else; commands mutate it under
      its mutex and emit `state:patch`; it composes the I/O verticals rather than duplicating them; the
      backend never echoes buffer text into the focused editor (DD-64).
- [ ] **Wiring only in `internal/application`** (two-phase: nil repos in the constructor, real SQLite
      repos injected in `Init(ctx)`) and `main.go`. Nowhere else wires concretes.
- [ ] **`internal/apperr` imports no other internal package**; `cause` stays unexported/never
      serialized; no secret/token/full URL in `Message` or `Details`.
- [ ] **Bound-signature change → `wails generate module` (`just gen`)** run, with **no `frontend/wailsjs/`
      drift** committed. New `ErrorCode` added to the `EnumBind` list in `main.go`.

### Persistence (`go-persistence-sqlite.md`)

- [ ] **CGO-free driver** — `modernc.org/sqlite` only; never `github.com/mattn/go-sqlite3` or any CGO
      driver (breaks `wails build` cross-compilation).
- [ ] **No single-instance flock** / `.lock` file / "already running" branch — GoMarkEdit is
      multi-instance (WAL + `busy_timeout`, `SetMaxOpenConns(1)`).
- [ ] **Additive-only migrations** — new nullable column / new table / new index; **never**
      `UPDATE`/backfill/`DROP`/`ALTER … DROP`/row rewrite. Numbered goose files, run on `db.Open`.
- [ ] **sqlc `internal/db/store/` never hand-edited** — regenerate with `sqlc generate` after query
      changes; treat as build output.
- [ ] **Small prefs use the generic KV table** `settings(key,value,type)` (incl. `window.*`/`ui.*`
      layout state) — no new table/migration for a handful of scalars.

### Frontend (`ts-redux-adapter.md`, `ts-theming-tokens.md`)

- [ ] **No `wailsjs/` import outside `logic/adapter/`** — not from a component, slice, thunk, hook, or
      util. Each generated binding is wrapped once with `guardArity`; envelopes flow through `unwrap`.
- [ ] **One slice per feature** in `logic/store/`; thunks typed `<T, Arg, { rejectValue: WireError }>`.
- [ ] **The Redux store is a projection, not a source of truth** (DD-62/DD-63) — hydrated once via
      `GetState`, reconciled by `state:patch`; UI interactions are **commands**, never optimistic
      local-truth mutations; **no document content in any slice** (metadata only); the visible Monaco
      buffer debounce-syncs via `UpdateBuffer` and is flushed on blur/switch/close/save (DD-64).
- [ ] **Token-only theming** — every color/spacing/radius is a `var(--…)` token in
      `ui/styles/tokens.css` keyed by `data-theme`×`data-mode`; zero hardcoded colors/hex/`rgb()`
      outside `tokens.css`; attributes set on `document.documentElement` only (`auto` resolved first).
      No user-authored/runtime themes (exactly the three shipped).

### Offline / privacy (`offline-and-privacy.md`)

- [ ] **No background/unsolicited network** — no update check, telemetry, analytics, crash upload, or
      CDN/font fetch; rendering assets are bundled locally. The **only** allowed outbound call is a
      **user-invoked Stage-3 LLM inference** to the user-configured provider (default local). Stages
      1–2 make zero network calls. No telemetry/auto-update, ever.
- [ ] **LLM secret handling** — env-var **name** only, resolved at call time; never persisted/logged;
      unset → `missing_credential`, no unauthenticated request.
- [ ] **Single-flight gate** — at most one inference app-wide (`internal/gate`); held → `apperr.Busy()`;
      released in a `defer` on every exit. Agent loop is bounded and checks `ctx.Err()` each iteration
      and before each tool dispatch.
- [ ] **Local assets go through the guarded `internal/assets` handler** (allowlist + traversal
      rejection); remote document assets stay gated by the content policy.

### Traceability (`traceability-and-stories.md`)

- [ ] **New behavior is traced** — a story under `docs/stories/` cites real spec clauses + module
      paths from `01_MODULE_INVENTORY.md`, and each proving test carries a
      `// Proves: STORY-NNN-AC-N` (Go) or `it('STORY-NNN-AC-N …')` (Jest) tag.
- [ ] **Spec is frozen** — the change does not edit `specification/**`; normative behavior defers to it.
      A change that needs an earlier contract altered is a new story (+ ADR `0013+` in `docs/adr/`).
