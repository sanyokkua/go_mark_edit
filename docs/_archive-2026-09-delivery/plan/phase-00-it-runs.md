# Phase 00 — The app opens

**Status: done.**

## What you get

A real native window opens with an embedded React app inside it, and closes cleanly. Nothing is in the
window yet — that is the point. Everything the rest of the product needs is underneath it.

## What was built

- A Wails v2 desktop app: Go backend, embedded React/TypeScript frontend, one composition root.
- The error envelope — every bound method returns a concrete `apperr.*Result`, so no Go error or stack
  trace ever crosses into the frontend.
- Two-phase dependency injection in `internal/application`: the object graph is built with nil
  repositories, then real ones are injected after the database opens.
- Local file logging, with dev builds isolated from release builds so they never share a database.
- Pure-Go SQLite (no CGO), WAL mode, busy timeout, additive migrations, and no single-instance lock —
  several windows can run at once.
- A typed settings store that survives a missing, malformed or unknown value by falling back per
  setting rather than discarding the lot.
- The frontend adapter layer: the only place allowed to import the generated `wailsjs/` bindings.
- A dev mode that runs the frontend alone against a mock bridge, with no Go backend at all.
- The three-region window shell with the right-hand assistant region reserved and empty.

## Where the details are

- Architecture: `../architecture/README.md`, `../architecture/structure.md`, `../architecture/rules.md`
- Wails specifics: `../architecture/rules.md#handler-returns-a-result`
- Decisions: Wails v2 and a CGO-free Go backend (`../adr/0001-wails-v2-cgo-free.md`); several windows
  at once with no single-instance lock (`../adr/0006-multi-instance.md`); settings in a SQLite
  key-value store (`../adr/0004-state-file-first-kv.md`)

## Known debt carried forward

- The three-region shell is "proven" by a test that mocks the component under test. Phase 03 rebuilds
  the chrome and must replace that with a real one — see `KNOWN_ISSUES.md` §4.
- `tokens.css` exists but contains no colour. That is Phase 02.

## Done when

Done. `just build` produces an app that opens a window and closes cleanly.

And the constraints every phase carries: watch the network for five minutes and confirm nothing is
sent; confirm the app opens even when the log folder cannot be written; confirm no user-visible string
is hard-coded. All of it in a real build.
