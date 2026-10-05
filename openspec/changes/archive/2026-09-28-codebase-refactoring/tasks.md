# Tasks

> Reconstructed after the fact from the specification and the delivered code; the original task list was not kept in this form.

## 1. Verification scripts, hooks and CI

- [x] 1.1 Add the five entry scripts (`build`, `test`, `verify`, `format`, `baseline`) with shared libraries and a results parser in `tools/verify/results.mjs`
- [x] 1.2 Add thin `just` aliases, git hooks and the `push` and `release` workflows; declare the toolchain in `go.mod` and `.nvmrc`
- [x] 1.3 Record a baseline before refactoring and refuse unreliable records

## 2. Shutdown and bridge requests

- [x] 2.1 Implement the shutdown owner in `internal/application/shutdown.go` and `frontend/src/app/useShutdown.ts`
- [x] 2.2 Add `internal/bridge` (request identity, outcome cache, guard, failure constructor) and the adapter wrapper with pacing, Retry and Cancel stuck notices

## 3. Document lifecycle owner

- [x] 3.1 Consolidate per-document state into one record with a single disposal exit; order Save, Save As and autosave through one write queue
- [x] 3.2 Fix the audited defects (locked refusal text, autosave errors surfaced, typed file identity on macOS, link and focus handling) with regression tests
- [x] 3.3 Add the transactional key-value helper and fix layering with dependency rules

## 4. Real-backend end-to-end tests

- [x] 4.1 Build the Playwright harness that launches `wails dev` with a redirected profile, and the `tools/e2e-seed` tool
- [x] 4.2 Port the user journeys and add fault-lever cases; delete the mock, parity and evidence stacks

## 5. Shared components

- [x] 5.1 Build Popup, MenuItem, Bar, Island, ToolButton, Button, TabBar, Pane, Sidebar, ModalShell, Segmented, Icon
- [x] 5.2 Build the StatusBar facts model and the Notifications surface
- [x] 5.3 Decompose the oversized widgets and move every consumer onto the shared components

## 6. Tests and lint

- [x] 6.1 Move tests to `tests/go` and `frontend/tests` (unit, integration, e2e), retitle by behaviour, delete source-text, CSS-text, DTO-shape and documentation assertions
- [x] 6.2 Add the lint rules (archlint, ESLint, stylelint, token and repository rules) and the bundle scan

## 7. Authority, cleanup and close

- [x] 7.1 Write the architecture map and rewrite project instructions; remove the legacy workflow and committed evidence trees
- [x] 7.2 Record the baseline comparison, packaged-app walkthrough, offline cold start and release dry run

## 8. Synchronized scrolling

- [x] 8.1 Add the scroll map, controller and ports in `frontend/src/logic/scrollSync/` and wire them into the editor and preview, with the View-menu toggle and an E2E case
