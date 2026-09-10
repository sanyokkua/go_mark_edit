import { expect, test } from '../support/harness';

test('cancelling a dirty quit leaves the next quit with a new close decision', async ({
  app,
}) => {
  const source = await app.writeDocument('draft.md', '# Draft\n');
  await app.seedRecents([source]);
  await app.launch();

  const settingsTrigger = app.page.locator('[data-settings-opener]');
  await settingsTrigger.click();
  const settingsMenu = app.page.locator(
    '[data-viewport-popup="settings-menu"]',
  );
  const autosave = settingsMenu.getByRole('checkbox', { name: 'Autosave' });
  await expect(autosave).toBeChecked();
  await autosave.click();
  await expect(autosave).not.toBeChecked({ timeout: 15_000 });
  await settingsTrigger.click();

  const untitled = app.page.getByRole('tab', { name: 'Untitled' });
  await untitled
    .locator('..')
    .getByRole('button', { name: /^Close /u })
    .click();
  const launcher = app.page.getByTestId('document-launcher');
  await expect(launcher).toBeVisible();
  await launcher.getByRole('button', { name: 'draft.md' }).click();
  await expect(app.page.getByRole('tab', { name: 'draft.md' })).toBeVisible();

  const editor = app.page.locator('[data-editor-surface] textarea').first();
  await expect(editor).toBeVisible();
  await editor.focus();
  await editor.press('ControlOrMeta+A');
  await app.page.keyboard.insertText('# Changed\n');
  await expect
    .poll(() =>
      app.page
        .locator('[data-editor-surface]')
        .evaluate((element) => element.textContent ?? ''),
    )
    .toContain('Changed');
  await expect(
    app.page.locator('[aria-label="Document identity"]'),
  ).toContainText('Unsaved changes', { timeout: 15_000 });

  await app.page.evaluate(() => {
    const root = globalThis as unknown as {
      runtime?: { Quit?: () => void };
    };
    if (root.runtime?.Quit === undefined) {
      throw new Error('the Wails runtime Quit binding is absent');
    }
    root.runtime.Quit();
  });
  const closePrompt = app.page.locator('[data-close-prompt]');
  await expect(closePrompt).toBeVisible({ timeout: 15_000 });
  await expect(closePrompt).toHaveAttribute('data-close-kind', 'quit');
  await closePrompt.locator('[data-close-choice="cancel"]').click();
  await expect(closePrompt).toHaveCount(0, { timeout: 10_000 });

  await app.page.evaluate(() => {
    const root = globalThis as unknown as {
      runtime?: { Quit?: () => void };
    };
    if (root.runtime?.Quit === undefined) {
      throw new Error('the Wails runtime Quit binding is absent');
    }
    root.runtime.Quit();
  });
  await expect(closePrompt).toBeVisible({ timeout: 15_000 });
  await expect(closePrompt).toHaveAttribute('data-close-kind', 'quit');
  await expect(closePrompt.locator('[data-close-target]')).toHaveCount(1);
  await closePrompt.locator('[data-close-choice="cancel"]').click();
});
