# Phase 17 session status

## Decisions encoded

`spec.md` Clarifications, **Session 2026-08-13** — two entries, both integrated
into FR-FT-055, FR-FT-056, the edge-case bullet on excluded regions, and the
`editor-split` / `editor-only` / `preview-only` family rows:

1. **Editor region.** The mapped region stays compared whole with the two pane
   interiors split by owner. The preview pane uses a Feature 003 reference
   variant carrying the in-scope basic-preview content; the Monaco editor pane
   interior is a named reviewed region exclusion whose bounds and computed
   styles are still asserted exactly.
2. **Status states.** Six reviewed reference-adapter status variants are
   permitted, preserving the fixed 546-case / 1,638-comparison contract and the
   raw mockup source hash, and forbidding any production-only
   `comparisonAttempted: false` artifact from counting as a parity pass.

## Task status

| Task | Status |
|---|---|
| T069 Settings localization | **complete** |
| T045 editor-region geometry | decision implemented; 6,116 unexplained px remain |
| T070 File-popup fail-closed parity | 181 unexplained px |
| T072 Glass menubar + View/About | positioning converged; View inventory and Glass drift remain |
| T071 Settings waiver removal | waiver removed and gating; 823 unexplained px remain |
| T073, T074, T075 | not started |
| T065, T066, T067, T068 | not started |
| T035–T039, T044, T054 | not started |

## Targeted slice results

Every slice gates on whole-region geometry, computed styles and pixels.

| Slice | Result |
|---|---|
| T058 closed menubar, minimal-light | **passed** |
| T058 closed menubar, glass-light | 6,187 unexplained px |
| T059 File popup | 181 unexplained px |
| T060 Settings popup | 823 unexplained px |
| T060 Settings overflow, 375px | not reached (serial run stops at the first failure) |
| T061 View popup | `bounds.bottom: 455 != 457` |
| T062 tabs and toolbar | 42 unexplained px |
| T064 paused preview | 41 unexplained px |

## Editor-region convergence, 1280px Minimal Light `editor-split`

| Step | Total | Monaco (excluded) | Chrome | Preview | **Unexplained** |
|---|---:|---:|---:|---:|---:|
| Session start | 121,810 | 17,481 | 13,186 | 91,143 | 104,329 |
| Binding Minimal pane and toolbar rules | 104,189 | 17,481 | 6,609 | 80,099 | 86,708 |
| Reference preview variant + Monaco exclusion | 42,575 | 17,481 | 6,577 | 18,517 | 25,094 |
| Binding preview code-block styling | 27,490 | 17,481 | 6,577 | 3,432 | 10,009 |
| Arrangement segment keeps its binding surface | 23,597 | 17,481 | 2,683 | 3,433 | **6,116** |

Remaining, all Feature 003-owned and none masked: the Link and Image toolbar
icons, the Format/Compact/Lint label glyph prefixes, the `SEL 42W` and
`● PREVIEW · LIVE` pane metadata, the tab-strip add control, the preview code
block's text position, and the image-fallback emphasis colour.

## Analysis of the residual popup pixels

The File and Settings popup residuals are concentrated on each popup's own
antialiased outer boundary — rounded corners and the fractional right-edge
column — where an opaque popup blends with the content behind it. For the
Settings popup, 401 of 824 were outer-edge and 423 were the three theme
swatches. Those boundary pixels close when the chrome behind them converges;
they cannot be closed by changing the popup itself, and must not be masked.

## Gate state

| Gate | Result |
|---|---|
| `just frontend-build` | OK |
| `just fmt-check` | OK |
| `just lint` | OK — 0 errors, the 2 baseline `react-refresh` warnings |
| `just typecheck` | OK |
| `just frontend-test` | OK — 74 suites / 466 tests |
| `just go-vet`, `just go-test`, `just archtest` | OK |
| `just gen-check` | fails on generator file-mode drift only (100644 → 100755 on three `frontend/wailsjs/runtime/` files, no content change) |
