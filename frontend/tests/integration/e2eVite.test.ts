/** @jest-environment node */
import { spawn, type ChildProcess } from 'node:child_process';
import { join, resolve } from 'node:path';

import { availableLocalPort, terminateOwnedProcess, waitForOwnedListener } from '../support/e2eProcess';

describe('E2E frontend server', () => {
    let child: ChildProcess | null = null;
    let origin: string;

    beforeAll(async () => {
        const repository = resolve(process.cwd(), '..');
        const port = await availableLocalPort();
        origin = `http://127.0.0.1:${port}`;
        child = spawn(
            process.execPath,
            [
                join(repository, 'frontend', 'node_modules', 'vite', 'bin', 'vite.js'),
                '--config',
                join(repository, 'frontend', 'tests', 'support', 'e2eVite.config.ts'),
                '--mode',
                'wails',
                '--host',
                '127.0.0.1',
                '--port',
                String(port),
                '--strictPort',
            ],
            {
                cwd: join(repository, 'frontend'),
                detached: true,
                env: { ...process.env, GOMARKEDIT_E2E_REPO: repository },
                stdio: ['ignore', 'pipe', 'pipe'],
            },
        );
        await waitForOwnedListener(port, child, 10_000);
    }, 15_000);

    afterAll(async () => {
        await terminateOwnedProcess(child, true);
    });

    test('serves an inert native document and the unchanged browser app and assets', async () => {
        for (const path of ['/', '/index.html?native-host=1']) {
            const native = await fetch(`${origin}${path}`, { headers: { 'User-Agent': 'Wails desktop wails.io' } });
            expect(native.status).toBe(200);
            expect(native.headers.get('content-type')).toContain('text/html');
            const html = await native.text();
            expect(html).toContain('data-e2e-native-host');
            expect(html).not.toContain('/src/main.tsx');
            expect(html).not.toContain('/@vite/client');
        }
        const browserHTML = await (await fetch(origin)).text();
        expect(browserHTML).toContain('/src/main.tsx');
        expect(browserHTML).toContain('/@vite/client');
        expect(browserHTML).not.toContain('data-e2e-native-host');

        const assetPath = '/src/main.tsx';
        const browserAsset = await (await fetch(`${origin}${assetPath}`)).text();
        const nativeAsset = await (
            await fetch(`${origin}${assetPath}`, { headers: { 'User-Agent': 'Wails desktop wails.io' } })
        ).text();
        expect(nativeAsset).toBe(browserAsset);
        expect(nativeAsset).not.toContain('data-e2e-native-host');
        expect((await fetch(`${origin}/preview-image?path=anything`)).status).toBe(404);
    });
});
