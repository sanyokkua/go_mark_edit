# T070 — Fail-closed File-popup parity

**Requirement**: Constitution VII; FR-FT-045, FR-FT-050, FR-FT-052, FR-FT-055, FR-FT-056.
**Branch**: `feature/v1-implementation--003-t070-file-popup-parity`.
**Status**: **not complete.** The bypass is removed and the popup now fails
closed; 218 unexplained pixels remain, all on the popup's outer antialiased
boundary. Their cause is identified below and is owned by another task.

## What the previous evidence actually proved

`file-rows.json` recorded `exact: false, accepted: true` for all six inspected
rows and `status: "passed"`. The whole-popup pixel comparison never ran:

```ts
...(entry.regionId === 'file-menu' || comparison.passed ? [] : [ ...drift ])
```

Only six rows were compared at all — about 1,100 of 125,820 pixels — and the
`os-owned-accelerator` exception silently accepted Exit and Close Tab.

## Changes

**Harness — the popup fails closed like every other slice.**
The `entry.regionId === 'file-menu'` bypass is gone. Whole-popup bounds,
computed styles and pixels now gate. The accepted platform exception is
restricted to `new-file`, `open-file`, `save`, `save-as`; `close-tab` and `exit`
no longer qualify, and the `os-owned-accelerator` exception is deleted. Accepted
pixels are subtracted by **bounded rectangle** (the reference `.k` box
translated into popup coordinates), not by subtracting per-row totals.

The whole row inventory — label, availability and order — is now paired between
reference and actual, and the two recent rows are asserted by name.

**Harness — deterministic scroll.** Both documents are taller than the 720px
parity viewport. Clicking the document area during the dismissal check scrolled
the application page by 28px, and every later page-coordinate measurement read
that back as production geometry drift (`bounds.top: 173 != 145`). The
application page's prepared scroll offset is now recorded once and restored
before each capture, as FR-FT-054's identical-scroll condition requires. The
reference page's behaviour is unchanged. The outside-click point is now derived
from the popup's measured box instead of a fixed offset that had come to sit
underneath the popup.

**Reference — a Feature 003 `file-menu` variant (FR-FT-056).**
`adaptReferenceHtml` now rewrites `#m-file` from the mockup's own primitives
(`.mi`, `.mi.sub`, `.lab`, `.sep`, `.k`, `<svg class="ic"><use href="#i-file"/>`)
to express this feature's File-menu contract: no recent folder (FR-FT-042),
`Reopen last file` (FR-FT-041/T049), New Window / Open Folder… / Export to PDF…
visibly unavailable, and Feature 003's own accelerators — including reopen's
deliberate `Ctrl/Cmd+Shift+Alt/Option+T` and OS-owned Exit. The four rows the
specification's T059 decision preserves as literal `Ctrl` text are left exactly
as the immutable source writes them, so the reviewed macOS accelerator-glyph
exception remains the only accepted pixel difference.

The mockup HTML/CSS is not edited; the raw source hash is unchanged and is still
asserted on every navigation.

**Production — converged to the binding dropdown.**

- The popup is portalled into `.application-frame` and anchored at the binding
  coordinates `left:96px; top:42px` (`#m-file{left:96px}` + `.dropdown{top:42px}`),
  replacing collision-aware placement and the tuned `--file-menu-popup-offset`.
- Width is `max-content` over `min-width:250px`, as the binding dropdown is,
  instead of a pinned `269.5625px`.
- The separate Open Recent trigger row is gone: the binding renders the group
  label plus one indented row per recent file. Those rows carry the binding
  `#i-file` glyph and dispatch the canonical `open-recent` command.
- A `file` icon was added to the local sprite and `Icon` primitive with the
  binding's own 24-unit geometry, so its rendered stroke matches.
- `.separator`, `.groupLabel` and `.item::after` now use the binding's
  `--stroke-soft`, `--faint`, `5px 4px` margin and `.09em` tracking.
- A row with no accelerator no longer emits an empty `::after`; that pseudo
  element was a third flex item whose auto margin defeated the row's
  space-between flow and left recent labels left-aligned.
- The parity File-menu route seeds the two binding recent files so the compared
  popup shows real, dispatchable entries.

## Measured result

| Run                                          | Unexplained pixels | Notes                                 |
| -------------------------------------------- | -----------------: | ------------------------------------- |
| Before (bypass removed, nothing else)        |             10,155 | whole popup never previously compared |
| After reference variant + row pairing        |              4,343 | inventory and heights match           |
| After binding coordinates and row flow       |              1,031 | all bounds and computed styles match  |
| After bounded-rectangle exception accounting |            **218** | see below                             |

Bounds and all 24 compared computed-style properties match exactly. Per-row
differences: none. Accepted platform exceptions: 4 (`⌘N`, `⌘O`, `⌘S`, `⌘⇧S`).

## Where the remaining 218 pixels are

Raw differing pixels: 813. Accepted accelerator rectangles: 595. Unexplained:
218, distributed as:

- **119** in the popup's fractional right-edge column (`x >= 249`).
- **~99** in the four rounded corners (`x 0–11` and `x 238–248`, `y 0–8`).

Both regions are the popup's own antialiased outer boundary. The popup is opaque
and both pages place it at the identical fractional coordinate
(`left 116.203`, width `250.5625`), so its own rasterisation is identical; the
boundary pixels blend the popup edge with **the content behind it**. That
content is the tab strip and editor region, which has not converged yet.

**This residual is therefore owned by T045 (fixed editor-region geometry) and
T073 (tab strip), not by the File popup.** It cannot be closed by any change to
the popup itself, and it must not be masked: the correct closure is to converge
the editor region and re-run this slice.

## Green checks

- `npm --prefix frontend test -- --runInBand` — 74 suites / 464 tests passed.
- `npm --prefix frontend run typecheck` — clean.
- `just archtest` — `archtest (frontend): ok`.

## Real-application validation

Dev application at `http://127.0.0.1:4173/?parity-case=primary:menu-file:1280:minimal-light`,
1280x720. Opened the File popup through the real menubar control:

```json
{
  "relLeft": 96,
  "relTop": 42,
  "w": 250,
  "h": 427,
  "items": [
    { "t": "New File", "d": false, "s": "⌘N" },
    { "t": "New Window", "d": true, "s": null },
    { "t": "Open File…", "d": false, "s": "⌘O" },
    { "t": "Open Folder…", "d": true, "s": null },
    { "t": "release-notes.md", "d": false, "s": null },
    { "t": "spec-draft.md", "d": false, "s": null },
    { "t": "↺ Reopen last file", "d": true, "s": "⌘⇧⌥T" },
    { "t": "Save", "d": false, "s": "⌘S" },
    { "t": "Save As…", "d": false, "s": "⌘⇧S" },
    { "t": "Export to PDF…", "d": true, "s": null },
    { "t": "Close Tab", "d": false, "s": "⌘W" },
    { "t": "Exit", "d": false, "s": null }
  ]
}
```

The popup resolves to exactly the binding `left:96px; top:42px` inside the
application frame. `Escape` dismissed it and returned focus:
`{"open":false,"focused":"File"}`.

No mask, tolerance, comparator, coordinate handling, protected parity control,
mockup file, or architecture allowlist was changed.
