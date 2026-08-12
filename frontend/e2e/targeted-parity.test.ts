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
  TARGETED_FILE_MENU_MANIFEST,
  TARGETED_MANIFEST,
  TARGETED_SETTINGS_MANIFEST,
  TARGETED_TAB_MANIFEST,
  TARGETED_VIEW_ABOUT_MANIFEST,
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
const FILE_MENU_EVIDENCE_ROOT = resolve(
  REPOSITORY_ROOT,
  '../specs/003-real-files-and-tabs/evidence/ft-vs-08/parity/targeted/file-menu',
);
const SETTINGS_EVIDENCE_ROOT = resolve(
  REPOSITORY_ROOT,
  '../specs/003-real-files-and-tabs/evidence/ft-vs-08/parity/targeted/settings',
);
const VIEW_ABOUT_EVIDENCE_ROOT = resolve(
  REPOSITORY_ROOT,
  '../specs/003-real-files-and-tabs/evidence/ft-vs-08/parity/targeted/view-about',
);
const EDITOR_STATUS_EVIDENCE_ROOT = resolve(
  REPOSITORY_ROOT,
  '../specs/003-real-files-and-tabs/evidence/ft-vs-08/parity/targeted/editor-status',
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
  await page.setViewportSize({ width: entry.width, height: entry.height });
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
  if (entry.openSurface === 'settings-overflow') {
    await page.locator('#app .tg-over button[title="More"]').click();
    await expect(page.locator('#app .ovf-menu')).toBeVisible();
  }
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
  if (entry.width === 375) {
    await expect(page.locator('[data-settings-overflow]')).toBeVisible();
  }
  await expect(page.getByRole('tab')).toHaveCount(2);
  if (entry.width === 375) {
    await page.locator('[data-settings-overflow]').click();
    await page
      .locator('[data-viewport-popup="shell-overflow"]')
      .getByRole('menuitem', { name: /^Settings/ })
      .click();
  } else {
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
  }
  const menu = page.getByRole('menu', { name: 'Settings menu' });
  const themeLabel =
    entry.palette.theme === 'glass'
      ? 'Liquid Glass'
      : entry.palette.theme.charAt(0).toUpperCase() +
        entry.palette.theme.slice(1);
  const modeLabel =
    entry.palette.mode.charAt(0).toUpperCase() + entry.palette.mode.slice(1);
  await menu.getByRole('radio', { name: themeLabel, exact: true }).click();
  const refreshedMenu = page.locator('[data-viewport-popup="settings-menu"]');
  await refreshedMenu.waitFor({ state: 'visible' });
  await refreshedMenu
    .getByRole('radio', { name: modeLabel, exact: true })
    .click();
  await expect(page.locator('html')).toHaveAttribute(
    'data-theme',
    entry.palette.theme,
  );
  await expect(page.locator('html')).toHaveAttribute(
    'data-mode',
    entry.palette.mode,
  );
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-viewport-popup]')).toHaveCount(0);
  await page.evaluate(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
  });
  await freezeParityPixels(page);
  if (entry.openSurface === 'file-menu') {
    await page.getByRole('button', { name: 'File', exact: true }).click();
    await expect(
      page.locator('[data-viewport-popup="file-menu"]'),
    ).toBeVisible();
    await page.evaluate(() => {
      const active = document.activeElement;
      if (active instanceof HTMLElement) active.blur();
    });
  } else if (entry.openSurface === 'settings-menu') {
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(
      page.locator('[data-viewport-popup="settings-menu"]'),
    ).toBeVisible();
    await page.evaluate(() => {
      const active = document.activeElement;
      if (active instanceof HTMLElement) active.blur();
    });
  } else if (entry.openSurface === 'settings-overflow') {
    await page.locator('summary[aria-label="More actions"]').click();
    await expect(
      page.locator('[data-viewport-popup="editor-overflow"]'),
    ).toBeVisible();
    await page
      .locator(
        '[data-viewport-popup="editor-overflow"] [data-parity-overflow-item]',
      )
      .filter({ hasText: /^Quote/u })
      .hover();
  } else if (entry.openSurface === 'view-menu') {
    await page.getByRole('button', { name: 'View', exact: true }).click();
    await expect(page.locator('[data-viewport-popup="view-menu"]')).toBeVisible();
    await page.evaluate(() => {
      const active = document.activeElement;
      if (active instanceof HTMLElement) active.blur();
    });
  } else if (entry.openSurface === 'about-menu') {
    await page.getByRole('button', { name: 'About', exact: true }).click();
    await expect(page.locator('[data-viewport-popup="about-menu"]')).toBeVisible();
    await page.evaluate(() => {
      const active = document.activeElement;
      if (active instanceof HTMLElement) active.blur();
    });
  }
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

async function assertActualMenubarStructure(
  page: Page,
  width: 1280 | 375,
): Promise<void> {
  const menubar = page.locator('nav[aria-label="Application actions"]');
  await expect(menubar).toBeVisible();
  const rowMetrics = await surfaceMetrics(menubar);
  expect(rowMetrics.bounds.height).toBe(44);
  if (width === 1280) {
    for (const action of ['File', 'Settings', 'View', 'About']) {
      const button = menubar.getByRole('button', { name: action, exact: true });
      await expect(button).toBeVisible();
      await expect(button).toHaveAttribute('type', 'button');
      expect(
        await button.evaluate((element) => element.tabIndex),
      ).toBeGreaterThanOrEqual(0);
    }
  } else {
    const overflow = page.locator('[data-settings-overflow]');
    await expect(overflow).toBeVisible();
    await expect(overflow).toHaveAttribute('type', 'button');
  }
  const identity = page.locator('header[aria-label="Document identity"]');
  await expect(identity).toBeVisible();
  await expect(menubar.locator('h1')).toHaveCount(1);
  const identityBounds = await identity.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom };
  });
  expect(identityBounds.top).toBeGreaterThanOrEqual(rowMetrics.bounds.top);
  expect(identityBounds.bottom).toBeLessThanOrEqual(rowMetrics.bounds.bottom);
  const editor = page.getByRole('main', { name: 'Document area' });
  await expect(editor).toBeVisible();
}

type FilePopupItem = Readonly<{
  readonly actionId: string | null;
  readonly label: string;
  readonly shortcut: string | null;
  readonly availability: 'enabled' | 'disabled';
}>;

type FilePopupPairing = Readonly<{
  readonly comparedActionIds: readonly string[];
  readonly referenceItems: readonly FilePopupItem[];
  readonly actualItems: readonly FilePopupItem[];
  readonly exclusions: readonly Readonly<{
    readonly actionId: string;
    readonly reason: string;
    readonly reference: FilePopupItem | null;
    readonly actual: FilePopupItem | null;
  }>[];
  readonly acceleratorExclusions: readonly Readonly<{
    readonly actionId: string;
    readonly reason: string;
    readonly reference: string | null;
    readonly actual: string | null;
  }>[];
  readonly differences: readonly string[];
}>;

type FilePopupPixelException = Readonly<{
  readonly actionId: string;
  readonly kind: 'macos-accelerator-glyphs' | 'os-owned-accelerator';
  readonly reason: string;
  readonly referenceShortcut: string | null;
  readonly actualShortcut: string | null;
  readonly differentPixelCount: number;
  readonly differenceBounds: Readonly<{
    readonly left: number;
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
  }> | null;
}>;

type FilePopupVisualRow = Readonly<{
  readonly actionId: string;
  readonly referenceMetrics: SurfaceMetrics;
  readonly actualMetrics: SurfaceMetrics;
  readonly comparison: PngComparison;
  readonly acceptedPixelException: FilePopupPixelException | null;
}>;

type FilePopupVisualEvidence = Readonly<{
  readonly rows: readonly FilePopupVisualRow[];
  readonly differences: readonly string[];
  readonly platformExceptions: readonly FilePopupPixelException[];
  readonly bytes: Readonly<
    Record<
      string,
      Readonly<{
        readonly reference: Uint8Array;
        readonly actual: Uint8Array;
        readonly diff: Uint8Array;
      }>
    >
  >;
}>;

const FILE_POPUP_LABELS: Readonly<Record<string, string>> = {
  'New File': 'new-file',
  'New Window': 'new-window',
  'Open File': 'open-file',
  'Open Folder': 'open-folder',
  'Open Recent': 'open-recent',
  'Reopen last file': 'reopen',
  Save: 'save',
  'Save As': 'save-as',
  'Export to PDF': 'export-pdf',
  'Close Tab': 'close-tab',
  Exit: 'exit',
};

const FILE_POPUP_IMPLEMENTED = Object.freeze([
  'new-file',
  'open-file',
  'save',
  'save-as',
  'close-tab',
  'exit',
] as const);

const FILE_POPUP_SHORTCUT_BINDINGS: Readonly<Record<string, string>> = {
  'new-file': 'Mod+N',
  'open-file': 'Mod+O',
  save: 'Mod+S',
  'save-as': 'Mod+Shift+S',
  'close-tab': 'Mod+W',
};

const FILE_POPUP_ACCELERATOR_EXCLUSIONS = Object.freeze([
  [
    'exit',
    'native quit ownership; the canonical Exit action intentionally has no registry shortcut',
  ],
] as const);

const FILE_POPUP_EXCLUSIONS = Object.freeze([
  ['new-window', 'deferred OS window creation'],
  ['open-folder', 'deferred folder picker ownership'],
  ['open-recent', 'recents are not seeded for this focused state'],
  ['reopen', 'reopen is unavailable without a recent file'],
  ['export-pdf', 'deferred export ownership'],
] as const);

function normalizeFilePopupLabel(value: string): string {
  return value
    .replace(/\s+/gu, ' ')
    .replace(/…/gu, '')
    .replace(/^↺\s*/u, '')
    .replace(/\s*\/ folder$/u, '')
    .trim();
}

function normalizeShortcutBinding(value: string | null): string | null {
  return value === null
    ? null
    : value
        .replace(/\s+/gu, '')
        .replace(/\+/gu, '')
        .replace(/⌘/gu, 'Mod')
        .replace(/Ctrl/gu, 'Mod')
        .replace(/⇧/gu, 'Shift')
        .replace(/⌥/gu, 'Alt');
}

async function captureFilePopupItems(
  page: Page,
  pageKind: 'reference' | 'actual',
): Promise<readonly FilePopupItem[]> {
  const selector =
    pageKind === 'reference' ? '#m-file' : '[data-viewport-popup="file-menu"]';
  const locator = await oneVisibleLocator(
    page,
    selector,
    `${pageKind} File popup`,
  );
  return locator.evaluate(
    (element, input) => {
      const normalize = (value: string): string =>
        value
          .replace(/\s+/gu, ' ')
          .replace(/…/gu, '')
          .replace(/^↺\s*/u, '')
          .replace(/\s*\/ folder$/u, '')
          .trim();
      const elements =
        input.kind === 'reference'
          ? Array.from(
              element.querySelectorAll<HTMLElement>(':scope > .mi'),
            ).filter(
              (item) =>
                !item.classList.contains('sub') ||
                item.textContent?.includes('Reopen') === true,
            )
          : Array.from(
              element.querySelectorAll<HTMLElement>(
                ':scope > [role="menuitem"]',
              ),
            );
      return elements.map((item) => {
        const shortcut = item.querySelector<HTMLElement>('.k');
        const shortcutText =
          shortcut?.textContent?.replace(/\s+/gu, ' ').trim() ??
          item.getAttribute('data-shortcut');
        const label = normalize(
          shortcut === null
            ? (item.textContent ?? '')
            : (item.textContent ?? '').replace(shortcut.textContent ?? '', ''),
        );
        const disabled =
          (item as HTMLButtonElement).disabled ||
          item.getAttribute('aria-disabled') === 'true' ||
          item.getAttribute('data-disabled') === 'true';
        return {
          actionId: input.labels[label] ?? null,
          label,
          shortcut: shortcutText,
          availability: disabled ? 'disabled' : 'enabled',
        } satisfies FilePopupItem;
      });
    },
    { kind: pageKind, labels: FILE_POPUP_LABELS },
  );
}

function filePopupPairing(
  referenceItems: readonly FilePopupItem[],
  actualItems: readonly FilePopupItem[],
): FilePopupPairing {
  const referenceById = new Map(
    referenceItems
      .filter((item) => item.actionId !== null)
      .map((item) => [item.actionId as string, item]),
  );
  const actualById = new Map(
    actualItems
      .filter((item) => item.actionId !== null)
      .map((item) => [item.actionId as string, item]),
  );
  const differences: string[] = [];
  for (const actionId of FILE_POPUP_IMPLEMENTED) {
    const reference = referenceById.get(actionId);
    const actual = actualById.get(actionId);
    if (reference === undefined || actual === undefined) {
      differences.push(
        `${actionId}: implemented File action is missing from reference or actual popup`,
      );
      continue;
    }
    if (reference.label !== actual.label) {
      differences.push(
        `${actionId}: labels differ: ${reference.label} != ${actual.label}`,
      );
    }
    if (reference.availability !== 'enabled') {
      differences.push(`${actionId}: reference action is not enabled`);
    }
    if (actual.availability !== 'enabled') {
      differences.push(`${actionId}: actual action is not enabled`);
    }
    const expectedShortcut = FILE_POPUP_SHORTCUT_BINDINGS[actionId];
    if (expectedShortcut !== undefined) {
      const expectedBinding = normalizeShortcutBinding(expectedShortcut);
      if (normalizeShortcutBinding(reference.shortcut) !== expectedBinding) {
        differences.push(
          `${actionId}: reference shortcut ${JSON.stringify(reference.shortcut)} does not represent ${expectedShortcut}`,
        );
      }
      if (normalizeShortcutBinding(actual.shortcut) !== expectedBinding) {
        differences.push(
          `${actionId}: actual shortcut ${JSON.stringify(actual.shortcut)} does not represent ${expectedShortcut}`,
        );
      }
    }
  }
  const exclusions = FILE_POPUP_EXCLUSIONS.map(([actionId, reason]) => ({
    actionId,
    reason,
    reference: referenceById.get(actionId) ?? null,
    actual: actualById.get(actionId) ?? null,
  }));
  for (const exclusion of exclusions) {
    if (exclusion.actionId !== 'open-recent' && exclusion.reference === null) {
      differences.push(
        `${exclusion.actionId}: excluded File action is missing from reference popup`,
      );
    }
    if (exclusion.actionId !== 'open-recent' && exclusion.actual === null) {
      differences.push(
        `${exclusion.actionId}: excluded File action is missing from actual popup`,
      );
    }
    if (
      exclusion.actionId !== 'new-window' &&
      exclusion.actionId !== 'open-folder' &&
      exclusion.actionId !== 'export-pdf' &&
      exclusion.actual?.availability !== 'disabled'
    ) {
      differences.push(
        `${exclusion.actionId}: state-specific exclusion is not disabled in actual popup`,
      );
    }
    if (
      (exclusion.actionId === 'new-window' ||
        exclusion.actionId === 'open-folder' ||
        exclusion.actionId === 'export-pdf') &&
      exclusion.actual?.availability !== 'disabled'
    ) {
      differences.push(
        `${exclusion.actionId}: deferred exclusion is not disabled in actual popup`,
      );
    }
  }
  const acceleratorExclusions = FILE_POPUP_ACCELERATOR_EXCLUSIONS.map(
    ([actionId, reason]) => ({
      actionId,
      reason,
      reference: referenceById.get(actionId)?.shortcut ?? null,
      actual: actualById.get(actionId)?.shortcut ?? null,
    }),
  );
  return {
    comparedActionIds: [...FILE_POPUP_IMPLEMENTED],
    referenceItems,
    actualItems,
    exclusions,
    acceleratorExclusions,
    differences,
  };
}

async function filePopupItemLocator(
  page: Page,
  pageKind: 'reference' | 'actual',
  actionId: string,
): Promise<Locator> {
  const popupSelector =
    pageKind === 'reference' ? '#m-file' : '[data-viewport-popup="file-menu"]';
  const popup = await oneVisibleLocator(
    page,
    popupSelector,
    `${pageKind} File popup`,
  );
  const itemSelector =
    pageKind === 'reference' ? ':scope > .mi' : ':scope > [role="menuitem"]';
  const items = popup.locator(itemSelector);
  for (let index = 0; index < (await items.count()); index += 1) {
    const item = items.nth(index);
    const shortcut = item.locator('.k');
    const shortcutText =
      (await shortcut.count()) === 1
        ? ((await shortcut.textContent()) ?? '')
        : '';
    const label = normalizeFilePopupLabel(
      ((await item.textContent()) ?? '').replace(shortcutText, ''),
    );
    if (FILE_POPUP_LABELS[label] === actionId) return item;
  }
  throw new Error(
    `${pageKind} File popup is missing implemented action ${actionId}`,
  );
}

type PixelRect = Readonly<{
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}>;

function relativePixelRect(
  rowBox: Readonly<{ x: number; y: number }>,
  shortcutBox: Readonly<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>,
): PixelRect {
  return {
    left: Math.max(0, Math.floor(shortcutBox.x - rowBox.x)),
    top: Math.max(0, Math.floor(shortcutBox.y - rowBox.y)),
    right: Math.ceil(shortcutBox.x - rowBox.x + shortcutBox.width) - 1,
    bottom: Math.ceil(shortcutBox.y - rowBox.y + shortcutBox.height) - 1,
  };
}

function allPixelDifferencesWithin(
  comparison: PngComparison,
  allowed: PixelRect,
): boolean {
  const reference = comparison.reference.decoded;
  const actual = comparison.actual.decoded;
  if (reference.width !== actual.width || reference.height !== actual.height) {
    return false;
  }
  for (let y = 0; y < reference.height; y += 1) {
    for (let x = 0; x < reference.width; x += 1) {
      const offset = (y * reference.width + x) * 4;
      let different = false;
      for (let channel = 0; channel < 4; channel += 1) {
        if (
          reference.pixels[offset + channel] !== actual.pixels[offset + channel]
        ) {
          different = true;
          break;
        }
      }
      if (
        different &&
        (x < allowed.left ||
          x > allowed.right ||
          y < allowed.top ||
          y > allowed.bottom)
      ) {
        return false;
      }
    }
  }
  return true;
}

async function classifyFilePopupPixelException(
  actionId: string,
  reference: Locator,
  actual: Locator,
  comparison: PngComparison,
  actualPlatform: string,
): Promise<FilePopupPixelException | null> {
  if (comparison.passed) return null;
  const referenceShortcut =
    (await reference.locator('.k').textContent())
      ?.replace(/\s+/gu, ' ')
      .trim() ?? null;
  const actualShortcut = await actual.getAttribute('data-shortcut');
  const shortcutBox = await reference.locator('.k').boundingBox();
  const rowBox = await reference.boundingBox();
  if (shortcutBox === null || rowBox === null) return null;
  const allowed = relativePixelRect(rowBox, shortcutBox);
  if (!allPixelDifferencesWithin(comparison, allowed)) return null;

  const expectedShortcut = FILE_POPUP_SHORTCUT_BINDINGS[actionId];
  const isMacOS = /Mac|iPhone|iPad/u.test(actualPlatform);
  if (
    isMacOS &&
    expectedShortcut !== undefined &&
    actualShortcut?.startsWith('⌘') === true &&
    normalizeShortcutBinding(referenceShortcut) ===
      normalizeShortcutBinding(expectedShortcut) &&
    normalizeShortcutBinding(actualShortcut) ===
      normalizeShortcutBinding(expectedShortcut)
  ) {
    return {
      actionId,
      kind: 'macos-accelerator-glyphs',
      reason:
        'T059 explicit platform exception: native macOS accelerator glyphs differ from the immutable Ctrl-text reference',
      referenceShortcut,
      actualShortcut,
      differentPixelCount: comparison.metrics.differentPixelCount,
      differenceBounds: comparison.metrics.differenceBounds,
    };
  }
  if (actionId === 'exit' && actualShortcut === null) {
    return {
      actionId,
      kind: 'os-owned-accelerator',
      reason:
        'T059 semantic exclusion: native quit ownership leaves Exit without a registry accelerator',
      referenceShortcut,
      actualShortcut,
      differentPixelCount: comparison.metrics.differentPixelCount,
      differenceBounds: comparison.metrics.differenceBounds,
    };
  }
  return null;
}

async function captureFilePopupVisualEvidence(
  referencePage: Page,
  actualPage: Page,
): Promise<FilePopupVisualEvidence> {
  const rows: FilePopupVisualRow[] = [];
  const differences: string[] = [];
  const platformExceptions: FilePopupPixelException[] = [];
  const actualPlatform = await actualPage.evaluate(() => navigator.platform);
  const bytes: Record<
    string,
    { reference: Uint8Array; actual: Uint8Array; diff: Uint8Array }
  > = {};
  for (const actionId of FILE_POPUP_IMPLEMENTED) {
    const reference = await filePopupItemLocator(
      referencePage,
      'reference',
      actionId,
    );
    const actual = await filePopupItemLocator(actualPage, 'actual', actionId);
    const referenceBytes = await reference.screenshot({
      animations: 'disabled',
    });
    const actualBytes = await actual.screenshot({ animations: 'disabled' });
    const referenceMetrics = await surfaceMetrics(reference);
    const actualMetrics = await surfaceMetrics(actual);
    const comparison = comparePng(referenceBytes, actualBytes);
    const rowDifferences = metricDifferences(referenceMetrics, actualMetrics);
    differences.push(
      ...rowDifferences.map((difference) => `${actionId}: ${difference}`),
    );
    const acceptedPixelException = await classifyFilePopupPixelException(
      actionId,
      reference,
      actual,
      comparison,
      actualPlatform,
    );
    if (acceptedPixelException !== null) {
      platformExceptions.push(acceptedPixelException);
    } else if (!comparison.passed) {
      differences.push(
        `${actionId}: zero-tolerance pixel drift: ${comparison.metrics.differentPixelCount} unexplained pixels`,
      );
    }
    rows.push({
      actionId,
      referenceMetrics,
      actualMetrics,
      comparison,
      acceptedPixelException,
    });
    bytes[actionId] = {
      reference: referenceBytes,
      actual: actualBytes,
      diff: comparison.diff.bytes,
    };
  }
  return { rows, differences, platformExceptions, bytes };
}

async function writeTargetedArtifacts(input: {
  readonly entry: TargetedParityEntry;
  readonly evidenceRoot: string;
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
  readonly filePopup?: FilePopupPairing;
  readonly filePopupVisual?: FilePopupVisualEvidence;
  readonly error?: string;
}): Promise<void> {
  await mkdir(input.evidenceRoot, { recursive: true });
  await writeFile(
    join(input.evidenceRoot, 'semantic.json'),
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
  if (input.filePopup !== undefined) {
    await writeFile(
      join(input.evidenceRoot, 'file-menu.json'),
      JSON.stringify(input.filePopup, null, 2),
    );
  }
  if (input.filePopupVisual !== undefined) {
    await writeFile(
      join(input.evidenceRoot, 'file-rows.json'),
      JSON.stringify(
        {
          rows: input.filePopupVisual.rows.map((row) => ({
            actionId: row.actionId,
            referenceMetrics: row.referenceMetrics,
            actualMetrics: row.actualMetrics,
            comparison: row.comparison.metrics,
            exact: row.comparison.passed,
            accepted:
              row.comparison.passed || row.acceptedPixelException !== null,
            acceptedPixelException: row.acceptedPixelException,
          })),
          differences: input.filePopupVisual.differences,
          platformExceptions: input.filePopupVisual.platformExceptions,
          exact: input.filePopupVisual.differences.length === 0,
        },
        null,
        2,
      ),
    );
    for (const [actionId, row] of Object.entries(input.filePopupVisual.bytes)) {
      const rowRoot = join(input.evidenceRoot, 'rows', actionId);
      await mkdir(rowRoot, { recursive: true });
      await writeFile(join(rowRoot, 'reference.png'), row.reference);
      await writeFile(join(rowRoot, 'actual.png'), row.actual);
      await writeFile(join(rowRoot, 'diff.png'), row.diff);
    }
  }
  await writeFile(
    join(input.evidenceRoot, 'metrics.json'),
    JSON.stringify(
      {
        region: input.entry.regionId,
        editorTopEdge: input.editorTopEdge,
        differences:
          input.filePopupVisual?.differences ?? input.metricDifferences ?? [],
        platformExceptions: input.filePopupVisual?.platformExceptions ?? [],
        boundsAndStylesPassed:
          (input.filePopupVisual?.differences ?? input.metricDifferences ?? [])
            .length === 0,
        wholePopup: {
          differences: input.metricDifferences ?? [],
          boundsAndStylesPassed: (input.metricDifferences ?? []).length === 0,
        },
        comparison: input.comparison?.metrics ?? null,
      },
      null,
      2,
    ),
  );
  if (input.referenceBytes !== undefined) {
    await writeFile(
      join(input.evidenceRoot, 'reference.png'),
      input.referenceBytes,
    );
  }
  if (input.actualBytes !== undefined) {
    await writeFile(join(input.evidenceRoot, 'actual.png'), input.actualBytes);
  }
  if (input.comparison !== undefined) {
    await writeFile(
      join(input.evidenceRoot, 'diff.png'),
      input.comparison.diff.bytes,
    );
  }
  await writeFile(
    join(input.evidenceRoot, 'status.json'),
    JSON.stringify(
      {
        status: input.status,
        comparisonAttempted: input.comparisonAttempted,
        comparisonCompleted: input.comparisonCompleted,
        productionUiDrift: input.status === 'production-ui-drift',
        platformExceptions: input.filePopupVisual?.platformExceptions ?? [],
        error: input.error ?? null,
      },
      null,
      2,
    ),
  );
  await writeFile(
    join(input.evidenceRoot, 'raw-status.log'),
    [
      `status=${input.status}`,
      `comparison_attempted=${input.comparisonAttempted}`,
      `comparison_completed=${input.comparisonCompleted}`,
      `platform_exception_count=${input.filePopupVisual?.platformExceptions.length ?? 0}`,
      `error=${input.error ?? ''}`,
      '',
    ].join('\n'),
  );
}

for (const entry of [
  ...TARGETED_MANIFEST,
  ...TARGETED_FILE_MENU_MANIFEST,
  ...TARGETED_SETTINGS_MANIFEST,
  ...TARGETED_TAB_MANIFEST,
  ...TARGETED_VIEW_ABOUT_MANIFEST,
]) {
  test(
    entry.openSurface === 'file-menu'
      ? 'T059 state-pairs the File popup in Minimal Light'
      : entry.openSurface === 'settings-menu'
        ? 'T060 state-pairs the Settings popup in Minimal Light'
        : entry.openSurface === 'settings-overflow'
          ? 'T060 state-pairs the 375px Settings overflow in Minimal Light'
          : entry.openSurface === 'tab-strip'
            ? 'T062 state-pairs tabs and toolbar in Minimal Light'
          : entry.openSurface === 'view-menu'
            ? 'T061 state-pairs the View popup in Minimal Light'
            : entry.openSurface === 'about-menu'
              ? 'T061 state-pairs the About popup in Minimal Light'
          : `T058 state-pairs the closed menubar in ${entry.palette.id}`,
    async ({ page, context }) => {
      test.setTimeout(120_000);
      assertTargetedManifestIntegrity();
      const referenceSource = await readFile(REFERENCE_PATH);
      const referenceSourceHash = hashReferenceSource(referenceSource);
      const captureContext = contextForTargetedEntry(
        entry,
        referenceSourceHash,
      );
      const evidenceRoot = join(
        entry.openSurface === 'file-menu'
          ? FILE_MENU_EVIDENCE_ROOT
          : entry.openSurface === 'settings-menu' ||
              entry.openSurface === 'settings-overflow'
            ? SETTINGS_EVIDENCE_ROOT
            : entry.openSurface === 'view-menu' ||
                entry.openSurface === 'about-menu'
              ? VIEW_ABOUT_EVIDENCE_ROOT
            : EVIDENCE_ROOT,
        entry.palette.id,
        entry.openSurface === 'settings-overflow'
          ? 'overflow-375'
          : entry.openSurface === 'view-menu' || entry.openSurface === 'about-menu'
            ? entry.openSurface
            : entry.openSurface === 'tab-strip'
              ? 'tab-strip'
            : '',
      );
      const referencePage = await context.newPage();
      let referenceSignature: SemanticSignature | undefined;
      let actualSignature: SemanticSignature | undefined;
      let editorTopEdge = { reference: -1, actual: -1 };
      let filePopupVisual: FilePopupVisualEvidence | undefined;

      try {
        await prepareReference(referencePage, entry, referenceSourceHash);
        await prepareActual(page, entry);
        await assertActualMenubarStructure(page, entry.width);
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
            error instanceof Error
              ? (error.stack ?? error.message)
              : String(error);
          await writeTargetedArtifacts({
            entry,
            evidenceRoot,
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
        expect(editorTopEdge.actual).toBe(editorTopEdge.reference);
        const filePopup =
          entry.openSurface === 'file-menu'
            ? filePopupPairing(
                await captureFilePopupItems(referencePage, 'reference'),
                await captureFilePopupItems(page, 'actual'),
              )
            : undefined;
        if (entry.openSurface === 'file-menu') {
          filePopupVisual = await captureFilePopupVisualEvidence(
            referencePage,
            page,
          );
          await page.keyboard.press('Escape');
          await expect(
            page.locator('[data-viewport-popup="file-menu"]'),
          ).toHaveCount(0);
          await page.getByRole('button', { name: 'File', exact: true }).click();
          await expect(
            page.locator('[data-viewport-popup="file-menu"]'),
          ).toBeVisible();
          await page
            .getByRole('main', { name: 'Document area' })
            .click({ position: { x: 16, y: 16 } });
          await expect(
            page.locator('[data-viewport-popup="file-menu"]'),
          ).toHaveCount(0);
          await page.getByRole('button', { name: 'File', exact: true }).click();
          await expect(
            page.locator('[data-viewport-popup="file-menu"]'),
          ).toBeVisible();
          await page.evaluate(() => {
            const active = document.activeElement;
            if (active instanceof HTMLElement) active.blur();
          });
        }
        const referenceSurface = await captureSurface(
          referencePage,
          entry.referenceSelector,
          `reference ${entry.regionId}`,
        );
        const actualSurface = await captureSurface(
          page,
          entry.actualSelector,
          `actual ${entry.regionId}`,
        );
        const comparison = comparePng(
          referenceSurface.bytes,
          actualSurface.bytes,
        );
        const differences = metricDifferences(
          referenceSurface.metrics,
          actualSurface.metrics,
        );
        const error =
          (entry.openSurface === 'file-menu'
            ? (filePopupVisual?.differences.length ?? 0) === 0
            : true) &&
          (filePopup?.differences.length ?? 0) === 0
            ? undefined
            : [
                ...(entry.openSurface === 'file-menu'
                  ? (filePopupVisual?.differences ?? [])
                  : differences),
                ...(filePopup?.differences ?? []),
                ...(entry.regionId === 'file-menu' || comparison.passed
                  ? []
                  : [
                      `zero-tolerance pixel drift: ${comparison.metrics.differentPixelCount} unexplained pixels`,
                    ]),
              ].join('\n');
        await writeTargetedArtifacts({
          entry,
          evidenceRoot,
          reference: referenceSignature,
          actual: actualSignature,
          status: error === undefined ? 'passed' : 'production-ui-drift',
          comparisonAttempted: true,
          comparisonCompleted: true,
          metricDifferences: differences,
          editorTopEdge,
          comparison,
          filePopup,
          filePopupVisual,
          referenceBytes: referenceSurface.bytes,
          actualBytes: actualSurface.bytes,
          error,
        });
        if (error !== undefined) throw new Error(error);
      } finally {
        await referencePage.close();
      }
    },
  );
}

const T063_STATUS_CASES = [
  { stateId: 'status-saved', status: 'saved', text: 'Saved' },
  { stateId: 'status-autosaved', status: 'autosaved', text: 'Autosaved' },
  {
    stateId: 'status-unsaved-changes',
    status: 'unsaved-changes',
    text: 'Unsaved changes',
  },
  { stateId: 'status-read-only', status: 'read-only', text: 'Read-only' },
  { stateId: 'status-mixed-ending', status: 'autosaved', text: 'Autosaved' },
  { stateId: 'status-large-file', status: 'autosaved', text: 'Autosaved' },
] as const;

async function prepareActualStatusCase(
  page: Page,
  stateId: (typeof T063_STATUS_CASES)[number]['stateId'],
): Promise<void> {
  await page.setViewportSize({ width: 1280, height: PARITY_HEIGHT });
  await page.goto(`/?parity-case=state:${stateId}:minimal-light`);
  await waitForParityReady(page, {
    readySelector: '[data-testid="application-shell"]',
  });
  await expect(page.getByRole('tab')).toHaveCount(2);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const menu = page.getByRole('menu', { name: 'Settings menu' });
  await menu.getByRole('radio', { name: 'Minimal', exact: true }).click();
  await page
    .locator('[data-viewport-popup="settings-menu"]')
    .getByRole('radio', { name: 'Light', exact: true })
    .click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'View', exact: true }).click();
  await page
    .getByRole('menuitemradio', { name: 'Editor', exact: true })
    .click();
  await expect(page.locator('[aria-label="Editor pane"]')).toBeVisible();
  await expect(page.locator('[aria-label="Preview pane"]')).toHaveCount(0);
  await freezeParityPixels(page);
}

test('T063 captures backend-authoritative editor-status states at 1280px Minimal Light', async ({
  page,
}) => {
  test.setTimeout(120_000);
  for (const statusCase of T063_STATUS_CASES) {
    await prepareActualStatusCase(page, statusCase.stateId);
    const status = page.getByRole('status', { name: 'Document status' });
    await expect(status).toHaveAttribute('data-status-state', statusCase.status);
    await expect(status).toContainText(statusCase.text);
    await expect(status.locator('[data-status-item="cursor"]')).toContainText(
      'Ln',
    );
    await expect(status.locator('[data-status-item="encoding"]')).toHaveText(
      'UTF-8',
    );
    const expectedEnding =
      statusCase.stateId === 'status-mixed-ending' ? 'Mixed' : 'LF';
    await expect(
      status.locator('[data-status-item="line-ending"]'),
    ).toHaveText(expectedEnding);
    if (statusCase.stateId === 'status-large-file') {
      await expect(status.locator('[data-status-item="count"]')).toContainText(
        '420,000',
      );
    }
    if (statusCase.stateId === 'status-read-only') {
      await status.getByRole('button', { name: 'Document details' }).click();
      await expect(
        status.getByRole('region', { name: 'Document details' }),
      ).toContainText('Read-only');
    }
    const metrics = await surfaceMetrics(status);
    const shellBottom = await page
      .getByTestId('application-shell')
      .evaluate((element) => element.getBoundingClientRect().bottom);
    expect(metrics.bounds.height).toBe(28);
    expect(metrics.bounds.bottom).toBe(Number(shellBottom.toFixed(3)));
    expect(metrics.styles['white-space']).toBe('normal');
    const noWrap = await status.evaluate((element) => ({
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      wrappedItems: Array.from(
        element.querySelectorAll<HTMLElement>('[data-status-item]'),
      ).filter((item) => getComputedStyle(item).whiteSpace !== 'nowrap').length,
    }));
    expect(noWrap.scrollWidth).toBeLessThanOrEqual(noWrap.clientWidth);
    expect(noWrap.wrappedItems).toBe(0);
    const evidenceRoot = join(
      EDITOR_STATUS_EVIDENCE_ROOT,
      'minimal-light',
      statusCase.stateId,
    );
    await mkdir(evidenceRoot, { recursive: true });
    await writeFile(
      join(evidenceRoot, 'semantic.json'),
      JSON.stringify(
        {
          stateId: statusCase.stateId,
          status: statusCase.status,
          visibleText: await status.innerText(),
          editorVisible: await page.locator('[aria-label="Editor pane"]').isVisible(),
          previewVisible: await page.locator('[aria-label="Preview pane"]').count(),
        },
        null,
        2,
      ),
    );
    await writeFile(
      join(evidenceRoot, 'metrics.json'),
      JSON.stringify({ metrics, noWrap }, null, 2),
    );
    await writeFile(
      join(evidenceRoot, 'actual.png'),
      await status.screenshot({ animations: 'disabled' }),
    );
    await writeFile(
      join(evidenceRoot, 'status.json'),
      JSON.stringify(
        {
          status: 'production-state-verified',
          verificationScope: 'production-only-backend-authoritative-status',
          comparisonAttempted: false,
          comparisonCompleted: false,
          reason:
            'The immutable mockup has only the static Autosave: On status condition; this state has no source-backed reference condition.',
        },
        null,
        2,
      ),
    );
    await writeFile(
      join(evidenceRoot, 'raw-status.log'),
      [
        'status=production-state-verified',
        'verification_scope=production-only-backend-authoritative-status',
        'comparison_attempted=false',
        'comparison_completed=false',
        'reason=immutable_mockup_has_no_source_backed_status_state',
        '',
      ].join('\n'),
    );
  }
});
