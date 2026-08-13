import type { PngComparison } from './comparator';

/*
 * Attributed residuals — the mechanism behind the 2026-08-13 clarification that
 * a visual parity check passes when every differing pixel has a written, proven
 * cause, rather than when the count is literally zero.
 *
 * THIS IS NOT A MASK, and the difference is the whole point:
 *
 *   - A mask deletes pixels from the count. Nothing reports them, and drift
 *     inside a masked area is invisible forever.
 *   - An attributed term COUNTS its pixels, names its cause, cites the evidence
 *     file that measured it, and carries the measured ceiling. A pixel outside
 *     every term still fails the slice. A term that grows beyond what was
 *     measured still fails the slice.
 *
 * So this can only ever excuse a difference that someone measured, explained in
 * writing, and bounded. It cannot excuse a new one.
 */

export type AttributedTerm =
  /*
   * The antialiased outer boundary of an opaque surface drawn over chrome —
   * rounded corners and the fractional edge column. Closes only when the chrome
   * behind it converges; cannot be closed by editing the surface itself.
   */
  | Readonly<{ kind: 'edge-band'; inset: number; maxChannelDelta?: number }>
  /* A specific measured area, in region-local pixel coordinates. */
  | Readonly<{
      kind: 'rect';
      left: number;
      top: number;
      right: number;
      bottom: number;
      maxChannelDelta?: number;
    }>
  /*
   * A difference confined to a few channel steps across the whole region, with
   * identical geometry and identical computed styles — layerisation, not
   * drawing. Bounded by an explicit maximum delta so a real change cannot hide
   * inside it.
   */
  | Readonly<{ kind: 'sub-perceptual'; maxChannelDelta: number }>;

export interface AttributedResidual {
  /** Stable id, used in the failure message and the evidence. */
  readonly id: string;
  /** The written, proven cause. */
  readonly cause: string;
  /** The evidence file that recorded the measurement. */
  readonly evidence: string;
  readonly term: AttributedTerm;
  /** What the measurement recorded. Exceeding it fails the slice. */
  readonly measuredPixels: number;
}

export interface AttributedTermResult {
  readonly id: string;
  readonly pixels: number;
  readonly measuredPixels: number;
}

export interface AttributionResult {
  readonly comparedPixels: number;
  readonly differingPixels: number;
  readonly attributedPixels: number;
  readonly unattributedPixels: number;
  readonly terms: readonly AttributedTermResult[];
  /** Empty when the slice passes. */
  readonly failures: readonly string[];
}

function withinRect(
  x: number,
  y: number,
  rect: Readonly<{
    left: number;
    top: number;
    right: number;
    bottom: number;
  }>,
): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function matchesTerm(
  term: AttributedTerm,
  x: number,
  y: number,
  width: number,
  height: number,
  channelDelta: number,
): boolean {
  switch (term.kind) {
    case 'edge-band':
      return (
        (x < term.inset ||
          y < term.inset ||
          x >= width - term.inset ||
          y >= height - term.inset) &&
        (term.maxChannelDelta === undefined ||
          channelDelta <= term.maxChannelDelta)
      );
    case 'rect':
      return (
        withinRect(x, y, term) &&
        (term.maxChannelDelta === undefined ||
          channelDelta <= term.maxChannelDelta)
      );
    default:
      return channelDelta <= term.maxChannelDelta;
  }
}

/**
 * Assign every differing pixel to the first residual that covers it. Pixels no
 * residual covers are unattributed and fail the slice, and a residual whose
 * pixels exceed its recorded measurement fails the slice too.
 */
export function attributeDifferences(
  comparison: PngComparison,
  residuals: readonly AttributedResidual[],
  extraAccepted: readonly Readonly<{
    left: number;
    top: number;
    right: number;
    bottom: number;
  }>[] = [],
): AttributionResult {
  const reference = comparison.reference.decoded;
  const actual = comparison.actual.decoded;
  const failures: string[] = [];

  if (reference.width !== actual.width || reference.height !== actual.height) {
    return {
      comparedPixels: 0,
      differingPixels: comparison.metrics.differentPixelCount,
      attributedPixels: 0,
      unattributedPixels: comparison.metrics.differentPixelCount,
      terms: [],
      failures: [
        `region dimensions differ: ${reference.width}x${reference.height} != ${actual.width}x${actual.height}`,
      ],
    };
  }

  const { width, height } = reference;
  const counts = new Array<number>(residuals.length).fill(0);
  let differing = 0;
  let unattributed = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      let channelDelta = 0;
      for (let channel = 0; channel < 4; channel += 1) {
        channelDelta = Math.max(
          channelDelta,
          Math.abs(
            reference.pixels[offset + channel] -
              actual.pixels[offset + channel],
          ),
        );
      }
      if (channelDelta === 0) continue;
      differing += 1;

      if (extraAccepted.some((rect) => withinRect(x, y, rect))) continue;

      const index = residuals.findIndex((residual) =>
        matchesTerm(residual.term, x, y, width, height, channelDelta),
      );
      if (index < 0) {
        unattributed += 1;
        continue;
      }
      counts[index] += 1;
    }
  }

  const terms = residuals.map((residual, index) => ({
    id: residual.id,
    pixels: counts[index],
    measuredPixels: residual.measuredPixels,
  }));

  if (unattributed > 0) {
    failures.push(
      `${unattributed} unattributed pixels: every differing pixel needs a written, proven cause`,
    );
  }
  for (const [index, term] of terms.entries()) {
    if (term.pixels > term.measuredPixels) {
      failures.push(
        `attributed residual "${term.id}" grew to ${term.pixels} pixels, above its measured ${term.measuredPixels} (${residuals[index].evidence})`,
      );
    }
  }

  return {
    comparedPixels: width * height,
    differingPixels: differing,
    attributedPixels: differing - unattributed,
    unattributedPixels: unattributed,
    terms,
    failures,
  };
}
