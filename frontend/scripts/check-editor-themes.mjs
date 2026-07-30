import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { generateFiles } from './generate-editor-themes.mjs';

const temporaryDirectory = await mkdtemp(join(tmpdir(), 'gme-editor-themes-'));

try {
  const generatedThemes = join(temporaryDirectory, 'generatedEditorThemes.ts');
  const generatedHighlight = join(temporaryDirectory, 'generatedHighlight.css');
  await generateFiles({
    input: new URL('../src/ui/styles/tokens.css', import.meta.url),
    themesOutput: generatedThemes,
    highlightOutput: generatedHighlight,
  });

  const expected = await Promise.all([
    readFile(generatedThemes, 'utf8'),
    readFile(generatedHighlight, 'utf8'),
  ]);
  const committed = await Promise.all([
    readFile(
      new URL('../src/logic/theme/generatedEditorThemes.ts', import.meta.url),
      'utf8',
    ),
    readFile(
      new URL('../src/logic/theme/generatedHighlight.css', import.meta.url),
      'utf8',
    ),
  ]);
  if (expected[0] !== committed[0] || expected[1] !== committed[1]) {
    throw new Error(
      'Generated Monaco assets are stale. Run npm run generate:editor-themes.',
    );
  }
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
