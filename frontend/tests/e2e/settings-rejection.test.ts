import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { expect, test } from '../support/harness';

const execFileAsync = promisify(execFile);

async function addAppearanceRejectionTrigger(
  repositoryDirectory: string,
  profileDirectory: string,
): Promise<void> {
  await execFileAsync(
    process.env.GO_BIN ?? 'go',
    ['run', './tools/e2e-seed', profileDirectory, 'add-trigger', 'appearance'],
    {
      cwd: repositoryDirectory,
      env: { ...process.env },
      maxBuffer: 1024 * 1024,
    },
  );
}

test('a rejected appearance update keeps the acknowledged theme across a relaunch', async ({
  app,
}) => {
  const source = await app.writeDocument('settings.md', '# Settings');
  await app.seedRecents([source]);
  await addAppearanceRejectionTrigger(
    app.repositoryDirectory,
    app.profileDirectory,
  );
  await app.launch();

  const root = app.page.locator('html');
  await expect(root).toHaveAttribute('data-theme', 'material');

  const settingsTrigger = app.page.locator('[data-settings-opener]');
  await settingsTrigger.click();
  const settingsMenu = app.page.locator(
    '[data-viewport-popup="settings-menu"]',
  );
  await expect(settingsMenu).toBeVisible();
  await settingsMenu.getByRole('radio', { name: 'Liquid Glass' }).click();

  const error = app.page.locator('[data-notification-code="io"]');
  await expect(error).toHaveCount(1, { timeout: 15_000 });
  await expect(app.page.locator('[data-notification-code="io"]')).toHaveCount(
    1,
  );
  await expect(root).toHaveAttribute('data-theme', 'material');
  await expect(
    settingsMenu.getByRole('radio', { name: 'Material' }),
  ).toHaveAttribute('aria-checked', 'true');

  await app.relaunch();
  await expect(app.page.locator('html')).toHaveAttribute(
    'data-theme',
    'material',
  );
  await app.page.locator('[data-settings-opener]').click();
  const relaunchedSettings = app.page.locator(
    '[data-viewport-popup="settings-menu"]',
  );
  await expect(relaunchedSettings).toBeVisible();
  await expect(
    relaunchedSettings.getByRole('radio', { name: 'Material' }),
  ).toHaveAttribute('aria-checked', 'true');
});
