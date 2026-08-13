import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

import { expect, test, type Locator, type Page } from '@playwright/test';

import {
  comparePng,
  DEFAULT_REVIEWED_MASKS,
  hashPng,
  type PixelBounds,
  type PngComparison,
} from './parity/comparator';
import {
  adaptReferenceHtml,
  REFERENCE_ADAPTER_HASH,
  REFERENCE_ZERO_ASSISTANT_CLASS,
  referenceStateCondition,
  referenceVariantRules,
  type FileOnlyReferenceState,
  type ReferenceVariant,
} from './parity/reference-adapter';
import {
  ADDITIONAL_STATE_ASSIGNMENTS,
  assertManifestIntegrity,
  assertNoCaptureSatisfiesTwoStates,
  comparisonsForRepetitions,
  COMPARISON_COUNT,
  PARITY_HEIGHT,
  PARITY_MANIFEST,
  PARITY_REPETITIONS,
  type ManifestEntry,
  type ParityFamily,
  type ParityPalette,
  type ParityStateId,
} from './parity/manifest';
import {
  assertSameOrigin,
  freezeParityPixels,
  waitForParityReady,
} from './parity/readiness';
import {
  hashReferenceSource,
  referenceNavigationUrl,
} from './parity/reference-server';
import { accountParityComparisons } from './parity/evidence';

test.describe.configure({ mode: 'serial' });

const REFERENCE_ORIGIN =
  process.env.PARITY_REFERENCE_ORIGIN ?? 'http://127.0.0.1:4174';
const ACTUAL_ORIGIN = process.env.PARITY_APP_ORIGIN ?? 'http://127.0.0.1:4173';
const REPOSITORY_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const REFERENCE_PATH = resolve(
  REPOSITORY_ROOT,
  'docs/delivery/spec/surface/mockup.html',
);
const EVIDENCE_ROOT = resolve(
  REPOSITORY_ROOT,
  'specs/003-real-files-and-tabs/evidence/ft-vs-08/parity',
);
const MAPPED_SELECTOR_TIMEOUT_MS = 1_500;
const MATRIX_NAVIGATION_TIMEOUT_MS = 5_000;
const MATRIX_ACTION_TIMEOUT_MS = 5_000;

const PALETTE_LABELS = {
  glass: 'Liquid Glass',
  material: 'Material',
  minimal: 'Minimal',
} as const;

const SCREEN_BY_FAMILY: Readonly<Record<ParityFamily, string>> = {
  'editor-split': 'editor-split',
  'editor-only': 'editor-only',
  'preview-only': 'preview-only',
  'menu-file': 'menu-file',
  'menu-settings': 'menu-settings',
  'menu-view': 'menu-view',
  'menu-about': 'menu-about',
  'tab-menu': 'tab-menu',
  'toolbar-overflow': 'toolbar-overflow',
  empty: 'empty',
  'save-prompt': 'save-prompt',
  'quit-prompt': 'quit-prompt',
  'reload-prompt': 'reload-prompt',
  toasts: 'toasts',
  'settings-appearance': 'settings-appearance',
  'settings-editor': 'settings-editor',
  'settings-markdown': 'settings-markdown',
};

const STATE_SCREEN_OVERRIDES: Readonly<Partial<Record<ParityStateId, string>>> =
  {
    'preview-paused': 'paused-preview',
    'preview-refreshing': 'busy',
    'preview-refresh-failed': 'paused-preview',
  };

/**
 * A reviewed region exclusion, authorised by the Session 2026-08-13
 * clarification. It is not a mask: it names a component this feature does not
 * own, its bounds and computed styles are still asserted exactly on both pages,
 * and the surrounding shell stays compared. It may never be used for a surface
 * Feature 003 owns.
 */
type ReviewedRegionExclusion = Readonly<{
  readonly owner: string;
  readonly reason: string;
  readonly referenceSelector: string;
  readonly actualSelector: string;
}>;

const MONACO_EDITOR_INTERIOR: ReviewedRegionExclusion = Object.freeze({
  owner: 'Feature 002',
  reason:
    'Monaco owns its own text raster, gutter metrics and internal layout; the mockup renders a hand-written .code block that no reference variant can reproduce.',
  referenceSelector: '#app.no-assistant .content .body #pane-editor .editor',
  actualSelector: 'section[aria-label="Editor view"] [data-editor-surface]',
});

type SurfaceMapping = Readonly<{
  readonly family: ParityFamily;
  readonly regionId: string;
  readonly referenceSelector: string;
  readonly actualSelector: string;
  readonly referenceVariant: ReferenceVariant;
  readonly allowMappedHorizontalOverflow?: boolean;
  readonly regionExclusion?: ReviewedRegionExclusion;
}>;

/**
 * These are the only browser regions this task is allowed to compare. The
 * selectors intentionally stop at the webview-owned content: no OS frame,
 * populated workspace, Assistant/provider surface, or deferred rich-rendering
 * surface is included. The variant boundary is checked before every capture.
 */
const SURFACES: Readonly<Record<ParityFamily, SurfaceMapping>> = {
  'editor-split': {
    family: 'editor-split',
    regionId: 'editor',
    referenceSelector: '#app.no-assistant .content',
    actualSelector: 'section[aria-label="Editor view"]',
    referenceVariant: 'base',
    regionExclusion: MONACO_EDITOR_INTERIOR,
  },
  'editor-only': {
    family: 'editor-only',
    regionId: 'editor',
    referenceSelector: '#app.no-assistant .content',
    actualSelector: 'section[aria-label="Editor view"]',
    referenceVariant: 'base',
    regionExclusion: MONACO_EDITOR_INTERIOR,
  },
  'preview-only': {
    family: 'preview-only',
    regionId: 'editor',
    referenceSelector: '#app.no-assistant .content',
    actualSelector: 'section[aria-label="Editor view"]',
    referenceVariant: 'base',
  },
  'menu-file': {
    family: 'menu-file',
    regionId: 'file-menu',
    referenceSelector: '#m-file',
    actualSelector: '[data-viewport-popup="file-menu"]',
    referenceVariant: 'file-menu',
  },
  'menu-settings': {
    family: 'menu-settings',
    regionId: 'settings-menu',
    referenceSelector: '#m-settings',
    actualSelector: '[data-viewport-popup="settings-menu"]',
    referenceVariant: 'base',
  },
  'menu-view': {
    family: 'menu-view',
    regionId: 'view-menu',
    referenceSelector: '#m-view',
    actualSelector: '[data-viewport-popup="view-menu"]',
    referenceVariant: 'base',
  },
  'menu-about': {
    family: 'menu-about',
    regionId: 'about-menu',
    referenceSelector: '#m-about',
    actualSelector: '[data-viewport-popup="about-menu"]',
    referenceVariant: 'base',
  },
  'tab-menu': {
    family: 'tab-menu',
    regionId: 'tab-menu',
    referenceSelector: '#tabctx',
    actualSelector: '[data-viewport-popup="tab-menu"]',
    referenceVariant: 'move-tab',
  },
  'toolbar-overflow': {
    family: 'toolbar-overflow',
    regionId: 'toolbar',
    referenceSelector: '#app.no-assistant .content',
    actualSelector: 'section[aria-label="Editor view"]',
    referenceVariant: 'base',
    regionExclusion: MONACO_EDITOR_INTERIOR,
  },
  empty: {
    family: 'empty',
    regionId: 'launcher',
    referenceSelector: '#app .launcher',
    actualSelector: '[data-testid="document-launcher"]',
    referenceVariant: 'file-only',
  },
  'save-prompt': {
    family: 'save-prompt',
    regionId: 'save-prompt',
    referenceSelector: '#savePrompt',
    actualSelector:
      '[role="dialog"][aria-label="Save changes before closing?"]',
    referenceVariant: 'base',
  },
  'quit-prompt': {
    family: 'quit-prompt',
    regionId: 'quit-prompt',
    referenceSelector: '#quitPrompt',
    actualSelector:
      '[role="dialog"][aria-label="Save changes before quitting?"]',
    referenceVariant: 'base',
  },
  'reload-prompt': {
    family: 'reload-prompt',
    regionId: 'reload-prompt',
    referenceSelector: '#reloadPrompt',
    actualSelector: '[role="dialog"][aria-label="File changed on disk"]',
    referenceVariant: 'conflict',
  },
  toasts: {
    family: 'toasts',
    regionId: 'toast',
    referenceSelector: '#app .toasts',
    actualSelector: '[data-notification-code]',
    referenceVariant: 'base',
  },
  'settings-appearance': {
    family: 'settings-appearance',
    regionId: 'settings',
    referenceSelector: '#setModal',
    actualSelector: '[data-viewport-popup="settings-menu"]',
    referenceVariant: 'base',
  },
  'settings-editor': {
    family: 'settings-editor',
    regionId: 'settings',
    referenceSelector: '#setModal',
    actualSelector: '[data-viewport-popup="settings-menu"]',
    referenceVariant: 'base',
  },
  'settings-markdown': {
    family: 'settings-markdown',
    regionId: 'settings',
    referenceSelector: '#setModal',
    actualSelector: '[data-viewport-popup="settings-menu"]',
    referenceVariant: 'base',
  },
};

const METRIC_PROPERTIES = [
  'display',
  'position',
  'box-sizing',
  'width',
  'height',
  'min-width',
  'min-height',
  'max-width',
  'max-height',
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
  'border-top-width',
  'border-right-width',
  'border-bottom-width',
  'border-left-width',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'border-radius',
  'box-shadow',
  'backdrop-filter',
  'overflow',
  'overflow-x',
  'overflow-y',
  'white-space',
] as const;

type SurfaceMetrics = Readonly<{
  readonly bounds: PixelBounds;
  readonly styles: Readonly<Record<string, string>>;
  readonly noOverflow: Readonly<{
    readonly documentHorizontal: boolean;
    readonly documentVertical: boolean;
    readonly regionHorizontal: boolean;
    readonly regionVertical: boolean;
    readonly regionScrollWidth: number;
    readonly regionClientWidth: number;
    readonly regionScrollHeight: number;
    readonly regionClientHeight: number;
  }>;
}>;

type CaptureRecord = Readonly<{
  readonly manifestKey: string;
  readonly repetition: number;
  readonly kind: ManifestEntry['kind'];
  readonly stateId?: ParityStateId;
  readonly palette: ParityPalette['id'];
  readonly captureKey: string;
  readonly referenceHash?: string;
  readonly actualHash?: string;
  readonly comparisonCompleted: boolean;
  readonly status: 'passed' | 'failed' | 'unresolved';
  readonly referenceReady: boolean;
  readonly actualReady: boolean;
  readonly diagnostics: readonly string[];
  readonly error?: string;
}>;

type FailureRecord = Readonly<{
  readonly entry: ManifestEntry;
  readonly repetition: number;
  readonly error: string;
  readonly referenceBytes?: Uint8Array;
  readonly actualBytes?: Uint8Array;
  readonly comparison?: PngComparison;
  readonly referenceMetrics?: SurfaceMetrics;
  readonly actualMetrics?: SurfaceMetrics;
  readonly status: 'failed' | 'unresolved';
}>;

class UnresolvedReferenceConditionError extends Error {
  readonly code = 'unresolved-reference-condition';
}

/**
 * Count differing pixels that fall inside a reviewed region exclusion, in the
 * captured region's own pixel coordinates.
 */
function countDifferencesInside(
  comparison: PngComparison,
  rect: Readonly<{
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
  }>,
): number {
  const reference = comparison.reference.decoded;
  const actual = comparison.actual.decoded;
  if (reference.width !== actual.width || reference.height !== actual.height) {
    return 0;
  }
  let inside = 0;
  const right = rect.left + rect.width - 1;
  const bottom = rect.top + rect.height - 1;
  for (
    let y = Math.max(0, rect.top);
    y <= Math.min(reference.height - 1, bottom);
    y += 1
  ) {
    for (
      let x = Math.max(0, rect.left);
      x <= Math.min(reference.width - 1, right);
      x += 1
    ) {
      const offset = (y * reference.width + x) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        if (
          reference.pixels[offset + channel] !== actual.pixels[offset + channel]
        ) {
          inside += 1;
          break;
        }
      }
    }
  }
  return inside;
}

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

const manifestSourceHash = sha256(JSON.stringify(PARITY_MANIFEST));
const mappingSourceHash = sha256(JSON.stringify(SURFACES));
let referenceNavigationToken = 0;

function stateIdForEntry(entry: ManifestEntry): ParityStateId | undefined {
  return 'stateId' in entry ? entry.stateId : undefined;
}

function fileOnlyStateForEntry(
  entry: ManifestEntry,
): FileOnlyReferenceState | undefined {
  if (entry.family !== 'empty') return undefined;
  const stateId = stateIdForEntry(entry);
  if (stateId === 'launcher-six-file') return 'six-file';
  if (stateId === 'launcher-first-run') return 'first-run';
  return 'empty';
}

function documentStatus(page: Page): Locator {
  return page.getByRole('status', { name: 'Document status' });
}

function screenForEntry(entry: ManifestEntry): string {
  return (
    ('stateId' in entry && entry.stateId !== undefined
      ? STATE_SCREEN_OVERRIDES[entry.stateId]
      : undefined) ?? SCREEN_BY_FAMILY[entry.family]
  );
}

async function ensureReferenceZeroAssistant(page: Page): Promise<void> {
  await page.locator('#app').evaluate((app, assistantClass) => {
    app.classList.add(assistantClass);
  }, REFERENCE_ZERO_ASSISTANT_CLASS);
  await expect(page.locator('#app')).toHaveClass(
    new RegExp(`\\b${REFERENCE_ZERO_ASSISTANT_CLASS}\\b`, 'u'),
  );
}

async function prepareReferenceHarness(page: Page): Promise<void> {
  // The immutable reference places its capture app below its own harness.
  // At 375px the harness wraps tall enough for the body flex container to
  // shrink the app to zero; the external harness must not change the app's
  // source-defined viewport geometry.
  await page.locator('#app').evaluate((app) => {
    app.style.flexShrink = '0';
  });

  // The source harness has a document click closer. Keep screen-nav clicks
  // on the source's own navigation path without letting that unrelated
  // document handler immediately close a selected menu.
  await page.locator('#screenNav').evaluate((screenNav) => {
    screenNav.addEventListener('click', (event) => event.stopPropagation());
  });
}

async function assertReferenceReady(
  page: Page,
  entry: ManifestEntry,
  screen: string,
): Promise<void> {
  const mapping = SURFACES[entry.family];
  await expect(page.locator('body')).toHaveAttribute(
    'data-theme',
    entry.palette.theme,
  );
  await expect(page.locator('body')).toHaveAttribute(
    'data-mode',
    entry.palette.mode,
  );
  await expect(
    page.locator(`#themeSwitch button[data-theme="${entry.palette.theme}"]`),
  ).toHaveClass(/\bon\b/u);
  await expect(
    page.locator(`#modeSwitch button[data-appear="${entry.palette.mode}"]`),
  ).toHaveClass(/\bon\b/u);
  await expect(
    page.locator(`#widthSwitch button[data-w="${entry.width}"]`),
  ).toHaveClass(/\bon\b/u);
  await expect(
    page.locator(`#screenNav button[data-screen="${screen}"]`),
  ).toHaveClass(/\bon\b/u);
  await expect(page).toHaveURL(
    new RegExp(
      `#${entry.palette.id}/${screen.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}$`,
      'u',
    ),
  );
  await expect(page.locator('#app')).toHaveClass(/\bno-assistant\b/u);
  await expect(page.locator(mapping.referenceSelector)).toBeVisible({
    timeout: MAPPED_SELECTOR_TIMEOUT_MS,
  });
}

function routeForEntry(entry: ManifestEntry): string {
  if (entry.family === 'reload-prompt') {
    return `/?ft-vs-04&parity-case=${encodeURIComponent(entry.key)}`;
  }
  if (entry.family === 'save-prompt') {
    return `/?close-plan&parity-case=${encodeURIComponent(entry.key)}`;
  }
  if (entry.family === 'empty') {
    return `/?ft-vs-07&parity-case=${encodeURIComponent(entry.key)}`;
  }
  return `/?parity-case=${encodeURIComponent(entry.key)}`;
}

function paletteLabels(palette: ParityPalette): {
  readonly theme: string;
  readonly mode: string;
} {
  return {
    theme: PALETTE_LABELS[palette.theme],
    mode: palette.mode === 'dark' ? 'Dark' : 'Light',
  };
}

async function oneVisibleLocator(
  page: Page,
  selector: string,
  label: string,
): Promise<Locator> {
  const locator = page.locator(selector);
  const count = await locator.count();
  if (count !== 1) {
    throw new Error(`${label} selector ${selector} matched ${count} elements`);
  }
  await locator.waitFor({
    state: 'visible',
    timeout: MAPPED_SELECTOR_TIMEOUT_MS,
  });
  await locator.scrollIntoViewIfNeeded();
  return locator;
}

async function metricsFor(locator: Locator): Promise<SurfaceMetrics> {
  return locator.evaluate(
    (element, properties): SurfaceMetrics => {
      const rect = element.getBoundingClientRect();
      const computed = getComputedStyle(element);
      const styles = Object.fromEntries(
        properties.map((property) => [
          property,
          computed.getPropertyValue(property),
        ]),
      );
      const documentElement = document.documentElement;
      return {
        bounds: {
          left: Number(rect.left.toFixed(3)),
          top: Number(rect.top.toFixed(3)),
          right: Number(rect.right.toFixed(3)),
          bottom: Number(rect.bottom.toFixed(3)),
        },
        styles,
        noOverflow: {
          documentHorizontal:
            documentElement.scrollWidth > documentElement.clientWidth,
          documentVertical:
            documentElement.scrollHeight > documentElement.clientHeight,
          regionHorizontal: element.scrollWidth > element.clientWidth,
          regionVertical: element.scrollHeight > element.clientHeight,
          regionScrollWidth: element.scrollWidth,
          regionClientWidth: element.clientWidth,
          regionScrollHeight: element.scrollHeight,
          regionClientHeight: element.clientHeight,
        },
      };
    },
    [...METRIC_PROPERTIES],
  );
}

function metricDifferences(
  reference: SurfaceMetrics,
  actual: SurfaceMetrics,
  allowMappedHorizontalOverflow: boolean,
): string[] {
  const differences: string[] = [];
  for (const key of ['left', 'top', 'right', 'bottom'] as const) {
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
  if (
    reference.noOverflow.documentHorizontal !==
      actual.noOverflow.documentHorizontal ||
    reference.noOverflow.documentVertical !== actual.noOverflow.documentVertical
  ) {
    differences.push(
      `document overflow: ${JSON.stringify(reference.noOverflow)} != ${JSON.stringify(actual.noOverflow)}`,
    );
  }
  if (
    !allowMappedHorizontalOverflow &&
    (actual.noOverflow.regionHorizontal ||
      reference.noOverflow.regionHorizontal)
  ) {
    differences.push('mapped region has horizontal overflow');
  }
  if (
    reference.noOverflow.regionVertical !== actual.noOverflow.regionVertical
  ) {
    differences.push('mapped region vertical overflow differs');
  }
  return differences;
}

async function openActualSettingsMenu(
  page: Page,
  width: number,
): Promise<Locator> {
  if (width === 375) {
    await page.locator('[data-settings-overflow]').click();
    await page
      .locator('[data-viewport-popup="shell-overflow"]')
      .locator('[role="menuitem"]')
      .filter({ hasText: /^Settings$/u })
      .click();
  } else {
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
  }
  const menu = page.locator('[data-viewport-popup="settings-menu"]');
  await menu.waitFor({ state: 'visible' });
  return menu;
}

async function openActualFileMenu(page: Page, width: number): Promise<Locator> {
  if (width === 375) {
    await page.locator('[data-settings-overflow]').click();
    await page
      .locator('[data-viewport-popup="shell-overflow"]')
      .getByRole('menuitem', { name: 'File', exact: true })
      .click();
  } else {
    await page.getByRole('button', { name: 'File', exact: true }).click();
  }
  const menu = page.locator('[data-viewport-popup="file-menu"]');
  await menu.waitFor({ state: 'visible' });
  return menu;
}

async function applyActualPalette(
  page: Page,
  palette: ParityPalette,
  width: number,
): Promise<void> {
  const menu = await openActualSettingsMenu(page, width);
  const labels = paletteLabels(palette);
  await menu.getByRole('radio', { name: labels.theme, exact: true }).click();
  const refreshedMenu = page.locator('[data-viewport-popup="settings-menu"]');
  await refreshedMenu.waitFor({ state: 'visible' });
  await refreshedMenu
    .getByRole('radio', { name: labels.mode, exact: true })
    .click();
  await expect(page.locator('html')).toHaveAttribute(
    'data-theme',
    palette.theme,
  );
  await expect(page.locator('html')).toHaveAttribute('data-mode', palette.mode);
  await page.keyboard.press('Escape');
}

async function openActualViewMenu(page: Page, width: number): Promise<Locator> {
  if (width === 375) {
    await page.locator('[data-settings-overflow]').click();
    await page
      .locator('[data-viewport-popup="shell-overflow"]')
      .getByRole('menuitem', { name: 'View', exact: true })
      .click();
  } else {
    await page.locator('[data-view-trigger]').click();
  }
  const menu = page.locator('[data-viewport-popup="view-menu"]');
  await menu.waitFor({ state: 'visible' });
  return menu;
}

async function openActualAboutMenu(
  page: Page,
  width: number,
): Promise<Locator> {
  if (width === 375) {
    await page.locator('[data-settings-overflow]').click();
    await page
      .locator('[data-viewport-popup="shell-overflow"]')
      .getByRole('menuitem', { name: 'About', exact: true })
      .click();
  } else {
    await page.getByRole('button', { name: 'About', exact: true }).click();
  }
  const menu = page.locator('[data-viewport-popup="about-menu"]');
  await menu.waitFor({ state: 'visible' });
  return menu;
}

async function closeAllActualTabs(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const tabs = page.getByRole('tab');
    if ((await tabs.count()) === 0) return;
    const tab = tabs.first();
    const close = tab.locator('..').getByRole('button', { name: /^Close /u });
    await close.click();
    const prompt = page.getByRole('dialog', {
      name: 'Save changes before closing?',
    });
    if (await prompt.count()) {
      await prompt.getByRole('button', { name: 'Discard' }).click();
    }
  }
  throw new Error(
    'actual tab close loop did not reach the zero-document state',
  );
}

async function assertLauncherFixture(
  page: Page,
  expectedRecentCount: number,
): Promise<void> {
  const launcher = page.getByTestId('document-launcher');
  await expect(launcher).toBeVisible();
  await expect(
    launcher.getByRole('button', { name: 'Open Folder' }),
  ).toBeDisabled();
  await expect(launcher.getByRole('listitem')).toHaveCount(expectedRecentCount);
  await expect(
    page.locator('[data-notification-code="not_found"]'),
  ).toHaveCount(0);
}

async function prepareActualState(
  page: Page,
  entry: ManifestEntry,
): Promise<void> {
  if (!('stateId' in entry) || entry.stateId === undefined) return;
  const state = entry.stateId;
  switch (state) {
    case 'tab-active':
      await expect(
        page
          .getByRole('tab')
          .filter({ has: page.locator('[aria-selected="true"]') }),
      ).toHaveCount(0);
      await expect(page.getByRole('tab').first()).toHaveAttribute(
        'aria-selected',
        'true',
      );
      return;
    case 'tab-inactive': {
      await page.getByRole('button', { name: 'New tab' }).click();
      await page.getByRole('tab').first().click();
      await expect(page.getByRole('tab').nth(1)).toHaveAttribute(
        'aria-selected',
        'false',
      );
      return;
    }
    case 'tab-dirty': {
      const editor = page.getByRole('textbox', { name: 'Editor content' });
      await editor.press('ControlOrMeta+A');
      await page.keyboard.type('parity dirty state');
      await expect(
        page.locator('[data-document-state="active"]'),
      ).toBeVisible();
      return;
    }
    case 'tab-autosave-in-flight': {
      const editor = page.getByRole('textbox', { name: 'Editor content' });
      await editor.press('ControlOrMeta+A');
      await page.keyboard.type('parity autosave state');
      await page
        .locator('[data-status-item="standard"][data-write-in-flight="true"]')
        .waitFor({ state: 'visible', timeout: 2_000 });
      return;
    }
    case 'tab-blocked-conflict':
      await page.getByRole('button', { name: 'New tab' }).click();
      await page.getByRole('tab').nth(1).click();
      await expect(page.locator('[data-conflict-blocked]')).toHaveCount(1);
      return;
    case 'status-saved':
      await expect(documentStatus(page)).toContainText('Saved');
      return;
    case 'status-autosaved':
      await expect(documentStatus(page)).toContainText('Autosaved');
      return;
    case 'status-unsaved-changes':
      await page.getByRole('textbox', { name: 'Editor content' }).press('End');
      await page.keyboard.type(' modified');
      await expect(documentStatus(page)).toContainText('Unsaved changes');
      return;
    case 'status-read-only':
      await expect(documentStatus(page)).toContainText('Read-only');
      return;
    case 'tab-read-only':
      await expect(page.getByRole('tab').first()).toHaveAttribute(
        'aria-label',
        /release-notes\.md/u,
      );
      await expect(documentStatus(page)).toContainText('Read-only');
      return;
    case 'tab-detached':
      await expect(page.getByRole('tab').first()).toHaveAttribute(
        'aria-label',
        /release-notes\.md/u,
      );
      return;
    case 'tab-identical-basename':
      await expect(page.getByRole('tab').first()).toHaveAttribute(
        'aria-label',
        /notes\.md.*alpha/u,
      );
      await expect(page.getByRole('tab').nth(1)).toHaveAttribute(
        'aria-label',
        /notes\.md.*beta/u,
      );
      return;
    case 'tab-adjacent-after-close': {
      const firstTab = page.getByRole('tab').first();
      await firstTab
        .locator('..')
        .getByRole('button', { name: /^Close /u })
        .click();
      const closePrompt = page.getByRole('dialog', {
        name: 'Save changes before closing?',
      });
      if (await closePrompt.isVisible()) {
        await closePrompt.getByRole('button', { name: 'Discard' }).click();
      }
      await expect(page.getByRole('tab')).toHaveCount(1);
      await expect(page.getByRole('tab').first()).toHaveAttribute(
        'aria-selected',
        'true',
      );
      return;
    }
    case 'tab-contained-overflow':
      await expect(page.getByRole('tablist')).toHaveCSS('overflow-x', 'auto');
      await expect(page.getByRole('tab')).toHaveCount(2);
      return;
    case 'tab-40-document':
      await expect(page.getByRole('tab')).toHaveCount(40);
      return;
    case 'label-short':
      await expect(page.getByRole('tab').first()).toHaveAttribute(
        'aria-label',
        /a\.md/u,
      );
      return;
    case 'label-long-localized':
      await expect(page.getByRole('tab').first()).toHaveAttribute(
        'aria-label',
        /release-notes-for-the-localized/u,
      );
      return;
    case 'path-hostile-disambiguated':
      await expect(page.getByRole('tab').first()).toHaveAttribute(
        'aria-label',
        /notes\\u202E\.md.*alpha/u,
      );
      return;
    case 'identity-not-saved':
      await expect(page.getByRole('heading', { level: 1 }).first()).toHaveText(
        'Untitled',
      );
      return;
    case 'status-mixed-ending':
      await expect(documentStatus(page)).toContainText('Mixed');
      return;
    case 'status-large-file':
      await expect(documentStatus(page)).toContainText('420,000');
      return;
    case 'launcher-six-file':
      await assertLauncherFixture(page, 6);
      return;
    case 'preview-paused':
      await expect(page.locator('[data-preview-state="paused"]')).toBeVisible();
      return;
    case 'preview-refreshing': {
      const refresh = page.getByRole('button', { name: 'Refresh preview' });
      await refresh.click();
      await expect(refresh).toHaveAttribute('aria-busy', 'true');
      return;
    }
    case 'preview-refresh-failed':
      await page.getByRole('button', { name: 'Refresh preview' }).click();
      await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
      return;
    case 'prompt-normalization':
      await page
        .getByRole('dialog', { name: 'Save changes before closing?' })
        .getByRole('button', { name: 'Save' })
        .click();
      await expect(page.locator('[data-normalization-prompt]')).toBeVisible();
      return;
    case 'conflict-content-truncated':
      await expect(
        page.locator('[data-conflict-truncated="onDisk"]'),
      ).toHaveCount(1);
      return;
    case 'conflict-metadata-only':
      await expect(page.getByText('file mode changed')).toBeVisible();
      return;
    case 'conflict-read-only':
      await expect(
        page.getByRole('dialog', { name: 'File changed on disk' }),
      ).toBeVisible();
      await expect(
        page
          .getByRole('dialog', { name: 'File changed on disk' })
          .getByRole('button', { name: 'Keep mine' }),
      ).toHaveCount(0);
      return;
    case 'resync-recovery':
      await expect(
        page.getByRole('dialog', { name: 'Save changes before closing?' }),
      ).toBeVisible();
      return;
    case 'quit-discard-newer':
      await expect(
        page.getByRole('dialog', { name: 'Save changes before quitting?' }),
      ).toBeVisible();
      return;
    case 'launcher-first-run':
      await closeAllActualTabs(page);
      await assertLauncherFixture(page, 0);
      return;
    case 'control-enabled':
      await expect(
        page
          .locator(
            '[data-viewport-popup="file-menu"] [role="menuitem"]:not([data-disabled])',
          )
          .first(),
      ).toBeEnabled();
      return;
    case 'control-checked':
      await expect(
        page.locator('[data-viewport-popup="settings-menu"] input:checked'),
      ).not.toHaveCount(0);
      return;
    case 'control-selected':
      await expect(
        page.locator('[data-viewport-popup="view-menu"] [aria-checked="true"]'),
      ).not.toHaveCount(0);
      return;
    case 'control-focused':
      await page
        .locator('[data-viewport-popup="file-menu"] [role="menuitem"]')
        .first()
        .focus();
      await expect(
        page
          .locator('[data-viewport-popup="file-menu"] [role="menuitem"]')
          .first(),
      ).toBeFocused();
      return;
    case 'control-hovered':
      await page
        .locator('[data-viewport-popup="file-menu"] [role="menuitem"]')
        .first()
        .hover();
      return;
    case 'control-unavailable':
      await expect(
        page
          .locator(
            '[data-viewport-popup="file-menu"] [data-disabled="true"], [data-viewport-popup="file-menu"] [aria-disabled="true"]',
          )
          .first(),
      ).toHaveCount(1);
      return;
    case 'tab-menu-move-left-unavailable':
    case 'tab-menu-move-right-unavailable':
      await expect(
        page
          .locator(
            '[data-viewport-popup="tab-menu"] [data-disabled="true"], [data-viewport-popup="tab-menu"] [aria-disabled="true"]',
          )
          .first(),
      ).toHaveCount(1);
      return;
    default: {
      const exhaustive: never = state;
      throw new Error(`unhandled parity state ${exhaustive}`);
    }
  }
}

async function prepareActualFamily(
  page: Page,
  entry: ManifestEntry,
): Promise<void> {
  switch (entry.family) {
    case 'editor-split':
      return;
    case 'editor-only':
    case 'preview-only': {
      const menu = await openActualViewMenu(page, entry.width);
      await menu
        .getByRole('menuitemradio', {
          name: entry.family === 'editor-only' ? 'Editor' : 'Preview',
          exact: true,
        })
        .click();
      return;
    }
    case 'menu-file':
      await openActualFileMenu(page, entry.width);
      return;
    case 'menu-settings':
      await openActualSettingsMenu(page, entry.width);
      return;
    case 'menu-view':
      await openActualViewMenu(page, entry.width);
      return;
    case 'menu-about':
      await openActualAboutMenu(page, entry.width);
      return;
    case 'tab-menu':
      await page
        .getByRole('tab')
        .first()
        .click({ button: 'right', force: true });
      return;
    case 'toolbar-overflow':
      await page.locator('summary[aria-label="More actions"]').click();
      return;
    case 'empty':
      await closeAllActualTabs(page);
      await assertLauncherFixture(
        page,
        stateIdForEntry(entry) === 'launcher-six-file' ? 6 : 0,
      );
      return;
    case 'save-prompt': {
      const editor = page.getByRole('textbox', { name: 'Editor content' });
      await editor.press('ControlOrMeta+A');
      await page.keyboard.type('parity close prompt');
      const tab = page.getByRole('tab').first();
      await tab
        .locator('..')
        .getByRole('button', { name: /^Close /u })
        .click();
      return;
    }
    case 'quit-prompt': {
      const fileMenu = await openActualFileMenu(page, entry.width);
      const exit = fileMenu.getByRole('menuitem', {
        name: 'Exit',
        exact: true,
      });
      if ((await exit.count()) !== 1 || (await exit.isDisabled())) {
        throw new Error(
          'actual Exit control is unavailable for browser parity',
        );
      }
      await exit.click();
      return;
    }
    case 'reload-prompt':
      await page.getByRole('button', { name: 'New tab' }).click();
      await page.getByRole('tab').nth(1).click();
      return;
    case 'toasts': {
      const editor = page.getByRole('textbox', { name: 'Editor content' });
      await editor.press('ControlOrMeta+A');
      await page.keyboard.type('parity toast');
      const fileMenu = await openActualFileMenu(page, entry.width);
      await fileMenu
        .getByRole('menuitem')
        .filter({ hasText: /^Save$/u })
        .click();
      await page
        .locator('[data-notification-code]')
        .first()
        .waitFor({ state: 'visible' });
      return;
    }
    case 'settings-appearance':
    case 'settings-editor':
    case 'settings-markdown':
      await (
        await openActualSettingsMenu(page, entry.width)
      )
        .getByRole('menuitem', { name: 'Appearance', exact: true })
        .click();
      await page
        .locator('[data-viewport-popup="settings-menu"]')
        .filter({ has: page.getByRole('dialog', { name: 'Settings' }) })
        .waitFor({ state: 'visible' });
      return;
    default: {
      const exhaustive: never = entry.family;
      throw new Error(`unhandled parity family ${exhaustive}`);
    }
  }
}

async function setupActual(page: Page, entry: ManifestEntry): Promise<void> {
  await page.setViewportSize({ width: entry.width, height: PARITY_HEIGHT });
  await page.goto(routeForEntry(entry));
  await waitForParityReady(page, {
    readySelector: '[data-testid="application-shell"]',
  });
  if (entry.family !== 'empty') {
    const stateId = stateIdForEntry(entry);
    const expectedTabCount = stateId === 'tab-40-document' ? 40 : 2;
    await expect(page.getByRole('tab')).toHaveCount(expectedTabCount);
    if (stateId === undefined) {
      await expect(page.getByRole('tab').first()).toHaveAttribute(
        'aria-label',
        /release-notes\.md/u,
      );
      await expect(page.getByRole('tab').nth(1)).toHaveAttribute(
        'aria-label',
        /spec-draft\.md/u,
      );
      await expect(page.locator('[data-editor-surface]')).toContainText(
        'Release Notes',
      );
    } else if (
      stateId === 'status-large-file' ||
      stateId.startsWith('preview-')
    ) {
      await expect(page.locator('[data-editor-surface]')).toContainText(
        'Large parity document',
      );
    }
  }
  await applyActualPalette(page, entry.palette, entry.width);
  await prepareActualFamily(page, entry);
  await prepareActualState(page, entry);
}

async function setupReference(
  page: Page,
  entry: ManifestEntry,
  referenceSourceHash: string,
): Promise<void> {
  const screen = screenForEntry(entry);
  const mapping = SURFACES[entry.family];
  const fileOnlyState = fileOnlyStateForEntry(entry);
  await page.setViewportSize({ width: entry.width, height: PARITY_HEIGHT });
  const response = await page.goto(
    referenceNavigationUrl(
      REFERENCE_ORIGIN,
      mapping.referenceVariant,
      entry.palette.id,
      screen,
      referenceNavigationToken++,
      fileOnlyState,
    ),
  );
  await waitForParityReady(page);
  await prepareReferenceHarness(page);
  /*
   * Freeze before driving any harness switch — see the same note in
   * targeted-parity.test.ts. The binding animates `.sidebar` and `.assistant`
   * width over `--dur-slow`, so freezing only after the width and screen
   * clicks leaves a transition running into the first capture.
   */
  await freezeParityPixels(page);
  await assertSameOrigin(page, REFERENCE_ORIGIN);
  const servedHash = response?.headers()['x-reference-source-sha256'];
  const servedVariant = response?.headers()['x-reference-variant'];
  if (servedHash !== referenceSourceHash) {
    throw new Error(
      `reference source hash mismatch: served ${servedHash ?? '<missing>'}, expected ${referenceSourceHash}`,
    );
  }
  if (
    servedVariant !== mapping.referenceVariant ||
    (await page.locator('body').getAttribute('data-reference-variant')) !==
      mapping.referenceVariant
  ) {
    throw new Error(
      `reference variant mismatch: served ${servedVariant ?? '<cached>'}, expected ${mapping.referenceVariant}`,
    );
  }
  if (
    response?.headers()['x-reference-file-only-state'] !==
    (fileOnlyState ?? undefined)
  ) {
    throw new Error(
      'reference file-only state mismatch for ' +
        entry.key +
        ': expected ' +
        (fileOnlyState ?? '<none>'),
    );
  }
  const source = await readFile(REFERENCE_PATH);
  const adapted = adaptReferenceHtml(
    source.toString('utf8'),
    SURFACES[entry.family].referenceVariant,
    fileOnlyState,
  );
  if (adapted.sourceHash !== referenceSourceHash) {
    throw new Error('reference adapter did not hash the served source');
  }
  const rules = referenceVariantRules(SURFACES[entry.family].referenceVariant);
  if (
    rules.excludedRegions.some((excluded) =>
      mapping.regionId.toLowerCase().includes(excluded),
    )
  ) {
    throw new Error(
      `reviewed mapping illegally includes excluded region ${mapping.regionId}`,
    );
  }
  if (
    rules.allowedRegions.length > 0 &&
    !rules.allowedRegions.includes(mapping.regionId)
  ) {
    throw new Error(
      `reviewed variant ${mapping.referenceVariant} does not allow ${mapping.regionId}`,
    );
  }
  const labels = paletteLabels(entry.palette);
  await page
    .locator(`#themeSwitch button[data-theme="${entry.palette.theme}"]`)
    .click();
  await page
    .locator(`#modeSwitch button[data-appear="${entry.palette.mode}"]`)
    .click();
  await page.locator(`#widthSwitch button[data-w="${entry.width}"]`).click();
  // The mockup's document-level click handler closes dropdowns. Select the
  // viewport before opening the mapped screen so the reference menu state is
  // not dismissed by the width control's bubbling click.
  await page.locator(`#screenNav button[data-screen="${screen}"]`).click();
  void labels;
  await freezeParityPixels(page);
  // Apply the reviewed zero-Assistant boundary after freezing transitions;
  // otherwise the mockup's width transition can leave the old 352px
  // geometry in the first capture even though the class is present.
  await ensureReferenceZeroAssistant(page);
  await assertReferenceReady(page, entry, screen);
  if (entry.family === 'empty') {
    const launcher = page.locator('#app .launcher');
    await expect(
      launcher.locator('.acts button').filter({ hasText: 'Open folder…' }),
    ).toBeDisabled();
    const expectedRecentCount = fileOnlyState === 'six-file' ? 6 : 1;
    await expect(launcher.locator('.rec .r')).toHaveCount(expectedRecentCount);
    await expect(launcher.locator('.rec use[href="#i-folder"]')).toHaveCount(0);
    if (fileOnlyState === 'six-file') {
      await expect(launcher.locator('.rec .r')).toContainText([
        'parity-recent-06.md',
        'parity-recent-05.md',
        'parity-recent-04.md',
        'parity-recent-03.md',
        'parity-recent-02.md',
        'parity-recent-01.md',
      ]);
    } else {
      await expect(
        launcher.locator('[data-no-recent-files="true"]'),
      ).toHaveCount(1);
    }
  }
}

async function captureSurface(
  page: Page,
  selector: string,
  label: string,
): Promise<{ readonly bytes: Uint8Array; readonly metrics: SurfaceMetrics }> {
  const locator = await oneVisibleLocator(page, selector, label);
  const metrics = await metricsFor(locator);
  const bytes = await locator.screenshot({ animations: 'disabled' });
  return { bytes, metrics };
}

function safeArtifactPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/gu, '_').slice(0, 180);
}

async function writeFailureArtifacts(
  failure: FailureRecord,
  hashes: Readonly<Record<string, string>>,
): Promise<void> {
  const directory = join(
    EVIDENCE_ROOT,
    safeArtifactPart(failure.entry.key),
    `repetition-${failure.repetition}`,
  );
  await mkdir(directory, { recursive: true });
  if (failure.referenceBytes !== undefined) {
    await writeFile(join(directory, 'reference.png'), failure.referenceBytes);
  }
  if (failure.actualBytes !== undefined) {
    await writeFile(join(directory, 'actual.png'), failure.actualBytes);
  }
  if (failure.comparison !== undefined) {
    await writeFile(join(directory, 'diff.png'), failure.comparison.diff.bytes);
  }
  await writeFile(
    join(directory, 'metrics.json'),
    JSON.stringify(
      {
        manifest: failure.entry,
        repetition: failure.repetition,
        error: failure.error,
        reference: failure.referenceMetrics ?? null,
        actual: failure.actualMetrics ?? null,
        comparison: failure.comparison?.metrics ?? null,
        masks: failure.comparison?.masks ?? DEFAULT_REVIEWED_MASKS,
      },
      null,
      2,
    ),
  );
  await writeFile(
    join(directory, 'source-hashes.json'),
    JSON.stringify(hashes, null, 2),
  );
  await writeFile(
    join(directory, 'status.json'),
    JSON.stringify(
      { status: failure.status, exitStatus: 1, error: failure.error },
      null,
      2,
    ),
  );
  await writeFile(
    join(directory, 'raw-status.log'),
    `status=${failure.status}\nexit_status=1\nmanifest_key=${failure.entry.key}\nrepetition=${failure.repetition}\nerror=${failure.error}\n`,
  );
  await writeFile(
    join(directory, 'artifact-status.json'),
    JSON.stringify(
      {
        reference:
          failure.referenceBytes === undefined ? 'not-captured' : 'retained',
        actual: failure.actualBytes === undefined ? 'not-captured' : 'retained',
        diff: failure.comparison === undefined ? 'not-captured' : 'retained',
        reason:
          failure.status === 'unresolved'
            ? 'No source-backed reference condition exists; the state is recorded as unresolved without counting it as parity.'
            : 'A setup or selector failure cannot truthfully produce a mapped image triplet; the missing artifacts are recorded explicitly.',
      },
      null,
      2,
    ),
  );
}

async function writeRunReports(
  captures: readonly CaptureRecord[],
  hashes: Readonly<Record<string, string>>,
): Promise<void> {
  await mkdir(EVIDENCE_ROOT, { recursive: true });
  const comparisonAccounting = accountParityComparisons(
    comparisonsForRepetitions(),
    captures,
  );
  const stateCoverage = Object.fromEntries(
    ADDITIONAL_STATE_ASSIGNMENTS.map(({ stateId }) => [
      stateId,
      captures
        .filter((capture) => capture.stateId === stateId)
        .map((capture) => ({
          palette: capture.palette,
          repetition: capture.repetition,
          status: capture.status,
          comparisonCompleted: capture.comparisonCompleted,
        })),
    ]),
  );
  await writeFile(
    join(EVIDENCE_ROOT, 'manifest-report.json'),
    JSON.stringify(
      {
        counts: {
          planned: comparisonAccounting.filter(({ planned }) => planned).length,
          logical: PARITY_MANIFEST.length,
          repetitions: PARITY_REPETITIONS,
          attempted: comparisonAccounting.filter(({ attempted }) => attempted)
            .length,
          referenceReady: comparisonAccounting.filter(
            ({ referenceReady }) => referenceReady,
          ).length,
          actualReady: comparisonAccounting.filter(
            ({ actualReady }) => actualReady,
          ).length,
          comparisonCompleted: comparisonAccounting.filter(
            ({ comparisonCompleted }) => comparisonCompleted,
          ).length,
          passed: comparisonAccounting.filter(({ passed }) => passed).length,
          failed: comparisonAccounting.filter(({ failed }) => failed).length,
          unresolved: comparisonAccounting.filter(
            ({ unresolved }) => unresolved,
          ).length,
        },
        comparisonAccounting,
        captures,
      },
      null,
      2,
    ),
  );
  await writeFile(
    join(EVIDENCE_ROOT, 'state-coverage.json'),
    JSON.stringify(stateCoverage, null, 2),
  );
  await writeFile(
    join(EVIDENCE_ROOT, 'hash-report.json'),
    JSON.stringify(
      {
        source: hashes,
        cases: Object.fromEntries(
          PARITY_MANIFEST.map((entry) => [
            entry.key,
            captures
              .filter(({ manifestKey }) => manifestKey === entry.key)
              .map(({ repetition, referenceHash, actualHash, status }) => ({
                repetition,
                referenceHash: referenceHash ?? null,
                actualHash: actualHash ?? null,
                status,
              })),
          ]),
        ),
      },
      null,
      2,
    ),
  );
}

function deterministicHashFailures(
  captures: readonly CaptureRecord[],
): string[] {
  const failures: string[] = [];
  for (const entry of PARITY_MANIFEST) {
    const cases = captures.filter(
      ({ manifestKey }) => manifestKey === entry.key,
    );
    if (cases.length !== PARITY_REPETITIONS) {
      failures.push(`${entry.key} executed ${cases.length} times`);
      continue;
    }
    const referenceHashes = new Set(
      cases.map(({ referenceHash }) => referenceHash).filter(Boolean),
    );
    const actualHashes = new Set(
      cases.map(({ actualHash }) => actualHash).filter(Boolean),
    );
    if (referenceHashes.size !== 1) {
      failures.push(`${entry.key} reference hashes are not deterministic`);
    }
    if (actualHashes.size !== 1) {
      failures.push(`${entry.key} actual hashes are not deterministic`);
    }
  }
  return failures;
}

const T050_REFERENCE_PROBES = [
  ['editor-split', 1280, 'glass-light'],
  ['editor-split', 768, 'material-dark'],
  ['editor-split', 375, 'minimal-light'],
  ['menu-file', 1280, 'glass-light'],
  ['menu-settings', 768, 'material-dark'],
  ['menu-view', 375, 'minimal-light'],
  ['menu-about', 1280, 'glass-dark'],
  ['save-prompt', 375, 'material-light'],
  ['quit-prompt', 375, 'material-dark'],
  ['reload-prompt', 375, 'minimal-dark'],
  ['settings-appearance', 375, 'glass-light'],
  ['settings-editor', 768, 'material-light'],
  ['settings-markdown', 1280, 'minimal-dark'],
  ['toolbar-overflow', 375, 'glass-dark'],
] as const;

test('T050 reference navigation reaches every mapped probe before capture', async ({
  page,
}) => {
  const referenceSourceHash = hashReferenceSource(
    await readFile(REFERENCE_PATH),
  );

  for (const [family, width, palette] of T050_REFERENCE_PROBES) {
    const entry = PARITY_MANIFEST.find(
      (candidate) =>
        candidate.kind === 'primary' &&
        candidate.family === family &&
        candidate.width === width &&
        candidate.palette.id === palette,
    );
    if (entry === undefined) {
      throw new Error(`T050 probe is not a primary manifest case: ${family}`);
    }

    await setupReference(page, entry, referenceSourceHash);

    const screen = screenForEntry(entry);
    await expect(
      page.locator(`#screenNav button[data-screen="${screen}"]`),
    ).toHaveClass(/\bon\b/u);
    await expect(page.locator('#app')).toHaveClass(/\bno-assistant\b/u);
    await expect(
      page.locator(SURFACES[entry.family].referenceSelector),
    ).toBeVisible();
  }
});

test('T057 pairs file-only launcher variants before any screenshot comparison', async ({
  page,
  context,
}) => {
  const sourceHash = hashReferenceSource(await readFile(REFERENCE_PATH));
  const referencePage = await context.newPage();
  const entries = PARITY_MANIFEST.filter(
    (entry): boolean =>
      entry.family === 'empty' &&
      entry.palette.id === 'minimal-light' &&
      (entry.width === 1280 || entry.width === 375),
  );
  expect(entries).toHaveLength(4);

  try {
    for (const entry of entries) {
      const state = fileOnlyStateForEntry(entry);
      await setupReference(referencePage, entry, sourceHash);
      await setupActual(page, entry);

      const expectedLabels =
        state === 'six-file'
          ? [
              'parity-recent-06.md',
              'parity-recent-05.md',
              'parity-recent-04.md',
              'parity-recent-03.md',
              'parity-recent-02.md',
              'parity-recent-01.md',
            ]
          : [];
      const referenceLauncher = referencePage.locator('#app .launcher');
      const actualLauncher = page.getByTestId('document-launcher');
      await expect(
        referenceLauncher.locator('.acts button').filter({
          hasText: 'Open folder…',
        }),
      ).toBeDisabled();
      await expect(
        actualLauncher.getByRole('button', { name: 'Open Folder' }),
      ).toBeDisabled();
      await expect(
        referenceLauncher.locator('[data-no-recent-files="true"]'),
      ).toHaveCount(expectedLabels.length === 0 ? 1 : 0);
      await expect(actualLauncher.getByRole('listitem')).toHaveCount(
        expectedLabels.length,
      );
      await expect(actualLauncher.getByRole('listitem')).toContainText(
        expectedLabels,
      );
      await expect(
        page.locator('[data-notification-code="not_found"]'),
      ).toHaveCount(0);
    }
  } finally {
    await referencePage.close();
  }
});

test('T035 proves all 546 binding comparisons across three unchanged repetitions', async ({
  page,
  context,
}) => {
  // The unrestricted 546-case matrix captures 1,638 browser screenshots and
  // retains every failure triplet; the one-hour budget expires before the
  // final cases on the current local runner.
  test.setTimeout(2 * 60 * 60 * 1000);
  assertManifestIntegrity();
  const referenceSource = await readFile(REFERENCE_PATH);
  const referenceSourceHash = hashReferenceSource(referenceSource);
  const actualOrigin = new URL(ACTUAL_ORIGIN).origin;
  const hashes = {
    referenceSourceHash,
    adapterHash: REFERENCE_ADAPTER_HASH,
    manifestSourceHash,
    mappingSourceHash,
    actualOrigin,
    referenceOrigin: REFERENCE_ORIGIN,
  };
  const referencePage = await context.newPage();
  page.setDefaultNavigationTimeout(MATRIX_NAVIGATION_TIMEOUT_MS);
  page.setDefaultTimeout(MATRIX_ACTION_TIMEOUT_MS);
  referencePage.setDefaultNavigationTimeout(MATRIX_NAVIGATION_TIMEOUT_MS);
  referencePage.setDefaultTimeout(MATRIX_ACTION_TIMEOUT_MS);
  const captures: CaptureRecord[] = [];
  const failures: FailureRecord[] = [];
  const comparisons = comparisonsForRepetitions();
  // Keep each logical case's three deterministic captures together so the
  // pages are prepared once and then observed three times without changing
  // the required comparison count.
  const expectedComparisons = PARITY_MANIFEST.flatMap((entry) =>
    comparisons.filter(({ manifestKey }) => manifestKey === entry.key),
  );
  let preparedManifestKey: string | undefined;
  let preparedReferenceReady = false;
  let preparedActualReady = false;

  try {
    for (const expected of expectedComparisons) {
      const entry = expected.entry;
      const mapping = SURFACES[entry.family];
      if (entry.key !== expected.manifestKey) {
        throw new Error(`comparison manifest key drifted for ${entry.key}`);
      }
      let referenceHash: string | undefined;
      let actualHash: string | undefined;
      let caseError: string | undefined;
      let referenceBytes: Uint8Array | undefined;
      let actualBytes: Uint8Array | undefined;
      let comparison: PngComparison | undefined;
      let referenceMetrics: SurfaceMetrics | undefined;
      let actualMetrics: SurfaceMetrics | undefined;
      let diagnostics: readonly string[] = [];
      try {
        if (preparedManifestKey !== entry.key) {
          preparedReferenceReady = false;
          preparedActualReady = false;
          await setupReference(referencePage, entry, referenceSourceHash);
          preparedReferenceReady =
            stateIdForEntry(entry) === undefined ||
            referenceStateCondition(stateIdForEntry(entry) as string).status ===
              'supported';
          await setupActual(page, entry);
          preparedActualReady = true;
          preparedManifestKey = entry.key;
        }
        const stateId = stateIdForEntry(entry);
        if (stateId !== undefined) {
          const condition = referenceStateCondition(stateId);
          if (condition.status === 'unresolved') {
            throw new UnresolvedReferenceConditionError(
              `Unresolved reference condition for ${stateId}: ${condition.reason ?? 'no source-backed reference condition'}`,
            );
          }
        }
        await assertSameOrigin(page, actualOrigin);
        await freezeParityPixels(page);
        await ensureReferenceZeroAssistant(referencePage);
        const reference = await captureSurface(
          referencePage,
          mapping.referenceSelector,
          `reference ${mapping.regionId}`,
        );
        const actual = await captureSurface(
          page,
          mapping.actualSelector,
          `actual ${mapping.regionId}`,
        );
        referenceBytes = reference.bytes;
        actualBytes = actual.bytes;
        referenceMetrics = reference.metrics;
        actualMetrics = actual.metrics;
        referenceHash = hashPng(referenceBytes);
        actualHash = hashPng(actualBytes);
        comparison = comparePng(referenceBytes, actualBytes, {
          masks: DEFAULT_REVIEWED_MASKS,
        });
        const metricDifferencesForCapture = metricDifferences(
          referenceMetrics,
          actualMetrics,
          mapping.allowMappedHorizontalOverflow === true,
        );
        /*
         * A reviewed region exclusion still asserts the excluded component's
         * bounds and computed styles exactly on both pages; only its interior
         * pixels are not counted, because another feature owns them.
         */
        let excludedRegionPixels = 0;
        if (mapping.regionExclusion !== undefined) {
          const exclusion = mapping.regionExclusion;
          const referenceRegion = await metricsFor(
            await oneVisibleLocator(
              referencePage,
              exclusion.referenceSelector,
              `reference ${mapping.regionId} exclusion`,
            ),
          );
          const actualRegion = await metricsFor(
            await oneVisibleLocator(
              page,
              exclusion.actualSelector,
              `actual ${mapping.regionId} exclusion`,
            ),
          );
          metricDifferencesForCapture.push(
            ...metricDifferences(referenceRegion, actualRegion, false).map(
              (difference) => `${exclusion.owner} region: ${difference}`,
            ),
          );
          excludedRegionPixels = countDifferencesInside(comparison, {
            left: Math.round(
              referenceRegion.bounds.left - reference.metrics.bounds.left,
            ),
            top: Math.round(
              referenceRegion.bounds.top - reference.metrics.bounds.top,
            ),
            width: Math.round(
              referenceRegion.bounds.right - referenceRegion.bounds.left,
            ),
            height: Math.round(
              referenceRegion.bounds.bottom - referenceRegion.bounds.top,
            ),
          });
        }
        const unexplainedPixels =
          comparison.metrics.differentPixelCount - excludedRegionPixels;
        if (unexplainedPixels > 0) {
          metricDifferencesForCapture.push(
            `zero-tolerance pixel drift: ${unexplainedPixels} unexplained pixels`,
          );
        }
        diagnostics = metricDifferencesForCapture;
        if (diagnostics.length > 0) {
          caseError = diagnostics.join('\n');
          failures.push({
            entry,
            repetition: expected.repetition,
            error: caseError,
            referenceBytes,
            actualBytes,
            comparison,
            referenceMetrics,
            actualMetrics,
            status: 'failed',
          });
        }
      } catch (error) {
        caseError =
          error instanceof Error
            ? (error.stack ?? error.message)
            : String(error);
        const status =
          error instanceof UnresolvedReferenceConditionError
            ? 'unresolved'
            : 'failed';
        failures.push({
          entry,
          repetition: expected.repetition,
          error: caseError,
          referenceBytes,
          actualBytes,
          comparison,
          referenceMetrics,
          actualMetrics,
          status,
        });
      }

      captures.push({
        manifestKey: entry.key,
        repetition: expected.repetition,
        kind: entry.kind,
        stateId: 'stateId' in entry ? entry.stateId : undefined,
        palette: entry.palette.id,
        captureKey: entry.captureKey,
        referenceHash,
        actualHash,
        comparisonCompleted: comparison !== undefined,
        status:
          caseError === undefined
            ? 'passed'
            : failures[failures.length - 1].status,
        referenceReady: preparedReferenceReady,
        actualReady: preparedActualReady,
        diagnostics,
        error: caseError,
      });
      if (caseError !== undefined) {
        await writeFailureArtifacts(failures[failures.length - 1], hashes);
      }
    }
  } finally {
    await writeRunReports(captures, hashes);
    await referencePage.close();
  }

  expect(captures).toHaveLength(COMPARISON_COUNT);
  expect(new Set(captures.map(({ manifestKey }) => manifestKey)).size).toBe(
    PARITY_MANIFEST.length,
  );
  expect(captures.every(({ status }) => status === 'passed')).toBe(true);
  expect(deterministicHashFailures(captures)).toEqual([]);

  const stateCaptures = captures.filter(({ stateId }) => stateId !== undefined);
  assertNoCaptureSatisfiesTwoStates(
    stateCaptures.map(({ captureKey, stateId }) => ({
      captureKey: `${captureKey}:r${captures.find(({ captureKey: key }) => key === captureKey)?.repetition ?? 'unknown'}`,
      stateId: stateId as string,
    })),
  );
  for (const { stateId } of ADDITIONAL_STATE_ASSIGNMENTS) {
    const stateCases = stateCaptures.filter(
      (capture) => capture.stateId === stateId,
    );
    expect(stateCases).toHaveLength(18);
    expect(new Set(stateCases.map(({ palette }) => palette)).size).toBe(6);
  }
  expect(failures).toEqual([]);
});
