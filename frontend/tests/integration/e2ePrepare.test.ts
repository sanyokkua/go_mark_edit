/** @jest-environment node */
import { isAbsolute, join } from 'node:path';

import { preparedPaths } from '../support/prepare';

describe('prepared E2E paths', () => {
    const previous = process.env.GOMARKEDIT_E2E_RUN_DIR;
    const previousFrontend = process.env.GOMARKEDIT_E2E_FRONTEND_URL;
    afterEach(() => {
        if (previous === undefined) delete process.env.GOMARKEDIT_E2E_RUN_DIR;
        else process.env.GOMARKEDIT_E2E_RUN_DIR = previous;
        if (previousFrontend === undefined) delete process.env.GOMARKEDIT_E2E_FRONTEND_URL;
        else process.env.GOMARKEDIT_E2E_FRONTEND_URL = previousFrontend;
    });

    test('requires a setup-published absolute run directory', () => {
        delete process.env.GOMARKEDIT_E2E_RUN_DIR;
        expect(() => preparedPaths()).toThrow('GOMARKEDIT_E2E_RUN_DIR');
        process.env.GOMARKEDIT_E2E_RUN_DIR = 'relative-run';
        expect(() => preparedPaths()).toThrow('absolute');
    });

    test('gives every worker the same prepared app, seed, and frontend URL', () => {
        const runDirectory = join(process.cwd(), 'sample-run');
        process.env.GOMARKEDIT_E2E_RUN_DIR = runDirectory;
        process.env.GOMARKEDIT_E2E_FRONTEND_URL = 'http://127.0.0.1:41234';
        const paths = preparedPaths();
        expect(isAbsolute(paths.executable)).toBe(true);
        expect(paths).toEqual({
            runDirectory,
            executable: join(runDirectory, 'GoMarkEdit'),
            seedExecutable: join(runDirectory, 'e2e-seed'),
            frontendURL: 'http://127.0.0.1:41234',
        });
    });
});
