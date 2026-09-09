# T083 — reducing T045 from 18 combinations to 3

**Requirement**: FR-FT-045, and the 2026-08-14 clarification recorded in
`spec.md`.
**Decided**: 2026-08-14.

## What T045 asked for

Reconcile the rendered `section[aria-label="Editor view"]` and its surrounding
shell against the immutable `#app.no-assistant .content` binding metrics "at
1280, 768, and 375 logical pixels across all six palettes" — **18
width/palette combinations**.

## What is already measured

One combination, `primary_editor-split_1280_minimal-light`, is measured and
**fully attributed at 182 unexplained pixels**
(`phase-18/t035-run.md`, "The pixel weight"; the characterisation itself is in
`phase-17/t045-editor-region-geometry.md` and
`phase-17/t045-editor-region-decision.md`).

The same run measured the raw figures over the identical region:

| Case                                      | Region   | Raw differing | Comparator's unexplained |
| ----------------------------------------- | -------- | ------------: | -----------------------: |
| `primary_editor-only_1280_minimal-light`  | 1024×546 |        23,019 |                        — |
| `primary_editor-split_1280_minimal-light` | 1024×546 |        23,024 |                  **182** |
| `primary_preview-only_1280_minimal-light` | 1024×546 |           177 |                        — |

## Why the other 17 add no signal

The gap between the two editor families (~23,000) and the preview family (177)
over the same region, width and palette isolates the cause: the **editor's own
text raster**. That difference is the eight computed-style properties recorded
in `phase-18/t035-run.md` — `JetBrains Mono 13px/23.4px` with `overflow: auto`
in the binding against `Inter 16px/normal` with `overflow: hidden` in
production.

Those eight properties are **Feature 002's approved surface**, and the
2026-08-13 clarification in `spec.md` records that Feature 003 does not change
them. They are palette-independent and width-independent: the typeface, type
scale and scrolling model do not vary by theme or viewport. So every one of the
other 17 combinations would carry the same term, fail for the same reason, and
report the same finding — 17 runs for one signal that is already recorded.

## What 3 combinations still catch

A **palette-specific** mistake — a token that resolves correctly under Minimal
but not under Glass or Material, a surface or border that only one family draws.
That is the only failure mode a wider sweep could find that the measured
combination cannot, and one combination per colour family is sufficient to find
it.

**Approved scope: 3 combinations at 1280px, one per colour family.**

| #   | Combination                          | Why                                                                                                       |
| --- | ------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| 1   | `editor-split` 1280 `minimal-light`  | the measured, fully attributed baseline                                                                   |
| 2   | `editor-split` 1280 `glass-light`    | Glass is the structurally distinct family — translucency, blur, saturation, continuous canvas (FR-FT-053) |
| 3   | `editor-split` 1280 `material-light` | Material is the filled-hierarchy family with pill tabs (FR-FT-053)                                        |

## What is dropped, explicitly

15 combinations at 1280/768/375 across the six palettes, plus the dark modes of
the three retained families. **They are dropped because they would repeat an
already-recorded measurement, not because they pass.** The editor-region term
they each carry is the Feature 002 term above, which is handed forward in
`spec.md` and blocks T035 independently of this reduction.

The narrow widths in particular are not silently dropped: 768 and 375 editor
behaviour is covered by the minimum-window work (T077–T080) and its own tests,
which assert pane collapse, chrome inventory and reachability at those widths
directly rather than through a pixel comparison that the Feature 002 term
dominates.

## Not changed by this reduction

No mask, tolerance, comparator, coordinate handling, selector mapping, manifest
count, or immutable-source change. The reduction is to how many combinations
T045 measures, and to nothing about how a measurement is taken.
