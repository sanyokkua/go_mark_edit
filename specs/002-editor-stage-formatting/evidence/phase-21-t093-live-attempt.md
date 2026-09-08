# Phase 21 T093 live-control attempt

Captured 2026-08-06 on the current macOS host. This record is fresh evidence
from this attempt only; it does not promote or replace prior phase evidence.

## Real Wails development bridge — observed

The native accessibility controller reported a standard macOS `GoMarkEdit`
window whose HTML content URL was `wails://wails.localhost:34115/`. This was a
real Wails webview, not the browser mock.

- The repaired visible `View` trigger opened the native `View` menu. Its
  inventory was Editor, Split, Preview, Toggle Sidebar, disabled Toggle
  Assistant, Line numbers, Word wrap, disabled Distraction-free reading, and
  Full screen. Selecting Editor and then Split changed the live arrangement;
  the resulting status reported `Editor` and then `Split` respectively.
- Toggle Sidebar changed from off to on and exposed the real Workspace and its
  `Resize workspace` splitter. The visual document tabs remained disabled
  fixtures. Image, Format, Compact, Lint, and Toggle Assistant all remained
  disabled with the localized unavailable help text.
- Actual File, Settings, View, and About controls were operated. File exposed
  the full disabled lifecycle inventory, including Open Recent; About exposed
  Keyboard shortcuts plus disabled Open logs folder and View on GitHub.
- In the real editor, `T093 proof` was entered, selected with native Cmd+A, and
  Bold changed the source to `**T093 proof**`. Native Cmd+Z restored exactly
  `T093 proof` in one step. The real right-click editor menu exposed only Cut,
  Copy, Paste, Paste as plain text, Bold, Italic, Link, disabled Format
  document, disabled Compact, and disabled Command palette.
- The six visible palette selections were each operated through Settings and
  confirmed by their selected native radio controls: Liquid Glass Light/Dark,
  Material Light/Dark, and Minimal Light/Dark.
- The exposed native `zoom the window` action and the View Full screen command
  were invoked in the development host. This does not count as packaged-app
  ownership evidence.

## Regression repair and checks

The real bridge initially reproduced a defect: File and Settings opened but
View did not. The desktop View path had split its visible control from the
Radix trigger. The repair makes the visible View control the real Radix menu
trigger and keeps its controlled open/close ownership. T093's new focused
assertion failed before the repair and passed afterwards.

- `npm test -- ShellMenuRow.test.tsx ViewMenu.test.tsx` — passed: 14 tests.
- `just fmt` — passed.
- `just typecheck` — passed.
- `just archtest` — passed. Its CGO-free subcommand emitted a sandbox cache
  write warning but the recipe exited 0 and the architecture checks completed.

## Fresh package build — observed, but not completable

After the development window was closed, its Wails development runner removed
the executable from the shared `build/bin/GoMarkEdit.app` path. A second fresh
`just build` after the dev runner stopped completed successfully and produced:

`build/bin/GoMarkEdit.app/Contents/MacOS/GoMarkEdit`

The executable existed and was mode `0755` immediately after that build.
However, a prior GoMarkEdit process remained running for more than 52 minutes
after its native window had closed. macOS routed the new bundle launch to that
headless process. Native accessibility capture of the package then timed out
three times, and the controller could not deliver the native Quit shortcut
without a fresh accessibility tree. The package's actual controls, native
movement/resize/close, and package-local network inspection therefore were not
observed in this attempt.

The identified stale development process was then terminated gracefully and the
package was rebuilt once more. The fresh signed package launched, but its
native controller could not capture the window: macOS returned
`ScreenCaptureKit.SCStreamErrorDomain -3811` (`Failed to start stream due to
audio/video capture failure`). Consequently the controller could neither read
the package accessibility tree nor send package controls. This is a current
host capture-service failure, not package-control evidence.

The native controller also returned no screenshots for the real Wails window.
No screenshot is retained or claimed. It did not expose webview root
`data-theme`/`data-mode` attributes or window bounds, so this attempt cannot
claim root-attribute proof, the exact 1280/768/375 matrix, no-page-scroll
geometry, contained tab-strip scroll bounds, or packaged 375-pixel evidence.

## T093 verdict

**Not complete.** The real development controls above are valid fresh partial
evidence, but the missing fresh packaged-app controls/screenshots and exact
responsive matrix are named T093 acceptance proof. The task remains unchecked
until the current host's ScreenCaptureKit capture service can expose the fresh
package window and the complete package walkthrough can be repeated.
