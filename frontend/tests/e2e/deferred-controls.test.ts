import { expect, test } from '../support/harness';

test('keeps deferred Assistant, Export, and Open Folder surfaces visible but disabled without a custom frame', async ({
  app,
}) => {
  await app.launch();

  const { page } = app;
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(page.getByTestId('application-shell')).toBeVisible();

  const toolbar = page.getByRole('toolbar', { name: 'Document toolbar' });
  for (const id of ['format', 'compact', 'lint'] as const) {
    await expect(toolbar.locator(`[data-action-id="${id}"]`)).toBeDisabled();
  }

  const assistant = page.getByRole('button', { name: 'Toggle Assistant' });
  await expect(assistant).toBeVisible();
  await expect(assistant).toBeDisabled();

  await page.getByRole('button', { name: 'File', exact: true }).click();
  const fileMenu = page.getByRole('menu', { name: 'File' });
  await expect(
    fileMenu.getByRole('menuitem', { name: 'Open Folder', exact: true }),
  ).toBeDisabled();
  await expect(
    fileMenu.getByRole('menuitem', { name: 'Export to PDF', exact: true }),
  ).toBeDisabled();
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'View', exact: true }).click();
  const viewMenu = page.getByRole('menu', { name: 'View options' });
  await expect(
    viewMenu.getByRole('menuitem', { name: 'Toggle Assistant' }),
  ).toBeDisabled();
  await expect(
    viewMenu.getByRole('menuitem', { name: 'Distraction-free reading' }),
  ).toBeDisabled();
  await page.keyboard.press('Escape');

  const shell = page.getByTestId('application-shell');
  const columns = await shell.evaluate((element) =>
    getComputedStyle(element).gridTemplateColumns.split(/\s+/u),
  );
  expect(columns).toHaveLength(3);
  expect(Number.parseFloat(columns[2] ?? 'NaN')).toBe(0);
  await expect(shell.locator('.lights')).toHaveCount(0);
  await expect(
    shell.locator('[class*="traffic"], [class*="windowControl"]'),
  ).toHaveCount(0);
});
