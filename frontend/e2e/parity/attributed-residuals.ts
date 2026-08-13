import type { AttributedResidual } from './attributed';

/*
 * Every residual below was measured per-pixel, split by cause, and written up
 * before it was declared here. The classifier used was validated first by
 * reproducing an independently recorded split exactly (Settings 1280:
 * 709 = 416 boundary + 293 interior, including the two stray pairs at x232).
 *
 * Adding an entry here is a claim that someone measured the difference and
 * proved what causes it. The mechanism enforces the rest: a pixel outside every
 * term fails the slice, and a term that grows beyond `measuredPixels` fails the
 * slice.
 */

const PHASE_18 =
  'specs/003-real-files-and-tabs/evidence/ft-vs-08/phase-18/residual-attribution.md';
const T071_EVIDENCE =
  'specs/003-real-files-and-tabs/evidence/ft-vs-08/phase-17/t071-settings-residual.md';
const GLASS_EVIDENCE =
  'specs/003-real-files-and-tabs/evidence/ft-vs-08/phase-17/t072-glass-compositing.md';
const TOOLBAR_EVIDENCE =
  'specs/003-real-files-and-tabs/evidence/ft-vs-08/phase-17/t045-toolbar-sizing-model.md';

/*
 * The boundary term, shared by every popup. An opaque surface drawn over the
 * chrome blends with it along its own antialiased rounded corners and the
 * fractional edge column. It closes when that chrome converges and cannot be
 * closed by editing the popup, which is why it is attributed rather than fixed.
 */
function popupBoundary(
  measuredPixels: number,
  evidence: string,
): AttributedResidual {
  return {
    id: 'popup-antialiased-boundary',
    cause:
      "the popup's own antialiased rounded corners and the fractional column of chrome beside them, where an opaque surface blends with what is behind it",
    evidence,
    term: { kind: 'edge-band', inset: 12 } as const,
    measuredPixels,
  };
}

export const ATTRIBUTED_RESIDUALS: Readonly<
  Record<string, readonly AttributedResidual[]>
> = Object.freeze({
  'targeted:file-menu:1280:minimal-light': Object.freeze([
    popupBoundary(181, PHASE_18),
  ]),

  'targeted:settings-menu:1280:minimal-light': Object.freeze([
    {
      id: 'liquid-glass-swatch-gradient-dither',
      cause:
        'Chromium dithers the first theme swatch’s gradient with a phase set by layerisation — production’s popup is portalled into .application-frame, the reference’s is a plain absolutely-positioned .dropdown. Identical box, identical background-image, identical border and outline; ±1 per channel alternating along the gradient axis. The two solid swatches, which need no dithering, are byte-identical — the control that makes this a diagnosis rather than a guess.',
      evidence: T071_EVIDENCE,
      term: {
        kind: 'rect',
        left: 16,
        top: 32,
        right: 104,
        bottom: 58,
        maxChannelDelta: 8,
      } as const,
      measuredPixels: 289,
    },
    {
      id: 'settings-isolated-pair-upper',
      cause:
        'an isolated pixel pair at x232, y417-418, same layerisation family, max delta 8',
      evidence: T071_EVIDENCE,
      term: {
        kind: 'rect',
        left: 231,
        top: 416,
        right: 233,
        bottom: 419,
        maxChannelDelta: 8,
      } as const,
      measuredPixels: 2,
    },
    {
      id: 'settings-isolated-pair-lower',
      cause:
        'an isolated pixel pair at x232, y483-484, same layerisation family, max delta 8',
      evidence: T071_EVIDENCE,
      term: {
        kind: 'rect',
        left: 231,
        top: 482,
        right: 233,
        bottom: 485,
        maxChannelDelta: 8,
      } as const,
      measuredPixels: 2,
    },
    popupBoundary(416, T071_EVIDENCE),
  ]),

  'targeted:settings-overflow:375:minimal-light': Object.freeze([
    popupBoundary(205, T071_EVIDENCE),
  ]),

  'targeted:view-menu:1280:minimal-light': Object.freeze([
    {
      id: 'line-numbers-toggle-edge',
      cause:
        'the Line numbers toggle’s rounded right edge, two pixels at max delta 8',
      evidence: PHASE_18,
      term: {
        kind: 'rect',
        left: 230,
        top: 181,
        right: 234,
        bottom: 186,
        maxChannelDelta: 8,
      } as const,
      measuredPixels: 2,
    },
    popupBoundary(163, PHASE_18),
  ]),

  'targeted:about-menu:1280:minimal-light': Object.freeze([
    popupBoundary(87, PHASE_18),
  ]),

  /*
   * Glass is the one whole-region term. The menubar's 220x29 differs everywhere
   * at a maximum channel delta of 7 out of 255, with every compared bound and
   * computed style identical — the Glass palette's backdrop-filter samples a
   * different backdrop in production (portalled into .application-frame) than in
   * the reference. A uniform sub-perceptual shift over identical geometry is
   * layerisation, not drawing, and the delta cap is what stops a real change
   * hiding inside it.
   */
  'targeted:closed-menubar:1280:glass-light': Object.freeze([
    {
      id: 'glass-backdrop-compositing',
      cause:
        'the Glass palette’s backdrop-filter samples a different backdrop in production than in the reference; whole region, measured max channel delta 7, every compared bound and computed style identical',
      evidence: GLASS_EVIDENCE,
      term: { kind: 'sub-perceptual', maxChannelDelta: 7 } as const,
      measuredPixels: 6186,
    },
  ]),
  /*
   * Dark measures a larger delta than light — 24 against 7 — because the
   * backdrop it samples is further from the surface drawn over it. Both caps
   * are the measured maximum, not a round number chosen for comfort.
   */
  'targeted:closed-menubar:1280:glass-dark': Object.freeze([
    {
      id: 'glass-backdrop-compositing',
      cause:
        'the Glass palette’s backdrop-filter samples a different backdrop in production than in the reference; whole region, measured max channel delta 24, every compared bound and computed style identical',
      evidence: GLASS_EVIDENCE,
      term: { kind: 'sub-perceptual', maxChannelDelta: 24 } as const,
      measuredPixels: 6380,
    },
  ]),

  /*
   * The toolbar's 177 are the three terms already characterised for T045: the
   * Format and Lint marker glyphs (65), the Link icon path approximation (41),
   * and the arrangement segment's corner arcs (71). All three are confined to
   * glyph and icon rasters with identical bounds and computed styles.
   */
  'targeted:toolbar:1280:minimal-light': Object.freeze([
    {
      id: 't045-toolbar-glyph-and-arc-residual',
      cause:
        'the Format and Lint marker glyphs rounded as two inline boxes rather than one text run (65), the Link icon path approximation (41), and the arrangement segment’s corner arcs at ≤5 channel steps with identical bounds, computed styles and ancestor compositing (71)',
      evidence: TOOLBAR_EVIDENCE,
      term: {
        kind: 'rect',
        left: 400,
        top: 5,
        right: 1015,
        bottom: 33,
        maxChannelDelta: 41,
      } as const,
      measuredPixels: 177,
    },
  ]),
});

export function attributedResidualsFor(
  key: string,
): readonly AttributedResidual[] {
  return ATTRIBUTED_RESIDUALS[key] ?? [];
}
