# SC-FT-011 clause 11 — the native webview compared with the same-browser result

**Task:** T186, clause 11. **Date:** 2026-08-19.
**Build:** `just build` at `bcf0b548`, binary mtime `09:00:31`; the instance under test was
launched after that, with no GoMarkEdit process alive beforehand.

## Why this comparison exists

The parity contract is proven **in Chromium**. Users see a **macOS WKWebView**. Nothing in
the tree had ever checked that those two render the same thing, so the parity guarantee
stopped at the browser and no artifact said how far it carried. `host-screenshots/README.md`
is explicit that its captures "are *not* parity references… and no comparator reads them".
This is the first measured comparison.

## Method

| | Host | Browser |
|---|---|---|
| Surface | packaged `GoMarkEdit.app`, WKWebView | Chromium via Playwright |
| Capture | `screencapture -x -R 352,105,840,760` | `page.screenshot`, `deviceScaleFactor: 2` |
| Geometry | 840×760 pt window, native title bar cropped (64 device px, a sharp transition from mean luminance 253.9 to 15.5) | viewport 840×728 pt |
| Result | 1680×1456 px | 1680×1456 px |

Both sides therefore describe the same 840×728 pt webview area at 2× and are compared
pixel-for-pixel with no scaling.

## The first run was invalid, and saying so is the point

The first comparison returned **0 pixels identical** and a mean signed delta of
(−4.6, −4.5, −10.7). That reads exactly like a colour-management difference between
`screencapture` and Chromium, and it would have been recorded as a native-host difference.

It was neither. The host's persisted settings are `appearance.theme = minimal`; the browser
had come up in `material`. Two different palettes were being compared. A second state
variable was also unequal: `layout.workspace.width` is `255` on the host and the browser
starts at `216`, a 39 pt offset that shifted every element right of the sidebar — visible in
the first diff as text rendered **twice**, once at each position.

Both were equalised through the application's own paths — the Settings menu for the palette,
a drag of the workspace separator for the width — rather than by patching attributes.

**Neither variable was checked before the first run, and neither is a renderer property.**
A comparison of two surfaces in different states measures the states.

## Result, with both states equalised

| | pixels | share |
|---|---|---|
| identical | 2,203,491 | **90.08%** |
| within ±16 | 188,234 | 7.70% |
| differing > 16 | 54,355 | **2.22%** |

Flat background patches are **exactly equal** — left gutter `25,25,25` both sides, preview
background `20,20,22` both sides. That is the negative result that kills the colour-profile
hypothesis outright: if `screencapture` and Chromium disagreed about colour, large flat areas
would be the first place it showed, and they agree bit-for-bit.

## The residual, classified

`coverage-ledger.md` Claim 3's four-way taxonomy, applied. The 54,355 differing pixels
partition cleanly, which is itself evidence that they are understood rather than assumed.

| Cause | pixels | Taxonomy |
|---|---|---|
| Divider / scrollbar band, `x` 1067–1093 | 28,000 | **native-host difference** |
| Outer frame edges (`x < 4`, `x ≥ W−6`, `y < 4`, bottom row) | 11,042 | capture boundary |
| Glyph edges throughout | 15,313 | composited-layer artefact |

**1. The one real renderer difference (28,000 px, 51% of the residual).** A vertical band
27 device px wide spans 1,036 rows. It is at **identical geometry on both sides** — the
columns either side read `20,20,22` in both — but its colour differs: **host `67,67,69`,
Chromium `48,48,50`**. Same layout, different paint. This is a native-host difference in the
strict sense, and per the clause it is **not an automatic pass**: it is recorded below as
something to resolve, not waved through.

**2. Frame edges (11,042 px).** The native window has rounded corners and a border; the
browser screenshot is a plain rectangle. A boundary artefact of comparing a window capture
with a viewport capture, not a property of either renderer.

**3. Glyph edges (15,313 px).** Confined to text, on glyphs at matching positions — the same
signature the parity comparator already treats as antialiasing, and the same reason
`residual-attribution.md` carries `popup-antialiased-boundary`. WKWebView and Chromium do not
rasterise identically.

## What this settles, and what it does not

**Settles.** The webview and Chromium agree on layout to the pixel once state is equalised —
90.08% identical, backgrounds bit-exact, no positional drift anywhere after the workspace
width was matched. The parity contract's geometry does carry from the browser to the native
host. That was previously unknown in both directions.

**Does not settle.**

- **The divider colour difference is unexplained.** 19 levels lighter in WKWebView at
  identical geometry. Whether it is an overlay-scrollbar style resolving differently, a
  system-dependent colour, or a token the webview resolves differently is not established.
  Filed as **T195** rather than classified as benign.
- **One state, one palette, one window size.** `minimal`/`dark`, 840×728, one Untitled
  document. Five other palettes, both other widths, and every populated document state are
  uncompared.
- **The browser side runs the mock bridge.** For chrome geometry that is adequate — the
  shell does not vary with the bridge — but any comparison involving real document content
  would inherit the mock-divergence limitation recorded in `KNOWN_ISSUES.md`.
- **This is not a parity claim.** Neither side is compared to the binding mockup here; this
  compares the two renderers to each other.

## Files

- `host-webview.png` — the WKWebView, native title bar cropped
- `browser-eq.png` — Chromium, palette and workspace width equalised
- `diff-eq.png` — red = differs by more than 16 on any channel, green = within 16, black = identical
