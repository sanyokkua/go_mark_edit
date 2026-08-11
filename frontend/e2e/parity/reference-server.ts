import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  adaptReferenceHtml,
  referenceVariants,
  type ReferenceVariant,
  // @ts-expect-error Node's strip-types CLI requires the explicit TypeScript extension.
} from './reference-adapter.ts';

export interface ReferenceServerHandle {
  readonly origin: string;
  readonly referencePath: string;
  readonly sourceHash: string;
  close(): Promise<void>;
}

export interface ReferenceServerOptions {
  readonly host?: string;
  readonly port?: number;
  readonly referencePath?: string;
}

/**
 * Build a fresh HTTP navigation URL for a mapped reference state. The
 * navigation token is intentionally outside the fragment so Playwright gets
 * a response (and therefore the immutable-source headers) even when only the
 * palette or screen changes between captures.
 */
export function referenceNavigationUrl(
  origin: string,
  variant: ReferenceVariant,
  palette: string,
  screen: string,
  navigationToken: number,
): string {
  const url = new URL('/', origin);
  url.searchParams.set('variant', variant);
  url.searchParams.set('navigation', String(navigationToken));
  url.hash = `${palette}/${screen}`;
  return url.toString();
}

const defaultReferencePath = resolve(
  process.cwd(),
  '../docs/delivery/spec/surface/mockup.html',
);

function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function listen(server: Server, host: string, port: number): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const onError = (error: Error): void => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = (): void => {
      server.off('error', onError);
      const address = server.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('Reference server did not expose a TCP address'));
        return;
      }
      resolvePort(address.port);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });
}

export async function startReferenceServer(
  options: ReferenceServerOptions = {},
): Promise<ReferenceServerHandle> {
  const host = options.host ?? '127.0.0.1';
  const referencePath = options.referencePath ?? defaultReferencePath;
  const source = await readFile(referencePath);
  const sourceHash = sha256(source);
  const server = createServer((request, response): void => {
    const requestUrl = new URL(
      request.url ?? '/',
      'http://reference-server.invalid',
    );
    const pathname = requestUrl.pathname;
    if (pathname === '/health') {
      response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('ready');
      return;
    }
    if (pathname !== '/' && pathname !== '/index.html') {
      response.writeHead(404);
      response.end();
      return;
    }
    const requestedVariant = requestUrl.searchParams.get('variant') ?? 'base';
    if (!referenceVariants.includes(requestedVariant as ReferenceVariant)) {
      response.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
      response.end(`Unsupported reference variant: ${requestedVariant}`);
      return;
    }
    const adapted = adaptReferenceHtml(
      source.toString('utf8'),
      requestedVariant as ReferenceVariant,
    );
    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-type': 'text/html; charset=utf-8',
      'x-reference-source-sha256': sourceHash,
      'x-reference-variant': requestedVariant,
    });
    response.end(adapted.html);
  });
  const port = await listen(server, host, options.port ?? 0);

  return {
    origin: `http://${host}:${port}`,
    referencePath,
    sourceHash,
    close: async (): Promise<void> => {
      await new Promise<void>((resolveClose, reject) => {
        server.close((error) => (error ? reject(error) : resolveClose()));
      });
    },
  };
}

export function hashReferenceSource(source: string | Buffer): string {
  return sha256(Buffer.isBuffer(source) ? source : Buffer.from(source));
}

async function runCli(): Promise<void> {
  const portArgument = process.argv.indexOf('--port');
  const port =
    portArgument >= 0 ? Number(process.argv[portArgument + 1]) : 4174;
  const handle = await startReferenceServer({ port });
  console.log(`reference server ready at ${handle.origin}`);
  const shutdown = (): void => {
    void handle.close().finally(() => process.exit(0));
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

if (process.argv[1]?.endsWith('reference-server.ts')) {
  void runCli();
}
