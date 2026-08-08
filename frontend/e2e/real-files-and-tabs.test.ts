import { expect, test } from '@playwright/test';

test('FT-VS-01 operates New/Open from the real File menu and keeps the shell usable', async ({
  page,
}) => {
  await page.goto('/');

  const file = page.getByRole('button', { name: 'File' });
  await expect(file).toBeVisible();
  await file.click();

  const menu = page.getByRole('menu', { name: 'File' });
  await expect(menu.getByRole('menuitem', { name: 'New File' })).toBeEnabled();
  await expect(menu.getByRole('menuitem', { name: 'Open File' })).toBeEnabled();

  await menu.getByRole('menuitem', { name: 'New File' }).click();
  await expect(page.locator('[data-document-state="active"]')).toBeVisible();

  await file.click();
  await menu.getByRole('menuitem', { name: 'Open File' }).click();
  await expect(page.locator('[data-document-state="active"]')).toBeVisible();
  await expect(page.getByRole('main', { name: 'Document area' })).toBeVisible();
});

test('FT-VS-02 flushes the latest edit and reports one explicit Save confirmation', async ({
  page,
}) => {
  await page.goto('/');

  const editor = page.getByRole('textbox', { name: 'Editor content' });
  await expect(editor).toBeVisible();
  await editor.press('ControlOrMeta+A');
  await page.keyboard.type('saved from the real editor');

  const file = page.getByRole('button', { name: 'File' });
  await file.click();
  const menu = page.getByRole('menu', { name: 'File' });
  await expect(
    menu.getByRole('menuitem', { name: 'Save', exact: true }),
  ).toBeEnabled();
  await menu.getByRole('menuitem', { name: 'Save', exact: true }).click();

  await expect(
    page.locator('[data-notification-code="save-success"]'),
  ).toHaveCount(1);
  await expect(page.locator('footer').filter({ hasText: 'Saved' })).toHaveCount(
    1,
  );
});
