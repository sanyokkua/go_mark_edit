import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const readSource = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8');

const runProductionNetworkGuard = (
  sourceRoot: string,
  bundleRoot: string,
): { status: number | null; output: string } => {
  const result = spawnSync(
    process.execPath,
    [
      'scripts/check-production-network.mjs',
      '--source-root',
      sourceRoot,
      '--bundle-root',
      bundleRoot,
      '--require-bundle',
    ],
    { cwd: process.cwd(), encoding: 'utf8' },
  );

  return {
    status: result.status,
    output: `${result.stdout}${result.stderr}`,
  };
};

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

it('FR-WS-018 rejects prohibited network paths in production source and built bundles', () => {
  const fixtureRoot = mkdtempSync(resolve(tmpdir(), 'gomarkedit-network-'));
  const sourceRoot = resolve(fixtureRoot, 'source');
  const bundleRoot = resolve(fixtureRoot, 'bundle');

  try {
    mkdirSync(sourceRoot);
    mkdirSync(bundleRoot);
    writeFileSync(
      resolve(sourceRoot, 'shell.ts'),
      'export const shell = true;',
    );
    writeFileSync(resolve(bundleRoot, 'app.js'), 'export const app = true;');

    expect(runProductionNetworkGuard(sourceRoot, bundleRoot)).toMatchObject({
      status: 0,
    });

    writeFileSync(
      resolve(bundleRoot, 'diagnostic.js'),
      'const diagnostic = { src: "https://example.invalid/help" };',
    );
    expect(runProductionNetworkGuard(sourceRoot, bundleRoot)).toMatchObject({
      status: 0,
    });

    writeFileSync(
      resolve(sourceRoot, 'remote.ts'),
      'export const remote = fetch("https://example.invalid");',
    );
    writeFileSync(
      resolve(bundleRoot, 'remote.js'),
      'navigator.sendBeacon("https://example.invalid");',
    );

    const rejected = runProductionNetworkGuard(sourceRoot, bundleRoot);
    expect(rejected.status).toBe(1);
    expect(rejected.output).toMatch(/prohibited network/i);
    expect(rejected.output).toContain('remote.ts');
    expect(rejected.output).toContain('remote.js');
  } finally {
    rmSync(fixtureRoot, { force: true, recursive: true });
  }
});

it('FR-WS-018 proves local Monaco injection and same-origin preloads before accepting the built bundle', () => {
  const editorSource = readSource('src/ui/components/CodeEditor.tsx');
  const viteSource = readSource('vite.config.ts');

  expect(editorSource.indexOf('monacoReact.loader.config')).toBeGreaterThan(
    editorSource.indexOf("import('./monacoSetup')"),
  );
  expect(editorSource.indexOf('monacoReact.loader.config')).toBeLessThan(
    editorSource.indexOf('return { default: monacoReact.default };'),
  );
  expect(viteSource).toContain("base: './'");
  expect(
    runProductionNetworkGuard(
      resolve(process.cwd(), 'src'),
      resolve(process.cwd(), 'dist'),
    ),
  ).toMatchObject({ status: 0 });
});
