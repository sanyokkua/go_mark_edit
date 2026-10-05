import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const rootDir = fileURLToPath(new URL('.', import.meta.url));
const workerEntityDecoder = createRequire(import.meta.url).resolve('decode-named-character-reference');

function workerEntityDecoderPlugin(): Plugin {
    return {
        name: 'worker-entity-decoder',
        enforce: 'pre',
        resolveId(source): string | undefined {
            // The package's browser export touches document at import time; workers use its data-only export.
            if (source === 'decode-named-character-reference') return workerEntityDecoder;
        },
    };
}

function previewImageBackendRoutePlugin(): Plugin {
    return {
        name: 'preview-image-backend-route',
        configureServer(server): void {
            server.middlewares.use((request, response, next): void => {
                const path = request.url?.split('?', 1)[0];
                if (path !== '/preview-image') {
                    next();
                    return;
                }
                response.statusCode = 404;
                response.end();
            });
        },
    };
}

function katexWoff2OnlyPlugin(): Plugin {
    return {
        name: 'katex-woff2-only',
        enforce: 'pre',
        transform(source, id): string | undefined {
            if (!/[\\/]katex[\\/]dist[\\/]katex\.min\.css(?:\?|$)/u.test(id)) return undefined;
            return source.replace(/,url\([^)]*\.(?:woff|ttf)\) format\("(?:woff|truetype)"\)/gu, '');
        },
    };
}

export default defineConfig({
    base: './',
    plugins: [previewImageBackendRoutePlugin(), katexWoff2OnlyPlugin(), react()],
    build: {
        assetsInlineLimit: 0,
        modulePreload: { polyfill: false },
        rollupOptions: {
            preserveEntrySignatures: 'strict',
            input: {
                main: path.resolve(rootDir, 'index.html'),
                tidyClient: path.resolve(rootDir, 'src/logic/tidy/runTidy.ts'),
            },
        },
    },
    resolve: {
        alias: {
            wailsjs: path.resolve(rootDir, 'wailsjs'),
        },
    },
    optimizeDeps: {
        // Lazy preview and tidy imports must not reload the shared dev server during an active command.
        include: ['mermaid', 'get-east-asian-width', 'micromark-util-classify-character'],
        esbuildOptions: {
            // Dev prebundling bypasses worker.plugins and otherwise selects the DOM-only browser export.
            plugins: [
                {
                    name: 'worker-entity-decoder',
                    setup(build): void {
                        build.onResolve({ filter: /^decode-named-character-reference$/ }, () => ({
                            path: workerEntityDecoder,
                        }));
                    },
                },
            ],
        },
    },
    worker: {
        format: 'es',
        plugins: () => [workerEntityDecoderPlugin()],
    },
});
