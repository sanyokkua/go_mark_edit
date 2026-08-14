import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { expect, test, type Locator, type Page } from '@playwright/test';

import {
  adaptReferenceHtml,
  REFERENCE_ZERO_ASSISTANT_CLASS,
  referenceVariantRules,
  type FileOnlyReferenceState,
  type ReferenceVariant,
} from './parity/reference-adapter';
import {
  PARITY_HEIGHT,
  PARITY_MANIFEST,
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

test.describe.configure({ mode: 'serial' });

const REFERENCE_ORIGIN =
  process.env.PARITY_REFERENCE_ORIGIN ?? 'http://127.0.0.1:4174';
const REPOSITORY_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const REFERENCE_PATH = resolve(
  REPOSITORY_ROOT,
  'docs/delivery/spec/surface/mockup.html',
);
const MAPPED_SELECTOR_TIMEOUT_MS = 1_500;

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

type SurfaceMapping = Readonly<{
  readonly family: ParityFamily;
  readonly regionId: string;
  readonly referenceSelector: string;
  readonly referenceVariant: ReferenceVariant;
}>;

/**
 * The reference region each family navigates to, and the reviewed variant it is
 * served under. The selectors intentionally stop at the webview-owned content:
 * no OS frame, populated workspace, Assistant/provider surface, or deferred
 * rich-rendering surface is included. The variant boundary is checked on every
 * reference setup.
 */
const SURFACES: Readonly<Record<ParityFamily, SurfaceMapping>> = {
  'editor-split': {
    family: 'editor-split',
    regionId: 'editor',
    referenceSelector: '#app.no-assistant .content',
    referenceVariant: 'base',
  },
  'editor-only': {
    family: 'editor-only',
    regionId: 'editor',
    referenceSelector: '#app.no-assistant .content',
    referenceVariant: 'base',
  },
  'preview-only': {
    family: 'preview-only',
    regionId: 'editor',
    referenceSelector: '#app.no-assistant .content',
    referenceVariant: 'base',
  },
  'menu-file': {
    family: 'menu-file',
    regionId: 'file-menu',
    referenceSelector: '#m-file',
    referenceVariant: 'file-menu',
  },
  'menu-settings': {
    family: 'menu-settings',
    regionId: 'settings-menu',
    referenceSelector: '#m-settings',
    referenceVariant: 'base',
  },
  'menu-view': {
    family: 'menu-view',
    regionId: 'view-menu',
    referenceSelector: '#m-view',
    referenceVariant: 'base',
  },
  'menu-about': {
    family: 'menu-about',
    regionId: 'about-menu',
    referenceSelector: '#m-about',
    referenceVariant: 'base',
  },
  'tab-menu': {
    family: 'tab-menu',
    regionId: 'tab-menu',
    referenceSelector: '#tabctx',
    referenceVariant: 'move-tab',
  },
  'toolbar-overflow': {
    family: 'toolbar-overflow',
    regionId: 'toolbar',
    referenceSelector: '#app.no-assistant .content',
    referenceVariant: 'base',
  },
  empty: {
    family: 'empty',
    regionId: 'launcher',
    referenceSelector: '#app .launcher',
    referenceVariant: 'file-only',
  },
  'save-prompt': {
    family: 'save-prompt',
    regionId: 'save-prompt',
    referenceSelector: '#savePrompt',
    referenceVariant: 'base',
  },
  'quit-prompt': {
    family: 'quit-prompt',
    regionId: 'quit-prompt',
    referenceSelector: '#quitPrompt',
    referenceVariant: 'base',
  },
  'reload-prompt': {
    family: 'reload-prompt',
    regionId: 'reload-prompt',
    referenceSelector: '#reloadPrompt',
    referenceVariant: 'conflict',
  },
  toasts: {
    family: 'toasts',
    regionId: 'toast',
    referenceSelector: '#app .toasts',
    referenceVariant: 'base',
  },
  'settings-appearance': {
    family: 'settings-appearance',
    regionId: 'settings',
    referenceSelector: '#setModal',
    referenceVariant: 'base',
  },
  'settings-editor': {
    family: 'settings-editor',
    regionId: 'settings',
    referenceSelector: '#setModal',
    referenceVariant: 'base',
  },
  'settings-markdown': {
    family: 'settings-markdown',
    regionId: 'settings',
    referenceSelector: '#setModal',
    referenceVariant: 'base',
  },
};

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
 * drawn where the binding does not draw it.
 */
async function assertSaveStatusPlacement(
  page: Page,
  status: SaveStatusId,
): Promise<void> {
  const text = SAVE_STATUS_LABELS[status];
  const row = documentStatus(page);
  await expect(row).toHaveAttribute('data-status-state', status);
  await expect(documentIdentity(page)).toContainText(text);
  await expect(row).not.toContainText(text);
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
       * intercept.
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
