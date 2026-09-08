import { defineConfig } from '@playwright/test';

export default defineConfig({
  /*
   * The `e2e/parity` directory belongs to Jest by explicit declaration: its
   * `jest.config.js` testMatch entry names that directory recursively. Those
   * files are pure unit tests of the manifest, adapter, comparator and state
   * contract, and they use bare `describe`/`it`, which Playwright does not
   * provide. A recursive glob here captured them as well, so `playwright test`
   * with no arguments — exactly what `just e2e-test` runs — died with
   * `ReferenceError: it is not defined` during collection, before a single
   * browser case executed. Matching only the top level gives each file one
   * owner; nothing is excluded from verification.
   */
  testMatch: 'e2e/*.test.ts',
  outputDir: 'test-results',
  /*
   * T054's per-key accounting. Setup truncates the run's capture log; teardown
   * turns it into `evidence/ft-vs-08/parity/accounting-report.json`. The report
   * is only written when the run actually recorded parity captures — see
   * `accounting-global.ts`.
   */
  globalSetup: './e2e/parity/accounting-setup.ts',
  globalTeardown: './e2e/parity/accounting-teardown.ts',
  snapshotPathTemplate: '{testDir}/{testFilePath}-snapshots/{arg}{ext}',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    deviceScaleFactor: 1,
    /*
     * Parity compares two pages at zero tolerance, so the renderer itself has
     * to be deterministic. Chromium's partial-raster optimisation re-rasters
     * only the invalidated sub-rectangle of a tile and reuses the rest, and
     * the full and partial paths quantise an antialiased arc one step
     * differently. Measured on the T062 tab-strip slice: production captured
     * the same bytes in 12 of 12 runs, while the immutable reference
     * alternated between two rasters 8/4 over 12 runs, one of which was
     * byte-identical to production. The 42 "unexplained" pixels that produced
     * were confined to the four 7px rounded corners of one control at a
     * maximum channel delta of 2, with every compared bound, computed style
     * and sub-pixel phase identical on both pages. Disabling partial raster
     * makes both pages deterministic (12 of 12 identical). This changes no
     * tolerance, mask, mapping or comparator, and applies equally to both
     * pages — it removes a renderer race, it does not hide a difference.
     */
    launchOptions: { args: ['--disable-partial-raster'] },
    viewport: { width: 1280, height: 720 },
  },
  /*
   * SC-FT-012 requires that "three consecutive deterministic local runs MUST
   * produce identical reference and actual image hashes for every unchanged one
   * of the 14 component keys and identical assertion lists for every one of the
   * 36 behaviour keys". That is a different guarantee from `captureWhenStable`,
   * which settles a *single* capture by taking it until three consecutive hashes
   * match; nothing was re-executing a case three times. `repeatEach: 3` on a
   * parity-only project is what supplies it.
   *
   * It is scoped to `targeted-parity.test.ts` alone, deliberately. That file
   * owns both halves of the contract SC-FT-012 names. Repeating the behavioural
   * suites would triple `offline-and-controls.test.ts`, whose FR-FT-048 case
   * watches a live application for five continuous minutes, and buy nothing.
   *
   * The image-hash half needs no separate assertion: every component case
   * compares against the immutable reference at zero tolerance, so three passes
   * mean the actual matched the same reference three times. The assertion-list
   * half is compared explicitly in T063 against the list the previous run left
   * on disk.
   */
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
      testIgnore: 'e2e/targeted-parity.test.ts',
    },
    {
      name: 'parity',
      use: { browserName: 'chromium' },
      testMatch: 'e2e/targeted-parity.test.ts',
      repeatEach: 3,
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
