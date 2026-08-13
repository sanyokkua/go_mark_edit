# The e2e baseline — two failures the local gate never saw

**Requirement**: Constitution VII (no work builds on a gate that did not analyze
its target; a green aggregate label is never evidence of completion).
**Recorded**: 2026-08-13, against the unmodified tree at `6efb45fa`.

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
calls it, and `scripts/baseline.sh` does not capture it either** — the baseline
recorded on this branch lists `frontend-build, fmt-check, typecheck, lint, test,
archtest, coverage` and no Playwright gate.

So the feature's stated position — "`just check` green: 75 suites / 483 tests" —
was true and simultaneously said nothing about the real-interface suites.

## The two pre-existing failures

`frontend/e2e/real-files-and-tabs.test.ts` on the **unmodified** tree:
**2 failed / 6 passed**.

### FT-VS-05 — the Settings menu's Autosave checkbox never becomes actionable

```
Error: locator.check: Test timeout of 30000ms exceeded.
  waiting for getByRole('menu', { name: 'Settings menu' })
             .getByRole('checkbox', { name: 'Autosave' })
    61 × waiting for element to be visible, enabled and stable
  at frontend/e2e/real-files-and-tabs.test.ts:123
```

The element is found but never settles as visible **and** enabled **and**
stable. This is the same surface as the reported "Settings does not light up
under the pointer" defect.

### FT-VS-07 — File ▸ Open Recent is disabled when it should be enabled

```
Error: expect(openRecent).toBeEnabled() failed
  waiting for getByRole('menu', { name: 'File' })
             .getByRole('menuitem', { name: 'Open Recent' })
  at frontend/e2e/real-files-and-tabs.test.ts:185
```

## Provenance — these are not from Phase 18 work

Measured by stashing the working tree and re-running:

| Tree | Result |
|---|---|
| `6efb45fa`, unmodified | 2 failed / 6 passed |
| Phase 18 status-bar change, before its own assertions were updated | 3 failed / 5 passed |
| Phase 18 status-bar change, complete | **2 failed / 6 passed** — the same two |

The third failure was `FT-VS-02`, caused by this change and fixed within it. The
count returning to exactly the same two named tests is the evidence that the
status-bar change introduced no e2e regression.

## Why this matters more than the two tests

This is the mechanism behind "defects kept being found by eye" on Feature 003.
Every reported defect this week — the arrangement segment in the wrong place,
Settings and View not lighting up under the pointer — is an interface defect, and
the gate that would catch interface defects was not part of the gate that was
being run and reported as green.

Two consequences, both recorded as Phase 18 work:

1. `just e2e-test` must be run and diffed explicitly before anything touching
   the interface is called done. It is not covered by `just check` or by
   `just baseline`.
2. The parity captures are taken at rest, so even the Playwright suites cannot
   see hover, focus or open states. That gap is closed separately — see
   `interactive-state-coverage.md`.

## Status

Both failures are **open findings carried into Phase 18** and are addressed as
real defects under decision 1 ("fix every real defect"), not deferred. Their
resolution is recorded in `settings-and-view-interactive-states.md` and
`open-recent-availability.md`.
