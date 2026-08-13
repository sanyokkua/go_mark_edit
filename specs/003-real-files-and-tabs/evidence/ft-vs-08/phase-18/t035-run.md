# The T035 matrix run — 2026-08-13

**Command**: `npx playwright test real-files-parity.test.ts`
**Duration**: 39.5 minutes (recorded baseline: ~30.6)
**Result**: `1 failed, 2 passed`. T050 and T057 pass; T035 fails.

## The counts, from `parity/manifest-report.json`

| Count | Value |
|---|---:|
| planned | 1,638 |
| logical cases | 546 |
| repetitions | 3 |
| attempted | 1,638 |
| referenceReady | 1,620 |
| actualReady | 1,368 |
| comparisonCompleted | 1,350 |
| **passed** | **0** |
| **failed** | **1,620** |
| unresolved | 18 |

Per-row accounting across all 1,638:

| completed | passed | failed | unresolved | rows |
|---|---|---|---|---:|
| ✓ | ✗ | ✓ | ✗ | 1,350 |
| ✗ | ✗ | ✓ | ✗ | 270 |
| ✗ | ✗ | ✗ | ✓ | 18 |

**Unchanged from the recorded baseline** (0 passed / 1,620 failed of 1,638).
Phase 18 neither improved nor regressed the unrestricted matrix, which is the
expected outcome: its dominant blocking term is a Feature 002 decision that
session decision 9 explicitly ruled out of scope.

## Decision 9 — the Feature 002 editor term, measured

Session decision 9: do not change the editor's font or scrolling; measure
precisely, document, hand forward.

**432 of the 1,638 cases** (144 logical × 3 repetitions) fail on the editor
region's computed styles. The comparator reports them prefixed `Feature 002
region:`, and the same eight assertions fail in every one of the 432:

| Property | Reference (binding) | Production |
|---|---|---|
| `font-family` | `"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace` | `Inter, -apple-system, "Segoe UI", system-ui, sans-serif` |
| `font-size` | `13px` | `16px` |
| `line-height` | `23.4px` | `normal` |
| `overflow` | `auto` | `hidden` |
| `overflow-x` | `auto` | `hidden` |
| `overflow-y` | `auto` | `hidden` |
| `min-width` | `auto` | `0px` |
| `min-height` | `auto` | `0px` |

A further **126** cases also fail `width` and `height` in that region.

These are the font and the scrolling, exactly as decision 9 names them. They are
**not** touched by this phase.

### The pixel weight

Raw differing pixels, measured on the freshly captured artifacts at 1280px
Minimal Light with the same classifier used for the targeted residuals:

| Case | Region | Raw differing | Max delta |
|---|---|---:|---:|
| `primary_editor-only_1280_minimal-light` | 1024×546 | **23,019** | 248 |
| `primary_editor-split_1280_minimal-light` | 1024×546 | **23,024** | 248 |
| `primary_preview-only_1280_minimal-light` | 1024×546 | **177** | 41 |

The contrast is the finding. The two editor families differ by ~23,000 pixels
each; the preview family, over the identical region and at the identical width
and palette, differs by **177**. The editor's own text raster is essentially the
entire whole-window residual, and it is the one thing this feature may not
change.

The comparator's own figure for the editor-split case is **182 unexplained
pixels** — it excludes the Monaco interior as a named reviewed region — so the
23,024 raw is dominated by the excluded raster, and the 182 that remain are the
residual already characterised in the phase-17 T045 evidence.

### Handed forward

Changing the editor to the binding's `JetBrains Mono 13px/23.4px` with
`overflow: auto` would move ~23,000 pixels per editor-family case toward zero
and unblock 432 of the 1,638 comparisons — by far the largest single lever
remaining on this matrix. It belongs to Feature 002 and needs that feature's
decision, not this one's.

## Why T035 cannot pass yet, independently of the above

T035 requires every one of the 40 additional state IDs to pass in each of the
six palettes. Six of those — the `status-*` family — have **no paired reference
condition** until T075 is implemented, and the spec forbids counting a
production-only `comparisonAttempted: false` artifact as a parity pass. The 18
`unresolved` rows in the accounting are that gap.

So T035 is blocked on T075, and T075 is recorded as not started in
`t075-machinery.md`.
