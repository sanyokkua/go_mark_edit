import {
  comparePng,
  DEFAULT_REVIEWED_MASKS,
  decodePng,
  encodePng,
  hashPng,
  type DecodedPng,
} from './comparator';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const image = (pixels: number[], width = 2, height = 1): DecodedPng => ({
  width,
  height,
  pixels: Uint8Array.from(pixels),
});

describe('T034 zero-tolerance PNG comparator', () => {
  it('keeps the pinned PNG decoder development-only', () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'),
    ) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    expect(packageJson.devDependencies?.pngjs).toBe('7.0.0');
    expect(packageJson.dependencies?.pngjs).toBeUndefined();
  });

  it('zero-tolerance comparator retains triplets', () => {
    const reference = encodePng(image([255, 255, 255, 255, 0, 0, 0, 255]));
    const actual = encodePng(image([255, 255, 255, 255, 0, 0, 1, 255]));

    const result = comparePng(reference, actual);

    expect(result.zeroTolerance).toBe(true);
    expect(result.passed).toBe(false);
    expect(result.metrics.differentPixelCount).toBe(1);
    expect(result.metrics.rawDifferentPixelCount).toBe(1);
    expect(result.metrics.differenceBounds).toEqual({
      left: 1,
      top: 0,
      right: 1,
      bottom: 0,
    });
    expect(result.reference.bytes).toEqual(reference);
    expect(result.actual.bytes).toEqual(actual);
    expect(result.diff.bytes.length).toBeGreaterThan(0);
    expect(decodePng(result.reference.bytes)).toEqual(result.reference.decoded);
    expect(decodePng(result.actual.bytes)).toEqual(result.actual.decoded);
    expect(decodePng(result.diff.bytes)).toEqual(result.diff.decoded);
  });

  it('passes identical decoded pixels and produces deterministic hashes', () => {
    const first = encodePng(image([12, 34, 56, 255, 78, 90, 123, 255]));
    const second = encodePng(image([12, 34, 56, 255, 78, 90, 123, 255]));

    const result = comparePng(first, second);

    expect(result.passed).toBe(true);
    expect(result.reference.hash).toBe(result.actual.hash);
    expect(result.reference.hash).toBe(hashPng(first));
    expect(result.diff.hash).toBe(hashPng(result.diff.bytes));
    expect(result.metrics.differentPixelCount).toBe(0);
    expect(result.metrics.rawDifferentPixelCount).toBe(0);
    expect(result.metrics.differenceBounds).toBeNull();
  });

  // Proves: FR-FT-055 (partial — mask discipline; "the mapped region must be a
  //   component this feature built" is proved by manifest.test.ts)
  it('keeps the default mask set empty and rejects masks outside the reviewed dynamic scope', () => {
    const reference = encodePng(image([1, 2, 3, 255, 4, 5, 6, 255]));
    const actual = encodePng(image([1, 2, 3, 255, 4, 5, 7, 255]));

    expect(DEFAULT_REVIEWED_MASKS).toEqual([]);
    expect(comparePng(reference, actual).masks).toEqual([]);
    expect(() =>
      comparePng(reference, actual, {
        masks: [
          {
            id: 'text',
            x: 1,
            y: 0,
            width: 1,
            height: 1,
            reason: 'attempted text concealment',
            scope: 'text' as never,
          },
        ],
      }),
    ).toThrow(/only renderer-owned dynamic pixels/);
  });

  it('never lets masks hide a dimension or complete-image difference', () => {
    const reference = encodePng(image([1, 2, 3, 255, 4, 5, 6, 255]));
    const wider = encodePng(
      image([1, 2, 3, 255, 4, 5, 6, 255, 7, 8, 9, 255], 3, 1),
    );

    expect(
      comparePng(reference, wider, {
        masks: [
          {
            id: 'one-pixel-transient',
            x: 0,
            y: 0,
            width: 1,
            height: 1,
            reason: 'renderer-owned caret rasterization',
            scope: 'renderer-owned-dynamic-pixel',
          },
        ],
      }).passed,
    ).toBe(false);
    expect(() =>
      comparePng(reference, reference, {
        masks: [
          {
            id: 'whole-image',
            x: 0,
            y: 0,
            width: 2,
            height: 1,
            reason: 'renderer-owned dynamic pixels',
            scope: 'renderer-owned-dynamic-pixel',
          },
        ],
      }),
    ).toThrow(/complete compared image/);
  });
});
