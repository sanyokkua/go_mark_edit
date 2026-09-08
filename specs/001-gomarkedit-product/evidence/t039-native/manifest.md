# T039 current-host native evidence

Date: 2026-08-02

Host: macOS 26.5.2 (25F84), Darwin arm64.

Scope: T039 only. The evidence driver and its frontend entry point are compiled only for the
`native_evidence` build tag. They reuse the production Wails shell, application context, handlers,
Redux store, components, and SQLite repositories. No shipped production source was changed for this
driver.

## Safeguards: red, then green

The first focused run was deliberately made before the driver existed:

```text
go test -run TestNativeEvidence -count=1 .
FAIL: 0 passed, 2 failed
cmd/native-evidence was absent
frontend/evidence/check-boundaries.mjs was absent
```

After adding the test-only driver, `native_evidence_safeguards_test.go` requires all of the following:

- the driver is discoverable with `native_evidence` and compiles with
  `native_evidence,desktop,production`;
- the ordinary `desktop,production` package graph and linked release binary contain neither the
  driver package nor native-evidence symbols;
- the Go driver imports only the existing `apperr`, `application`, `appmodel`, and `file` boundaries;
- the frontend driver imports only the production `App`, adapter, store, and notification slice, and
  imports no generated Go binding;
- no evidence-only Wails handler, release environment switch, or release UI hook exists;
- every scenario has a declared existing dependency route in `frontend/evidence/boundaries.json`.

The green rerun and final verification command/results are retained in
[`window-shell-verification.md`](../window-shell-verification.md).

## Evidence-only native observations

Each binary was wrapped in a separately identified copy of the ordinary Wails app bundle and ad-hoc
signed. This made simultaneous and sequential evidence windows distinguishable from the ordinary
`com.wails.GoMarkEdit` application. The scenario name and result were also rendered inside the webview
and exposed in its accessible description.

### Pending close flush

Boundary: production separator key handling -> `AppModelHandler.SetUILayout` -> Wails
`OnBeforeClose` -> `FlushBeforeClose`.

The evidence timer was held before the normal 250 ms debounce could complete. The production
separator moved from 256 to 288 and requested native quit after 40 ms. After process exit, the isolated
SQLite row was:

```text
layout.workspace.width|{"version":1,"value":288,"changedAtUnixNano":1785704054448397000,"writerId":"54f72d5865df447919cca9dc39cfda7d","sequence":2}|layout.versioned
```

This directly retains the pending value written by close-time flush.

### Simultaneous-process stale-close ordering

Boundary: production separator key handling -> `AppModelHandler.SetUILayout` -> `LayoutRepositoryAPI`
-> Wails `OnBeforeClose`.

Two separately identified native processes used the same isolated database. The older writer showed
workspace value 304 while its timer was held. The newer writer acknowledged and stored 352 with writer
`9ef7bbb7be155c680b436b13be92607c`, sequence 6. After the older process closed, and again after both
processes exited, the row remained exactly:

```text
layout.workspace.width|{"version":1,"value":352,"changedAtUnixNano":1785704162133724000,"writerId":"9ef7bbb7be155c680b436b13be92607c","sequence":6}|layout.versioned
```

The distinguishable older visible state and newer stored identity prove that stale close did not
overwrite the newer acknowledgement.

### Startup failure and Retry

Boundary: injected `FileUtilsServiceAPI` failure -> existing `ApplicationHandler.RetryStartup`.

The first database-path lookup rendered only the safe startup surface with `GoMarkEdit could not
start`, `GoMarkEdit could not initialize its local settings. Please try again.`, and `Retry`; it showed
no raw path or injected error. The first Retry repeated the same safe failure. The second Retry
succeeded and displayed one ordinary shell. See [`startup-failure.png`](startup-failure.png) and
[`startup-recovered.png`](startup-recovered.png).

### Divider acknowledgement

Boundary: production separator key handling -> `AppModelHandler.SetUILayout` ->
`AppModelAdapter.getState`.

Three real separator key events produced expected value 304. The visible ARIA value, Go acknowledgement,
and isolated SQLite value all matched 304; the retained reporter read
`status=PASS expected=304 visible=304 acknowledged=304`. See
[`divider-acknowledgement.png`](divider-acknowledgement.png).

### Toasts and continuing banner

Boundary: production notification-slice actions -> production Redux store -> production Radix toast
and banner components.

The evidence-only Start button was clicked in the native webview before timing began so Radix did not
pause durations for an unfocused window. The retained reporter recorded:

```text
deduplicated elapsedMs=1002 visible=success:1,info:2,warning:1 banners=condition:2
after-success-deadline elapsedMs=4253 visible=info:2,warning:1 banners=condition:2
after-refreshed-info-deadline elapsedMs=7255 visible=warning:1 banners=condition:2
after-warning-deadline elapsedMs=8256 visible=none banners=condition:2
errors-queued elapsedMs=8359 visible=error-one,error-two,error-three queued=error-four banners=condition:2
error-promoted elapsedMs=8460 visible=error-two,error-three,error-four queued=none banners=condition:2
```

This directly observes 4/6/8-second toast lifetimes, duplicate count refresh, persistent banner
deduplication, the three-error visible capacity, fourth-error queue, and promotion after dismissing the
oldest error. See [`notifications-focused-history.png`](notifications-focused-history.png).

## Separate ordinary app-bundle walkthrough

`just build` produced and self-signed the ordinary release app bundle without `native_evidence`.
`build/bin/GoMarkEdit.app` was launched as `com.wails.GoMarkEdit`, separately from every evidence app.

Direct ordinary-build observations:

- the native frame exposed ordinary close/minimize/zoom controls and only the macOS GoMarkEdit/Edit
  application menus; the webview exposed only Settings, View, About, workspace, editor, preview, and
  notification regions;
- the separator moved from 304 to 320 through the real keyboard control and relaunched at 320, proving
  the naturally reachable acknowledgement/persistence path;
- dragging the native corner to the exact minimum produced the repaired 230-point off-canvas workspace,
  stacked editor/preview panes, no 46-point rail, and no horizontal overflow; see
  [`ordinary-packaged-minimum.png`](ordinary-packaged-minimum.png);
- Settings exposed only Theme and Appearance plus the Appearance dialog. Reset changed Liquid Glass /
  Light to the defaults Material / Follows system. Close and Escape each restored focus to the exact
  connected Settings opener; see [`ordinary-packaged-appearance.png`](ordinary-packaged-appearance.png);
- View exposed only Show Editor, Show Preview, and Show Workspace;
- About rendered `About GoMarkEdit` and `Version dev`; see
  [`ordinary-packaged-about.png`](ordinary-packaged-about.png);
- the complete accessible tree contained no File menu, launcher, recents, real document tabs, future
  Settings groups, Assistant controls/content, or DOM window-control facsimiles.

Success/info/warning toasts, a continuing-condition banner, injected startup failure, a held debounce,
and distinguishable shared-database writers are not naturally reachable from the current ordinary
shell; the release-excluded driver supplements those cases and does not replace this walkthrough.

Windows and Linux runtime repetition remains intentionally deferred until whole-application
completion, as approved by SC-018. This current-host evidence makes no cross-platform runtime claim.
