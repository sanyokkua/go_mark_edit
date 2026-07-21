import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';

import {
  baseGfmRehypePlugins,
  baseGfmRemarkPlugins,
  baseGfmSanitizeSchema,
} from './renderer';

const readSource = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8');

const emittedRuntimeAssets = (relativeDirectory: string): string[] => {
  const directory = resolve(process.cwd(), relativeDirectory);

  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = `${relativeDirectory}/${entry.name}`;

    if (entry.isDirectory()) {
      return emittedRuntimeAssets(relativePath);
    }

    return /\.(?:css|html|js)$/.test(entry.name) ? [relativePath] : [];
  });
};

const remoteImportSource =
  /\b(?:import|export)\s+(?:[^'"\n]+\s+from\s+)?['"](?:https?:)?\/\/|\b(?:import|importScripts)\s*\(\s*['"](?:https?:)?\/\//i;

const remoteHTMLAssetSource =
  /<(?:script|link)\b[^>]*\b(?:src|href)\s*=\s*['"]\s*(?:https?:)?\/\//i;

const remoteCSSAssetSource =
  /@import\s+(?:url\(\s*)?['"]?\s*(?:https?:)?\/\/|url\(\s*['"]?\s*(?:https?:)?\/\/|@font-face[\s\S]{0,800}?src\s*:[^;}]*?(?:https?:)?\/\//i;

const knownViteModulePreloadFetch =
  /document\.querySelectorAll\(['"]link\[rel=["']modulepreload["']\]['"]\)[\s\S]{0,800}\bfetch\(\w+\.href,\w+\)/;

it('STORY-014-AC-1 centralizes the base GFM pipeline', () => {
  const rendererSource = readSource('src/logic/markdown/renderer.ts');
  const previewSource = readSource('src/ui/components/MarkdownView.tsx');

  expect(baseGfmRemarkPlugins).toContain(remarkGfm);
  expect(baseGfmRehypePlugins.at(-1)).toEqual([
    rehypeSanitize,
    baseGfmSanitizeSchema,
  ]);
  expect(rendererSource).not.toMatch(/rehypeRaw|remarkMath/);
  expect(previewSource).toContain('skipHtml');
});

it('STORY-014-AC-6 keeps renderer dependencies and assets offline', () => {
  const packageManifest = JSON.parse(readSource('package.json')) as {
    dependencies: Record<string, string>;
  };
  const rendererSource = readSource('src/logic/markdown/renderer.ts');
  const previewSource = readSource('src/ui/components/MarkdownView.tsx');
  const previewStylesSource = readSource(
    'src/ui/components/MarkdownView.module.css',
  );
  const viteSource = readSource('vite.config.ts');
  const productionSources = [
    rendererSource,
    previewSource,
    previewStylesSource,
    viteSource,
  ].join('\n');

  expect(packageManifest.dependencies).toMatchObject({
    'react-markdown': expect.any(String),
    'rehype-sanitize': expect.any(String),
    'remark-gfm': expect.any(String),
  });
  expect(rendererSource).toContain("from 'rehype-sanitize'");
  expect(rendererSource).toContain("from 'remark-gfm'");
  expect(previewSource).toContain("from 'react-markdown'");
  expect(productionSources).not.toMatch(remoteImportSource);
  expect(productionSources).not.toMatch(/\b(?:fetch|XMLHttpRequest)\s*\(/);
  expect(productionSources).not.toMatch(remoteHTMLAssetSource);
  expect(productionSources).not.toMatch(remoteCSSAssetSource);

  execFileSync(
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['run', 'build'],
    {
      cwd: process.cwd(),
      env: { ...process.env, NODE_ENV: 'production' },
      stdio: 'pipe',
    },
  );

  const runtimeAssets = emittedRuntimeAssets('dist');
  expect(runtimeAssets).not.toHaveLength(0);
  expect(runtimeAssets.some((asset) => asset.endsWith('.html'))).toBe(true);
  expect(runtimeAssets.some((asset) => asset.endsWith('.css'))).toBe(true);
  expect(runtimeAssets.some((asset) => asset.endsWith('.js'))).toBe(true);

  for (const asset of runtimeAssets) {
    const contents = readSource(asset);

    if (asset.endsWith('.html')) {
      expect(contents).not.toMatch(remoteHTMLAssetSource);
    }
    if (asset.endsWith('.css')) {
      expect(contents).not.toMatch(remoteCSSAssetSource);
    }
    if (asset.endsWith('.js')) {
      expect(contents).not.toMatch(remoteImportSource);
      expect(contents).not.toMatch(/\bXMLHttpRequest\s*\(/);

      const fetchCalls = contents.match(/\bfetch\s*\(/g) ?? [];
      if (fetchCalls.length > 0) {
        expect(fetchCalls).toHaveLength(1);
        expect(contents).toMatch(knownViteModulePreloadFetch);
      }
    }
  }
});
