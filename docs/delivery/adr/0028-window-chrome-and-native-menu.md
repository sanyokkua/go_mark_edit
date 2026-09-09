# ADR-0028 — Draw our own title bar, and install a native application menu on macOS

**Status:** accepted
**Date:** 2026-07-25
**Deciders:** project owner, architect

> **Historical vocabulary — this record is not rewritten.** The `DD-…` and `EC-…` identifiers below cite the retired 78-entry design-decision registry, last present in git at `e1bd33f` under `specification/00_Foundation/` as `04_DESIGN_DECISIONS.md`; every one of those decisions now lives in the sentence of the feature file that needs it. Links into `_archive-2026-07-28-specification/` are the pre-conversion specification, kept so a citation still resolves, and **not normative**. See `README.md`. A decision record says what was decided against what was known then, so neither is translated forward.
> A link beginning `07_Phases/` names a retired phase document that was deleted rather than archived; that set is in git at `e1bd33f`.

## Context and problem statement

`mockups/gomarkedit-mockup.html` draws a title bar containing three macOS traffic-light dots, an
in-window menu bar (File / View / Settings / About), a document breadcrumb and a set of quick actions.
No specification document says whether that title bar is ours or the operating system's. The answer is
load-bearing and nothing downstream can be built without it: it decides whether the menu bar is a React
component or a platform menu, whether the mockup's dots are real or wrong on two of three platforms,
and how the window is dragged and resized.

There is a second, sharper problem hiding behind it. `menu.NewMenuFromItems` appears nowhere in the
specification, and the menu bar is listed only as a React widget
(`../../_archive-2026-07-28-specification/02_Architecture/01_MODULE_INVENTORY.md`, `../../_archive-2026-07-28-specification/02_Architecture/03_FRONTEND_REACT.md`). On macOS, WKWebView
routes **Cmd+C, Cmd+V, Cmd+X, Cmd+A, Cmd+Z and Cmd+Shift+Z through the native Edit menu**, not through
the DOM. A Wails application that installs no native menu therefore has no working clipboard and no
working undo inside its own editor, and no Cmd+Q. For a Markdown editor that is not a rough edge; it is
the product not working. The failure is invisible in `wails dev` on a machine where another app has
already put an Edit menu up, and it is invisible on Windows and Linux entirely.

## Decision drivers

- The mockup is the declared visual source of truth, and it shows a custom title bar with in-window menus.
- Three themes vary `--win-radius`, `--blur` and the title-bar treatment. A native title bar cannot take
  a design token, so two of the three themes would stop at the window edge.
- A text editor must be able to copy, paste and undo.
- Whatever we choose has to be right on Windows and Linux too, where traffic lights are wrong and the
  menu bar convention is in-window.
- DD-30: no component hard-codes a colour. A platform title bar is a hard-coded surface by definition.

## Considered options

- **A.** Native window chrome everywhere; no custom title bar; menus native on macOS, in-window elsewhere.
- **B.** Frameless window with a custom title bar everywhere; a React menu bar; no native menu at all.
- **C.** Frameless window with a custom title bar everywhere; a React menu bar as the visible surface;
  **plus** a native macOS application menu carrying the standard App and Edit roles.

## Decision outcome

Chosen: **C**.

Concretely:

- The window is **frameless** with a custom-drawn title bar on all three platforms, styled from tokens.
  It carries the app identity, the document breadcrumb, the menu bar and the quick actions, and it is
  the window's drag region.
- Window controls are **drawn by us and follow platform convention**: close/minimise/zoom on the left
  in macOS order on macOS, minimise/maximise/close on the right on Windows and Linux. The mockup's
  hard-coded traffic lights become the macOS variant of one component, not a universal decoration.
- On macOS the app **additionally installs a native application menu** containing at minimum the
  standard `AppMenu` (About, Services, Hide, Quit) and `EditMenu` (Undo, Redo, Cut, Copy, Paste,
  Select All) roles. It is not a second navigation surface — the user drives the app from the in-window
  menu bar — it exists so the webview's clipboard and undo accelerators resolve.
- Items that appear in **both** the native menu and the in-window menu bar dispatch through the **same
  shortcut registry** (Phase 04). There is one action per command; the two menus are two views of it.
- On Windows and Linux no native menu is installed.

### Consequences

- Positive: the window looks like the mockup in all six palettes, including its corners and its
  translucency. Copy, paste, undo and Cmd+Q work on macOS.
- Positive: the native/in-window duplication is bounded to two menu roles and cannot drift, because both
  render from one registry.
- Negative: we own window dragging, double-click-to-zoom, snap behaviour and the resize edges. These are
  Wails options rather than hand-written code, but they are ours to get right on three platforms.
- Negative: a frameless window is the kind of thing that behaves differently under a tiling window
  manager on Linux. Phase 08's release-candidate check has to actually open the window on each OS.
- Neutral: the mockup gains a platform variant of one component and loses its assumption that everyone
  is on macOS.

## Pros and cons of the options

### Option A — native chrome everywhere

- Good: nothing to own; correct by construction on every platform; the macOS menu problem solves itself.
- Bad: the mockup becomes wrong, and the three themes stop at the window edge — Liquid Glass in
  particular is defined by a translucent, rounded window that a native frame cannot express.

### Option B — frameless, React menus only

- Good: exactly the mockup; one menu implementation.
- Bad: **no clipboard and no undo on macOS.** This is disqualifying and is the whole reason this ADR
  exists rather than a line in a phase document.

### Option C — frameless, plus a native macOS menu _(chosen)_

- Good: the mockup's appearance with the platform's keyboard contract.
- Bad: two menu surfaces to keep consistent on one platform; mitigated by the single registry.

## Links

- Design decisions: DD-28, DD-29, DD-30 (token-only theming), DD-01 (cross-platform Wails v2)
- Spec clauses: ../../_archive-2026-07-28-specification/02_Architecture/04_WAILS_INTEGRATION.md`,
../../_archive-2026-07-28-specification/02_Architecture/03_FRONTEND_REACT.md#structure`,
  ../../_archive-2026-07-28-specification/01_Product/12_KEYBOARD_SHORTCUTS.md`,
`specification/07_Phases/PHASE_03_IT_LOOKS_DESIGNED.md` (step 1)
- Mockup: `specification/mockups/gomarkedit-mockup.html` — the title bar and `.lights`
- Stories: the Phase 03 stories, not yet written.
