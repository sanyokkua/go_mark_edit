import { expect, test, type Page, type Route } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { getAction } from '../src/logic/actions/actionRegistry';

/*
 * FR-FT-048: file and tab behaviour must make zero background network requests,
 * use no remote assets and no telemetry.
 *
 * `frontend/scripts/check-production-network.mjs` already proves this
 * statically over the sources and the built bundle. What it cannot prove is the
 * running application: a timer, a retry, an update check or a font fetch only
 * shows itself while the app is alive. This suite watches a live application
 * continuously and DENIES anything non-local rather than merely counting it, so
 * a request that did happen cannot pass unnoticed as a silent failure.
 */

const EVIDENCE_ROOT = join(
  '..',
  'specs',
  '003-real-files-and-tabs',
  'evidence',
  'ft-vs-08',
  'offline-and-controls',
);

const LOCAL_ORIGIN = 'http://127.0.0.1:4173';

/** Five continuous minutes, as FR-FT-048's evidence requires. */
const OBSERVATION_MS = 5 * 60 * 1000;
const SAMPLE_INTERVAL_MS = 10 * 1000;

type DeniedRequest = {
  readonly atMs: number;
  readonly method: string;
  readonly url: string;
  readonly resourceType: string;
};

/**
 * Route every request. Local ones continue; anything else is aborted and
 * recorded. Aborting is the point — an assertion on a counter proves only that
 * nobody looked, while a denied request changes the application's behaviour and
 * would surface as a visible failure too.
 */
async function denyNonLocal(
  page: Page,
  denied: DeniedRequest[],
  startedAt: number,
): Promise<void> {
  await page.route('**', async (route: Route): Promise<void> => {
    const request = route.request();
    const url = request.url();
    const isLocal =
      url.startsWith('data:') ||
      url.startsWith('blob:') ||
      new URL(url).origin === LOCAL_ORIGIN;
    if (isLocal) {
      await route.continue();
      return;
    }
    denied.push({
      atMs: Date.now() - startedAt,
      method: request.method(),
      url,
      resourceType: request.resourceType(),
    });
    await route.abort('blockedbyclient');
  });
}

test('FR-FT-048 makes no outbound request across five continuous minutes of a live application', async ({
  page,
}) => {
  test.setTimeout(OBSERVATION_MS + 120_000);

  const denied: DeniedRequest[] = [];
  const startedAt = Date.now();
  await denyNonLocal(page, denied, startedAt);

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await expect(page.getByTestId('application-shell')).toBeVisible();

  const editor = page.locator('.monaco-editor');
  await expect(editor).toBeVisible();
  const input = editor.locator('textarea.inputarea');

  /*
   * Idle alone would not exercise the paths most likely to reach out: an
   * update check on focus, a font or telemetry call on first paint of a
   * surface, a retry after an edit. So the window is spent alternating idle
   * with real interaction rather than sitting still.
   */
  const samples: { atMs: number; deniedSoFar: number; action: string }[] = [];
  let elapsed = 0;
  let tick = 0;
  while (elapsed < OBSERVATION_MS) {
    const action = [
      'idle',
      'type',
      'open-settings',
      'switch-theme',
      'open-view-menu',
      'new-tab',
    ][tick % 6];

    switch (action) {
      case 'type':
        await input.focus();
        await page.keyboard.insertText(`offline-probe-${tick}\n`);
        break;
      case 'open-settings':
        await page
          .getByRole('button', { name: 'Settings', exact: true })
          .click();
        await expect(
          page.getByRole('menu', { name: 'Settings menu' }),
        ).toBeVisible();
        await page.keyboard.press('Escape');
        break;
      case 'switch-theme':
        await page
          .getByRole('button', { name: 'Settings', exact: true })
          .click();
        await page
          .getByRole('menu', { name: 'Settings menu' })
          .getByRole('radio', {
            name: tick % 12 === 3 ? 'Material' : 'Minimal',
          })
          .click();
        await page.keyboard.press('Escape');
        break;
      case 'open-view-menu':
        await page.getByRole('button', { name: 'View', exact: true }).click();
        await expect(
          page.getByRole('menu', { name: 'View options' }),
        ).toBeVisible();
        await page.keyboard.press('Escape');
        break;
      case 'new-tab':
        await page.getByRole('button', { name: 'New tab' }).click();
        break;
      default:
        break;
    }

    await page.waitForTimeout(SAMPLE_INTERVAL_MS);
    elapsed = Date.now() - startedAt;
    samples.push({ atMs: elapsed, deniedSoFar: denied.length, action });
    tick += 1;
  }

  const observedMs = Date.now() - startedAt;
  await mkdir(EVIDENCE_ROOT, { recursive: true });
  await writeFile(
    join(EVIDENCE_ROOT, 'five-minute-request-denial.json'),
    JSON.stringify(
      {
        requirement: 'FR-FT-048',
        localOrigin: LOCAL_ORIGIN,
        observedMs,
        observedMinutes: Number((observedMs / 60000).toFixed(2)),
        sampleIntervalMs: SAMPLE_INTERVAL_MS,
        interactionsPerformed: samples.length,
        deniedRequestCount: denied.length,
        deniedRequests: denied,
        samples,
      },
      null,
      2,
    ),
  );
  await writeFile(
    join(EVIDENCE_ROOT, 'five-minute-request-denial.log'),
    [
      `requirement=FR-FT-048`,
      `local_origin=${LOCAL_ORIGIN}`,
      `observed_ms=${observedMs}`,
      `interactions=${samples.length}`,
      `denied_request_count=${denied.length}`,
      ...denied.map(
        (d) => `DENIED at=${d.atMs}ms ${d.method} ${d.resourceType} ${d.url}`,
      ),
      '',
    ].join('\n'),
  );

  expect(observedMs).toBeGreaterThanOrEqual(OBSERVATION_MS);
  expect(denied).toEqual([]);
});

test('FR-FT-049 keeps every deferred surface unavailable rather than absent or working', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await expect(page.getByTestId('application-shell')).toBeVisible();

  /*
   * FR-FT-049's boundary is not "these do nothing" — it is that the feature
   * adds none of them. The registry is the single source of truth for that
   * (AGENTS.md: availability comes from the action registry, never from
   * whether a handler happens to be wired), so the assertion reads the registry
   * and then requires the rendered control to agree with it.
   */
  const deferredIds = [
    'open-folder',
    'new-window',
    'toggle-assistant',
    'distraction-free-reading',
    'image',
    'format',
    'compact',
    'lint',
  ] as const;

  const registryVerdicts = deferredIds.map((id) => ({
    id,
    kind: getAction(id).availability.kind,
  }));
  expect(
    registryVerdicts.filter((verdict) => verdict.kind === 'available'),
  ).toEqual([]);

  const toolbar = page.getByRole('toolbar', { name: 'Document toolbar' });
  for (const id of ['format', 'compact', 'lint'] as const) {
    await expect(toolbar.locator(`[data-action-id="${id}"]`)).toBeDisabled();
  }

  await page.getByRole('button', { name: 'View', exact: true }).click();
  const viewMenu = page.getByRole('menu', { name: 'View options' });
  await expect(
    viewMenu.getByRole('menuitem', { name: 'Toggle Assistant' }),
  ).toBeDisabled();
  await expect(
    viewMenu.getByRole('menuitem', { name: 'Distraction-free reading' }),
  ).toBeDisabled();
  await page.keyboard.press('Escape');

  /*
   * The Assistant is reproduced as an empty frame carrying no width
   * (FR-FT-049). It is a grid TRACK, not an element — `AppShell.module.css:23`
   * gives the third column `var(--shell-assistant-collapsed-width)`, which
   * `tokens.css:184` sets to 0 — so it has to be read off the resolved
   * `grid-template-columns`. Querying for an element would return nothing and
   * pass vacuously.
   */
  const shellColumns = await page
    .getByTestId('application-shell')
    .evaluate((element) =>
      getComputedStyle(element).gridTemplateColumns.split(/\s+/u),
    );
  expect(shellColumns).toHaveLength(3);
  const assistantTrack = shellColumns[2];
  expect(Number.parseFloat(assistantTrack)).toBe(0);

  await mkdir(EVIDENCE_ROOT, { recursive: true });
  await writeFile(
    join(EVIDENCE_ROOT, 'deferred-boundary.json'),
    JSON.stringify(
      {
        requirement: 'FR-FT-049',
        registryVerdicts,
        shellColumns,
        assistantTrack,
      },
      null,
      2,
    ),
  );
});
