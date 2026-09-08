# Current-host native evidence

Captured 2026-08-04.

`just build` completed for `darwin/arm64` with Wails v2.12.0 and produced the final signed bundle:

`/Users/ok/Development/GitHub/go_mark_edit/build/bin/GoMarkEdit.app/Contents/MacOS/GoMarkEdit`

The exact app bundle was launched on the unlocked current macOS host for the final rebuilt walkthrough. The
observed native evidence was:

- The ordinary framed window moved by its native title area, visibly resized from its native lower-right
  border, and the final rebuilt app closed through the native close button; `list_apps()` reported
  `isRunning: false` before that same rebuilt bundle was relaunched.
- The real build exposed File, Settings, View, and About in order, with the exact deferred File/About items;
  Keyboard shortcuts opened a focused modal with platform-correct macOS accelerators.
- The visual tabs remained selected/inert fixtures, the toolbar overflow exposed the approved relocated
  groups, and Format/Compact/Lint/Assistant remained disabled. A real Monaco selection made with Shift+Left
  changed `hello` to `**hello**` through toolbar Bold, and Cmd/Ctrl+Z restored `hello` in one step.
- The native context menu exposed exactly Cut, Copy, Paste, Paste as plain text, Bold, Italic, Link, disabled
  Format document, disabled Compact, and Command palette; it omitted Lint and Heading/list/Quote/Table.
  Invoking context-menu Bold on the real selection changed `hello` to `**hello**` in the final rebuilt app.
- Settings acknowledged line-number changes, retained word wrap off and font size 14, and restored Minimal,
  Light, Split, and the visible left sidebar. The Editor-stage surface remained intact while options changed
  in place. No Assistant landmark/panel, file lifecycle, real tab lifecycle, remote About path, or successful
  deferred operation appeared.

The current-host ED-LIVE-005 walkthrough is complete for the final `darwin/arm64` build. Windows/Linux
repetition remains outside the current host and is not claimed here; that is a runtime evidence limit, not a
code defect or unresolved blocker for this slice.

## T062 fresh packaged-build walkthrough

The freshly rebuilt `/Users/ok/Development/GitHub/go_mark_edit/build/bin/GoMarkEdit.app` was launched and
operated on the current macOS host after the fresh M1-M6 verifier passed. The accessibility tree and visible
state confirmed:

- The ordinary OS-managed framed window exposed native title-area movement and native close, and a title-area
  drag was exercised before the final close. The close button then stopped the exact packaged bundle;
  `list_apps()` reported `com.wails.GoMarkEdit` with `isRunning: false`.
- Settings changed Line numbers from on to off while keeping the editor mounted and the document text
  `hello` unchanged; View showed Editor/Split/Preview, Toggle Sidebar, Line numbers, Word wrap, Full screen,
  disabled Toggle Assistant, and disabled Distraction-free reading.
- About showed Keyboard shortcuts, disabled Open logs folder, disabled View on GitHub (MIT), and About
  GoMarkEdit. The shortcuts dialog showed macOS `⌘` bindings and localized unavailable Image/Format/Compact/Lint
  entries. File showed the complete disabled lifecycle inventory, including disabled Open Recent.
- A real editor value was set to `hello`; native Shift+Left selection plus toolbar Bold produced a bounded
  `hell**o**` edit, and native `⌘Z` restored `hello` in one undo step. Format, Compact, Lint, Assistant,
  visual tabs, file lifecycle, and remote/network behavior remained unavailable or absent.

This is current-host macOS evidence only. Windows/Linux runtime repetition remains explicitly out of host
scope, and generated-binding tracking remains separately recorded in `editor-stage-verification.md`.

## Convergence rebuild recheck

The rebuilt `darwin/arm64` binary was relaunched after the final T043 keyboard-dispatch repair. Its native
accessibility tree retained the OS-managed frame, File/Settings/View/About actions, Editor/Preview surfaces,
disabled Format/Compact/Lint, and the exact toolbar. Opening Settings showed `(disabled) Markdown standard`
with no popup role; clicking that disabled element left no active Minimal/GFM/Full choices. The native
Settings menu was then dismissed without changing renderer state.

## Phase 13 packaged native walk (2026-08-05, partial)

`just build` again produced the signed `darwin/arm64` application and the exact bundle was launched. The
accessibility tree identified it as a standard macOS window with native close, minimize, and the native
fullscreen/zoom control; `main.go` retains `Frameless: false` and `DisableResize: false`. The View menu's
Full screen command entered full screen and F11 returned it to the ordinary framed window. The native zoom
secondary action was exercised in both directions, a right-border drag changed the live responsive toolbar
from overflowed to fully exposed groups, and a titlebar drag was accepted without a web overlay intercepting
the gesture. Native Close stopped the exact bundle; `list_apps()` reported `isRunning: false`.

The packaged context menu opened with the approved ten items and retained disabled Format document and
Compact. A final selection-preservation retest was interrupted by the host lock screen, so this run does not
claim a fresh packaged context-menu formatting result or full Phase 13 native completion.

## Phase 13 completion retry (2026-08-05)

After the host was unlocked, a freshly built signed `darwin/arm64` bundle was launched and operated through
the native accessibility tree. In the editor, `Cmd+A` selected `hello`; the real context menu then applied
Bold and the editor value became `**hello**`, while the rendered preview retained `hello`. The menu retained
the approved item inventory and unavailable Format document and Compact entries. The View Full screen command
entered full screen and F11 returned to the framed window; the native zoom action and native close were also
exercised, with the final `list_apps()` result reporting `isRunning: false`. `main.go` continues to use
`Frameless: false` and `DisableResize: false`. Windows and Linux repetition remains explicitly out of host.

## Phase 16 T080 current-host package walk (2026-08-05) — evidence retained, task blocked by E2E

The bundle produced by the immediately preceding retained `just build` output was launched from
`build/bin/GoMarkEdit.app/Contents/MacOS/GoMarkEdit`. Its native accessibility tree reported a `standard
window GoMarkEdit` with native close, minimize, and fullscreen/zoom controls; this is the OS-managed frame,
not a webview replacement.

- File opened its full visual lifecycle inventory with every item disabled (including Open Recent); dismissing
  it and opening View left only View options active. View exposed real arrangement/sidebar/settings controls
  and disabled Toggle Assistant and Distraction-free reading. The visual document tabs remained disabled
  fixtures. Image, Format, Compact, and Lint were disabled with the localized unavailable help text.
- In the real Monaco editor, `Cmd+A` then toolbar Bold changed `T080 proof` to `**T080 proof**`; Cmd+B and
  the editor context menu were both exercised. Context-menu Bold removed the existing markers, returning the
  exact source to `T080 proof`. The context inventory retained disabled Format document and Compact. No File,
  tab, Assistant, image/file paste, tidy, renderer, or provider action became available.
- A native right-edge resize visibly reduced the window to 768 px and retained the relocated/overflowed
  toolbar. A further drag toward 375 px stopped at the current host's 768 px package minimum. This is an
  explicit current-host limitation, not 375 px packaged evidence; the raw unrestricted browser gate must be
  repaired before any 375 px result is claimed as a completed T080 proof.
- View → Full screen entered native fullscreen; Escape returned to the ordinary frame. The native fullscreen
  control's exposed `zoom the window` secondary action was exercised. Native Close stopped the exact package
  and the final `list_apps()` result was `com.wails.GoMarkEdit`, `isRunning: false`.
- While the package process was live, the process-scoped command
  `lsof -nP -a -p 13440 -iTCP -sTCP:ESTABLISHED` exited 1 with no rows, i.e. no established TCP connection
  for that exact package process. The UI accessibility tree identified its content URL as
  `wails://wails.localhost:34115/`; no outbound/package network path was observed.

This current-host record does not override the failing raw `just e2e-test` result recorded in
`editor-stage-verification.md`. Windows/Linux repetition and a 375 px packaged resize remain outside this
host observation.

## Phase 17 T083 current-host package walk (2026-08-05)

The bundle from `phase-17-build.raw.log` was launched directly. Its accessibility tree reported a standard
macOS GoMarkEdit window with native close, minimize, and fullscreen/zoom controls, File/Settings/View/About,
the workspace splitter, visual disabled tabs, and Editor plus Preview panes. The toolbar exposed enabled
Markdown commands and View arrangement controls while Image, Format, Compact, Lint, and Toggle Assistant
were disabled with the unavailable-help text.

Entering `current-host` into the real Monaco editor updated the packaged preview to `current-host`. Invoking
toolbar Bold inserted Markdown delimiters at the current editor caret; the temporary text was then cleared
and the preview settled empty. File/View competing-popup dismissal was covered by the fresh T070 browser
matrix and focused regression test. The desktop accessibility controller could inspect either active popup
but could not switch between overlapping webview popups or resize this replaced bundle; that host limitation
is explicit, not treated as package interaction evidence. The prior current-host native resize/fullscreen
observation remains applicable because the Phase 17 change is limited to View opener-focus capture.

While the fresh package was live, `lsof -nP -a -c GoMarkEdit -iTCP -sTCP:ESTABLISHED` returned no connection
rows. The browser journey retains request instrumentation for the local-only requirement; no network behavior
was added by the opener-focus repair.
