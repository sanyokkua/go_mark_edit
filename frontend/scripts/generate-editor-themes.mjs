import { fileURLToPath } from 'node:url';

import core from './generate-editor-themes-core.cjs';

const { generateEditorThemes, generateFiles } = core;

export { generateEditorThemes, generateFiles };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await generateFiles({
    input: new URL('../src/ui/styles/tokens.css', import.meta.url),
    themesOutput: new URL(
      '../src/logic/theme/generatedEditorThemes.ts',
      import.meta.url,
    ),
    highlightOutput: new URL(
      '../src/logic/theme/generatedHighlight.css',
      import.meta.url,
    ),
  });
}
