import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  forbidOnly: true,
  fullyParallel: false,
  retries: 0,
  timeout: 180_000,
  workers: 1,
  outputDir: 'test-results',
  use: {
    baseURL: 'http://localhost:34115',
    deviceScaleFactor: 1,
    viewport: { width: 1280, height: 720 },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
