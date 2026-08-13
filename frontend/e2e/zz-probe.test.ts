import { test } from '@playwright/test';

test('probe overflow contents', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 720 });
  await page.goto('/');
  await page.getByRole('button', { name: 'More actions' }).first().click();
  await page.getByRole('menuitem', { name: 'View' }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Toggle Sidebar' }).click();
  await page.waitForTimeout(500);
  const toolbar = page.getByRole('toolbar', { name: 'Document toolbar' });
  console.log(
    'TOOLBAR_BUTTONS',
    JSON.stringify(
      await toolbar
        .getByRole('button')
        .evaluateAll((els) =>
          els.map((e) => e.getAttribute('aria-label') ?? e.textContent?.trim()),
        ),
    ),
  );
  await toolbar.getByLabel('More actions').click();
  await page.waitForTimeout(500);
  const pop = page.locator('[data-viewport-popup="editor-overflow"]');
  console.log('POPUP_COUNT', await pop.count());
  console.log(
    'POPUP_ITEMS',
    JSON.stringify(
      await pop
        .locator('button')
        .evaluateAll((els) =>
          els.map((e) => e.getAttribute('aria-label') ?? e.textContent?.trim()),
        ),
    ),
  );
  const editor = page.getByRole('textbox', { name: 'Editor content' });
  await editor.click();
  await page.waitForTimeout(400);
  console.log('POPUP_AFTER_EDITOR_FOCUS', await pop.count());
});
