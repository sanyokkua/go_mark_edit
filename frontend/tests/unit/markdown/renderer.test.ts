import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';

import {
  baseGfmRehypePlugins,
  baseGfmRemarkPlugins,
  baseGfmSanitizeSchema,
} from '../../../src/logic/markdown/renderer';
import MarkdownView from '../../../src/ui/components/MarkdownView';

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

it('centralizes the base GFM pipeline', () => {
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

it('keeps renderer dependencies and assets offline', () => {
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

it('renders accessible repeated GFM footnotes and backlinks', () => {
  const { container, unmount } = render(
    createElement(MarkdownView, {
      source:
        'First reference[^note] and repeated reference[^note].\n\n[^note]: A footnote.',
    }),
  );

  const references = screen.getAllByRole('link', { name: '1' });
  expect(references).toHaveLength(2);
  const referenceIds = references.map((reference) => reference.id);
  expect(referenceIds.every((id) => id.length > 0)).toBe(true);
  expect(new Set(referenceIds).size).toBe(referenceIds.length);

  const definition = screen.getByRole('listitem');
  expect(definition).toHaveTextContent('A footnote.');
  expect(definition.id).not.toBe('');
  for (const reference of references) {
    expect(reference).toHaveAttribute('href', `#${definition.id}`);
    expect(container.querySelector(reference.getAttribute('href') ?? '')).toBe(
      definition,
    );
  }

  const backlinks = screen.getAllByRole('link', { name: /Back to reference/ });
  expect(backlinks).toHaveLength(2);
  for (const backlink of backlinks) {
    const referenceId = backlink.getAttribute('href')?.slice(1);
    expect(referenceIds).toContain(referenceId);
    expect(
      container.querySelector(backlink.getAttribute('href') ?? ''),
    ).not.toBeNull();
  }

  // A second render must retain the same deterministic generated IDs.
  unmount();
  render(
    createElement(MarkdownView, {
      source:
        'First reference[^note] and repeated reference[^note].\n\n[^note]: A footnote.',
    }),
  );
  const secondRenderReferenceIds = screen
    .getAllByRole('link', { name: '1' })
    .map((reference) => reference.id);
  expect(secondRenderReferenceIds).toEqual(referenceIds);
});

it('sanitizes malicious footnotes and stable ids (EC-RENDER-5)', () => {
  const { container } = render(
    createElement(MarkdownView, {
      source:
        'Safe surrounding content. A reference[^safe] and a maliciously labelled reference[^unsafe" onclick="alert(1)].\n\n[^safe]: Safe footnote text <script>alert(1)</script> <img src="https://example.test/raw.png" onerror="alert(1)"> [unsafe](javascript:alert(1))\n\n[^unsafe" onclick="alert(1)]: A second safe footnote.',
    }),
  );

  expect(container.querySelector('script')).not.toBeInTheDocument();
  expect(container.querySelector('[onerror], [onclick]')).toBeNull();
  expect(container.querySelector('[href^="javascript:"]')).toBeNull();
  expect(screen.getByText(/Safe surrounding content/)).toBeInTheDocument();
  expect(screen.getByText(/Safe footnote text/)).toBeInTheDocument();
  expect(screen.getByText(/A second safe footnote/)).toBeInTheDocument();
  const ids = [...container.querySelectorAll('[id]')].map(({ id }) => id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids.every((id) => /^[A-Za-z][\w-]*$/.test(id))).toBe(true);
});

it('attempts zero runtime requests and keeps higher tiers literal (EC-RENDER-6)', () => {
  const attemptedRequests: string[] = [];
  const fetchDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
  const xhrDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    'XMLHttpRequest',
  );
  const webSocketDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    'WebSocket',
  );
  const imageSourceDescriptor = Object.getOwnPropertyDescriptor(
    HTMLImageElement.prototype,
    'src',
  );
  const scriptSourceDescriptor = Object.getOwnPropertyDescriptor(
    HTMLScriptElement.prototype,
    'src',
  );
  const linkHrefDescriptor = Object.getOwnPropertyDescriptor(
    HTMLLinkElement.prototype,
    'href',
  );

  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: (): Promise<never> => {
      attemptedRequests.push('fetch');
      return Promise.reject(new Error('network request attempted'));
    },
  });
  Object.defineProperty(globalThis, 'XMLHttpRequest', {
    configurable: true,
    value: class {
      constructor() {
        attemptedRequests.push('XMLHttpRequest');
      }
    },
  });
  Object.defineProperty(globalThis, 'WebSocket', {
    configurable: true,
    value: class {
      constructor() {
        attemptedRequests.push('WebSocket');
      }
    },
  });

  const recordResourceAssignment = (
    prototype: object,
    property: 'src' | 'href',
    descriptor: PropertyDescriptor | undefined,
  ): void => {
    Object.defineProperty(prototype, property, {
      configurable: true,
      get: descriptor?.get,
      set(value: string): void {
        attemptedRequests.push(`${property}:${value}`);
      },
    });
  };

  recordResourceAssignment(
    HTMLImageElement.prototype,
    'src',
    imageSourceDescriptor,
  );
  recordResourceAssignment(
    HTMLScriptElement.prototype,
    'src',
    scriptSourceDescriptor,
  );
  recordResourceAssignment(
    HTMLLinkElement.prototype,
    'href',
    linkHrefDescriptor,
  );

  try {
    const { container } = render(
      createElement(MarkdownView, {
        source:
          'Footnote[^note] with $x^2$ and :note[directive syntax].\n\n[^note]: ![resource](https://example.test/image.png)\n\n<script src="https://example.test/script.js"></script>',
      }),
    );

    expect(screen.getByText(/\$x\^2\$/)).toBeInTheDocument();
    expect(screen.getByText(/:note\[directive syntax\]/)).toBeInTheDocument();
    expect(
      container.querySelectorAll(
        'img[src], script[src], link[href], audio[src], video[src], iframe[src], source[src], object[data], embed[src], [srcset]',
      ),
    ).toHaveLength(0);
    expect(attemptedRequests).toEqual([]);
  } finally {
    const restoreProperty = (
      target: object,
      property: string,
      descriptor: PropertyDescriptor | undefined,
    ): void => {
      if (descriptor === undefined) {
        delete (target as Record<string, unknown>)[property];
        return;
      }
      Object.defineProperty(target, property, descriptor);
    };

    restoreProperty(globalThis, 'fetch', fetchDescriptor);
    restoreProperty(globalThis, 'XMLHttpRequest', xhrDescriptor);
    restoreProperty(globalThis, 'WebSocket', webSocketDescriptor);
    restoreProperty(HTMLImageElement.prototype, 'src', imageSourceDescriptor);
    restoreProperty(HTMLScriptElement.prototype, 'src', scriptSourceDescriptor);
    restoreProperty(HTMLLinkElement.prototype, 'href', linkHrefDescriptor);
  }
});

/*
 * . requires live preview to remain active "through exactly
 * 2 MiB", so the pipeline must actually be able to process a document of
 * exactly PREVIEW_BYTE_LIMIT bytes. Nothing exercised that: `PreviewPane`'s
 * own tests compare `byteLength` as a number and never parse anything large,
 * so the one size the requirement names was the one size never run.
 *
 * This measures the pipeline, which is the part the requirement can hold to a
 * budget. It is deliberately NOT a claim about the 2 MiB host wedge recorded in
 * `evidence/ft-ev-09/host-walkthrough-2026-08-19/`: that stall was measured at
 * minutes while this pipeline handles the very same file in 579 ms under JSC
 * and 1,411 ms under V8, and its profile points at quadratic array writes in
 * application code, not at markdown. A test that asserted otherwise would
 * record coverage this repo does not have.
 *
 * The shape is the host fixture's: 1,100-character lines. Line count, not byte
 * count, drives parse cost — at this same 2 MiB, 80-character lines take about
 * ten times longer — so this budget does not bound the short-line case, which
 * is filed separately.
 */
// exactly the 2 MiB live-preview limit, rather than that the preview renders it
// within any interactive budget.)
it('processes a document of exactly the 2 MiB preview limit', () => {
  const PREVIEW_BYTE_LIMIT = 2_097_152;
  const line = 'lorem ipsum dolor sit amet consectetur adipiscing elit '
    .repeat(20)
    .slice(0, 1100);
  let source = '';
  while (source.length < PREVIEW_BYTE_LIMIT) source += `${line}\n`;
  source = source.slice(0, PREVIEW_BYTE_LIMIT);
  expect(Buffer.byteLength(source, 'utf8')).toBe(PREVIEW_BYTE_LIMIT);

  const processor = unified()
    .use(remarkParse)
    .use(baseGfmRemarkPlugins)
    .use(remarkRehype)
    .use(baseGfmRehypePlugins);

  const startedAt = performance.now();
  const tree = processor.runSync(processor.parse(source));
  const elapsedMs = performance.now() - startedAt;

  expect(tree.type).toBe('root');
  /*
   * Measured at 1,411 ms in V8 on this shape, so this allows roughly a 5x
   * margin for a loaded CI runner. It is set to catch a change in complexity
   * class, not a slow machine.
   *
   * 15,000 ms was the first choice and was wrong: the 80-character-line shape
   * at this same size measures 14,916 ms, so a budget of 15 s would have
   * admitted an order-of-magnitude worse case as a pass.
   */
  expect(elapsedMs).toBeLessThan(8_000);
}, 30_000);
