# Why the UI drifts: production transcribes the binding's _numbers_, not its _structure_

**Requirement**: FR-FT-045, FR-FT-050, FR-FT-052, FR-FT-053, Constitution VII.
**Status**: reviewed; five instances fixed, the pattern documented.
**Branch**: `feature/v1-implementation--003-t071-settings-parity`.

Prompted by a review of the running application. Every defect reported there had
the same shape, and it is worth naming because it predicts where the next one
will be.

## The pattern

The binding is a small, regular document. It gives each thing **one rule on one
element**, and themes that same element:

```css
.tab {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  border-radius: 9px;
  font-size: 12.5px;
  border: 1px solid transparent;
  max-width: 190px;
} /* :272 */
body[data-theme='minimal'] .tab {
  border-radius: 0;
  border: 0;
  border-bottom: 2px solid transparent;
  background: none;
  padding: 8px 12px;
} /* :280 */
body[data-theme='material'] .tab {
  border-radius: 18px;
  padding: 8px 15px;
} /* :282 */
```

Production repeatedly reproduced the binding's _rendered result_ on a different
element than the binding styles. That works until something moves — a theme, a
state, a width — and then the two structures diverge and the difference is
patched with a pinned number or a nudge. Those patches are the drift.

## Six instances, all measured

| #   | Binding rule                                                                     | What production did                                                                                                      | Cost                                                                                               |
| --- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| 1   | `.brand` (:226) inside `.titlebar`                                               | Omitted the brand entirely, then put the menu at the right x with `transform: translateX(177.125px)`                     | The reported "empty region 1"; a pinned offset standing in for missing layout                      |
| 2   | `.tab{padding:7px 12px}` (:272) on the tab box                                   | Put the padding on the _inner label button_ and left the close control at `padding: 0`                                   | The × flush against the tab's trailing edge                                                        |
| 3   | `body[data-theme="minimal"] .tab.active{border-bottom-color:var(--text)}` (:281) | Drew the underline with an `::after` pseudo-element on a different element, because the border lived on the inner button | An extra element and two extra rules for one border                                                |
| 4   | `.tab .x` sits in the row's normal flow                                          | `position:relative; top:-1px` on the close control                                                                       | A nudge correcting the wrong structure; it became a 104px error the moment the structure was fixed |
| 5   | `.doc-name` (:232) has no background and follows `.sp{flex:1}` (:231)            | Gave it `--surface-raised` and a second `margin-inline-start:auto`, which split the free space with the row actions      | The reported background box, floating mid-row                                                      |
| 6   | `.dropdown`/`.mi`/`.sep`/`.tick`/`.tgl` — one set of primitives                  | Re-declared across three stylesheets                                                                                     | The View menu lost the unavailable opacity its File twin had: **1,404 px**                         |

Two more of the same family were found and fixed earlier in this phase and are
recorded separately: the toolbar's pinned `inline-size` values
(`t045-toolbar-sizing-model.md`) and the arrangement segment's pinned option
widths, which froze the weight of whichever option was selected when they were
measured.

`EditorChrome.module.css` additionally carries a complete set of tab rules —
`.tabStrip`, `.tabs`, `.tabItem`, `.tab`, `.tabClose`, `.tabAdd`,
`.modifiedDot` — that `EditorChrome.tsx` never references. Dead CSS duplicating
`DocumentTabs`, which is the same divergence one step further along.

## The rule this yields

**Transcribe the binding's structure, then let the numbers fall out.** Concretely:

1. **Find the element the binding styles, and style that one.** If the binding
   puts padding on the tab box, production's tab box gets the padding — not an
   inner element that happens to produce the same first render.
2. **A pinned measurement is a defect report.** `inline-size: 66.5625px`,
   `translateX(177.125px)`, `top: -1px` — each of these is a note saying the
   structure underneath is wrong. Every one removed this phase was replaced by
   nothing at all, because the correct structure already produced the number.
3. **One owner per primitive.** The binding has one `.mi`; production now has one
   `MenuSurface.module.css`. A rule appearing in two stylesheets is a future
   divergence with a date on it.
4. **Themes belong on the themed element.** All three theme rules for a tab now
   target the same box, so a theme cannot need a compensating rule elsewhere.
5. **Every literal is a token that cites its binding line**, and `tokens.test.ts`
   asserts the value. The stylesheet then reads as structure, and the numbers are
   checkable against the source in one place.

## Where the remaining offsets are, and why they are not this

Two coordinate constants survive and are legitimate, because they name a
difference the specification owns rather than compensating for missing layout:

- `--file-menu-popup-left`, `--view-menu-popup-left`, `--about-menu-popup-left`,
  `--menu-popup-top` — the binding's own `#m-file{left:96px}` etc. These are the
  binding's numbers, transcribed, not measurements of production.
- The reference adapter removes `.lights`, because `spec.md:599` declares the
  OS-managed frame supersedes them. Production draws no substitute and reserves
  no space, so the menu's position now comes from layout on both sides.

## What this predicts

The residuals still open are all consistent with the structure now being right:
they are boundary antialiasing, gradient dither phase, and one compositing
backdrop — not geometry. Geometry defects had a signature (pinned numbers,
nudges, duplicated rules) and that signature is largely gone.

The next place to look is the two remaining menu consumers —
`SettingsMenu.module.css` and the File/About popups in `ShellMenuRow.module.css`
— which still declare their own copies of the shared primitives.
