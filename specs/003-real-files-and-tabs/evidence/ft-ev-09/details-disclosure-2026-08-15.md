# T113 — the `Document details` disclosure paints, and T108's reason with it

Date: 2026-08-15. Branch `feature/v1-implementation--003-t113-details-visibility`, based on
`19e8ff44`. Host: darwin 25.5.0.

Follows `readonly-reason-2026-08-15.md`, which landed T108's derivation and copy and then found that
the surface they live in opens nothing on the packaged binary.

## Headline

The disclosure was clipped to nothing by its own status row, on every engine. Three test layers
called it verified and none of them could see it. The fix is structural, the row's measured box is
unchanged, and the assertion that now guards it is one that hit-tests painted output rather than
reading the DOM.

## 1. The defect

`.statusBar` (`frontend/src/ui/components/StatusBar.module.css`) is `position: relative` with
`overflow: hidden` and `height`/`max-height: var(--status-bar-min-height)` — 28px. `.details` was
`position: absolute` inside it, pushed out by
`transform: translateY(calc(-100% - var(--status-bar-min-height)))`.

`.statusBar` being `position: relative` makes it the **containing block** for that absolutely
positioned child, and `overflow` clips exactly those descendants whose containing-block chain passes
through it. A transform moves paint; it does not re-parent the containing block. So the panel
rendered, sat in the accessibility tree, was reachable by `aria-controls`, and painted nothing.

## 2. Why three layers passed

- **Playwright text assertion.** `targeted-parity.test.ts` asserted `toContainText('Read-only')`.
  That reads the text tree and never consults layout.
- **Playwright visibility assertion.** `real-files-and-tabs.test.ts:286` already asserted
  `toBeVisible()` **on this exact region**, and passed, for the entire time the panel was invisible.
  T113's entry predicted `toBeVisible` would have caught this; it does not. Playwright defines
  visible as *a non-empty bounding box and no `visibility: hidden`*, and a clipped box still has a
  bounding box. This is the correction that matters most: the recorded lesson "use `toBeVisible` for
  anything that must be seen" is not sufficient for a clip.
- **jsdom.** `StatusBar.test.tsx` and `AppShell.test.tsx` have no layout at all.

## 3. The assertion that does see it

`frontend/e2e/painted.ts` — `expectPainted(locator, label)` hit-tests the painted output with
`document.elementFromPoint` at the element's centre and requires the topmost paint there to be the
element or a descendant.

Red-first, before any fix, on the unmodified production CSS:

```
Error: the Document details region at 375px is laid out at (236, 651.5) but the topmost paint
there is div[role="presentation"]. It is clipped away or covered, and neither toBeVisible() nor
toContainText() can see that (T113).
   at e2e/painted.ts:58
   at e2e/real-files-and-tabs.test.ts:297
```

`toBeVisible()` on the line above it passed in the same run — the failure is reached only because
the visibility assertion let it through. The same red was reproduced in the parity route
(`T063 … 1280px Minimal Light`, `targeted-parity.test.ts:1672`).

`div[role="presentation"]` is the Monaco editor: the panel's own coordinates were painting editor,
which is what "clipped away" looks like from a hit test.

## 4. The fix, and the option that was rejected

Three options were on the table in T113's entry.

**(a) `overflow: visible` on `.statusBar` — rejected, but not for the stated reason.** The entry says
`overflow` is in `METRIC_PROPERTIES` and so is compared against the reference. It is in that list,
but the list only runs where a reference/actual pair is measured, and the status row has no such
pair: all six editor-status states are in `BEHAVIOUR_VERIFIED_STATE_IDS`
(`e2e/parity/manifest.ts`), `targeted-manifest.ts` fails any targeted comparison case naming one,
and no manifest selector reaches the row. The real cost is the one recorded in `AGENTS.md` — a
scroll container is a composited layer in Chromium, and dropping it changes glyph antialiasing
across the row. The clip is also load-bearing in its own right: `narrow-width.test.ts` T084 measures
`scrollWidth <= clientWidth` on the row at four widths to prove it sheds status items instead of
wrapping.

**(b) portal into `.application-frame`, as `ViewMenu` and `EditorChrome` do — rejected.** Those
popups portal because they are placed by binding coordinates *in the frame*; this disclosure is
placed by the row it belongs to. The frame's right edge is not the row's right edge — `.shell`
reserves `--shell-assistant-collapsed-width` to the right of `.document` — so a frame-anchored panel
needs offset arithmetic that re-breaks whenever the shell columns change. `.application-frame` also
does not exist in the jsdom unit renders, so the unit layer would test a different DOM from
production.

**(c) a positioned dock — taken.** `<footer role="status">` is unchanged: same box, same
`overflow: hidden`, same 28px flex sizing, same `data-status-state`, same children. It gains a
parent, `<div data-status-dock>`, which is `position: relative` and does not clip; the panel is now
a sibling of the row inside that dock, anchored with `bottom: 100%`.

The dock is a pass-through by construction — it is the flex item the row used to be, exactly as
tall, and it is itself a flex container so the row stays a flex item and its `min-width: auto`
resolves as before (the drift trap in `AGENTS.md`). `.details` also lost its `transform`, which had
placed the panel a full row-height above the row rather than flush on it.

Everything T063 measures on the `role="status"` element — height 28, `bottom === shellBottom`,
`white-space`, `scrollWidth <= clientWidth`, the `--faint` token on the row and every item — is
measured on the same element, with the same clip, and is unchanged. T084's four widths likewise.

## 5. What it cost

The region is no longer a DOM descendant of the row, so six `within(status)` queries became
`screen`/`page` queries (`StatusBar.test.tsx` ×4, `AppShell.test.tsx` ×2). That cost is common to
(b) and (c) alike: to stay inside the row, the region needs the row not to clip, which is option
(a). The disclosure relationship never required containment — `aria-controls` and `aria-expanded` on
the trigger state it — and it is now pinned explicitly by
`T113 docks the details region beside the row, outside the row that clips it`
(`StatusBar.test.tsx`), which asserts the sibling arrangement, the trigger wiring, and that the row
keeps its `overflow: hidden` while the dock has none.

`AppShell.test.tsx`'s T042 placement assertion was tightened rather than loosened: it asserts
through the dock (`status.parentElement` is the dock, the dock's parent is the document area) rather
than relaxing to a `contains` check, so the "inside the document area, not full width beneath the
sidebar" contract still holds exactly.

## 6. Gates

| Gate | Baseline | This branch |
|---|---|---|
| `just check` | exit 0, 551 tests / 77 suites | exit 0, **552 tests / 77 suites** (+1: the T113 structural test) |
| `just e2e-test` | 259 passed | exit 0, **259 passed**, parity accounting **150/150** |

All six T063 palette cases pass, each three times (`repeatEach: 3` on the parity project). `T026` did
not need a re-run — every shell-matrix case passed first time.

The six `status-read-only` `status.json` files under
`evidence/ft-vs-08/parity/targeted/editor-status/*/` were deleted before re-running: T063's
assertion list changed on purpose, and the test compares against the list the previous run left on
disk (`targeted-parity.test.ts`). No other state's list changed.

## 7. Host walk

**Stale-instance guard.** Any running instance was killed before the build, because `open` raises the
old process rather than starting the new one.

| | Time |
|---|---|
| `build/bin/GoMarkEdit.app/Contents/MacOS/GoMarkEdit` mtime | 2026-08-15 **16:26:51** |
| process 4382 start (`ps -o lstart`) | 2026-08-15 **16:27:07** |

Sixteen seconds later, and a different second from the binary's — the earlier walk in
`readonly-reason-2026-08-15.md` noted that sharing the binary's second is not a guard. PID 4382 was
still the process for the whole walk, including after `open -a … boundary-10mib-plus-one.md` (which
the app does not act on — the file was opened from `File ▸ Open Recent` instead).

**What was observed.** Autosave off. Window moved to (10, 50) at 840×760 points, because the status
row otherwise sits inside the screen's bottom Dock strip.

| Document | Panel contents |
|---|---|
| `boundary-10mib-plus-one.md`, **10,485,761 bytes** (10 MiB + 1, inside FR-FT-005's band) | `UTF-8` `LF` `Read-only` `Autosave off` — and **`Read-only · over the 10 MiB editing limit`** |
| fresh `⌘N` `Untitled` | `UTF-8` `LF` `Not saved` `Autosave off`, and correctly no read-only line |

The panel paints flush above the status row, wrapping to a second line at this window width. Captures:

- `host-screenshots/t113-details-open-10mib-2026-08-15.png`
- `host-screenshots/t113-details-open-new-document-2026-08-15.png`

Both are `screencapture -x -o -l <windowID>` window-ID captures, per the method
`host-screenshots/README.md` requires. A first attempt used `screencapture -R` and included an
unrelated overlapping window; those files were replaced rather than committed, which is the same
correction that README already records for the first three host captures.

**This settles both clauses.** T113: the disclosure opens on the packaged binary, for a read-only
document and for a writable one. T108: FR-FT-005's "visible reason" is visible — on the real binary,
driven by the real Go `capability`, on a file inside the 10–50 MiB band.

The title bar still reads `gomarkedit-walkthrough / boundary-10… Read…`, ellipsised at the binding's
own `max-width: 40ch`. That is the surface T108 deliberately reverted the reason out of, and this
walk confirms the reason for that decision unchanged: the title bar cannot even hold `Read-only` in
full at this width, let alone a reason.
