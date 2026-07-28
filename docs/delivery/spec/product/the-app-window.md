# The app window

## What it's for

Everything else in the product sits inside this window, so its behaviour is felt constantly and noticed
only when it is wrong: a window that forgets its size, a sidebar that reopens after you closed it, a
copy-and-paste that does nothing. This is also where the app's three-region shape is fixed — file tree
on the left, documents in the middle, assistant on the right — and getting that wrong early would mean
rebuilding every screen when the assistant arrives.

## What you can do

Launch the app and you get a window with a title bar the app draws itself, carrying the app identity,
the document breadcrumb, the menu bar — File, View, Settings, About — and a few quick actions. Window
controls sit where your platform puts them.

Drag the title bar to move the window, double-click it to maximise and double-click again to restore.
Drag any edge or corner to resize, down to 375 × 480 pixels and no smaller. The app draws those resize
zones itself, because a frameless window does not reliably get the platform's.

`Ctrl/Cmd+\` shows and hides the file sidebar. `F11` goes full screen. `Ctrl/Cmd+Shift+N` opens a
second window; several windows can be open at once and they are separate processes.

The window remembers its size, whether it was maximised, whether the sidebar was showing and how wide
it was, and which view arrangement you were in. It does not remember which documents were open — every
launch starts with the launcher screen.

## Rules

### The window is frameless and the title bar is ours {#frameless-window}
- The window has no platform title bar. The app draws its own on all three platforms, styled entirely
  from tokens, and it is the window's drag region.
- The title bar carries the app identity, the document breadcrumb, the in-window menu bar and the quick
  actions.

Examples: Liquid Glass's translucent rounded window extends to the top edge · a platform title bar → a
hard-coded surface that cannot take a token, so two of the three themes would stop at the window edge.

### The title bar is the drag region, and its children opt out {#the-title-bar-is-the-drag-region}
- The title bar element carries both `--wails-draggable: drag` and `-webkit-app-region: drag`. Dragging
  anywhere on it moves the window.
- **Every interactive child inside the title bar sets both properties to `no-drag`** — the menu buttons
  (File, View, Settings, About), the window controls, the sidebar toggle, the assistant toggle, and the
  document breadcrumb. A child that does not is unclickable: the drag starts before the click lands.
- Nothing outside the title bar is draggable.

*Avoid:* marking the whole window or the app frame draggable. It moves the window when the user tries to
select text, and text becomes unselectable everywhere.

Examples: press and drag on empty title-bar space → the window moves · click File → the menu opens and
the window does not move · a new quick-action button added without `no-drag` → it looks enabled, and
clicking it does nothing at all.

### Double-clicking the title bar toggles maximise {#double-clicking-the-title-bar-toggles-maximise}
- **When** the drag region is double-clicked and the window is normal, the window maximises, via
  `WindowToggleMaximise`.
- **When** the drag region is double-clicked and the window is maximised, it restores to its previous
  size.
- **If** the double-click lands on a `no-drag` child, **then** nothing happens — a double-click on the
  File button is two clicks on the File button.

Examples: double-click empty title-bar space on a 1280×800 window → maximised · double-click again →
back to 1280×800 · double-click the breadcrumb → the window is unchanged.

### The window draws its own resize zones {#the-window-has-its-own-resize-zones}
- The app frame carries eight resize zones: a **6-pixel** band along each of the four edges, and a
  **12-pixel** square at each of the four corners.
- **While** the pointer is over a zone, the cursor is the matching resize cursor — `ns-resize`,
  `ew-resize`, `nwse-resize` or `nesw-resize`.
- **When** a zone is dragged, the window resizes from that edge or corner.
- The zones sit **above the content and below every overlay** — above the editor and the sidebar, below
  dialogs, menus, toasts and the drop overlay.
- **While** the window is maximised or full screen, the zones are inert and the cursor does not change.

*Why the app owns this:* a frameless Wails window does not reliably get OS resize borders.
[wails#1062](https://github.com/wailsapp/wails/issues/1062) — on Windows a frameless window can have no
resize controls at all. [wails#1087](https://github.com/wailsapp/wails/issues/1087) — where they do
exist, the resize cursor appears too far inside the window and swallows clicks on controls near the
edge. Drawing our own zones is the only way all three platforms behave the same.

Examples: pointer 4 px from the right edge → `ew-resize`, and dragging widens the window · pointer 8 px
from the right edge → the normal cursor, and a click reaches the control under it · pointer 10 px from
the bottom-right corner → `nwse-resize`, because the corner square is 12 px · exactly 6 px from an edge
→ still the resize cursor, because the band is 6 px wide inclusive · maximised, pointer on the edge →
the normal cursor, and dragging does nothing.

### The window has a minimum size {#the-window-has-a-minimum-size}
- The window's minimum size is **375 × 480 pixels**, set as `MinWidth: 375` and `MinHeight: 480` in the
  Wails options.
- **When** a resize would take the window below either value, it clamps there.

*Why these two numbers:* 375 is the narrowest width the mockup verifies, so below it no layout has been
designed. 480 is the height at which the title bar, one toolbar row, a usable editor and the status bar
are all still visible; below that the editor is the first thing to disappear.

Examples: drag the corner in as far as it goes → 375 × 480 and no further · a saved 320 × 400 from an
older build → opens at 375 × 480 · no minimum → the window collapses to a title bar with no document.

### Window controls follow the platform {#platform-window-controls}
- On macOS the close, minimise and zoom controls are on the **left**, in macOS order.
- On Windows and Linux the minimise, maximise and close controls are on the **right**.
- They are one component with a platform variant, not a decoration.

Examples: the same build on macOS and on Windows → controls on opposite sides · traffic lights
everywhere → wrong on two of three platforms.

### macOS gets a native application menu as well {#macos-native-menu}
- On macOS the app installs a native application menu carrying at minimum the standard **App** role
  (About, Services, Hide, Quit) and the standard **Edit** role (Undo, Redo, Cut, Copy, Paste, Select
  All).
- On Windows and Linux no native menu is installed.
- An item that appears in both the native menu and the in-window menu bar dispatches through the **same**
  registry entry. There is one action per command and two views of it.

Examples: `Cmd+C` in the editor on macOS → copies · no native menu on macOS → the webview routes
`Cmd+C`, `Cmd+V`, `Cmd+X`, `Cmd+A`, `Cmd+Z` and `Cmd+Shift+Z` through an Edit menu that does not exist,
so the editor has no working clipboard and no working undo.

*Why this is easy to miss:* the failure is invisible in `wails dev` on a machine where another
application has already put an Edit menu up, and invisible on Windows and Linux entirely.

### The shell has three regions and the right one is reserved {#three-region-shell}
- The window body is a left region (the file tree), a centre region (the document area) and a right
  region (the assistant).
- **While** the assistant does not exist, the right region is present in the layout, collapsed to width
  `0` via `--shell-assistant-collapsed-width`, with its show and hide plumbing already in place.

Examples: adding the assistant later mounts one child and changes one token · adding a third column at
that point → every layout test and every responsive check written before then has to be redone.

### The layout is persisted, written through on every change {#layout-persists}
- These values persist across sessions and across windows: the window size, whether the window is
  maximised, sidebar visibility and width, the view arrangement, individual pane visibility, and once
  the assistant exists, assistant sidebar visibility and width.
- **When** a discrete change happens — a sidebar toggled, an arrangement switched — it is written
  immediately.
- **When** a continuous change happens — a window resize, a divider drag — writes are debounced, and the
  pending write is flushed when the window closes.
- The store holds the **last value only**. There is no history.

Examples: hide the sidebar, force-quit the app, relaunch → the sidebar is hidden · resize the window and
close it normally → the final size is stored, not the size mid-drag.

### The last window to change a layout value wins {#layout-last-writer-wins}
- Because every layout change is written the moment it happens, the stored value is always the one set
  by the window that changed it **most recently**.
- **When** a window closes, it flushes only its own pending debounced write. It never re-writes the whole
  layout.

Examples: window A hides its sidebar at 10:00, window B shows its sidebar at 10:05, window A closes at
10:10 → the sidebar is shown, because B changed it more recently · a window that re-wrote everything on
close → A would silently undo B's change five minutes later, and no user could work out why.

### The window is restored before it is shown {#restore-before-show}
- **When** the app launches or a new window opens, the saved layout is applied **before** the window
  becomes visible.
- **If** a saved value is missing or out of range, **then** the default is used and the app starts
  normally.

Examples: launching with a saved 1440×900 → the window appears at 1440×900 · applying the size after the
window is visible → it appears at the default size and jumps, on every launch.

### Launch is clean {#launch-is-clean}
- No documents are reopened on launch. There is no session restore, no crash recovery and no swap file.
- Only the chrome layout is restored, never content.
- The user reopens work through **File → Open Recent** or **Reopen last file or folder**.

Examples: three documents open, quit, relaunch → the launcher screen, with those three at the top of
Recent · a restored session → the app has to decide what to do about a file that moved, changed or was
deleted since, and every one of those answers is wrong for somebody.

### The launcher is the first screen of every launch {#the-launcher-screen}
- **While** no document is open, the document area shows a launcher, not a blank pane:

  > **GoMarkEdit**
  > New file · Open file… · Open folder…
  > *Recent* — the six most recent documents and folders, each with its containing folder beneath it.

- **If** there are no recent entries, **then** the recent section reads `Documents you open will appear
  here.`

Examples: a first run → the launcher with the empty-recent line · a returning user → the launcher with
six entries.

*Why it matters more than it looks:* there is no session restore, so this is what the user sees on
**every** launch. It is the most-seen screen in the product.

### Several windows run at once {#multiple-windows}
- `Ctrl/Cmd+Shift+N` opens a new window. Each window is a separate process.
- There is no single-instance lock and no "already running" dialog.
- The windows share one settings database, opened in WAL mode with a 5-second busy timeout, so
  concurrent writes are safe.

Examples: two windows both changing a setting at the same moment → the second waits and succeeds · a
lock → opening two files side by side, which is the reason people open the app twice, stops working.

### Full screen is `F11` on every platform {#full-screen}
- `F11` toggles full screen and has no modifier, on all three platforms.
- **While** full screen is active, the resize zones and the drag region are both inert — there is no
  edge to drag and nothing to move the window to.

Examples: `F11` on macOS, Windows and Linux → the same thing · full screen, pointer on the screen edge →
the normal cursor · full screen, double-click the title bar → nothing happens.

### The About dialog names the build {#about-shows-the-version}
- The About dialog shows the application version, which comes from `internal/settings.AppVersion`.
- A build without a version injected at link time reports exactly `dev`.

Examples: a release build from tag `v1.2.0` → `1.2.0` · `just build` on a developer machine → `dev` · a
hand-maintained version constant → not permitted anywhere, because it disagrees with the tag the moment
someone forgets to bump it.

## What it looks like

- The launcher, no document open — `../surface/mockup.html#material-light/empty`
- Sidebar collapsed — `../surface/mockup.html#material-light/no-sidebar`
- Assistant region collapsed — `../surface/mockup.html#material-light/no-assistant`
- The reserved but empty assistant region — `../surface/mockup.html#material-light/assistant-reserved`
- The View menu — `../surface/mockup.html#material-light/menu-view`
- The About menu — `../surface/mockup.html#material-light/menu-about`
- The About dialog — `../surface/mockup.html#material-light/about`

## When things go wrong

| Situation | What the user sees | What they can do |
|---|---|---|
| The settings database cannot be opened at startup | A dialog: `GoMarkEdit could not start` · `GoMarkEdit could not initialize its local settings. Please try again.` | Retry; if it persists, check the app's configuration folder |
| A saved window size is larger than the current display | The window opens at the display's usable size | Nothing |
| A saved layout value is corrupt | The default for that value; the rest of the layout is applied | Nothing |
| Another window changed a setting while this one was open | This window picks it up on its next read; there is no live push between windows | Nothing |

## Edge cases

**Two windows change the sidebar in opposite directions**
- *Trigger:* window A hides the sidebar, then window B shows it, then A closes.
- *Expected:* the stored value is "shown". A's close flushes only A's own pending debounced writes.
- *Avoid:* writing the whole layout on close, which lets a window that closes later clobber a value
  another window changed more recently.

**The app is quit while a window resize is still being debounced**
- *Trigger:* the user drags the window edge and immediately presses `Cmd+Q`.
- *Expected:* the pending write is flushed before the process exits, so the final size is stored.
- *Avoid:* closing the database before the flush runs, which writes to a closed handle and silently
  loses the size on every quit.

**A saved window position is off-screen**
- *Trigger:* the app was last used with an external display that is no longer connected.
- *Expected:* the window opens on the primary display at a usable size.
- *Avoid:* restoring coordinates that put the window where the user cannot see it.

**The last document is closed**
- *Trigger:* the user closes the only open tab.
- *Expected:* the launcher appears, with the just-closed document at the top of Recent.
- *Avoid:* an empty grey document area with no next action.

**Quitting with several modified documents**
- *Trigger:* `Cmd+Q` with four documents modified.
- *Expected:* one dialog listing all four by name, with Save all, Discard all and Cancel — not four
  dialogs in a row.
- *Avoid:* prompting per document, which is four decisions where one was enough, and unrecoverable if
  the user clicks through.

## Not this

- **No session restore, no crash recovery, no swap files.** See `#launch-is-clean`.
- **No single-instance lock.** Opening two files side by side is done by opening the app twice, and a
  lock removes that with no replacement.
- **No native title bar.** A platform title bar is a hard-coded surface that cannot take a design token,
  so two of the three themes would stop at the window edge.
- **No native menu on Windows or Linux.** The in-window menu bar is the convention there, and a second
  surface would be a second thing to keep in sync for no benefit.
- **No auto-update, and no update check.** The app never contacts anything the user did not ask it to;
  see `../constraints.md#nothing-leaves-the-device`.
- **No live layout push between windows.** Windows are separate processes and the store is the shared
  state; pushing changes between them would need an IPC channel this product has no other use for.

## Decisions

- *2026-07-25* — The window is frameless with a custom title bar on all three platforms, **and** macOS
  additionally gets a native application menu for the App and Edit roles. Recorded in
  `../../adr/0028-window-chrome-and-native-menu.md`. The mockup's traffic lights became the macOS variant
  of one component rather than a universal decoration.
- *2026-07-23* — Layout state is written through on every change, last-writer-wins by change time rather
  than by close order. Recorded in `../../adr/0013-window-ui-layout-state.md`.
- *2026-07-28* — **The app draws its own resize zones, rather than relying on the platform's.**
  `0028-window-chrome-and-native-menu.md` accepted that going frameless means owning "window dragging,
  double-click-to-zoom, snap behaviour and the resize edges", and the specification never said how. Wails
  issues [#1062](https://github.com/wailsapp/wails/issues/1062) and
  [#1087](https://github.com/wailsapp/wails/issues/1087) are why relying on the platform is not an option:
  on Windows a frameless window can have no resize controls at all, and where they exist the cursor
  changes too far inside the window and eats clicks on nearby buttons. Four rules were added — the drag
  region and its `no-drag` children, double-click-to-maximise, the eight resize zones, and the 375 × 480
  minimum. Recorded in `../../plan/KNOWN_ISSUES.md` §13 so nobody later "simplifies" by deleting them.

## Open questions

*(none — ready to build)*
