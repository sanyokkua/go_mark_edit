# Phase 21 T093 real-control evidence

Captured 2026-08-06 on the current macOS arm64 host. This is a fresh evidence
record for T093 and does not replace `phase-21-t093-live-attempt.md` or
`phase-21-t093-partial.md`. No product or test source was changed.

## Commands and artifacts

- `just dev` completed its Wails startup sequence after the unchanged recipe was
  rerun with local Go-cache access. The runner was stopped intentionally with
  Ctrl-C after the walkthrough; its final process status was 130 because of
  that interruption.
- `just build` exited 0 for `darwin/arm64` and produced
  `build/bin/GoMarkEdit.app/Contents/MacOS/GoMarkEdit` (16,250,208 bytes,
  executable mode 0755).
- `just gen` exited 0 after the dev/build cycle. The generated runtime mode-only
  changes were removed; the tracked worktree has no remaining diff.
- Fresh screenshots retained here are:
  `phase-21-t093-real-1280-glass-dark.jpeg`,
  `phase-21-t093-real-768-glass-dark.jpeg`,
  `phase-21-t093-real-375-glass-dark.jpeg`, and
  `phase-21-t093-package-framed.jpeg`.

## Real Wails development bridge

The native window reported `wails://wails.localhost:34115/`, confirming the
real `just dev` Wails surface. The native accessibility walk operated File,
Settings, View, About, Editor/Split arrangement, the functional sidebar,
visual tabs, toolbar controls, the right-click editor context menu, and the
deferred controls. The real editor changed `T093 proof` to `**T093 proof**`
through Bold and restored the exact source with native Cmd+Z in one step. The
context menu exposed exactly Cut, Copy, Paste, Paste as plain text, Bold,
Italic, Link, disabled Format document, disabled Compact, and disabled
Command palette. Image, Format, Compact, Lint, Toggle Assistant, reading mode,
File lifecycle entries, and visual tab controls remained unavailable/deferred.

The real Wails page was then exercised through the controlled browser surface
at `http://localhost:34115/` (the same dev bridge, not `just dev-ui`) at all
three required widths. Every palette/mode selection returned authoritative
root state, page-scroll, and blur values:

| Width | Six palette results | Page scroll | Tab-strip result |
|---|---|---:|---|
| 1280 | Glass Light/Dark → `theme=glass`, `blur(28px) saturate(150%/160%)`; Material and Minimal Light/Dark → `blur=none` | 1280/1280 | contained `overflow-x:auto`, 988/988 |
| 768 | Same six root/blur results | 768/768 | contained `overflow-x:auto`, 698/698 |
| 375 | Same six root/blur results | 375/375 | contained `overflow-x:auto`, 512/351 |

At 1280 the real File, Settings, View, and About menus opened and their
measured surfaces stayed within the viewport. At 768 the real toolbar overflow
was opened and exposed the relocated controls. At 375 the real shell overflow
opened File, Settings, View, and About; measured menu rectangles were all
viewport-contained: File `206.94×454.5` at `(12,45.5)`, Settings `367×656` at
`(8,53.5)`, View `116.77×417` at `(13,47)`, and About `194.54×144` at
`(12,45.5)`. The 375 toolbar overflow exposed the relocated formatting and
arrangement controls without page-level horizontal scroll.

Real editor context menus were also opened at 1280, 768, and 375. Each had
the ten-item inventory above; the measured bounds were `224×367` at
`(648,313)` for 1280, `224×367` at `(204,313)` for 768, and `224×372` at
`(99,273)` for 375. A real 375 keyboard journey typed `T093 proof`, invoked
Cmd+B, observed `**T093 proof**`, and restored `T093 proof` with Cmd+Z.

The browser context did not expose `window.performance`, so an independent
PerformanceResourceTiming zero-request count could not be collected. No
external request was visible during the run, but this record does not promote
that observation to instrumented ED-LIVE-004 proof.

## Fresh packaged current-host walk

The freshly built package launched with `wails://wails/` and displayed the
ordinary framed native window. File, Settings, View, About, arrangement
Editor/Split, sidebar, visible tabs, formatting, and all deferred controls
were operated again. The package changed `T093 package` to
`**T093 package**` through Bold and restored it with Cmd+Z. The native window's
zoom secondary action succeeded. The View → Full screen command removed the
native frame and was then invoked again to restore the framed window. A fresh
framed package screenshot is retained above.

The native close button was clicked. The controller's subsequent state request
returned a fresh `wails://wails/` window with the default empty document; the
controller transparently relaunches an app when queried, so process-lifetime
close proof is recorded as controller-limited rather than overstated.

Native titlebar movement and right-edge resize were attempted. The first
movement attempt returned the controller error `noWindowsAvailable`; after the
window's exposed Raise action, a retry returned no error but supplied no
authoritative bounds change, and the resize attempt likewise supplied no
authoritative bounds change. Movement and manual resize therefore remain
unverified. Windows/Linux runtime and package-minimum-size limits were not
inferred from this macOS host.

## T093 verdict

**Not complete.** Fresh real-bridge responsive/palette/control evidence and a
fresh packaged build with zoom/fullscreen/close attempts are retained, but the
named native movement/resize proof and instrumented local-only request audit
remain incomplete. T093 stays unchecked until those current-host observations
can be captured without weakening the evidence requirement.
