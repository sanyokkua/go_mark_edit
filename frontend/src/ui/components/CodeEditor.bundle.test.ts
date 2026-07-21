import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const readSource = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8');

it('STORY-013-AC-2 bundles Monaco and Markdown workers locally', () => {
  const packageManifest = JSON.parse(readSource('package.json')) as {
    dependencies: Record<string, string>;
  };
  const editorSource = readSource('src/ui/components/CodeEditor.tsx');
  const setupSource = readSource('src/ui/components/monacoSetup.ts');
  const viteSource = readSource('vite.config.ts');
  const scannedSources = [editorSource, setupSource, viteSource].join('\n');

  expect(packageManifest.dependencies).toMatchObject({
    '@monaco-editor/react': expect.any(String),
    'monaco-editor': expect.any(String),
  });
  expect(editorSource).toContain("import('@monaco-editor/react')");
  expect(editorSource).toContain("import('./monacoSetup')");
  expect(editorSource).toMatch(
    /monacoReact\.loader\.config\(\{\s*monaco:\s*monacoSetup\.monaco,?\s*\}\);/,
  );
  expect(setupSource).toContain(
    "import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';",
  );
  expect(setupSource).toContain('export { monaco };');
  expect(setupSource).toContain(
    "import 'monaco-editor/esm/vs/basic-languages/markdown/markdown.contribution';",
  );
  expect(setupSource).toContain(
    "import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';",
  );
  expect(setupSource).toContain('getWorker(): Worker');
  expect(setupSource).toContain('return new EditorWorker();');
  expect(viteSource).toContain("format: 'es'");
  expect(scannedSources).not.toMatch(
    /https?:\/\/|cdn\.|unpkg|jsdelivr|fetch\s*\(/i,
  );
});
