# T072 — the View popup inventory, measured against `#m-view`

**Requirement**: FR-FT-045, FR-FT-053, FR-FT-055, SC-FT-009, and the `menu-view`
family row of the exact visual-parity contract (`spec.md:610`).
**Status**: **measured, not yet implemented.** This note replaces the prose
inventory sketch in `t072-view-about-anchoring.md` with the actual per-row
geometry from both pages.
**Branch**: `feature/v1-implementation--003-t071-settings-parity`.

## The spec is not silent here

`spec.md:610` requires the `menu-view` family to reproduce "Binding menu
geometry, **grouping, indicators, switches, and accelerators** without changing
Feature 002 action behavior." All four of those nouns are currently missing from
production, so this is a mandated reconciliation rather than an open question.

## Measured, 1280px Minimal Light

Both popups already agree on the frame: `x` 216.203125, width 250, padding 6px,
row padding `7px 10px`, row font `13px Inter`. Only the contents differ.

| # | Reference `#m-view` (h **282**) | y | h | Production (h **284**) | y | h |
|---|---|---:|---:|---|---:|---:|
| 1 | Toggle Sidebar · `Ctrl \` | 7 | 30 | Editor | 7 | 30 |
| 2 | Toggle Assistant · `Ctrl J` | 37 | 30 | Split | 37 | 30 |
| 3 | Show Editor · ✓ | 67 | 30 | Preview | 67 | 30 |
| 4 | Show Preview · ✓ | 97 | 30 | Toggle Sidebar | 97 | 30 |
| 5 | **separator** | 132 | 1 | Toggle Assistant | 127 | 30 |
| 6 | Line numbers · **switch** | 138 | **33** | Line numbers | 157 | 30 |
| 7 | Word wrap · **switch** | 171 | **33** | Word wrap | 187 | 30 |
| 8 | **separator** | 209 | 1 | Distraction-free reading | 217 | 30 |
| 9 | Distraction-free reading · `Ctrl ⏎` | 215 | 30 | Full screen | 247 | 30 |
| 10 | Full screen · `F11` | 245 | 30 | — | — | — |

The 2px height difference that T061 reports as `bounds.bottom: 455 != 457` is a
coincidence, not the defect: production's nine uniform 30px rows happen to total
2px more than the binding's eight rows, two 33px switch rows and two separators.
Closing the height by adjusting a row would hide the real difference.

## What has to change, in order

1. **Row order.** Toggle Sidebar and Toggle Assistant come *first* in the
   binding, before the visibility rows. Production puts them fourth and fifth.
2. **Arrangement rows.** The binding has two checkbox rows — `Show Editor ✓` and
   `Show Preview ✓` — not three radios. `ViewMenu` already implements exactly
   this as its non-arrangement branch (`ViewMenu.tsx:132`), reached when
   `arrangement`/`onArrangementChange` are not supplied, and it dispatches the
   same canonical `editor` and `preview` action ids. Both checked is split, so
   the three states survive; this is the "without changing Feature 002 action
   behavior" constraint, and it needs checking that nothing depends on a `split`
   dispatch from this surface.
3. **Grouping.** Two separators, after Show Preview and after Word wrap.
   Binding: `.sep{height:1px;background:var(--stroke-soft);margin:5px 4px}`
   (`mockup.html:243`), rendered 1px tall and 228 wide inside the 250px popup.
4. **Indicators.** `.tick{color:var(--accent-ink);width:14px;text-align:center}`
   (`:245`) on Show Editor and Show Preview.
5. **Switches.** `.tgl` (`:248`–`:250`) — a 34×19 pill with a 14px knob — on
   Line numbers and Word wrap. This is what makes those two rows 33px rather
   than 30px, so the switch is load-bearing for the geometry, not decoration.
6. **Accelerators.** `.mi .k{color:var(--faint);font-size:11px;
   font-family:var(--mono)}` (`:241`) on Toggle Sidebar (`Ctrl \`), Toggle
   Assistant (`Ctrl J`), Distraction-free reading (`Ctrl ⏎`) and Full screen
   (`F11`). The File popup already renders accelerators through this primitive,
   so there is a working precedent to follow rather than a new mechanism.

Every visible string added must come from the i18n catalogue — Constitution VI,
which `just archtest` enforces mechanically.

## Current slice result

`T061 state-pairs the View popup`: `bounds.bottom: 455 != 457`,
`bounds.height: 282 != 284`, and 9,036 unexplained pixels. The pixel count was
confirmed against a stashed tree to predate this session's toolbar and preview
work, so none of it is a regression from those changes.
