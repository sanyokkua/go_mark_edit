# Phase 17 session status

## Task status after this session

| Task | Status | Evidence |
|---|---|---|
| T069 Settings localization | **complete** | `t069-settings-localization.md` |
| T070 File-popup fail-closed parity | open — 218 → 181 unexplained px | `t070-file-popup-parity.md` |
| T045 editor-region geometry | open — 121,810 → 104,189 px; structural finding | `t045-editor-region-geometry.md` |
| T071, T072, T073, T074, T075 | not started | — |
| T065, T066, T067, T068 | not started | — |
| T035–T039, T044, T054 | not started | — |

## Targeted slice results after this session

Every targeted slice now gates on whole-region geometry, computed styles and
pixels. The previously recorded "passed" and "non-gating diagnostic" states are
gone; each slice reports a small, precise residual instead.

| Slice | Result |
|---|---|
| T058 closed menubar, glass-light | 6,187 unexplained px (Glass drift — T072) |
| T059 File popup | 181 unexplained px (popup boundary — blocked on T045/T073) |
| T060 Settings popup | 824 unexplained px (T071) |
| T061 View popup | `bounds.left: 216.203 != 222` (T072) |
| T062 tabs and toolbar | 42 unexplained px (T073) |
| T064 paused preview | 41 unexplained px (T074) |

The View and About popups are still placed by collision-aware Radix positioning
rather than the binding coordinates (`#m-view{left:196px}`,
`#m-about{left:240px}`, `.dropdown{top:42px}`). The File popup's conversion in
this session is the worked pattern for both.

## Gate state

Run at the tip of this branch:

| Gate | Result |
|---|---|
| `just frontend-build` | OK |
| `just fmt-check` | OK |
| `just lint` | OK — 0 errors, the 2 baseline `react-refresh` warnings |
| `just typecheck` | OK |
| `just frontend-test` | OK — 74 suites / 464 tests |
| `just go-vet` | OK |
| `just archtest` | OK |
| `just go-test` | OK |
| `just gen-check` | **fails on generator file-mode drift only** |

`just gen-check` reports `frontend/wailsjs/runtime/{package.json,runtime.d.ts,runtime.js}`
changing mode `100644 → 100755` after `wails generate module`. No content
changes. T008's evidence line already anticipates inspecting generator-owned
mode drift rather than hand-editing it. The working tree is restored to the
committed modes.

## Open decision needed before T035/T068 can close

The reviewed mapping for the four editor-region families compares
`#app.no-assistant .content`, which contains the mockup's rich-rendering
widgets and its hand-written editor text. `spec.md` requires rich-rendering
results to be "excluded rather than reproduced", says deferred rich-rendering
widgets "are not manufactured for parity", and assigns Monaco to Feature 002.
93.7% of the remaining editor drift is in exactly those two areas. See
`t045-editor-region-geometry.md` for the measurement and the two
source-preserving options.

This is a contradiction between the reviewed mapping and the specification,
outside the approved T075 resolution, and it cannot be closed in code without
weakening a protected control.
