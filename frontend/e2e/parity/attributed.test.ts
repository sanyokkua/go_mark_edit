import {
  attributeDifferences,
  shrinkFloorFor,
  RESIDUAL_SHRINK_GRACE_PIXELS,
  RESIDUAL_SHRINK_RATIO,
  type AttributedResidual,
} from './attributed';
import type { PngComparison } from './comparator';

/*
 * The comparator's own tests cover decoding and hashing. These cover only the
 * attribution bookkeeping, so the fixtures are hand-built pixel buffers rather
 * than encoded PNGs: `attributeDifferences` reads `decoded` and nothing else.
 */
const WIDTH = 40;
const HEIGHT = 40;

function blank(): Uint8Array {
  return new Uint8Array(WIDTH * HEIGHT * 4);
}

/** A comparison whose actual differs from the reference in `count` pixels. */
function comparisonDifferingIn(
  count: number,
  at: (index: number) => { x: number; y: number },
  channelDelta = 1,
): PngComparison {
  const referencePixels = blank();
  const actualPixels = blank();
  for (let index = 0; index < count; index += 1) {
    const { x, y } = at(index);
    actualPixels[(y * WIDTH + x) * 4] = channelDelta;
  }
  return {
    reference: {
      decoded: { width: WIDTH, height: HEIGHT, pixels: referencePixels },
    },
    actual: { decoded: { width: WIDTH, height: HEIGHT, pixels: actualPixels } },
    metrics: { differentPixelCount: count },
  } as unknown as PngComparison;
}

/** A rect term wide enough to cover every pixel the fixtures place. */
function coveringResidual(measuredPixels: number): AttributedResidual {
  return {
    id: 'test-term',
    cause: 'a measured difference, declared for this test',
    evidence: 'specs/003-real-files-and-tabs/evidence/ft-vs-08/phase-18/x.md',
    term: {
      kind: 'rect',
      left: 0,
      top: 0,
      right: WIDTH,
      bottom: HEIGHT,
      maxChannelDelta: 8,
    },
    measuredPixels,
  };
}

/** Pixels laid out along one row, so a count maps to a distinct pixel each. */
const alongTopRow = (index: number): { x: number; y: number } => ({
  x: index % WIDTH,
  y: Math.floor(index / WIDTH),
});

describe('T085 attributed residual shrink rule', () => {
  it('states one floor for a recorded ceiling, widening it for small terms', () => {
    /* The ratio governs once a quarter of the term exceeds the flat grace. */
    expect(shrinkFloorFor(400)).toBe(400 - 400 * RESIDUAL_SHRINK_RATIO);
    expect(shrinkFloorFor(416)).toBe(312);

    /* Below that, the flat grace governs, so noise-sized terms do not fire. */
    expect(shrinkFloorFor(16)).toBe(16 - RESIDUAL_SHRINK_GRACE_PIXELS);
    expect(shrinkFloorFor(2)).toBeLessThan(0);
  });

  it('passes a term reporting the size it recorded', () => {
    const result = attributeDifferences(
      comparisonDifferingIn(400, alongTopRow),
      [coveringResidual(400)],
    );

    expect(result.unattributedPixels).toBe(0);
    expect(result.terms[0]).toEqual({
      id: 'test-term',
      pixels: 400,
      measuredPixels: 400,
      shrinkFloor: 300,
    });
    expect(result.failures).toEqual([]);
  });

  it('still fails a term that grew beyond what was measured', () => {
    const result = attributeDifferences(
      comparisonDifferingIn(401, alongTopRow),
      [coveringResidual(400)],
    );

    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toContain('grew to 401 pixels');
  });

  it('accepts a shrink inside the tolerance band, so a renderer nudge is not a build break', () => {
    const result = attributeDifferences(
      comparisonDifferingIn(301, alongTopRow),
      [coveringResidual(400)],
    );

    expect(result.terms[0].pixels).toBe(301);
    expect(result.failures).toEqual([]);
  });

  it('fails a term that shrank below its floor, naming the room it left for drift', () => {
    const result = attributeDifferences(
      comparisonDifferingIn(100, alongTopRow),
      [coveringResidual(416)],
    );

    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toContain('shrank to 100 pixels');
    expect(result.failures[0]).toContain('below the 312 floor');
    /* The gap is the point: 316 pixels of room for undetected drift. */
    expect(result.failures[0]).toContain('316 pixel gap');
  });

  it('fails a term that closed entirely, because the entry is now a dead licence', () => {
    const result = attributeDifferences(comparisonDifferingIn(0, alongTopRow), [
      coveringResidual(416),
    ]);

    expect(result.differingPixels).toBe(0);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toContain('no longer contributes any pixels');
    expect(result.failures[0]).toContain('remove the entry');
  });

  it('does not fire the shrink rule on a two-pixel term losing one to quantisation', () => {
    const result = attributeDifferences(comparisonDifferingIn(1, alongTopRow), [
      coveringResidual(2),
    ]);

    expect(result.failures).toEqual([]);
  });

  it('reports growth rather than shrinkage when a term does both against two ceilings', () => {
    const grew = attributeDifferences(comparisonDifferingIn(500, alongTopRow), [
      coveringResidual(400),
    ]);
    const shrank = attributeDifferences(
      comparisonDifferingIn(10, alongTopRow),
      [coveringResidual(400)],
    );

    expect(grew.failures[0]).toContain('grew to');
    expect(shrank.failures[0]).toContain('shrank to');
  });

  it('keeps an unattributed pixel failing regardless of the shrink rule', () => {
    const narrow: AttributedResidual = {
      ...coveringResidual(400),
      term: {
        kind: 'rect',
        left: 0,
        top: 0,
        right: 4,
        bottom: 0,
        maxChannelDelta: 8,
      },
    };
    const result = attributeDifferences(
      comparisonDifferingIn(400, alongTopRow),
      [narrow],
    );

    expect(result.unattributedPixels).toBe(395);
    expect(result.failures.some((f) => f.includes('unattributed pixels'))).toBe(
      true,
    );
  });
});

/*
 * T127. The T059 macOS accelerator exception used to be implemented here, as an
 * `extraAccepted` rectangle parameter whose pixels were skipped *before* the
 * attribution lookup. Skipped pixels landed in neither `unattributedPixels` nor
 * any term's count, yet `attributedPixels` is derived as
 * `differing - unattributed` — so they were reported as attributed while no
 * declared term accounted for them. They carried no `measuredPixels` ceiling,
 * no `maxChannelDelta` and no shrink rule, and they covered glyphs, which
 * FR-FT-055 forbids a mask from hiding. It was a mask, in the module whose own
 * header (`attributed.ts:8-16`) says a mask makes drift invisible forever.
 *
 * The invariant that catches it: the declared terms must account for every
 * pixel the result calls attributed. That is checkable on every call and cannot
 * be satisfied by a rectangle that excuses pixels without declaring a term.
 */
// Proves: FR-FT-055 (partial — only "any mask MUST NOT hide geometry, text,
//   icons, focus, state, or a whole component", enforced as: no pixel is
//   excused without a declared term accounting for it. The smallest-reviewed-
//   rectangle, retained-image and reviewed-mapping clauses are proven elsewhere)
it('T127 accounts every attributed pixel to a declared term, ignoring any extra rectangle', () => {
  const comparison = comparisonDifferingIn(12, alongTopRow);

  /*
   * Passed positionally the way the retired parameter was. The signature no
   * longer declares it, so this is what a caller reintroducing the mask would
   * write, and the assertion below is what stops it working.
   */
  const withRectangle = (
    attributeDifferences as unknown as (
      comparison: PngComparison,
      residuals: readonly AttributedResidual[],
      extraAccepted: readonly Readonly<{
        left: number;
        top: number;
        right: number;
        bottom: number;
      }>[],
    ) => ReturnType<typeof attributeDifferences>
  )(comparison, [], [{ left: 0, top: 0, right: WIDTH, bottom: HEIGHT }]);

  const declared = withRectangle.terms.reduce(
    (total, term) => total + term.pixels,
    0,
  );
  expect(declared).toBe(withRectangle.attributedPixels);
  expect(withRectangle.unattributedPixels).toBe(12);
  expect(withRectangle.failures).toEqual([
    '12 unattributed pixels: every differing pixel needs a written, proven cause',
  ]);
});
