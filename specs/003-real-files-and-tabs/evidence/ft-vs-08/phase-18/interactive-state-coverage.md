# Covering the states a capture at rest cannot see

**Requirement**: Constitution VI (visible focus, usable actual controls),
FR-FT-045/FR-FT-051.
**Decision**: session decision 8 — add a toolbar region to the targeted visual
comparison, and checks for interactive states (hover, focus, open), able to
catch the three defects found by eye this week.

## The blind spot, stated exactly

Two independent gaps let three defects through:

1. **Every parity capture is taken at rest.** `prepareActual` freezes the page
   and captures; no suite has ever hovered a control, focused one, or asserted
   what an open trigger looks like. A control that responds to nothing produces
   a byte-identical screenshot to one that responds correctly.
2. **The toolbar was never compared.** T062 is named "tabs and toolbar", but its
   region is `#app.no-assistant .tabs` → `[role="tablist"]` — the tab strip
   alone. The toolbar had no comparison at all, which is the region the
   mispositioned arrangement segment hid in.

The three defects map onto those gaps exactly:

| Defect | Gap |
|---|---|
| Arrangement segment in the wrong place | toolbar never compared |
| Settings does not light up under the pointer | hover never observed |
| View does not light up under the pointer | hover never observed |

## What was added

### `frontend/e2e/interactive-states.test.ts` (new)

Ten cases, all driving the real controls:

| Case | Asserts |
|---|---|
| `T076 the {File,Settings,View,About} menu trigger lights up under the pointer` (×4) | the trigger's computed `background-color` **changes** on hover, is not transparent when hovered, and **returns** to its resting value when the pointer leaves |
| `T076 the {…} menu trigger shows a visible focus ring` (×4) | `outline-style`/`outline-width`/`box-shadow` change on focus, and the focused state is not `none\|0px\|none` |
| `T076 an open menu trigger is drawn as open` | each trigger reports `data-state="open"`, its background differs from resting and is not transparent, and Escape returns it to `closed` |
| `T076 holds the arrangement segment at the toolbar trailing edge` | the segment's right edge meets the toolbar's content edge, and **no** toolbar child starts after it |
| `T076 keeps every arrangement option reachable and exactly one checked` | three radios, exactly one `aria-checked`, and each responds to the pointer |

**These assert change, not colour.** A hovered trigger must differ from its
resting value and revert afterwards; the exact value is left to the tokens, so a
palette change stays free while a control that responds to nothing still fails.
Asserting one palette's literal hex would have made the suite brittle without
making it stricter.

The revert assertion matters: without it, a one-way class that happens to differ
would pass. With it, the test only passes for a genuine hover state.

### The toolbar region in the targeted comparison

`TARGETED_TOOLBAR_MANIFEST` in `frontend/e2e/targeted-manifest.ts`, one case at
1280px Minimal Light:

```ts
referenceSelector: '#app.no-assistant .toolbar',
actualSelector: '[role="toolbar"][aria-label="Document toolbar"]',
regionId: 'toolbar',
openSurface: 'toolbar',
```

It joins the existing parameterised comparison in `targeted-parity.test.ts` as
`T077 state-pairs the document toolbar in Minimal Light`, so it inherits the
whole existing contract with no new machinery: semantic pairing, exact bounds,
the 26 compared computed styles, and the zero-tolerance pixel comparison with no
mask and no tolerance.

Widening the manifest required extending five closed union types (`regionId`,
`openSurface`, `referenceSelector`, `actualSelector`, and the evidence-root and
test-name ternaries). `assertTargetedManifestIntegrity` gained a T077 block
asserting the slice declares exactly one case and does not collide with the
unrestricted manifest — the same guard every other slice has.

## Why this is the right shape

The alternative was to add hover and focus captures to the pixel matrix. That
was rejected: it would multiply an already 30-minute, 1,638-comparison contract
by the number of states, and pixel-comparing a hover state against a static
mockup that has no hover rendering would produce residuals no production edit
could close — the same trap recorded in
[the parity-contract sizing lesson]. Asserting *behaviour* (it changes, it
reverts, it is not transparent) is cheap, fast, deterministic, and is what the
defects actually violated.
