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

async function openAppearance(page: Page): Promise<void> {
  if ((page.viewportSize()?.width ?? 1280) <= 376) {
    await page.getByRole('button', { name: 'More actions' }).first().click();
    await page.getByRole('menuitem', { name: 'Settings' }).click();
  } else {
    await page.getByRole('button', { name: 'Settings' }).click();
  }
  await expect(page.getByRole('menu', { name: 'Settings menu' })).toBeVisible();
}

async function stabilizeMonacoScrollbar(
  page: Page,
  expectedColor: string,
): Promise<void> {
  await page.addStyleTag({
    content:
      '.monaco-scrollable-element .scrollbar.vertical { opacity: 1 !important; }',
  });
  await expect(
    page.locator('.monaco-scrollable-element .scrollbar.vertical').first(),
  ).toHaveCSS('opacity', '1');
  await expect(
    page
      .locator('.monaco-scrollable-element .scrollbar.vertical .slider')
      .first(),
  ).toHaveCSS('background-color', expectedColor);
}

// Proves: FR-033
test('changes all six palettes through keyboard-reachable controls without overflow', async ({
  app,
}) => {
  await app.launch();

  const { page } = app;
  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 720 });
    await openAppearance(page);

    for (const [themeLabel, modeLabel, theme, mode] of palettes) {
      await page
        .getByRole('radio', { name: themeLabel, exact: true })
        .press('Space');
      await page
        .getByRole('radio', { name: modeLabel, exact: true })
        .press('Space');
      await expect
        .poll(() => page.locator('html').getAttribute('data-theme'))
        .toBe(theme);
      await expect
        .poll(() => page.locator('html').getAttribute('data-mode'))
        .toBe(mode);
      await expect(page.locator('.monaco-editor')).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        )
        .toBe(true);
      if (width === 1280) {
        await stabilizeMonacoScrollbar(
          page,
          mode === 'light' ? 'rgba(0, 0, 0, 0.18)' : 'rgba(255, 255, 255, 0.2)',
        );
      }
    }
    await page.keyboard.press('Escape');
  }
});

// Proves: FR-033
test('applies the pre-paint theme mirror before backend reconciliation and keeps Settings focused', async ({
  app,
}) => {
  await app.page.addInitScript(() => {
    const writes: Array<{ mode: string | null; theme: string | null }> = [];
    const setAttribute = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function (
      name: string,
      value: string,
    ): void {
      setAttribute.call(this, name, value);
      if (
        this === document.documentElement &&
        (name === 'data-theme' || name === 'data-mode')
      ) {
        writes.push({
          mode: this.getAttribute('data-mode'),
          theme: this.getAttribute('data-theme'),
        });
      }
    };
    localStorage.setItem(
      'gme.theme',
      JSON.stringify({ version: 1, theme: 'minimal', mode: 'dark' }),
    );
    (
      globalThis as typeof globalThis & {
        gmeRootAttributeWrites: typeof writes;
      }
    ).gmeRootAttributeWrites = writes;
  });
  await app.page.emulateMedia({ reducedMotion: 'reduce' });
  await app.launch();

  const { page } = app;
  const writes = await page.evaluate(
    () =>
      (
        globalThis as typeof globalThis & {
          gmeRootAttributeWrites: Array<{
            mode: string | null;
            theme: string | null;
          }>;
        }
      ).gmeRootAttributeWrites,
  );
  const mirrorIndex = writes.findIndex(
    (write) => write.theme === 'minimal' && write.mode === 'dark',
  );
  const canonicalIndex = writes.findIndex(
    (write, index) =>
      index > mirrorIndex &&
      write.theme === 'material' &&
      write.mode === 'light',
  );

  expect(mirrorIndex).toBeGreaterThanOrEqual(0);
  expect(canonicalIndex).toBeGreaterThan(mirrorIndex);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'material');
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'light');
  const settings = page.getByRole('button', { name: 'Settings' });
  await settings.focus();
  await expect
    .poll(() =>
      settings.evaluate((element) => getComputedStyle(element).boxShadow),
    )
    .not.toBe('none');
  await expect
    .poll(() =>
      page
        .locator('body')
        .evaluate((element) => getComputedStyle(element).fontFamily),
    )
    .toMatch(/GME Inter|GME Roboto|system-ui/);
  await expect
    .poll(() =>
      page
        .locator('html')
        .evaluate((element) =>
          getComputedStyle(element).getPropertyValue('--dur-base').trim(),
        ),
    )
    .toBe('0ms');
});
