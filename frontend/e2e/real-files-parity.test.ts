import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
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
  BEHAVIOUR_VERIFICATION_COUNT,
  BEHAVIOUR_VERIFIED_CASE_COUNT,
  BEHAVIOUR_VERIFIED_MANIFEST,
  BEHAVIOUR_VERIFIED_STATE_IDS,
  comparisonsForRepetitions,
  COMPARISON_COUNT,
  isBehaviourVerifiedEntry,
  LOGICAL_CASE_COUNT,
  PARITY_HEIGHT,
  PARITY_MANIFEST,
  PARITY_REPETITIONS,
  PIXEL_COMPARED_CASE_COUNT,
  PIXEL_COMPARED_MANIFEST,
  PIXEL_COMPARISON_COUNT,
  type ManifestEntry,
  type ParityFamily,
  type ParityPalette,
  type ParityStateId,
} from './parity/manifest';
import {
  assertSameOrigin,
  captureWhenStable,
  freezeParityPixels,
  waitForParityReady,
} from './parity/readiness';
import {
  hashReferenceSource,
  referenceNavigationUrl,
} from './parity/reference-server';
import { statusItemSelector } from './parity/state-contract';
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
/*
 * A settled region reaches three identical rasters in ~400ms, so six seconds is
 * ten times the observed cost and still fails a region that never settles fast
 * enough to be worth waiting on.
 */
const CAPTURE_SETTLE_TIMEOUT_MS = 6_000;
/*
 * The once-per-key preparation settle: a ~900ms quiet window, long enough to
 * observe the single late transition measured at ~565ms (see
 * `settleMappedRegion`), and bounded so an oscillating region is reported
 * rather than waited on.
 */
const PREPARED_REGION_SETTLE = Object.freeze({
  consecutive: 5,
  intervalMs: 150,
  timeoutMs: 6_000,
});
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

type VerificationRecordBase = Readonly<{
  readonly manifestKey: string;
  readonly repetition: number;
  readonly kind: ManifestEntry['kind'];
  readonly stateId?: ParityStateId;
  readonly palette: ParityPalette['id'];
  readonly captureKey: string;
  readonly status: 'passed' | 'failed' | 'unresolved';
  readonly actualReady: boolean;
  readonly diagnostics: readonly string[];
  readonly error?: string;
}>;

/**
 * One of the 1,530 pixel comparisons: a reference capture, a production
 * capture, and the zero-tolerance comparison between them.
 */
type PixelComparisonRecord = VerificationRecordBase &
  Readonly<{
    readonly verification: 'pixel-comparison';
    readonly referenceHash?: string;
    readonly actualHash?: string;
    readonly comparisonCompleted: boolean;
    readonly referenceReady: boolean;
    readonly referenceStability?: CaptureStability;
    readonly actualStability?: CaptureStability;
    readonly preparationSettle?: RegionSettle;
  }>;

/**
 * One of the 108 behaviour verifications. It carries a declared
 * `verificationMethod` and the assertions that method ran; it deliberately has
 * no comparison fields at all, so it can never be read as an attempted-and-
 * failed pixel comparison, and no `comparisonAttempted: false` artifact can
 * stand in for a parity result (spec.md, Session 2026-08-14).
 */
type BehaviourVerificationRecord = VerificationRecordBase &
  Readonly<{
    readonly verification: 'behaviour';
    readonly verificationMethod: string;
    readonly assertions: readonly string[];
  }>;

type CaptureRecord = PixelComparisonRecord | BehaviourVerificationRecord;

type FailureRecord = Readonly<{
  readonly entry: ManifestEntry;
  readonly repetition: number;
  readonly error: string;
  readonly referenceBytes?: Uint8Array;
  readonly actualBytes?: Uint8Array;
  readonly comparison?: PngComparison;
  readonly referenceMetrics?: SurfaceMetrics;
  readonly actualMetrics?: SurfaceMetrics;
  readonly referenceStability?: CaptureStability;
  readonly actualStability?: CaptureStability;
  readonly preparationSettle?: RegionSettle;
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

function documentIdentity(page: Page): Locator {
  return page.locator('header[aria-label="Document identity"]');
}

/**
 * The save status the backend reports, and the human-readable label the title
 * bar draws for it.
 *
 * The status row draws no save status at all, by design: the binding puts it in
 * the title bar (`mockup.html:594`, the `.doc-name` element), and production
 * stopped duplicating it in the status row when that row converged on the
 * binding's exact item inventory (`mockup.html:837-845` — standard-kind, caret,
 * count, spacer, encoding, EOL, autosave, warnings, provider, Reading pill; no
 * save status). The authoritative machine-readable source is the
 * `data-status-state` attribute on the status element
 * (`frontend/src/ui/components/StatusBar.tsx:43`), so that is what these cases
 * assert, exactly as `targeted-parity.test.ts`'s T063 does.
 */
const SAVE_STATUS_LABELS = Object.freeze({
  saved: 'Saved',
  autosaved: 'Autosaved',
  'unsaved-changes': 'Unsaved changes',
  'read-only': 'Read-only',
} as const);

type SaveStatusId = keyof typeof SAVE_STATUS_LABELS;

/**
 * Assert one save status where it is actually drawn, and assert that it is not
 * drawn where the binding does not draw it. Returns the assertions performed so
 * a behaviour-verified record can declare them.
 */
async function assertSaveStatusPlacement(
  page: Page,
  status: SaveStatusId,
): Promise<string[]> {
  const text = SAVE_STATUS_LABELS[status];
  const row = documentStatus(page);
  await expect(row).toHaveAttribute('data-status-state', status);
  await expect(documentIdentity(page)).toContainText(text);
  await expect(row).not.toContainText(text);
  return [
    `[role="status"][aria-label="Document status"] has data-status-state="${status}"`,
    `header[aria-label="Document identity"] contains "${text}"`,
    `the status row does not duplicate "${text}", matching the binding's own status row`,
  ];
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
      await assertSaveStatusPlacement(page, 'saved');
      return;
    case 'status-autosaved':
      await assertSaveStatusPlacement(page, 'autosaved');
      return;
    case 'status-unsaved-changes':
      /*
       * The fixture already reports the state: `configureParityFixture` sets
       * `dirty` and `status: 'unsaved-changes'` for this parity case
       * (`src/dev/bridge-mock/go/appmodel/AppModelHandler.ts:403-406`). Typing
       * into the editor to provoke it was both unnecessary and destructive —
       * it changed the very document the capture then photographed.
       */
      await assertSaveStatusPlacement(page, 'unsaved-changes');
      return;
    case 'status-read-only':
      await assertSaveStatusPlacement(page, 'read-only');
      return;
    case 'tab-read-only':
      await expect(page.getByRole('tab').first()).toHaveAttribute(
        'aria-label',
        /release-notes\.md/u,
      );
      await assertSaveStatusPlacement(page, 'read-only');
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
    case 'toolbar-overflow': {
      /*
       * The overflow trigger is the toolbar's own `<summary>`
       * (`EditorChrome.tsx:480-483`), scoped to the toolbar because the
       * application action row carries a second `More actions` control.
       *
       * It is opened from the keyboard, not by a pointer click, and that is
       * not a workaround for a flaky locator. Measured at 1280 on
       * `primary:toolbar-overflow:1280:minimal-light`: the toolbar is pinned to
       * the binding's 720px width for this family
       * (`EditorView.module.css:199`) and the deferred-action group's buttons
       * overflow their own group box — the group measures 655.578→786.969
       * while its `compact` button measures 726.156→807.531 and `lint` reaches
       * further still, so both paint on top of the trigger at 790.969→823.969.
       * `elementFromPoint` returns the disabled `compact` button at every point
       * inside the trigger, and a pointer click can never reach it. Keyboard
       * activation is a real user interaction that paint order cannot
       * intercept; the overlap itself stays visible to the pixel comparison
       * this setup step exists to enable.
       */
      const trigger = page
        .getByRole('toolbar', { name: 'Document toolbar' })
        .getByLabel('More actions');
      await expect(trigger).toHaveCount(1);
      await trigger.focus();
      await trigger.press('Enter');
      await page
        .locator('[data-viewport-popup="editor-overflow"]')
        .waitFor({ state: 'visible' });
      return;
    }
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
    case 'settings-markdown': {
      /*
       * The binding opens the full settings screen from the compact popup's
       * `All settings…` row (`mockup.html:624`), which is what this step wants:
       * it then waits for the settings dialog. `Appearance` is never a menu
       * item — it is the popup's group label and the accessible name of its
       * appearance radiogroup (`SettingsMenu.tsx:195-201`, `appearance.mode.label`
       * = "Appearance"). Measured on this build, the popup exposes zero
       * `menuitem`s named `Appearance` and two radiogroups, `Theme` and
       * `Appearance`. The same stale locator was already corrected in
       * `window-shell.test.ts` (`openSettings`, ~line 51) and
       * `editor-stage.test.ts`; the settings screen picks its own tab from the
       * parity case key (`SettingsDialog.tsx:34-42`), so no tab click is
       * needed here.
       */
      const menu = await openActualSettingsMenu(page, entry.width);
      await menu.getByRole('menuitem', { name: /All settings/u }).click();
      await page
        .locator('[data-viewport-popup="settings-menu"]')
        .filter({ has: page.getByRole('dialog', { name: 'Settings' }) })
        .waitFor({ state: 'visible' });
      return;
    }
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

/**
 * The six editor-status states and the save status each of them reports. The
 * table is checked against the manifest's own split below, so it cannot drift
 * away from what `PIXEL_COMPARED_MANIFEST` excludes.
 */
const BEHAVIOUR_VERIFIED_STATUS_CASES = Object.freeze({
  'status-saved': 'saved',
  'status-autosaved': 'autosaved',
  'status-unsaved-changes': 'unsaved-changes',
  'status-read-only': 'read-only',
  'status-mixed-ending': 'autosaved',
  'status-large-file': 'autosaved',
} as const satisfies Readonly<Record<string, SaveStatusId>>);

/**
 * The declared method every behaviour-verified state is proven by. It is a
 * method with its own assertions, not a comparison that did not happen.
 */
const BEHAVIOUR_VERIFICATION_METHOD =
  'data-status-state attribute, title bar, status-item text and binding colour-token assertions';

const BEHAVIOUR_VERIFICATION_REASON =
  'No editor-status state can be pixel-compared. Four of the six differ only in a save status the binding never draws in its status row — it puts it in the title bar (mockup.html:594). The other two do name a condition the binding draws (.sb-eol, .sb-count) and reviewed reference variants exist for both; measuring through them proved they still cannot pair on absolute bounds, because the binding row carries a Problems badge, an AI-provider readout and a Reading pill while production carries a Document details disclosure the binding lacks, and because the binding draws .statusbar full width beneath the sidebar while production draws it inside the document area. Measured at 1280 Minimal Light: 115.531px and 207.453px horizontally and a 46px frame-height difference vertically, so every status item lands on a different sub-pixel grid. All six are therefore proven against the authoritative data-status-state attribute, the title bar that carries the status, the status-item text each state changes, and the binding colour token the row reads.';

/**
 * Verify one behaviour-verified state and return the assertions performed, so
 * the record and its artifact can declare exactly what proved it. Every
 * assertion is non-mutating: the page is prepared once per logical key and then
 * verified three times, so a verification that changed the page would make the
 * three repetitions describe different things.
 */
async function verifyBehaviourState(
  page: Page,
  entry: ManifestEntry,
): Promise<readonly string[]> {
  const stateId = stateIdForEntry(entry);
  if (stateId === undefined || !(stateId in BEHAVIOUR_VERIFIED_STATUS_CASES)) {
    throw new Error(
      `behaviour verification requested for a non-behaviour case: ${entry.key}`,
    );
  }
  const status =
    BEHAVIOUR_VERIFIED_STATUS_CASES[
      stateId as keyof typeof BEHAVIOUR_VERIFIED_STATUS_CASES
    ];
  const row = documentStatus(page);
  const assertions = await assertSaveStatusPlacement(page, status);

  await expect(row.locator('[data-status-item="cursor"]')).toContainText('Ln');
  assertions.push('the status row reports the caret position');
  await expect(
    row.locator(statusItemSelector('encoding', 'actual')),
  ).toHaveText('UTF-8');
  assertions.push(`${statusItemSelector('encoding', 'actual')} reads "UTF-8"`);
  const expectedEnding = stateId === 'status-mixed-ending' ? 'Mixed' : 'LF';
  await expect(
    row.locator(statusItemSelector('line-ending', 'actual')),
  ).toHaveText(expectedEnding);
  assertions.push(
    `${statusItemSelector('line-ending', 'actual')} reads "${expectedEnding}"`,
  );
  if (stateId === 'status-large-file') {
    await expect(
      row.locator(statusItemSelector('count', 'actual')),
    ).toContainText('420,000');
    assertions.push(
      `${statusItemSelector('count', 'actual')} reports the large-file word count`,
    );
  }

  const noWrap = await row.evaluate((element) => ({
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
    wrappedItems: Array.from(
      element.querySelectorAll<HTMLElement>('[data-status-item]'),
    ).filter((item) => getComputedStyle(item).whiteSpace !== 'nowrap').length,
  }));
  expect(noWrap.scrollWidth).toBeLessThanOrEqual(noWrap.clientWidth);
  expect(noWrap.wrappedItems).toBe(0);
  assertions.push('no status item wraps and the row never overflows');

  /*
   * The binding's status row reads `--faint` (`mockup.html:382`,
   * `.statusbar{…color:var(--faint)…}`). With no pixel comparison to catch a
   * wrong token, this is the check that keeps the colour honest: it resolves
   * the binding token in the page under test and asserts the row and every item
   * read exactly it, so it holds in all six palettes without pinning a literal.
   */
  const colour = await row.evaluate((element) => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--faint)';
    probe.style.display = 'none';
    element.appendChild(probe);
    const bindingFaint = getComputedStyle(probe).color;
    probe.remove();
    return {
      bindingFaint,
      row: getComputedStyle(element).color,
      items: Array.from(
        element.querySelectorAll<HTMLElement>('[data-status-item]'),
      ).map(
        (item) =>
          [
            item.dataset.statusItem ?? '',
            getComputedStyle(item).color,
          ] as const,
      ),
    };
  });
  expect(colour.row).toBe(colour.bindingFaint);
  for (const [item, value] of colour.items) {
    expect(value, `status item ${item} must read the binding colour`).toBe(
      colour.bindingFaint,
    );
  }
  expect(colour.items.length).toBeGreaterThan(0);
  assertions.push(
    `the status row and all ${colour.items.length} items read the binding's --faint token (${colour.bindingFaint}), per mockup.html:382`,
  );

  return assertions;
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

/**
 * How long a region took to stop changing, and how many rasters it went
 * through getting there. Recorded per capture so "did it settle" is a number
 * the next run can be watched against, not an assumption.
 */
type CaptureStability = Readonly<{
  readonly attempts: number;
  readonly settleMs: number;
  readonly distinctHashes: number;
  readonly observedHashes: readonly string[];
}>;

type SurfaceCapture = Readonly<{
  readonly bytes: Uint8Array;
  readonly metrics: SurfaceMetrics;
  readonly stability: CaptureStability;
}>;

async function captureSurface(
  page: Page,
  selector: string,
  label: string,
): Promise<SurfaceCapture> {
  const locator = await oneVisibleLocator(page, selector, label);
  /*
   * Capture only once the region has stopped changing, on both pages. FR-FT-054
   * requires three consecutive unchanged captures to hash identically; this
   * applies that rule as a precondition instead of checking it after the fact.
   * Measured 2026-08-14, the editor region changed four times over the first
   * ~1.2s after readiness with `data-status-state` and `data-preview-state`
   * constant throughout — the renderer settling, not the application changing
   * state — and 138 of 450 keys hashed differently across repetitions because
   * of it, while the immutable reference was stable in all 450. The reference
   * is settled too, for one extra hash, so both sides are captured under the
   * same rule if the reference ever gains a dynamic element.
   *
   * The metrics are read after the settled capture, not before it, so the
   * bounds and computed styles describe the raster that was actually
   * photographed.
   */
  const stable = await captureWhenStable(locator, {
    timeoutMs: CAPTURE_SETTLE_TIMEOUT_MS,
  });
  return {
    bytes: stable.buffer,
    metrics: await metricsFor(locator),
    stability: {
      attempts: stable.attempts,
      settleMs: stable.settleMs,
      distinctHashes: stable.observedHashes.length,
      observedHashes: stable.observedHashes,
    },
  };
}

/**
 * Whether a mapped region reached a final raster during preparation, and what
 * it cost to get there.
 */
type RegionSettle = Readonly<{
  readonly settled: boolean;
  readonly attempts: number | null;
  readonly settleMs: number | null;
  readonly distinctRasters: number | null;
  readonly detail?: string;
}>;

/**
 * Settle the production region once per logical key, before its three
 * repetitions are captured.
 *
 * `captureSurface`'s own three-consecutive check is not enough on its own here,
 * and that is a measurement, not a guess. On
 * `primary:editor-only:1280:minimal-light`, prepared and then captured three
 * times with the default settle, every capture reported three identical rasters
 * — and the three repetitions still produced two different images, because the
 * region has a single late transition that the ~400ms default window closes
 * before. Sampled at 60ms: the raster changes once at ~565ms after preparation
 * and never again over the next 3.2 seconds. The 2,398 differing pixels sit in
 * an 11px-wide strip at x1012-1022, which is Monaco's
 * `canvas.decorationsOverviewRuler` drawing itself a second time; the canvas
 * element and its attributes never change, so no DOM condition can be waited
 * on. A ~900ms quiet window observes that transition and restarts, and the
 * three repetitions then agree.
 *
 * Deliberately best-effort. A region that never settles is a finding, not a
 * reason to abort preparation: it is recorded here and the capture path then
 * reports it in the terms it fails in.
 */
async function settleMappedRegion(
  page: Page,
  selector: string,
  label: string,
): Promise<RegionSettle> {
  try {
    const stable = await captureWhenStable(
      page.locator(selector),
      PREPARED_REGION_SETTLE,
    );
    return {
      settled: true,
      attempts: stable.attempts,
      settleMs: stable.settleMs,
      distinctRasters: stable.observedHashes.length,
    };
  } catch (error) {
    return {
      settled: false,
      attempts: null,
      settleMs: null,
      distinctRasters: null,
      detail: `${label}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
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
  /*
   * Each (key, repetition) is visited exactly once per run, so the directory is
   * rebuilt rather than merged into. A previous run's artifacts describing a
   * different outcome — an image triplet where this run took no picture, or a
   * behaviour artifact where this run compared pixels — would otherwise sit
   * beside this run's and contradict it.
   */
  await rm(directory, { recursive: true, force: true });
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
        stability: {
          reference: failure.referenceStability ?? null,
          actual: failure.actualStability ?? null,
          preparation: failure.preparationSettle ?? null,
        },
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
            : isBehaviourVerifiedEntry(failure.entry)
              ? 'A behaviour verification is not a pixel comparison and produces no image triplet; the assertion that failed is recorded instead.'
              : 'A setup or selector failure cannot truthfully produce a mapped image triplet; the missing artifacts are recorded explicitly.',
      },
      null,
      2,
    ),
  );
}

/**
 * The positive artifact for a behaviour verification. It declares the method
 * and every assertion that ran. It never writes `comparisonAttempted: false`,
 * and its production image is named for what it is — a picture of production
 * alone, not half of a comparison triplet — so nothing here can be mistaken for
 * a parity pass that was never measured.
 */
async function writeBehaviourArtifacts(
  page: Page,
  record: BehaviourVerificationRecord,
  hashes: Readonly<Record<string, string>>,
): Promise<void> {
  const directory = join(
    EVIDENCE_ROOT,
    safeArtifactPart(record.manifestKey),
    `repetition-${record.repetition}`,
  );
  await rm(directory, { recursive: true, force: true });
  await mkdir(directory, { recursive: true });
  const row = documentStatus(page);
  /*
   * Illustrative evidence, not a measurement: nothing compares this image and
   * no count reads it, so it is taken plainly rather than through
   * `captureWhenStable`. Settling matters where a raster becomes a result; here
   * the result is the assertion list below.
   */
  await writeFile(
    join(directory, 'production-status-row.png'),
    await row.screenshot({ animations: 'disabled' }),
  );
  await writeFile(
    join(directory, 'semantic.json'),
    JSON.stringify(
      {
        manifestKey: record.manifestKey,
        repetition: record.repetition,
        stateId: record.stateId ?? null,
        palette: record.palette,
        dataStatusState: await row.getAttribute('data-status-state'),
        statusRowText: await row.innerText(),
        documentIdentityText: await documentIdentity(page).innerText(),
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
      {
        status: 'behaviour-verified',
        exitStatus: 0,
        pixelCompared: false,
        verificationMethod: record.verificationMethod,
        assertions: record.assertions,
        reason: BEHAVIOUR_VERIFICATION_REASON,
      },
      null,
      2,
    ),
  );
  await writeFile(
    join(directory, 'raw-status.log'),
    [
      'status=behaviour-verified',
      'exit_status=0',
      `manifest_key=${record.manifestKey}`,
      `repetition=${record.repetition}`,
      `verification_method=${record.verificationMethod}`,
      `assertion_count=${record.assertions.length}`,
      ...record.assertions.map(
        (assertion, index) => `assertion_${index + 1}=${assertion}`,
      ),
      'reason=no_editor_status_state_can_pair_on_absolute_bounds',
      '',
    ].join('\n'),
  );
}

async function writeRunReports(
  captures: readonly CaptureRecord[],
  hashes: Readonly<Record<string, string>>,
): Promise<void> {
  await mkdir(EVIDENCE_ROOT, { recursive: true });
  const planned = comparisonsForRepetitions();
  const plannedPixelComparisons = planned.filter(
    ({ entry }) => !isBehaviourVerifiedEntry(entry),
  );
  const plannedBehaviourVerifications = planned.filter(({ entry }) =>
    isBehaviourVerifiedEntry(entry),
  );
  const pixelRecords = captures.filter(
    (capture): capture is PixelComparisonRecord =>
      capture.verification === 'pixel-comparison',
  );
  const behaviourRecords = captures.filter(
    (capture): capture is BehaviourVerificationRecord =>
      capture.verification === 'behaviour',
  );
  const comparisonAccounting = accountParityComparisons(
    plannedPixelComparisons,
    pixelRecords,
  );
  /*
   * The behaviour half is accounted separately and with its own field names. It
   * has no `referenceReady` and no `comparisonCompleted` because no reference
   * was paired and no comparison was taken — writing those fields as `false`
   * would describe a comparison that was attempted and lost, which is exactly
   * what the specification forbids these states from claiming.
   */
  const behaviourAccounting = plannedBehaviourVerifications.map(
    ({ manifestKey, repetition }) => {
      const record = behaviourRecords.find(
        (candidate) =>
          candidate.manifestKey === manifestKey &&
          candidate.repetition === repetition,
      );
      return {
        manifestKey,
        repetition,
        planned: true,
        attempted: record !== undefined,
        actualReady: record?.actualReady ?? false,
        verified: record?.status === 'passed',
        failed: record?.status === 'failed',
        verificationMethod: record?.verificationMethod ?? null,
        assertionCount: record?.assertions.length ?? 0,
      };
    },
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
          verification: capture.verification,
          comparisonCompleted:
            capture.verification === 'pixel-comparison'
              ? capture.comparisonCompleted
              : null,
          verificationMethod:
            capture.verification === 'behaviour'
              ? capture.verificationMethod
              : null,
        })),
    ]),
  );
  const count = <T>(rows: readonly T[], of: (row: T) => boolean): number =>
    rows.filter(of).length;
  /*
   * Capture settling, as a number rather than an assumption. `unsettled` is the
   * count the next run has to keep at zero; `neededSettling` says how much work
   * `captureWhenStable` is doing, which is what would have been silent
   * non-determinism before.
   */
  const stabilitySummary = (
    side: 'referenceStability' | 'actualStability',
  ): Readonly<Record<string, number>> => {
    const observed = pixelRecords
      .map((record) => record[side])
      .filter((value): value is CaptureStability => value !== undefined);
    return {
      captures: observed.length,
      neededSettling: count(observed, ({ attempts }) => attempts > 3),
      sawMoreThanOneRaster: count(
        observed,
        ({ distinctHashes }) => distinctHashes > 1,
      ),
      maxAttempts: observed.reduce(
        (highest, { attempts }) => Math.max(highest, attempts),
        0,
      ),
      maxSettleMs: observed.reduce(
        (highest, { settleMs }) => Math.max(highest, settleMs),
        0,
      ),
      totalSettleMs: observed.reduce(
        (total, { settleMs }) => total + settleMs,
        0,
      ),
    };
  };
  /**
   * A logical key whose three repetitions did not produce one hash. This is the
   * measurement the settle-before-capture change exists to drive to zero.
   */
  const unstableKeys = PIXEL_COMPARED_MANIFEST.filter((entry) => {
    const cases = pixelRecords.filter(
      ({ manifestKey }) => manifestKey === entry.key,
    );
    return (
      new Set(cases.map(({ actualHash }) => actualHash).filter(Boolean)).size >
        1 ||
      new Set(cases.map(({ referenceHash }) => referenceHash).filter(Boolean))
        .size > 1
    );
  }).map(({ key }) => key);
  await writeFile(
    join(EVIDENCE_ROOT, 'manifest-report.json'),
    JSON.stringify(
      {
        counts: {
          logical: PARITY_MANIFEST.length,
          repetitions: PARITY_REPETITIONS,
          planned: planned.length,
          attempted:
            count(comparisonAccounting, ({ attempted }) => attempted) +
            count(behaviourAccounting, ({ attempted }) => attempted),
          pixelComparison: {
            logical: PIXEL_COMPARED_MANIFEST.length,
            planned: plannedPixelComparisons.length,
            attempted: count(
              comparisonAccounting,
              ({ attempted }) => attempted,
            ),
            referenceReady: count(
              comparisonAccounting,
              ({ referenceReady }) => referenceReady,
            ),
            actualReady: count(
              comparisonAccounting,
              ({ actualReady }) => actualReady,
            ),
            comparisonCompleted: count(
              comparisonAccounting,
              ({ comparisonCompleted }) => comparisonCompleted,
            ),
            passed: count(comparisonAccounting, ({ passed }) => passed),
            failed: count(comparisonAccounting, ({ failed }) => failed),
            unresolved: count(
              comparisonAccounting,
              ({ unresolved }) => unresolved,
            ),
          },
          behaviourVerification: {
            logical: BEHAVIOUR_VERIFIED_MANIFEST.length,
            planned: plannedBehaviourVerifications.length,
            attempted: count(behaviourAccounting, ({ attempted }) => attempted),
            actualReady: count(
              behaviourAccounting,
              ({ actualReady }) => actualReady,
            ),
            verified: count(behaviourAccounting, ({ verified }) => verified),
            failed: count(behaviourAccounting, ({ failed }) => failed),
            stateIds: [...BEHAVIOUR_VERIFIED_STATE_IDS],
            verificationMethod: BEHAVIOUR_VERIFICATION_METHOD,
            reason: BEHAVIOUR_VERIFICATION_REASON,
          },
        },
        stability: {
          reference: stabilitySummary('referenceStability'),
          actual: stabilitySummary('actualStability'),
          unstableLogicalKeys: unstableKeys.length,
          unstableLogicalKeyList: unstableKeys,
          preparation: {
            settled: new Set(
              pixelRecords
                .filter(({ preparationSettle }) => preparationSettle?.settled)
                .map(({ manifestKey }) => manifestKey),
            ).size,
            neverSettled: [
              ...new Set(
                pixelRecords
                  .filter(
                    ({ preparationSettle }) =>
                      preparationSettle !== undefined &&
                      !preparationSettle.settled,
                  )
                  .map(({ manifestKey }) => manifestKey),
              ),
            ],
            maxSettleMs: pixelRecords.reduce(
              (highest, { preparationSettle }) =>
                Math.max(highest, preparationSettle?.settleMs ?? 0),
              0,
            ),
          },
        },
        legend: {
          totals:
            'logical = pixelComparison.logical + behaviourVerification.logical = 546. planned = pixelComparison.planned + behaviourVerification.planned = 1638.',
          passed:
            'pixelComparison.passed counts completed zero-tolerance comparisons only. A behaviour verification is never counted there; it is counted as behaviourVerification.verified, against the declared verificationMethod.',
          stability:
            'Every capture waits for three consecutive identical rasters before it is taken (captureWhenStable). attempts is the number of rasters taken; three means it never moved. unstableLogicalKeys must be zero: it counts keys whose three repetitions still did not agree on a hash.',
        },
        comparisonAccounting,
        behaviourAccounting,
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
          PIXEL_COMPARED_MANIFEST.map((entry) => [
            entry.key,
            pixelRecords
              .filter(({ manifestKey }) => manifestKey === entry.key)
              .map(
                ({
                  repetition,
                  referenceHash,
                  actualHash,
                  status,
                  referenceStability,
                  actualStability,
                }) => ({
                  repetition,
                  referenceHash: referenceHash ?? null,
                  actualHash: actualHash ?? null,
                  status,
                  referenceAttempts: referenceStability?.attempts ?? null,
                  referenceSettleMs: referenceStability?.settleMs ?? null,
                  referenceObservedHashes:
                    referenceStability?.observedHashes ?? null,
                  actualAttempts: actualStability?.attempts ?? null,
                  actualSettleMs: actualStability?.settleMs ?? null,
                  actualObservedHashes: actualStability?.observedHashes ?? null,
                }),
              ),
          ]),
        ),
        /*
         * The behaviour-verified keys take no picture to hash. Their
         * determinism is the determinism of their assertions, listed here so
         * the report still accounts for all 546 logical keys.
         */
        behaviourVerifiedCases: Object.fromEntries(
          BEHAVIOUR_VERIFIED_MANIFEST.map((entry) => [
            entry.key,
            behaviourRecords
              .filter(({ manifestKey }) => manifestKey === entry.key)
              .map(({ repetition, status, assertions }) => ({
                repetition,
                status,
                assertions,
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
  captures: readonly PixelComparisonRecord[],
): string[] {
  const failures: string[] = [];
  for (const entry of PIXEL_COMPARED_MANIFEST) {
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

/**
 * The behaviour half's determinism check. A behaviour-verified key must run
 * three times and prove the same assertions each time — the same requirement
 * the hash check makes of a pixel-compared key, expressed in the terms that
 * half is actually verified in.
 */
function behaviourVerificationDrift(
  records: readonly BehaviourVerificationRecord[],
): string[] {
  const failures: string[] = [];
  for (const entry of BEHAVIOUR_VERIFIED_MANIFEST) {
    const cases = records.filter(
      ({ manifestKey }) => manifestKey === entry.key,
    );
    if (cases.length !== PARITY_REPETITIONS) {
      failures.push(`${entry.key} verified ${cases.length} times`);
      continue;
    }
    const declared = new Set(
      cases.map(({ verificationMethod }) => verificationMethod),
    );
    const proven = new Set(
      cases.map(({ assertions }) => assertions.join('\n')),
    );
    if (declared.size !== 1 || declared.has('')) {
      failures.push(`${entry.key} does not declare one verification method`);
    }
    if (proven.size !== 1) {
      failures.push(`${entry.key} assertions are not deterministic`);
    }
    if (cases.some(({ assertions }) => assertions.length === 0)) {
      failures.push(`${entry.key} recorded a verification with no assertions`);
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
  /*
   * The verification split is read from the manifest, never written out here:
   * 546 logical keys are 510 pixel-compared plus 36 behaviour-verified, and
   * 1,638 verifications are 1,530 pixel comparisons plus 108 behaviour
   * verifications. The six behaviour-verified state IDs must all be states this
   * runner actually knows how to verify, and no others.
   */
  expect(PIXEL_COMPARED_MANIFEST).toHaveLength(PIXEL_COMPARED_CASE_COUNT);
  expect(BEHAVIOUR_VERIFIED_MANIFEST).toHaveLength(
    BEHAVIOUR_VERIFIED_CASE_COUNT,
  );
  expect(PIXEL_COMPARED_CASE_COUNT + BEHAVIOUR_VERIFIED_CASE_COUNT).toBe(
    LOGICAL_CASE_COUNT,
  );
  expect(PIXEL_COMPARISON_COUNT + BEHAVIOUR_VERIFICATION_COUNT).toBe(
    COMPARISON_COUNT,
  );
  expect(Object.keys(BEHAVIOUR_VERIFIED_STATUS_CASES)).toEqual([
    ...BEHAVIOUR_VERIFIED_STATE_IDS,
  ]);
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
  let preparedSettle: RegionSettle | undefined;

  try {
    for (const expected of expectedComparisons) {
      const entry = expected.entry;
      const mapping = SURFACES[entry.family];
      if (entry.key !== expected.manifestKey) {
        throw new Error(`comparison manifest key drifted for ${entry.key}`);
      }

      /*
       * The behaviour half never enters the capture path. No reference page is
       * navigated for it, no screenshot is taken of either page, and no
       * comparison is constructed — so it cannot be recorded as a pixel
       * comparison that was attempted and lost. It is proven by the declared
       * method's assertions and recorded with that method named.
       */
      if (isBehaviourVerifiedEntry(entry)) {
        let assertions: readonly string[] = [];
        let behaviourError: string | undefined;
        try {
          if (preparedManifestKey !== entry.key) {
            preparedReferenceReady = false;
            preparedActualReady = false;
            await setupActual(page, entry);
            preparedActualReady = true;
            preparedManifestKey = entry.key;
          }
          await assertSameOrigin(page, actualOrigin);
          await freezeParityPixels(page);
          assertions = await verifyBehaviourState(page, entry);
        } catch (error) {
          behaviourError =
            error instanceof Error
              ? (error.stack ?? error.message)
              : String(error);
          failures.push({
            entry,
            repetition: expected.repetition,
            error: behaviourError,
            status: 'failed',
          });
        }
        const behaviourRecord: BehaviourVerificationRecord = {
          manifestKey: entry.key,
          repetition: expected.repetition,
          kind: entry.kind,
          verification: 'behaviour',
          stateId: stateIdForEntry(entry),
          palette: entry.palette.id,
          captureKey: entry.captureKey,
          status: behaviourError === undefined ? 'passed' : 'failed',
          actualReady: preparedActualReady,
          diagnostics: [],
          error: behaviourError,
          verificationMethod: BEHAVIOUR_VERIFICATION_METHOD,
          assertions,
        };
        captures.push(behaviourRecord);
        if (behaviourError === undefined) {
          await writeBehaviourArtifacts(page, behaviourRecord, hashes);
        } else {
          await writeFailureArtifacts(failures[failures.length - 1], hashes);
        }
        continue;
      }

      let referenceHash: string | undefined;
      let actualHash: string | undefined;
      let caseError: string | undefined;
      let referenceBytes: Uint8Array | undefined;
      let actualBytes: Uint8Array | undefined;
      let comparison: PngComparison | undefined;
      let referenceMetrics: SurfaceMetrics | undefined;
      let actualMetrics: SurfaceMetrics | undefined;
      let referenceStability: CaptureStability | undefined;
      let actualStability: CaptureStability | undefined;
      let diagnostics: readonly string[] = [];
      try {
        if (preparedManifestKey !== entry.key) {
          preparedReferenceReady = false;
          preparedActualReady = false;
          preparedSettle = undefined;
          await setupReference(referencePage, entry, referenceSourceHash);
          preparedReferenceReady =
            stateIdForEntry(entry) === undefined ||
            referenceStateCondition(stateIdForEntry(entry) as string).status ===
              'supported';
          await setupActual(page, entry);
          preparedActualReady = true;
          /*
           * Only the production region is settled here. The immutable reference
           * was stable in all 450 keys that produced a hash in the previous
           * run, and it has no Monaco; `captureSurface` still settles both
           * sides on every capture, so the two are captured under the same
           * rule.
           */
          preparedSettle = await settleMappedRegion(
            page,
            mapping.actualSelector,
            `actual ${mapping.regionId}`,
          );
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
        referenceStability = reference.stability;
        actualStability = actual.stability;
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
            referenceStability,
            actualStability,
            preparationSettle: preparedSettle,
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
          referenceStability,
          actualStability,
          preparationSettle: preparedSettle,
          status,
        });
      }

      captures.push({
        manifestKey: entry.key,
        repetition: expected.repetition,
        kind: entry.kind,
        verification: 'pixel-comparison',
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
        referenceStability,
        actualStability,
        preparationSettle: preparedSettle,
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

  const pixelCaptures = captures.filter(
    (capture): capture is PixelComparisonRecord =>
      capture.verification === 'pixel-comparison',
  );
  const behaviourCaptures = captures.filter(
    (capture): capture is BehaviourVerificationRecord =>
      capture.verification === 'behaviour',
  );
  /*
   * The two halves reconstruct the fixed 1,638 total exactly, and each half
   * covers exactly its own logical keys. Neither can borrow from the other.
   */
  expect(pixelCaptures).toHaveLength(PIXEL_COMPARISON_COUNT);
  expect(behaviourCaptures).toHaveLength(BEHAVIOUR_VERIFICATION_COUNT);
  expect(pixelCaptures.length + behaviourCaptures.length).toBe(
    COMPARISON_COUNT,
  );
  expect(
    new Set(pixelCaptures.map(({ manifestKey }) => manifestKey)).size,
  ).toBe(PIXEL_COMPARED_MANIFEST.length);
  expect(
    new Set(behaviourCaptures.map(({ manifestKey }) => manifestKey)).size,
  ).toBe(BEHAVIOUR_VERIFIED_MANIFEST.length);
  expect(
    behaviourCaptures.every(
      ({ verificationMethod, assertions }) =>
        verificationMethod === BEHAVIOUR_VERIFICATION_METHOD &&
        assertions.length > 0,
    ),
  ).toBe(true);
  expect(deterministicHashFailures(pixelCaptures)).toEqual([]);
  expect(behaviourVerificationDrift(behaviourCaptures)).toEqual([]);

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
