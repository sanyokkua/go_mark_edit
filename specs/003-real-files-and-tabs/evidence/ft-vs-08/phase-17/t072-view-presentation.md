# T072 — View popup presentation, and the one divergence it isolates

**Requirement**: FR-FT-045, FR-FT-053, FR-FT-055, the `menu-view` family row
(`spec.md:610`), and FR-ED-004 (Feature 002, consumed).
**Status**: **converged.** All six changes implemented; the sixth through an
approved reference variant. `bounds` now match exactly and 163 of the 165
remaining pixels are on the popup's own outer boundary.
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

## Measured after the presentation work, before the variant

This is the intermediate state, and it is what isolated the one remaining
divergence. The reference column is the unadapted `#m-view`; the variant below
brings it to production's inventory and its height to 312.

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

## The divergence this isolated

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

All three pointed at one resolution — a Feature 003 reference variant for
`#m-view` — which was raised as a decision rather than taken unilaterally, and
approved. The next section records it.

## The decision, and the variant that resolved it

Approved: keep FR-ED-004's inventory in production and express the difference as
a Feature 003 reference variant for `#m-view`, exactly as `adaptFileMenu` does
for `#m-file`. Recorded as the fourth entry under `## Clarifications` →
**Session 2026-08-13** in `spec.md`, and encoded in FR-FT-056 and the
`menu-view` family row.

`adaptViewMenu` in `frontend/e2e/parity/reference-adapter.ts` rebuilds the
region from the mockup's own `.mi`, `.sep`, `.k`, `.tick`/`.tick.off` and
`.tgl`/`.tgl.on` primitives, covering all three behaviour-owned differences at
once:

1. Editor / Split / Preview replace `Show Editor` / `Show Preview`. The mockup
   draws both of its rows ticked, which *is* the split arrangement, so Split
   carries the tick and the other two carry `.tick.off` — the 14px box keeps its
   width either way, so no row moves.
2. `Toggle Assistant` and `Distraction-free reading` carry the reviewed
   unavailable opacity and no accelerator, because both are deferred and neither
   has a Feature 003 registry shortcut.
3. Accelerators are formatted for the host, so `Toggle Sidebar` reads `⌘\` on
   this macOS host where the mockup writes `Ctrl \`.

Verified: the raw mockup source hash is unchanged, and the switch states are the
source's own (Line numbers on, Word wrap off).

## One production defect the variant exposed

With the reference dimmed, production's two deferred rows were still drawn at
full strength — `ViewMenu.module.css` had `.item[data-disabled]` set
`cursor: not-allowed` but no opacity, so the menu refused to activate those rows
while showing them as available. The File popup already dims its deferred rows
through `--disabled-opacity` (`ShellMenuRow.module.css:272`); the View menu now
does the same. That single rule accounted for **1,404** of the residual pixels.

## Slice result

| Step | Bounds | Unexplained pixels |
|---|---|---:|
| Session start | `height: 282 != 284` | 9,036 |
| Binding order, grouping, indicators, switches, accelerators | `height: 282 != 312` | 15,330 |
| Reference variant for `#m-view` | **match** | 1,569 |
| Production's deferred rows dimmed | **match** | **165** |

The intermediate rise is not a regression: the extra arrangement row displaced
every row below it, so rows that previously happened to overlap no longer did.
The original 2px height agreement was a coincidence — nine uniform 30px rows
totalling 2px more than the binding's mixed 30/33/1px rows — and it concealed
five missing presentation requirements.

## What remains — 165 px, 163 of them boundary

| Location | Pixels | Cause |
|---|---:|---|
| Popup outer boundary (`x ≤ 11`, `x ≥ 238`, `y ≤ 11`, `y ≥ 300`) | **163** | the popup's own antialiased edge and 12px corners, plus the single column of content beside it that the fractional bounding box includes |
| Line numbers toggle, right edge (`x 232`, `y 183–184`) | **2** | max channel delta 8 on the accent pill's rounded edge |

The boundary pixels are the pattern already recorded for the File and Settings
popups: an opaque popup blending with the chrome behind it. They close when that
chrome converges, cannot be closed by changing the popup, and are not masked.

Determinism was checked before calling either residual drift, per
`t062-renderer-determinism.md`: six captures of the popup on each page produced
exactly **one** raster per page.

## Gates

`just fmt-check`, `just lint` (0 errors, the 2 baseline `react-refresh`
warnings), `just typecheck`, `just frontend-test` (74 suites / 466 tests),
`just archtest` — all green. `ViewMenu.test.tsx` and `ShellMenuRow.test.tsx`
pass unchanged, including the narrow-menu arrangement test.

Every other targeted slice re-run individually and unchanged: T058
minimal-light/dark and material-light/dark, T062, T063, T064 pass; T058
glass-light 6,187, glass-dark 6,380, T059 181, T060 Settings 709, T060 overflow
205, T061 About 1,489.
