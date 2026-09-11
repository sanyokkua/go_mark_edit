# Feature Specification: Codebase Refactoring

**Feature Branch**: `feature/004-codebase-refactoring`

**Created**: 2026-09-08

**Status**: Draft

**Input**: User description: "Create a new specification/feature where we refactor the current codebase. No new functionality is expected. Fix the issues described in `docs/audits/2026-09-07-project-health-audit.md`: fix all known bugs; implement common components and reuse them; clean up the tests, removing bureaucracy tests and keeping only real functionality tests; fix the e2e tests so they run against the real backend instead of a stub; remove god objects and fix folder and component structure; fix code documentation and remove requirement and task IDs from code and tests; rewrite the project-level agent docs, skills, rules and commands (not the Spec Kit files); rewrite the scripts; clean the repository of generated temporary files and screenshots; remove the old `feature/v1-implementation*` branches, using `app_version_1_codebase` as the release branch and `feature/<NNN>-<short-description>[-<task>]` for feature and task branches."

## Glossary

- **Backend**: the Go program that owns the application state, reads and writes files, and stores settings.
- **Frontend**: the React screen shown inside the native window.
- **Bridge**: the Wails channel through which the frontend calls the backend and receives its events.
- **Adapter**: the one frontend folder (`frontend/src/logic/adapter/`) allowed to talk to the bridge.
- **Projection**: the frontend's read-only copy of the backend state; the backend is the source of truth.
- **Composition root**: the single place where the parts of the backend are wired together (`main.go` today).
- **Shared component**: one piece of UI with one implementation that every screen area uses; its consumer inventory (the screen areas that must use it) is kept in the architecture map.
- **Stage**: one verification step. The six stages are Lint, Format check, Build, Unit tests, Integration tests and End-to-end tests, run in that order.
- **Entry-point script**: one of the five scripts under `scripts/` that run the stages and the developer commands; every hook, CI job and `just` alias calls these scripts and nothing else.
- **Test root**: a directory that holds only tests, separate from production code.
- **White-box test**: a `_test.go` file that declares the production package name and sits beside the code it tests; compiled only under `go test`.
- **End-to-end (E2E) test**: a test that starts the real application (Go backend plus frontend through `wails dev`) and drives it like a user.
- **Walkthrough**: the manual check of the packaged binary on the developer's host, following the step list in the architecture map.
- **Notification surface**: the one non-blocking place in the screen that shows Save errors, refused links and stuck-call notices.
- **Architecture map**: `docs/architecture.md`, the one concise file that names the owner of each shared behaviour and records durable decisions; with `specs/<feature>/` it is the authority.
- **Archived tree**: the code as it was before this feature, kept under the git tag `archive/v1-linear-history-2026-09` (commit `bc185c9`).
- **Pixel-parity harness**: the test stack that compares screenshots of the application with a static HTML mockup, pixel by pixel.
- **Owner**: the project owner, who accepts this feature.

## Background

### Where the project stands

GoMarkEdit is a native, offline Markdown editor: one Go process shows a React screen in a native window. Three finished features exist (001 product foundation, 002 editor stage, 003 real files and tabs). Their code is on the integration branch `app_version_1_codebase` as three squash commits, and the granular history is kept under the tag `archive/v1-linear-history-2026-09`.

On 2026-09-07 the owner audited the project (`docs/audits/2026-09-07-project-health-audit.md`, revision 2.2). Its findings, which each user story below details:

- The prescribed shared component library was never built; popups, menus, buttons and dialogs exist as drifting copies, and the visible menu defects come from those copies.
- Verification never touched the real application: the tests called "E2E" run against a TypeScript imitation of the backend, a fifth of the test code compares pixels, and eight real defects shipped.
- Tests sit beside production code, are titled with task and requirement IDs, and some check documents or source text instead of behaviour.
- The backend's document lifecycle has no single owner; test-only hooks are part of the production API; guard, error and wiring code is copied dozens of times.
- The verification step list is defined six times in scripts and five times in prose; CI never builds or runs the real application; the release job is a placeholder.
- Four documents give four answers to "what is normative"; agent instructions reference commands that no longer exist; two incompatible workflows are both live.
- About 56 MB of committed evidence and screenshots sit beside about 3 MB of product code.

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

- The Go backend owns the application state; the frontend copy is a projection updated by backend events, and every user action crosses the bridge as a command.
- Only the adapter folder imports the generated bridge bindings.
- Every bridge handler returns one typed result envelope, takes no context parameter, and recovers from panics.
- Every colour is a token in `frontend/src/ui/styles/tokens.css`.
- The binary uses CGO-free SQLite; migrations only add, never rewrite; several windows can run at once with no lock.
- File writes are atomic, keep permissions, line endings and byte-order marks, and detect external changes.
- Rendered Markdown is sanitised.
- Every unbounded input has a numeric bound and a visible refusal.

### Branch layout after this feature

- `master`: protected; the only release branch. It receives `app_version_1_codebase` when the owner decides the release functionality is complete; version tags `v*` on it start the release workflow, and no other branch has a release trigger.
- `app_version_1_codebase`: the integration branch; one squash commit per finished feature; no release is built from it.
- `feature/<NNN>-<short-description>`: one branch per feature, from `app_version_1_codebase`.
- `feature/<NNN>-<short-description>-<task>`: an optional branch for a task big enough to benefit from several commits, from the feature branch, squash-merged back so the feature branch keeps about one commit per task; a small task commits straight to the feature branch.

## Clarifications

### Session 2026-09-08

The answers still in force after thirteen clarification sessions and the final review, grouped by topic. Each is carried by the requirement named in parentheses.

**Startup and shutdown**

- Q: What must happen when the screen or the bridge is lost while documents have unsaved changes or a write is pending? → A: Finish every write that already started, then show a native confirmation that names the documents with unsaved changes and offers "Quit and discard" or "Cancel"; exit only after the user confirms; no session restore. The screen counts as lost when a native close or quit request is not acknowledged within 10 seconds, or arrives before the frontend ever reached ready. (FR-018)
- Q: Does a close request with nothing unsaved still wait for the frontend? → A: Before ready the application exits at once; after ready the frontend is always asked so the editor's working copy is flushed, and the application exits on a clean acknowledgement or after 10 seconds without one. (FR-017)
- Q: What happens when a startup step stays unanswered for 10 seconds before the frontend is ready? → A: The startup-failure screen names that step as "did not answer within 10 seconds"; Retry is a fresh attempt; a late answer from the abandoned attempt is ignored; the stuck notice exists only after ready. (FR-015)
- Q: Which recovery does the startup-failure screen offer per failed step? → A: A bridge failure offers only Quit; model, settings and window-ready failures offer Retry of that step; Quit is always available. (FR-015)

**Stuck backend calls**

- Q: How long may a backend call stay unanswered before the user is told? → A: 10 seconds after the frontend is ready; one non-blocking notice per stuck request in the notification surface, with Retry and Cancel; editing continues; a late result is still applied and the notice withdrawn. (FR-020)
- Q: Which commands are exempt from the 10-second bound? → A: Commands that open a native dialog (Open, Save As, Save of an untitled document, resolving a close plan) are declared user-paced by the adapter and have no bound. (FR-019)
- Q: What does Retry send, and how is a double application prevented? → A: Every bridge command carries a request identity; Retry re-sends it unchanged; the backend returns the original outcome if that request already completed or is still running; completed outcomes are kept for 60 seconds and at most 256, oldest evicted first; a Retry after eviction is a fresh command. (FR-021)
- Q: What does Cancel do to the running command? → A: Nothing; it dismisses the notice and stops waiting; the late result is still applied silently. (FR-020)

**Preview links**

- Q: Which link targets may open, and where is a refusal shown? → A: In-document anchors scroll the preview; local files with an extension the Open dialog accepts (`.md`, `.markdown`, `.mdown`, `.txt`) inside the document's folder open in a tab; `https` and `http` open in the system browser; every other scheme, any local file outside the document's folder and any relative link in an untitled document is refused with one auto-dismissing warning notice in the notification surface naming the target and the reason. (FR-014)

**Test tiers and regression evidence**

- Q: What separates unit, integration and E2E tests? → A: Dependencies. Unit: one module, no disk, database, rendered UI or bridge. Integration: real temporary files, a real temporary SQLite database, or rendered React with the store driven by state patches, with nothing answering a command (no adapter double, no bridge stand-in) and no Go process. E2E: the real application through `wails dev`, the only tier that renders the application in a browser; computed-style and theme checks live there. (FR-022, FR-025)
- Q: How may a white-box test reach unexported Go code? → A: As an in-package `_test.go` file beside the code, listed in the plan with its reason; no export shim. (FR-023)
- Q: How does a regression test prove it fails on the archived tree when the refactor changes the interfaces? → A: One regression test per defect at a level both trees share (a bridge call or the driven screen), run once against the archived tree with its failure recorded in the plan; a defect observable only inside the Go process gets a throwaway Go test against the archived tree's own API, run once in an archive worktree and not ported. (FR-031)
- Q: Where is the mapping from tests to requirements kept? → A: Outside the test files only: no requirement or task ID anywhere in a test file. (FR-030)
- Q: How is "every feature 001–003 acceptance scenario still passes" demonstrated? → A: Per suite: before a test suite is deleted or rewritten, the plan names what now covers each behaviour it proved (a surviving test, a ported E2E case or a walkthrough step); a behaviour with no cover becomes a task. (FR-033; replaces the earlier per-scenario table)

**Real-backend E2E mechanics**

- Q: What does the E2E stage drive? → A: The real application started through `wails dev`, driven by browser automation in Chromium at the local address `wails dev` serves; the native window is exercised by the walkthrough. (FR-025)
- Q: How does the E2E stage isolate the profile and open files without a test hook? → A: The harness redirects the operating-system config root (`HOME` on macOS, `XDG_CONFIG_HOME` on Linux) to a temporary directory for the launched process, seeds the Recents list by writing the SQLite database there before launch, and opens files through the Recents menu; a Save As is proven at the bridge-call level with the dialog port replaced by a constructor option at the composition root; no tier automates a native dialog. (FR-025, FR-054)
- Q: How are faults provoked (failed startup step, settings rejection, unanswered call, lost cancellation)? → A: Only through the environment the harness controls: profile database contents and permissions, document file permissions, and a path whose read blocks until released; a case with no lever is split into a frontend integration test driven by state patches (or a unit test of the owning module) plus a Go integration test, the reason recorded in the plan; no seam is added to the binary. (FR-026)
- Q: How many automatic re-runs may a failing E2E case get? → A: Zero; the harness configuration forbids retries and a timing failure is a defect. (FR-026)

**Packaged binary and the walkthrough**

- Q: How is the packaged binary verified, given that the hosted runner cannot grant accessibility permission? → A: By a walkthrough on the developer's host before each release, covering what is observable from outside the process (launch, native Open, Save As, close and quit dialogs, files on disk, links opened in the system browser); its step list lives in the architecture map; each performed walkthrough is one sentence (date, commit, host, outcome) in the GitHub Release notes for that tag; the walkthrough that closes a feature with no release, this one included, is performed against the binary built locally and recorded as one sentence in the plan; CI runs no OS-level automation. (FR-027)
- Q: How is the networking-disabled cold start proven? → A: On the developer's macOS host, recorded in the plan; CI asserts nothing about the network. (FR-028)

**Scripts, hooks, CI and release**

- Q: What does `scripts/verify` run? → A: All six stages in order by default; `scripts/verify <stage>` runs one stage alone; `scripts/verify --skip e2e` is for hosts that have the toolchain but no usable screen (the push runner). Build always needs the toolchain and fails clearly without it; a toolchain-less host runs `scripts/verify lint`, `scripts/verify format`, `scripts/test unit` and `scripts/test integration` directly. (FR-060, FR-071)
- Q: Which `just` recipes may exist? → A: Only one-line aliases of the five scripts; `wails dev`, the dependency install and binding generation are the sub-commands `scripts/build dev` and `scripts/build setup` (binding generation runs inside `scripts/build`). (FR-060)
- Q: Which git hooks exist? → A: Two: pre-commit runs `scripts/format --check`; pre-push runs plain `scripts/verify`. (FR-061)
- Q: Which CI tiers exist? → A: Every push: an Ubuntu runner with the Linux Wails toolchain (GTK and WebKitGTK development packages installed) runs `scripts/verify --skip e2e`, blocking, its Build stage linking the real Linux desktop artifact. Release: each target platform's runner (macOS in this feature) runs plain `scripts/verify` including the `wails dev` suite and builds that platform's artifact only on success. (FR-066, FR-067)
- Q: What starts the release workflow and what does it publish? → A: A `v*` tag on `master`, the only release branch (a tag on any other branch builds and publishes nothing), creates a GitHub Release with an unsigned zipped `GoMarkEdit.app` built for the runner's own architecture (arm64 today, the name stating it) attached, using the repository's built-in token; manual dispatch on any branch runs the same stages and uploads a workflow artifact as a dry run; signing and notarisation are an open decision in the architecture map; no release is made in this feature. (FR-067)
- Q: What version does the binary report? → A: The workflow derives `X.Y.Z` from the `vX.Y.Z` tag (the dispatch input on a dry run) and passes it to `scripts/build`, which stamps it into the binary and the bundle metadata so About reports it; a build given no version reports `dev`. (FR-068)
- Q: Is `scripts/baseline` required, and where does its record live? → A: Required once per feature before the first implementation edit and compared before the feature closes, by instruction, never by a hook or CI; the record is a gitignored local file (`.local_tmp_files/baseline/<feature>.json`). `scripts/verify` and `scripts/test` write only temporary run reports and never collect or compare a baseline; the closing comparison is one sentence in the plan. (FR-064)
- Q: What does `scripts/format` leave alone? → A: Only tool-owned paths: `.specify/**`, the `speckit-*` skill folders under `.claude/skills` and `.agents/skills`, generated bindings, build output, lockfiles, the `justfile` (whose only formatter is `just` itself) and disposable `specs/*/evidence/**` artifacts; ordinary `specs/**` and every other tracked text file are formatted. (FR-063)
- Q: May dependencies be installed over the network before the unit stage? → A: Yes, once, through the declared install command; the unit stage itself makes no network call and needs no `frontend/dist` and no native toolchain. Only the application must run without internet. (FR-024)

**Repository, instructions and persistence**

- Q: Where does the architecture map live? → A: `docs/architecture.md`; `specs/` stays purely Spec Kit feature folders. (FR-072)
- Q: Are the legacy phase/story workflow files deleted or rewritten? → A: Deleted, with every reference removed; the Spec Kit skills are the only workflow; Spec Kit-owned files are not modified. (FR-077)
- Q: Which files must be free of task and requirement labels? → A: Go and TypeScript production source, every test file, `README.md`, `AGENTS.md`, `CLAUDE.md`, `docs/architecture.md` and Go package docs. `specs/**`, `.specify/**`, `docs/audits/**` and `docs/_archive-*/**` keep them. (FR-080)
- Q: Is a task branch required? → A: Optional; used for a task big enough to need several commits and squash-merged back so the feature branch keeps about one commit per task; a small task commits straight to the feature branch. (Background, FR-081)
- Q: Is sqlc kept once settings, layout, recents and file metadata share one key-value helper? → A: Removed; the helper owns two hand-written parameterised statements and the transaction; no generated-SQL check joins the stages. (FR-053)
- Q: Must the refactored build read a profile database written by the archived tree? → A: No; it starts from defaults, leaves foreign rows in place and never rewrites them; no migration or old-tree database test is written. (FR-053)
- Q: When is the constitution amended? → A: Before `/speckit-plan`, through `/speckit-constitution`. Done on 2026-09-08 (version 2.0.0).

**Final review (2026-09-08)**

- Q: What is the baseline for feature 004 itself, given that `scripts/baseline` is created by this feature? → A: The five scripts are the first task; `scripts/baseline` then runs on the otherwise untouched tree before any other implementation edit; at close the comparison must show every recorded finding gone and nothing new. (FR-064)
- Q: Where is the walkthrough that closes feature 004 recorded, given that the constitution requires a recorded walkthrough? → A: As one sentence (date, commit, host, outcome) in the plan, like the baseline comparison. (FR-027)
- Q: Which local files may a preview link open in a tab? → A: Any file with an extension the Open dialog accepts (`.md`, `.markdown`, `.mdown`, `.txt`), resolved after symlinks inside the document's folder; a relative link in an untitled document has no folder and is refused. (FR-014)
- Q: Do the eight screenshots under `specs/003-real-files-and-tabs/surface/` leave with the evidence? → A: Yes; the product icons under `build/` and the tab-icon SVG stay. (FR-082)
- Q: How long does a refused-link notice stay? → A: It is an auto-dismissing warning that the user may dismiss early; Save errors and the stuck notice keep their rules. (FR-014)
- Q: What does this feature do with images in the preview, which today are all replaced by an "Image unavailable" placeholder? → A: An image whose path resolves, after symlinks, inside the document's folder renders; a web image, an image outside the folder, an image larger than 20 MB and any image of an untitled document keep the placeholder with the alt text, with no notice; the remote-content policy stays with the rendering feature. This is the one capability this feature adds. (FR-049)
- Q: Is there a wall-clock budget for plain `scripts/verify`? → A: No; the plan records the measured duration of a full run at feature close. (FR-062)
- Q: What is the "safe diagnostic identity" on the startup-failure screen? → A: The step name plus the error category (for example "Settings: database unreadable"); never a file path, a stack trace or raw error text, which go to the local log. (FR-015)
- Q: Which bars use the shared ToolButton? → A: The formatting toolbar only; the tab bar's and the menubar's controls belong to TabBar and Bar. (FR-038)

## User Scenarios & Testing _(mandatory)_

### User Story 1 - The editor never loses work or strands the user (Priority: P1)

A person edits Markdown files in GoMarkEdit. Whatever they do (save, save as, let autosave run, open a file twice, click a link in the preview, close the window while the app is starting), the editor keeps their text, their undo history and their focus, tells them when something failed, and always lets them close the window.

**What is wrong today** (every item was reproduced by the audit):

- _Save As while autosave is running._ The two writes finish in the wrong order. The new file is reported as clean while it holds the older text, and the old file holds the newer text. Closing the tab then discards the newer text. (`internal/appmodel/save.go`, `write_coordinator.go`)
- _Refusal message without the lock._ When a stale Save is refused, the message is built by reading the document map without holding the lock. The race detector confirms a data race with a concurrent New Document; Go can abort the process on a concurrent map access. (`save.go:701`, `file_lifecycle.go:66`)
- _Closed documents keep their text forever._ Close never deletes the per-document write coordinator, which holds the full saved text and its encoded bytes. The 40-document limit does not bound this memory. (`close_plan.go`, `write_coordinator.go`)
- _Autosave fails silently._ Preparation errors, normalisation outcomes and the whole write outcome of an autosave are discarded. The error channel exists but autosave never uses it. (`autosave.go:204–227`)
- _A hard link opens a second tab on macOS._ File identity falls back to the path spelling because the helper accepts only unsigned device and inode fields and Darwin's device id is signed. (`internal/file/paths.go:115–130`)
- _Save destroys Undo._ After every successful Save the frontend replaces the editor buffer; the editor is keyed on `documentId:content`, so it remounts, and the undo history, selection and focus are lost. Confirmed on the native build. (`App.tsx:1283–1300`, `EditorView.tsx:505`)
- _A clean opened file shows "Not saved"._ The Open event is built from raw metadata whose status is empty; the frontend shows `not-saved` for an empty status. (`file_lifecycle.go:371–379`, `DocumentIdentity.tsx:42–43`)
- _A rejected Appearance update half-persists._ Three separate upserts without a transaction: the theme is committed while later fields fail, and the partial state survives a restart. (`internal/settings/repository_sqlite.go:139–167`)
- _A menu opened with the mouse loses its shadow and shows a focus ring._ The global `*:focus-visible { box-shadow: var(--focus-ring) }` rule in `base.css` replaces the popup's elevation shadow because the opened menu becomes the focused element. Keyboard-opened menus keep the shadow. (`frontend/src/ui/styles/base.css:104–107`)
- _A second click on a menu button behaves differently per menu._ File, About and View stay open; Settings toggles. (`ShellMenuRow.tsx`, `SettingsMenu.tsx`)
- _The tab context menu ignores where you clicked._ It is always drawn at the top-right of the shell; its keyboard shortcuts are stored but never shown; near the minimum window width menus are clipped; the status bar's Details popup omits the word count it dropped from the row. (`DocumentTabs.tsx:1217–1220`, `TabContextMenu.tsx:253–266`, `minimumWindow.ts`, `StatusBar.tsx`)
- _A preview link replaces the application._ Links in the rendered preview are ordinary anchors. Clicking a relative link navigates the whole page. In development mode the dev server answers with the app's index page without the bridge scripts, so React restarts without the bridge and shows the startup-failure screen; Retry cannot restore the bridge. (`MarkdownView.tsx`, `logic/markdown/renderer.ts:39–53`)
- _The window cannot be closed after a failed start._ The backend emits the close request once and vetoes native close; the frontend only listens once startup succeeded; later close requests are vetoed without a new event. The startup-failure screen offers only Retry. On macOS, Quit goes through the same veto. (`internal/application/close_coordinator.go`, `App.tsx:1962–1969`)
- _Retry repeats a cached failure._ The settings projection keeps its rejected promise; Retry never disposes it, so a settings failure after a successful model load is never retried. (`logic/store/settingsProjection.ts`)
- _Every startup failure is called a settings error._ Adapter, model, settings, window-ready and subscription failures collapse into one message about local settings, which points diagnosis at the database. (`App.tsx:159–185`, `en.json:69`)
- _Pending bridge calls never settle; cancel is reported early._ Generated bridge calls have no timeout; the frontend clears its "close pending" flag before the backend confirms the cancellation, so the two sides can disagree. (`App.tsx:833–840`)

**Why it matters**: these are the defects a user meets in the first hour with real files. Every later feature builds on save, close and startup. No existing test could have caught them, which is why Story 2 has the same priority.

**Why this priority**: data loss and a window that cannot close are the most serious defects an editor can have.

**Independent Test**: each defect has a scenario below and one regression test at a level both trees share (FR-031); run once on the archived tree it fails, on the refactored tree it passes. The link and close scenarios also run on `wails dev` and in the walkthrough.

**Acceptance Scenarios**:

1. **Given** a document with unsaved edits and autosave enabled, **When** the user runs Save As to a new path while an autosave is still writing, **Then** the new path holds the newest text, the old path holds what the committed autosave wrote, and the tab shows clean only when the file on disk matches the editor.
2. **Given** two documents, **When** a stale Save on one and New Document on the other run at the same time under the race detector, **Then** no data race is reported and the refusal message names the right document.
3. **Given** forty documents opened, edited, saved and closed, **When** the backend is inspected afterwards, **Then** no per-document coordinator, timer, token, reservation, normalisation or conflict record remains.
4. **Given** autosave is enabled and the file becomes unwritable, **When** the next autosave runs, **Then** the user sees the same classified error a manual Save would show, once per failure episode, and a later successful autosave shows nothing.
5. **Given** a file and a hard link to it on macOS or Linux, **When** the user opens the link while the file is open, **Then** the existing tab is focused and no second tab appears.
6. **Given** a document with edits and an undo history, **When** the user saves with the keyboard shortcut, **Then** the caret, selection, focus and undo history are unchanged and Undo still reverts the last edit.
7. **Given** a clean file on disk, **When** the user opens it, **Then** the status shows "Saved".
8. **Given** an Appearance update where a later field is rejected, **When** the application restarts, **Then** every Appearance field has the value it had before the rejected update.
9. **Given** any menu family and any theme, **When** the menu is opened with the mouse or the keyboard, **Then** the computed style shows the elevation shadow and the focus ring appears only on the focused item.
10. **Given** any open menubar menu, **When** the user clicks its trigger again, **Then** the menu closes; and Arrow, Home, End, Escape and typing behave the same in every menu family.
11. **Given** a tab, **When** the user right-clicks it or presses the context-menu key while it is focused, **Then** the menu opens at the pointer (or at the focused tab), stays inside the application frame, and shows each item's shortcut.
12. **Given** the window at its minimum width, **When** any menubar menu opens, **Then** the whole menu is visible inside the frame.
13. **Given** the status bar has dropped a fact for lack of space, **When** the user opens Details, **Then** the dropped fact (for example word count) is listed.
14. **Given** a document with an in-document anchor, a link to a sibling file with a supported extension, a link to a `.md` file outside the document's folder, an `https` link, a `mailto` link and a `file:` link, **When** the user activates each in the preview, **Then** each outcome matches the link policy of FR-014 and the application page, the bridge and the editing session stay intact.
15. **Given** the application shows the startup-failure screen, **When** the user closes the window or quits, **Then** the application exits, and if a document had unsaved changes or a write was pending the started write finishes and a native confirmation names the affected documents before anything is discarded.
16. **Given** a close request arrived while the frontend was loading, **When** the frontend finishes loading (or Retry succeeds), **Then** it discovers the pending request and handles it like a fresh close.
17. **Given** the model loaded but reading settings failed, **When** the user presses Retry, **Then** settings are read again in a fresh attempt, and only one attempt runs at a time.
18. **Given** a startup step fails or stays unanswered for 10 seconds, **When** the failure screen appears, **Then** it names the step, offers only Quit for a bridge failure and Retry for the other steps, and always offers Quit.
19. **Given** a close request the user cancels, **When** the backend has not yet confirmed the cancellation, **Then** the frontend still reports the request as pending, and the two sides agree once the confirmation arrives.

---

### User Story 2 - Verification exercises the real application (Priority: P1)

A maintainer (or an agent) runs the test stages and trusts the result, because unit and integration tests prove behaviour through public interfaces, and the end-to-end stage starts the real Go application and checks what lands on disk.

**What is wrong today**:

- _"E2E" never reaches Go._ `playwright.config.ts` starts Vite with the mock bridge (`frontend/src/dev/bridge-mock`, 2,351 lines re-implementing all 24 bridge bindings) and a second server for `mockup.html`. `docs/delivery/plan/KNOWN_ISSUES.md` recorded the divergence on 2026-07-25; it was never resolved. The only real-backend driver, `cmd/native-evidence` (about 2,169 build-tagged lines, a second composition root), is run by nothing.
- _One fifth of test code compares pixels._ `e2e/parity/**`, `targeted-parity`, `real-files-parity` and `interactive-states` total 9,901 lines; the first run of the 546-case harness scored 0 of 1,620. All eleven Playwright suites fail to start without `docs/delivery/spec/surface/`.
- _Tests read specification documents._ `spec_clause_count_test.go` counts `- Q:` lines in `spec.md`; `internal/apperr/contract_table_test.go`, the parity reference adapter and `native_evidence_safeguards_test.go` read `docs/` or `specs/`; the safeguards test runs two `go build`s inside `go test`.
- _Tests sit beside production code._ 59 Go test files inside `internal/*` packages (about 32 use unexported identifiers), 4 at the repository root, 3 in `cmd/`; 72 Jest files under `frontend/src`; `frontend/public/theme-bootstrap.test.mjs` is copied to `dist` and embedded in the binary; test shims live under `frontend/src/test/`; the evidence runtime lives in the production adapter folder.
- _Titles are ticket numbers._ 520 of 715 frontend `describe/it/test` titles start with an ID (`T045` ×18, `T157` ×15, ...). 182 Go and 223 TypeScript `// Proves:` comments cite requirement anchors, 47 of them retired. The convention served a traceability generator deleted on 2026-07-25.
- _Redundant and infrastructure-heavy suites._ Editor view tested three ways plus Playwright; `DocumentTabs.test.tsx` (2,005 lines) overlaps four suites; `App.test.tsx` is 3,292 lines and mocks the shell it tests; the mock bridge is tested three times; about 19 % of all test code is test infrastructure.
- _Production code carries test branches._ `?parity-case` URL branches in `AppShell.tsx`, `EditorView.tsx` and `CodeEditor.tsx` fake states for screenshots, with a formal allowlist in `frontend/scripts/archtest-allowlist.json`; `data-parity-shell` appears 59 times in production CSS.

**Why it matters**: a suite that certified "195 of 196 tasks done" while eight defects shipped provides no safety for a refactor. Every story below relies on this one to prove that behaviour did not change.

**Why this priority**: the refactoring cannot be verified without it, and the real-backend E2E must exist early so Stories 3 and 4 are checked against the binary.

**Independent Test**: from a fresh clone, run the unit stage without a native toolchain; run the E2E stage and observe a Go process start with a temporary profile directory; inspect the test roots and run the lint stage's title check.

**Acceptance Scenarios**:

1. **Given** a fresh clone after the declared dependency install, with no `frontend/dist` and no native toolchain, **When** the unit stage runs, **Then** it passes without making a network call.
2. **Given** the E2E stage, **When** it runs, **Then** a real Go process starts through `wails dev` with a disposable profile directory and temporary files, the files are opened through the seeded Recents list, the screen is driven in Chromium, and the bytes on disk and the state after a restart are asserted.
3. **Given** the packaged application on the developer's macOS host with networking disabled, **When** it is started cold and a document with no web references is opened, edited, previewed and saved, **Then** everything works and no outbound connection is attempted; **and When** a document that references a web image and an image file inside its own folder is previewed, **Then** the web image shows the placeholder, the local image renders, and the rest of the document renders.
4. **Given** the repository after this feature, **When** test files are listed, **Then** none is under `frontend/src`, `frontend/public` or a Go production package except the white-box exceptions listed in the plan, and every test sits in the root its dependencies dictate.
5. **Given** all test files, **When** they are scanned, **Then** no title or comment contains a task or requirement ID, and no test asserts source text, CSS declarations, DTO field order, struct field counts or the content of a specification or documentation file.
6. **Given** each defect in Story 1, **When** its regression test is run once on the archived tree, **Then** it fails and the failure is recorded in the plan; on the refactored tree it passes.
7. **Given** the real-backend suite, **When** it runs, **Then** it covers the six cases of FR-026, each once with no retry, every fault provoked only through the environment the harness controls.
8. **Given** the pixel-parity harness, the parity URL branches, the evidence driver and the mock bridge, **When** the real-backend E2E stage passes, **Then** all of them are deleted and the `just dev-ui` route is retired.
9. **Given** a test suite about to be deleted or rewritten, **When** the plan is read, **Then** it names what now covers each behaviour that suite proved, or a task for the behaviour that nothing covers.

---

### User Story 3 - One implementation per common UI behaviour (Priority: P2)

A maintainer changes a common behaviour (how a popup opens, how a bar overflows, how a tab looks) in one place, and every screen area that uses it changes together. A designer switches the theme and only colours, radii and shadows change, never behaviour.

**What is wrong today**:

- _Popups._ Six style owners with drifting values (radius 8 px, 12 px and 0.5 rem; minimum width 250 px and 14 rem; different padding, shadow token, hover and disabled rules): `MenuSurface.module.css`, `ShellMenuRow.module.css`, `DocumentTabs.module.css`, `EditorContextMenu.module.css`, `EditorChrome.module.css`, `StatusBar.module.css`. Ten implementations of the open/close behaviour (Escape, outside click, focus restore, arrow navigation, clamping to the frame); the 8 px clamp is copied four times; `document.querySelector('.application-frame')` appears seven times; shortcuts are formatted at eight sites in five ways; thirteen document-level `keydown` listeners.
- _Menus._ `ShellMenuRow.tsx` contains two full copies of every menu (desktop Radix version and a raw-portal version for windows at or below 376 px), about 150 duplicated JSX lines; keyboard behaviour differs by window width. The `EditorContextMenu` pointer listener runs while the menu is closed and refocuses the opener on every click.
- _Buttons and bars._ There is no Button or Tool button component; eleven button-like controls own their metrics. The toolbar (`EditorChrome.tsx`) cannot be composed without tabs, owns its own overflow engine, an arrangement radio that duplicates `Segmented`, and editor shortcuts; group order is spelled out twice.
- _Panes, sidebar, status, dialogs._ Editor and preview are two hand-written sections sharing only CSS; the paused-preview banner reaches into renderer internals with `display:contents` and `:has()`. The sidebar is an empty `<aside>` with its resize logic in `AppShell` that recognises its own patch by inspecting notification text. The status bar keeps two fact inventories and its Details popup is a sixth popup surface with no dismissal. Dialogs have four modal lifecycles, four overlay stylesheets and four focusable-selector strings; `ExternalChangePrompt` is mounted in three places.
- _Themes and tokens._ `[data-theme]` and `[data-mode]` selectors change geometry (not only colour) in seven widget stylesheets; 34 tokens are dead and two used tokens are undefined; `--icon-size`/`--icon-stroke` are bypassed by hardcoded values.
- _Layering._ `ui/primitives/ViewMenu.tsx` imports the action registry, the dispatcher and store types; `Banner`, `StatusBar` and `ViewModeToggle` import store types. The rule "components take props" exists in `rules.md` but is not enforced.
- _God components._ `App.tsx` 2,179 lines (19 `useState`, 36 `useCallback`, 29 adapter call sites); `DocumentTabs.tsx` 1,355; `ShellMenuRow.tsx` 1,041; `SettingsMenu.tsx` 610; `EditorChrome.tsx` 591. The menubar is rendered as a child of the appearance settings widget.
- _Command policy._ Availability, shortcut admission and aliases are decided in several places; formatting commands are built by two builders; settings writes go through two paths with different failure handling; the dispatcher collapses unknown outcomes into "mutated".

**Why it matters**: every visible defect in Story 1's menu items comes from a copy that drifted. Future features (assistant sidebar, folders, export) each need a popup, a bar, a pane and a sidebar; without shared components each will add another copy.

**Why this priority**: it removes the cause of the visual defects and makes the next features cheaper, but the data defects in Story 1 come first.

**Independent Test**: change one property of a shared component (for example the popup radius token) and verify every consumer in its inventory changed; open every menu family in all six theme/mode combinations and compare computed styles.

**Acceptance Scenarios**:

1. **Given** the shared popup, **When** its open/close behaviour is changed once, **Then** File, Settings, View, About, the narrow overflow menu, the tab context menu, the editor context menu, the toolbar overflow menu and Document details all change.
2. **Given** any two menus, **When** the same keyboard key is pressed, **Then** both behave the same.
3. **Given** the menubar, the tab bar and the formatting toolbar, **When** they are rendered, **Then** each is the shared bar frame with leading, main and trailing slots, and its overflow policy is a property of the bar.
4. **Given** the six theme/mode combinations, **When** any shared component is inspected, **Then** only token values differ; no widget stylesheet contains a `[data-theme]`, `[data-mode]` or parity selector.
5. **Given** `ui/primitives` and `ui/components`, **When** the lint stage runs, **Then** it fails if any file there imports the store, the adapters or the action registry, or if any file outside a shared component's folder carries a marker of a second implementation.
6. **Given** `App.tsx`, `DocumentTabs.tsx`, `ShellMenuRow.tsx` and `EditorChrome.tsx`, **When** they are read, **Then** composition, command orchestration, drag, popup and shortcut handling each have an identifiable owner.
7. **Given** the File menu, the toolbar, the tab context menu and a keyboard shortcut for the same action, **When** availability is computed, **Then** all four read it from the action registry.

---

### User Story 4 - One owner for the document lifecycle and shutdown in the backend (Priority: P2)

A maintainer can read one place to learn how a document is opened, written, published and closed, and one place to learn how the application shuts down. Adding a feature adds to that owner instead of adding another map.

**What is wrong today**:

- _Ten maps, eight counters._ `internal/appmodel/service.go` keeps documents, write coordinators, autosave timers, activation tokens, save reservations, normalisations, conflicts and more in separate maps synchronised by hand; the service struct has 40 fields; close forgets `writeCoordinators`, `normalizations` and `saveReservations`. This is the structural cause of Story 1's ordering, leak and status defects.
- _Test seams on the production API._ Five of six service constructors are test-only; `SetBeforeSaveAsRecheck` is invoked in the Save As hot path; race injectors sit inside repositories; `main.go` package variables are swapped by `main_test.go`; two runtime type assertions exist "so older test doubles continue".
- _Six copy-paste families._ 35 handler `defer/recover` blocks (about 216 lines); 21 lock-snapshot-mutate-publish sites with two different emit paths and manual unlocking (80 `Lock` calls versus 127 `Unlock`); four key-value repositories on one `settings` table (sqlc used by one); 37 classified-error constructions; 13 hand-written result envelopes with two error vocabularies; about 60 wiring lines duplicated between `main.go` and `cmd/native-evidence`.
- _Layering leaks._ `appmodel` imports the Wails runtime and `bootstrap`, and hosts three repositories; `NativeWindowService` holds the model service; `main.go` is not pure wiring; `holder.Init` does database work under the lock every handler takes.
- _Dropped errors._ Autosave outcome and detected conflict, layout persistence (`zerolog.Nop()`), publication rollback, settings reset read-back, and reopen `SetDocView` errors are discarded.
- _Concurrency risks._ The emitter is invoked while holding the write lock; a lock-drop/re-lock rollback can erase concurrent changes; a document pointer captured under the read lock is mutated without re-lookup; a close plan can stay `Executing` forever; `GetState` does a database read and `os.Stat` per recent entry on every hydration.
- _Comments narrate history._ 1,174 production comment lines; 23 `T###`, 32 `FR-` and 12 `SC-` references; the same task story is told three times.
- _Dead exports._ Unused exported symbols across `apperr`, `application`, `appmodel`, `file`, `logging`; the whole `internal/gate` package has no production importer.
- _Shutdown._ The close coordinator emits once and vetoes forever (Story 1); there is no request identity, no acknowledgement, no pending-state discovery for a restarted frontend, no bounded observation of bridge work.

**Why it matters**: each new capability (rendering, folders, OS integration, assistant runs) touches open, write and close. With ten maps every one of them adds a map and a cleanup line that can be forgotten.

**Why this priority**: it fixes the root cause behind several Story 1 defects, and Story 1's fixes are the first consumers of the new owner.

**Independent Test**: open, edit, save, close many documents under the race detector and assert nothing is retained; read the package documentation and find the lifecycle, the lock order and the event contract in one place.

**Acceptance Scenarios**:

1. **Given** a document, **When** it is opened, written, published and closed, **Then** one lifecycle owner records its path identity, buffer revision, write order, disk commit, publication and disposal, and every stale publication is rejected by its commit identity.
2. **Given** the handlers, **When** they are read, **Then** each uses one shared guard helper and one shared failure constructor; no hand-written recover block or error wrapper remains.
3. **Given** settings, layout, recents and file metadata, **When** they are persisted, **Then** they use one key-value repository helper, and sqlc is gone.
4. **Given** the production API, **When** it is inspected, **Then** no test-only setter, test-only constructor or package-level swap variable remains; test needs are met by constructor options wired only at the composition root.
5. **Given** the `appmodel` package, **When** its imports are listed, **Then** it imports neither the Wails runtime nor `bootstrap`.
6. **Given** any error on a user-visible path, **When** it occurs, **Then** it is surfaced to the user or logged with a stated reason; none is discarded.
7. **Given** a close request or a bounded backend call, **When** it is handled, **Then** it behaves as FR-016 to FR-021 state: identity, acknowledgement, discovery after a late load, confirmed cancellation, stale-response rejection, a stuck notice with Retry and Cancel, and no command applied twice.

---

### User Story 5 - Six stages behind five scripts; hooks and CI run the same scripts (Priority: P2)

A maintainer or agent runs one script per stage locally; the git hooks and the CI workflow run the same scripts, so a change that passes locally passes in CI, and every tool runs once.

**What is wrong today**:

- _The step list is defined everywhere._ Six executable definitions (`justfile` `check`, `.github/workflows/main.yml`, three `scripts/hooks/pre-push-*.sh`, `baseline.sh`, `verify.sh`, `release-stack.sh`) and five prose copies. `release-stack.sh` runs the full Wails build six times, `tsc` five times, ESLint five times, `go test -race` three times. Pre-push omits `archtest`.
- _`justfile`._ 34 recipes (33 counted at the audited commit plus `go-vet`), 167 lines, 14 one-line aliases; `package` always exits 1; `sqlc-check` and `vuln` are called by nothing; `migration-immutability-check` diffs against `HEAD` and is therefore blind in CI.
- _Format covers less than half._ `just fmt` misses `AGENTS.md`, `README.md`, `docs/**`, `specs/**`, `scripts/*.sh`, the `justfile`, root YAML and JSON, `.agents/**`; pre-commit and pre-push format different file sets.
- _Build dirties the tree._ `just build` leaves `frontend/wailsjs/runtime/*` at mode 644; `gen-check` and a Go test then fail on the mode bit alone; three paragraphs of `AGENTS.md` explain how to live with it.
- _CI cannot see the product._ The workflow re-lists the nine steps by hand, never runs `wails build`, has no OS matrix, runs Playwright against the mock, and the release job is an `echo`. CI uses Node 22 while hosts use 24; CI installs Wails CLI 2.12.0 while `go.mod` selects 2.15.0; `wails.json` uses `npm install` where CI uses `npm ci`.
- _Architecture checks use proxies._ Handlers are found by type-name suffix, constructors by a `New*` regex, locks by `os.O_EXCL` string, CGO-freedom by grepping source; the adapter-only import rule is enforced twice; the TypeScript lint preset is untyped (no unhandled-promise rule); Playwright has no `forbidOnly`; Jest runs with `--passWithNoTests`.
- _Scripts._ `scripts/` has no build, no categorised test, no format and no E2E script; `verify.sh` reports PASS when baseline inputs are missing; `baseline_verify_test.sh` is invoked by nothing and its cleanup trap can delete a pre-existing directory; `frontend/scripts/check-editor-themes.mjs` and `generate-editor-themes.mjs` are outside every gate.
- _The "CGO-free binary" claim is false._ The check is an untagged `CGO_ENABLED=0 go build ./...`; the real desktop artifact links Cocoa/WebKit through CGO. The backend and SQLite are CGO-free; the runnable desktop binary is not.

**Why it matters**: an agent that cannot find one command to run the stages re-derives the list, differently each time. Duplicate step lists drift; a green local run says nothing about CI.

**Why this priority**: the new scripts must exist before tests are relocated (runners own directories) and before the instructions in Story 6 can point at them.

**Independent Test**: list `scripts/`; run each script from a fresh clone; grep the hook and CI definitions for anything other than the five scripts; time the verify script and count tool invocations; run `scripts/verify lint` and confirm only the Lint stage runs.

**Acceptance Scenarios**:

1. **Given** the repository, **When** `scripts/` is listed, **Then** it contains exactly `build`, `test`, `verify`, `format` and `baseline` as entry points, and every `just` recipe is a one-line alias for one of them.
2. **Given** the two git hooks and the CI workflows, **When** they are read, **Then** they call only the five scripts, with the arguments FR-061 names.
3. **Given** `scripts/verify`, **When** it runs, **Then** each tool runs at most once, the frontend is built at most once, and no `go build` runs inside `go test`.
4. **Given** `scripts/verify` or `scripts/test`, **When** a test tier runs, **Then** human-readable runner output remains visible, structured reports are retained under the local run directory, and the final report shows backend and frontend counts separately, with unavailable counts called out rather than reported as zero.
5. **Given** `scripts/format --check`, **When** it runs on a formatted tree, **Then** it passes, covers every tracked text file type, and its ignore list names only tool-owned paths.
6. **Given** `scripts/baseline`, **When** an input is missing, **Then** it fails closed; when it compares, it never reports green while a failure remains.
7. **Given** `scripts/build`, **When** it finishes, **Then** `git status` is clean.
8. **Given** CI, **When** a push arrives, **Then** the Ubuntu runner runs `scripts/verify --skip e2e` as a blocking check with a real Linux desktop build; **and When** the release workflow is dispatched by hand as a dry run, **Then** the macOS runner runs all six stages and uploads a zipped `.app` whose About dialog reports the given version.
9. **Given** the lint stage, **When** it runs, **Then** it enforces the import and colour rules of FR-069, rejects a committed `.only`, and fails when a required suite collects zero tests.
10. **Given** the toolchain, **When** local, hooks and CI run, **Then** they read the same declared Node, Go and Wails versions and install dependencies from the lockfiles.

---

### User Story 6 - One authority and current, intent-level agent guidance (Priority: P2)

A new agent (or a new contributor) opens the repository, reads one instruction file, learns what the product is, where the authority is, who owns each shared behaviour, and how to run the six stages, and finds every command it is told about.

**What is wrong today**:

- _Four answers to "what is normative"._ `README.md` points to `docs/delivery/`; `docs/delivery/README.md` says nothing outside it is normative; `AGENTS.md` points to `specs/<feature>/`; the constitution says `docs/delivery/spec` and `architecture` "until migrated"; `WORKFLOW.md` still routes through `/plan-story`.
- _Dead references._ `just story-check` (seven sites; one test asserts it must not exist), `just spec-check`, `check_story.py`, `check_proves.py`, `sync-agent-files.py --apply`, `.claude/commands`, `jest.config.js`, "the 10 speckit skills" (there are 17), two stale `KNOWN_ISSUES` entries.
- _`AGENTS.md`._ 72 of 269 lines are dated incident stories with pixel counts and Wails line numbers; six of eight "non-negotiables" are marked advisory; the "never `--no-verify`" rule cannot be enforced by the hook it bypasses.
- _Two workflows._ The legacy phase/story loop (`.agents/commands/{build-story,plan-story,plan-phase,finish-phase,reconcile}.md`, their five 11-line skill shims and `.claude/skills` symlinks, `WORKFLOW.md`, `DOD_TEMPLATE.md`) and the Spec Kit loop are both declared live; the legacy loop cannot run because its validators were deleted.
- _Ceremony blocks routine work._ Stop on any unspecified decision; one task, one branch, one commit before touching a file; a five-rule story cap; permission requests on open checklist items; a named test per rule; tests touching every changed file.
- _No ownership guidance._ Nothing tells an agent to find the existing owner of a behaviour and its consumers before adding a copy; `structure.md` prescribes folders and "inline until there is a second caller", which produced the copies.
- _Comments and docs._ 489 task and requirement IDs in production comments; `ShellMenuRow` takes about 40 props with no contract; `internal/appmodel` has no package documentation for lifecycle, lock order or event contract; `structure.md` describes July's tree; `README.md` says `just check` is "everything CI runs" while CI also runs Playwright.
- _The constitution._ Principle I names `docs/delivery` as authority; Principle II requires stable requirement anchors and tests that name the rule they prove; Principle VII requires the baseline-gate ritual. All three conflict with the owner's principles 4, 5 and 8.

**Why it matters**: the audit's root-cause analysis shows the drift came from instructions that outlived their tooling. Left in place, they would regenerate the rejected process during this very refactor.

**Why this priority**: it must land early enough that the old instructions stop steering the work, but its final form depends on the scripts (Story 5) and the component map (Story 3).

**Independent Test**: a fresh agent session is given only the instruction files and asked to run the six stages and to make one small change to a shared component; it finds every command and every consumer without asking.

**Acceptance Scenarios**:

1. **Given** `README.md`, `AGENTS.md`, `CLAUDE.md`, the constitution and the archive pointer, **When** they are read, **Then** all name `specs/<feature>/` plus `docs/architecture.md` as the single authority.
2. **Given** `docs/delivery/`, **When** the feature is done, **Then** it lives under `docs/_archive-2026-09-delivery/` with a README pointer, and the decisions and ADRs still relevant are carried into the architecture map.
3. **Given** every command, file and path named in an instruction file, **When** it is checked, **Then** it exists.
4. **Given** `AGENTS.md` and `CLAUDE.md`, **When** they are read, **Then** they contain the product intent, the authority and command pointers, the ownership map pointer, the branch convention and the design judgment tools cannot supply; no dated incident stories, no line limits, no per-turn forms, no duplicated mechanical rules.
5. **Given** the legacy workflow files, **When** the feature is done, **Then** they are deleted, the Spec Kit skills are the only workflow, and nothing references a deleted file.
6. **Given** production source, tests, `README.md`, `AGENTS.md`, `CLAUDE.md`, `docs/architecture.md` and package docs, **When** scanned, **Then** no task or requirement ID appears in a comment or a doc sentence, and comments state current contracts and non-obvious rules.
7. **Given** the architecture map, **When** it is read, **Then** it names the owner of shared UI, commands, document lifecycle, persistence and verification, and records the durable decisions of this feature.

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

1. **Given** the repository after this feature, **When** tracked files are listed, **Then** no `specs/*/evidence`, `specs/*/surface/*.png`, `docs/audits/*-evidence`, `test-results/`, `frontend/evidence`, `cmd/native-evidence` or `frontend/public/*.test.*` path remains, while `docs/audits/2026-09-07-project-health-audit.md` and `docs/_archive-2026-07-28-specification/` remain.
2. **Given** `.gitignore`, **When** it is read, **Then** it ignores run artefacts, IDE folders and build output once each, with no contradictions and no feature-specific rules.
3. **Given** the token file and the Go packages, **When** they are scanned, **Then** every token is used and defined, and no exported symbol without a production caller remains (the intentionally unused `ContentAccessor` and `DocumentCommands` seams excepted).

---

### Edge Cases

- A Story 1 defect cannot be reproduced on the archived tree (for example it needs a host CI does not have): the regression test is still written, the reason is recorded next to it, and the defect is verified by hand on that host.
- A regression test cannot compile against the archived tree because the refactor changed the interface it calls: the test moves to the level both trees share (a bridge call or the driven screen); a defect observable only inside the Go process gets the throwaway old-tree test of FR-031.
- A behaviour can only be tested white-box: the test stays beside the code as an in-package `_test.go` file, listed in the plan with its reason.
- Two consumers of the shared bar need different overflow policies: the policy is a property of the bar, never a second bar.
- A shared component would change behaviour that features 001–003 approved (for example the toolbar overflow): the change is recorded as a decision in this spec first, never made silently.
- The screen is lost while a write is in flight and another document is dirty: the write finishes, then the native confirmation lists only the documents that still have unsaved changes; Cancel returns to a working application when the screen can be restored, otherwise the confirmation is offered again.
- A relative link or image in an untitled document: there is no folder to resolve inside; the link is refused with the notice and the image shows the placeholder.
- A user-paced command (a native Open, Save As or overwrite dialog) stays open longer than 10 seconds: no stuck notice appears; closing the window while the dialog is open follows the normal close flow after the dialog returns.
- Two backend calls are stuck at once: one notice per request, each with its own Retry and Cancel; each withdraws on its own when its result arrives.
- An E2E case fails on timing alone: it is not re-run; the stage fails, and the case or the product is fixed as a defect.
- A test's only assertion is a document or source string: it is deleted, never ported into a linter.
- The mock bridge would be deleted before the real-backend E2E exists: not allowed; the E2E stage must pass first.

## Requirements _(mandatory)_

Each requirement is one sentence in EARS form. The `Source` note names the audit findings it resolves.

### Functional Requirements

#### A. The editor never loses work or strands the user

- **FR-001**: When a Save As, an autosave or an explicit Save completes for one document, the backend shall apply its result in the order the writes were committed, so that content from an earlier write never replaces content from a later write, and shall report a Save As destination as clean only when the bytes on disk equal the content it reports. _Source: C1, RF-A2._
- **FR-002**: The backend shall build every refusal message while holding the model lock or from a snapshot captured under it, so that a stale Save running concurrently with New Document reports no data race. _Source: C2, RF-A3._
- **FR-003**: When a document is closed, the backend shall release every per-document resource (write coordinator, timers, activation tokens, save reservations, normalisations, conflict records) through one disposal function. _Source: C3, BE-1, RF-A4._
- **FR-004**: If an autosave fails, then the application shall show the same classified error (category and remediation) that a manual Save would show, once per failure episode: the first failing autosave after a success (or the first ever) shows it, repeats of the same category stay silent, a different category shows once, and a successful autosave ends the episode. _Source: C4, BE-5, RF-A5._
- **FR-005**: The backend shall identify a file by typed, per-platform device and inode fields, so that opening a hard link or the just-saved path focuses the existing tab on macOS and Linux. _Source: C5, RF-A6._
- **FR-006**: When the user saves a document explicitly, the editor shall keep the editor model, the undo history, the selection and the keyboard focus; only an explicit reload or recovery shall replace the buffer. _Source: C6, RF-A7._
- **FR-007**: When a document is opened, the backend shall emit the same effective metadata that a full state read returns, so that a clean file shows "Saved". _Source: C7, RF-A8._
- **FR-008**: When a settings group is updated, the backend shall write it in one transaction, so that a rejected update leaves the previous values of the whole group intact across a restart. _Source: C8, RF-A9._
- **FR-009**: When a menu is opened with the pointer or the keyboard, in any theme, the menu shall keep its elevation shadow, and the focus indicator shall appear only on the focused interactive control and compose with elevation. _Source: UI-1, RF-A1._
- **FR-010**: When the user clicks the trigger of an open menubar menu, the menu shall close; and every menu family shall respond identically to Arrow, Home, End, Escape and type-ahead keys. _Source: UI-5, R2, RF-A11._
- **FR-011**: When the tab context menu is opened, it shall open at the pointer (pointer) or at the focused tab (keyboard), stay inside the application frame, and show the keyboard shortcut of every item that has one, taken from the action registry. _Source: R14, R15, UI-4, RF-A10._
- **FR-012**: While the window is at any width at or above the minimum, every menubar menu shall be fully visible inside the application frame. _Source: R16, RF-A10._
- **FR-013**: The status bar shall declare each fact once with its row, detail and drop priority, and the Details view shall list every fact the row dropped for lack of space. _Source: R19, UI-15, RF-A10, RF-B7._
- **FR-014**: When the user activates a link in the preview, the application shall scroll the preview for an in-document anchor, open a local file with an extension the Open dialog accepts (`.md`, `.markdown`, `.mdown`, `.txt`) that resolves, after symlinks, inside the document's folder through the normal open flow, open an `https` or `http` link in the system browser, and refuse every other target (`mailto`, `file`, `javascript`, `data`, any other scheme, any local file outside the document's folder, any relative link in an untitled document) with one auto-dismissing warning notice in the notification surface naming the target and the reason; in every case the application page, the bridge and the editing session shall stay intact and sanitisation shall not weaken. _Source: APP-1, D11, RF-A12._
- **FR-015**: When a startup step (bridge, model, settings, window ready) fails or stays unanswered for 10 seconds before the frontend is ready, the failure screen shall name that step (a timed-out step as "did not answer within 10 seconds") with the step name and the error category (never a file path, a stack trace or raw error text, which go to the local log), offer only Quit for a bridge failure and Retry of the failed step otherwise, always offer Quit, run at most one attempt at a time, make every Retry a fresh attempt (a fresh settings read after a successful model load included), and ignore a late answer from an abandoned attempt. _Source: APP-3, APP-4, RF-A14, RF-A15._
- **FR-016**: While the application is loading or shows the startup-failure screen, the user shall be able to close the window and quit; a close request made while the frontend was loading shall be discovered and handled like a fresh request once the frontend is ready; and a cancelled close request shall stay reported as pending until the backend confirms the cancellation. _Source: APP-2, APP-5, RF-A13._
- **FR-017**: When a native close or quit request arrives and nothing is unsaved, the backend shall exit at once if the frontend never reached ready, and otherwise send the request with an identity to the frontend so the editor's working copy is flushed, exiting when the frontend acknowledges a clean state or after 10 seconds without acknowledgement; a stale response shall be rejected. _Source: APP-2, APP-5, D12._
- **FR-018**: If a native close or quit request is not acknowledged within 10 seconds, or arrives before the frontend ever reached ready, while a document has unsaved changes or a write is pending, then the backend shall finish every started write, show a native (non-webview) confirmation naming the documents with unsaved changes with "Quit and discard" and "Cancel", and exit only after the user confirms; a timeout alone shall never authorise discarding data, and no session-restore feature shall be introduced. _Source: APP-5, D12, RF-A13, RF-C7._
- **FR-019**: Every bridge command shall carry a request identity, and the adapter shall declare the commands that open a native dialog (Open, Save As, Save of an untitled document, close-plan resolution) as user-paced with no bound, and every other command as bounded at 10 seconds once the frontend is ready. _Source: APP-5, RF-C7._
- **FR-020**: If a bounded command stays unanswered for 10 seconds, then the frontend shall show one non-blocking notice per request in the notification surface, offering Retry and Cancel while editing continues, shall apply a result that arrives later and withdraw the notice, and on Cancel shall dismiss the notice without aborting the command, applying its late result silently. _Source: APP-5, RF-C7._
- **FR-021**: When the user presses Retry on a stuck notice, the frontend shall re-send the command with the same identity and the backend shall answer with the original outcome if that request already completed or is still running, so that no command is applied twice; the backend shall keep each completed outcome for 60 seconds and at most 256 outcomes (oldest evicted first), and a Retry after eviction shall be a fresh command. _Source: APP-5, RF-C7._

#### B. Verification exercises the real application

- **FR-022**: The repository shall hold Go tests under `tests/go/unit` and `tests/go/integration` and frontend tests under `frontend/tests/unit`, `frontend/tests/integration` and `frontend/tests/e2e`, placed by dependencies: a unit test exercises one module with no disk, database, rendered UI or bridge; an integration test uses real temporary files, a real temporary SQLite database, or rendered React with the store under a DOM test runner (never a browser) driven by state patches and asserting the commands dispatched with nothing answering a command; an E2E test drives the real application and is the only tier that renders it in a browser; no test file shall exist under `frontend/src`, `frontend/public` or inside the binary. _Source: T-3, §5.4.3, D3, RF-D1._
- **FR-023**: Go tests shall use only public interfaces, except that a behaviour unreachable through them may keep an in-package `_test.go` test beside the code (compiled only under `go test`, no export shim), each such exception listed with its reason in the plan. _Source: D3, RF-D1._
- **FR-024**: The unit stage shall pass from a fresh clone once the declared dependency install has run, without `frontend/dist` and without a native toolchain, and shall make no network call itself. _Source: RF-D2._
- **FR-025**: The E2E stage shall run its suite against the real application started through `wails dev` (real backend, real bridge, no mock), driven in Chromium at the local address `wails dev` serves, with the operating-system config root (`HOME` on macOS, `XDG_CONFIG_HOME` on Linux) redirected to a temporary directory for the launched process, opening temporary files through a Recents list seeded in that profile's database before launch, and asserting the bytes on disk and the state after a restart; the binary shall contain no test hook, profile flag, debugging port or test build flavour, and no tier shall automate a native dialog. _Source: T-1, TL-8, RF-D3._
- **FR-026**: The real-backend suite shall cover preview-link activation with bridge continuity, a close request before the frontend is ready, failed startup followed by Retry and close, an isolated settings rejection, a lost cancellation, a late bridge completion, a local image inside the document's folder rendering while a web image and an image outside the folder show the placeholder, and the computed-style and theme checks of FR-009 and FR-044, provoking each fault only through the environment the harness controls (profile database contents and permissions, document file permissions, a path whose read blocks until released) with the plan naming the lever per case and splitting a lever-less case into a state-patch-driven frontend test (or a unit test of the owning module) plus a Go integration test; every case shall run exactly once per stage run with no automatic retry, as a blocking check in the release workflow on each target platform's runner. _Source: §5.10.6, RF-D8._
- **FR-027**: The packaged binary shall be verified by a walkthrough on the developer's host before each release, covering the outcomes observable from outside the process (launch, native Open, Save As, close and quit dialogs, files on disk, links opened in the system browser), its step list living in the architecture map and each performed walkthrough recorded as one sentence (date, commit, host, outcome) in the GitHub Release notes for that tag; a feature that makes no release, this one included, closes with the same walkthrough against the binary built locally by `scripts/build`, recorded as one sentence (date, commit, host, outcome) in the plan; CI shall run no OS-level automation of the native window. _Source: §5.10.6, RF-D8._
- **FR-028**: The packaged application shall start cold, open, edit, preview and save a document with networking disabled and attempt no outbound connection, verified on the developer's macOS host before the feature closes and recorded in the plan; CI shall make no network assertion. _Source: V1, DOC-6, RF-D3._
- **FR-029**: The repository shall contain no test that asserts source text, CSS declarations, DTO field order, struct field counts or the content of a specification or documentation file; architecture constraints shall live in the lint stage. _Source: T-3, TL-6, RF-D4._
- **FR-030**: Every test title shall be a sentence describing the behaviour, and no test file shall contain a task or requirement ID or a `// Proves:` anchor anywhere. _Source: §5.4.2, DOC-2, RC-6, RF-D5._
- **FR-031**: Every defect listed in Story 1 shall have one regression test at a level both trees share (a bridge call or the driven screen) that fails when run once against the archived tree, the failure recorded in the plan, and passes on the refactored tree; a defect observable only inside the Go process (a data race, a retained resource) shall instead get a throwaway Go test against the archived tree's own API, run once in an archive worktree (with the race detector where relevant), its failure recorded in the plan and the test not ported, the refactored tree holding the equivalent test at its public interface; faster unit or integration tests for the same fix need not run on the archived tree. _Source: RF-D7._
- **FR-032**: When the real-backend E2E stage passes, the pixel-parity harness, the `?parity-case` production branches and their allowlist, the parity selectors in production CSS, `cmd/native-evidence`, `frontend/evidence` and the mock bridge shall be deleted, and the `just dev-ui` route retired. _Source: T-2, UI-12, TL-8, TL-9, D4, D6, RF-D6._
- **FR-033**: The test suites shall be consolidated according to the audit's keep, rewrite and delete lists (§5.4.4): the editor-view suites merged into one, the Settings menu suite folded into the menubar suite, the tab suite slimmed, the App suite rewritten without mocking the shell it tests, the eight behavioural browser journeys ported to the real backend and the bureaucracy suites deleted; before a suite is deleted or rewritten, the plan shall name what now covers each behaviour it proved (a surviving test, a ported E2E case or a walkthrough step), and a behaviour with no cover shall be filed as a task. _Source: T-4, T-5, §5.4.4._

#### C. One implementation per common UI behaviour

- **FR-034**: The frontend shall have exactly one Popup component that owns the surface and the whole lifecycle (open, close, Escape, outside pointer, focus restore, arrow navigation, clamp and flip inside the application frame, portal policy) and takes content, anchor (trigger, point or element bounds) and size variant as inputs; the File, Settings, View, About, narrow overflow, tab context, editor context, toolbar overflow and Document details menus shall all use it. _Source: UI-2, UI-3, UI-6, UI-8, R1, R3, RF-B1._
- **FR-035**: The frontend shall have exactly one MenuItem row (label, icon slot, accelerator slot, disabled, checked and radio variants) rendered by every menu, its accelerator derived once from the action registry. _Source: UI-3, R15, RF-B2._
- **FR-036**: The frontend shall have exactly one horizontal Bar frame with leading, main and trailing slots used by the menubar, the tab bar and the formatting toolbar, the overflow policy being a property of each bar. _Source: UI-10, R7, RF-B3._
- **FR-037**: When the window is narrower than 768 px, the formatting toolbar shall move the controls that do not fit into a `»` overflow menu rendered by the shared Popup, as feature 003 accepted, while the tab bar keeps scrolling horizontally (owner decision 2026-09-08 on audit D1, recorded in the architecture map). _Source: D1, H-5._
- **FR-038**: The frontend shall have exactly one Island group and one ToolButton (icon and text variants, selection-preserving mousedown, disabled, pressed and checked states, square when icon-only) used by the formatting toolbar (the tab bar's and the menubar's controls belong to TabBar and Bar), and one Button used by dialogs, toasts and the launcher. _Source: UI-9, D2, RF-B4._
- **FR-039**: The frontend shall have exactly one Tab and one TabBar (horizontal scrolling, drag reorder, add and close controls), with theme differences expressed as tokens rather than selectors in the tab stylesheet. _Source: UI-11, RF-B5._
- **FR-040**: The frontend shall have exactly one Pane frame (header slots, body, accessory or banner slot) that hosts the editor and the preview as content, with paused or failed preview banners placed from explicit state rather than by CSS reaching into renderer internals. _Source: UI-13, R17, RF-B6._
- **FR-041**: The sidebar's side, width, resize and collapse behaviour shall have one owner outside `AppShell` that never inspects notification text, while the layout state stays owned by the backend. _Source: UI-14, R13, RF-B8._
- **FR-042**: Every dialog and prompt (Settings, About, Shortcuts, Normalisation, Close, External change, Recovery) shall use the one ModalShell. _Source: UI-16, R4, RF-B9._
- **FR-043**: Segmented shall be the only radio-group implementation and Icon the only glyph source, and the icon size and stroke tokens shall control every icon. _Source: R5, R6, RF-B10._
- **FR-044**: Theme differences shall live in `tokens.css` (values) and, where structure must differ, in the shared component's stylesheet; no widget stylesheet shall contain a `[data-theme]`, `[data-mode]` or parity selector; every dead token shall be removed and every used token defined. _Source: UI-11, UI-12, UI-17, RF-B11._
- **FR-045**: The action registry shall be the one owner of availability, shortcut admission and aliases for the File menu, the toolbar, the tab context menu and keyboard shortcuts alike; formatting commands shall be built by one runner; settings writes shall go through one settings command owner; and every outcome shall be typed and reported once. _Source: R8–R12, RF-B12._
- **FR-046**: The `App`, `DocumentTabs`, `ShellMenuRow` and `EditorChrome` widgets shall be decomposed so that composition, command orchestration, drag, popup and shortcut handling each have an identifiable owner, without a file-size or file-count quota as acceptance, and the menubar shall not be rendered through the appearance controller. _Source: §5.2.6, UI-7, R18, RF-B13._
- **FR-047**: Files under `ui/primitives` and `ui/components` shall import neither the store, the adapters nor the action registry. _Source: §3.1, AG-6, RF-B14._
- **FR-048**: The application shall keep the not-yet-implemented controls (Assistant, Export, Open Folder) visible but disabled with their availability read from the action registry, and shall keep the Document details disclosure and the Toggle Assistant items as accepted amendments (owner decision 2026-09-08 on audit D8 and D10, recorded in the architecture map). _Source: D8, D10._
- **FR-049**: The application shall make no network request on its own; the preview shall render an image whose path resolves, after symlinks, inside the document's folder and whose file is at most 20 MB, and shall show the existing placeholder with the alt text, with no notice, for every other image (a web image, a file outside the folder, a larger file, any image of an untitled document); images and stylesheets referenced from the web shall load only once the rendering feature builds the original specification's remote-content policy (Ask by default with the in-preview banner, Always allow, Always block, in Settings → Content and privacy), which is not built here; and the offline principle shall be worded as "the application runs without internet; document content and the future assistant may use it under the user's control" wherever it is stated (owner decisions 2026-09-08 on audit D7 and in the final review). _Source: D7, DOC-6._
- **FR-050**: The application shall keep the native operating-system window frame introduced during feature 001, and the architecture map shall record the earlier custom-title-bar decision (ADR-0028) as superseded (owner decision 2026-09-08 on audit D9). _Source: D9, H-5._

#### D. One owner for the document lifecycle and shutdown in the backend

- **FR-051**: The backend shall have one per-document lifecycle owner that records path identity, buffer revision, write ordering, disk commit, publication and close disposal, rejects a stale publication by its commit identity, and keeps disk I/O outside the model lock. _Source: BE-1, BE-6, RF-C1._
- **FR-052**: The backend shall use one handler guard helper, one classified-failure constructor and result envelopes that share embedded failure structures, so that no hand-written recover block or error wrapper remains. _Source: BE-3, RF-C2._
- **FR-053**: The backend shall use one key-value repository helper (get, upsert, transaction, versioned JSON) for settings, layout, recents and file metadata, owning its two parameterised statements and the transaction; sqlc shall be removed (`sqlc.yaml`, its generated package and the `sqlc-check` recipe); and no compatibility with a profile database written by the archived tree is required: the refactored build starts from defaults, leaves rows it does not own in place and never rewrites them, and no migration or old-tree database test is written. _Source: BE-3, RF-C3._
- **FR-054**: The backend's production API shall contain no test-only setter, test-only constructor, race injector or package-level swap variable; test needs shall be met by constructor options or ports wired only at the composition root (the native dialog port among them, so bridge-level Save As tests run without a screen). _Source: BE-2, RF-C4._
- **FR-055**: The `appmodel` package shall import neither the Wails runtime nor `bootstrap`, and the event emitter adapter shall live in the `application` package. _Source: BE-4, RF-C5._
- **FR-056**: If an operation on a user-visible path (autosave, layout persistence, publication rollback, settings reset read-back, reopen view restore) returns an error, then the backend shall surface it to the user or log it with a stated reason, never discarding it. _Source: BE-5, RF-C6._
- **FR-057**: The application shall have one shutdown-protocol owner spanning backend and frontend that implements FR-016 to FR-018 (request identity, acknowledgement, pending-state discovery, confirmed cancellation, authorisation, stale-response rejection). _Source: APP-2, APP-5, RF-C7._
- **FR-058**: The backend shall document, in one package document, the document lifecycle, the lock order and the event contract. _Source: DOC-3._
- **FR-059**: The backend shall contain no exported symbol without a production caller (the intentionally unused `ContentAccessor` and `DocumentCommands` seams excepted), and the unused `internal/gate` package shall be removed. _Source: BE-8, R20._

#### E. Six stages behind five scripts; hooks and CI run the same scripts

- **FR-060**: The repository shall provide exactly five entry-point scripts, `scripts/build`, `scripts/test <unit|integration|e2e|all>`, `scripts/verify [<stage>] [--skip e2e]` (all six stages in order by default; one stage alone when named; `--skip e2e` for hosts with the toolchain but no usable screen), `scripts/format [--check]` and `scripts/baseline`; every `just` recipe shall be a one-line alias of one of them; the developer commands that are not stages (`wails dev`, the dependency install, binding generation) shall be the sub-commands `scripts/build dev` and `scripts/build setup`, binding generation running inside `scripts/build`; and no script that nothing invokes shall remain (`scripts/baseline_verify_test.sh` and the `frontend/scripts` theme scripts are wired into a stage or removed). _Source: TL-1, TL-2, TL-7, V3, RF-E1._
- **FR-061**: Exactly two git hooks shall exist and, with the CI workflows, call only the five scripts: pre-commit runs `scripts/format --check`, pre-push runs plain `scripts/verify`, the push workflow runs `scripts/verify --skip e2e`, and the release workflow runs plain `scripts/verify`. _Source: TL-1, TL-5, RF-E1._
- **FR-062**: When `scripts/verify` runs, each tool shall run at most once, the frontend shall be built at most once, and no `go build` shall run inside `go test`; human-readable command output shall remain visible while tools run, while structured golangci-lint, ESLint, Stylelint and Go test reports shall be captured under `.local_tmp_files/runs/<run-id>/` and summarized without dumping machine-readable JSON. The final output shall show each stage's status, `NOT RUN` stages after an earlier failure, and `SKIPPED` E2E when requested. Unit and Integration shall show separate backend and frontend totals, passed, failed and skipped counts; E2E shall show the frontend/browser count. Missing or malformed required reports and counts shall be reported as unavailable or unreliable, never as zero; warning counts shall not become failures. No fixed duration budget applies, and the plan shall record the measured duration of a full run at feature close. _Source: TL-1, TL-6, RF-E2._
- **FR-063**: `scripts/format` shall cover every tracked text file type with a documented ignore list holding only tool-owned paths (`.specify/**`, the `speckit-*` skill folders under `.claude/skills` and `.agents/skills`, generated bindings, build output, lockfiles, the `justfile` whose only formatter is `just`, and disposable `specs/*/evidence/**` artifacts), so that ordinary `specs/**`, the instruction files and the scripts are formatted. Evidence directories shall not be recreated by verification. _Source: TL-3, RF-E3._
- **FR-064**: `scripts/baseline` shall record the commit, the dirty-diff identity, tool versions, per-stage exit codes, backend/frontend test counts and machine-readable failure identities in one gitignored local file (`.local_tmp_files/baseline/<feature>.json`), shall fail closed when an input is missing, shall never report a comparison green while a failure remains, and shall be run by instruction once per feature before the first implementation edit and compared before the feature closes (the comparison recorded as one sentence in the plan), never by a hook or CI. `scripts/verify` and `scripts/test` shall never create or compare that baseline record; they may only write temporary run reports under `.local_tmp_files/runs/<run-id>/`. In this feature the five scripts are built first and the baseline is taken immediately after, before any other implementation edit, and the closing comparison shall show every recorded finding gone and nothing new. _Source: B1, TL-7, RF-E4._
- **FR-065**: When `scripts/build` finishes, the working tree shall be clean (the generated bindings' mode problem fixed once), and the dead recipes `package`, `sqlc-check`, `vuln`, `release-stack` and the hook wrappers shall be removed or implemented. _Source: TL-2, TL-4, RF-E5._
- **FR-066**: On every push, CI shall run `scripts/verify --skip e2e` on an Ubuntu runner as a blocking check, the runner installing the Linux Wails toolchain (GTK and WebKitGTK development packages included) so its Build stage links the real Linux desktop artifact. _Source: TL-5, RF-E6._
- **FR-067**: The release workflow shall run plain `scripts/verify` on the runner of each platform it builds for (macOS in this feature) and build that platform's artifact only on success; a `v*` tag on `master` (the only release branch; a tag on any other branch builds and publishes nothing) shall create a GitHub Release for the tag with the artifact attached, using the repository's built-in token and no other secret; manual dispatch on any branch shall run the same stages and upload a workflow artifact as a dry run; the macOS artifact shall be an unsigned zipped `.app` built for the runner's own processor architecture with the architecture in its name (no universal build, no disk image), signing and notarisation recorded in the architecture map as an open decision. _Source: TL-5, RF-E6._
- **FR-068**: The release workflow shall derive the version from the tag (`vX.Y.Z` → `X.Y.Z`; the dispatch input on a dry run) and pass it to `scripts/build`, which shall stamp it into the binary's version identity and the bundle metadata so the About dialog reports it; a build given no version shall report `dev`. _Source: TL-5, RF-E6._
- **FR-069**: The lint stage shall enforce, from parsed imports and CSS, the adapter-only bridge import rule, the rule of FR-047 and the token-only colour rule; shall reject a second implementation of a shared component (a menu, dialog or tab role, a portal, an elevation shadow, a document-level Escape or outside-click listener, or a raw button element outside the shared component's folder); shall own the ID-label check of FR-080; shall use typed TypeScript linting with explicit tsconfig ownership for source, tests, Node tools, generated files and reports; shall reject a committed `.only`; and shall fail when a required suite collects zero tests. _Source: TL-6, AG-6, AG-7, RF-E7._
- **FR-070**: The repository shall declare the Node, Go and Wails CLI versions and the dependency installation command in one place shared by local runs, hooks and CI, and lockfiles shall be preserved. _Source: AG-8, RF-E8._
- **FR-071**: The Build stage shall link the real tagged Wails desktop artifact on every host that runs it and fail with a message naming the missing tool when the host toolchain is missing, and the CGO-free check shall be named and scoped to the backend and SQLite rather than claimed for the desktop binary. _Source: AG-9, RF-E8._

#### F. One authority and current, intent-level agent guidance

- **FR-072**: The repository shall have one normative tree, `specs/<feature>/` plus the architecture map at `docs/architecture.md`, and `README.md`, `AGENTS.md`, `CLAUDE.md`, the constitution and the archive pointer shall all name both. _Source: PR-1, DOC-4, DOC-5, D5, RF-F1._
- **FR-073**: `docs/delivery/` shall be moved to `docs/_archive-2026-09-delivery/` with a README pointer, and the decisions and ADRs still relevant shall be carried into the architecture map. _Source: D5, H-8, RF-F1._
- **FR-074**: The architecture map shall name the owner of shared UI (with each shared component's consumer inventory), commands, document lifecycle, persistence and verification (the walkthrough step list included), and shall record the durable decisions of this feature and its open decisions; routine reversible choices shall need no decision record. _Source: AG-3, RF-F4._
- **FR-075**: `AGENTS.md` and `CLAUDE.md` shall contain the product intent, the authority and command pointers, the ownership map pointer, the branch convention and the design judgment tools cannot supply, and shall contain no dated incident stories, no arbitrary line limits, no required per-turn forms and no duplicated mechanical rules. _Source: PR-3, AG-1, AG-10, RF-F2._
- **FR-076**: Every command, file and path named in an instruction file shall exist. _Source: PR-2, RF-F3._
- **FR-077**: The legacy phase/story workflow (`.agents/commands/*`, the five legacy skills, their `.claude/skills` symlinks, `docs/delivery/WORKFLOW.md`, `DOD_TEMPLATE.md`) shall be deleted with every reference to it, the Spec Kit skills shall be the only workflow, and the Spec Kit core files and extensions shall not be modified by this feature. _Source: PR-5, AG-5, RF-F3._
- **FR-078**: The instructions shall tell an agent to find the existing owner of a behaviour and its consumers before adding an implementation, to run `scripts/baseline` as FR-064 states, to proceed through diagnosis, implementation and verification without task-path, rule-count, branch-per-file or per-rule-test quotas, and to surface genuine product ambiguity, destructive scope or durable trade-offs. _Source: AG-1, AG-2, AG-3, RF-F6, RF-F7._
- **FR-079**: Every mechanical convention (formatting, syntax, import boundaries, colour tokens) shall have one executable owner in the format, lint or build stage, its duplicated prose instruction removed once the check works; paperwork constraints with no product value shall be deleted rather than moved into a linter. _Source: TL-6, AG-6, RF-F5._
- **FR-080**: Production source (Go and TypeScript), every test file, `README.md`, `AGENTS.md`, `CLAUDE.md`, `docs/architecture.md` and Go package documentation shall contain no task or requirement ID (`T###`, `FR-`, `SC-`, `STORY-`, `Proves:`), with `specs/**`, `.specify/**`, `docs/audits/**` and `docs/_archive-*/**` outside that scope; comments and the documentation of a widget's inputs shall state current contracts and non-obvious rules rather than history. _Source: DOC-1, DOC-3, BE-7, RF-F5._
- **FR-081**: The instructions shall state the branch convention of the Background section. _Source: H-7, owner input._

#### G. The repository contains only what the product and its verification need

- **FR-082**: The repository shall no longer track `specs/*/evidence`, `specs/*/surface/*.png`, `docs/audits/*-evidence`, `test-results/`, tracked screenshots and probe logs (the product icons under `build/` and `frontend/src/ui/icons/file-tab-icons.svg` stay), `frontend/evidence`, `cmd/native-evidence` and `frontend/public/*.test.*`, while `docs/audits/2026-09-07-project-health-audit.md` and `docs/_archive-2026-07-28-specification/` shall remain. _Source: §5.8, TL-10, owner decision._
- **FR-083**: `.gitignore` shall ignore run artefacts, IDE folders and build output once each, with no contradictions and no feature-specific rules. _Source: §5.8, TL-10._
- **FR-084**: The known-issues list shall be reconciled: every entry is fixed by this feature, moved to the architecture map as an open decision, or removed as stale. _Source: H-9, PR-2._

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Every defect listed in Story 1 (nineteen scenarios) has a regression test whose one-time failure on the archived tree is recorded in the plan and which passes on the refactored tree; zero exceptions without a recorded host reason.
- **SC-002**: The E2E stage starts the real Go application process; zero E2E tests run against an imitation of the backend; every case runs once per stage run with zero automatic retries.
- **SC-003**: The packaged application starts, opens, edits, previews and saves a document with networking disabled and attempts zero outbound connections (verified on the developer's macOS host, recorded in the plan).
- **SC-004**: Zero test files under `frontend/src`, `frontend/public`, the embedded assets or Go production packages beyond the listed white-box exceptions; zero test files containing a task or requirement ID; zero tests reading a specification or documentation file or asserting CSS text, DTO field order, struct field counts or source text.
- **SC-005**: Zero production comments and zero sentences in `README.md`, `AGENTS.md`, `CLAUDE.md`, `docs/architecture.md` or Go package docs contain a task or requirement ID; every command, file and path referenced by an instruction file exists (link check, zero failures).
- **SC-006**: Exactly five entry-point scripts exist; the two hooks and both CI workflows reference no other command; each tool runs at most once per verify; a build leaves `git status` clean.
- **SC-007**: Every menu family in all six theme/mode combinations shows the elevation shadow when opened by pointer and by keyboard (computed-style E2E case on `wails dev`, zero failures).
- **SC-008**: Zero `[data-theme]`, `[data-mode]` or parity selectors in widget stylesheets; zero dead or undefined tokens.
- **SC-009**: One change to a shared component's behaviour reaches every consumer in its inventory (popup, bar, tab, button, pane, sidebar, modal, status item), the lint stage failing on any second implementation outside the component's folder.
- **SC-010**: Opening, saving and closing forty documents leaves zero retained per-document resources in the backend.
- **SC-011**: A fresh agent session, given only the instruction files, runs all six stages and locates the owner and consumers of one shared behaviour without a missing command or an unanswered question.
- **SC-012**: The tracked repository shrinks by the size of the removed evidence trees (about 56 MB) and contains zero run artefacts.
- **SC-013**: The application's capability inventory (window, themes, settings, editor, preview, files, tabs, autosave, conflicts, close, recents) is unchanged and no new capability is present except the local image rendering of FR-049; every deleted or rewritten suite has its coverage named in the plan before deletion.
- **SC-014**: A backend call held for longer than 10 seconds in a test produces the stuck notice within 1 second of the bound, and a result released afterwards is applied with the notice withdrawn (zero lost results, zero duplicate reports); Retry on a stuck Save applies the write exactly once; a Retry more than 60 seconds after completion runs as a fresh command; a user-paced command held open longer than 10 seconds produces no notice; Cancel followed by the result applies it once with no notice; a startup step held longer than 10 seconds before ready produces the startup-failure screen, not the notice.
- **SC-015**: A dry run of the release workflow given version `X.Y.Z` produces an application whose About dialog reports `X.Y.Z`; a local `scripts/build` with no version reports `dev`; a version tag pushed on a branch other than `master` produces no artifact and no release.

## Assumptions

- **Approved behaviour is the baseline.** Features 001–003 as accepted define what the application does. This feature restores, fixes, consolidates and removes; it adds nothing except the local image rendering of FR-049, accepted in the final review. Where a shared component would change accepted behaviour, the change is recorded as a decision first.
- **Owner decisions on the audit's open items (2026-09-08)**: D1 toolbar overflow (FR-037); D2 square icon buttons (FR-038); D3 black-box Go tests under `tests/go` (FR-022, FR-023); D4 and D6 parity harness and mock bridge deleted once the real-backend E2E runs (FR-032); D5 `specs/` plus the architecture map as the only authority, `docs/delivery` archived (FR-072, FR-073); D7 remote content and the offline wording (FR-049); D8 and D10 disabled controls and accepted amendments kept (FR-048); D9 native window frame (FR-050); D11 link policy (FR-014); D12 lost-screen handling with no session restore (FR-018).
- **Already done before planning (2026-09-08)**: the constitution was amended to version 2.0.0 through `/speckit-constitution`; the remote holds only `master` and `app_version_1_codebase` plus the tag `archive/v1-linear-history-2026-09`.
- **Network scope.** Only the application must run without internet (FR-028, FR-049); dependency installation, tests, CI, document-referenced content and the future assistant may use the network.
- **Spec Kit is out of scope.** The `speckit-*` skills, `.specify/`, its templates and its extensions (memory-loader, ralph, superpowers-bridge) are owned by the Spec Kit CLI and are not modified. `.specify/feature.json` stays untracked by Spec Kit design.
- **Order of work.** The five scripts are the first task and `scripts/baseline` runs right after them (FR-064); the scripts and the instruction rewrite land early enough that the old instructions cannot regenerate the rejected process during the refactor; the real-backend E2E exists before the mock and the parity stack are deleted; test relocation and the scripts move together because runners own directories.
- **The audit stays.** `docs/audits/2026-09-07-project-health-audit.md` remains as read-only input; its evidence folder leaves the tree and stays reachable under the archive tag.
- **The mockup is a design reference**, not a binding contract; visual acceptance is by behaviour and computed style, not pixels.
- **Hosts.** Development and verification happen on macOS; Linux behaviour is verified where a runner exists; Windows is not verified by this feature. The release workflow gains a platform's runner when that platform is verified. The walkthrough that closes this feature is recorded as one sentence in the plan.
- **No release in this feature.** Work happens on `feature/004-codebase-refactoring` under the Background branch layout; the owner squash-merges it into `app_version_1_codebase` when done; no version tag is pushed, and the release workflow's evidence is a manual dry run.
