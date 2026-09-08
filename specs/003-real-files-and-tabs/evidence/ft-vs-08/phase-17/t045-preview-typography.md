# T045 — preview typography convergence

**Requirement**: FR-FT-045, FR-FT-054, FR-FT-055, FR-FT-056.
**Status**: **closed to 5 pixels**, from 3,433.
**Branch**: `feature/v1-implementation--003-t071-settings-parity`.

Measured at 1280px Minimal Light, `editor-split`, over the preview pane region
of `#app.no-assistant .content` against `section[aria-label="Editor view"]`.

The residual sat in three row bands. Every one had a named cause; none was
masked.

| Band (y, preview-relative) | Pixels | Cause |
|---|---:|---|
| 366–393 | 3,208 | code block line-height and inner `code` family |
| 252–265 | 220 | image-fallback emphasis colour |
| 238 | 5 | list bullet marker — still open |

## Code block — line-height

The binding sets no `line-height` on `.preview pre` (`mockup.html:324`), and
`.preview` (`:310`) sets none either, so the block resolves to `normal` —
about 14px at its 12px size. Production's `.preview` carries
`line-height: var(--preview-line-height)` (1.5), which cascaded in as **18px**
and pushed every code line 2px down inside the block, and made the block itself
40px tall in the reference against 44px in production.

| Property | Reference | Production before | After |
|---|---|---|---|
| `pre` line-height | `normal` | `18px` | `normal` |
| `pre` height | 40 | 44 | 40 |
| `code` y | 728 (13 below `pre`) | 636 (15 below `pre`) | matched |

## Code block — the inner `code` family

The binding names `var(--mono)` on `.preview pre` (`:324`) and on
`.preview .kbd` (`:325`) — the primitive production's inline code maps onto —
but has **no rule for a `code` inside a `pre`**. Chromium's UA rule
`code{font-family:monospace}` therefore wins there over the ancestor's family,
so the binding renders the block's text in the platform's generic monospace,
not in JetBrains Mono. Measured computed values confirm it:

| Element | Reference `font-family` | Production before |
|---|---|---|
| `.preview pre` | `"JetBrains Mono", ui-monospace, …` | same |
| `.preview pre code` | **`monospace`** | `"JetBrains Mono", ui-monospace, …` |

Production's `.preview :is(code, pre)` applied the theme stack to the inner
element as well; `.preview pre code` now restates the generic keyword. Inline
code is untouched and keeps the theme stack, because its binding primitive
(`.kbd`) does name `var(--mono)`.

This is a binding quirk rather than a deliberate design choice, and it is worth
a look: matching it means code blocks render in the platform monospace rather
than the bundled face. It is recorded here rather than resolved unilaterally,
because the mockup is the authority for mapped shape and styling.

## Image-fallback emphasis colour

The Feature 003 reference variant expresses the discarded image through the
binding's own emphasis primitive — `<em>flow</em>` in
`IN_SCOPE_PREVIEW_CONTENT` — and the binding colours it
`.preview em{color:var(--md-emphasis)}` (`mockup.html:313`). Production's
fallback span (`gme-preview-image-fallback`,
`frontend/src/logic/markdown/renderer.ts:47`) carried only `font-style: italic`,
so it inherited `--muted` from the list and rendered grey against the
reference's purple.

The fallback now carries the whole treatment. `--md-emphasis` and `--md-strong`
already existed in `tokens.css` under `[data-mode]`, so all six palettes have
them, and their values match the binding byte-for-byte (`#7c3aed` / `#c58bff`
and `#b45309` / `#ffd479`). Both were previously defined and never used;
`.preview strong` was added alongside `.preview em` for the same reason.

## What remains

5 pixels on one list bullet marker at y 238, maximum channel delta 10 with a
core delta of 2. Per `t062-renderer-determinism.md` this was checked for
determinism before being called drift: six captures of the region on each page
produced exactly **one** raster per page (reference `777604225c22`, production
`4ea808cf9c36`). It is deterministic on both sides, so it is real production
drift and stays open — not noise, and not masked.

## Gates

`just fmt-check`, `just lint` (0 errors, the 2 baseline `react-refresh`
warnings), `just typecheck`, `just frontend-build`, `just frontend-test` (74
suites / 466 tests), `just archtest` — all green. T064 (paused preview) re-run
individually and still passing.
