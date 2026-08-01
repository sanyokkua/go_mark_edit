# Phase 0 Research: Native Window Shell

This research resolves the technical choices for the approved `FR-WS-001` through `FR-WS-020`
slice against current code and the locally pinned Wails v2.12.0 source. It does not treat historical
completion labels or the obsolete frameless design as evidence.

## Current code and pinned-runtime findings

- `main.go` currently configures only title, 1024 x 768 size, assets, startup/shutdown, bindings, and
  logging. `main_test.go` is the existing options/lifecycle test seam. Exact minimum, start-hidden,
  restore/show coordination, menu roles, close flush, and version injection are missing.
- `internal/appmodel/service.go` is the canonical mutex-guarded state owner and emits acknowledged
  patches; `frontend/src/logic/store/appModelProjection.ts` hydrates once and applies patches, and
  `uiSlice.ts` changes layout only from those projection actions. Current layout is memory-only.
- `internal/apperr/results.go` currently exposes application layout fields that duplicate document
  pane/Assistant state and lacks durable native geometry. Those fields must converge on the approved
  model without weakening document-owned `DocView`.
- `frontend/src/logic/adapter/index.ts` is the only production frontend importer of generated bindings
  and `wailsjs/runtime`; the architecture lint already enforces that boundary.
- `internal/db/db.go` already provides modernc SQLite, WAL, a five-second busy timeout, and one
  connection per process. The generic settings table and `UpsertSetting` are unconditional, so
  conditional layout arbitration is new repository behavior rather than a new database authority.
- `internal/settings/repository_sqlite.go` writes Appearance fields sequentially; atomic reset does not
  exist. `AppearanceControls.tsx` already waits for acknowledgement and the delivered theme mirror,
  palettes, Monaco rules, and reduced-motion tokens remain dependencies.
- `AppShell.tsx` already reserves empty left/centre/right regions, but the specified sidebar content,
  divider, 768/375 states, unified row, About, and action catalogue are absent. File, launcher, tabs,
  and Assistant controls are already absent and stay so.
- `notificationsSlice.ts` and `Toast.tsx` currently support only error-shaped notifications, discard
  repeats, evict by age, and use one five-second duration. The approved notification model is not built.
- `frontend/e2e/appearance.test.ts` already iterates the 18 width/palette combinations for appearance;
  the shell must extend real-component assertions rather than replace this with a representative subset.
- The locally cached `github.com/wailsapp/wails/v2@v2.12.0` source confirms all public framed-window
  operations used below and confirms the stated resize-event, screen-work-area, and native-dialog
  limitations. No impossible contract remains with the recovery-surface decision below.

## Decision 1: Keep the native shell as the only actionable frontier

**Decision**: Plan the framed window, acknowledged durable shell layout, in-app menus, Settings/reset,
notifications, responsive states, build identity, and shell evidence now. Keep launcher activation,
File commands, real tabs, file lifecycle, rendering expansion, packaging, Editor expansion, and
Assistant behavior downstream.

**Rationale**: The six-palette appearance contract is delivered, and the current app already has a
real document and three-region skeleton. This slice is independently visible without inventing a
zero-document model or future commands.

**Alternatives considered**: Combine shell and file opening; render disabled launcher/tab/File
facsimiles; plan the remaining product at once. Each crosses the approved dependency boundary.

## Decision 2: Use ordinary framed Wails windows on every platform

**Decision**: Configure Wails with `Width: 1024`, `Height: 768`, `Frameless: false`,
`DisableResize: false`, `MinWidth: 375`, `MinHeight: 480`, and `StartHidden: true`. Do not configure
CSS drag properties, platform frameless options, replacement window controls, custom drag regions,
custom resize zones/cursors, private `resize:<direction>` calls, or a native compatibility shim.

**Rationale**: `options.App` in pinned Wails v2.12.0 directly supports framed resizable windows,
minimum dimensions, start-hidden lifecycle, menus, and close callbacks. The OS then owns movement,
title-bar double-click, resize borders, minimize, maximize/restore, and close exactly as required.

**Alternatives considered**: The superseded frameless design; a Wails fork; native plugins; CSS hit
targets. All add redundant ownership and conflict with the approved 2026-08-01 clarification.

## Decision 3: Coordinate hidden restore with native and frontend readiness

**Decision**: Use a small application lifecycle barrier. Go initializes SQLite, loads and validates
layout, clamps an oversized size to the current/primary logical screen when necessary, applies native
size/maximized state, and marks native restore ready. The frontend hydrates the acknowledged shell and
signals shell readiness through a typed adapter command. The normal shell is shown exactly once only
after both are ready. Position and full-screen state are not restored; Wails/OS placement is retained.

**Rationale**: `OnStartup` and `OnDomReady` can race. `StartHidden`, public `WindowSetSize`,
`WindowMaximise`, `ScreenGetAll`, `WindowCenter`, and `WindowShow` are sufficient without a visible
default-layout flash or a browser cache as second authority.

**Alternatives considered**: Show then resize; localStorage geometry; frontend-only restore; position
polling. These either flash, duplicate authority, or add an unrequired unstable state.

## Decision 4: Render startup recovery inside the framed webview

**Decision**: On initialization failure, show only a safe startup-recovery surface inside the framed
window with the exact title, message, and Retry action; keep the normal shell unmounted/hidden. Retry
invokes a typed repeatable backend initialization command. Success completes restore/hydration and
shows the normal shell once; repeated failure keeps the recovery surface and exposes no raw detail.

**Rationale**: Wails v2.12.0 `MessageDialogOptions.Buttons` is not cross-platform: Windows and Linux
ignore custom Error-dialog buttons, so a native dialog cannot supply the exact Retry contract. The
requirement says the normal shell remains hidden, not that the native window remains invisible.

**Alternatives considered**: Current native error dialog plus exit; a custom native Retry dialog; show
the partially initialized shell. The first two cannot meet recovery cross-platform and the third
violates the hidden-normal-shell outcome.

## Decision 5: Observe native resize without taking it over

**Decision**: Listen to DOM viewport resize only as a notification, then obtain authoritative native
width, height, and maximized state through adapter-wrapped public `WindowGetSize` and
`WindowIsMaximised`. Send typed layout intent to Go/appmodel. F11 toggles public
`WindowIsFullscreen` plus `WindowFullscreen`/`WindowUnfullscreen` through the same frontend adapter.

**Rationale**: Wails exposes no native resize-event subscription, but native resize still produces a
webview resize. Querying public native state avoids treating `innerWidth` as durable outer-window
geometry. All production `wailsjs/runtime` imports remain in `frontend/src/logic/adapter/`.

**Alternatives considered**: Private resize invocation; frontend geometry as canonical state; polling;
custom title controls. None is needed for a framed window.

## Decision 6: Persist layout per field with original change identity

**Decision**: Store each durable layout field as a versioned KV value containing the typed value,
original wall-clock change time, per-process writer ID, and writer-local sequence. Compare and replace
atomically by the complete identity. Discrete intent commits immediately. Continuous resize/divider
intent reaches an appmodel-owned pending/debounce service as it happens, commits after 250 ms, and is
flushed synchronously from `OnBeforeClose` using its original identity.

**Rationale**: The current settings upsert is unconditional and current layout is memory-only. A
frontend-only debounce cannot guarantee close flush. Whole-layout or close-time snapshots allow an
older process that closes later to overwrite a newer change. Writer ID and sequence also break
timestamp ties; wall-clock time alone is insufficient.

**Alternatives considered**: Save on close; unconditional per-field upsert; frontend-only pending
state; one row per window. Each violates newest-change-wins or backend authority.

## Decision 7: Project only acknowledged durable state

**Decision**: A layout command persists first. Only the committed value or the reloaded newer winner
is projected through `state:patch`. Failure leaves the prior acknowledged projection and emits one
classified notification. A stale refusal is a successful conflict outcome, not an error.

**Rationale**: Current `SetUILayout` mutates memory and emits before persistence exists. That order
would make Redux display an unacknowledged value and would require optimistic rollback.

**Alternatives considered**: Optimistic Redux; emit then write; silent write failure. All introduce a
second effective state or violate the visible-acknowledgement contract.

## Decision 8: Keep document arrangement and application fallback distinct

**Decision**: A document's `DocView` owns Editor/Split/Preview arrangement and pane state. Application
layout stores only the last-used fallback for a document without saved view state. Remove application
layout fields that duplicate document pane or Assistant state; Assistant remains structurally reserved
at zero width without a durable visibility control.

**Rationale**: Current DTOs contain both document view and application layout pane fields. Explicit
precedence prevents two canonical pane owners.

**Alternatives considered**: Global arrangement authority; duplicated arrangement values without
precedence; removing the required new-document fallback.

## Decision 9: Use one in-app Settings, View, About row on all platforms

**Decision**: Build one responsive React menu row directly below the native title bar, in Settings,
View, About order for this slice. The binding order remains File, Settings, View, About when File later
has real commands. Register only working shell actions in one canonical catalogue. On macOS explicitly
install native App and Edit roles; install no native application menu on Windows/Linux.

**Rationale**: The current Settings control and View dropdown are separate and no action catalogue or
About surface exists. Wails can build native macOS roles, while the approved clarification puts
application menus in the webview row on every platform. Explicit macOS construction avoids silently
accepting Wails' additional default Window menu.

**Alternatives considered**: Native Settings/View/About menus; platform-specific DOM rows; a visible
empty File menu; replacement native controls. Each conflicts with the approved presentation boundary.

## Decision 10: Expand Settings only around delivered Appearance

**Decision**: Turn the delivered Appearance dialog into the accessible Settings shell and keep it
synchronized with quick Appearance controls. Trap focus, close on Escape, restore opener focus,
suppress background shortcuts, and reset all and only delivered Appearance defaults in one backend
transaction. Another open process keeps its acknowledged values until relaunch.

**Rationale**: Current Appearance writes already wait for backend acknowledgement, but the dialog has
no focus lifecycle or reset and the repository writes group fields sequentially. One transaction is
required for all-or-nothing reset.

**Alternatives considered**: Sequential UI updates; reset every known setting; show empty future
groups; broadcast across processes. These permit partial state or cross the approved scope.

## Decision 11: Complete notifications with real shell consumers

**Decision**: Model severity, subject, code-plus-subject deduplication, localized repetition count,
banner/toast lifecycle, optional remediation, and ordered queued errors. Show at most three toasts;
only the oldest non-error may be displaced; errors neither auto-dismiss nor get evicted; success,
information, and warning dismiss after 4, 6, and 8 seconds. Startup/settings/layout failures are the
real consumers.

**Rationale**: The current reducer supports only error-shaped items, drops repetitions, evicts the
oldest item regardless of severity, and the current toast uses one five-second duration.

**Alternatives considered**: Example-only notifications; keep current errors until later; use one
duration. These fail current shell requirements or create showcase data on production paths.

## Decision 12: Consume the delivered appearance contract without re-owning it

**Decision**: Preserve the six palettes, startup theme mirror, language-qualified Monaco rules,
tokenized focus/overlays, localized strings, longer-text tolerance, and reduced-motion behavior. Add
responsive shell rules at 375, 768, and 1280; keep Assistant, File, launcher, real tabs, and future
Settings groups absent.

**Rationale**: The appearance frontier is delivered and has a working acknowledged-write path. The
shell should extend its tokens and evidence, not reopen palette ownership or add fake consumers.

**Alternatives considered**: New shell colors; an empty tab strip; hidden future controls; a second
appearance cache. All weaken the delivered contract or honest-surface boundary.

## Decision 13: Prove all 18 responsive palette combinations automatically

**Decision**: Playwright renders actual shell components at 375, 768, and 1280 in each of six resolved
palettes. Every case checks menu row/overflow, sidebar form, centre layout, overlays, focus, Assistant
absence, tab-strip absence, and no horizontal clipping. Existing appearance coverage is extended rather
than replaced by a sample subset.

**Rationale**: Six desktop screenshots do not prove the narrow responsive states. SC-013 explicitly
requires all 18 combinations.

**Alternatives considered**: One palette per width; screenshot-only inspection; current-host native
matrix. These omit required combinations or conflate browser and native evidence.

## Decision 14: Use static safeguards plus one short request-instrumented journey

**Decision**: Scan production source and the built bundle for prohibited network APIs, remote assets,
telemetry, update checks, crash uploads, remote fonts, and similar paths. Run one representative
Playwright shell journey with request instrumentation, allow only the local test origin needed to load
the app, retain the request log, and fail on any outbound attempt. There is no duration requirement and
no manual packet-capture requirement.

**Rationale**: Static checks catch dormant paths while runtime instrumentation catches component
behavior. The approved clarification explicitly removes the former five-minute shell exercise.

**Alternatives considered**: Source search alone; disabling networking; manual packet capture; a timed
observation without request instrumentation.

## Decision 15: Measure resize and divider responsiveness with retained samples

**Decision**: Collect at least 20 automated viewport-resize samples and at least 20 automated divider
drag samples with monotonic timing. Fail unless at least 95% of visible updates complete within 100 ms,
no visible freeze exceeds 250 ms, and final durable acknowledgement occurs within 500 ms after input
stops. There is no minimum duration.

**Rationale**: The exact sample counts and thresholds are approved and reject percentile, long-tail,
and acknowledgement regressions without a subjective 60-second exercise.

**Alternatives considered**: One average, manual feel, a synthetic microbenchmark, or a fixed-duration
loop without minimum samples.

## Decision 16: Use one representative current-host real-build walkthrough

**Decision**: After automated checks, walk one current-host real build through native movement,
resizing and exact minimum, minimize, maximize/restore, close/flush, F11 full screen, the in-app menus,
Settings/reset/focus, sidebar states, About, notifications, and absence of File, launcher, tabs,
Assistant, and future Settings surfaces. Record the tested host honestly. Repeat native behavior on
all three platforms only at the Viewer release gate.

**Rationale**: Mock-bridge browser tests cannot prove OS chrome or native lifecycle, while one current
host cannot prove three-platform completion. SC-018 defines the correct division.

**Alternatives considered**: Browser-only completion; three-platform claims from source inspection;
repeating the entire 18-case matrix manually in the native build.

## Resolved Unknowns

- No dependency upgrade, Wails fork, private runtime invocation, or custom native code is needed.
- Default window size is 1024 x 768; exact minimum is 375 x 480; position and full screen are not durable.
- Wails has no native resize event; DOM resize triggers an adapter query of authoritative native size/state.
- Public Wails screen data lacks work-area coordinates; because position is not restored, oversized size
  is clamped to a current/primary logical screen and the OS/Wails places or centers the framed window.
- `OnBeforeClose` provides the synchronous backend close-flush boundary.
- Cross-platform Retry must be a safe in-webview recovery surface, not a custom native error-dialog button.
- File, launcher, real tabs, file lifecycle, rendering expansion, packaging, Editor expansion, and
  Assistant behavior remain entry-gated and visually absent.
- Every `FR-WS-*` key has exactly one plan owner and exactly one matching primary implementation owner
  in the regenerated 36-task file. Supporting tests and evidence name those owners without re-owning
  requirements.
