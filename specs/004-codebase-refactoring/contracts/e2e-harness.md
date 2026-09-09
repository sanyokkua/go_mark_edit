# Contract: real-backend end-to-end harness

Requirements: FR-025, FR-026, FR-031 (archive runs), SC-002, SC-007, SC-014. Owner:
`frontend/tests/support/harness.ts` (a Playwright fixture: launch, relaunch, teardown),
`frontend/tests/support/profile.ts` (seeding through `tools/e2e-seed`),
`frontend/playwright.config.ts`, and the Go program `tools/e2e-seed`.

## Launch (one application per case)

1. Create a temporary directory `T`; export `HOME=T` on macOS or `XDG_CONFIG_HOME=T` on Linux for the
   child process only. The dev build resolves its profile to `T/Library/Application Support/GoMarkEdit-Dev/`
   (macOS) or `T/GoMarkEdit-Dev/` (Linux); `settings.db` and `logs/` live there.
2. Seed the profile (below) and create the temporary document folder `D` with the case's files.
3. Spawn `wails dev -devserver localhost:34115 -nocolour` with that environment from the repository
   root, or from the directory named by `E2E_REPO` when set (the archive worktree of FR-031); wait
   until `GET http://localhost:34115/` returns the page and the page has `window.go`; fail the case
   after 120 seconds.
4. Playwright (Chromium, `retries: 0`, `forbidOnly: true`, `workers: 1`, viewport 1280×720 unless the
   case sets another) drives the page; bindings and events work over the dev server's IPC websocket.
   `wails dev` also shows the application's own native window, a second frontend on the same backend
   that stays idle; a case never relies on it and never counts its calls. Because that window's
   frontend usually sends `WindowReady` first, the backend treats a repeated `WindowReady` as
   idempotent (Retry needs the same rule), and a case that needs "never ready" uses a lever that
   fails `Init` for both frontends (cases 2, 3). Each case below states what the second frontend
   does where it could count.
5. A case that asserts state after a restart calls the fixture's relaunch (steps 3–4 again with the
   same `T`). Teardown kills the process tree (`wails dev` and the app it launched) and deletes `T`
   and `D` unless `KEEP_E2E_ARTEFACTS=1`.

Each case launches its own application because cases differ in profile contents before launch. The
binary contains no test hook, flag, debugging port or build flavour; no tier automates a native
dialog; files are opened through the Recents menu.

## Spikes and their consequences (research R8)

| Spike (confirmed by the first harness task) | If it fails |
|---|---|
| `wails dev` does not relaunch the application after a quit | the harness records the app child's PID from the `wails dev` output, asserts process exit on that PID, and kills any relaunched child at teardown; cases 2, 3 and 5 are otherwise unchanged |
| the `assetserver.Options.Handler` route is reached in browser mode | case 7 keeps its placeholder assertions; the rendering half moves to walkthrough step 9, and a Go integration test of the route handler proves the folder rule, the 20 MB bound and the 404 |

## Seeding tool: `go run ./tools/e2e-seed <profile-dir> <command> …`

| Command | Effect |
|---|---|
| `seed-recents <file>…` | opens/creates the database through `internal/db.Open` (applies migrations) and writes the `recent.files` row (`{"version":1,"entries":[…]}`, up to 6 entries) with the production key-value helper |
| `add-trigger appearance` | installs `CREATE TRIGGER e2e_reject BEFORE INSERT ON settings WHEN NEW.key LIKE 'appearance.%' BEGIN SELECT RAISE(ABORT, 'e2e'); END;` and the matching `BEFORE UPDATE` trigger (the model's `layout.*`, `recent.*` and `document.view.*` rows are unaffected) |
| `hold-lock <seconds>` | opens the database, runs `BEGIN IMMEDIATE`, and holds the transaction until `SIGTERM` or the timeout, then rolls back |

The tool reuses production packages; it is not part of the binary.

## Cases and levers (FR-026)

Levers are limited to profile database contents and permissions (a held exclusive transaction on the
harness's own profile database counts as contents — owner decision 2026-09-08), document file
permissions, and folder layout. A FIFO document path provokes nothing (the backend refuses
non-regular files before reading) and is not used.

| # | Case | Setup and lever | Steps | Assertions |
|---|---|---|---|---|
| 1 | Preview-link activation with bridge continuity | `D/a.md` with `[top](#top)`, `[next](./next.md)`, `[out](../outside.md)`, `[web](https://example.com)`, `[mail](mailto:x@y)`, `[file](file:///etc/hosts)`; `D/next.md`; recents seeded | open `a.md`; activate each link; then create an untitled document containing `[rel](./next.md)` and activate it | `page.url()` unchanged after every activation; a `GetState` call answers; `next.md` opened in a tab; anchor scrolled the preview; `https` recorded as a `BrowserOpenURL` call on the page's `window.runtime` (a page-level stub; no navigation); `out`, `mail`, `file` and the untitled document's `rel` each produce one warning notice naming the target and the reason, auto-dismissing, and open nothing; the editing session keeps its text. `javascript:` and `data:` targets are proved by the unit test of the link classifier (the sanitiser strips such hrefs before they can be activated) |
| 2 | Close request before the frontend is ready | a **directory** at `…/GoMarkEdit-Dev/settings.db` → `Init` fails → startup-failure screen (frontend never ready) | on the failure screen call `window.runtime.Quit()` | refactored tree: the process exits (nothing unsaved), asserted on the app child's PID; the case then repeats with the directory replaced after the request but before Retry: after Retry the pending request is discovered and the app exits or prompts. Archive run: the process stays alive and no event is delivered. Second frontend: the native window fails `Init` the same way, so no `WindowReady` reaches the backend from either side |
| 3 | Failed startup → Retry → quit | same directory lever | assert the screen names "Settings" with a category and offers Retry and Quit; harness removes the directory; click Retry; shell mounts; click Quit (or ⌘Q via `runtime.Quit()`) | the failure message contains no path; one attempt at a time (a second Retry click while running is ignored); the process exits after quit. Second frontend: the native window stays on its failure screen (nobody clicks its Retry), so the Chromium page's `WindowReady` is the one that marks ready; the clean acknowledgement that lets the process exit comes from the Chromium page only |
| 4 | Isolated settings rejection | `add-trigger appearance` after seeding; model rows present | open the app (model loads); change the theme in Settings | classified error shown once; the previous appearance stays applied; after restart the previous values are read back (Story 1 scenario 8). The *read* half (settings read fails after a successful model load, Retry re-reads) is split: frontend integration (rejected settings promise then a fresh attempt) + Go integration (failing repository implementation) |
| 5 | Lost cancellation | none for the round trip; `CancelQuit` ordering is in-memory | `runtime.Quit()` with a dirty document → close decision UI → Cancel → `runtime.Quit()` again | a second, distinct close decision appears (the first request was acknowledged as cancelled). Ordering half split: frontend integration with a deferred `CancelQuit` resolution asserts `pendingClose` stays until resolution; Go integration asserts a stale id is refused. Second frontend: the native window receives the same `application:close-requested` and shows its own decision UI, which nobody answers; only the Chromium page sends `CancelQuit`/`AuthorizeQuit`, and the case counts the events and calls of the Chromium page only |
| 6 | Late bridge completion | `hold-lock 14` started just before `OpenRecentFile` (a second process holds an exclusive transaction; the recents promotion retries against the 5-second busy timeout) | open a seeded file from Recents; wait | a stuck notice for that request appears within 11 s of the call; the lock is released at ~12 s; the open completes, the tab appears, the notice withdraws, no duplicate tab; variant A: click Retry at 10.5 s → still exactly one tab; variant B: click Cancel → the tab still appears silently. Second frontend: the native window issues no `OpenRecentFile`; the notice and the single-tab assertion are read from the Chromium page, which also receives the resulting `state:patch` |
| 7 | Local image renders; web and outside images show the placeholder | `D/doc.md` referencing `./inside.png`, `../outside.png`, `https://example.com/x.png`, `./huge.png` (21 MB); untitled document with `./inside.png` | open `doc.md`; open a new untitled document with the same text | `img[alt=inside]` has `naturalWidth > 0`; the other three show the placeholder with the alt text and no notice; the untitled document shows the placeholder; the network log records no request to `example.com` |
| 8 | Computed style and theme | none; the six combos are selected through the Settings menu in the page (as the ported `appearance` journey does) with `page.emulateMedia({colorScheme})` for `auto` | for each combo, open every menu family (File, Settings, View, About, tab context, editor context, toolbar overflow at 700 px, Document details) by pointer and by keyboard | `getComputedStyle(popup).boxShadow` equals the resolved `--win-shadow` of the combo; the focus ring is on the focused item only; the trigger's second click closes the menu |

Each case runs exactly once per stage run; a timing failure fails the stage.

## Regression cases for Story 1 that run here

Scenarios 6, 7, 9–15, 17, 18 of Story 1 run as E2E cases (see plan.md); their archive run executes
the same case with `E2E_REPO` pointing at a worktree of `bc185c9`, so `wails dev` starts from that
worktree.

## Ported journeys (FR-033)

The eight behavioural Playwright journeys are ported here against the real backend: real File menu
New/Open (through Recents), explicit Save flush, real tabs with backend-confirmed moves, Reveal and
Copy-path remediation, Retry on a refused Save, bounded external-change prompt, window-shell matrix
(width × theme × mode), narrow-width overflow, core-editor round trip, editor-stage reachability,
launcher from the binding, appearance changes, deferred controls unavailable-not-absent. The
five-minute network watch is not ported (covered by the offline walkthrough step and the
no-network lint).

## CI

The push runner skips this stage (`--skip e2e`). The release runner (macOS) runs it as a blocking
check; the Chromium browser is installed by `scripts/build setup --with-browser`.
