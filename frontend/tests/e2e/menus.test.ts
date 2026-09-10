import type { Locator, Page } from '@playwright/test';

import { expect, test } from '../support/harness';

const palettes = [
  ['Liquid Glass', 'Light', 'glass', 'light'],
  ['Liquid Glass', 'Dark', 'glass', 'dark'],
  ['Material', 'Light', 'material', 'light'],
  ['Material', 'Dark', 'material', 'dark'],
  ['Minimal', 'Light', 'minimal', 'light'],
  ['Minimal', 'Dark', 'minimal', 'dark'],
] as const;

type MenuFamily = {
  label: string;
  popup: string;
};

const menubarFamilies: readonly MenuFamily[] = [
  { label: 'File', popup: 'file-menu' },
  { label: 'Settings', popup: 'settings-menu' },
  { label: 'View', popup: 'view-menu' },
  { label: 'About', popup: 'about-menu' },
];

function popupLocator(page: Page, name: string): Locator {
  return page.locator(`[data-viewport-popup="${name}"]`);
}

async function expectPopupContract(
  page: Page,
  popup: Locator,
  checkFocusRing: boolean,
): Promise<void> {
  await expect(popup).toBeVisible();
  const state = await popup.evaluate((element) => {
    const frame = element.closest<HTMLElement>('.application-frame');
    if (frame === null)
      throw new Error('popup is outside the application frame');
    const shadowProbe = document.createElement('span');
    shadowProbe.style.boxShadow = 'var(--win-shadow)';
    frame.append(shadowProbe);
    const expectedShadow = getComputedStyle(shadowProbe).boxShadow;
    shadowProbe.remove();
    const popupBounds = element.getBoundingClientRect();
    const frameBounds = frame.getBoundingClientRect();
    const items = Array.from(
      element.querySelectorAll<HTMLElement>(
        '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]',
      ),
    );
    const ringItems = items.filter(
      (item) => getComputedStyle(item).boxShadow !== 'none',
    );
    return {
      actualShadow: getComputedStyle(element).boxShadow,
      expectedShadow,
      activeItems: items.filter((item) => item === document.activeElement)
        .length,
      ringItems: ringItems.length,
      insideFrame:
        popupBounds.left >= frameBounds.left - 1 &&
        popupBounds.top >= frameBounds.top - 1 &&
        popupBounds.right <= frameBounds.right + 1 &&
        popupBounds.bottom <= frameBounds.bottom + 1,
    };
  });
  expect(
    state.actualShadow === state.expectedShadow ||
      state.actualShadow.startsWith(state.expectedShadow + ','),
  ).toBe(true);
  expect(state.insideFrame).toBe(true);
  if (checkFocusRing) {
    expect(state.activeItems).toBe(1);
    expect(state.ringItems).toBe(1);
  }
}

async function openMenubarFamily(
  page: Page,
  family: MenuFamily,
  keyboard: boolean,
): Promise<{ popup: Locator; trigger: Locator }> {
  const trigger = page
    .getByRole('navigation', { name: 'Application actions' })
    .getByRole('button', { name: family.label, exact: true });
  await expect(trigger).toBeVisible();
  if (keyboard) {
    await trigger.focus();
    await trigger.press('ArrowDown');
  } else {
    await trigger.click();
  }
  const popup = popupLocator(page, family.popup);
  await expect(popup).toBeVisible();
  return { popup, trigger };
}

async function closePopupWithEscape(page: Page, popup: Locator): Promise<void> {
  await page.keyboard.press('Escape');
  await expect(popup).toHaveCount(0);
}

async function setPalette(
  page: Page,
  themeLabel: string,
  modeLabel: string,
  theme: string,
  mode: string,
): Promise<void> {
  await page.emulateMedia({ colorScheme: mode === 'dark' ? 'dark' : 'light' });
  const settings = await openMenubarFamily(
    page,
    { label: 'Settings', popup: 'settings-menu' },
    false,
  );
  await settings.popup
    .getByRole('radio', { name: themeLabel, exact: true })
    .click();
  await settings.popup
    .getByRole('radio', { name: modeLabel, exact: true })
    .click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  await expect(page.locator('html')).toHaveAttribute('data-mode', mode);
  await closePopupWithEscape(page, settings.popup);
}

async function exerciseMenubarFamilies(page: Page): Promise<void> {
  for (const family of menubarFamilies) {
    const pointer = await openMenubarFamily(page, family, false);
    await expectPopupContract(page, pointer.popup, false);
    await pointer.trigger.click();
    await expect(pointer.popup).toHaveCount(0);

    const keyboard = await openMenubarFamily(page, family, true);
    await expectPopupContract(page, keyboard.popup, true);
    await closePopupWithEscape(page, keyboard.popup);
  }
}

async function exerciseContextMenu(page: Page, tab: Locator): Promise<void> {
  await tab.click({ button: 'right', position: { x: 4, y: 4 } });
  const menu = popupLocator(page, 'tab-menu');
  await expectPopupContract(page, menu, false);
  await closePopupWithEscape(page, menu);

  await tab.focus();
  await tab.press('Shift+F10');
  await expectPopupContract(page, menu, true);
  await expect(menu.locator('[data-shortcut]')).not.toHaveCount(0);
  await closePopupWithEscape(page, menu);
}

async function exerciseEditorContextMenu(page: Page): Promise<void> {
  const editorSurface = page.locator('[data-editor-surface]').first();
  const editor = editorSurface.locator('textarea').first();
  await editorSurface
    .locator('.view-lines')
    .first()
    .click({ button: 'right', position: { x: 16, y: 16 } });
  const menu = popupLocator(page, 'context-menu');
  await expectPopupContract(page, menu, false);
  await closePopupWithEscape(page, menu);

  await editor.focus();
  await editor.press('Shift+F10');
  await expectPopupContract(page, menu, true);
  await closePopupWithEscape(page, menu);
}

async function exerciseToolbarOverflow(page: Page): Promise<void> {
  await page.setViewportSize({ width: 700, height: 720 });
  const trigger = page
    .getByRole('toolbar', { name: 'Document toolbar' })
    .getByRole('button', { name: 'More actions' });
  const popup = popupLocator(page, 'editor-overflow');
  await trigger.click();
  await expectPopupContract(page, popup, false);
  await trigger.click();
  await expect(popup).toHaveCount(0);

  await trigger.focus();
  await trigger.press('ArrowDown');
  await expectPopupContract(page, popup, true);
  await closePopupWithEscape(page, popup);
  await page.setViewportSize({ width: 1280, height: 720 });
}

async function exerciseDetails(page: Page): Promise<void> {
  const trigger = page.getByRole('button', { name: 'Document details' });
  const popup = page.getByRole('region', { name: 'Document details' });
  await trigger.click();
  await expectPopupContract(page, popup, false);
  await trigger.click();
  await expect(popup).toHaveCount(0);

  await trigger.focus();
  await trigger.press('ArrowDown');
  await expectPopupContract(page, popup, false);
  await closePopupWithEscape(page, popup);
}

async function exerciseTabGeometry(page: Page): Promise<void> {
  const tabs = page.getByRole('tab');
  const tablist = page.getByRole('tablist', { name: 'Document tabs' });
  for (const index of [0, 6, 12]) {
    const tab = tabs.nth(index);
    await tab.scrollIntoViewIfNeeded();
    await tab.click({ button: 'right', position: { x: 4, y: 4 } });
    const menu = popupLocator(page, 'tab-menu');
    await expectPopupContract(page, menu, false);
    await closePopupWithEscape(page, menu);
  }

  await tablist.evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
    element.dispatchEvent(new Event('scroll', { bubbles: true }));
  });
  await expect
    .poll(() => tablist.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(0);
  await tabs.last().click({ button: 'right', position: { x: 4, y: 4 } });
  const scrolledMenu = popupLocator(page, 'tab-menu');
  await expectPopupContract(page, scrolledMenu, false);
  await closePopupWithEscape(page, scrolledMenu);
}

// Proves: FR-034, FR-035, SC-007
test('T022 case 8 keeps every Popup family framed across palettes and input modes', async ({
  app,
}) => {
  await app.launch();
  const { page } = app;
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(
    page.getByRole('navigation', { name: 'Application actions' }),
  ).toBeVisible();

  for (let index = 0; index < 12; index += 1) {
    await page.getByRole('button', { name: 'New tab' }).click();
    await expect(page.getByRole('tab')).toHaveCount(index + 2);
  }
  await expect(page.getByRole('tab')).toHaveCount(13);
  const tablist = page.getByRole('tablist', { name: 'Document tabs' });
  await expect
    .poll(() =>
      tablist.evaluate((element) => element.scrollWidth > element.clientWidth),
    )
    .toBe(true);
  await exerciseTabGeometry(page);

  for (const [themeLabel, modeLabel, theme, mode] of palettes) {
    await setPalette(page, themeLabel, modeLabel, theme, mode);
    await exerciseMenubarFamilies(page);
    await exerciseContextMenu(page, page.getByRole('tab').first());
    await exerciseContextMenu(page, page.getByRole('tab').last());
    await exerciseEditorContextMenu(page);
    await exerciseToolbarOverflow(page);
    await exerciseDetails(page);
  }

  await page.setViewportSize({ width: 375, height: 480 });
  for (const width of [375, 377, 400, 450, 500] as const) {
    await page.setViewportSize({ width, height: 480 });
    if (width <= 376) {
      await page.getByRole('button', { name: 'More actions' }).first().click();
      for (const family of menubarFamilies) {
        const item = page.getByRole('menuitem', {
          name: family.label,
          exact: true,
        });
        await item.click();
        const popup = popupLocator(page, family.popup);
        await expectPopupContract(page, popup, false);
        await closePopupWithEscape(page, popup);
        await page
          .getByRole('button', { name: 'More actions' })
          .first()
          .click();
      }
      await page.keyboard.press('Escape');
    } else {
      for (const family of menubarFamilies) {
        const { popup } = await openMenubarFamily(page, family, false);
        await expectPopupContract(page, popup, false);
        await closePopupWithEscape(page, popup);
      }
    }
  }
});
