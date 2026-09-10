import type { Page } from '@playwright/test';

import { expect, test } from '../support/harness';

const palettes = [
  ['Liquid Glass', 'Light', 'glass', 'light'],
  ['Liquid Glass', 'Dark', 'glass', 'dark'],
  ['Material', 'Light', 'material', 'light'],
  ['Material', 'Dark', 'material', 'dark'],
  ['Minimal', 'Light', 'minimal', 'light'],
  ['Minimal', 'Dark', 'minimal', 'dark'],
] as const;

async function openSettings(page: Page): Promise<ReturnType<Page['locator']>> {
  const navigation = page.getByRole('navigation', {
    name: 'Application actions',
  });
  if ((page.viewportSize()?.width ?? 1280) <= 376) {
    await navigation.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name: 'Settings', exact: true }).click();
  } else {
    await navigation
      .getByRole('button', { name: 'Settings', exact: true })
      .click();
  }
  const menu = page.getByRole('menu', { name: 'Settings menu' });
  await expect(menu).toBeVisible();
  return menu;
}

test('keeps the document stage and settings focus contract across the shell matrix', async ({
  app,
}) => {
  await app.launch();

  const { page } = app;
  const shell = page.getByTestId('application-shell');
  const stage = page.getByRole('main', { name: 'Document area' });
  const navigation = page.getByRole('navigation', {
    name: 'Application actions',
  });

  for (const width of [375, 768, 1280] as const) {
    await page.setViewportSize({ width, height: 720 });
    await expect(shell).toBeVisible();
    await expect(stage).toBeVisible();
    await expect(navigation).toBeVisible();

    for (const [themeLabel, modeLabel, theme, mode] of palettes) {
      await page.emulateMedia({
        colorScheme: mode === 'dark' ? 'dark' : 'light',
      });
      const menu = await openSettings(page);
      const opener =
        width <= 376
          ? navigation.getByRole('button', { name: 'More actions' })
          : navigation.getByRole('button', { name: 'Settings', exact: true });
      await menu
        .getByRole('radio', { name: themeLabel, exact: true })
        .press('Space');
      await menu
        .getByRole('radio', { name: modeLabel, exact: true })
        .press('Space');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(page.locator('html')).toHaveAttribute('data-mode', mode);
      await expect(stage).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        )
        .toBe(true);

      await page.keyboard.press('Escape');
      await expect(menu).toHaveCount(0);
      await expect(opener).toBeFocused();
    }
  }
});
