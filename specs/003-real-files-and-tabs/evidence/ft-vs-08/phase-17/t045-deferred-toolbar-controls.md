# T045 — deferred toolbar controls as a reference variant

**Requirement**: FR-FT-045, FR-FT-052, FR-FT-055, FR-FT-056, Constitution I.
**Status**: **implemented**, under an approved specification clarification.
**Branch**: `feature/v1-implementation--003-t071-settings-parity`.

## The contradiction

`image`, `format`, `compact` and `lint` are `deferred(...)` in
`frontend/src/logic/actions/actionRegistry.ts`, so production draws them
visibly unavailable at `--disabled-opacity: 0.48`. `spec.md:1129` forbids
Feature 003 from changing _any_ deferred outcome, and
`EditorChrome.test.tsx:37` asserts `Format` is disabled.

The immutable mockup has no disabled state anywhere. So the toolbar comparison
stopped measuring geometry and collapsed into a colour difference.

Measured, not assumed. A controlled probe neutralised **only** the
deferred-availability opacity in production and changed nothing else:

| Toolbar region, 1280px Minimal Light           | Differing pixels | Max channel delta |
| ---------------------------------------------- | ---------------: | ----------------: |
| As captured                                    |              965 |               114 |
| With production's disabled opacity forced to 1 |          **214** |                54 |

751 of the 965 pixels were the dimming alone.

## The decision

Recorded as the third entry under `## Clarifications` → **Session 2026-08-13**
in `spec.md`, and encoded in FR-FT-056's enumerated list and the `editor-split`
family row of the exact visual-parity contract.

The Feature 003 reference variant now renders those four controls at the same
single reviewed unavailable opacity FR-FT-056 already grants the File menu's
deferred rows. `FILE_MENU_UNAVAILABLE_OPACITY` is renamed
`REFERENCE_UNAVAILABLE_OPACITY` because it is now the one reviewed value for
both surfaces; its value, `0.48`, is unchanged and matches production's
`--disabled-opacity`.

`adaptDeferredToolbarControls` in `frontend/e2e/parity/reference-adapter.ts`
applies `deferredAttributes()` — the File menu's own primitive — to the mockup's
own `.tbtn` elements, matched by their source `title`, and throws if any of the
four disappears from the source. It is confined to controls the action registry
marks deferred.

What did not change, verified: the raw immutable mockup source hash
(`adaptReferenceHtml(...).sourceHash` still equals the SHA-256 of the unmodified
file), the mockup HTML/CSS itself, every mask, tolerance, comparator, selector
mapping and coordinate rule, the 546-case / 1,638-comparison contract, and
production's deferred behaviour.

## Measured effect

| Region, 1280px Minimal Light `editor-split` |  Recorded |   After |
| ------------------------------------------- | --------: | ------: |
| Chrome (toolbar)                            |     2,683 | **177** |
| Tab strip                                   |         — |   **0** |
| Preview                                     |     3,433 |   **5** |
| Rest of the region                          |         — |   **0** |
| **Unexplained** (total − Monaco exclusion)  | **6,116** | **182** |

The inverse probe confirms the attribution: with the reference now dimmed,
forcing production's disabled controls back to full opacity raises the toolbar
region from 177 to 963.

## What remains in the toolbar — 177 px, all characterised

| Cluster       | Page x     | Pixels | Cause                                 |
| ------------- | ---------- | -----: | ------------------------------------- |
| Link icon     | 639–653    |     41 | icon path approximation, pre-existing |
| Format marker | 763–769    |     39 | `::before` inline-box segmentation    |
| Lint marker   | 920–922    |     26 | same                                  |
| Segment edges | 4 clusters |     71 | **cause not identified**              |

**The marker residual is structural and measured.** The binding draws
`⌁ Format` as one text run; production draws `::before{content:'⌁ '}` plus the
catalogue label, which Chromium measures as two inline boxes and rounds
separately. Measured in-page, in one font context:

| Content     | One text run | Two inline boxes |         Δ |
| ----------- | -----------: | ---------------: | --------: |
| `⌁ Format`  |    48.828125 |         48.84375 | +0.015625 |
| `⇥ Compact` |    63.359375 |           63.375 | +0.015625 |
| `✓ Lint`    |    31.859375 |           31.875 | +0.015625 |

That +1/64px is exactly the button-width difference observed, and it shifts the
centred glyphs by half of it. Closing it needs the marker inside the label's own
text node, which a `::before` can never be — so it is a real, bounded, open item,
not something to be pinned away. `Arial` vs `Arial, sans-serif` was tested as a
possible cause and ruled out: it changed nothing.

**The segment edges are an honest negative result.** Every compared property is
identical on both pages — bounds `1068.765625, 181.03125 × 31`, `border-radius`
`10px`, border `1px solid rgb(236,236,238)`, background `rgb(243,243,242)`, and
`backdrop-filter`, `filter`, `opacity`, `transform`, `mix-blend-mode`,
`isolation` and `contain` all default up eight ancestors on both sides. The
residual is ≤5 channel steps on the rounded-corner arcs.

Two renderer explanations were tested and **both failed**:

1. Nondeterminism (`t062-renderer-determinism.md`): six captures per page
   produced exactly **one** raster each — reference `d60c044be8ad`, production
   `4ea808cf9c36`.
2. Position-dependent rasterisation. The reference document sits 94px lower than
   production's, so its own toolbar was rasterised at scroll 0, 47, 94 and 141:
   **one** raster across all four (`7cb77242fd61`).

So this is deterministic drift with an unidentified cause. It stays open and is
not written off as noise.

## Gates

`just fmt-check`, `just lint` (0 errors, the 2 baseline `react-refresh`
warnings), `just typecheck`, `just frontend-build`, `just frontend-test` (74
suites / 466 tests), `just archtest`, `just go-vet`, `just go-test` — all green.

The adapter change alters the served reference for **every** variant, so all
fourteen targeted slices were re-run individually by name afterwards. All are
byte-for-byte unchanged from before it: T058 minimal-light/dark and
material-light/dark, T062, T063, T064 pass; T058 glass-light 6,187, glass-dark
6,380, T059 181, T060 Settings 709, T060 overflow 205, T061 About 1,489, T061
View `bounds.bottom: 455 != 457` with 9,036 pixels. No targeted slice
pixel-compares the toolbar region, which is why none of them moved.
