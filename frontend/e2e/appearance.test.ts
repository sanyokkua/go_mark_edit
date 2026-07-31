import { expect, test, type Page } from '@playwright/test';

const palettes = [
  ['Liquid Glass', 'Light', 'glass', 'light'],
  ['Liquid Glass', 'Dark', 'glass', 'dark'],
  ['Material', 'Light', 'material', 'light'],
  ['Material', 'Dark', 'material', 'dark'],
  ['Minimal', 'Light', 'minimal', 'light'],
  ['Minimal', 'Dark', 'minimal', 'dark'],
] as const;

async function openAppearance(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('menuitem', { name: 'Appearance' }).click();
  await expect(page.getByRole('dialog', { name: 'Appearance' })).toBeVisible();
}

test('changes all six palettes through keyboard reachable appearance controls without overflow', async ({
  page,
}) => {
  const runtimeErrors: string[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));

  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 720 });
    await page.goto('/');
    await openAppearance(page);

    for (const [themeLabel, modeLabel, theme, mode] of palettes) {
      await page.getByRole('radio', { name: themeLabel }).press('Space');
      await page.getByRole('radio', { name: modeLabel }).press('Space');
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
        await expect(page).toHaveScreenshot(`appearance-${theme}-${mode}.png`, {
          animations: 'disabled',
        });
      }
    }
  }

  expect(runtimeErrors).toEqual([]);
});

test('uses the pre-paint mirror before canonical reconciliation and keeps the controls visibly focused with bundled typography', async ({
  page,
}) => {
  await page.addInitScript(() => {
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
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');

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

test('retains the acknowledged palette when the bridge rejects an appearance write', async ({
  page,
}) => {
  await page.goto('/?rejectAppearance=1');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'material');
  await openAppearance(page);
  await page.getByRole('radio', { name: 'Liquid Glass' }).press('Space');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'material');
  await expect(
    page.getByText('Invalid setting', { exact: true }),
  ).toBeVisible();
});
