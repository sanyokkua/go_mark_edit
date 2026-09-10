import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { Page } from '@playwright/test';

import { expect, test } from '../support/harness';

function settingsDatabaseDirectory(profileDirectory: string): string {
  return join(profileDirectory, 'settings.db');
}

async function requestNativeQuit(page: Page): Promise<void> {
  await page.evaluate(() => {
    const root = globalThis as unknown as {
      runtime?: { Quit?: () => void };
    };
    if (root.runtime?.Quit === undefined) {
      throw new Error('the Wails runtime Quit binding is absent');
    }
    root.runtime.Quit();
  });
}

function failureSurface(page: Page) {
  return page.locator('[role="status"][aria-label^="GoMarkEdit could not"]');
}

async function breakSettingsDatabase(profileDirectory: string): Promise<void> {
  await mkdir(settingsDatabaseDirectory(profileDirectory), { recursive: true });
}

test('quitting from the pre-ready failure screen exits the application process', async ({
  app,
}) => {
  await breakSettingsDatabase(app.profileDirectory);
  await app.launch();

  const failure = failureSurface(app.page);
  await expect(failure).toBeVisible();
  await expect(
    failure.getByRole('heading', { name: 'GoMarkEdit could not start' }),
  ).toBeVisible();
  await expect(failure).toContainText(/Settings:\s+\S/u);
  await expect(failure).not.toContainText(app.profileDirectory);
  await expect(failure).not.toContainText('settings.db');
  await expect(failure.getByRole('button', { name: 'Retry' })).toBeVisible();
  await expect(failure.getByRole('button', { name: 'Quit' })).toBeVisible();

  const appPid = app.appChildPid;
  expect(appPid).toEqual(expect.any(Number));
  await failure.getByRole('button', { name: 'Quit' }).click();
  await app.waitForAppExit(20_000);
});

test('retrying a failed settings startup mounts the shell once and can quit cleanly', async ({
  app,
}) => {
  const settingsDatabase = settingsDatabaseDirectory(app.profileDirectory);
  await breakSettingsDatabase(app.profileDirectory);
  await app.launch();

  const failure = failureSurface(app.page);
  await expect(failure).toBeVisible();
  await expect(failure).toContainText(/Settings:\s+\S/u);
  await expect(
    failure.getByRole('button', { name: 'Retry', exact: true }),
  ).toHaveCount(1);
  await expect(
    failure.getByRole('button', { name: 'Quit', exact: true }),
  ).toHaveCount(1);

  await rm(settingsDatabase, { force: true, recursive: true });
  const retry = failure.getByRole('button', { name: 'Retry', exact: true });
  await retry.evaluate((button): void => {
    button.click();
    button.click();
  });

  await expect(app.page.getByRole('toolbar')).toBeVisible({ timeout: 20_000 });
  await expect(failure).toHaveCount(0);

  const appPid = app.appChildPid;
  expect(appPid).toEqual(expect.any(Number));
  await requestNativeQuit(app.page);
  await app.waitForAppExit(20_000);
});

test('a pre-ready quit request is discovered after startup recovery', async ({
  app,
}) => {
  const settingsDatabase = settingsDatabaseDirectory(app.profileDirectory);
  await breakSettingsDatabase(app.profileDirectory);
  await app.launch();

  const failure = failureSurface(app.page);
  await expect(failure).toBeVisible();
  await requestNativeQuit(app.page);
  await rm(settingsDatabase, { force: true, recursive: true });

  await failure.getByRole('button', { name: 'Retry', exact: true }).click();
  await app.waitForAppExit(20_000);
});
