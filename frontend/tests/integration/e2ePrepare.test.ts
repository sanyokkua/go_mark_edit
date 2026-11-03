/** @jest-environment node */
import { isAbsolute, join } from 'node:path';
import { mkdtempSync, mkdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';

import { distIsCurrent, preparedPaths } from '../support/prepare';

describe('E2E bundle freshness', () => {
    let root: string;
    const previousReuse = process.env.GOMARKEDIT_E2E_REUSE_DIST;
    const old = new Date('2020-01-01T00:00:00Z');
    const built = new Date('2021-01-01T00:00:00Z');
    const recent = new Date('2022-01-01T00:00:00Z');
    const touch = (path: string, time: Date): void => utimesSync(path, time, time);
    const create = (path: string): void => {
        mkdirSync(join(path, '..'), { recursive: true });
        writeFileSync(path, 'fixture');
    };
    beforeEach(() => {
        const artifacts = join(process.cwd(), '..', '.local_tmp_files');
        mkdirSync(artifacts, { recursive: true });
        root = mkdtempSync(join(artifacts, 'gomarkedit-freshness-'));
        for (const name of [
            'frontend/src/a.ts',
            'frontend/scripts/generate.mjs',
            'frontend/wailsjs/a.js',
            'frontend/vite.config.ts',
            'frontend/package.json',
            'frontend/dist/index.html',
            'internal/a.go',
            'pkg/a.go',
            'main.go',
            'wails.json',
            'go.mod',
            'go.sum',
            '.prettierrc.json',
        ])
            create(join(root, name));
        for (const name of [
            'frontend/src/a.ts',
            'frontend/scripts/generate.mjs',
            'frontend/wailsjs/a.js',
            'frontend/vite.config.ts',
            'frontend/package.json',
            'internal/a.go',
            'pkg/a.go',
            'main.go',
            'wails.json',
            'go.mod',
            'go.sum',
            '.prettierrc.json',
            'frontend/src',
            'frontend/scripts',
            'frontend/wailsjs',
            'internal',
            'pkg',
            'frontend',
            '.',
        ])
            touch(join(root, name), old);
        touch(join(root, 'frontend/dist/index.html'), built);
        process.env.GOMARKEDIT_E2E_REUSE_DIST = '1';
    });
    afterEach(() => {
        if (previousReuse === undefined) delete process.env.GOMARKEDIT_E2E_REUSE_DIST;
        else process.env.GOMARKEDIT_E2E_REUSE_DIST = previousReuse;
        rmSync(root, { recursive: true, force: true });
    });
    test('requires opt-in and a present, current bundle', () => {
        expect(distIsCurrent(root)).toBe(true);
        delete process.env.GOMARKEDIT_E2E_REUSE_DIST;
        expect(distIsCurrent(root)).toBe(false);
        process.env.GOMARKEDIT_E2E_REUSE_DIST = '1';
        rmSync(join(root, 'frontend/dist/index.html'));
        expect(distIsCurrent(root)).toBe(false);
    });
    test.each([
        'frontend/src/a.ts',
        'frontend/scripts/generate.mjs',
        'frontend/wailsjs/a.js',
        'frontend/package.json',
        'frontend/vite.config.ts',
        'internal/a.go',
        'pkg/a.go',
        'main.go',
        'wails.json',
        'go.mod',
        'go.sum',
        '.prettierrc.json',
    ])('rejects newer %s', (name) => {
        touch(join(root, name), recent);
        expect(distIsCurrent(root)).toBe(false);
    });
    test.each(['frontend/vite.config.ts', 'frontend/package.json', 'main.go', 'wails.json', 'internal/a.go'])(
        'rejects deleted %s',
        (name) => {
            rmSync(join(root, name));
            touch(join(root, name, '..'), recent);
            expect(distIsCurrent(root)).toBe(false);
        },
    );
    test('ignores generated theme output', () => {
        const generated = join(root, 'frontend/src/generatedEditorThemes.ts');
        create(generated);
        touch(join(root, 'frontend/src'), old);
        touch(generated, recent);
        expect(distIsCurrent(root)).toBe(true);
    });
    test('rejects an added nested input', () => {
        create(join(root, 'internal/new.go'));
        touch(join(root, 'internal'), recent);
        expect(distIsCurrent(root)).toBe(false);
    });
});

describe('prepared E2E paths', () => {
    const previous = process.env.GOMARKEDIT_E2E_RUN_DIR;
    const previousFrontend = process.env.GOMARKEDIT_E2E_FRONTEND_URL;
    const previousProductionFrontend = process.env.GOMARKEDIT_E2E_PRODUCTION_FRONTEND_URL;
    afterEach(() => {
        if (previous === undefined) delete process.env.GOMARKEDIT_E2E_RUN_DIR;
        else process.env.GOMARKEDIT_E2E_RUN_DIR = previous;
        if (previousFrontend === undefined) delete process.env.GOMARKEDIT_E2E_FRONTEND_URL;
        else process.env.GOMARKEDIT_E2E_FRONTEND_URL = previousFrontend;
        if (previousProductionFrontend === undefined) delete process.env.GOMARKEDIT_E2E_PRODUCTION_FRONTEND_URL;
        else process.env.GOMARKEDIT_E2E_PRODUCTION_FRONTEND_URL = previousProductionFrontend;
    });

    test('requires a setup-published absolute run directory', () => {
        delete process.env.GOMARKEDIT_E2E_RUN_DIR;
        expect(() => preparedPaths()).toThrow('GOMARKEDIT_E2E_RUN_DIR');
        process.env.GOMARKEDIT_E2E_RUN_DIR = 'relative-run';
        expect(() => preparedPaths()).toThrow('absolute');
    });

    test('requires both prepared frontend URLs', () => {
        process.env.GOMARKEDIT_E2E_RUN_DIR = join(process.cwd(), 'sample-run');
        delete process.env.GOMARKEDIT_E2E_FRONTEND_URL;
        expect(() => preparedPaths()).toThrow('GOMARKEDIT_E2E_FRONTEND_URL');
        process.env.GOMARKEDIT_E2E_FRONTEND_URL = 'http://127.0.0.1:41234';
        delete process.env.GOMARKEDIT_E2E_PRODUCTION_FRONTEND_URL;
        expect(() => preparedPaths()).toThrow('GOMARKEDIT_E2E_PRODUCTION_FRONTEND_URL');
    });

    test('gives every worker the same prepared app, seed, and frontend URLs', () => {
        const runDirectory = join(process.cwd(), 'sample-run');
        process.env.GOMARKEDIT_E2E_RUN_DIR = runDirectory;
        process.env.GOMARKEDIT_E2E_FRONTEND_URL = 'http://127.0.0.1:41234';
        process.env.GOMARKEDIT_E2E_PRODUCTION_FRONTEND_URL = 'http://127.0.0.1:41235';
        const paths = preparedPaths();
        expect(isAbsolute(paths.executable)).toBe(true);
        expect(paths).toEqual({
            runDirectory,
            executable: join(runDirectory, 'GoMarkEdit'),
            seedExecutable: join(runDirectory, 'e2e-seed'),
            frontendURL: 'http://127.0.0.1:41234',
            productionFrontendURL: 'http://127.0.0.1:41235',
        });
    });
});
