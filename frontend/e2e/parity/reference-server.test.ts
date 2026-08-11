import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { get } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  hashReferenceSource,
  referenceNavigationUrl,
  startReferenceServer,
} from './reference-server';

it('uses a query navigation token so repeated fragment changes receive headers', () => {
  const first = referenceNavigationUrl(
    'http://127.0.0.1:4184',
    'base',
    'glass-light',
    'editor-split',
    1,
  );
  const second = referenceNavigationUrl(
    'http://127.0.0.1:4184',
    'base',
    'glass-light',
    'editor-split',
    2,
  );

  expect(new URL(first).search).toContain('navigation=1');
  expect(new URL(second).search).toContain('navigation=2');
  expect(new URL(first).hash).toBe('#glass-light/editor-split');
  expect(first).not.toBe(second);
});

it('carries the explicit file-only launcher state through the reference URL', () => {
  const url = referenceNavigationUrl(
    'http://127.0.0.1:4184',
    'file-only',
    'minimal-light',
    'empty',
    3,
    'six-file',
  );

  expect(new URL(url).searchParams.get('file-only-state')).toBe('six-file');
});

it('serves the reviewed zero-Assistant adapter while preserving the raw source hash', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'gomarkedit-reference-'));
  const referencePath = join(directory, 'mockup.html');
  const source =
    '<html><body><div class="app" id="app"><main>binding</main></div></body></html>';
  await writeFile(referencePath, source, 'utf8');

  const server = await startReferenceServer({ referencePath });
  try {
    const response = await new Promise<{
      readonly body: string;
      readonly headers: Record<string, string | string[] | undefined>;
      readonly status: number;
    }>((resolveResponse, rejectResponse) => {
      get(
        `${server.origin}/?variant=base&navigation=1#glass-light/editor-split`,
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () =>
            resolveResponse({
              body: Buffer.concat(chunks).toString('utf8'),
              headers: res.headers,
              status: res.statusCode ?? 0,
            }),
          );
        },
      ).on('error', rejectResponse);
    });
    expect(response.status).toBe(200);
    expect(response.headers['x-reference-source-sha256']).toBe(
      hashReferenceSource(await readFile(referencePath)),
    );
    expect(response.headers['x-reference-variant']).toBe('base');
    expect(response.body).toContain('<div class="app no-assistant" id="app">');
  } finally {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});
