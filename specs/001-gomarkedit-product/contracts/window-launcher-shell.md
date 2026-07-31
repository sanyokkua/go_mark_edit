# Contract: Window and Launcher Shell

## Authority and scope

This contract copies the implementation-ready window-shell behavior needed from the product
specification and the visual mockup. On explicit task-batch approval it transfers FR-012 through FR-014
and the affected unmigrated shell portions of FR-001, FR-002, FR-004 through FR-007, FR-078, FR-079, and
the development-version subset of FR-080. It consumes the already delivered FR-015 through FR-017
appearance contract without re-owning it. Full FR-011 stays with the safe file lifecycle until its
actions are real.

The binding visual source is `../surface/mockup.html`. Behavior in this file wins where a specimen
shows a gallery, a future feature, one platform only, or a stale accelerator.

## Native window

- The window is frameless and token-themed on macOS, Windows, and Linux.
- It starts hidden at 1024 x 768 in normal state unless valid acknowledged size/maximized values exist.
- Minimum size is exactly 375 x 480. Each invalid/missing stored field falls back independently.
- The title area is the only drag region and carries both `--wails-draggable: drag` and
  `-webkit-app-region: drag`. Every interactive child sets both to `no-drag`.
- Double-clicking empty title space toggles maximize/restore. A no-drag child does not toggle.
- F11 toggles full screen on every platform. Drag and resize are inert in full screen.
- macOS controls are close/minimize/zoom on the left. Windows/Linux controls are
  minimize/maximize/close on the right. The mockup traffic lights are macOS-only.
- macOS installs native App and Edit roles. Windows/Linux install no native menu.
- The title area carries app identity and the current document title/breadcrumb when one exists.
- About shows the injected application version and shows exactly `dev` when no version is injected.

## Startup failure

- A settings-database startup failure keeps the normal shell hidden.
- The user sees `GoMarkEdit could not start` and
  `GoMarkEdit could not initialize its local settings. Please try again.` with Retry.
- Retry repeats initialization; success restores and shows the normal shell once. Repeated failure does
  not expose a raw error or private configuration path.

## Resize zones

- Four edge zones are 6 px bands; four corner zones are 12 x 12 px squares.
- Cursors are `ns-resize`, `ew-resize`, `nwse-resize`, or `nesw-resize` as applicable.
- Zones sit above content and below menus, dialogs, toasts, and overlays.
- Maximized/full-screen windows have no active zones and show the normal cursor at their edges.
- Begin-resize crosses the adapter through an allowlisted mapping to the pinned Wails desktop runtime.
  CSS-only imitation, direct component invocation, and weakening corners to 6 px are invalid.

## Shell and responsive states

- The shell reserves left workspace, centre document, and right Assistant regions. Before Assistant
  ships, its width is 0 and it contains no visible placeholder.
- Desktop sidebar default is the current tokenized width. A discrete show/hide change persists
  immediately; divider changes persist after 250 ms.
- At 768 px the Assistant stays hidden and the sidebar becomes a 46 px icon rail.
- At 375 px the Assistant stays hidden; the sidebar is a 230 px off-canvas overlay; centre panes stack;
  title menus move into overflow; toolbar stays one row; tabs scroll; no control is clipped.
- Responsive presentation does not overwrite durable desktop widths.
- Every state is checked at 375, 768, and 1280 in Liquid Glass, Material, and Minimal, light and dark.

## Durable layout

- Durable fields are native width, height, maximized state, sidebar visibility/width, and last-used
  arrangement fallback. Window position, document content/tab set, full-screen state, and responsive
  temporary widths are not durable.
- Appmodel owns acknowledged layout; Redux renders its projection.
- Discrete values write immediately. Continuous values write after 250 ms and flush before close.
- Each field carries original change time, writer ID, and sequence. SQLite conditionally accepts only a
  newer identity. Close flushes only pending fields and cannot overwrite a later change merely because
  its process closes later.
- A failed write retains the last acknowledged value and shows a classified notification. A stale
  conditional write reloads the newer value and is not an error.
- Layout is restored before first display and never reopens content.

## Actions, settings, and focus

- One registry supplies stable ID, localized label, scope, shortcut, availability, and invocation.
- Only actions with real consumers are visible/enabled. Modal Settings suppresses shortcuts behind it.
- The relative menu order follows the mockup: File, Settings, View, About. The shell-only batch omits
  File until a real file action exists; it must not render an empty menu or advertise a future command.
- The settings menu and modal render the same acknowledged Appearance state. The modal traps focus,
  closes on Escape, and restores focus to its opener.
- Reset affects delivered settings only and excludes window layout and future recents.
- Empty future setting groups and Assistant groups are not shown.
- Every control is keyboard reachable, has a localized role/name, and shows the delivered two-layer
  focus ring. Reduced motion collapses shell transitions without changing behavior.

## Notifications

- A completed event uses a toast; a condition that remains true uses an inline banner.
- Deduplication key is classified failure code plus subject. Repetition refreshes one toast and appends
  `×N` through localized formatting.
- At most three toasts are visible. A fourth displaces only the oldest non-error. Errors never
  auto-dismiss and are never evicted.
- Success/info/warning dismiss after 4/6/8 seconds. Automatic successful work remains silent.
- Toasts render above dialogs. Titles/remediation are localized and contain no raw error, secret, full
  remote URL, or private path.

## Launcher entry gate

The complete launcher has:

- zero open documents and no session restore;
- `GoMarkEdit`, New file, Open file, Open folder, and at most six recent documents/folders with their
  containing folders;
- exact empty-recent copy: `Documents you open will appear here.`;
- no fake entries, no partial document, and no effect or notification after picker cancellation;
- return to launcher when the last document closes.

It becomes implementable only with real safe lifecycle commands. The shell-only batch may preserve this
contract and prepare component boundaries, but must not claim FR-011, render enabled no-op actions, or
invent a disabled treatment that contradicts the binding mockup.

## Evidence obligations

- Go tests: Wails options/lifecycle, repository conditional writes, stale close, fallback, failure
  rollback, and real appmodel projection.
- Adapter/Jest tests: eight resize mappings, platform controls, one action registration, settings focus
  lifecycle, notification timing/dedup/eviction, and mock parity.
- Playwright: actual menus/settings/sidebar/notifications at all 18 width-palette combinations and no
  horizontal clipping.
- Current-platform native build: drag/no-drag, double-click, controls, full screen, all eight resize
  zones, 375 x 480 clamp, restore-before-show, and final close flush.
- Viewer release gate: repeat chrome and macOS Edit-role behavior on macOS, Windows, and Linux. One-host
  or Chromium evidence is not cross-platform completion.
