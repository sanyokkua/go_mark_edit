# Quickstart: Verify Real Files and Tabs

This is the implementation verification guide for Feature 003. It is not evidence that the unimplemented
feature passes today. Run it from the repository root after the dependency-ordered tasks in `tasks.md` have
been implemented. Preserve raw output and exit status for every release gate; a command that parsed nothing
is `UNRELIABLE`, not green.

## 1. Prepare deterministic inputs

- Work on the Feature 003 parent/task branch named by the task ledger; do not implement on `master`. feature/v1-implementation is the parent feature (development branch). It is the main branch for the whole app development. Sub-branches should be created per each task and merged back when finished.
- Read `spec.md`, `plan.md`, `research.md`, `data-model.md`, every file under `contracts/`, and the task being
  executed before changing code.
- Use temporary real files outside the repository for destructive file-lifecycle tests. Include LF, CRLF,
  mixed-ending, `none` (no LF or CRLF), lone-CR, NEL/U+2028/U+2029, UTF-8 BOM, invalid UTF-8/NUL,
  non-default permission, identical-basename, identical-parent, hostile control/bidirectional-name,
  symlink/alias fixtures, plus exact-byte size fixtures at 2,097,152, 2,097,153, 10,485,760, 10,485,761,
  52,428,800, and 52,428,801 bytes. Never write a size fixture against decimal MB.
- Reserve separate loopback ports for the application and immutable binding mockup. Pin browser, pixel ratio,
  zoom, local fonts, focus, scroll, reduced-motion, locale, appearance, and logical content-box size.
- Keep the supplied binding HTML/CSS and `docs/delivery/` reference material read-only.

## 2. Capture the pre-edit baseline

Before the first implementation edit for a task, run:

```sh
just baseline 003-real-files-and-tabs
```

Inspect every recorded command and exit code. Stop if a gate is `UNRELIABLE`; do not reinterpret a crashed or
empty-result gate as a pass. Later verification must distinguish existing findings from regressions introduced
by Feature 003. `just archtest` must be green outright.

## 3. Prove each vertical slice at its boundary

Run the focused tests named by the current task first. The expected suites are:

```sh
go test -race ./internal/appmodel ./internal/file ./internal/application ./internal/settings
npm --prefix frontend test -- --runInBand
just archtest
```

Add platform-targeted tests for the Unix and Windows atomic-replacement implementations. Exercise injected
pre-commit and post-commit failures, timers, stale revisions, dialog cancellation, event loss, and close-plan
reentry; do not prove those edges with only a happy-path component test.

If a task changes generated Wails bindings or SQL queries, verify genuine generator drift with the applicable
command instead of hand-editing generated output:

```sh
just gen-check
just sqlc-check
```

## 4. Run actual-control and exact-parity browser evidence

Run Playwright from `frontend/` so it uses the configured base URL. Browser journeys must operate accessible
roles and names through the deterministic bridge while the parity harness serves the application and immutable
mockup concurrently:

```sh
cd frontend
npm run verify:ui -- e2e/real-files-and-tabs.test.ts
npm run verify:ui -- e2e/real-files-parity.test.ts
```

The parity manifest must account for all 17 primary visual families at 1280, 768, and 375 logical pixels in
all six palettes. **Revised 2026-08-14**: the 306-pair whole-screen expansion is withdrawn; the contract is 14
pixel-compared component keys and 36 behaviour-verified keys. Each mapped in-scope region requires zero unexplained
pixels plus exact computed-style and bounding-box assertions. Retain reference, application, diff, dimensions,
font/zoom/pixel-ratio metadata, and source hashes. The ordinary OS frame and native dialogs are excluded from
pixel comparison, not from real-application verification.

`just dev-ui` and its mock bridge can prove deterministic browser behavior and contract parity only. They do
not prove native dialogs, filesystem effects, Wails event delivery, close veto/quit behavior, or a packaged Go
binary.

## 5. Run the unrestricted gates

After focused and browser evidence passes, run the full configured suites without `.only()`, `.skip()`, retries,
threshold changes, locator weakening, or screenshot-tolerance changes:

```sh
just e2e-test
just verify 003-real-files-and-tabs
just check
just build
```

`just package` remains outside this feature unless a later authoritative specification enables packaging. Do
not call its intentional non-zero result a Feature 003 failure.

## 6. Walk the fresh real application

Launch the fresh `just build` result and use real controls against real temporary files. Record the host, commit,
build command, start/end times, and raw outcome. At minimum verify:

1. New, Open, duplicate Open, LF/CRLF/BOM/permissions, unsafe and size bounds, Save, Save As, overwrite
   confirmation, cancellation, pre-commit failure, and committed-write projection recovery. Separately time
   SC-FT-002's two fixtures: create a new untitled document, type one line, and Save As into a fresh empty
   directory; then open one pre-existing 1 KiB fixture file, edit one character, and Save. Start the clock when
   the launcher/application becomes ready for input and stop it at the explicit-save confirmation. Take a
   non-recursive directory listing of the target's immediate parent directory immediately before and after; the
   only permitted diff is the target file, and the atomic-replace temporary file must already be gone.
2. Two identical basenames, click/keyboard switching, activation-bound Monaco identity, caret/selection/scroll/
   arrangement restoration, reorder cancellation/staleness, 40-open refusal, newest-first reopen history, and
   Copy path/Reveal in file manager (success, known-missing unavailable, disappearance-race detachment with
   Save-to-recreate, clipboard/OS failure with Retry, and focus restoration to the originating tab).
3. Autosave on/off, explicit-save overlap, external edit/delete, invalidated Keep mine authorization, Reload,
   Skip, conflict refresh, and recreation of a deleted backing file.
4. Clean and dirty single/multi-close, Save all/Discard all/Cancel, failure without partial close, repeated native
   close requests, final-tab launcher, six persisted recent files, stale recent removal, and clean restart with no
   restored tab set.
5. File menu, tabs, menus, prompts, status feedback, settings, launcher, pointer/keyboard/focus behavior, long and
   localized labels, reduced motion, 1280/768/375 layouts, and all six palettes without page-level horizontal
   scrolling.
6. A continuous five-minute observation with network requests denied and logged. The result must show zero
   outbound HTTP, HTTPS, WebSocket, telemetry, or update traffic during launch, editing, saving, tab work,
   appearance changes, and shutdown.

Current-host evidence proves only that host. Retain build-tagged/unit evidence for other platforms and do not
claim an unrun native platform.

## 7. Retain auditable evidence

Store the feature's later evidence under `specs/003-real-files-and-tabs/evidence/` without replacing historical
failures. Include:

- baseline and full raw gate logs with exit status;
- focused Go/Jest/architecture reports;
- the component parity manifest (14 pixel-compared + 36 behaviour-verified keys), source hashes, image triplets,
  and metric assertions;
- actual-control browser traces and screenshots;
- real-file byte/permission comparisons and native dialog/close notes;
- the five-minute request-denial log; and
- fresh build and current-host walkthrough metadata.

The feature is ready for convergence only when every task is checked with its named evidence, every one of the
57 functional requirements and 13 success criteria has primary proof, the reliable gate set is green against
baseline, deferred behavior remains unavailable, and implementation review finds no spec mismatch.
