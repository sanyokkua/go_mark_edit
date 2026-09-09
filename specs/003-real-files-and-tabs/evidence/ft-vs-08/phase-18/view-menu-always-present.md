# The View menu no longer disappears

**Requirement**: FR-ED-004 (View exposes Editor, Split and Preview),
Constitution VI (every surface keyboard-usable with correct roles and states).
**Decision**: session decision 6 — always show all four menus; with no document
open, draw View's document-dependent items unavailable.
**Branch**: `feature/v1-implementation--003-view-menu-availability`.

## What was broken

`App.tsx` passed `viewMenuProps` only when a document was open:

```tsx
viewMenuProps={activeDocument === undefined ? undefined : { … }}
```

and three places in `ShellMenuRow.tsx` treated `undefined` as "remove the menu":
the wide trigger (`:656`), the narrow trigger (`:873`), and the overflow list
filter (`:358`, `action.id !== 'view' || viewMenuProps !== undefined`).

So on the first screen of every launch — the launcher, which is the normal
startup state because there is no session restore — the shell showed **three**
menus. A user could not see what View contained, or learn that it exists.

## What "document-dependent" actually means here

The cut is which props are read off `activeDocument`:

| View row                 | Value source                      | With no document                |
| ------------------------ | --------------------------------- | ------------------------------- |
| Editor / Split / Preview | `activeDocument.view.arrangement` | **unavailable**                 |
| Toggle Sidebar           | `state.ui.layout.sidebarVisible`  | unchanged                       |
| Toggle Assistant         | registry, deferred                | unchanged (already unavailable) |
| Line numbers, Word wrap  | editor settings                   | unchanged                       |
| Distraction-free reading | registry, deferred                | unchanged (already unavailable) |
| Full screen              | window adapter                    | unchanged                       |

Only the arrangement group needs an open document to mean anything. The rest
keep working, so nothing was disabled that still had an effect.

## The change

- `ViewMenu.tsx` gained `documentOpen?: boolean` (default `true`). When false the
  three `RadioItem`s render with `disabled`, `data-availability="unavailable"`
  and a `title` explaining why — the same shape the deferred Assistant and
  Distraction-free rows already use (`ViewMenu.tsx:183-196`), so the existing
  `.row[data-disabled]` rule in `MenuSurface.module.css:113-118` styles them with
  no new CSS.
- `App.tsx` always builds `viewMenuProps`, with `documentOpen: activeDocument
!== undefined` and defaults for the three document-derived values.
- `view.menu.noDocument` added to the catalogue; no literal string was
  introduced.

`ShellMenuRow`'s `viewMenuProps?` stays optional. It is a reusable component and
the parity harness has a legitimate caller with no view props; what changed is
that the _application_ always supplies them.

## Evidence

| Test                                                                                  | Proves                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ViewMenu.test.tsx` — "offers the View menu with no document open…"                   | The menu opens, and each arrangement row carries `data-availability="unavailable"` and `data-disabled`; the Line numbers row does **not**, so only the document-backed rows were touched. |
| `ViewMenu.test.tsx` — "leaves the arrangement rows available once a document is open" | The same rows are `enabled` and not disabled when a document exists.                                                                                                                      |
| `App.test.tsx` — `FR-ED-004 offers all four menus with no document open`              | Through the **real** `App`, with the projection hydrated to zero documents: all four triggers present, and the arrangement rows unavailable.                                              |

**The App-level test was confirmed to catch the regression.** Restoring the old
conditional and re-running it:

```
Expected: ArrayContaining ["File", "Settings", "View", "About"]
Received: ["File", "Settings", "About"]
```

This closes a coverage gap that had been open the whole feature: no test
anywhere asserted what happens to the View menu when no document is open. Every
unit test supplied a defined `viewMenuProps` and every shell-action test passed
`viewAvailable: true`, so both the `App.tsx` conditional and the
`ShellMenuRow` filter were completely unguarded.

## Gate

`just check` green — 75 suites / **487** tests (was 484; three new cases), lint
0 errors and the 2 baseline `react-refresh` warnings.

Targeted parity re-run by name. `data-availability` drives no CSS rule in
`MenuSurface.module.css` or `ShellMenuRow.module.css`, so adding it to the radio
rows is semantic only — confirmed by the pixel counts being **identical** to the
values recorded before this change:

| Slice                 | Recorded before |      Now |
| --------------------- | --------------: | -------: |
| T059 File popup       |             181 |  **181** |
| T060 Settings popup   |             709 |  **709** |
| T061 View popup       |             165 |  **165** |
| T062 tabs and toolbar |            pass | **pass** |
| T063 editor-status    |            pass | **pass** |
| T064 paused preview   |            pass | **pass** |

`T058 glass-light` still fails at its already-diagnosed backdrop-compositing
residual; because the targeted file is `test.describe.configure({ mode:
'serial' })`, a whole-file run stops there and reports "13 did not run", which is
why each slice is run by name.
