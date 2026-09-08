# Phase 22 current evidence — T094–T097

Captured 2026-08-06 on the current macOS host. This is an additive record; Phase 16–21
evidence remains unchanged.

## Baseline and RED evidence

- `just baseline 002-editor-stage-formatting` was rerun with the existing usable Go module
  cache after the initial sandbox-only lint attempt returned `UNRELIABLE` (`context loading
  failed: no go files to analyze`). The trustworthy baseline is clean: frontend build, format,
  typecheck, lint, test, architecture, and coverage gates all exited 0; recorded coverage was
  65.5%.
- Before production edits, the new focused popup/theme tests failed: context menu remained under
  its filtered ancestor, popup markers were absent, toolbar controls lacked registry IDs, and the
  new Wails macOS option assertion saw nil `Mac` options. The focused Go RED test failed with
  `macOS options are nil; want explicit native zoom configuration`.

## Implemented and green

- T094: `EditorContextMenu` and editor overflow now use body portals with measured viewport
  coordinates, original pointer/trigger rectangles, 8px clamping/flipping, and resize/scroll
  recomputation. Radix and custom shell popups expose the same body-layer markers and collision
  padding. Deferred File/Open Recent/Assistant/Format/Compact/Lint/Command palette outcomes were
  preserved.
- T095: Editor-stage controls expose registry action IDs and the semantic signature test remains
  identical across Glass/Material/Minimal × Light/Dark. Existing generated Monaco/theme-token
  checks remain authoritative for the styling-only differences.
- T096 implementation: `main.go` and `cmd/native-evidence/main_native_evidence.go` explicitly set
  `Mac: &mac.Options{DisableZoom: false}` while retaining framed, resizable, non-fullscreen
  startup. `TestWailsAppEnablesNativeMacZoomWithoutStartingFullscreen` passed, and
  `go test -tags native_evidence ./cmd/native-evidence` compiled successfully (no test files).

## Fresh automated evidence

From `frontend/`, each command used one Playwright worker:

| Command selector | Result |
| --- | --- |
| `T019` | 27/27 passed: 1280/768/375 × three themes × three modes, reachability and local-only request instrumentation |
| `T055` | 27/27 passed: formatting, undo, context menu, overflow, responsive boundaries, and local-only requests |
| `T069` | 27/27 passed: theme-independent mockup chrome hierarchy |
| `T070` | 27/27 passed: popup ownership, viewport geometry, focus, and deferred boundaries |
| `just check` | passed: 262 frontend tests plus Go race tests, build, lint, architecture, CGO-free, and migration checks |
| `just verify 002-editor-stage-formatting` | M1–M6 passed against the trustworthy baseline |
| `just build` | passed: fresh `build/bin/GoMarkEdit.app` for `darwin/arm64` |

The new E2E assertions verify body containment, popup markers, viewport bounds, and the
body-ported overflow locator at all required browser-matrix combinations. The first full T055
attempt exposed the expected locator change from body portaling; the corrected focused run passed
27/27 without weakening timeout, retries, worker count, or locator scope.

## Fresh real Wails observations

- `just dev` exposed the actual Wails window at
  `wails://wails.localhost:34115/`. Computer-use observations exercised real Settings palette
  controls, View, File, About, the editor right-click context menu, visible deferred controls,
  toolbar Bold, and native undo. The real AX tree showed disabled Assistant, Format, Compact,
  Lint, File lifecycle, and visual-tab fixtures.
- The live development process had only loopback sockets: `127.0.0.1:34115` and its local
  frontend watcher at `127.0.0.1:5173`; no external endpoint was present.

## Native evidence boundary

- The fresh packaged app exposed OS-managed close, fullscreen, and minimize controls. Native
  fullscreen removed the titlebar controls and `Ctrl+Cmd+F` was used for the host fullscreen
  path. The packaged process had no established TCP connections.
- The current host restored the saved maximized geometry. Titlebar and lower-corner drag attempts
  did not provide authoritative before/after window bounds in the available AX/screenshot
  surface, and a direct close-button attempt did not yield an observed process exit. `Cmd+Q`
  eventually stopped the packaged process, but that is not being promoted as native close-button
  proof.

Therefore T096 remains unchecked pending authoritative manual zoom/movement/resize/close proof,
and T097 and T093 remain unchecked. No historical evidence was rewritten, and no deferred
behavior was promoted.

## Fresh user-supplied native screenshots — 2026-08-06

The user supplied four current-host screenshots after reporting that resizing, fullscreen, and
the Liquid Glass popup menu work. They are retained as immutable evidence:

- [native fullscreen and Move & Resize menu](phase-22-native-fullscreen-move-resize.png)
- [native Liquid Glass editor context menu](phase-22-native-liquid-glass-context-menu.png)
- [native resized window with desktop visible 1](phase-22-native-resized-window-desktop-1.png)
- [native resized window with desktop visible 2](phase-22-native-resized-window-desktop-2.png)

The two desktop-visible captures show the framed GoMarkEdit window moved and resized against the
desktop, with the native red/yellow/green controls present. The fullscreen capture shows the
macOS Move & Resize surface and the app occupying the available screen. The Liquid Glass capture
shows the editor context menu rendered in the native app surface. This closes the previous visual
gap for native movement, resize, fullscreen/titlebar ownership, and popup appearance.

The screenshots do not establish that the native close control was clicked and the process exited,
and they do not replace the existing local-only request/process evidence. T096, T097, and T093
therefore remain unchecked until native close and the complete T097/T093 evidence contract are
freshly observed.

## Fresh native-close confirmation — 2026-08-07

The user directly confirmed that closing is working: the native close action was used and the
GoMarkEdit window disappeared. No screenshot is expected for this successful outcome because the
window is no longer present to capture. This addendum supersedes the earlier close uncertainty
without rewriting the earlier controller-limited record.

Together with the four retained current-host screenshots above, the existing six-palette real
Wails walkthrough, current-host package walkthrough, and loopback-only request observations, the
required native movement, resize, fullscreen, close, popup, deferred-boundary, and local-only
evidence is now present. T093, T096, and T097 are therefore complete; no deferred behavior was
promoted and no historical evidence was rewritten.
