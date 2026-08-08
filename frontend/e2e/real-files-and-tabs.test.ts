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

test('FT-VS-03 exposes real tabs, backend-confirmed menu moves, and exact navigation', async ({
  page,
}) => {
  await page.goto('/');

  const newTab = page.getByRole('button', { name: 'New tab' });
  await expect(newTab).toBeEnabled();
  await newTab.click();
  await expect(page.getByRole('tab')).toHaveCount(2);

  const tabs = page.getByRole('tab');
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  await tabs.nth(1).click({ button: 'right' });
  const menu = page.getByRole('menu', { name: 'Tab actions' });
  await expect(
    menu.getByRole('menuitem', { name: 'Move tab left' }),
  ).toBeEnabled();
  await expect(
    menu.getByRole('menuitem', { name: 'Move tab right' }),
  ).toBeDisabled();
  await menu.getByRole('menuitem', { name: 'Move tab left' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Moved' }),
  ).toContainText('position 1 of 2');

  await page.keyboard.press('Control+PageDown');
  await expect(page.getByRole('tab').nth(1)).toHaveAttribute(
    'aria-selected',
    'true',
  );
});

test('FT-VS-04 shows the bounded external-change prompt and safe Skip decision', async ({
  page,
}) => {
  await page.goto('/?ft-vs-04');

  await page.getByRole('button', { name: 'New tab' }).click();
  const tabs = page.getByRole('tab');
  await tabs.nth(1).click();

  const prompt = page.getByRole('dialog', { name: 'File changed on disk' });
  await expect(prompt).toBeVisible();
  await expect(
    prompt.getByRole('heading', { name: /^On disk ·/u }),
  ).toBeVisible();
  await expect(
    prompt.getByRole('heading', { name: /^Yours ·/u }),
  ).toBeVisible();
  await expect(prompt.getByRole('button').allTextContents()).resolves.toEqual([
    'Reload from disk',
    'Keep mine',
    'Skip',
  ]);
  await expect(prompt.getByRole('button', { name: 'Skip' })).toBeFocused();
  await prompt.getByRole('button', { name: 'Skip' }).click();
  await expect(prompt).toHaveCount(0);
});

test('FT-VS-05 exposes acknowledged autosave control and truthful save status wiring', async ({
  page,
}) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Settings' }).click();
  const menu = page.getByRole('menu', { name: 'Settings menu' });
  const autosave = menu.getByRole('checkbox', { name: 'Autosave' });
  await expect(autosave).toBeChecked();
  await autosave.uncheck();
  await expect(autosave).not.toBeChecked();
  await autosave.check();
  await expect(autosave).toBeChecked();
  await expect(
    menu.getByRole('menuitem', { name: 'Format on save' }),
  ).toBeDisabled();
  await expect(
    menu.getByRole('menuitem', { name: 'Lint on save' }),
  ).toBeDisabled();

  await expect(page.locator('footer')).toContainText('Not saved');
  await expect(page.locator('[data-write-in-flight="true"]')).toHaveCount(0);
  await expect(
    page.locator('[data-notification-code="automatic-save"]'),
  ).toHaveCount(0);
});
