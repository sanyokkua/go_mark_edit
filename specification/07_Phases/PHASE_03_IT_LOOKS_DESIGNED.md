# Phase 03 — It looks like a real app, not a web page

## What you get

The window has real chrome: a title bar, a menu bar, a place for tabs, a collapsible sidebar you can
drag to resize, a split you can drag to rebalance, and a status bar that tells you where you are. When
something goes wrong you get a message that says what to do about it. There is a Settings dialog with
its groups laid out, and the app remembers how you left it.

Nothing new *does* anything yet. This phase is about what surfaces exist to put things on, and how
they behave when they are empty, busy, or broken.

## Build it in this order

1. **The window itself.** Whether GoMarkEdit draws its own title bar or uses the platform's, and — on
   macOS — the native application menu. This is not cosmetic: a WebKit webview routes Cmd+C, Cmd+V,
   Cmd+A and Cmd+Z through the native Edit menu, so a text editor without one cannot copy and paste.
   Settled by ADR-0028; build it first because everything else sits inside the answer.
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
8. **The Settings dialog shell.** The dialog and its group navigation, with the groups present and
   mostly empty. Every later phase drops its own controls in. Appearance is the only group with real
   content at the end of this phase, plus a Reset to defaults that works.
9. **Menu quick-settings.** The Settings menu in the title bar exposes the most-used controls inline —
   theme swatches, appearance, and later the default open mode, Markdown standard, and the Autosave /
   Format-on-save / Lint-on-save toggles — plus "All settings…". This is a *second view of the same
   state*, not a second store: change it in either place and both update.
10. **Remember the window.** Window geometry, sidebar visibility and widths, and the split ratio are
    owned by the backend (`SetUILayout`), persisted when they change, flushed on close, and **restored
    before the window is shown** so it never appears at a default size and then jumps. Last writer
    wins across several open windows.

## Also fix here

- **Test the real shell.** `frontend/src/App.test.tsx` mocks `AppShell` and then asserts on the mock,
  so a lost region or content leaking into the reserved assistant slot passes today. Since this phase
  rebuilds the chrome, prove it with a test that renders the real component
  (`docs/KNOWN_ISSUES.md` §4).

## Where the details are

- Behaviour: `01_Product/11_SETTINGS.md` (the groups, their defaults and ranges, the two synchronized
  settings surfaces, Reset, and EC-SET-5/6/7 for window state),
  `01_Product/20_NOTIFICATIONS_AND_EMPTY_STATES.md`,
  `01_Product/02_EDITOR_AND_VIEWER_MODES.md#status-bar` and `#split-view`
- Window and layout state: `02_Architecture/05_STATE_AND_PERSISTENCE.md#window-state`, DD-60, DD-61,
  DD-74, ADR-0013
- Window chrome and the native menu: ADR-0028, `02_Architecture/04_WAILS_INTEGRATION.md`
- What it looks like: `mockups/gomarkedit-mockup.html` — `editor-split`, `menu-file`, `menu-settings`
  (build the quick-settings menu from this one), `toasts`, `settings-appearance`, `no-sidebar`, the
  empty-state screens, and the 375/768 narrow states
- Component layering: `02_Architecture/03_FRONTEND_REACT.md#structure`

## Questions to settle first

None blocking — ADR-0028 settles the window chrome and
`01_Product/20_NOTIFICATIONS_AND_EMPTY_STATES.md` settles the notification model before this phase
starts. One call to make as you go: the mockup draws macOS traffic lights in its title bar. If ADR-0028
chose native chrome, delete them from the mockup rather than reproducing them on Windows and Linux
where they are wrong.

## Done when

Open the app on a machine where you have never run it. It appears at a sensible size, already in your
theme, with no tabs — and the empty screen offers you something to do rather than a blank pane. Drag
the sidebar and the split divider, collapse the sidebar, resize the window, quit, and reopen: it comes
back exactly the way you left it, without flashing a default layout first. Open the Settings dialog,
see its groups, change the theme from the Settings *menu* instead, and watch both surfaces agree.
Press Reset to defaults and get the defaults. Trigger the same error five times and get one message,
not five. Narrow the window to 375 pixels and find that everything is still reachable — nothing has
been clipped, and the toolbar overflowed rather than growing. On macOS, select text and press Cmd+C.
