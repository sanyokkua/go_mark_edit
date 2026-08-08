import { lstat, stat } from 'node:fs/promises';

import {
  createRealFileFixtures,
  REAL_FILE_SIZE_BOUNDARIES,
  realFileFixtureMetadata,
  removeRealFileFixtures,
} from '../../../e2e/helpers/real-file-fixtures';

describe('real file fixture metadata is deterministic', () => {
  it('retains every safety, path, and exact-size scenario', async () => {
    const first = realFileFixtureMetadata();
    const second = realFileFixtureMetadata();

    expect(second).toEqual(first);
    expect(
      first
        .filter((fixture) => fixture.relativePath.startsWith('sizes/'))
        .map((fixture) => fixture.size),
    ).toEqual([...REAL_FILE_SIZE_BOUNDARIES]);
    expect(first.find((fixture) => fixture.lineEnding === 'none')?.name).toBe(
      'none',
    );
    expect(
      first.find((fixture) => fixture.lineEnding === 'lone-cr')?.name,
    ).toBe('lone-cr');
    expect(first.some((fixture) => fixture.encoding === 'invalid-utf8')).toBe(
      true,
    );
    expect(first.some((fixture) => fixture.encoding === 'nul')).toBe(true);
    expect(first.some((fixture) => fixture.mode === 0o640)).toBe(true);
    const hostileCharacters = [
      0x01, 0x1f, 0x7f, 0x202a, 0x202e, 0x2066, 0x2069,
    ].map((codePoint) => String.fromCodePoint(codePoint));
    expect(
      first.some((fixture) =>
        hostileCharacters.some((character) =>
          fixture.relativePath.includes(character),
        ),
      ),
    ).toBe(true);

    const fixtures = await createRealFileFixtures();
    try {
      for (const size of REAL_FILE_SIZE_BOUNDARIES) {
        const sizeFixture = first.find(
          (fixture) => fixture.relativePath === `sizes/${size}-bytes.md`,
        );
        expect(sizeFixture).toBeDefined();
        const info = await stat(fixtures.paths[`${size}-bytes`]);
        expect(info.size).toBe(size);
      }
      expect(
        (await stat(fixtures.paths['non-default-mode'])).mode & 0o777,
      ).toBe(0o640);
      expect(
        (await lstat(fixtures.paths['symlink-alias'])).isSymbolicLink(),
      ).toBe(true);
    } finally {
      await removeRealFileFixtures(fixtures);
    }
  });
});
