import {
  mkdtemp,
  mkdir,
  rm,
  symlink,
  writeFile,
  chmod,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const REAL_FILE_SIZE_BOUNDARIES = [
  2_097_152, 2_097_153, 10_485_760, 10_485_761, 52_428_800, 52_428_801,
] as const;

export type RealFileFixtureMetadata = {
  readonly name: string;
  readonly relativePath: string;
  readonly size: number;
  readonly lineEnding: string;
  readonly encoding: string;
  readonly mode: number;
};

export type RealFileFixtureSet = {
  readonly root: string;
  readonly metadata: readonly RealFileFixtureMetadata[];
  readonly paths: Readonly<Record<string, string>>;
};

const HOSTILE_NAME = 'hostile-\x01-\x1f-\x7f-\u202a-\u202e-\u2066-\u2069.md';

export function realFileFixtureMetadata(): readonly RealFileFixtureMetadata[] {
  return [
    {
      name: 'uniform-lf',
      relativePath: 'line-endings/uniform-lf.md',
      size: 13,
      lineEnding: 'lf',
      encoding: 'utf-8',
      mode: 0o644,
    },
    {
      name: 'uniform-crlf',
      relativePath: 'line-endings/uniform-crlf.md',
      size: 15,
      lineEnding: 'crlf',
      encoding: 'utf-8',
      mode: 0o644,
    },
    {
      name: 'mixed-dominant-lf',
      relativePath: 'line-endings/mixed-dominant-lf.md',
      size: 20,
      lineEnding: 'mixed-lf-dominant',
      encoding: 'utf-8',
      mode: 0o644,
    },
    {
      name: 'mixed-tie-first-crlf',
      relativePath: 'line-endings/mixed-tie-first-crlf.md',
      size: 14,
      lineEnding: 'mixed-tie-first-crlf',
      encoding: 'utf-8',
      mode: 0o644,
    },
    {
      name: 'none',
      relativePath: 'line-endings/none.md',
      size: 29,
      lineEnding: 'none',
      encoding: 'utf-8',
      mode: 0o644,
    },
    {
      name: 'lone-cr',
      relativePath: 'line-endings/lone-cr.md',
      size: 12,
      lineEnding: 'lone-cr',
      encoding: 'utf-8',
      mode: 0o644,
    },
    {
      name: 'unicode-separators',
      relativePath: 'line-endings/unicode-separators.md',
      size: 15,
      lineEnding: 'none',
      encoding: 'utf-8',
      mode: 0o644,
    },
    {
      name: 'utf8-bom',
      relativePath: 'encoding/utf8-bom.md',
      size: 7,
      lineEnding: 'lf',
      encoding: 'utf-8-bom',
      mode: 0o644,
    },
    {
      name: 'invalid-utf8',
      relativePath: 'encoding/invalid-utf8.md',
      size: 8,
      lineEnding: 'none',
      encoding: 'invalid-utf8',
      mode: 0o644,
    },
    {
      name: 'nul-bearing',
      relativePath: 'encoding/nul-bearing.md',
      size: 4,
      lineEnding: 'lf',
      encoding: 'nul',
      mode: 0o644,
    },
    {
      name: 'non-default-mode',
      relativePath: 'permissions/non-default-mode.md',
      size: 5,
      lineEnding: 'lf',
      encoding: 'utf-8',
      mode: 0o640,
    },
    {
      name: 'duplicate-one',
      relativePath: 'duplicates/one/note.md',
      size: 4,
      lineEnding: 'lf',
      encoding: 'utf-8',
      mode: 0o644,
    },
    {
      name: 'duplicate-two',
      relativePath: 'duplicates/two/note.md',
      size: 4,
      lineEnding: 'lf',
      encoding: 'utf-8',
      mode: 0o644,
    },
    {
      name: 'same-parent-alpha',
      relativePath: 'parents/alpha/shared/note.md',
      size: 6,
      lineEnding: 'lf',
      encoding: 'utf-8',
      mode: 0o644,
    },
    {
      name: 'same-parent-beta',
      relativePath: 'parents/beta/shared/note.md',
      size: 5,
      lineEnding: 'lf',
      encoding: 'utf-8',
      mode: 0o644,
    },
    {
      name: 'hostile-name',
      relativePath: `path-shapes/${HOSTILE_NAME}`,
      size: 8,
      lineEnding: 'lf',
      encoding: 'utf-8',
      mode: 0o644,
    },
    ...REAL_FILE_SIZE_BOUNDARIES.map((size) => ({
      name: `${size}-bytes`,
      relativePath: `sizes/${size}-bytes.md`,
      size,
      lineEnding: 'none',
      encoding: 'binary',
      mode: 0o644,
    })),
  ];
}

async function writeSizedFixture(path: string, size: number): Promise<void> {
  const chunk = Buffer.alloc(64 * 1024);
  const chunks = Math.floor(size / chunk.length);
  const remainder = size % chunk.length;
  const output: Buffer[] = Array.from({ length: chunks }, () => chunk);
  if (remainder > 0) output.push(chunk.subarray(0, remainder));
  await writeFile(path, Buffer.concat(output, size), { mode: 0o644 });
}

export async function createRealFileFixtures(
  parent = tmpdir(),
): Promise<RealFileFixtureSet> {
  const root = await mkdtemp(join(parent, 'gomarkedit-real-files-'));
  const metadata = realFileFixtureMetadata();
  const paths: Record<string, string> = {};
  const content: Record<string, Buffer> = {
    'line-endings/uniform-lf.md': Buffer.from('first\nsecond\n'),
    'line-endings/uniform-crlf.md': Buffer.from('first\r\nsecond\r\n'),
    'line-endings/mixed-dominant-lf.md': Buffer.from(
      'first\nsecond\nthird\r\n',
    ),
    'line-endings/mixed-tie-first-crlf.md': Buffer.from('first\r\nsecond\n'),
    'line-endings/none.md': Buffer.from('one line without a terminator'),
    'line-endings/lone-cr.md': Buffer.from('first\rsecond'),
    'line-endings/unicode-separators.md': Buffer.from(
      'NEL\u0085LS\u2028PS\u2029',
    ),
    'encoding/utf8-bom.md': Buffer.from([
      0xef, 0xbb, 0xbf, 0x62, 0x6f, 0x6d, 0x0a,
    ]),
    'encoding/invalid-utf8.md': Buffer.from([
      0x69, 0x6e, 0x76, 0xff, 0xfe, 0x6c, 0x69, 0x64,
    ]),
    'encoding/nul-bearing.md': Buffer.from([0x61, 0x00, 0x62, 0x0a]),
    'permissions/non-default-mode.md': Buffer.from('mode\n'),
    'duplicates/one/note.md': Buffer.from('one\n'),
    'duplicates/two/note.md': Buffer.from('two\n'),
    'parents/alpha/shared/note.md': Buffer.from('alpha\n'),
    'parents/beta/shared/note.md': Buffer.from('beta\n'),
    [`path-shapes/${HOSTILE_NAME}`]: Buffer.from('hostile\n'),
  };

  for (const fixture of metadata) {
    const path = join(root, fixture.relativePath);
    paths[fixture.name] = path;
    await mkdir(join(path, '..'), { recursive: true });
    if (fixture.relativePath.startsWith('sizes/')) {
      await writeSizedFixture(path, fixture.size);
    } else {
      await writeFile(path, content[fixture.relativePath], {
        mode: fixture.mode,
      });
    }
    await chmod(path, fixture.mode);
  }

  const alias = join(root, 'path-shapes/symlink-alias.md');
  await symlink(paths['duplicate-one'], alias);
  paths['symlink-alias'] = alias;
  return { root, metadata, paths };
}

export async function removeRealFileFixtures(
  fixtures: RealFileFixtureSet,
): Promise<void> {
  await rm(fixtures.root, { recursive: true, force: true });
}
