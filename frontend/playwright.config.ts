import { defineConfig } from '@playwright/test';

export default defineConfig({
  testMatch: 'e2e/**/*.test.ts',
  outputDir: 'test-results',
  snapshotPathTemplate: '{testDir}/{testFilePath}-snapshots/{arg}{ext}',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    deviceScaleFactor: 1,
    viewport: { width: 1280, height: 720 },
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
  webServer: [
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 4173',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: !process.env.CI,
    },
    {
      command:
        'node --experimental-strip-types e2e/parity/reference-server.ts --port 4174',
      url: 'http://127.0.0.1:4174/health',
      reuseExistingServer: !process.env.CI,
    },
  ],
});
