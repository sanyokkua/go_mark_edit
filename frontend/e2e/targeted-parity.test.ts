import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

import { expect, test, type Locator, type Page } from '@playwright/test';

import { comparePng, type PngComparison } from './parity/comparator';
import {
  adaptReferenceHtml,
  REFERENCE_ZERO_ASSISTANT_CLASS,
} from './parity/reference-adapter';
import {
  assertSameOrigin,
  freezeParityPixels,
  waitForParityReady,
} from './parity/readiness';
import {
  captureSemanticSignature,
  assertSemanticPairing,
  SemanticPairingMismatchError,
  type SemanticSignature,
} from './parity/state-contract';
import {
  hashReferenceSource,
  referenceNavigationUrl,
} from './parity/reference-server';
import {
  assertTargetedManifestIntegrity,
  contextForTargetedEntry,
  TARGETED_MANIFEST,
  type TargetedParityEntry,
} from './targeted-manifest';

test.describe.configure({ mode: 'serial' });

const REFERENCE_ORIGIN =
  process.env.PARITY_REFERENCE_ORIGIN ?? 'http://127.0.0.1:4174';
const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REFERENCE_PATH = resolve(
  REPOSITORY_ROOT,
  '../docs/delivery/spec/surface/mockup.html',
);
const EVIDENCE_ROOT = resolve(
  REPOSITORY_ROOT,
  '../specs/003-real-files-and-tabs/evidence/ft-vs-08/parity/targeted/closed-menubar',
);
const PARITY_HEIGHT = 720;
const METRIC_PROPERTIES = [
  'display',
  'position',
  'box-sizing',
  'width',
  'height',
  'min-width',
  'min-height',
  'padding',
  'margin',
  'gap',
  'font-family',
  'font-size',
  'font-weight',
  'line-height',
  'letter-spacing',
  'color',
  'background-color',
  'border-bottom-width',
  'border-bottom-color',
  'border-radius',
  'box-shadow',
  'overflow',
  'overflow-x',
  'overflow-y',
  'white-space',
] as const;

type SurfaceMetrics = Readonly<{
  readonly bounds: Readonly<{
    readonly left: number;
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
    readonly width: number;
    readonly height: number;
  }>;
  readonly styles: Readonly<Record<string, string>>;
}>;

type TargetedStatus =
  'paired' | 'pairing-mismatch' | 'production-ui-drift' | 'passed';

async function prepareReferenceHarness(page: Page): Promise<void> {
  await page.locator('#app').evaluate((app) => {
    app.style.flexShrink = '0';
  });
  await page.locator('#screenNav').evaluate((screenNav) => {
    screenNav.addEventListener('click', (event) => event.stopPropagation());
  });
}

async function prepareReference(
  page: Page,
  entry: TargetedParityEntry,
  sourceHash: string,
): Promise<void> {
  const response = await page.goto(
    referenceNavigationUrl(
      REFERENCE_ORIGIN,
      entry.referenceVariant,
      entry.palette.id,
      entry.activeScreen,
      Date.now(),
    ),
  );
  await waitForParityReady(page);
  await prepareReferenceHarness(page);
  await assertSameOrigin(page, REFERENCE_ORIGIN);
  expect(response?.headers()['x-reference-source-sha256']).toBe(sourceHash);
  expect(response?.headers()['x-reference-variant']).toBe(
    entry.referenceVariant,
  );
  const source = await readFile(REFERENCE_PATH);
  expect(
    adaptReferenceHtml(source.toString('utf8'), entry.referenceVariant)
      .sourceHash,
  ).toBe(sourceHash);
  await page
    .locator(`#themeSwitch button[data-theme="${entry.palette.theme}"]`)
    .click();
  await page
    .locator(`#modeSwitch button[data-appear="${entry.palette.mode}"]`)
    .click();
  await page.locator(`#widthSwitch button[data-w="${entry.width}"]`).click();
  await page
    .locator(`#screenNav button[data-screen="${entry.activeScreen}"]`)
    .click();
  await freezeParityPixels(page);
  await page.locator('#app').evaluate((app, assistantClass) => {
    app.classList.add(assistantClass);
  }, REFERENCE_ZERO_ASSISTANT_CLASS);
  await expect(page.locator('#app')).toHaveClass(
    new RegExp(`\\b${REFERENCE_ZERO_ASSISTANT_CLASS}\\b`, 'u'),
  );
  await expect(
    page.locator(`#screenNav button[data-screen="${entry.activeScreen}"]`),
  ).toHaveClass(/\bon\b/u);
}

async function prepareActual(
  page: Page,
  entry: TargetedParityEntry,
): Promise<void> {
  await page.setViewportSize({ width: entry.width, height: PARITY_HEIGHT });
  await page.goto(`/?parity-case=${encodeURIComponent(entry.key)}`);
  await waitForParityReady(page, {
    readySelector: '[data-testid="application-shell"]',
  });
  await expect(page.getByRole('tab')).toHaveCount(2);
  const settings = page.getByRole('button', {
    name: 'Settings',
    exact: true,
  });
  await settings.click();
  const menu = page.getByRole('menu', { name: 'Settings menu' });
  await menu.getByRole('radio', { name: 'Minimal', exact: true }).click();
  const refreshedMenu = page.locator('[data-viewport-popup="settings-menu"]');
  await refreshedMenu.waitFor({ state: 'visible' });
  await refreshedMenu
    .getByRole('radio', { name: 'Light', exact: true })
    .click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'minimal');
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'light');
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-viewport-popup]')).toHaveCount(0);
  await freezeParityPixels(page);
}

async function oneVisibleLocator(
  page: Page,
  selector: string,
  label: string,
): Promise<Locator> {
  const locator = page.locator(selector);
  await expect(locator, `${label} selector must be unique`).toHaveCount(1);
  await locator.waitFor({ state: 'visible' });
  return locator;
}

async function surfaceMetrics(locator: Locator): Promise<SurfaceMetrics> {
  return locator.evaluate(
    (element, properties): SurfaceMetrics => {
      const rect = element.getBoundingClientRect();
      const computed = getComputedStyle(element);
      return {
        bounds: {
          left: Number(rect.left.toFixed(3)),
          top: Number(rect.top.toFixed(3)),
          right: Number(rect.right.toFixed(3)),
          bottom: Number(rect.bottom.toFixed(3)),
          width: Number(rect.width.toFixed(3)),
          height: Number(rect.height.toFixed(3)),
        },
        styles: Object.fromEntries(
          properties.map((property) => [
            property,
            computed.getPropertyValue(property),
          ]),
        ),
      };
    },
    [...METRIC_PROPERTIES],
  );
}

async function captureSurface(
  page: Page,
  selector: string,
  label: string,
): Promise<{ readonly bytes: Uint8Array; readonly metrics: SurfaceMetrics }> {
  const locator = await oneVisibleLocator(page, selector, label);
  return {
    bytes: await locator.screenshot({ animations: 'disabled' }),
    metrics: await surfaceMetrics(locator),
  };
}

function metricDifferences(
  reference: SurfaceMetrics,
  actual: SurfaceMetrics,
): readonly string[] {
  const differences: string[] = [];
  for (const key of [
    'left',
    'top',
    'right',
    'bottom',
    'width',
    'height',
  ] as const) {
    if (reference.bounds[key] !== actual.bounds[key]) {
      differences.push(
        `bounds.${key}: ${reference.bounds[key]} != ${actual.bounds[key]}`,
      );
    }
  }
  for (const property of METRIC_PROPERTIES) {
    if (reference.styles[property] !== actual.styles[property]) {
      differences.push(
        `styles.${property}: ${JSON.stringify(reference.styles[property])} != ${JSON.stringify(actual.styles[property])}`,
      );
    }
  }
  return differences;
}

async function assertActualMenubarStructure(page: Page): Promise<void> {
  const menubar = page.locator('nav[aria-label="Application actions"]');
  await expect(menubar).toBeVisible();
  for (const action of ['File', 'Settings', 'View', 'About']) {
    const button = menubar.getByRole('button', { name: action, exact: true });
    await expect(button).toBeVisible();
    await expect(button).toHaveAttribute('type', 'button');
    expect(
      await button.evaluate((element) => element.tabIndex),
    ).toBeGreaterThanOrEqual(0);
  }
  await expect(menubar.getByRole('heading', { level: 1 })).toHaveCount(1);
  const editor = page.getByRole('main', { name: 'Document area' });
  await expect(editor).toBeVisible();
}

async function writeTargetedArtifacts(input: {
  readonly entry: TargetedParityEntry;
  readonly reference: SemanticSignature;
  readonly actual: SemanticSignature;
  readonly status: TargetedStatus;
  readonly comparisonAttempted: boolean;
  readonly comparisonCompleted: boolean;
  readonly metricDifferences?: readonly string[];
  readonly editorTopEdge: Readonly<{ reference: number; actual: number }>;
  readonly comparison?: PngComparison;
  readonly referenceBytes?: Uint8Array;
  readonly actualBytes?: Uint8Array;
  readonly error?: string;
}): Promise<void> {
  await mkdir(EVIDENCE_ROOT, { recursive: true });
  await writeFile(
    join(EVIDENCE_ROOT, 'semantic.json'),
    JSON.stringify(
      {
        entry: input.entry,
        reference: input.reference,
        actual: input.actual,
        pairing: input.status === 'pairing-mismatch' ? 'failed' : 'passed',
        comparisonAttempted: input.comparisonAttempted,
        comparisonCompleted: input.comparisonCompleted,
      },
      null,
      2,
    ),
  );
  await writeFile(
    join(EVIDENCE_ROOT, 'metrics.json'),
    JSON.stringify(
      {
        region: input.entry.regionId,
        editorTopEdge: input.editorTopEdge,
        differences: input.metricDifferences ?? [],
        boundsAndStylesPassed: (input.metricDifferences ?? []).length === 0,
        comparison: input.comparison?.metrics ?? null,
      },
      null,
      2,
    ),
  );
  if (input.referenceBytes !== undefined) {
    await writeFile(join(EVIDENCE_ROOT, 'reference.png'), input.referenceBytes);
  }
  if (input.actualBytes !== undefined) {
    await writeFile(join(EVIDENCE_ROOT, 'actual.png'), input.actualBytes);
  }
  if (input.comparison !== undefined) {
    await writeFile(
      join(EVIDENCE_ROOT, 'diff.png'),
      input.comparison.diff.bytes,
    );
  }
  await writeFile(
    join(EVIDENCE_ROOT, 'status.json'),
    JSON.stringify(
      {
        status: input.status,
        comparisonAttempted: input.comparisonAttempted,
        comparisonCompleted: input.comparisonCompleted,
        productionUiDrift:
          input.status === 'production-ui-drift' || input.status === 'passed',
        error: input.error ?? null,
      },
      null,
      2,
    ),
  );
  await writeFile(
    join(EVIDENCE_ROOT, 'raw-status.log'),
    [
      `status=${input.status}`,
      `comparison_attempted=${input.comparisonAttempted}`,
      `comparison_completed=${input.comparisonCompleted}`,
      `error=${input.error ?? ''}`,
      '',
    ].join('\n'),
  );
}

test('T056 state-pairs one closed menubar slice before exact comparison', async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  assertTargetedManifestIntegrity();
  const entry = TARGETED_MANIFEST[0];
  if (entry === undefined) throw new Error('T056 targeted entry is missing');
  const referenceSource = await readFile(REFERENCE_PATH);
  const referenceSourceHash = hashReferenceSource(referenceSource);
  const captureContext = contextForTargetedEntry(entry, referenceSourceHash);
  const referencePage = await context.newPage();
  let referenceSignature: SemanticSignature | undefined;
  let actualSignature: SemanticSignature | undefined;
  let editorTopEdge = { reference: -1, actual: -1 };

  try {
    await prepareReference(referencePage, entry, referenceSourceHash);
    await prepareActual(page, entry);
    await assertActualMenubarStructure(page);
    referenceSignature = await captureSemanticSignature(
      referencePage,
      captureContext,
      'reference',
    );
    actualSignature = await captureSemanticSignature(
      page,
      captureContext,
      'actual',
    );
    try {
      assertSemanticPairing(referenceSignature, actualSignature);
    } catch (error) {
      const message =
        error instanceof Error ? (error.stack ?? error.message) : String(error);
      await writeTargetedArtifacts({
        entry,
        reference: referenceSignature,
        actual: actualSignature,
        status: 'pairing-mismatch',
        comparisonAttempted: false,
        comparisonCompleted: false,
        editorTopEdge,
        error: message,
      });
      if (error instanceof SemanticPairingMismatchError) throw error;
      throw new Error(message, { cause: error });
    }

    const referenceEditor = await captureSurface(
      referencePage,
      entry.editorReferenceSelector,
      'reference editor surface',
    );
    const actualEditor = await captureSurface(
      page,
      entry.editorActualSelector,
      'actual editor surface',
    );
    editorTopEdge = {
      reference: referenceEditor.metrics.bounds.top,
      actual: actualEditor.metrics.bounds.top,
    };
    const referenceSurface = await captureSurface(
      referencePage,
      entry.referenceSelector,
      'reference closed menubar',
    );
    const actualSurface = await captureSurface(
      page,
      entry.actualSelector,
      'actual closed menubar',
    );
    const comparison = comparePng(referenceSurface.bytes, actualSurface.bytes);
    const differences = metricDifferences(
      referenceSurface.metrics,
      actualSurface.metrics,
    );
    const error =
      differences.length === 0 && comparison.passed
        ? undefined
        : [
            ...differences,
            ...(comparison.passed
              ? []
              : [
                  `zero-tolerance pixel drift: ${comparison.metrics.differentPixelCount} unexplained pixels`,
                ]),
          ].join('\n');
    await writeTargetedArtifacts({
      entry,
      reference: referenceSignature,
      actual: actualSignature,
      status: error === undefined ? 'passed' : 'production-ui-drift',
      comparisonAttempted: true,
      comparisonCompleted: true,
      metricDifferences: differences,
      editorTopEdge,
      comparison,
      referenceBytes: referenceSurface.bytes,
      actualBytes: actualSurface.bytes,
      error,
    });
    if (error !== undefined) throw new Error(error);
  } finally {
    await referencePage.close();
  }
});
