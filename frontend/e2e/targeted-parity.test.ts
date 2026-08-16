import { PARITY_REPETITION_COUNT } from './parity/accounting';
import { recordParityCapture } from './parity/accounting-io';
import { attributeDifferences } from './parity/attributed';
import { attributedResidualsFor } from './parity/attributed-residuals';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

import { expect, test, type Locator, type Page } from '@playwright/test';

import { comparePng, type PngComparison } from './parity/comparator';
import { expectPainted } from './painted';
import {
  adaptReferenceHtml,
  REFERENCE_ZERO_ASSISTANT_CLASS,
  type FileMenuReferencePlatform,
} from './parity/reference-adapter';
import {
  assertSameOrigin,
  captureWhenStable,
  freezeParityPixels,
  readParityScroll,
  restoreParityScroll,
  waitForParityReady,
  type ParityScrollOffset,
} from './parity/readiness';
import {
  captureSemanticSignature,
  assertSemanticPairing,
  SemanticPairingMismatchError,
  statusItemSelector,
  type SemanticSignature,
} from './parity/state-contract';
import {
  BEHAVIOUR_VERIFIED_STATE_IDS,
  PARITY_PALETTES,
  type ParityPalette,
} from './parity/manifest';
import {
  hashReferenceSource,
  referenceNavigationUrl,
} from './parity/reference-server';
import {
  assertTargetedManifestIntegrity,
  contextForTargetedEntry,
  TARGETED_FILE_MENU_MANIFEST,
  TARGETED_MANIFEST,
  TARGETED_PREVIEW_MANIFEST,
  TARGETED_SETTINGS_MANIFEST,
  TARGETED_TAB_MANIFEST,
  TARGETED_TOOLBAR_MANIFEST,
  TARGETED_VIEW_ABOUT_MANIFEST,
  type TargetedParityEntry,
} from './targeted-manifest';

test.describe.configure({ mode: 'serial' });

const REFERENCE_ORIGIN =
  process.env.PARITY_REFERENCE_ORIGIN ?? 'http://127.0.0.1:4174';
const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/**
 * The Feature 003 File-menu reference variant expresses this feature's own
 * accelerators, so it must be built for the host the application is running on.
 * The browser and the test share that host.
 */
const REFERENCE_FILE_MENU_PLATFORM: FileMenuReferencePlatform =
  process.platform === 'darwin' ? 'darwin' : 'other';
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
const PREVIEW_EVIDENCE_ROOT = resolve(
  REPOSITORY_ROOT,
  '../specs/003-real-files-and-tabs/evidence/ft-vs-08/parity/targeted/preview',
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
      undefined,
      entry.referenceVariant === 'file-menu'
        ? REFERENCE_FILE_MENU_PLATFORM
        : undefined,
    ),
  );
  await waitForParityReady(page);
  await prepareReferenceHarness(page);
  /*
   * Freeze before driving any harness switch, not after. The binding animates
   * `.sidebar` and `.assistant` width over `--dur-slow` (300ms, mockup.html
   * :254 and :337), so a width or screen click starts a transition that the
   * later freeze can only snap mid-flight. Freezing first means no transition
   * ever starts, so no capture can read a partially advanced width.
   */
  await freezeParityPixels(page);
  await assertSameOrigin(page, REFERENCE_ORIGIN);
  expect(response?.headers()['x-reference-source-sha256']).toBe(sourceHash);
  expect(response?.headers()['x-reference-variant']).toBe(
    entry.referenceVariant,
  );
  const source = await readFile(REFERENCE_PATH);
  expect(
    adaptReferenceHtml(
      source.toString('utf8'),
      entry.referenceVariant,
      undefined,
      entry.referenceVariant === 'file-menu'
        ? REFERENCE_FILE_MENU_PLATFORM
        : undefined,
    ).sourceHash,
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
    await expect(
      page.locator('[data-viewport-popup="view-menu"]'),
    ).toBeVisible();
    await page.evaluate(() => {
      const active = document.activeElement;
      if (active instanceof HTMLElement) active.blur();
    });
  } else if (entry.openSurface === 'about-menu') {
    await page.getByRole('button', { name: 'About', exact: true }).click();
    await expect(
      page.locator('[data-viewport-popup="about-menu"]'),
    ).toBeVisible();
    await page.evaluate(() => {
      const active = document.activeElement;
      if (active instanceof HTMLElement) active.blur();
    });
  } else if (entry.openSurface === 'preview-paused') {
    await page.getByRole('button', { name: 'View', exact: true }).click();
    await expect(
      page.getByRole('menuitemradio', { name: 'Split', exact: true }),
    ).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Escape');
    await expect(
      page.locator('[data-preview-paused-bar="true"]'),
    ).toBeVisible();
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
  /*
   * Capture only once the region has stopped changing. These slices are chrome
   * popups and have been stable in practice, unlike the editor-backed regions
   * in the unrestricted runner where 31% of captures hashed differently across
   * repetitions — but "stable in practice" is not a guarantee, and settling
   * first costs a hash. See `captureWhenStable` for the measurement behind it.
   */
  const stable = await captureWhenStable(locator);
  return {
    bytes: stable.buffer,
    metrics: await surfaceMetrics(locator),
  };
}

/**
 * FR-FT-052 requires every popup to stay "at least 8 logical pixels inside the
 * viewport". The viewport that governs a popup here is the **application
 * frame**, not the browser window: popups portal into `.application-frame`, so
 * they share its containing block, and the parity harness draws that frame
 * inset inside a taller page. Clamping against `window.innerHeight` instead
 * fires at the 720px parity height — where the frame is only 619px — and
 * creates a scroll container that costs ~332 antialiasing pixels against the
 * immutable reference.
 */
const POPUP_VIEWPORT_INSET = 8;

const POPUP_SURFACES = new Set([
  'file-menu',
  'settings-menu',
  'settings-overflow',
  'view-menu',
  'about-menu',
]);

async function assertPopupStaysInsideTheApplicationFrame(
  page: Page,
  selector: string,
  regionId: string,
): Promise<void> {
  const measured = await page.evaluate(
    ({ popupSelector }) => {
      const frame = document.querySelector('.application-frame');
      const popup = document.querySelector(popupSelector);
      if (frame === null || popup === null) return null;
      const frameBox = frame.getBoundingClientRect();
      const popupBox = popup.getBoundingClientRect();
      return {
        left: popupBox.left - frameBox.left,
        top: popupBox.top - frameBox.top,
        right: frameBox.right - popupBox.right,
        bottom: frameBox.bottom - popupBox.bottom,
        frame: { width: frameBox.width, height: frameBox.height },
        popup: { width: popupBox.width, height: popupBox.height },
      };
    },
    { popupSelector: selector },
  );
  expect(
    measured,
    `${regionId}: could not measure ${selector} against .application-frame`,
  ).not.toBeNull();
  if (measured === null) return;
  for (const edge of ['left', 'top', 'right', 'bottom'] as const) {
    expect(
      measured[edge],
      `FR-FT-052: the ${regionId} popup is ${measured[edge].toFixed(2)} logical pixels ` +
        `from the application frame's ${edge} edge, which is less than the required ` +
        `${POPUP_VIEWPORT_INSET}. Frame ${measured.frame.width}x${measured.frame.height}, ` +
        `popup ${measured.popup.width}x${measured.popup.height}.`,
    ).toBeGreaterThanOrEqual(POPUP_VIEWPORT_INSET);
  }
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

type FilePopupVisualRow = Readonly<{
  readonly actionId: string;
  readonly referenceMetrics: SurfaceMetrics;
  readonly actualMetrics: SurfaceMetrics;
  readonly comparison: PngComparison;
}>;

type FilePopupVisualEvidence = Readonly<{
  readonly rows: readonly FilePopupVisualRow[];
  readonly differences: readonly string[];
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
  ['reopen', 'reopen is unavailable without a recent file'],
  ['export-pdf', 'deferred export ownership'],
] as const);

/*
 * The binding File menu has no separate Open Recent trigger: the group label
 * heads one indented row per recent file. These rows are part of the compared
 * popup, so they are paired by ordered label and availability rather than by
 * action id.
 */
const FILE_POPUP_RECENT_LABELS = Object.freeze([
  'release-notes.md',
  'spec-draft.md',
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
          ? Array.from(element.querySelectorAll<HTMLElement>(':scope > .mi'))
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
  const referenceRows = referenceItems.map(
    (item) => `${item.label}|${item.availability}`,
  );
  const actualRows = actualItems.map(
    (item) => `${item.label}|${item.availability}`,
  );
  if (referenceRows.join(' / ') !== actualRows.join(' / ')) {
    differences.push(
      `File popup row inventory differs:\n  reference: ${referenceRows.join(' / ')}\n  actual:    ${actualRows.join(' / ')}`,
    );
  }
  for (const [side, items] of [
    ['reference', referenceItems],
    ['actual', actualItems],
  ] as const) {
    const recents = items
      .filter((item) => item.actionId === null)
      .map((item) => item.label);
    if (recents.join(' / ') !== FILE_POPUP_RECENT_LABELS.join(' / ')) {
      differences.push(
        `${side} recent rows are ${JSON.stringify(recents)}, expected ${JSON.stringify(FILE_POPUP_RECENT_LABELS)}`,
      );
    }
  }
  const exclusions = FILE_POPUP_EXCLUSIONS.map(([actionId, reason]) => ({
    actionId,
    reason,
    reference: referenceById.get(actionId) ?? null,
    actual: actualById.get(actionId) ?? null,
  }));
  for (const exclusion of exclusions) {
    if (exclusion.reference === null) {
      differences.push(
        `${exclusion.actionId}: excluded File action is missing from reference popup`,
      );
    }
    if (exclusion.actual === null) {
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

async function captureFilePopupVisualEvidence(
  referencePage: Page,
  actualPage: Page,
): Promise<FilePopupVisualEvidence> {
  const rows: FilePopupVisualRow[] = [];
  const differences: string[] = [];
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
    /*
     * T127: every row fails closed on pixels. There is no longer a reviewed
     * accelerator exception, because the reference variant now carries Feature
     * 003's own host-formatted accelerators for New File, Open File, Save and
     * Save As, exactly as it already did for Close Tab.
     */
    if (!comparison.passed) {
      differences.push(
        `${actionId}: zero-tolerance pixel drift: ${comparison.metrics.differentPixelCount} unexplained pixels`,
      );
    }
    rows.push({
      actionId,
      referenceMetrics,
      actualMetrics,
      comparison,
    });
    bytes[actionId] = {
      reference: referenceBytes,
      actual: actualBytes,
      diff: comparison.diff.bytes,
    };
  }
  return { rows, differences, bytes };
}

async function writeTargetedArtifacts(input: {
  readonly entry: TargetedParityEntry;
  readonly repetition: number;
  readonly evidenceRoot: string;
  readonly reference: SemanticSignature;
  readonly actual: SemanticSignature;
  /*
   * Whether the comparison ran is read off this discriminant and nothing else.
   * `pairing-mismatch` is the one value that means it did not; FR-FT-056, as
   * strengthened by spec.md Session 2026-08-14, forbids a separate
   * "comparison not attempted" field outright, because such a field can sit in
   * an artifact that otherwise looks like a result.
   */
  readonly status: TargetedStatus;
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
        status: input.status,
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
          })),
          differences: input.filePopupVisual.differences,
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
        comparisonCompleted: input.comparisonCompleted,
        productionUiDrift: input.status === 'production-ui-drift',
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
      `comparison_completed=${input.comparisonCompleted}`,
      `error=${input.error ?? ''}`,
      '',
    ].join('\n'),
  );
  /*
   * T054's per-key accounting. Both signatures were read before this point on
   * either path, so reference and actual were ready; what differs is whether the
   * comparison then ran. A pairing mismatch is `unresolved`, not `failed` — the
   * comparison never happened, and recording it as a failure would claim a
   * measurement that was never taken.
   */
  await recordParityCapture({
    manifestKey: input.entry.key,
    repetition: input.repetition,
    referenceReady: true,
    actualReady: true,
    comparisonCompleted: input.comparisonCompleted,
    status:
      input.status === 'passed'
        ? 'passed'
        : input.comparisonCompleted
          ? 'failed'
          : 'unresolved',
  });
}

// Proves: FR-FT-045
// Proves: FR-FT-052 — exact bounds and every compared computed style before pixels,
//   and the 8-logical-pixel viewport inset for every popup surface
// Proves: FR-FT-054 (partial — the harness holds the deterministic conditions and each
//   case captures only when settled; the three-consecutive-identical-hash rule and the
//   frozen-caret condition are asserted by e2e/parity/readiness.test.ts, and
//   device-pixel-ratio 1 by the `deviceScaleFactor: 1` assertion below)
for (const entry of [
  ...TARGETED_MANIFEST,
  ...TARGETED_FILE_MENU_MANIFEST,
  ...TARGETED_SETTINGS_MANIFEST,
  ...TARGETED_TAB_MANIFEST,
  ...TARGETED_TOOLBAR_MANIFEST,
  ...TARGETED_VIEW_ABOUT_MANIFEST,
  ...TARGETED_PREVIEW_MANIFEST,
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
            : entry.openSurface === 'toolbar'
              ? 'T077 state-pairs the document toolbar in Minimal Light'
              : entry.openSurface === 'view-menu'
                ? 'T061 state-pairs the View popup in Minimal Light'
                : entry.openSurface === 'about-menu'
                  ? 'T061 state-pairs the About popup in Minimal Light'
                  : entry.openSurface === 'preview-paused'
                    ? 'T064 state-pairs the paused preview in Minimal Light'
                    : `T058 state-pairs the closed menubar in ${entry.palette.id}`,
    async ({ page, context }, testInfo) => {
      test.setTimeout(120_000);
      assertTargetedManifestIntegrity();
      /*
       * The authoritative check that the accounting's planned set matches what
       * Playwright is actually running. `testInfo.project.repeatEach` is the
       * resolved value, not what the config file happens to say, so a `--repeat-each`
       * override or a renamed project fails here rather than silently producing a
       * report whose planned total no longer means anything.
       */
      expect(testInfo.project.repeatEach).toBe(PARITY_REPETITION_COUNT);
      /*
       * FR-FT-054 names device-pixel ratio 1 among the conditions a capture
       * must hold fixed. `playwright.config.ts` sets `deviceScaleFactor: 1`,
       * and every case ran under it without anything asserting it — a config
       * edit or a project-level `use` override would have silently doubled the
       * raster of both pages and gone on comparing them to each other.
       */
      expect(await page.evaluate(() => window.devicePixelRatio)).toBe(1);
      const repetition = testInfo.repeatEachIndex + 1;
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
              : entry.openSurface === 'preview-paused'
                ? PREVIEW_EVIDENCE_ROOT
                : EVIDENCE_ROOT,
        entry.palette.id,
        entry.openSurface === 'settings-overflow'
          ? 'overflow-375'
          : entry.openSurface === 'view-menu' ||
              entry.openSurface === 'about-menu'
            ? entry.openSurface
            : entry.openSurface === 'tab-strip'
              ? 'tab-strip'
              : entry.openSurface === 'toolbar'
                ? 'toolbar'
                : entry.openSurface === 'preview-paused'
                  ? 'paused'
                  : '',
      );
      const referencePage = await context.newPage();
      let referenceSignature: SemanticSignature | undefined;
      let actualSignature: SemanticSignature | undefined;
      let editorTopEdge = { reference: -1, actual: -1 };
      let filePopupVisual: FilePopupVisualEvidence | undefined;
      let actualScroll: ParityScrollOffset | undefined;

      try {
        await prepareReference(referencePage, entry, referenceSourceHash);
        await prepareActual(page, entry);
        /*
         * Both pages are taller than the 720px parity viewport, so every later
         * screenshot scrolls its own element into view. Record the prepared
         * scroll state once and restore it before each measurement so page
         * coordinates stay comparable and a scroll can never read back as
         * production geometry drift.
         */
        actualScroll = await readParityScroll(page);
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
            repetition,
            evidenceRoot,
            reference: referenceSignature,
            actual: actualSignature,
            status: 'pairing-mismatch',
            comparisonCompleted: false,
            editorTopEdge,
            error: message,
          });
          if (error instanceof SemanticPairingMismatchError) throw error;
          throw new Error(message, { cause: error });
        }

        if (actualScroll !== undefined) {
          await restoreParityScroll(page, actualScroll);
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
          /*
           * Dismiss by clicking a point proven to be outside the popup. The
           * popup now sits at the binding coordinates inside the application
           * frame, so a fixed offset inside the document area can fall under
           * it and would silently test nothing.
           */
          const popupBox = await page
            .locator('[data-viewport-popup="file-menu"]')
            .boundingBox();
          expect(popupBox).not.toBeNull();
          const outside = {
            x: Math.round((popupBox?.x ?? 0) + (popupBox?.width ?? 0) + 40),
            y: Math.round((popupBox?.y ?? 0) + 40),
          };
          expect(outside.x).toBeLessThan(entry.width);
          await page.mouse.click(outside.x, outside.y);
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
        if (actualScroll !== undefined) {
          await restoreParityScroll(page, actualScroll);
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
        if (POPUP_SURFACES.has(entry.openSurface)) {
          await assertPopupStaysInsideTheApplicationFrame(
            page,
            entry.actualSelector,
            entry.regionId,
          );
        }
        const comparison = comparePng(
          referenceSurface.bytes,
          actualSurface.bytes,
        );
        const differences = metricDifferences(
          referenceSurface.metrics,
          actualSurface.metrics,
        );
        /*
         * T070, amended by T127: the File popup fails closed on whole-popup
         * geometry, computed styles, and pixels exactly like every other slice,
         * and it now has no accepted pixel difference at all. The reviewed
         * macOS accelerator-glyph exception for New File, Open File, Save and
         * Save As used to be subtracted here by bounded rectangle; the
         * reference variant carries Feature 003's own host-formatted
         * accelerators instead, so those glyphs are compared. The per-row
         * evidence remains additional, not a substitute.
         *
         * Attributed residuals: a differing pixel passes only when a declared
         * term covers it, that term names a written cause and cites the
         * evidence that measured it, and the term has not grown beyond what was
         * measured — nor shrunk far below it. Anything else still fails. That
         * is now the only way any pixel is ever excused. See parity/attributed.ts.
         */
        const declaredResiduals = attributedResidualsFor(entry.key);
        const attribution = attributeDifferences(comparison, declaredResiduals);
        const unexplainedPixelCount =
          declaredResiduals.length > 0
            ? attribution.unattributedPixels
            : comparison.metrics.differentPixelCount;
        const errors = [
          ...differences,
          ...attribution.failures.filter(
            (failure) => !failure.includes('unattributed pixels'),
          ),
          ...(entry.openSurface === 'file-menu'
            ? (filePopupVisual?.differences ?? [])
            : []),
          ...(filePopup?.differences ?? []),
          ...(comparison.passed || unexplainedPixelCount === 0
            ? []
            : [
                `zero-tolerance pixel drift: ${unexplainedPixelCount} unattributed pixels`,
              ]),
        ];
        const error = errors.length === 0 ? undefined : errors.join('\n');
        await writeTargetedArtifacts({
          entry,
          repetition,
          evidenceRoot,
          reference: referenceSignature,
          actual: actualSignature,
          status: error === undefined ? 'passed' : 'production-ui-drift',
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

/**
 * The Settings menu is the only way to resolve a palette — the parity route does
 * not read one out of the case key — so the labels are derived here exactly as
 * the six-palette T058 slice derives them.
 */
const paletteLabels = (
  palette: ParityPalette,
): { theme: string; mode: string; title: string } => {
  const theme =
    palette.theme === 'glass'
      ? 'Liquid Glass'
      : palette.theme.charAt(0).toUpperCase() + palette.theme.slice(1);
  const mode = palette.mode.charAt(0).toUpperCase() + palette.mode.slice(1);
  return { theme, mode, title: `${theme} ${mode}` };
};

async function prepareActualStatusCase(
  page: Page,
  parityCaseKey: string,
  palette: ParityPalette,
): Promise<void> {
  const labels = paletteLabels(palette);
  await page.setViewportSize({ width: 1280, height: PARITY_HEIGHT });
  await page.goto(`/?parity-case=${encodeURIComponent(parityCaseKey)}`);
  await waitForParityReady(page, {
    readySelector: '[data-testid="application-shell"]',
  });
  await expect(page.getByRole('tab')).toHaveCount(2);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const menu = page.getByRole('menu', { name: 'Settings menu' });
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
  await page.getByRole('button', { name: 'View', exact: true }).click();
  await page
    .getByRole('menuitemradio', { name: 'Editor', exact: true })
    .click();
  await expect(page.locator('[aria-label="Editor pane"]')).toBeVisible();
  await expect(page.locator('[aria-label="Preview pane"]')).toHaveCount(0);
  await freezeParityPixels(page);
}

/**
 * The verification method every editor-status state is proven by. It is a
 * declared method with its own assertions, not an attempted comparison that did
 * not happen — spec.md (Session 2026-08-14) forbids a production-only artifact
 * that merely records a comparison as un-attempted from standing in for a
 * parity result, so no field anywhere in this harness reports that. Whether a
 * comparison ran is carried only by the `status` discriminant, whose
 * `pairing-mismatch` value always accompanies a thrown failure.
 */
const T063_BEHAVIOUR_VERIFICATION_METHOD =
  'data-status-state attribute, title bar, status-item text and binding colour-token assertions';

const T063_BEHAVIOUR_VERIFICATION_REASON =
  'No editor-status state can be pixel-compared. Four of the six differ only in a save status the binding never draws in its status row — it puts it in the title bar (mockup.html:594). The other two do name a condition the binding draws (.sb-eol, .sb-count) and reviewed reference variants exist for both; measuring through them proved they still cannot pair on absolute bounds, because the binding row carries a Problems badge, an AI-provider readout and a Reading pill while production carries a Document details disclosure the binding lacks, and because the binding draws .statusbar full width beneath the sidebar while production draws it inside the document area. Measured at 1280 Minimal Light: 115.531px and 207.453px horizontally and a 46px frame-height difference vertically, so every status item lands on a different sub-pixel grid. All six are therefore proven against the authoritative data-status-state attribute, the title bar that carries the status, the status-item text each state changes, and the binding colour token the row reads.';

/*
 * Six states in each of the six palettes is the whole 36-key behaviour contract
 * FR-FT-051, SC-FT-009 and SC-FT-012 declare. One test per palette rather than
 * one test for all 36, so a palette-specific failure names itself.
 */
for (const palette of PARITY_PALETTES) {
  test(`T063 verifies the six backend-authoritative editor-status states at 1280px ${paletteLabels(palette).title}`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(240_000);
    assertTargetedManifestIntegrity();
    const repetition = testInfo.repeatEachIndex + 1;
    /*
     * The split is read from the manifest, not written out here: every state this
     * test covers must be one the manifest counts as behaviour-verified, and the
     * manifest must count no others.
     */
    expect(T063_STATUS_CASES.map(({ stateId }) => stateId)).toEqual([
      ...BEHAVIOUR_VERIFIED_STATE_IDS,
    ]);

    for (const statusCase of T063_STATUS_CASES) {
      await prepareActualStatusCase(
        page,
        `state:${statusCase.stateId}:${palette.id}`,
        palette,
      );
      const status = page.getByRole('status', { name: 'Document status' });
      const assertions: string[] = [];
      await expect(status).toHaveAttribute(
        'data-status-state',
        statusCase.status,
      );
      assertions.push(
        `[role="status"][aria-label="Document status"] has data-status-state="${statusCase.status}"`,
      );
      // The status row draws no save status — the binding puts it in the title
      // bar (`mockup.html` `.doc-name`, :594), so that is where it is asserted.
      await expect(
        page.locator('header[aria-label="Document identity"]'),
      ).toContainText(statusCase.text);
      assertions.push(
        `header[aria-label="Document identity"] contains "${statusCase.text}"`,
      );
      await expect(status).not.toContainText(statusCase.text);
      assertions.push(
        `the status row does not duplicate "${statusCase.text}", matching the binding's own status row`,
      );
      await expect(status.locator('[data-status-item="cursor"]')).toContainText(
        'Ln',
      );
      assertions.push('the status row reports the caret position');
      await expect(
        status.locator(statusItemSelector('encoding', 'actual')),
      ).toHaveText('UTF-8');
      assertions.push(
        `${statusItemSelector('encoding', 'actual')} reads "UTF-8"`,
      );
      const expectedEnding =
        statusCase.stateId === 'status-mixed-ending' ? 'Mixed' : 'LF';
      await expect(
        status.locator(statusItemSelector('line-ending', 'actual')),
      ).toHaveText(expectedEnding);
      assertions.push(
        `${statusItemSelector('line-ending', 'actual')} reads "${expectedEnding}"`,
      );
      if (statusCase.stateId === 'status-large-file') {
        await expect(
          status.locator(statusItemSelector('count', 'actual')),
        ).toContainText('420,000');
        assertions.push(
          `${statusItemSelector('count', 'actual')} reports the large-file word count`,
        );
      }
      if (statusCase.stateId === 'status-read-only') {
        await status.getByRole('button', { name: 'Document details' }).click();
        /*
         * The region is queried from the page, not from `status`: T113 moved it
         * out of the row and into the status dock, because an absolutely
         * positioned child of the row's `overflow: hidden` box is clipped by it.
         *
         * `toContainText` was the only assertion here, and it passed for the
         * whole time the panel painted nothing — it reads the text tree and
         * never consults layout. `toBeVisible` would not have caught it either
         * (a clipped box still has a bounding box). `expectPainted` is the one
         * that hit-tests the painted output, so it is what proves FR-FT-005's
         * reason is on screen rather than merely in the DOM.
         */
        const detailsRegion = page.getByRole('region', {
          name: 'Document details',
        });
        await expect(detailsRegion).toBeVisible();
        await expect(detailsRegion).toContainText('Read-only');
        await expectPainted(detailsRegion, 'the Document details region');
        assertions.push(
          'the Document details region is painted, not merely present, and reports Read-only for the read-only capability',
        );
      }
      const metrics = await surfaceMetrics(status);
      const shellBottom = await page
        .getByTestId('application-shell')
        .evaluate((element) => element.getBoundingClientRect().bottom);
      expect(metrics.bounds.height).toBe(28);
      expect(metrics.bounds.bottom).toBe(Number(shellBottom.toFixed(3)));
      expect(metrics.styles['white-space']).toBe('normal');
      assertions.push(
        'the status row is 28px tall and sits on the application shell bottom edge',
      );
      const noWrap = await status.evaluate((element) => ({
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
        wrappedItems: Array.from(
          element.querySelectorAll<HTMLElement>('[data-status-item]'),
        ).filter((item) => getComputedStyle(item).whiteSpace !== 'nowrap')
          .length,
      }));
      expect(noWrap.scrollWidth).toBeLessThanOrEqual(noWrap.clientWidth);
      expect(noWrap.wrappedItems).toBe(0);
      assertions.push('no status item wraps and the row never overflows');
      /*
       * The binding's status row reads `--faint` (`mockup.html:382`
       * `.statusbar{…color:var(--faint)…}`). Measuring the two source-backed
       * conditions through their reference variants is what found production
       * reading `--text-muted` instead — every glyph pixel differed at a maximum
       * channel delta of 47. The pixel comparison is gone, so this is the check
       * that keeps that colour honest: it resolves the binding token in the page
       * and asserts the row and every item read exactly it, rather than pinning a
       * literal that would drift with the palette.
       */
      const colour = await status.evaluate((element) => {
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

      const evidenceRoot = join(
        EDITOR_STATUS_EVIDENCE_ROOT,
        palette.id,
        statusCase.stateId,
      );
      await mkdir(evidenceRoot, { recursive: true });
      const productionState = {
        stateId: statusCase.stateId,
        status: statusCase.status,
        visibleText: await status.innerText(),
        editorVisible: await page
          .locator('[aria-label="Editor pane"]')
          .isVisible(),
        previewVisible: await page
          .locator('[aria-label="Preview pane"]')
          .count(),
      };

      await writeFile(
        join(evidenceRoot, 'semantic.json'),
        JSON.stringify(productionState, null, 2),
      );
      await writeFile(
        join(evidenceRoot, 'metrics.json'),
        JSON.stringify({ metrics, noWrap }, null, 2),
      );
      await writeFile(
        join(evidenceRoot, 'actual.png'),
        await status.screenshot({ animations: 'disabled' }),
      );
      /*
       * SC-FT-012's assertion-list half. `repeatEach: 3` on the parity project
       * runs this case three times; this is what actually compares the results,
       * against the list the previous run left on disk. Reading from disk rather
       * than from process memory means it also spans separate `playwright test`
       * invocations, which is the stricter reading of "three consecutive local
       * runs" — and it survives Playwright distributing the repeats across
       * workers, which in-memory state would not.
       */
      const statusPath = join(evidenceRoot, 'status.json');
      const previousStatus = await readFile(statusPath, 'utf8').catch(
        () => null,
      );
      if (previousStatus !== null) {
        const priorAssertions = (
          JSON.parse(previousStatus) as { assertions?: readonly string[] }
        ).assertions;
        expect(
          priorAssertions,
          `${statusPath} recorded a different assertion list on the previous run. If T063's assertions changed on purpose, delete that file and re-run; otherwise this is exactly the run-to-run nondeterminism SC-FT-012 exists to catch.`,
        ).toEqual(assertions);
      }

      await writeFile(
        statusPath,
        JSON.stringify(
          {
            status: 'behaviour-verified',
            verificationMethod: T063_BEHAVIOUR_VERIFICATION_METHOD,
            assertions,
            reason: T063_BEHAVIOUR_VERIFICATION_REASON,
          },
          null,
          2,
        ),
      );
      await writeFile(
        join(evidenceRoot, 'raw-status.log'),
        [
          'status=behaviour-verified',
          `verification_method=${T063_BEHAVIOUR_VERIFICATION_METHOD}`,
          `assertion_count=${assertions.length}`,
          ...assertions.map(
            (assertion, index) => `assertion_${index + 1}=${assertion}`,
          ),
          'reason=no_editor_status_state_can_pair_on_absolute_bounds',
          '',
        ].join('\n'),
      );
      /*
       * T054's per-key accounting for the behaviour half. `referenceReady` is
       * false and that is the honest value, not a gap: a behaviour-verified key
       * never loads a reference page, because the whole finding is that no
       * picture of the binding's status row can pair with production's. The
       * report tallies the two methods separately so this reads as
       * "not applicable" rather than "not ready" — see `methodNotes`.
       */
      await recordParityCapture({
        manifestKey: `state:${statusCase.stateId}:${palette.id}`,
        repetition,
        referenceReady: false,
        actualReady: true,
        comparisonCompleted: true,
        status: 'passed',
      });
    }
  });
}
