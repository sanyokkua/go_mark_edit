import { createHash } from 'node:crypto';
import { deflateSync, inflateSync } from 'node:zlib';

const PNG_SIGNATURE = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const RGBA_CHANNELS = 4;
const REVIEWED_MASK_SCOPE = 'renderer-owned-dynamic-pixel' as const;

export interface DecodedPng {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
}

/**
 * A mask is deliberately constrained to pixels owned by a renderer transient.
 * Geometry, text, icons, focus, state, and whole components are never valid
 * mask targets. The empty list is the default and the only default.
 */
export interface ReviewedMask {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly reason: string;
  readonly scope: typeof REVIEWED_MASK_SCOPE;
}

export const DEFAULT_REVIEWED_MASKS: readonly ReviewedMask[] = Object.freeze(
  [],
);

export interface PixelBounds {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface PixelMetrics {
  readonly width: number;
  readonly height: number;
  readonly comparedPixelCount: number;
  readonly differentPixelCount: number;
  readonly rawDifferentPixelCount: number;
  readonly maskedPixelCount: number;
  readonly maxChannelDelta: number;
  readonly totalChannelDelta: number;
  readonly differenceBounds: PixelBounds | null;
}

export interface RetainedPng {
  readonly bytes: Uint8Array;
  readonly decoded: DecodedPng;
  readonly hash: string;
}

export interface PngComparison {
  readonly passed: boolean;
  readonly zeroTolerance: true;
  readonly reference: RetainedPng;
  readonly actual: RetainedPng;
  readonly diff: RetainedPng;
  readonly metrics: PixelMetrics;
  readonly masks: readonly ReviewedMask[];
}

export interface ComparePngOptions {
  readonly masks?: readonly ReviewedMask[];
}

const readUint32 = (bytes: Uint8Array, offset: number): number =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(
    offset,
  );

const writeUint32 = (
  bytes: Uint8Array,
  offset: number,
  value: number,
): void => {
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(
    offset,
    value,
  );
};

const chunkType = (type: string): Uint8Array =>
  Uint8Array.from(type, (character) => character.charCodeAt(0));

const sameBytes = (left: Uint8Array, right: Uint8Array): boolean => {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
};

const concatBytes = (parts: readonly Uint8Array[]): Uint8Array => {
  const length = parts.reduce((total, part) => total + part.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
};

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let value = 0; value < table.length; value += 1) {
    let crc = value;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) === 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
    table[value] = crc >>> 0;
  }
  return table;
})();

const crc32 = (bytes: Uint8Array): number => {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const makeChunk = (type: string, data: Uint8Array): Uint8Array => {
  const typeBytes = chunkType(type);
  const body = concatBytes([typeBytes, data]);
  const result = new Uint8Array(data.length + 12);
  writeUint32(result, 0, data.length);
  result.set(body, 4);
  writeUint32(result, data.length + 8, crc32(body));
  return result;
};

const paeth = (left: number, above: number, upperLeft: number): number => {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance)
    return left;
  if (aboveDistance <= upperLeftDistance) return above;
  return upperLeft;
};

const unfilter = (
  filtered: Uint8Array,
  width: number,
  height: number,
  bytesPerPixel: number,
): Uint8Array => {
  const rowBytes = width * bytesPerPixel;
  const expectedLength = height * (rowBytes + 1);
  if (filtered.length !== expectedLength) {
    throw new Error(
      `PNG scanline data has ${filtered.length} bytes; expected ${expectedLength}`,
    );
  }

  const pixels = new Uint8Array(width * height * bytesPerPixel);
  let inputOffset = 0;
  for (let row = 0; row < height; row += 1) {
    const filter = filtered[inputOffset++];
    const rowOffset = row * rowBytes;
    const previousRowOffset = rowOffset - rowBytes;
    for (let column = 0; column < rowBytes; column += 1) {
      const source = filtered[inputOffset++];
      const left =
        column >= bytesPerPixel
          ? pixels[rowOffset + column - bytesPerPixel]
          : 0;
      const above = row > 0 ? pixels[previousRowOffset + column] : 0;
      const upperLeft =
        row > 0 && column >= bytesPerPixel
          ? pixels[previousRowOffset + column - bytesPerPixel]
          : 0;
      let predictor = 0;
      switch (filter) {
        case 0:
          break;
        case 1:
          predictor = left;
          break;
        case 2:
          predictor = above;
          break;
        case 3:
          predictor = Math.floor((left + above) / 2);
          break;
        case 4:
          predictor = paeth(left, above, upperLeft);
          break;
        default:
          throw new Error(`Unsupported PNG scanline filter ${filter}`);
      }
      pixels[rowOffset + column] = (source + predictor) & 0xff;
    }
  }
  return pixels;
};

const rgbaFromScanlines = (
  scanlines: Uint8Array,
  width: number,
  height: number,
  colorType: number,
  palette: Uint8Array | undefined,
  transparency: Uint8Array | undefined,
): Uint8Array => {
  const pixels = new Uint8Array(width * height * RGBA_CHANNELS);
  const pixelCount = width * height;
  for (let index = 0; index < pixelCount; index += 1) {
    const sourceOffset =
      index *
      (colorType === 6 ? 4 : colorType === 4 ? 2 : colorType === 2 ? 3 : 1);
    const targetOffset = index * RGBA_CHANNELS;
    switch (colorType) {
      case 0: {
        const gray = scanlines[sourceOffset];
        const transparentGray =
          transparency?.length === 2 ? transparency[1] : undefined;
        pixels[targetOffset] = gray;
        pixels[targetOffset + 1] = gray;
        pixels[targetOffset + 2] = gray;
        pixels[targetOffset + 3] = gray === transparentGray ? 0 : 255;
        break;
      }
      case 2: {
        const red = scanlines[sourceOffset];
        const green = scanlines[sourceOffset + 1];
        const blue = scanlines[sourceOffset + 2];
        const transparent =
          transparency?.length === 6 &&
          red === transparency[1] &&
          green === transparency[3] &&
          blue === transparency[5];
        pixels[targetOffset] = red;
        pixels[targetOffset + 1] = green;
        pixels[targetOffset + 2] = blue;
        pixels[targetOffset + 3] = transparent ? 0 : 255;
        break;
      }
      case 3: {
        const paletteIndex = scanlines[sourceOffset];
        if (!palette || paletteIndex * 3 + 2 >= palette.length) {
          throw new Error(`PNG palette index ${paletteIndex} is out of range`);
        }
        pixels[targetOffset] = palette[paletteIndex * 3];
        pixels[targetOffset + 1] = palette[paletteIndex * 3 + 1];
        pixels[targetOffset + 2] = palette[paletteIndex * 3 + 2];
        pixels[targetOffset + 3] = transparency?.[paletteIndex] ?? 255;
        break;
      }
      case 4:
        pixels[targetOffset] = scanlines[sourceOffset];
        pixels[targetOffset + 1] = scanlines[sourceOffset];
        pixels[targetOffset + 2] = scanlines[sourceOffset];
        pixels[targetOffset + 3] = scanlines[sourceOffset + 1];
        break;
      case 6:
        pixels.set(
          scanlines.subarray(sourceOffset, sourceOffset + 4),
          targetOffset,
        );
        break;
      default:
        throw new Error(`Unsupported PNG color type ${colorType}`);
    }
  }
  return pixels;
};

export const decodePng = (input: Uint8Array): DecodedPng => {
  if (
    input.length < PNG_SIGNATURE.length ||
    !sameBytes(input.subarray(0, 8), PNG_SIGNATURE)
  ) {
    throw new Error('Input is not a PNG');
  }

  let offset = PNG_SIGNATURE.length;
  let width = 0;
  let height = 0;
  let colorType = -1;
  let bitDepth = 0;
  let interlaceMethod = 0;
  let palette: Uint8Array | undefined;
  let transparency: Uint8Array | undefined;
  const imageData: Uint8Array[] = [];
  let sawHeader = false;
  let sawEnd = false;

  while (offset < input.length) {
    if (offset + 12 > input.length) throw new Error('PNG chunk is truncated');
    const length = readUint32(input, offset);
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + length;
    const crcEnd = chunkEnd + 4;
    if (crcEnd > input.length)
      throw new Error('PNG chunk payload is truncated');
    const type = String.fromCharCode(...input.subarray(offset + 4, offset + 8));
    const data = input.subarray(chunkStart, chunkEnd);
    const crcInput = input.subarray(offset + 4, chunkEnd);
    if (readUint32(input, chunkEnd) !== crc32(crcInput)) {
      throw new Error(`PNG ${type} chunk has an invalid CRC`);
    }

    switch (type) {
      case 'IHDR':
        if (sawHeader || length !== 13)
          throw new Error('PNG has an invalid IHDR');
        width = readUint32(data, 0);
        height = readUint32(data, 4);
        bitDepth = data[8];
        colorType = data[9];
        if (data[10] !== 0 || data[11] !== 0)
          throw new Error('PNG uses unsupported compression or filter');
        interlaceMethod = data[12];
        sawHeader = true;
        break;
      case 'PLTE':
        palette = data.slice();
        break;
      case 'tRNS':
        transparency = data.slice();
        break;
      case 'IDAT':
        imageData.push(data.slice());
        break;
      case 'IEND':
        if (length !== 0) throw new Error('PNG has a non-empty IEND');
        sawEnd = true;
        offset = crcEnd;
        continue;
      default:
        break;
    }
    offset = crcEnd;
  }

  if (!sawHeader || !sawEnd || width === 0 || height === 0)
    throw new Error('PNG is missing a valid image header');
  if (interlaceMethod !== 0)
    throw new Error('Interlaced PNGs are not supported');
  if (bitDepth !== 8 || ![0, 2, 3, 4, 6].includes(colorType)) {
    throw new Error(
      `Unsupported PNG format: bit depth ${bitDepth}, color type ${colorType}`,
    );
  }
  if (
    colorType === 3 &&
    (!palette || palette.length === 0 || palette.length % 3 !== 0)
  ) {
    throw new Error('Indexed PNG is missing a valid palette');
  }

  const channels =
    colorType === 6 ? 4 : colorType === 4 ? 2 : colorType === 2 ? 3 : 1;
  const rowBytes = width * channels;
  const expectedPixels = width * height * RGBA_CHANNELS;
  if (!Number.isSafeInteger(expectedPixels) || expectedPixels <= 0)
    throw new Error('PNG dimensions are too large');
  const inflated = new Uint8Array(inflateSync(concatBytes(imageData)));
  const scanlines = unfilter(inflated, width, height, channels);
  const pixels = rgbaFromScanlines(
    scanlines,
    width,
    height,
    colorType,
    palette,
    transparency,
  );
  if (
    pixels.length !== expectedPixels ||
    rowBytes * height !== scanlines.length
  ) {
    throw new Error('PNG decoded pixel dimensions are inconsistent');
  }
  return { width, height, pixels };
};

export const encodePng = (image: DecodedPng): Uint8Array => {
  if (
    !Number.isSafeInteger(image.width) ||
    !Number.isSafeInteger(image.height) ||
    image.width <= 0 ||
    image.height <= 0 ||
    image.pixels.length !== image.width * image.height * RGBA_CHANNELS
  ) {
    throw new Error('Cannot encode an invalid RGBA image');
  }

  const rowBytes = image.width * RGBA_CHANNELS;
  const scanlines = new Uint8Array(image.height * (rowBytes + 1));
  for (let row = 0; row < image.height; row += 1) {
    const sourceOffset = row * rowBytes;
    const targetOffset = row * (rowBytes + 1);
    scanlines[targetOffset] = 0;
    scanlines.set(
      image.pixels.subarray(sourceOffset, sourceOffset + rowBytes),
      targetOffset + 1,
    );
  }

  const header = new Uint8Array(13);
  writeUint32(header, 0, image.width);
  writeUint32(header, 4, image.height);
  header[8] = 8;
  header[9] = 6;
  const idat = new Uint8Array(deflateSync(scanlines));
  return concatBytes([
    PNG_SIGNATURE,
    makeChunk('IHDR', header),
    makeChunk('IDAT', idat),
    makeChunk('IEND', new Uint8Array()),
  ]);
};

const hashDecoded = (image: DecodedPng): string => {
  const metadata = new Uint8Array(8);
  writeUint32(metadata, 0, image.width);
  writeUint32(metadata, 4, image.height);
  return createHash('sha256')
    .update(concatBytes([metadata, image.pixels]))
    .digest('hex');
};

export const hashDecodedPng = (image: DecodedPng): string => hashDecoded(image);

export const hashPng = (input: Uint8Array): string =>
  hashDecoded(decodePng(input));

const cloneDecoded = (image: DecodedPng): DecodedPng => ({
  width: image.width,
  height: image.height,
  pixels: image.pixels.slice(),
});

const retainPng = (input: Uint8Array): RetainedPng => {
  const bytes = input.slice();
  const decoded = cloneDecoded(decodePng(bytes));
  return { bytes, decoded, hash: hashDecoded(decoded) };
};

const validateMasks = (
  masks: readonly ReviewedMask[],
  width: number,
  height: number,
): ReviewedMask[] => {
  const totalPixels = width * height;
  let requestedArea = 0;
  const normalized = masks.map((mask) => {
    if (mask.scope !== REVIEWED_MASK_SCOPE) {
      throw new Error(
        `Mask ${mask.id || '<unnamed>'} is not allowed: only renderer-owned dynamic pixels may be masked`,
      );
    }
    if (!mask.id.trim() || !mask.reason.trim())
      throw new Error('Every reviewed mask needs an id and reason');
    if (
      !Number.isInteger(mask.x) ||
      !Number.isInteger(mask.y) ||
      !Number.isInteger(mask.width) ||
      !Number.isInteger(mask.height) ||
      mask.x < 0 ||
      mask.y < 0 ||
      mask.width <= 0 ||
      mask.height <= 0 ||
      mask.x + mask.width > width ||
      mask.y + mask.height > height
    ) {
      throw new Error(`Reviewed mask ${mask.id} is outside the compared image`);
    }
    if (
      mask.x === 0 &&
      mask.y === 0 &&
      mask.width === width &&
      mask.height === height
    ) {
      throw new Error(
        'A reviewed mask may not cover the complete compared image',
      );
    }
    requestedArea += mask.width * mask.height;
    return { ...mask };
  });
  if (requestedArea >= totalPixels)
    throw new Error('Reviewed masks may not cover the complete compared image');
  return normalized.sort(
    (left, right) =>
      left.y - right.y || left.x - right.x || left.id.localeCompare(right.id),
  );
};

const isMasked = (
  x: number,
  y: number,
  masks: readonly ReviewedMask[],
): boolean =>
  masks.some(
    (mask) =>
      x >= mask.x &&
      x < mask.x + mask.width &&
      y >= mask.y &&
      y < mask.y + mask.height,
  );

const pixelAt = (
  image: DecodedPng,
  x: number,
  y: number,
): readonly [number, number, number, number] => {
  if (x >= image.width || y >= image.height) return [0, 0, 0, 0];
  const offset = (y * image.width + x) * RGBA_CHANNELS;
  return [
    image.pixels[offset],
    image.pixels[offset + 1],
    image.pixels[offset + 2],
    image.pixels[offset + 3],
  ];
};

export const comparePng = (
  referenceInput: Uint8Array,
  actualInput: Uint8Array,
  options: ComparePngOptions = {},
): PngComparison => {
  const reference = retainPng(referenceInput);
  const actual = retainPng(actualInput);
  const width = Math.max(reference.decoded.width, actual.decoded.width);
  const height = Math.max(reference.decoded.height, actual.decoded.height);
  const masks = validateMasks(
    options.masks ?? DEFAULT_REVIEWED_MASKS,
    width,
    height,
  );
  const diffPixels = new Uint8Array(width * height * RGBA_CHANNELS);
  let differentPixelCount = 0;
  let rawDifferentPixelCount = 0;
  let maskedPixelCount = 0;
  let maxChannelDelta = 0;
  let totalChannelDelta = 0;
  let differenceBounds: PixelBounds | null = null;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const referencePixel = pixelAt(reference.decoded, x, y);
      const actualPixel = pixelAt(actual.decoded, x, y);
      const channelDelta = Math.max(
        Math.abs(referencePixel[0] - actualPixel[0]),
        Math.abs(referencePixel[1] - actualPixel[1]),
        Math.abs(referencePixel[2] - actualPixel[2]),
        Math.abs(referencePixel[3] - actualPixel[3]),
      );
      const different = channelDelta !== 0;
      const masked = isMasked(x, y, masks);
      if (masked) maskedPixelCount += 1;
      if (!different) continue;
      rawDifferentPixelCount += 1;
      const targetOffset = (y * width + x) * RGBA_CHANNELS;
      if (masked) continue;
      differentPixelCount += 1;
      maxChannelDelta = Math.max(maxChannelDelta, channelDelta);
      totalChannelDelta +=
        Math.abs(referencePixel[0] - actualPixel[0]) +
        Math.abs(referencePixel[1] - actualPixel[1]) +
        Math.abs(referencePixel[2] - actualPixel[2]) +
        Math.abs(referencePixel[3] - actualPixel[3]);
      diffPixels[targetOffset] = 255;
      diffPixels[targetOffset + 3] = 255;
      differenceBounds = differenceBounds
        ? {
            left: Math.min(differenceBounds.left, x),
            top: Math.min(differenceBounds.top, y),
            right: Math.max(differenceBounds.right, x),
            bottom: Math.max(differenceBounds.bottom, y),
          }
        : { left: x, top: y, right: x, bottom: y };
    }
  }

  const diffDecoded: DecodedPng = { width, height, pixels: diffPixels };
  const diffBytes = encodePng(diffDecoded);
  const diff: RetainedPng = {
    bytes: diffBytes,
    decoded: cloneDecoded(diffDecoded),
    hash: hashDecoded(diffDecoded),
  };
  return {
    passed:
      reference.decoded.width === actual.decoded.width &&
      reference.decoded.height === actual.decoded.height &&
      differentPixelCount === 0,
    zeroTolerance: true,
    reference,
    actual,
    diff,
    metrics: {
      width,
      height,
      comparedPixelCount: width * height,
      differentPixelCount,
      rawDifferentPixelCount,
      maskedPixelCount,
      maxChannelDelta,
      totalChannelDelta,
      differenceBounds,
    },
    masks,
  };
};
