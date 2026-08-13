# T072 — View popup presentation, and the one divergence it isolates

**Requirement**: FR-FT-045, FR-FT-053, FR-FT-055, the `menu-view` family row
(`spec.md:610`), and FR-ED-004 (Feature 002, consumed).
**Status**: **five of six changes implemented.** The sixth is blocked on a
specification decision and is now the only structural difference left.
**Branch**: `feature/v1-implementation--003-t071-settings-parity`.

## What was implemented

`spec.md:610` requires the `menu-view` family to reproduce binding "geometry,
grouping, indicators, switches, and accelerators without changing Feature 002
action behavior". Four of those five nouns were entirely missing. All are now
present, each built from the binding primitive that already had a working
precedent elsewhere in the codebase rather than a new mechanism:

| Change | Binding source | Implementation |
|---|---|---|
| Row order | `#m-view` (:626–:633) | Toggle Sidebar and Toggle Assistant now lead |
| Grouping | `.sep` (:243) | Two `DropdownMenu.Separator`s, after the visibility rows and after Word wrap |
| Indicators | `.tick`, `.tick.off` (:245) | 14px box, reserved when off so rows stay aligned |
| Switches | `.tgl` (:248–:250) | 34×19 pill with a 14px knob, mirroring `SettingsMenu.module.css` |
| Accelerators | `.mi .k` (:241) | `data-shortcut` + `content: attr(...)`, mirroring `ShellMenuRow.module.css` |

The accelerators are derived from the action registry through `formatShortcut`,
not written into the menu, so the value the menu shows and the value the
keyboard handler honours cannot drift apart.

**The switch is load-bearing, and the measurement proves it.** Line numbers and
Word wrap are now 33px where every other text row is 30px — exactly the
binding's own two heights — because the 19px pill drives the row box. It is
geometry, not decoration.

## Measured, 1280px Minimal Light

| Reference `#m-view` (h **282**) | y | h | Production (h **312**) | y | h |
|---|---:|---:|---|---:|---:|
| Toggle Sidebar `Ctrl \` | 7 | 30 | Toggle Sidebar `⌘\` | 7 | 30 |
| Toggle Assistant `Ctrl J` | 37 | 30 | Toggle Assistant *(no accelerator)* | 37 | 30 |
| Show Editor ✓ | 67 | 30 | Editor ✓ | 67 | 30 |
| Show Preview ✓ | 97 | 30 | Split ✓ | 97 | 30 |
| — | — | — | **Preview ✓** | **127** | **30** |
| separator | 132 | 1 | separator | 162 | 1 |
| Line numbers · switch | 138 | **33** | Line numbers · switch | 168 | **33** |
| Word wrap · switch | 171 | **33** | Word wrap · switch | 201 | **33** |
| separator | 209 | 1 | separator | 239 | 1 |
| Distraction-free reading `Ctrl ⏎` | 215 | 30 | Distraction-free reading *(none)* | 245 | 30 |
| Full screen `F11` | 245 | 30 | Full screen `F11` | 275 | 30 |

Every row that exists on both sides now has the same height, and the first four
sit at identical offsets. The whole 30px height difference is one extra row.

## The blocked change, and why

The previous note proposed switching the three arrangement radios to the
binding's two `Show Editor ✓` / `Show Preview ✓` checkboxes, and asked for
verification that nothing depends on a `split` dispatch from this surface.
**Something does.**

**FR-ED-004** (Feature 002) states: "The View menu MUST expose **Editor, Split,
Preview**, Toggle Sidebar, Toggle Assistant, Line numbers, Word wrap,
Distraction-free reading, and Full screen in the original mockup order and
grouping." `spec.md:1129` consumes that spec and forbids Feature 003 from
changing "canonical action identities … responsive action placement, or any
deferred outcome". `ShellMenuRow.test.tsx:325` asserts the narrow (375px) View
menu offers a `menuitemradio` named `Preview` and closes on selection.

So FR-ED-004 names an inventory the mockup does not have, while requiring "the
original mockup order and grouping". The order and grouping half is now
implemented; the inventory half cannot be resolved in code without contradicting
a consumed requirement.

Two secondary differences are the same class and were also left alone:

- **Accelerator platform.** Production shows `⌘\` on this macOS host; the mockup
  is written `Ctrl \`. `adaptFileMenu` already solves exactly this with a
  per-platform reference variant (`fileMenuReferenceAccelerators`).
- **Deferred rows.** Toggle Assistant and Distraction-free reading are deferred,
  so they carry no registry shortcut and production draws them visibly
  unavailable, while the mockup gives both an accelerator at full opacity. This
  is the pattern FR-FT-056 already grants the File menu, and that this session's
  clarification extended to the toolbar.

All three point at one resolution — a Feature 003 reference variant for
`#m-view`, built from the mockup's own `.mi` primitives, exactly as
`adaptFileMenu` does for `#m-file`. FR-FT-056's enumerated list does not cover
the View menu, so that is recorded as a decision rather than taken unilaterally.

## Slice result — honest movement

`T061 state-pairs the View popup` moved from `bounds.height: 282 != 284` with
9,036 pixels to `bounds.height: 282 != 312` with **15,330** pixels.

The pixel count rose because the extra arrangement row now displaces every row
below it by 30px, so rows that previously happened to overlap no longer do. The
previous 2px height agreement was a coincidence — nine uniform 30px rows
totalling 2px more than the binding's mixed 30/33/1px rows — and it concealed
five missing presentation requirements. The current number measures one named,
recorded divergence instead of hiding five. It falls as soon as that divergence
is resolved.

## Gates

`just fmt-check`, `just lint` (0 errors, the 2 baseline `react-refresh`
warnings), `just typecheck`, `just frontend-test` (74 suites / 466 tests),
`just archtest` — all green. `ViewMenu.test.tsx` and `ShellMenuRow.test.tsx`
pass unchanged, including the narrow-menu arrangement test.

Every other targeted slice re-run individually and unchanged: T058
minimal-light/dark and material-light/dark, T062, T063, T064 pass; T058
glass-light 6,187, glass-dark 6,380, T059 181, T060 Settings 709, T060 overflow
205, T061 About 1,489.
