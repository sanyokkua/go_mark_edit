import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

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
    if (request.url === '/health') {
      response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('ready');
      return;
    }
    if (request.url !== '/' && request.url !== '/index.html') {
      response.writeHead(404);
      response.end();
      return;
    }
    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-type': 'text/html; charset=utf-8',
      'x-reference-source-sha256': sourceHash,
    });
    response.end(source);
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

if (process.argv[1]?.endsWith('reference-server.ts')) {
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
