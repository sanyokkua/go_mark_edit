# Phase 03 — It looks like a real app, not a web page

## What you get

The window has real chrome: a title bar, a menu bar, a place for tabs, a collapsible sidebar you can
drag to resize, a split you can drag to rebalance, and a status bar that tells you where you are. When
something goes wrong you get a message that says what to do about it. There is a Settings dialog with
its groups laid out, and the app remembers how you left it.

Nothing new _does_ anything yet. This phase is about what surfaces exist to put things on, and how
they behave when they are empty, busy, or broken.

## Build it in this order

1. **The window itself.** GoMarkEdit draws its own title bar, and — on macOS — installs the native
   application menu. This is not cosmetic: a WebKit webview routes Cmd+C, Cmd+V, Cmd+A and Cmd+Z through
   the native Edit menu, so a text editor without one cannot copy and paste. Settled by ADR-0028; build
   it first because everything else sits inside the answer.

   Going frameless means the app owns four things the platform would otherwise give it, and all four
   land here:
   - **The drag region.** The title bar is `--wails-draggable: drag` plus `-webkit-app-region: drag`,
     and **every interactive child sets both to `no-drag`** or it cannot be clicked at all.
   - **Double-click to maximise.** On the drag region only, via `WindowToggleMaximise`.
   - **Eight resize zones.** A 6-pixel band on each edge and a 12-pixel corner square, with the matching
     resize cursor, above the content and below every overlay, inert while maximised or full screen.
   - **A minimum size** of 375 × 480, as `MinWidth`/`MinHeight`.

   `../spec/product/the-app-window.md#the-window-has-its-own-resize-zones` and the three rules around it
   specify all of it. **Every one of these has to be checked on all three platforms in Phase 08**, because
   this is precisely the part Wails does not do for us — see `KNOWN_ISSUES.md` §13. A zone that works in
   `wails dev` on macOS tells you nothing about Windows.

2. **The chrome shells.** Title bar, menu bar, tab strip, sidebar slot, and the status bar — styled,
   empty, and correct at 375, 768 and 1280 pixels wide. They hold nothing yet; later phases fill them.
   The formatting toolbar Phase 04 adds has sixteen buttons, so decide the overflow behaviour now: an
   overflow menu, not a bar that grows taller and pushes the document down.
3. **The status bar, specified.** What it shows, which parts you can click, and what drops first when
   the window is narrow. It already exists from Phase 01; this is where it becomes a defined surface
   rather than whatever fitted.
4. **Things you can drag.** The sidebar edge and the editor/preview divider. The width keys are
   already persisted — there is currently no way for a user to set them.
5. **The reusable pieces.** Dialog, dropdown menu, context menu, tooltip, switch, select, and a
   progress/busy indicator. Built on Radix for behaviour, styled from tokens only.
6. **Telling the user things.** Toasts and inline banners: how many stack, in what order, how long
   each severity lasts, and — the one that matters — how repeats are collapsed. Autosave is on by
   default; a success toast per save means a toast every few seconds while typing. Every error code
   gets a written title and a sentence saying what to do, in `en.json` from the start.
7. **Empty states.** No tabs open, empty workspace tree, filter matched nothing, no recent files, no
   lint findings. Each is a written string, not a blank rectangle. The no-tabs one is the first screen
   of every launch — the app does not restore your session — so it is a launcher: New file, Open file,
   Open folder, and your recent documents.
8. **Expand the Settings dialog shell.** Phase 02 already ships the minimum dialog with real Appearance
   controls. Add the complete group navigation, leave later groups mostly empty, and add Reset to
   defaults without replacing the existing Appearance state path.
9. **Expand menu quick-settings.** Keep Phase 02's theme swatches and appearance controls in the new
   title-bar Settings menu, then add the default open mode, Markdown standard and Autosave /
   Format-on-save / Lint-on-save controls plus "All settings…". This remains a _second view of the same
   state_, not a second store: change it in either place and both update.
10. **Remember the window.** Window geometry, sidebar visibility and widths, and the split ratio are
    owned by the backend (`SetUILayout`), persisted when they change, flushed on close, and **restored
    before the window is shown** so it never appears at a default size and then jumps. Last writer
    wins across several open windows.

## Also fix here

- **Test the real shell.** `frontend/src/App.test.tsx` mocks `AppShell` and then asserts on the mock,
  so a lost region or content leaking into the reserved assistant slot passes today. Since this phase
  rebuilds the chrome, prove it with a test that renders the real component
  (`KNOWN_ISSUES.md` §4).

## Where the details are

- Behaviour: `../spec/product/settings.md` (the groups, their defaults and ranges, the two synchronized
  settings surfaces, Reset, and the window-state cases),
  `../spec/constraints.md`,
  `../spec/product/writing-in-the-editor.md#status-bar` and `#split-view`
- Window and layout state: written through on every change, last-writer-wins by change time
  (`../spec/product/the-app-window.md#layout-persists`, `../adr/0013-window-ui-layout-state.md`);
  panes are draggable and their sizes persist
- Window chrome and the native menu: ADR-0028, `../architecture/rules.md#handler-returns-a-result`
- The frameless window's own chrome — drag region, double-click-to-maximise, resize zones, minimum size:
  `../spec/product/the-app-window.md#the-title-bar-is-the-drag-region`,
  `#double-clicking-the-title-bar-toggles-maximise`, `#the-window-has-its-own-resize-zones`,
  `#the-window-has-a-minimum-size`
- What it looks like: `../spec/surface/mockup.html` — `editor-split`, `menu-file`, `menu-settings`
  (build the quick-settings menu from this one), `toasts`, `settings-appearance`, `no-sidebar`, the
  empty-state screens, and the 375/768 narrow states
- Component layering: `../architecture/structure.md`
- Prior ownership: Phase 02 supplies the minimum Appearance dialog and Settings-menu controls; this
  phase expands their shells and adds Reset and the remaining quick settings.

## Questions to settle first

None blocking — ADR-0028 settles the window chrome and
`../spec/constraints.md` settles the notification model before this phase
starts. One call to make as you go: the mockup draws macOS traffic lights in its title bar. If ADR-0028
chose native chrome, delete them from the mockup rather than reproducing them on Windows and Linux
where they are wrong.

## Done when

Open the app on a machine where you have never run it. It appears at a sensible size, already in your
theme, with no tabs — and the empty screen offers you something to do rather than a blank pane. Drag
the sidebar and the split divider, collapse the sidebar, resize the window, quit, and reopen: it comes
back exactly the way you left it, without flashing a default layout first. Open the Settings dialog,
see its groups, change the theme from the expanded Settings _menu_ instead, and confirm the Phase 02
controls still agree after their shells were expanded.
Press Reset to defaults and get the defaults. Trigger the same error five times and get one message,
not five. Narrow the window to 375 pixels and find that everything is still reachable — nothing has
been clipped, and the toolbar overflowed rather than growing. On macOS, select text and press Cmd+C.

Then work the window chrome itself, because the platform is not providing any of it. Drag empty title-bar
space and the window moves; click File and the menu opens without the window moving; double-click empty
title-bar space and it maximises, again and it restores. Put the pointer on each of the four edges and
each of the four corners and get eight resize cursors, then drag each one. Click a button that sits near
an edge and confirm the resize zone did not eat the click. Drag the window as small as it goes and read
375 × 480. Maximise, run the pointer along the edges, and confirm the cursor stays normal. Then repeat
the whole paragraph on Windows and on Linux in Phase 08 — `KNOWN_ISSUES.md` §13 says why passing on one
platform predicts nothing about the other two.

And the constraints every phase carries: every new surface works in three themes across light and dark;
every new control is reachable by keyboard alone with a visible focus ring; every new list has its
empty state with the exact wording; every new string goes through `t()`; make one thing fail three
times and confirm one toast with a count rather than three toasts; watch the network for five minutes
and confirm nothing is sent. All of it in a real build.
