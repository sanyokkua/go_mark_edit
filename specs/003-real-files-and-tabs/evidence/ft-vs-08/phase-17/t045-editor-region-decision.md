# T045 — Editor-region decision implemented

**Decision**: `spec.md` Clarifications, Session 2026-08-13, first entry.
**Branch**: `feature/v1-implementation--003-t071-settings-parity` (continues the
T045 work committed on the previous branch).

## What the decision says

The mapped editor region stays compared whole, with the two pane interiors split
by owner:

- **Preview pane** — the Feature 003 reference variant carries the same in-scope
  basic-preview content the application renders, using only the mockup's own
  `.preview-in` primitives. The deferred rich-rendering widgets (remote-content
  banner, image placeholder, KaTeX, Mermaid) are removed from the reference
  rather than manufactured in production.
- **Editor pane** — Monaco owns its text raster, gutter metrics and internal
  layout under Feature 002, so its interior is a **named reviewed region
  exclusion**, not a mask. Its bounds and computed styles are asserted exactly
  on both pages, and the pane shell, header and metadata stay compared.

## Implementation

`frontend/e2e/parity/reference-adapter.ts` — `adaptPreviewPane` replaces the
`.preview-in` demonstration content with `IN_SCOPE_PREVIEW_CONTENT` for every
variant. It fails closed if the source preview region ever loses one of its
deferred-widget markers (`imgph`, `mermaid`, `katex`), so a mockup change cannot
silently turn the adaptation into a no-op. The binding typography
(`.preview h1/h2/p/ul/li/blockquote/pre`) and the raw source hash are untouched.

`frontend/e2e/real-files-parity.test.ts` — `MONACO_EDITOR_INTERIOR` declares the
exclusion with its owner, reason, and both selectors. Before the pixel count the
runner asserts the excluded region's bounds and all compared computed styles
match on both pages, then subtracts only the differences that fall inside it.
The exclusion is attached to `editor-split`, `editor-only` and
`toolbar-overflow`; `preview-only` deliberately has none.

Production convergence in the same pass:

- `.preview pre` now carries the binding's surface, border, radius, margin and
  12px monospaced treatment, and a nested `code` no longer adds a second inline
  padding step.
- The Minimal toolbar-group override is scoped to `.group:not(.arrangement)`.
  The binding overrides `.tgrp` under Minimal but not `.seg`, so the arrangement
  segment keeps its surface, border and 3px padding.

## Measured effect — 1280px Minimal Light, `editor-split`

Mapped region bounds and every compared computed style matched throughout. The
excluded Monaco region measured identically on both pages:

```
refEditorBox {"x":236.203125,"y":302,"width":511.296875,"height":418.1875}
actEditorBox {"x":236.203125,"y":302,"width":511.296875,"height":418.1875}
```

| Step                                          | Total differing | Monaco (excluded) | Chrome | Preview | **Unexplained** |
| --------------------------------------------- | --------------: | ----------------: | -----: | ------: | --------------: |
| Before this session                           |         121,810 |            17,481 | 13,186 |  91,143 |         104,329 |
| Binding Minimal pane/toolbar rules            |         104,189 |            17,481 |  6,609 |  80,099 |          86,708 |
| Reference preview variant + Monaco exclusion  |          42,575 |            17,481 |  6,577 |  18,517 |          25,094 |
| Binding preview code-block styling            |          27,490 |            17,481 |  6,577 |   3,432 |          10,009 |
| Arrangement segment keeps its binding surface |          23,597 |            17,481 |  2,683 |   3,433 |       **6,116** |

## What remains in this region

- **~2,683 chrome pixels**: the Link and Image toolbar icons, the
  Format/Compact/Lint label glyph prefixes, the `SEL 42W` and `● PREVIEW · LIVE`
  pane metadata, and the tab-strip add control.
- **~3,433 preview pixels**: the code block's text position inside the now
  correctly styled block, and the image-fallback emphasis colour.

Both are Feature 003-owned and remain open; neither is masked or waived.

## Gates

- `npm --prefix frontend test -- --runInBand` — 74 suites / 466 tests passed
  (two new adapter tests: in-scope preview content, and fail-closed on a lost
  deferred-widget marker).
- `just typecheck`, `just fmt-check`, `just lint` (0 errors), `just archtest` — green.
