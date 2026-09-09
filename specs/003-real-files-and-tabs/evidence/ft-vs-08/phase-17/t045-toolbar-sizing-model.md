# T045 — the toolbar's sizing model, and what the residual actually was

**Requirement**: FR-FT-045, FR-FT-050, FR-FT-052, CL-15–CL-17.
**Status**: **toolbar geometry closed to exact.** The remaining chrome pixels
are one behaviour-owned difference awaiting a specification decision, plus a
small icon-path residual.
**Branch**: `feature/v1-implementation--003-t071-settings-parity`.

Measured at 1280px Minimal Light, `editor-split`, against the live reference at
the binding source hash.

## The pins are replaced, not retuned

`t045-editor-chrome.md` recorded that production pinned measured integer control
widths where the binding derives fractional ones from text metrics. Production's
tokens already _were_ the binding's rule —
`--toolbar-action-min-width: 30px`, `--toolbar-action-padding-inline: 8px`,
`--toolbar-group-gap: 3px`, `--toolbar-group-padding: 3px`,
`--arrangement-option-padding: 5px 12px` are `mockup.html:285–291` exactly. The
drift came entirely from parity-scoped overrides that pinned `inline-size` and
zeroed the padding, so a width stopped being a function of its own content.

Those overrides are deleted. Nothing replaced them: the base rules already
express `.tbtn{min-width:30px;height:30px;padding:0 8px}`.

| Toolbar child              | Reference                      | Production before              | Production after |
| -------------------------- | ------------------------------ | ------------------------------ | ---------------- |
| group 1 (bold…inline-code) | x 246.203125, w **135.078125** | x 246.203125, w **135**        | **exact**        |
| group 2 (headings)         | x **385.28125**, w 107.953125  | x **385.203125**, w **108**    | **exact**        |
| group 3 (lists)            | x **497.234375**, w 129        | x **497.203125**               | **exact**        |
| group 4 (link/image/table) | x **630.234375**, w 102        | x **630.203125**               | **exact**        |
| arrangement segment        | x 1068.765625, w **181.03125** | x 1068.515625, w **181.28125** | **exact**        |
| segment · Editor           | w **56.234375**                | w **58.0625**                  | **exact**        |
| segment · Split (selected) | w **50.03125**                 | w **48.453125**                | **exact**        |
| segment · Preview          | w 66.765625                    | w 66.765625                    | **exact**        |

## Why the segment could never be pinned

Production pinned Editor at 58.0625 and Split at 48.453125; the reference draws
Editor at 56.234375 and Split at 50.03125. Those are the same two glyph runs
with the weights swapped. `.seg button.active{font-weight:600}`
(`mockup.html:292`) widens whichever option is selected, and the pins were
captured while `Editor` was active. A pinned width cannot follow a selection.

One trap worth naming: the binding's `.seg button{font:inherit}` cannot be
copied as the `font` shorthand. The shorthand also resets `font-weight`, which
outranks production's mirror of `.seg button.active` and freezes every option at
400 — the segment then measures 179.453125, wrong in the other direction. Only
the family needs restoring, because `.action` already carries `font: inherit`;
the parity route is undoing its own `[data-icon]` Arial rule and nothing else.

## The remaining chrome pixels are not geometry

With the geometry exact, the toolbar region still differed by 965 pixels. A
controlled probe isolated the cause: neutralising **only** production's
deferred-availability opacity, and changing nothing else, drops the region from
965 to **214** pixels and the maximum channel delta from 114 to 54.

| Toolbar cluster    | Page x     | Pixels | Cause                                          |
| ------------------ | ---------- | -----: | ---------------------------------------------- |
| Image icon         | 676–688    |    127 | `image` is a deferred action — `opacity: 0.48` |
| Format             | 745–793    |    242 | `format` is deferred                           |
| Compact            | 816–879    |    336 | `compact` is deferred                          |
| Lint               | 901–933    |    148 | `lint` is deferred                             |
| Link icon          | 639–653    |     41 | icon path approximation (pre-existing)         |
| Segment outer edge | 4 clusters |     71 | antialiased boundary                           |

`image`, `format`, `compact` and `lint` are `deferred(...)` in
`frontend/src/logic/actions/actionRegistry.ts` (`:354`, `:362`, `:371` and the
`image` entry). Production therefore renders them visibly unavailable. **The
immutable mockup has no disabled state at all**, so the comparison collapses
into an opacity difference rather than measuring geometry.

This is the situation FR-FT-056 already resolves for the File menu, whose
Feature 003 reference variant carries the reviewed unavailable opacity
(`FILE_MENU_UNAVAILABLE_OPACITY = '0.48'`,
`frontend/e2e/parity/reference-adapter.ts:99`) for exactly this reason. FR-FT-056's
enumerated list does **not** cover the toolbar, so the toolbar case is
unresolved and is recorded as a decision, not closed in code.

## Segment colour — closed

Separately from the sizing model, the binding's `.seg button` carries
`color:var(--muted)` (`mockup.html:291`); production's `.action` gave the
segment `--text`. The unselected options rendered black against the reference's
grey. Fixed in the base rule, with the selected option restating
`--accent-contrast` because the muted colour outranks
`.action[aria-checked='true']` on source order.

## Measured effect on the editor region

Same harness, same production state — the preview figure below is unchanged at
the point of the toolbar fix, which confirms the two harnesses measure the same
capture as the recorded table.

| Region                                   | Recorded (`t045-editor-chrome.md`) |   After |
| ---------------------------------------- | ---------------------------------: | ------: |
| Monaco (reviewed exclusion, Feature 002) |                             17,481 |  22,842 |
| Chrome (toolbar)                         |                              2,683 | **965** |
| Tab strip                                |                                  — |   **0** |
| Preview                                  |                              3,433 |   **5** |
| Rest of the region                       |                                  — |   **0** |
| **Unexplained** (total − Monaco)         |                          **6,116** | **970** |

Monaco's own raster is not comparable between runs and is the named reviewed
exclusion; it does not count. The preview figure is closed by
`t045-preview-typography.md`.

## Determinism

Per `t062-renderer-determinism.md`, the region was captured six times on each
page before any residual was called drift. Both pages produced exactly **one**
raster — reference `777604225c22`, production `4ea808cf9c36`. Nothing left in
this region is renderer noise.

## Gates

`just fmt-check`, `just lint` (0 errors, the 2 baseline `react-refresh`
warnings), `just typecheck`, `just frontend-build`, `just frontend-test` (74
suites / 466 tests), `just archtest` — all green.

Every targeted slice re-run individually by name. Previously green and still
green: T058 minimal-light, minimal-dark, material-light, material-dark, T062,
T063, T064. Unchanged failures: T058 glass-light 6,187, glass-dark 6,380, T059
181, T060 Settings 709, T060 overflow 205, T061 About 1,489, T061 View
`bounds.bottom: 455 != 457` with 9,036 pixels — the View pixel count was
measured against a stashed tree to confirm it predates this change.

## Follow-up: the arrangement segment was missing its spacer

**Reported from the running application:** the Editor/Split/Preview segment sat
immediately after Format/Compact/Lint, where the binding holds it against the
toolbar's trailing edge.

The binding does that with an empty element, not with alignment:

```html
<button class="tbtn txt" title="Lint — ⌥⇧L">✓ Lint</button>
<div class="tgrp tg-over"><button class="tbtn" title="More">»</button></div>
<div class="tsp"></div>
<!-- mockup.html:673 -->
<div class="seg" id="viewseg">…</div>
```

with `.tsp{flex:1}` (`:289`) and `.app[data-w="375"] .tsp{display:none}` (`:61`).

Production had no spacer at all, and its order put the segment _before_ the
overflow trigger rather than after it. Both are now corrected: the toolbar ends
`… deferred actions → overflow → spacer → segment`, matching the binding's own
order, and `.spacer` carries `flex: 1` with the same 376px collapse.

Two dead classes were removed in the same pass. `.utilityGroup` and
`.rightGroup` were declared in `EditorChrome.module.css` and applied to nothing;
`.rightGroup` was a half-built `margin-inline-start: auto` version of exactly
this. The binding's mechanism is a spacer, so the spacer replaces them rather
than sitting beside them.

### Verified

|                                            | Reference             | Production                                                |
| ------------------------------------------ | --------------------- | --------------------------------------------------------- |
| spacer `flex-grow`                         | `1` (`.tsp`)          | `1` (`.spacer`)                                           |
| segment is the toolbar's last child        | yes                   | yes                                                       |
| segment inset from trailing edge at 1280px | —                     | 10px, exactly the toolbar's `padding-right`               |
| at 375px                                   | `.tsp` `display:none` | spacer and segment `display:none`, overflow trigger shown |

`EditorChrome.test.tsx` locks the order structurally — the segment is the
toolbar's last child, the spacer sits between it and the overflow trigger, and
`.spacer` declares `flex: 1`. Asserted as order rather than computed layout
because jsdom does not lay flexbox out.

### What could not certify this

The paired pixel comparison could not, because it is uniformly red for unrelated
reasons. A full `T035` run measured here took 30.6 minutes and reported
**0 passed, 1620 failed** of 1638 attempted, with the whole-shell case alone at
309,525 unexplained pixels and Feature 002 region diagnostics (font-family,
font-size, overflow) dominating. That is the mid-convergence state Phase 17 is
working through, not a consequence of this change; the toolbar has no targeted
slice of its own in `targeted-manifest.ts`, whose regions are the menus, the tab
strip and the paused preview.
