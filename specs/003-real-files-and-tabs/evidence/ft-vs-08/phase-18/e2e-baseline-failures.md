# The e2e baseline — the gate that was never run

**Requirement**: Constitution VII (no work builds on a gate that did not analyze
its target; a green aggregate label is never evidence of completion).
**Measured**: 2026-08-13.

## `just check` does not run Playwright

`justfile:145`:

```
check:
    just gen-check
    just frontend-build
    just fmt-check
    just lint
    just typecheck
    just frontend-test
    just go-vet
    just archtest
    just go-test
```

Playwright runs only under `just e2e-test` → `just verify-ui` →
`npm --prefix frontend run verify:ui` → `playwright test`. **`just check` never
calls it, and `scripts/baseline.sh` does not capture it either** — the recorded
baseline lists `frontend-build, fmt-check, typecheck, lint, test, archtest,
coverage` and no Playwright gate.

So the feature's stated position — "`just check` green: 75 suites / 483 tests" —
was true, and said nothing whatever about the real-interface suites.

## What the e2e suites actually do

### `real-files-and-tabs.test.ts` — was 2 failed / 6 passed, now 8 passed

Both failures were real and are fixed in Phase 18; see
`settings-dead-toggle-and-stale-recents.md`. Three of the four underlying causes
were production defects (a dead Settings toggle, a missing ARIA role, and
availability bypassing the action registry); the fourth was a stale test.

### `editor-stage.test.ts` + `window-shell.test.ts` — 106 failing cases

Run to completion on the tree at `40d4e120`, which contains the four committed
Phase 18 defect fixes and none of the uncommitted Settings work:

| Suite | Failing cases |
|---|---:|
| `editor-stage.test.ts` | 78 |
| `window-shell.test.ts` | 28 |
| **Total** | **106** (33 passed, 25.4 minutes) |

**These are pre-existing.** They are not caused by any Phase 18 change: the same
two suites were re-run on the working tree with the Settings work restored and
compared case-by-case (`mytree-e2e.log`).

### The four root causes

Every one of the 106 reduces to four stale expectations, counted across the
failing cases:

| Count | The locator that never resolves | Why |
|---:|---|---|
| 36 | `getByRole('tab', { name: 'release-notes.md' })` | The suite expects a seeded document named after the mockup's tab; production opens `Untitled`. |
| 36 | `…getByRole('radio', { name: 'Follows system' })` | Production's appearance option is **`Auto (system)`**, which is what the binding draws (`mockup.html:615`). The test still uses the pre-convergence wording. |
| 24 | `getByRole('menuitem', { name: 'Appearance' })` | Production exposes Appearance as a `radiogroup` with that accessible name, not a `menuitem`. |
| 6 | `[data-viewport-popup="editor-overflow"] … 'Bold'` | The overflow toolbar structure changed. |

By assertion type: 66 timeouts waiting for a locator that never appears, 18
`toBeVisible`, 18 `toBeDisabled`, 3 numeric bound checks.

**None of these is a product defect.** In each case production matches the
binding and the test describes the surface as it was *before* it was converged —
the identical failure mode as FT-VS-07's `Open Recent` submenu, which had been
red since the T070 File-popup convergence and is fixed in Phase 18.

## Why this matters more than the individual cases

This is the mechanism behind "defects kept being found by eye".

Every defect reported this week is an interface defect — the arrangement segment
in the wrong place, Settings and View not lighting up under the pointer, a
Settings toggle that does nothing. The gate that would catch interface defects
was **not part of the gate being run and reported as green**, and inside that
unrun gate 106 cases had been failing long enough that four separate
convergences had landed without anyone updating them.

Two consequences:

1. `just e2e-test` must be run and diffed explicitly before anything touching
   the interface is called done. It is covered by neither `just check` nor
   `just baseline`. Recorded in `AGENTS.md`.
2. Even a green Playwright run could not have caught three of the four Phase 18
   defects, because **parity captures are taken at rest** — no suite exercised
   hover, focus or open state. That gap is closed separately; see
   `interactive-state-coverage.md`.

## Status: recorded, not fixed

The 106 stale cases are **deliberately not repaired in Phase 18**, and this is a
scope decision rather than an oversight:

- They are stale *tests*, not product defects. The product is correct against
  the binding in all four clusters.
- Repairing them means re-deriving expected labels, roles and fixtures for 106
  cases across two suites — work comparable in size to the rest of Phase 18, and
  session decision 10 requires each piece to be either complete and green or
  fully reverted. Starting and abandoning it would leave the repository worse
  than finding it.
- The diagnosis above is complete enough to act on directly: four root causes,
  exact locators, exact counts.

They are carried forward as named follow-up work, with this file as the
specification for it.
