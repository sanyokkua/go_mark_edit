# Phase 02 — It looks designed instead of unstyled

## What you get

The app stops looking like an unstyled web page and starts looking like the mockup. You can pick one
of three themes — Liquid Glass, Material, Minimal — in light, dark, or following the system. The
window has real chrome: a title bar, a menu bar, a place for tabs, a collapsible sidebar slot, and the
status bar it already had, all in the right colours.

Nothing new *does* anything yet. This phase is entirely about how the app looks and what surfaces
exist to put things on.

## Why now, and not later

`frontend/src/ui/styles/tokens.css` has 62 tokens and not one of them is a colour. Every surface built
before the palette exists gets restyled afterwards, and reading mode — which is defined as hiding the
sidebar, tabs, toolbar, menu bar and status bar — cannot be built or demonstrated until those exist.

## Build it in this order

1. **The palette.** Real colour tokens for the three themes across light and dark, driven by
   `data-theme` × `data-mode` on the document root. Take the values from the mockup; it already
   commits to a per-mode palette including code colours.
2. **Auto follows the system.** An Auto appearance that resolves to light or dark and changes live
   when the OS does, without a restart.
3. **The chrome shells.** Title bar, menu bar, tab strip, sidebar slot, and the existing status bar —
   styled, empty, and correct at 375, 768 and 1280 pixels wide. They hold nothing yet; later phases
   fill them.
4. **The reusable pieces.** Dialog, dropdown menu, context menu, toast, tooltip, switch, select. Built
   on Radix for behaviour and accessibility, styled from tokens only. Toasts need their stacking and
   dismissal defined here, not improvised later.
5. **The Settings dialog shell.** The dialog and its group navigation, with the groups present and
   mostly empty. Every later phase drops its own controls in. Appearance and Theme are the only groups
   with real content at the end of this phase.
6. **Menu quick-settings.** The Settings menu in the title bar exposes the most-used controls inline —
   theme swatches, appearance, and later the default open mode, Markdown standard, and the Autosave /
   Format-on-save / Lint-on-save toggles — plus "All settings…". This is a *second view of the same
   state*, not a second store: change it in either place and both update.
7. **Remember the window.** Window geometry and sidebar visibility are owned by the backend
   (`SetUILayout`), persisted when they change, flushed on close, and **restored before the window is
   shown** so it never appears at a default size and then jumps. Last writer wins across several open
   windows.

## Also fix here

- **Test the real shell.** `frontend/src/App.test.tsx` mocks `AppShell` and then asserts on the mock,
  so a lost region or content leaking into the reserved assistant slot passes today. Since this phase
  rebuilds the chrome, prove it with a test that renders the real component
  (`docs/KNOWN_ISSUES.md` §4).

## Where the details are

- Behaviour: `01_Product/10_THEMING.md`, `01_Product/11_SETTINGS.md` (the groups, their defaults, the
  two synchronized settings surfaces, and EC-SET-5/6/7 for window state)
- Window and layout state: `02_Architecture/05_STATE_AND_PERSISTENCE.md#window-state`, DD-60, DD-61,
  ADR-0013
- What it looks like: `mockups/gomarkedit-mockup.html` — the theme switcher at the top drives every
  screen; see especially `tokens`, `editor-split`, `menu-file`, `menu-settings` (build the
  quick-settings menu from this one), `toasts`, `settings-appearance`, `no-sidebar`
- How theming works: `logic/theme/` (`resolveEffectiveTheme`, `applyTheme`, `watchSystemTheme`),
  DD-28…DD-30
- Component layering: `02_Architecture/03_FRONTEND_REACT.md#structure`

## Questions to settle first

None blocking. The mockup already fixes the palette; take the values from it rather than inventing
them, and record any value the mockup does not cover in `01_Product/10_THEMING.md` as you go.

## Done when

Open the app, switch between all three themes in light and dark, and watch it change immediately with
no reload and no unstyled flash. Set appearance to Auto, change the OS between light and dark, and see
the app follow. Every region of the window is in the right colours at 375, 768 and 1280 pixels. Open
the Settings dialog and see its groups, then change the theme from the Settings menu instead — both
surfaces agree. Resize the window, collapse the sidebar, quit, and reopen: it comes back the way you
left it, without flashing a default layout first. Nothing anywhere is a browser default.
