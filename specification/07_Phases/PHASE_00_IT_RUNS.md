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

- Architecture: `02_Architecture/01_SYSTEM_ARCHITECTURE.md`, `02_BACKEND_GO.md`, `03_FRONTEND_REACT.md`
- Wails specifics: `02_Architecture/04_WAILS_INTEGRATION.md`
- Decisions: DD-01…DD-03 (platform, CGO-free), DD-08 (multi-instance), ADR-0001…0006

## Known debt carried forward

- The three-region shell is "proven" by a test that mocks the component under test. Phase 02 rebuilds
  the chrome and must replace that with a real one — see `docs/KNOWN_ISSUES.md` §4.
- `tokens.css` exists but contains no colour. That is Phase 02.

## Done when

Done. `just build` produces an app that opens a window and closes cleanly.
