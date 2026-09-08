# Editor-stage live evidence

Captured 2026-08-04.

## Browser journey

The real bridge was started with `just dev`; it printed `http://localhost:34115`. Opening that URL in the
in-app browser connected to the Wails development bridge. Its captured console activity contained only the
local runtime IPC handshake. The documented `just dev-ui` mock bridge remained the Playwright test target,
as required by the repository configuration.

Real-bridge checks at 1280px confirmed the exact File/Settings/View/About inventories, acknowledged editor
settings, arrangement/sidebar controls, toolbar Bold with a real textarea selection, one-step undo, the
exact context-menu inventory, and the repaired context-menu Bold path. Toolbar Bold changed `hello` to
`**hello**`; Cmd/Ctrl+Z restored `hello`; context-menu Bold also produced `**hello**` after the pointer-dismiss
repair.

Manual live checks on the mock development UI:

- At the default 1280px viewport, the root reported `data-theme="material"` and `data-mode="light"`.
- Settings opened below its trigger at `x=8, y=53`, with a `480x656` internally scrollable popup; it no
  longer covered the top menu row. Line numbers, word wrap, and font size 16 were changed and remained
  acknowledged in the visible controls.
- Typing `hello`, selecting it, clicking Bold produced `**hello**`; one undo restored `hello` and retained
  the editor focus/selection path.
- The context menu showed exactly Cut, Copy, Paste, Paste as plain text, Bold, Italic, Link, Format
  document (disabled), Compact (disabled), and Command palette. Lint and Heading/list/Quote/Table were not
  present in that surface.
- View showed Editor/Split/Preview, Toggle Sidebar, disabled Toggle Assistant, Line numbers, Word wrap,
  disabled Distraction-free reading, and Full screen. The View sidebar item and the toolbar Toggle Sidebar
  both changed the acknowledged left workspace state.
- At 375px, the page width and body scroll width were both `375`; the tab strip was `512px` wide inside a
  `351px` viewport with `overflow-x: auto`. Top-level actions moved into the More actions menu and the
  toolbar remained reachable without page-level horizontal scroll.

The real bridge repeated the root/overflow checks at all six light/dark palettes for 1280/768/375. Every
combination reported `body.scrollWidth === viewportWidth` and `body overflow-x: hidden`; at 375 the tab
strip alone reported `clientWidth=351`, `scrollWidth=512`, and `overflow-x: auto`. At 768 the relocated
list/link controls were exposed through the contained toolbar overflow. The current host later re-locked
during the separate native-binary walkthrough; that limitation is recorded in `editor-stage-native.md`.

No Assistant landmark/panel/provider, real file/tab lifecycle, file I/O, remote URL, or successful deferred
Format/Compact/Lint operation appeared during the journey.

## T054-T060 live rerun

After the convergence implementation batch, the refreshed local development UI at `http://127.0.0.1:4174/`
was reloaded and operated through visible controls:

- The editor received `hello`, the real selection was made, and toolbar Bold changed the authoritative
  editor content to `**hello**`; the Preview article rendered `hello` as strong text and the status remained
  at line 1, column 8.
- Settings opened from its single visible trigger. Turning Line numbers off was acknowledged in the same
  Settings menu, the line-number glyph disappeared from the editor, and the editor content/selection stayed
  in place.
- The localized top-level About trigger displayed `About`; its open menu displayed the longer localized
  label `About GoMarkEdit`.
- The complete Playwright run passed 54/54: the existing 27 T019 reachability cases and 27 T055 cases over
  1280/768/375 widths and Liquid Glass/Material/Minimal × system/light/dark palettes. It observed no
  unexpected requests, no page-level horizontal overflow, and retained only contained tab-strip scrolling
  at 375px.

## Convergence live recheck

After the T043-T047 source repair and reload, the real-bridge browser exposed Markdown standard as a disabled
`menuitem` with the visible text `Markdown standard: GFM (Minimal · GFM · Full)`, no Markdown-standard
combobox, and no active renderer options. A click attempt timed out on the disabled item and the following
snapshot remained unchanged; the actual Bullet marker, Emphasis marker, and Heading style controls remained
the only active Markdown controls. The complete Playwright matrix then passed 27/27 cases, preserving the
approved page-level no-scroll boundary and contained visual tab-strip scrolling at 375px.

## T062 fresh browser matrix

The official `npm run verify:ui -- e2e/editor-stage.test.ts --reporter=line` run was executed from `frontend/`
with one Playwright worker and completed 54/54 cases. It covered the 1280, 768, and 375 pixel viewports over
Liquid Glass, Material, and Minimal in system/light/dark modes. The journeys retained local-only request
instrumentation, no page-level horizontal overflow, contained tab-strip scrolling only at 375, reachable
responsive controls, and unavailable/non-mutating deferred actions.

## T068 icon-first live rerun (2026-08-05)

The reloaded local development UI was operated at 1280, 768, and 375 pixels. At 1280 the toolbar exposed
the symbol-first controls with localized accessible names and tooltips; Format, Compact, Lint, Image, and
Assistant remained visibly unavailable. At 768 the contained `More actions` popup exposed Bullet, Numbered,
Task, Quote, Link, Image, and Table within the viewport. At 375 it also exposed text, heading, and
arrangement controls; the document width did not exceed the viewport and only the visual tab strip scrolled.

Settings then exercised Liquid Glass, Material, and Minimal in both Light and Dark mode. Every observed root
state carried the matching theme/mode pair and retained `scrollWidth <= viewportWidth`. The focused component
suite covering icon metadata, labels/tooltips, active arrangement state, disabled state, keyboard focus, and
overflow dismissal passed, followed by the full 54-suite/253-test repository run.

## Phase 13 responsive and popup completion rerun (2026-08-05)

The T069 hierarchy matrix passed all 27 width, palette, and mode cases, retaining the required navigation,
tab strip, toolbar, pane/status hierarchy, disabled decorative tabs, and no page-level horizontal overflow.
The T070 popup matrix passed all 27 corresponding cases: Settings, File, View, and About remained owned by
their opener, stayed within the viewport, dismissed on Escape/outside interaction, and did not leave a
competing popup behind. At 768 and 375 pixels the visual tab strip used contained scrolling and the toolbar
used the `More actions` overflow without widening the page. The local development UI was also operated
directly at all three widths while switching all three themes and both modes.

## T076 deferred Command palette live check (2026-08-05)

The real Wails development bridge at `http://localhost:34115` was opened and its Editor context menu was
operated directly. It retained the exact ten-item inventory and separators; Command palette remained present
but was disabled beside the already unavailable Format document and Compact rows. From About → Keyboard
shortcuts, the same registry entry appeared as Window-scoped, with the localized `This action is not available
in this slice.` status and no shortcut binding. No search, quick-open, command-palette UI, backend route,
file action, network request, or successful action outcome appeared.
