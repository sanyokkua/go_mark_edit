# Feature Specification: Codebase Refactoring

**Feature Branch**: `feature/004-codebase-refactoring`

**Created**: 2026-09-08

**Status**: Draft

**Input**: User description: "Create a new specification/feature where we refactor the current codebase. No new functionality is expected. Fix the issues described in `docs/audits/2026-09-07-project-health-audit.md`: fix all known bugs; implement common components and reuse them; clean up the tests, removing bureaucracy tests and keeping only real functionality tests; fix the e2e tests so they run against the real backend instead of a stub; remove god objects and fix folder and component structure; fix code documentation and remove requirement and task IDs from code and tests; rewrite the project-level agent docs, skills, rules and commands (not the Spec Kit files); rewrite the scripts; clean the repository of generated temporary files and screenshots; remove the old `feature/v1-implementation*` branches, using `app_version_1_codebase` as the release branch and `feature/<NNN>-<short-description>[-<task>]` for feature and task branches."

## Glossary

Plain meanings of the words used in this document.

- **Backend**: the Go program that owns the application state, reads and writes files, and stores settings.
- **Frontend**: the React screen shown inside the native window.
- **Bridge**: the Wails channel through which the frontend calls the backend and receives its events.
- **Adapter**: the one frontend folder (`frontend/src/logic/adapter/`) allowed to talk to the bridge.
- **Projection**: the frontend's read-only copy of the backend state. The backend is the source of truth; the frontend copy only mirrors it.
- **Composition root**: the single place where the parts of the backend are wired together (`main.go` today).
- **Shared component**: one piece of UI (for example a popup) with one implementation that every screen area uses.
- **Consumer**: a screen area that uses a shared component.
- **Stage**: one step of verification (Build, Unit tests, Integration tests, End-to-end tests, Lint, Format).
- **Entry-point script**: one of the five scripts that run the stages; every hook, CI job and `just` alias calls these scripts and nothing else.
- **Test root**: a directory that holds only tests, separate from production code.
- **Black-box test**: a test that uses only the public interface of the code it tests.
- **White-box test**: a test that reaches inside the package it tests (unexported functions and fields).
- **Regression test**: a test that fails on the old code (the archived tree) and passes on the fixed code.
- **End-to-end (E2E) test**: a test that starts the real application (Go backend plus frontend) and drives it like a user.
- **Mock bridge**: a TypeScript imitation of the backend (`frontend/src/dev/bridge-mock`) that today's browser tests run against instead of Go.
- **Pixel-parity harness**: the test stack that compares screenshots of the application with a static HTML mockup, pixel by pixel.
- **Evidence**: logs, screenshots and reports committed under `specs/*/evidence` and `docs/audits/*-evidence` to prove earlier work.
- **Authority**: the one place that says what the product must do. After this feature it is `specs/<feature>/` plus a short architecture map.
- **Archived tree**: the code as it was before this feature, kept under the git tag `archive/v1-linear-history-2026-09` (commit `bc185c9`).
- **Owner**: the project owner (the person who accepts this feature).
- **Agent**: an AI coding assistant working from the repository's instruction files.

## Background

### Where the project stands

GoMarkEdit is a native, offline Markdown editor: one Go process shows a React screen in a native window. Three finished features exist (001 product foundation, 002 editor stage, 003 real files and tabs). Their code is now on the release branch `app_version_1_codebase` as three squash commits, and the granular history is kept under the tag `archive/v1-linear-history-2026-09`.

On 2026-09-07 the owner audited the project (`docs/audits/2026-09-07-project-health-audit.md`, revision 2.2). The audit confirmed the owner's concerns:

- **The prescribed component library was never built.** The original specification asked for shared Button, IconButton, TabBar, Toolbar, MenuBar, ContextMenu, Popover and Tooltip components. None exists. Instead there are six copies of popup styling, ten copies of popup open/close behaviour, four copies of dialog behaviour and eleven button styles. The visible result is the owner's screenshots: a menu that loses its shadow and shows a focus ring, a tab menu that opens in the wrong place, menus that look different from each other.
- **Verification never touched the real application.** The tests called "E2E" run against a 2,351-line TypeScript imitation of the backend. One fifth of all test code compares screenshots with a static mockup. Meanwhile eight real defects shipped: Save destroys Undo, Save As and autosave can overwrite newer content with older content, autosave failures are silent, and a preview link can strand the application on its failure screen with a window that cannot be closed.
- **Tests sit beside production code and are named after tickets.** All 66 Go test files live inside production packages; 72 frontend test files live under `frontend/src`; one test file ships inside the binary. 520 of 715 frontend test titles start with a task or requirement ID (for example `T045`, `FR-FT-015`). Some tests check bureaucracy instead of behaviour: one counts lines in a specification file, another runs `go build` inside `go test`, others assert CSS text or DTO field order. 489 task and requirement IDs also sit in production source comments.
- **The backend's document lifecycle has no single owner.** The document service keeps ten maps and eight counters in sync by hand; closing a document forgets three of them. Test-only hooks are part of the production API. The same guard, error and wiring code is copied dozens of times.
- **Tooling is spread thin.** 34 `just` recipes; the list of verification steps is defined six times in scripts and five times in prose; `just fmt` formats less than half the repository; a build leaves generated files modified; CI re-lists the steps by hand and never builds or runs the real application; the release job is a placeholder.
- **Instructions and authority conflict.** Four documents give four answers to "what is normative". Agent instructions reference commands and files that no longer exist. One third of `AGENTS.md` is dated incident stories. Two incompatible workflows are both live.
- **The repository carries its own history as weight.** About 56 MB of committed evidence and screenshots against about 3 MB of product code, a tracked Playwright artefact at the root, a contradictory `.gitignore`.

### The owner's principles (the yardstick for this feature)

1. **Offline by construction.** The packaged application starts and works with networking disabled; every asset the application itself needs is inside the binary, and the application never makes a network request on its own. Content that a document references from the web may load under the user's remote-content setting, and the future assistant may use the network; neither breaks the promise that the application runs without internet.
2. **One implementation per common behaviour.** A common behaviour or style has exactly one implementation that every consumer uses. Changing it is a one-place change. A theme changes appearance, never behaviour.
3. **Six stages, five shared scripts, thin `just` aliases.** Build; Unit tests; Integration tests; E2E against the real Go backend; Lint; Format. Plus a Baseline capture before an agent starts. Hooks and CI call the same scripts.
4. **Tests live apart from production code and prove behaviour.** Separate test roots. No test of DTO shape, source text, CSS text or specification documents.
5. **Self-describing names and documentation.** A test title is a sentence that describes the behaviour. Comments explain public behaviour and non-obvious rules, not task numbers or history.
6. **One authority, current instructions.** One place says what is normative. Instructions reference only commands and files that exist.
7. **The product promises survive.** Native, offline, cross-platform Markdown editor and viewer; three themes × light/dark/auto; files, tabs, workspaces; later an optional local-first assistant.
8. **Guidance explains intent; tools enforce mechanical rules.** Keep it simple, do not repeat yourself, one responsibility per part. Find the existing owner of a behaviour and improve it. Formatting, syntax and import rules belong in tooling, not in prose. Routine reversible decisions need no permission request.

### What already works and must stay

These boundaries held during the earlier features and are not to be changed:

- The Go backend owns the application state; the frontend copy is a projection updated by backend events, and every user action crosses the bridge as a command.
- Only the adapter folder imports the generated bridge bindings.
- Every bridge handler returns one typed result envelope, takes no context parameter, and recovers from panics.
- Every colour is a token in `frontend/src/ui/styles/tokens.css`.
- The binary uses CGO-free SQLite; migrations only add, never rewrite; several windows can run at once with no lock.
- File writes are atomic, keep permissions, line endings and byte-order marks, and detect external changes.
- Rendered Markdown is sanitised.
- Every unbounded input has a numeric bound and a visible refusal.

### Branch layout after this feature

- `master`: protected; receives the finished application later.
- `app_version_1_codebase`: the release branch; one squash commit per finished feature.
- `feature/<NNN>-<short-description>`: one branch per feature, from `app_version_1_codebase`.
- `feature/<NNN>-<short-description>-<task>`: one branch per task, from the feature branch.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The editor never loses work or strands the user (Priority: P1)

A person edits Markdown files in GoMarkEdit. Whatever they do (save, save as, let autosave run, open a file twice, click a link in the preview, close the window while the app is starting), the editor keeps their text, their undo history and their focus, tells them when something failed, and always lets them close the window.

**What is wrong today** (every item was reproduced by the audit):

- *Save As while autosave is running.* The two writes finish in the wrong order. The new file is reported as clean while it holds the older text, and the old file holds the newer text. Closing the tab then discards the newer text. (`internal/appmodel/save.go`, `write_coordinator.go`)
- *Refusal message without the lock.* When a stale Save is refused, the message is built by reading the document map without holding the lock. The race detector confirms a data race with a concurrent New Document; Go can abort the process on a concurrent map access. (`save.go:701`, `file_lifecycle.go:66`)
- *Closed documents keep their text forever.* Close never deletes the per-document write coordinator, which holds the full saved text and its encoded bytes. The 40-document limit does not bound this memory. (`close_plan.go`, `write_coordinator.go`)
- *Autosave fails silently.* Preparation errors, normalisation outcomes and the whole write outcome of an autosave are discarded. The error channel exists but autosave never uses it. (`autosave.go:204–227`)
- *A hard link opens a second tab on macOS.* File identity falls back to the path spelling because the helper accepts only unsigned device and inode fields and Darwin's device id is signed. (`internal/file/paths.go:115–130`)
- *Save destroys Undo.* After every successful Save the frontend replaces the editor buffer; the editor is keyed on `documentId:content`, so it remounts, and the undo history, selection and focus are lost. Confirmed on the native build. (`App.tsx:1283–1300`, `EditorView.tsx:505`)
- *A clean opened file shows "Not saved".* The Open event is built from raw metadata whose status is empty; the frontend shows `not-saved` for an empty status. (`file_lifecycle.go:371–379`, `DocumentIdentity.tsx:42–43`)
- *A rejected Appearance update half-persists.* Three separate upserts without a transaction: the theme is committed while later fields fail, and the partial state survives a restart. (`internal/settings/repository_sqlite.go:139–167`)
- *A menu opened with the mouse loses its shadow and shows a focus ring.* The global `*:focus-visible { box-shadow: var(--focus-ring) }` rule in `base.css` replaces the popup's elevation shadow because the opened menu becomes the focused element. Keyboard-opened menus keep the shadow. (`frontend/src/ui/styles/base.css:104–107`)
- *A second click on a menu button behaves differently per menu.* File, About and View stay open; Settings toggles. (`ShellMenuRow.tsx`, `SettingsMenu.tsx`)
- *The tab context menu ignores where you clicked.* It is always drawn at the top-right of the shell; its keyboard shortcuts are stored but never shown; near the minimum window width menus are clipped; the status bar's Details popup omits the word count it dropped from the row. (`DocumentTabs.tsx:1217–1220`, `TabContextMenu.tsx:253–266`, `minimumWindow.ts`, `StatusBar.tsx`)
- *A preview link replaces the application.* Links in the rendered preview are ordinary anchors. Clicking a relative link navigates the whole page. In development mode the dev server answers with the app's index page without the bridge scripts, so React restarts without the bridge and shows the startup-failure screen; Retry cannot restore the bridge. (`MarkdownView.tsx`, `logic/markdown/renderer.ts:39–53`)
- *The window cannot be closed after a failed start.* The backend emits the close request once and vetoes native close; the frontend only listens once startup succeeded; later close requests are vetoed without a new event. The startup-failure screen offers only Retry. On macOS, Quit goes through the same veto. (`internal/application/close_coordinator.go`, `App.tsx:1962–1969`)
- *Retry repeats a cached failure.* The settings projection keeps its rejected promise; Retry never disposes it, so a settings failure after a successful model load is never retried. (`logic/store/settingsProjection.ts`)
- *Every startup failure is called a settings error.* Adapter, model, settings, window-ready and subscription failures collapse into one message about local settings, which points diagnosis at the database. (`App.tsx:159–185`, `en.json:69`)
- *Pending bridge calls never settle; cancel is reported early.* Generated bridge calls have no timeout; the frontend clears its "close pending" flag before the backend confirms the cancellation, so the two sides can disagree. (`App.tsx:833–840`)

**Why it matters**: these are the defects a user meets in the first hour with real files. Every later feature (rendering, folders, OS integration, assistant) builds on save, close and startup. The audit also showed that no existing test could have caught them, which is why Story 2 is the same priority.

**Why this priority**: data loss and a window that cannot close are the most serious defects an editor can have.

**Independent Test**: each defect has a scripted scenario below; run it on the archived tree (it fails) and on the refactored tree (it passes). The link and close scenarios are run on both the development host and the packaged binary.

**Acceptance Scenarios**:

1. **Given** a document with unsaved edits and autosave enabled, **When** the user runs Save As to a new path while an autosave is still writing, **Then** the new path holds the newest text, the old path is unchanged after the autosave that was already committed, and the tab shows clean only when the file on disk matches the editor.
2. **Given** two documents, **When** a stale Save on one and New Document on the other run at the same time under the race detector, **Then** no data race is reported and the refusal message names the right document.
3. **Given** forty documents opened, edited, saved and closed, **When** the test inspects the backend afterwards, **Then** no per-document coordinator, timer, token, reservation, normalisation or conflict record remains.
4. **Given** autosave is enabled and the file becomes unwritable, **When** the next autosave runs, **Then** the user sees the same classified error (category and remediation) that a manual Save would show, shown once, and a later successful autosave shows nothing.
5. **Given** a file and a hard link to it on macOS or Linux, **When** the user opens the link while the file is open, **Then** the existing tab is focused and no second tab appears.
6. **Given** a document with edits and an undo history, **When** the user saves with the keyboard shortcut, **Then** the caret, selection, focus and undo history are unchanged and Undo still reverts the last edit.
7. **Given** a clean file on disk, **When** the user opens it, **Then** the status shows "Saved".
8. **Given** an Appearance update where a later field is rejected, **When** the application restarts, **Then** every Appearance field has the value it had before the rejected update.
9. **Given** any menu family and any theme, **When** the menu is opened with the mouse or the keyboard, **Then** the computed style shows the elevation shadow and the focus ring appears only on the focused item.
10. **Given** any open menubar menu, **When** the user clicks its trigger again, **Then** the menu closes; and arrow, Home, End, Escape and typing behave the same in every menu family.
11. **Given** a tab, **When** the user right-clicks it or presses the context-menu key while it is focused, **Then** the menu opens at the pointer (or at the focused tab), stays inside the application frame, and shows each item's shortcut.
12. **Given** the window at its minimum width, **When** any menubar menu opens, **Then** the whole menu is visible inside the frame.
13. **Given** the status bar has dropped a fact for lack of space, **When** the user opens Details, **Then** the dropped fact (for example word count) is listed.
14. **Given** a document with an in-document anchor link, a link to a sibling Markdown file, an external `https` link and an unsupported link, **When** the user activates each in the preview, **Then** the anchor scrolls the preview; the sibling file opens in a tab through the normal open flow; the external link opens in the system browser after the user's explicit action; the unsupported link is refused with a visible message; and in every case the application page, the bridge and the editing session stay intact. Verified on `wails dev` and on the packaged binary separately.
15. **Given** the application shows the startup-failure screen, **When** the user closes the window or quits, **Then** the application exits.
16. **Given** a close request arrived while the frontend was loading, **When** the frontend finishes loading (or Retry succeeds), **Then** it discovers the pending request and handles it like a fresh close.
17. **Given** the model loaded but reading settings failed, **When** the user presses Retry, **Then** settings are read again (a fresh attempt), and only one attempt runs at a time.
18. **Given** a startup failure in the adapter, the model, the settings or the window-ready step, **When** the failure screen appears, **Then** it names the failed step and offers a recovery action that fits it.
19. **Given** a close request the user cancels, **When** the backend has not yet confirmed the cancellation, **Then** the frontend still reports the request as pending, and the two sides agree once the confirmation arrives.

---

### User Story 2 - Verification exercises the real application (Priority: P1)

A maintainer (or an agent) runs the test stages and trusts the result, because unit and integration tests prove behaviour through public interfaces, and the end-to-end stage starts the real Go application and checks what lands on disk.

**What is wrong today**:

- *"E2E" never reaches Go.* `playwright.config.ts` starts Vite with the mock bridge (`frontend/src/dev/bridge-mock`, 2,351 lines re-implementing all 24 bridge bindings) and a second server for `mockup.html`. `docs/delivery/plan/KNOWN_ISSUES.md` recorded the divergence on 2026-07-25; it was never resolved. The only real-backend driver, `cmd/native-evidence` (about 2,169 build-tagged lines, a second composition root), is run by nothing.
- *One fifth of test code compares pixels.* `e2e/parity/**`, `targeted-parity`, `real-files-parity` and `interactive-states` total 9,901 lines; the first run of the 546-case harness scored 0 of 1,620. All eleven Playwright suites fail to start without `docs/delivery/spec/surface/`.
- *Tests read specification documents.* `spec_clause_count_test.go` counts `- Q:` lines in `spec.md`; `internal/apperr/contract_table_test.go`, the parity reference adapter and `native_evidence_safeguards_test.go` read `docs/` or `specs/`; the safeguards test runs two `go build`s inside `go test`.
- *Tests sit beside production code.* 59 Go test files inside `internal/*` packages (about 32 use unexported identifiers), 4 at the repository root, 3 in `cmd/`; 72 Jest files under `frontend/src`; `frontend/public/theme-bootstrap.test.mjs` is copied to `dist` and embedded in the binary; test shims live under `frontend/src/test/`; the evidence runtime lives in the production adapter folder.
- *Titles are ticket numbers.* 520 of 715 frontend `describe/it/test` titles start with an ID (`T045` ×18, `T157` ×15, ...). 182 Go and 223 TypeScript `// Proves:` comments cite requirement anchors, 47 of them retired. The convention served a traceability generator deleted on 2026-07-25.
- *Redundant and infrastructure-heavy suites.* Editor view tested three ways plus Playwright; `DocumentTabs.test.tsx` (2,005 lines) overlaps four suites; `App.test.tsx` is 3,292 lines and mocks the shell it tests; the mock bridge is tested three times; about 19 % of all test code is test infrastructure.
- *Production code carries test branches.* `?parity-case` URL branches in `AppShell.tsx`, `EditorView.tsx` and `CodeEditor.tsx` fake states for screenshots, with a formal allowlist in `frontend/scripts/archtest-allowlist.json`; `data-parity-shell` appears 59 times in production CSS.

**Why it matters**: a suite that certified "195 of 196 tasks done" while eight defects shipped provides no safety for a refactor. Every story below relies on this one to prove that behaviour did not change.

**Why this priority**: the refactoring cannot be verified without it, and the real-backend E2E must exist early so Stories 3 and 4 are checked against the binary.

**Independent Test**: from a fresh clone, run the unit stage without a native toolchain and without network; run the E2E stage and observe a Go process start with a temporary profile directory; inspect the test roots and run the title check.

**Acceptance Scenarios**:

1. **Given** a fresh clone with no `frontend/dist`, no native toolchain and no network, **When** the unit stage runs, **Then** it passes.
2. **Given** the E2E stage, **When** it runs, **Then** it starts the real Go application with a disposable profile directory and temporary files, drives it through the screen, and asserts the bytes on disk and the state after a restart.
3. **Given** the packaged application and networking disabled, **When** it is started cold and a document with no web references is opened, edited, previewed and saved, **Then** everything works and no outbound connection is attempted; **and When** a document that references a web image is previewed, **Then** a placeholder is shown and the rest of the document renders.
4. **Given** the repository after this feature, **When** test files are listed, **Then** none is under `frontend/src`, `frontend/public` or a Go production package, except the white-box exceptions listed in the plan, each with a written reason.
5. **Given** all test titles, **When** they are scanned for task or requirement IDs, **Then** none is found; a requirement mapping, if kept, sits in a comment or an external table.
6. **Given** any test, **When** it is inspected, **Then** it asserts behaviour, not source text, CSS declarations, DTO field order, struct field counts or the content of specification or documentation files.
7. **Given** each defect in Story 1, **When** its regression test is run on the archived tree, **Then** it fails; on the refactored tree it passes.
8. **Given** the real-backend suite, **When** it runs, **Then** it covers: activating a preview link and keeping the bridge; a close request before the frontend is ready; failed startup then Retry then close; an isolated settings rejection; a lost cancellation; a late bridge completion. Navigation cases run on both the development host and the packaged binary.
9. **Given** the pixel-parity harness, the parity URL branches, the evidence driver and the mock bridge, **When** the real-backend E2E stage passes, **Then** all of them are deleted and the `just dev-ui` route is retired.

---

### User Story 3 - One implementation per common UI behaviour (Priority: P2)

A maintainer changes a common behaviour (how a popup opens, how a bar overflows, how a tab looks) in one place, and every screen area that uses it changes together. A designer switches the theme and only colours, radii and shadows change, never behaviour.

**What is wrong today**:

- *Popups.* Six style owners with drifting values (radius 8 px, 12 px and 0.5 rem; minimum width 250 px and 14 rem; different padding, shadow token, hover and disabled rules): `MenuSurface.module.css`, `ShellMenuRow.module.css`, `DocumentTabs.module.css`, `EditorContextMenu.module.css`, `EditorChrome.module.css`, `StatusBar.module.css`. Ten implementations of the open/close behaviour (Escape, outside click, focus restore, arrow navigation, clamping to the frame); the 8 px clamp is copied four times; `document.querySelector('.application-frame')` appears seven times; shortcuts are formatted at eight sites in five ways; thirteen document-level `keydown` listeners.
- *Menus.* `ShellMenuRow.tsx` contains two full copies of every menu (desktop Radix version and a raw-portal version for windows at or below 376 px), about 150 duplicated JSX lines; keyboard behaviour differs by window width. The `EditorContextMenu` pointer listener runs while the menu is closed and refocuses the opener on every click.
- *Buttons and bars.* There is no Button or Tool button component; eleven button-like controls own their metrics. The toolbar (`EditorChrome.tsx`) cannot be composed without tabs, owns its own overflow engine, an arrangement radio that duplicates `Segmented`, and editor shortcuts; group order is spelled out twice.
- *Panes, sidebar, status, dialogs.* Editor and preview are two hand-written sections sharing only CSS; the paused-preview banner reaches into renderer internals with `display:contents` and `:has()`. The sidebar is an empty `<aside>` with its resize logic in `AppShell` that recognises its own patch by inspecting notification text. The status bar keeps two fact inventories and its Details popup is a sixth popup surface with no dismissal. Dialogs have four modal lifecycles, four overlay stylesheets and four focusable-selector strings; `ExternalChangePrompt` is mounted in three places.
- *Themes and tokens.* `[data-theme]` and `[data-mode]` selectors change geometry (not only colour) in seven widget stylesheets; 34 tokens are dead and two used tokens are undefined; `--icon-size`/`--icon-stroke` are bypassed by hardcoded values.
- *Layering.* `ui/primitives/ViewMenu.tsx` imports the action registry, the dispatcher and store types; `Banner`, `StatusBar` and `ViewModeToggle` import store types. The rule "components take props" exists in `rules.md` but is not enforced.
- *God components.* `App.tsx` 2,179 lines (19 `useState`, 36 `useCallback`, 29 adapter call sites); `DocumentTabs.tsx` 1,355; `ShellMenuRow.tsx` 1,041; `SettingsMenu.tsx` 610; `EditorChrome.tsx` 591. The menubar is rendered as a child of the appearance settings widget.
- *Command policy.* Availability, shortcut admission and aliases are decided in several places; formatting commands are built by two builders; settings writes go through two paths with different failure handling; the dispatcher collapses unknown outcomes into "mutated".

**Why it matters**: every visible defect in Story 1's menu items comes from a copy that drifted. Future features (assistant sidebar, folders, export) each need a popup, a bar, a pane and a sidebar; without shared components each will add another copy.

**Why this priority**: it removes the cause of the visual defects and makes the next features cheaper, but the data defects in Story 1 come first.

**Independent Test**: change one property of a shared component (for example the popup radius token) and verify every consumer in its inventory changed; open every menu family in all six theme/mode combinations and compare computed styles.

**Acceptance Scenarios**:

1. **Given** the shared popup, **When** its open/close behaviour is changed once, **Then** File, Settings, View, About, the narrow overflow menu, the tab context menu, the editor context menu, the toolbar overflow menu and Document details all change.
2. **Given** any two menus, **When** the same keyboard key is pressed, **Then** both behave the same.
3. **Given** the menubar, the tab bar and the formatting toolbar, **When** they are rendered, **Then** each is the shared bar frame with leading, main and trailing slots; their overflow policy is a property of the bar.
4. **Given** the six theme/mode combinations, **When** any shared component is inspected, **Then** only token values differ; no widget stylesheet contains a `[data-theme]`, `[data-mode]` or parity selector.
5. **Given** `ui/primitives` and `ui/components`, **When** the lint stage runs, **Then** it fails if any file there imports the store, the adapters or the action registry.
6. **Given** `App.tsx`, `DocumentTabs.tsx`, `ShellMenuRow.tsx` and `EditorChrome.tsx`, **When** they are read, **Then** composition, command orchestration, drag, popup and shortcut handling each have an identifiable owner; no size or file-count quota is used as acceptance.
7. **Given** the File menu, the toolbar, the tab context menu and a keyboard shortcut for the same action, **When** availability is computed, **Then** all four read it from the action registry.

---

### User Story 4 - One owner for the document lifecycle and shutdown in the backend (Priority: P2)

A maintainer can read one place to learn how a document is opened, written, published and closed, and one place to learn how the application shuts down. Adding a feature adds to that owner instead of adding another map.

**What is wrong today**:

- *Ten maps, eight counters.* `internal/appmodel/service.go` keeps documents, write coordinators, autosave timers, activation tokens, save reservations, normalisations, conflicts and more in separate maps synchronised by hand; the service struct has 40 fields; close forgets `writeCoordinators`, `normalizations` and `saveReservations`. This is the structural cause of Story 1's ordering, leak and status defects.
- *Test seams on the production API.* Five of six service constructors are test-only; `SetBeforeSaveAsRecheck` is invoked in the Save As hot path; race injectors sit inside repositories; `main.go` package variables are swapped by `main_test.go`; two runtime type assertions exist "so older test doubles continue".
- *Six copy-paste families.* 35 handler `defer/recover` blocks (about 216 lines); 21 lock-snapshot-mutate-publish sites with two different emit paths and manual unlocking (80 `Lock` calls versus 127 `Unlock`); four key-value repositories on one `settings` table (sqlc used by one); 37 classified-error constructions; 13 hand-written result envelopes with two error vocabularies; about 60 wiring lines duplicated between `main.go` and `cmd/native-evidence`.
- *Layering leaks.* `appmodel` imports the Wails runtime and `bootstrap`, and hosts three repositories; `NativeWindowService` holds the model service; `main.go` is not pure wiring; `holder.Init` does database work under the lock every handler takes.
- *Dropped errors.* Autosave outcome and detected conflict, layout persistence (`zerolog.Nop()`), publication rollback, settings reset read-back, and reopen `SetDocView` errors are discarded.
- *Concurrency risks.* The emitter is invoked while holding the write lock; a lock-drop/re-lock rollback can erase concurrent changes; a document pointer captured under the read lock is mutated without re-lookup; a close plan can stay `Executing` forever; `GetState` does a database read and `os.Stat` per recent entry on every hydration.
- *Comments narrate history.* 1,174 production comment lines; 23 `T###`, 32 `FR-` and 12 `SC-` references; the same task story is told three times.
- *Dead exports.* Unused exported symbols across `apperr`, `application`, `appmodel`, `file`, `logging`; the whole `internal/gate` package has no production importer.
- *Shutdown.* The close coordinator emits once and vetoes forever (Story 1); there is no request identity, no acknowledgement, no pending-state discovery for a restarted frontend, no bounded observation of bridge work.

**Why it matters**: each new capability (rendering, folders, OS integration, assistant runs) touches open, write and close. With ten maps every one of them adds a map and a cleanup line that can be forgotten.

**Why this priority**: it fixes the root cause behind several Story 1 defects, and Story 1's fixes are the first consumers of the new owner.

**Independent Test**: open, edit, save, close many documents under the race detector and assert nothing is retained; read the package documentation and find the lifecycle, the lock order and the event contract in one place.

**Acceptance Scenarios**:

1. **Given** a document, **When** it is opened, written, published and closed, **Then** one lifecycle owner records its path identity, buffer revision, write order, disk commit, publication and disposal, and every stale publication is rejected by its commit identity.
2. **Given** the handlers, **When** they are read, **Then** each uses one shared guard helper and one shared failure constructor; no hand-written recover block or error wrapper remains.
3. **Given** settings, layout, recents and file metadata, **When** they are persisted, **Then** they use one key-value repository helper, and sqlc is either used by all of them or removed.
4. **Given** the production API, **When** it is inspected, **Then** no test-only setter, test-only constructor or package-level swap variable remains; test needs are met by constructor options wired only at the composition root.
5. **Given** the `appmodel` package, **When** its imports are listed, **Then** it imports neither the Wails runtime nor `bootstrap`; the event emitter adapter lives in `application`.
6. **Given** any error on a user-visible path, **When** it occurs, **Then** it is surfaced to the user or logged with a stated reason; none is discarded.
7. **Given** a close request, **When** it is handled, **Then** it carries an identity, is acknowledged, can be discovered by a frontend that loads later, can be cancelled with confirmation, and a stale response is rejected; bridge work is observed with a bound, and a timeout never authorises discarding unsaved work.

---

### User Story 5 - Six stages behind five scripts; hooks and CI run the same scripts (Priority: P2)

A maintainer or agent runs one script per stage locally; the git hooks and the CI workflow run the same scripts, so a change that passes locally passes in CI, and every tool runs once.

**What is wrong today**:

- *The step list is defined everywhere.* Six executable definitions (`justfile` `check`, `.github/workflows/main.yml`, three `scripts/hooks/pre-push-*.sh`, `baseline.sh`, `verify.sh`, `release-stack.sh`) and five prose copies. `release-stack.sh` runs the full Wails build six times, `tsc` five times, ESLint five times, `go test -race` three times. Pre-push omits `archtest`.
- *`justfile`.* 34 recipes (33 counted at the audited commit plus `go-vet`), 167 lines, 14 one-line aliases; `package` always exits 1; `sqlc-check` and `vuln` are called by nothing; `migration-immutability-check` diffs against `HEAD` and is therefore blind in CI.
- *Format covers less than half.* `just fmt` misses `AGENTS.md`, `README.md`, `docs/**`, `specs/**`, `scripts/*.sh`, the `justfile`, root YAML and JSON, `.agents/**`; pre-commit and pre-push format different file sets.
- *Build dirties the tree.* `just build` leaves `frontend/wailsjs/runtime/*` at mode 644; `gen-check` and a Go test then fail on the mode bit alone; three paragraphs of `AGENTS.md` explain how to live with it.
- *CI cannot see the product.* The workflow re-lists the nine steps by hand, never runs `wails build`, has no OS matrix, runs Playwright against the mock, and the release job is an `echo`. CI uses Node 22 while hosts use 24; CI installs Wails CLI 2.12.0 while `go.mod` selects 2.15.0; `wails.json` uses `npm install` where CI uses `npm ci`.
- *Architecture checks use proxies.* Handlers are found by type-name suffix, constructors by a `New*` regex, locks by `os.O_EXCL` string, CGO-freedom by grepping source; the adapter-only import rule is enforced twice; the TypeScript lint preset is untyped (no unhandled-promise rule); Playwright has no `forbidOnly`; Jest runs with `--passWithNoTests`.
- *Scripts.* `scripts/` has no build, no categorised test, no format and no E2E script; `verify.sh` reports PASS when baseline inputs are missing; `baseline_verify_test.sh` is invoked by nothing and its cleanup trap can delete a pre-existing directory; `frontend/scripts/check-editor-themes.mjs` and `generate-editor-themes.mjs` are outside every gate.
- *The "CGO-free binary" claim is false.* The check is an untagged `CGO_ENABLED=0 go build ./...`; the real desktop artifact links Cocoa/WebKit through CGO. The backend and SQLite are CGO-free; the runnable desktop binary is not.

**Why it matters**: an agent that cannot find one command to run the stages re-derives the list, differently each time. Duplicate step lists drift; a green local run says nothing about CI.

**Why this priority**: the new scripts must exist before tests are relocated (runners own directories) and before the instructions in Story 6 can point at them.

**Independent Test**: list `scripts/`; run each script from a fresh clone; grep the hook and CI definitions for anything other than the five scripts; time the verify script and count tool invocations.

**Acceptance Scenarios**:

1. **Given** the repository, **When** `scripts/` is listed, **Then** it contains exactly `build`, `test`, `verify`, `format` and `baseline` as entry points, and every `just` recipe is a one-line alias for one of them.
2. **Given** the pre-push hook and the CI workflow, **When** they are read, **Then** they call only the five scripts.
3. **Given** `scripts/verify`, **When** it runs, **Then** each tool runs at most once, the frontend is built at most once, and no `go build` runs inside `go test`.
4. **Given** `scripts/format --check`, **When** it runs on a formatted tree, **Then** it passes; it covers every tracked text file type, and the ignore list is documented.
5. **Given** `scripts/baseline`, **When** an input is missing, **Then** it fails closed; when it compares, it never reports green while a failure remains; its record holds the commit, the dirty-diff identity, tool versions, per-stage exit codes and machine-readable failure identities.
6. **Given** `scripts/build`, **When** it finishes, **Then** `git status` is clean.
7. **Given** CI, **When** a push arrives, **Then** it runs `scripts/verify` and the real-backend E2E on at least a macOS runner; the release job either builds the artifact or does not exist.
8. **Given** the lint stage, **When** it runs, **Then** it enforces the adapter-only import rule, the "primitives and components import no store/adapter/registry" rule and the token-only colour rule from parsed imports and CSS, rejects a committed `.only`, and fails when a required suite collects zero tests.
9. **Given** the toolchain, **When** local, hooks and CI run, **Then** they read the same declared Node, Go and Wails versions and install dependencies from the lockfiles.

---

### User Story 6 - One authority and current, intent-level agent guidance (Priority: P2)

A new agent (or a new contributor) opens the repository, reads one instruction file, learns what the product is, where the authority is, who owns each shared behaviour, and how to run the six stages, and finds every command it is told about.

**What is wrong today**:

- *Four answers to "what is normative".* `README.md` points to `docs/delivery/`; `docs/delivery/README.md` says nothing outside it is normative; `AGENTS.md` points to `specs/<feature>/`; the constitution says `docs/delivery/spec` and `architecture` "until migrated"; `WORKFLOW.md` still routes through `/plan-story`.
- *Dead references.* `just story-check` (seven sites; one test asserts it must not exist), `just spec-check`, `check_story.py`, `check_proves.py`, `sync-agent-files.py --apply`, `.claude/commands`, `jest.config.js`, "the 10 speckit skills" (there are 17), two stale `KNOWN_ISSUES` entries.
- *`AGENTS.md`.* 72 of 269 lines are dated incident stories with pixel counts and Wails line numbers; six of eight "non-negotiables" are marked advisory; the "never `--no-verify`" rule cannot be enforced by the hook it bypasses.
- *Two workflows.* The legacy phase/story loop (`.agents/commands/{build-story,plan-story,plan-phase,finish-phase,reconcile}.md`, their five 11-line skill shims and `.claude/skills` symlinks, `WORKFLOW.md`, `DOD_TEMPLATE.md`) and the Spec Kit loop are both declared live; the legacy loop cannot run because its validators were deleted.
- *Ceremony blocks routine work.* Stop on any unspecified decision; one task, one branch, one commit before touching a file; a five-rule story cap; permission requests on open checklist items; a named test per rule; tests touching every changed file.
- *No ownership guidance.* Nothing tells an agent to find the existing owner of a behaviour and its consumers before adding a copy; `structure.md` prescribes folders and "inline until there is a second caller", which produced the copies.
- *Comments and docs.* 489 task and requirement IDs in production comments; `ShellMenuRow` takes about 40 props with no contract; `internal/appmodel` has no package documentation for lifecycle, lock order or event contract; `structure.md` describes July's tree; `README.md` says `just check` is "everything CI runs" while CI also runs Playwright.
- *The constitution.* Principle I names `docs/delivery` as authority; Principle II requires stable requirement anchors and tests that name the rule they prove; Principle VII requires the baseline-gate ritual. All three conflict with the owner's principles 4, 5 and 8.

**Why it matters**: the audit's root-cause analysis shows the drift came from instructions that outlived their tooling. Left in place, they would regenerate the rejected process during this very refactor.

**Why this priority**: it must land early enough that the old instructions stop steering the work, but its final form depends on the scripts (Story 5) and the component map (Story 3).

**Independent Test**: a fresh agent session is given only the instruction files and asked to run the six stages and to make one small change to a shared component; it finds every command and every consumer without asking.

**Acceptance Scenarios**:

1. **Given** `README.md`, `AGENTS.md`, `CLAUDE.md`, the constitution and the archived `docs/delivery` pointer, **When** they are read, **Then** all name `specs/<feature>/` plus the architecture map as the single authority.
2. **Given** `docs/delivery/`, **When** the feature is done, **Then** it lives under `docs/_archive-2026-09-delivery/` with a README pointer, and the decisions and ADRs still relevant are carried into the new architecture map.
3. **Given** every command, file and path named in an instruction file, **When** it is checked, **Then** it exists.
4. **Given** `AGENTS.md` and `CLAUDE.md`, **When** they are read, **Then** they contain the product intent, the authority and command pointers, the ownership map pointer, the branch convention and the design judgment tools cannot supply; no dated incident stories, no line limits, no per-turn forms, no duplicated mechanical rules.
5. **Given** the legacy workflow files (`.agents/commands/*`, the five legacy skills and their `.claude/skills` symlinks, `WORKFLOW.md`, `DOD_TEMPLATE.md`), **When** the feature is done, **Then** they are removed or rewritten to the current workflow, and nothing references a removed one.
6. **Given** the constitution, **When** the feature is done, **Then** it has been amended through the constitution workflow so that no principle requires `docs/delivery` authority, requirement anchors in tests, or per-rule proving tests, and its version and amendment date are updated.
7. **Given** production source and documentation, **When** scanned, **Then** no task or requirement ID appears in a comment or a doc sentence; comments state current contracts and non-obvious rules.
8. **Given** the architecture map, **When** it is read, **Then** it names the owner of shared UI, commands, document lifecycle, persistence and verification, and records the durable decisions of this feature.

---

### User Story 7 - The repository contains only what the product and its verification need (Priority: P3)

A contributor clones the repository and gets the product, its tests and its documentation, not 56 MB of screenshots, probe logs and run artefacts.

**What is wrong today**:

- `specs/` is 42 MB, almost all under `specs/*/evidence` (21 MB for 002, 9.9 MB for 003), including two 7.5 MB screenshots; `docs/audits/2026-09-07-project-health-evidence/` is 14 MB including a 4.3 MB PDF and a 3.6 MB JSON report; 387 tracked paths contain `evidence/`.
- `test-results/.last-run.json` is tracked at the repository root; `.gitignore` covers only `frontend/test-results/`, comments out `# .idea/` and then adds a bare `.idea`, and carries feature-specific parity rules.
- `frontend/public/theme-bootstrap.test.mjs` ships inside the binary; `frontend/evidence/**` and `cmd/native-evidence/**` exist only for the evidence regime; `scripts/baseline_verify_test.sh` is invoked by nothing.
- 34 dead tokens, two undefined tokens, unused files and props (`PreviewView.tsx`, `ViewModeToggle.tsx`, `AppearanceDialog.tsx`), dead Go exports and the unused `internal/gate` package.

**Why it matters**: the evidence outweighs the product by an order of magnitude and every clone, search and review pays for it. The granular history is preserved under the archive tag, so nothing is lost by removing it from the working tree.

**Why this priority**: it is cleanup once the replacements exist.

**Independent Test**: measure the tracked size before and after; list tracked files matching evidence, screenshot and run-artefact patterns.

**Acceptance Scenarios**:

1. **Given** the repository after this feature, **When** tracked files are listed, **Then** no `specs/*/evidence`, `docs/audits/*-evidence`, `test-results/`, `frontend/evidence`, `cmd/native-evidence` or `frontend/public/*.test.*` path remains, while `docs/audits/2026-09-07-project-health-audit.md` and `docs/_archive-2026-07-28-specification/` remain.
2. **Given** `.gitignore`, **When** it is read, **Then** it ignores run artefacts, IDE folders and build output once each, with no contradictions and no feature-specific rules.
3. **Given** the token file and the Go packages, **When** they are scanned, **Then** every token is used and defined, and no exported symbol without a production caller remains (the intentionally unused `ContentAccessor` and `DocumentCommands` seams excepted).
4. **Given** the git remote, **When** branches are listed, **Then** only `master`, `app_version_1_codebase` and active feature branches exist, and the tag `archive/v1-linear-history-2026-09` exists (done on 2026-09-08).

---

### Edge Cases

- A Story 1 defect cannot be reproduced on the archived tree (for example it needs a host the CI does not have): the regression test is still written, the reason is recorded next to it, and the defect is verified by hand on that host.
- A behaviour can only be tested white-box: the test stays beside the code as an external `_test` package, and the list of such exceptions with reasons is kept in the plan.
- Two consumers of the shared bar need different overflow policies: the policy is a property of the bar, never a second bar.
- Relocating a test changes what it covers: the change must be visible in the baseline comparison, not silent.
- A stage needs the native toolchain (build, E2E) while another must not (unit): the scripts state which is which and fail with a clear message when the toolchain is missing.
- A CI runner has no WebKit: the E2E stage runs on the macOS runner and the other runners run the remaining stages.
- A shared component would change behaviour that features 001–003 approved (for example the toolbar overflow): the change is recorded as a decision in the spec, never made silently.
- A test's only assertion is a document or source string: it is deleted, never ported into a linter.
- The mock bridge is deleted before the real-backend E2E exists: not allowed; the E2E stage must pass first.
- A preview link points outside the document's folder or to a non-Markdown file: it is refused with a visible message (see FR-018).

## Requirements *(mandatory)*

Each requirement is one sentence in EARS form (ubiquitous "shall"; "When" for an event; "While" for a state; "If … then" for an unwanted condition; "Where" for an option). The `Source` note names the audit findings it resolves.

### A. The editor never loses work or strands the user

- **FR-001**: When a Save As, an autosave or an explicit Save completes for one document, the backend shall apply its result in the order the writes were committed, so that content from an earlier write never replaces content from a later write. *Source: C1, RF-A2.*
- **FR-002**: When a Save As adopts a new destination, the backend shall report the destination as clean only when the bytes on disk at that destination equal the content it reports. *Source: C1, RF-A2.*
- **FR-003**: The backend shall build every refusal message either while holding the model lock or from a snapshot captured under the lock, and the race detector shall report no race for a stale Save running concurrently with New Document. *Source: C2, RF-A3.*
- **FR-004**: When a document is closed, the backend shall release every per-document resource (write coordinator, timers, activation tokens, save reservations, normalisations, conflict records) through one disposal function. *Source: C3, BE-1, RF-A4.*
- **FR-005**: If an autosave fails, then the application shall show the same classified error (category, remediation, shown once) that a manual Save would show, and a successful autosave shall show nothing. *Source: C4, BE-5, RF-A5.*
- **FR-006**: The backend shall identify a file by typed, per-platform device and inode fields, so that opening a hard link or the just-saved path focuses the existing tab on macOS and Linux. *Source: C5, RF-A6.*
- **FR-007**: When the user saves a document explicitly, the editor shall keep the editor model, the undo history, the selection and the keyboard focus; only an explicit reload or recovery shall replace the buffer. *Source: C6, RF-A7.*
- **FR-008**: When a document is opened, the backend shall emit the same effective metadata that a full state read returns, so that a clean file shows "Saved". *Source: C7, RF-A8.*
- **FR-009**: When a settings group is updated, the backend shall write it in one transaction, so that a rejected update leaves the previous values of the whole group intact across a restart. *Source: C8, RF-A9.*
- **FR-010**: When a menu is opened with the pointer or the keyboard, the menu shall keep its surface shadow, and the focus indicator shall appear only on interactive controls and shall compose with elevation; this shall be verified by a computed-style check for every popup family in every theme. *Source: UI-1, RF-A1.*
- **FR-011**: When the user clicks the trigger of an open menubar menu, the menu shall close; and every menu family shall respond identically to Arrow, Home, End, Escape and type-ahead keys. *Source: UI-5, R2, RF-A11.*
- **FR-012**: When the user opens the tab context menu with the pointer, the menu shall open at the pointer position; when opened with the keyboard, it shall open at the focused tab; in both cases it shall stay inside the application frame. *Source: R14, UI-4, RF-A10.*
- **FR-013**: The tab context menu shall display the keyboard shortcut of every item that has one, taken from the action registry. *Source: R15, RF-A10.*
- **FR-014**: While the window is at any width at or above the minimum, every menubar menu shall be fully visible inside the application frame. *Source: R16, RF-A10.*
- **FR-015**: When the status bar drops a fact for lack of space, the Details view shall list that fact. *Source: R19, UI-15, RF-A10.*
- **FR-016**: When the user activates a link in the preview, the application shall keep the application page, the bridge connection and the editing session intact. *Source: APP-1, RF-A12.*
- **FR-017**: The application shall route every preview link through one shared link handler that applies one policy for in-document anchors, local Markdown files, external links and unsupported targets. *Source: APP-1, D11, RF-A12.*
- **FR-018**: The shared link handler shall scroll the preview for an in-document anchor, open a supported local Markdown file resolved relative to the document's folder through the normal open flow, open a permitted external link through the operating system only after the user's explicit action, and visibly refuse any other target without weakening sanitisation. *Source: APP-1, D11, RF-A12.*
- **FR-019**: While the application shows the startup-failure screen or is still loading, the user shall be able to close the window and quit the application. *Source: APP-2, RF-A13.*
- **FR-020**: When the frontend finishes loading (or a Retry succeeds) after a close request was made, the frontend shall discover the pending request and handle it like a fresh request. *Source: APP-2, RF-A13.*
- **FR-021**: When the user presses Retry on the startup-failure screen, the application shall make a fresh attempt for the failed step (including a fresh settings read after a successful model load), and only one attempt shall run at a time. *Source: APP-3, RF-A14.*
- **FR-022**: When startup fails, the failure screen shall name the step that failed (bridge, model, settings, window ready) with a safe diagnostic identity and shall offer a recovery action that fits that step. *Source: APP-4, RF-A15.*
- **FR-023**: When the user cancels a close request, the frontend shall keep reporting the request as pending until the backend confirms the cancellation. *Source: APP-5, RF-A13.*
- **FR-024**: If unsaved documents or a pending write exist when the frontend or the bridge is lost, then the application shall either protect the content or obtain the user's explicit consent to discard it; a timeout alone shall never authorise discarding data, and no session-restore feature shall be introduced. *Source: APP-5, D12, RF-A13, RF-C7.*

### B. Verification exercises the real application

- **FR-025**: The repository shall hold Go tests under `tests/go/unit` and `tests/go/integration`, and frontend tests under `frontend/tests/unit`, `frontend/tests/integration` and `frontend/tests/e2e`; no test file shall exist under `frontend/src`, `frontend/public` or inside the binary. *Source: T-3, §5.4.3, D3, RF-D1.*
- **FR-026**: The Go tests shall use only public interfaces (black-box); where a behaviour cannot be reached through the public interface, a white-box test may stay beside the code as an external `_test` package, and each such exception shall be listed with its reason in the plan. *Source: D3, RF-D1.*
- **FR-027**: The unit stage shall pass from a fresh clone without `frontend/dist`, without a native toolchain and without network. *Source: RF-D2.*
- **FR-028**: The E2E stage shall start the real Go application (the built binary or `wails dev`) with a disposable profile directory and temporary files, drive it through the screen, and assert the bytes on disk and the state after a restart. *Source: T-1, TL-8, RF-D3.*
- **FR-029**: The E2E stage shall include a cold start of the packaged application with networking disabled in which a document is opened, edited, previewed and saved, and shall show that the application itself attempts no outbound connection. *Source: V1, DOC-6, RF-D3.*
- **FR-030**: The repository shall contain no test that asserts source text, CSS declarations, DTO field order, struct field counts or the content of a specification or documentation file; architecture constraints shall live in the lint stage. *Source: T-3, TL-6, RF-D4.*
- **FR-031**: Every test title shall be a sentence describing the behaviour, and no title shall contain a task or requirement ID; a mapping to requirements, where kept, shall live in a comment or an external table. *Source: §5.4.2, DOC-2, RF-D5.*
- **FR-032**: Every defect listed in Story 1 shall have a regression test that fails on the archived tree and passes on the refactored tree. *Source: RF-D7.*
- **FR-033**: The real-backend E2E suite shall cover preview-link activation with bridge continuity, a close request before the frontend is ready, failed startup followed by Retry and close, an isolated settings rejection, a lost cancellation and a late bridge completion, running the navigation cases on both the development host and the packaged binary. *Source: §5.10.6, RF-D8.*
- **FR-034**: When the real-backend E2E stage passes, the pixel-parity harness, the `?parity-case` production branches and their allowlist, the parity selectors in production CSS, the evidence driver `cmd/native-evidence`, `frontend/evidence`, and the mock bridge shall be deleted, and the `just dev-ui` route shall be retired. *Source: T-2, UI-12, TL-8, TL-9, D4, D6, RF-D6.*
- **FR-035**: The test suites shall be consolidated according to the audit's keep, rewrite and delete lists (audit §5.4.4): the editor-view suites merged into one, the Settings menu suite folded into the menubar suite, the tab suite slimmed, the App suite rewritten without mocking the shell it tests, the eight behavioural browser journeys ported to the real backend, and the listed bureaucracy suites deleted. *Source: T-4, T-5, §5.4.4.*
- **FR-036**: The repository shall no longer contain `// Proves:` anchors in tests. *Source: §5.4.2, RC-6.*

### C. One implementation per common UI behaviour

- **FR-037**: The frontend shall have exactly one Popup component that owns the surface and the whole lifecycle (open, close, Escape, outside pointer, focus restore, arrow navigation, clamp and flip inside the application frame, portal policy) and takes content, anchor (trigger, point or element bounds) and size variant as inputs; the File, Settings, View, About, narrow overflow, tab context, editor context, toolbar overflow and Document details menus shall all use it. *Source: UI-2, UI-3, UI-6, UI-8, R1, R3, RF-B1.*
- **FR-038**: The frontend shall have exactly one MenuItem row (label, icon slot, accelerator slot, disabled, checked and radio variants) rendered by every menu, and its accelerator shall be derived once from the action registry. *Source: UI-3, R15, RF-B2.*
- **FR-039**: The frontend shall have exactly one horizontal Bar frame with leading, main and trailing slots used by the menubar, the tab bar and the formatting toolbar, and the overflow policy shall be a property of each bar. *Source: UI-10, R7, RF-B3.*
- **FR-040**: When the window is narrower than 768 px, the formatting toolbar shall move the controls that do not fit into a `»` overflow menu rendered by the shared Popup, as feature 003 accepted; the tab bar shall keep scrolling horizontally; and this per-bar policy shall be recorded in the architecture map (owner decision 2026-09-08 on audit D1). *Source: D1, H-5.*
- **FR-041**: The frontend shall have exactly one Island group and one ToolButton (icon and text variants, selection-preserving mousedown, disabled, pressed and checked states) used by the toolbar and, where applicable, the tab bar and the menubar tools, and one Button used by dialogs, toasts and the launcher; icon tool buttons shall be square. *Source: UI-9, D2, RF-B4.*
- **FR-042**: The frontend shall have exactly one Tab and one TabBar (horizontal scrolling, drag reorder, add and close controls), with theme differences expressed as tokens rather than selectors in the tab stylesheet. *Source: UI-11, RF-B5.*
- **FR-043**: The frontend shall have exactly one Pane frame (header slots, body, accessory or banner slot) that hosts the editor and the preview as content, and paused or failed preview banners shall be placed from explicit state rather than by CSS reaching into renderer internals. *Source: UI-13, R17, RF-B6.*
- **FR-044**: The status bar shall declare each fact once with its row, detail and drop priority, and the Details view shall always expose the hidden facts. *Source: UI-15, R19, RF-B7.*
- **FR-045**: The frontend shall have exactly one Sidebar frame (side, width, resize, collapse, content) used by the workspace panel now and the assistant later, while the layout state stays owned by the backend. *Source: UI-14, R13, RF-B8.*
- **FR-046**: Every dialog and prompt (Settings, About, Shortcuts, Normalisation, Close, External change, Recovery) shall use the one ModalShell. *Source: UI-16, R4, RF-B9.*
- **FR-047**: Segmented shall be the only radio-group implementation and Icon the only glyph source, and the icon size and stroke tokens shall control every icon. *Source: R5, R6, RF-B10.*
- **FR-048**: Theme differences shall live in `tokens.css` (values) and, where structure must differ, in the shared component's stylesheet; no widget stylesheet shall contain a `[data-theme]`, `[data-mode]` or parity selector; every dead token shall be removed and every used token defined. *Source: UI-11, UI-12, UI-17, RF-B11.*
- **FR-049**: The action registry shall be the one owner of availability, shortcut admission and aliases for the File menu, the toolbar, the tab context menu and keyboard shortcuts alike; formatting commands shall be built by one runner; settings writes shall go through one settings command owner; and every outcome shall be typed and reported once. *Source: R8–R11, RF-B12.*
- **FR-050**: The `App`, `DocumentTabs`, `ShellMenuRow` and `EditorChrome` widgets shall be decomposed so that composition, command orchestration, drag, popup and shortcut handling each have an identifiable owner, without using a file size or file-category quota as acceptance; the menubar shall not be rendered through the appearance controller. *Source: §5.2.6, UI-7, RF-B13.*
- **FR-051**: Files under `ui/primitives` and `ui/components` shall import neither the store, the adapters nor the action registry, and the lint stage shall enforce this rule. *Source: §3.1, AG-6, RF-B14.*
- **FR-052**: The application shall keep the not-yet-implemented controls (Assistant, Export, Open Folder) visible but disabled, with their availability read from the action registry, and shall keep the Document details disclosure and the Toggle Assistant items as accepted amendments; the architecture map shall record both (owner decision 2026-09-08 on audit D8 and D10). *Source: D8, D10.*
- **FR-053**: The application shall make no network request on its own; images and stylesheets that a document references from the web shall load only under the original specification's remote-content policy (Ask by default with the in-preview banner, Always allow, Always block, changed in Settings → Content and privacy); if such content cannot be loaded (for example without internet), then the preview shall show a placeholder and the rest of the document shall render; and the offline principle shall be worded as "the application runs without internet; document content and the future assistant may use it under the user's control" wherever it is stated (owner decision 2026-09-08 on audit D7; the banner and the policy belong to the rendering feature and are not built here). *Source: D7, DOC-6.*
- **FR-054**: The application shall keep the native window frame introduced during feature 001 (the earlier custom title-bar decision is superseded), and this decision shall be recorded in the architecture map. *Source: D9, H-5.*

### D. One owner for the document lifecycle and shutdown in the backend

- **FR-055**: The backend shall have one per-document lifecycle owner that records path identity, buffer revision, write ordering, disk commit, publication and close disposal, shall reject a stale publication by its commit identity, and shall keep disk I/O outside the model lock. *Source: BE-1, BE-6, RF-C1.*
- **FR-056**: The backend shall use one handler guard helper in place of the 35 hand-written recover blocks, one classified-failure constructor in place of the fifteen wrappers, and result envelopes that share embedded failure structures. *Source: BE-3, RF-C2.*
- **FR-057**: The backend shall use one key-value repository helper (get, upsert, transaction, versioned JSON) for settings, layout, recents and file metadata, and sqlc shall be used by all of them or removed. *Source: BE-3, RF-C3.*
- **FR-058**: The backend's production API shall contain no test-only setter, test-only constructor, race injector or package-level swap variable; test needs shall be met by constructor options or ports wired only at the composition root. *Source: BE-2, RF-C4.*
- **FR-059**: The `appmodel` package shall import neither the Wails runtime nor `bootstrap`, and the event emitter adapter shall live in the `application` package. *Source: BE-4, RF-C5.*
- **FR-060**: If an operation on a user-visible path (autosave, layout persistence, publication rollback, settings reset read-back, reopen view restore) returns an error, then the backend shall surface it to the user or log it with a stated reason; it shall never be discarded. *Source: BE-5, RF-C6.*
- **FR-061**: The application shall have one shutdown protocol that owns request identity, acknowledgement, pending-state discovery for a frontend that loads later, cancellation with confirmation, authorisation and stale-response rejection across the backend and the frontend, with bounded observation of bridge work. *Source: APP-2, APP-5, RF-C7.*
- **FR-062**: The backend shall document, in one package document, the document lifecycle, the lock order and the event contract. *Source: DOC-3.*
- **FR-063**: The backend shall contain no exported symbol without a production caller (the intentionally unused `ContentAccessor` and `DocumentCommands` seams excepted), and the unused `internal/gate` package shall be removed. *Source: BE-8, R20.*

### E. Six stages behind five scripts; hooks and CI run the same scripts

- **FR-064**: The repository shall provide exactly five entry-point scripts, `scripts/build`, `scripts/test <unit|integration|e2e|all>`, `scripts/verify`, `scripts/format [--check]` and `scripts/baseline`, and every `just` recipe shall be a one-line alias for one of them. *Source: TL-1, TL-2, TL-7, V3, RF-E1.*
- **FR-065**: The git hooks and the CI workflow shall call only the five entry-point scripts. *Source: TL-1, TL-5, RF-E1.*
- **FR-066**: When `scripts/verify` runs, each tool shall run at most once, the frontend shall be built at most once, and no `go build` shall run inside `go test`. *Source: TL-1, TL-6, RF-E2.*
- **FR-067**: `scripts/format` shall cover every tracked text file type with a documented ignore list, and `scripts/format --check` shall be what verify and CI run. *Source: TL-3, RF-E3.*
- **FR-068**: `scripts/baseline` shall record the commit, the dirty-diff identity, tool versions, per-stage exit codes and machine-readable failure identities; if an input is missing, then it shall fail closed; and its comparison shall never report green while a failure remains. *Source: B1, TL-7, RF-E4.*
- **FR-069**: When `scripts/build` finishes, the working tree shall be clean (the generated bindings' mode problem fixed once), and the dead recipes `package`, `sqlc-check`, `vuln`, `release-stack` and the hook wrappers shall be removed or implemented. *Source: TL-2, TL-4, RF-E5.*
- **FR-070**: CI shall run `scripts/verify` and the real-backend E2E stage on at least a macOS runner, and the release job shall either build the artifact or be removed. *Source: TL-5, RF-E6.*
- **FR-071**: The lint stage shall enforce the adapter-only bridge import rule, the primitives/components import rule, and the token-only colour rule from parsed imports and CSS; shall use typed TypeScript linting with explicit tsconfig ownership for source, tests, Node tools, generated files and reports; shall reject a committed `.only`; and shall fail when a required suite collects zero tests. *Source: TL-6, AG-6, AG-7, RF-E7.*
- **FR-072**: The repository shall declare the Node, Go and Wails CLI versions and the dependency installation command in one place shared by local runs, hooks and CI, and lockfiles shall be preserved. *Source: AG-8, RF-E8.*
- **FR-073**: The build stage shall validate the actual tagged Wails desktop artifact and the required host toolchain, and the CGO-free check shall be named and scoped to the backend and SQLite rather than claimed for the desktop binary. *Source: AG-9, RF-E8.*

### F. One authority and current, intent-level agent guidance

- **FR-074**: The repository shall have one normative tree, `specs/<feature>/` plus a concise architecture map, and `README.md`, `AGENTS.md`, `CLAUDE.md`, the constitution and the archive pointer shall all name it. *Source: PR-1, DOC-4, DOC-5, D5, RF-F1.*
- **FR-075**: `docs/delivery/` shall be moved to `docs/_archive-2026-09-delivery/` with a README pointer, and the decisions and ADRs still relevant shall be carried into the architecture map. *Source: D5, H-8, RF-F1.*
- **FR-076**: The architecture map shall name the owner of shared UI, commands, document lifecycle, persistence and verification, and shall record the durable decisions of this feature; routine reversible choices shall need no decision record. *Source: AG-3, RF-F4.*
- **FR-077**: `AGENTS.md` and `CLAUDE.md` shall contain the product intent, the authority and command pointers, the ownership map pointer, the branch convention and the design judgment tools cannot supply, and shall contain no dated incident stories, no arbitrary line limits, no required per-turn forms and no duplicated mechanical rules. *Source: PR-3, AG-1, AG-10, RF-F2.*
- **FR-078**: Every command, file and path named in an instruction file shall exist. *Source: PR-2, RF-F3.*
- **FR-079**: The legacy phase/story workflow (`.agents/commands/*`, the five legacy skills, their `.claude/skills` symlinks, `docs/delivery/WORKFLOW.md`, `DOD_TEMPLATE.md`) shall be removed or rewritten to the current workflow, and nothing shall reference a removed file; the Spec Kit core files and its extensions shall not be modified by this feature. *Source: PR-5, AG-5, RF-F3.*
- **FR-080**: The instructions shall tell an agent to find the existing owner of a behaviour and its consumers before adding an implementation, to proceed through authorised diagnosis, implementation and verification without task-path, rule-count, branch-per-file or per-rule-test quotas, and to surface genuine product ambiguity, destructive scope or durable trade-offs. *Source: AG-1, AG-2, AG-3, RF-F6, RF-F7.*
- **FR-081**: Every mechanical convention (formatting, syntax, import boundaries, colour tokens) shall have one executable owner in the format, lint or build stage, and its duplicated prose instruction shall be removed once the check works; paperwork constraints with no product value shall be deleted rather than moved into a linter. *Source: TL-6, AG-6, RF-F5.*
- **FR-082**: The constitution shall be amended through the constitution workflow so that no principle requires `docs/delivery` authority, requirement anchors in tests, a named proving test per rule, or the baseline-gate ritual; the version, the amendment date and the sync impact report shall be updated. *Source: AG-2, PR-1, constitution §I, §II, §VII.*
- **FR-083**: Production source comments and documentation shall contain no task or requirement ID, and comments shall state current contracts and non-obvious rules rather than history. *Source: DOC-1, BE-7, RF-F5.*
- **FR-084**: The public contract of every widget with many inputs (for example the menubar) shall be documented where the widget is defined. *Source: DOC-3.*
- **FR-085**: The instructions shall state the branch convention: `app_version_1_codebase` as the release branch, `feature/<NNN>-<short-description>` per feature and `feature/<NNN>-<short-description>-<task>` per task. *Source: H-7, owner input.*

### G. The repository contains only what the product and its verification need

- **FR-086**: The repository shall no longer track `specs/*/evidence`, `docs/audits/*-evidence`, `test-results/`, tracked screenshots and probe logs, `frontend/evidence`, `cmd/native-evidence` and `frontend/public/*.test.*`, while `docs/audits/2026-09-07-project-health-audit.md` and `docs/_archive-2026-07-28-specification/` shall remain. *Source: §5.8, TL-10, owner decision.*
- **FR-087**: `.gitignore` shall ignore run artefacts, IDE folders and build output once each, with no contradictions and no feature-specific rules. *Source: §5.8, TL-10.*
- **FR-088**: The repository shall contain no script that nothing invokes (`scripts/baseline_verify_test.sh` and the `frontend/scripts` theme scripts are either wired into a stage or removed). *Source: TL-7, inventory.*
- **FR-089**: The known-issues list shall be reconciled: every entry is either fixed by this feature, moved to the architecture map as an open decision, or removed as stale. *Source: H-9, PR-2.*

### Key Entities

- **Stage**: one verification step (Build, Unit tests, Integration tests, E2E, Lint, Format) with a name, the toolchain it needs, and its pass/fail rule.
- **Entry-point script**: one of the five scripts; the only way a stage is run; called by aliases, hooks and CI.
- **Test root**: a directory per test category with its placement rule and the list of white-box exceptions with reasons.
- **Shared component**: a UI behaviour with one implementation, its variants, and its consumer inventory (the list of screen areas that must use it).
- **Document lifecycle owner**: the backend object that holds a document's identity, revision, write order, commit, publication and disposal.
- **Shutdown request**: a close or quit request with an identity, an acknowledgement state, a cancellation state and an authorisation state.
- **Authority map**: the architecture map that names the owner of each shared behaviour and records durable decisions.
- **Decision record**: a durable product or architecture decision (for example the native window frame, the link policy) recorded in the authority map.
- **Archive tag**: `archive/v1-linear-history-2026-09`, the reference tree for regression tests and the record of the pre-refactor history.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every defect listed in Story 1 has a regression test that fails on the archived tree and passes on the refactored tree (nineteen scenarios, zero exceptions without a recorded host reason).
- **SC-002**: The E2E stage starts the real Go application process; zero E2E tests run against a TypeScript imitation of the backend.
- **SC-003**: The packaged application starts, opens, edits, previews and saves a document with networking disabled; the application itself attempts zero outbound connections (document-referenced web content is governed by the user's remote-content setting).
- **SC-004**: Zero test files under `frontend/src`, `frontend/public`, the binary's embedded assets or Go production packages, beyond the listed white-box exceptions.
- **SC-005**: Zero test titles, zero production comments and zero documentation sentences contain a task or requirement ID (patterns `T###`, `FR-`, `SC-`, `STORY-`, `Proves:`).
- **SC-006**: Zero tests read a specification or documentation file, assert CSS text, DTO field order, struct field counts or source text.
- **SC-007**: Exactly five entry-point scripts exist; the hooks and the CI workflow reference no other command; each tool runs at most once per verify.
- **SC-008**: A build leaves `git status` clean.
- **SC-009**: Every menu family in all six theme/mode combinations shows the elevation shadow when opened by pointer and by keyboard (computed-style check, zero failures).
- **SC-010**: Zero `[data-theme]`, `[data-mode]` or parity selectors in widget stylesheets; zero dead or undefined tokens.
- **SC-011**: One change to a shared component's behaviour reaches every consumer in its inventory (verified for popup, bar, tab, button, pane, sidebar, modal, status item by the consumer inventory check).
- **SC-012**: Opening, saving and closing forty documents leaves zero retained per-document resources in the backend.
- **SC-013**: A fresh agent session, given only the instruction files, runs all six stages and locates the owner and consumers of one shared behaviour without a missing command or an unanswered question.
- **SC-014**: Every command, file and path referenced by an instruction file exists (link check, zero failures).
- **SC-015**: The tracked repository shrinks by the size of the removed evidence trees (about 56 MB) and contains zero run artefacts.
- **SC-016**: The application's capability inventory (window, themes, settings, editor, preview, files, tabs, autosave, conflicts, close, recents) is unchanged: every feature 001–003 acceptance scenario still passes, and no new capability is present.
- **SC-017**: The constitution's version and amendment date are updated and no principle contradicts the requirements above.

## Assumptions

- **Approved behaviour is the baseline.** Features 001–003 as accepted define what the application does. This feature restores, fixes, consolidates and removes; it adds nothing. Where a shared component would change accepted behaviour, the change is recorded as a decision first.
- **Owner decisions taken on 2026-09-08**: `specs/` is the only normative tree and `docs/delivery` is archived (D5); Go tests are black-box under `tests/go` with listed white-box exceptions (D3); the pixel-parity harness and the mock bridge are deleted once the real-backend E2E runs (D4, D6); the evidence trees are removed while the audit report and the original specification archive stay; the constitution is amended through its workflow.
- **Owner decisions taken on 2026-09-08 during specification**: the toolbar keeps the `»` overflow menu at 768 px and the tab bar scrolls (D1, FR-040); not-yet-implemented controls stay visible but disabled and the agent-added Document details and Toggle Assistant items stay as accepted amendments (D8, D10, FR-052); document-referenced web content loads under the original spec's remote-content setting with a placeholder when it cannot load, and "offline" means the application runs without internet, not that content or the assistant may never use it (D7, FR-053).
- **Decisions taken by default, to be confirmed in clarification**: icon tool buttons are square (D2, owner PDF); the native window frame stands (D9); the preview-link policy is the audit's recommendation (D11, FR-018); a timeout never authorises discarding data and no session restore is introduced (D12, FR-024).
- **Spec Kit is out of scope.** The `speckit-*` skills, `.specify/`, its templates and its extensions (memory-loader, ralph, superpowers-bridge) are owned by the Spec Kit CLI and are not modified. `.specify/feature.json` stays untracked by Spec Kit design.
- **Order of work.** The scripts and the instruction rewrite land early enough that the old instructions cannot regenerate the rejected process during the refactor; the real-backend E2E exists before the mock and the parity stack are deleted; test relocation and the scripts move together because runners own directories.
- **The audit stays.** `docs/audits/2026-09-07-project-health-audit.md` remains in the repository as read-only input; its evidence folder is removed from the tree and stays reachable under the archive tag.
- **The mockup is a design reference**, not a binding contract; visual acceptance is by behaviour and computed style, not pixels.
- **Hosts.** Development and verification happen on macOS; Linux behaviour is verified where a runner exists; Windows is not verified by this feature.
- **Branch protocol during this feature.** Work happens on `feature/004-codebase-refactoring` and its task branches; the feature is squash-merged into `app_version_1_codebase` by the owner when done.

## Appendix — Coverage of audit findings

| Audit finding | Resolved by | Note |
| --- | --- | --- |
| UI-1 | FR-010 | popup shadow and focus ring |
| UI-2, UI-3, UI-6, UI-8 | FR-037 | one Popup, one lifecycle, one menu definition |
| UI-4 | FR-012 | tab menu anchor |
| UI-5 | FR-011 | second click and keyboard parity |
| UI-7 | FR-050 | menubar not under the appearance controller |
| UI-9 | FR-041 | ToolButton and Button |
| UI-10 | FR-039, FR-041, FR-047 | Bar, Island, Segmented |
| UI-11 | FR-042, FR-048 | skins as tokens |
| UI-12 | FR-034, FR-048 | parity residue removed |
| UI-13 | FR-043 | Pane |
| UI-14 | FR-045 | Sidebar |
| UI-15 | FR-015, FR-044 | status facts |
| UI-16 | FR-046 | ModalShell |
| UI-17 | FR-048, FR-063 | dead tokens and exports |
| UI-18 | FR-037–FR-047, SC-011 | adoption by consumers |
| §5.2.6 God components | FR-050 | decomposition by responsibility |
| BE-1 | FR-004, FR-055 | one lifecycle owner |
| BE-2 | FR-058 | test seams removed |
| BE-3 | FR-056, FR-057 | guard, failure constructor, KV helper |
| BE-4 | FR-059 | layering |
| BE-5 | FR-005, FR-060 | dropped errors |
| BE-6 | FR-055, FR-061 | concurrency and lock order |
| BE-7 | FR-083 | comments |
| BE-8 | FR-063 | dead exports |
| T-1 | FR-028, FR-034 | real-backend E2E |
| T-2 | FR-034 | parity harness deleted |
| T-3 | FR-025, FR-030 | no document-reading tests |
| T-4, T-5 | FR-034, FR-035 | infrastructure and redundancy |
| §5.4.2 naming | FR-031, FR-036 | titles and anchors |
| §5.4.3 entanglement | FR-025, FR-034, FR-058 | test code out of production |
| DOC-1 | FR-083 | diary comments |
| DOC-2 | FR-031 | ID titles |
| DOC-3 | FR-062, FR-084 | contracts documented |
| DOC-4, DOC-5 | FR-074 | one authority; README |
| DOC-6 | FR-029, FR-053 | offline proof; remote content decision |
| TL-1 | FR-064–FR-066 | one step list |
| TL-2 | FR-064, FR-069 | recipes as aliases; dead recipes |
| TL-3 | FR-067 | format coverage |
| TL-4 | FR-069 | build leaves tree clean |
| TL-5 | FR-065, FR-070 | CI runs the scripts and the real app |
| TL-6 | FR-030, FR-071, FR-081 | boundaries in lint, paperwork deleted |
| TL-7 | FR-064, FR-068, FR-088 | scripts; fail closed; orphans |
| TL-8 | FR-028, FR-034 | evidence driver seeds E2E, then goes |
| TL-9 | FR-034 | mock bridge deleted |
| TL-10, §5.8 | FR-086, FR-087 | hygiene |
| PR-1 | FR-074 | one authority |
| PR-2 | FR-078 | dead references |
| PR-3 | FR-077 | AGENTS.md |
| PR-4 | out of scope | Spec Kit extension hooks are owned by the Spec Kit CLI |
| PR-5 | FR-079 | one workflow |
| AG-1, AG-2, AG-3, AG-10 | FR-077, FR-080, FR-082 | autonomy, ownership guidance, no quotas |
| AG-4 | out of scope | ralph is a Spec Kit extension |
| AG-5 | FR-079 (project files only) | bridge and memory-loader are out of scope |
| AG-6, AG-7 | FR-071 | typed lint, real boundaries |
| AG-8 | FR-072 | one toolchain owner |
| AG-9 | FR-073 | accurate CGO scope |
| APP-1 | FR-016–FR-018, FR-033 | link handling |
| APP-2 | FR-019, FR-020, FR-061 | close during startup |
| APP-3 | FR-021 | Retry |
| APP-4 | FR-022 | failure identity |
| APP-5 | FR-023, FR-024, FR-061 | bounded bridge work, cancellation |
| C1 | FR-001, FR-002 | write ordering |
| C2 | FR-003 | lock discipline |
| C3 | FR-004 | disposal |
| C4 | FR-005 | autosave errors |
| C5 | FR-006 | file identity |
| C6 | FR-007 | Save keeps Undo |
| C7 | FR-008 | Open metadata |
| C8 | FR-009 | settings transaction |
| B1 | FR-068 | verify fails closed |
| R1, R3 | FR-037 | popup owners and placement |
| R2 | FR-011 | trigger lifecycle |
| R4 | FR-046 | modal |
| R5, R6 | FR-047 | Segmented, Icon |
| R7 | FR-039 | toolbar composition |
| R8–R11 | FR-049 | command policy |
| R12 | FR-049 | label tables |
| R13 | FR-045 | sidebar |
| R14 | FR-012 | tab menu anchor |
| R15 | FR-013 | shortcuts shown |
| R16 | FR-014 | menus fit the frame |
| R17 | FR-043 | pane |
| R18 | FR-050 | view transition owner |
| R19 | FR-015, FR-044 | details facts |
| R20 | FR-048, FR-063 | unused contracts |
| H-1…H-9 | context; FR-085, FR-089 | history; branch convention; known issues |
| D1, D7, D8, D10 | FR-040, FR-053, FR-052 | owner decisions recorded 2026-09-08 |
| D2, D9, D11, D12 | FR-041, FR-054, FR-018, FR-024 | defaults recorded |
| D3, D4, D5, D6 | FR-025/026, FR-034, FR-074/075, FR-034 | owner decisions |
