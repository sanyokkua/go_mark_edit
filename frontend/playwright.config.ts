import { availableParallelism } from 'node:os';

import { defineConfig, devices } from '@playwright/test';

const isCI = Boolean(process.env.CI);

// Files that exercise behaviour tied to the platform the product ships on. The release
// workflow sets E2E_SUBSET=macos to run only these plus the @native-clipboard tests, serially.
const macosSubset = process.env.E2E_SUBSET === 'macos';
const macosFiles = /(?:pdf-export|launch-target|menus)\.test\.ts$/u;

// Timing-bound tests (@perf) and the native clipboard tests run alone, after the parallel
// project, so concurrent workers never inflate a latency measurement.
export default defineConfig({
    testDir: 'tests/e2e',
    globalSetup: './tests/support/prepare.ts',
    forbidOnly: true,
    fullyParallel: true,
    retries: 0,
    timeout: 180_000,
    workers: isCI ? 3 : Math.min(4, availableParallelism()),
    expect: { timeout: isCI ? 15_000 : 5_000 },
    outputDir: process.env.PLAYWRIGHT_OUTPUT_DIR ?? 'test-results',
    use: {
        deviceScaleFactor: 1,
        screenshot: 'only-on-failure',
        trace: 'off',
        viewport: { width: 1280, height: 720 },
    },
    projects: macosSubset
        ? [
              {
                  name: 'chromium-macos',
                  testMatch: macosFiles,
                  grepInvert: /@native-clipboard/u,
                  fullyParallel: false,
                  workers: 1,
                  use: { ...devices['Desktop Chrome'] },
              },
              {
                  name: 'chromium-native',
                  grep: /@native-clipboard/u,
                  dependencies: ['chromium-macos'],
                  fullyParallel: false,
                  workers: 1,
                  use: { ...devices['Desktop Chrome'] },
              },
          ]
        : [
              {
                  name: 'chromium',
                  grepInvert: /@native-clipboard|@perf/u,
                  use: { ...devices['Desktop Chrome'] },
              },
              {
                  name: 'chromium-serial',
                  grep: /@perf/u,
                  grepInvert: /@native-clipboard/u,
                  dependencies: ['chromium'],
                  fullyParallel: false,
                  workers: 1,
                  use: { ...devices['Desktop Chrome'] },
              },
              {
                  name: 'chromium-native',
                  grep: /@native-clipboard/u,
                  dependencies: ['chromium-serial'],
                  fullyParallel: false,
                  workers: 1,
                  use: { ...devices['Desktop Chrome'] },
              },
          ],
});
