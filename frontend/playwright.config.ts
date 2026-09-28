import { availableParallelism } from 'node:os';

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: 'tests/e2e',
    globalSetup: './tests/support/prepare.ts',
    forbidOnly: true,
    fullyParallel: true,
    retries: 0,
    timeout: 180_000,
    workers: Math.min(4, availableParallelism()),
    outputDir: process.env.PLAYWRIGHT_OUTPUT_DIR ?? 'test-results',
    use: {
        deviceScaleFactor: 1,
        screenshot: 'only-on-failure',
        trace: 'off',
        viewport: { width: 1280, height: 720 },
    },
    projects: [
        {
            name: 'chromium',
            grepInvert: /@native-clipboard/u,
            use: { ...devices['Desktop Chrome'] },
        },
        {
            name: 'chromium-native',
            grep: /@native-clipboard/u,
            workers: 1,
            use: { ...devices['Desktop Chrome'] },
        },
    ],
});
