# Phase 19 appearance baseline investigation

The first focused appearance rerun reproduced a 13-pixel minimal-light screenshot mismatch.
The diagnostic record located every differing source pixel in the Monaco vertical scrollbar rectangle
at x=753–766 and y=207–678. The scrollbar reported the `invisible` class and opacity `0`; the approved
snapshot records the same scrollbar visible. This was a transient Monaco auto-hide state, not a token,
font, viewport, menu, or palette-layout difference.

`appearance.test.ts` now forces only that pre-existing scrollbar's opacity to `1` in the screenshot
harness, then asserts the controlled state before capture. No product CSS, snapshot, or screenshot
tolerance changed. The focused suite passed twice after the change, and the full 148-test browser run
passed. See `phase-19-appearance-failure.raw.log` and `phase-19-appearance-success.raw.log`.
