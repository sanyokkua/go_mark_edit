# Phase 1 Quickstart: Validate the Native Window Shell Plan

This guide validates the design now and defines runnable evidence for later implementation. Planning
checks do not claim the native shell is built. Do not generate implementation tasks from this guide
until the plan is approved.

## Prerequisites

- Go 1.25.7, Node 22, Wails v2.12.0, `just`, and dependencies installed by `just setup`
- delivered appearance outcome at or after commit `53af8e4`
- [plan.md](plan.md), [data-model.md](data-model.md), and
  [contracts/window-launcher-shell.md](contracts/window-launcher-shell.md)
- unrelated working-tree changes preserved; planning artifacts remain unstaged and uncommitted

## 1. Validate the planning boundary

Run:

```bash
rg 'NEEDS[ ]CLARIFICATION|T[B]D|T[O]DO' \
  specs/001-gomarkedit-product/plan.md \
  specs/001-gomarkedit-product/research.md \
  specs/001-gomarkedit-product/data-model.md \
  specs/001-gomarkedit-product/contracts \
  specs/001-gomarkedit-product/quickstart.md
git diff --check
```

Expected: no unresolved planning marker and no malformed patch.

Review manually:

1. `FR-WS-001` through `FR-WS-020` remain complete and each has exactly one plan owner.
2. Every platform uses ordinary native framing. No replacement window control, drag region, custom
   resize zone/cursor, 6/12-pixel target, private resize invocation, or compatibility shim is authorized.
3. The in-app row is Settings, View, About for this slice; File is absent; macOS alone also has native
   App/Edit roles with no duplicate native About.
4. Go/appmodel owns acknowledged state and pending layout intent; Redux projects it; frontend generated
   bindings and public Wails runtime imports occur only in `frontend/src/logic/adapter/`.
5. Launcher, File commands, real tabs, file lifecycle, rendering expansion, packaging, Editor expansion,
   and Assistant behavior are downstream and have no placeholder.
6. Network evidence has no duration requirement. Performance evidence requires at least 20 resize and
   20 divider samples. The full 18-case matrix remains automated, with one current-host real-build walkthrough.

## 2. Capture a trustworthy implementation baseline

Before any production edit, run:

```bash
just baseline 001-gomarkedit-product
```

Expected: every retained gate records raw output, exit code, findings, and a reliable verdict. A nonzero
analyzer that parsed nothing is `UNRELIABLE` and blocks implementation.

## 3. Prove native options, startup, and close lifecycle

Later implementation must run focused Go tests and the complete Go suite:

```bash
go test . ./internal/application ./internal/appmodel ./internal/settings ./internal/db
just test
```

Expected coverage:

- explicit framed/resizable 1024 x 768 options, exact 375 x 480 minimum, and start-hidden behavior;
- macOS App/Edit roles without native About or an extra application action catalogue, and no native
  menu on Windows/Linux;
- independent missing/invalid size and maximized fallback, oversized size correction using public
  screen information, no restored position/full-screen state, two-sided readiness, and show-once;
- safe in-webview startup failure with exact title/message/Retry, repeated failure, and successful Retry;
- public runtime operations only; no private resize/drag/control compatibility path;
- discrete commit, 250 ms continuous commit, synchronous `OnBeforeClose` flush, failure retention, and
  two-connection stale-close arbitration;
- one acknowledged appmodel projection after commit or newer-winner reload, never before persistence;
- one Go build-version source with exact `dev` fallback.

## 4. Prove Settings reset and cross-layer boundaries

Focused tests must prove:

- SQLite commits all delivered Appearance defaults in one transaction and rolls everything back on
  injected failure;
- service membership is all and only delivered Appearance fields;
- the Wails-bound reset handler keeps its typed result, arity, named-result, and panic-recovery contract;
- both Appearance surfaces update from one acknowledgement; failure retains both old values;
- a second running process keeps its already acknowledged values until relaunch;
- layout, documents, and recent-path storage remain unchanged;
- generated bindings and frontend Wails runtime imports exist only under `frontend/src/logic/adapter/`.

## 5. Prove actions, accessibility, responsive shell, and notifications

Run focused frontend tests, then:

```bash
npm --prefix frontend test -- --runInBand
npm --prefix frontend run typecheck
npm --prefix frontend run lint
```

Expected coverage:

- one action registration and shortcut per shipped action;
- one Settings/View/About row, responsive overflow, absent File entry, and no duplicate native chrome;
- F11 uses adapter-wrapped public full-screen operations; native resize observation queries public
  native size/maximized state before sending typed layout intent;
- Settings initial focus, trap, Escape, opener restoration, and background-shortcut suppression;
- notification code-plus-subject dedup, localized count refresh, 4/6/8-second timing, never-dismissed
  errors, oldest-non-error displacement, ordered overflow errors, and continuing-condition banners;
- real `AppShell` rendering, catalogue strings, longer text, reduced motion, delivered focus ring, and
  dev-bridge parity;
- source assertions that forbid custom title controls, drag markers, resize targets, private runtime
  invocations, File/launcher/tab/Assistant placeholders, and empty future Settings groups.

## 6. Run the complete automated browser evidence

Start the mock-backed interface:

```bash
just dev-ui
```

Use the in-app browser for interactive repair, then run:

```bash
npm --prefix frontend run verify:ui
```

The automated evidence must:

1. Exercise 375, 768, and 1280 in all six resolved palettes: 18 complete cases, not six desktop
   screenshots or a representative subset.
2. At 1280, open Settings, View, and About; operate Appearance/reset, sidebar, notification remediation,
   keyboard focus, and F11 routing; confirm File and every future surface are absent.
3. At 768, verify the 46 px workspace rail, responsive menu behavior, empty zero-width Assistant
   reservation, real centre content, and no tab strip.
4. At 375, verify the 230 px off-canvas workspace, menu overflow, stacked centre panes, one-row toolbar,
   keyboard operation, and no horizontal clipping.
5. Repeat longer translated text and reduced-motion cases without changing outcomes.
6. Run one short representative journey under request instrumentation; allow only the local test origin,
   retain the request log, and fail on any outbound attempt. No minimum duration applies.
7. Retain at least 20 automated viewport-resize samples and at least 20 divider-drag samples. At least
   95% must update visibly within 100 ms, no freeze may exceed 250 ms, and final durable acknowledgement
   must appear within 500 ms after input stops.

## 7. Walk one current-host real build

Build and launch the real Wails application, not only the mock server:

```bash
just build
```

Record the host/platform and perform one representative walkthrough that covers:

1. default and restored hidden startup with no visible layout jump;
2. native movement and title-bar double-click behavior, native border/corner resizing, exact 375 x 480
   minimum, minimize, maximize/restore, close, and F11 full screen;
3. Settings, View, and About in the row directly below the native title bar, with File absent; on macOS,
   native App/Edit roles and no duplicate native About;
4. Settings acknowledgement, atomic reset success/failure, focus trap, Escape, and opener restoration;
5. desktop, rail, and off-canvas sidebar states plus divider acknowledgement;
6. repeated notification counts, non-dismissed/non-evicted errors, queue promotion, safe remediation,
   and continuing-condition banner behavior;
7. injected version and exact `dev` fallback;
8. absence of launcher, recents, tab strip, Assistant controls/content, and future Settings groups;
9. quit during the 250 ms persistence pause and two-process stale-close ordering.

This walkthrough complements the automated request log and 18-case browser matrix. It has no five-minute
or 60-second duration requirement and does not claim macOS, Windows, and Linux completion. Repeat native
window behavior on all three platforms at the Viewer release gate.

## 8. Verify the completed slice later

After implementation and live repair loops:

```bash
just verify 001-gomarkedit-product
just archtest
just test
just build
git diff --check
```

Expected: no new reliable-baseline finding, architecture tests green, named tests inspected, complete
automated evidence retained, and the current-host real-build walkthrough recorded. Only then reconcile
the shell slice. Task generation and implementation are deliberately outside this planning run.
