# T195 resolved — the band was Monaco's scrollbar, not the renderer

**Task:** T195, opened by T186 clause 11. **Date:** 2026-08-19.
**Verdict: there is no native-host difference.** The band was a hover state captured
differently on the two sides. The clause 11 measurement is corrected accordingly.

## What the band actually is

The task listed three candidates — pane divider, editor scrollbar track, or overlay scrollbar
— and required that the answer be determined rather than guessed. It is none of them exactly.

`document.elementFromPoint` across the band's x range returns
**`canvas.decorationsOverviewRuler`**, Monaco's decorations overview ruler, at `x = 533`,
width 14 pt — 1066–1094 device px, matching the measured band (1067–1093).

But the canvas is not what paints it. Reading its own pixels through `getContext('2d')`
returns **`[0, 0, 0, 0]`** at every sample: fully transparent, which is correct for an empty
document with no decorations. The colour comes from what shows _through_ it — Monaco's
**vertical scrollbar slider**, `background: rgba(255, 255, 255, 0.2)`, occupying the same
band.

## Why the two sides differed

The slider's parent toggles on pointer hover, and the arithmetic closes exactly:

| Pointer         | Parent class                        | Parent `opacity` | Pixel over the `20,20,22` pane |
| --------------- | ----------------------------------- | ---------------- | ------------------------------ |
| away            | `invisible scrollbar vertical fade` | `0`              | `22,22,28`                     |
| over the editor | `visible scrollbar vertical`        | `1`              | `69,69,73`                     |

`rgba(255,255,255,0.2)` composited over `20,20,22` is `0.2×255 + 0.8×20 = 67` — the host's
measured `67,67,69`. The browser's `48,48,50` sits between the hidden and shown values,
because the clause 11 browser capture was taken shortly after a **mouse drag** (resizing the
workspace to equalise it), so the slider was mid-fade when the screenshot was taken.

So neither figure was a property of a renderer. One side had the pointer resting over the
window, the other was three seconds into a CSS opacity transition.

## Confirmed by controlling it on both sides

Re-captured with the pointer parked away from the editor on both sides, and the browser's
slider verified as `invisible scrollbar vertical fade`, `opacity: 0` at the moment of capture.
On the host, the band reads `20,20,22` at every sampled x — identical to the surrounding pane.

|                | clause 11 as first measured | with the slider controlled |
| -------------- | --------------------------- | -------------------------- |
| identical      | 90.08%                      | **91.18%**                 |
| within ±16     | 7.70%                       | 7.73%                      |
| differing > 16 | 2.22%                       | **1.09%**                  |
| — divider band | 28,000 px                   | **217 px**                 |
| — frame edges  | 11,042 px                   | 11,095 px                  |
| — glyph edges  | 15,313 px                   | 15,338 px                  |

The band collapses by **99.2%**. The two categories that survive are unchanged, which is the
check that nothing else moved: only the slider did.

## Classification, corrected

Under `coverage-ledger.md` Claim 3's taxonomy this is **capture non-determinism**, not a
native-host difference. T186's clause 11 entry claimed the latter; that claim is withdrawn.

**After the correction, no native-host difference remains in the measurement at all.** Every
differing pixel is either the boundary between a rounded native window and a rectangular
viewport capture, or glyph antialiasing. WKWebView and Chromium agree on this shell.

## The method now carries a third state variable

Clause 11 already required equalising `appearance.theme` and `layout.workspace.width`. It
needs a third: **the Monaco scrollbar hover state**. Park the pointer away from the editor and
allow the fade to complete — about 3–4 seconds — before capturing, on both sides, and assert
the slider's parent is `invisible … fade` at capture time rather than assuming it.

This one is nastier than the other two because it is not a persisted setting anybody would
think to check, and because it is **mid-transition** values that do the damage: a fully shown
or fully hidden slider differs obviously and would have been spotted, while a half-faded one
produces a plausible-looking constant delta that reads exactly like a renderer difference.

Note also that equalising one variable _created_ this one: the drag that matched the workspace
width is what showed the scrollbar. Controlling comparison state is not a checklist run once —
each control can disturb another.

## Files

- `host-webview-pointer-away.png`, `browser-pointer-away.png`, `diff-pointer-away.png`
- The originals (`host-webview.png`, `browser-eq.png`, `diff-eq.png`) are kept, since the
  correction is only legible against them.
