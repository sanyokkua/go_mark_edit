import { join } from 'node:path';

import { defineConfig, loadConfigFromFile, mergeConfig, type Plugin } from 'vite';

function isolatedNativeHost(): Plugin {
    return {
        name: 'e2e-isolated-native-host',
        enforce: 'pre',
        configureServer(server): void {
            server.middlewares.use((request, response, next): void => {
                const path = new URL(request.url ?? '/', 'http://e2e.local').pathname;
                // Wails 2.15.0 pkg/assetserver uses this same public user-agent
                // marker to select desktop IPC instead of browser websocket IPC.
                const native = request.headers['user-agent']?.includes('wails.io') === true;
                if (request.method !== 'GET' || !native || (path !== '/' && path !== '/index.html')) {
                    next();
                    return;
                }
                response.statusCode = 200;
                response.setHeader('Content-Type', 'text/html; charset=utf-8');
                response.setHeader('Cache-Control', 'no-store');
                response.end(
                    '<!doctype html><html><head><meta charset="utf-8"><title>GoMarkEdit native host</title></head><body data-e2e-native-host></body></html>',
                );
            });
        },
    };
}

export default defineConfig(async (environment) => {
    const repository = process.env.GOMARKEDIT_E2E_REPO;
    if (repository === undefined) throw new Error('GOMARKEDIT_E2E_REPO is required by the E2E frontend server');
    const base = await loadConfigFromFile(environment, join(repository, 'frontend', 'vite.config.ts'));
    if (base === null) throw new Error('the selected E2E repository has no Vite configuration');
    return mergeConfig(base.config, { plugins: [isolatedNativeHost()] });
});
