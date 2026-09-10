import type { Page } from '@playwright/test';
import { chmod, readFile, unlink, writeFile } from 'node:fs/promises';

import { expect, test } from '../support/harness';

interface ActiveState {
  data?: {
    activeBuffer?: {
      content?: string;
    } | null;
  };
}

async function activeBufferContent(page: Page): Promise<string> {
  return page.evaluate(async (): Promise<string> => {
    const root = globalThis as unknown as {
      go?: {
        appmodel?: {
          AppModelHandler?: {
            GetState?: (request: { id: string }) => Promise<unknown>;
          };
        };
      };
    };
    const getState = root.go?.appmodel?.AppModelHandler?.GetState;
    if (getState === undefined) {
      throw new Error(
        'the generated AppModelHandler.GetState binding is absent',
      );
    }
    const state = (await getState({ id: crypto.randomUUID() })) as ActiveState;
    return state.data?.activeBuffer?.content ?? '';
  });
}

async function closeTab(page: Page, filename: string): Promise<void> {
  const tab = page.getByRole('tab', { name: filename });
  await expect(tab).toBeVisible();
  await tab
    .locator('..')
    .getByRole('button', { name: /^Close /u })
    .click();
}

async function openRecentFromLauncher(
  page: Page,
  filename: string,
): Promise<void> {
  await closeTab(page, 'Untitled');
  const launcher = page.getByTestId('document-launcher');
  await expect(launcher).toBeVisible();
  await launcher.getByRole('button', { name: filename, exact: true }).click();
  await expect(page.getByRole('tab', { name: filename })).toBeVisible();
}

async function openRecentFromFileMenu(
  page: Page,
  filename: string,
): Promise<void> {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const menu = page.getByRole('menu', { name: 'File' });
  await menu.getByRole('menuitem', { name: filename, exact: true }).click();
  await expect(page.getByRole('tab', { name: filename })).toBeVisible();
}

async function disableAutosave(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const menu = page.getByRole('menu', { name: 'Settings menu' });
  const autosave = menu.getByRole('checkbox', { name: 'Autosave' });
  if (await autosave.isChecked()) {
    await menu.locator('[data-settings-toggle="Autosave"]').click();
  }
  await page.keyboard.press('Escape');
}

async function editorModifier(page: Page): Promise<'Control' | 'Meta'> {
  return page.evaluate(() =>
    navigator.userAgent.includes('Macintosh') ? 'Meta' : 'Control',
  );
}

async function tabOrder(page: Page): Promise<(string | null)[]> {
  return page
    .getByRole('tab')
    .evaluateAll((tabs) =>
      tabs.map((tab) => tab.getAttribute('data-document-id')),
    );
}

async function editDocument(page: Page, content: string): Promise<void> {
  const editor = page.locator('[data-editor-surface] textarea').first();
  await expect(editor).toBeVisible();
  await page.locator('[data-editor-surface] .view-lines').first().click();
  await expect(editor).toBeFocused();
  const modifier = await editorModifier(page);
  await editor.press(`${modifier}+A`);
  await page.keyboard.insertText(content);
  await expect.poll(() => activeBufferContent(page)).toBe(content);
}

// Proves: FR-006
test('creates a document, opens Recents, saves once, moves tabs, and restores saved state', async ({
  app,
}) => {
  const original = '# First document\n\nBefore the edit.\n';
  const saved = '# First document\n\nSaved from the real editor.\n';
  const first = await app.writeDocument('first.md', original);
  const second = await app.writeDocument('second.md', '# Second document\n');
  await app.seedRecents([first, second]);
  await app.launch();

  await app.page.getByRole('button', { name: 'File', exact: true }).click();
  await app.page
    .getByRole('menu', { name: 'File' })
    .getByRole('menuitem', { name: 'New File', exact: true })
    .click();
  await expect(app.page.getByRole('tab')).toHaveCount(2);
  const newDocumentTab = app.page.getByRole('tab').nth(1);
  await expect(newDocumentTab).toBeVisible();
  await newDocumentTab
    .locator('..')
    .getByRole('button', { name: /^Close /u })
    .click();
  await expect(app.page.getByRole('tab')).toHaveCount(1);

  await openRecentFromLauncher(app.page, 'first.md');
  await openRecentFromFileMenu(app.page, 'second.md');
  const beforeMove = await tabOrder(app.page);
  expect(beforeMove).toHaveLength(2);

  await app.page.getByRole('tab', { name: 'second.md' }).click({
    button: 'right',
  });
  const tabMenu = app.page.getByRole('menu', { name: 'Tab actions' });
  await tabMenu
    .getByRole('menuitem', { name: 'Move tab left', exact: true })
    .click();
  await expect(
    app.page.getByRole('status').filter({ hasText: 'Moved' }),
  ).toContainText('position 1 of 2');
  expect(await tabOrder(app.page)).toEqual([beforeMove[1], beforeMove[0]]);

  await app.page.getByRole('tab', { name: 'first.md' }).click();
  await disableAutosave(app.page);
  await editDocument(app.page, saved);
  await app.page.keyboard.press('ControlOrMeta+S');
  await expect(
    app.page.locator('[data-notification-code="save-success"]'),
  ).toHaveCount(1);
  await expect(
    app.page.locator('[aria-label="Document identity"]'),
  ).toContainText('Saved');
  expect(await readFile(first, 'utf8')).toBe(saved);

  await app.relaunch();
  await expect(app.page.getByRole('tab', { name: 'Untitled' })).toBeVisible();
  await openRecentFromLauncher(app.page, 'first.md');
  await expect(
    app.page.locator('[aria-label="Document identity"]'),
  ).toContainText('Saved');
  await expect(
    app.page.locator('[data-editor-surface] .view-lines').first(),
  ).toContainText('Saved from the real editor.');
  expect(await readFile(first, 'utf8')).toBe(saved);
});

// Proves: FR-033
test('reveals a missing real file and completes Save to recreate and Copy path remediations', async ({
  app,
}) => {
  const original = '# Recover me\n\nThe buffer remains available.\n';
  const source = await app.writeDocument('recover.md', original);
  await app.seedRecents([source]);
  await app.launch();
  await openRecentFromLauncher(app.page, 'recover.md');

  await unlink(source);
  await app.page.getByRole('tab', { name: 'recover.md' }).click({
    button: 'right',
  });
  await app.page
    .getByRole('menu', { name: 'Tab actions' })
    .getByRole('menuitem', { name: 'Reveal in file manager', exact: true })
    .click();

  const missing = app.page.locator('[data-notification-code="not_found"]');
  await expect(missing).toHaveCount(1);
  await expect(missing).toContainText('The document could not be found.');
  await expect(missing).not.toContainText(source);
  await expect(
    missing.getByRole('button', { name: 'Save to recreate' }),
  ).toBeEnabled();
  await expect(
    missing.getByRole('button', { name: 'Copy path' }),
  ).toBeEnabled();

  await missing.getByRole('button', { name: 'Save to recreate' }).click();
  await expect(
    app.page.locator('[data-notification-code="save-success"]'),
  ).toHaveCount(1);
  expect(await readFile(source, 'utf8')).toBe(original);
  await expect(
    app.page.locator('[aria-label="Document identity"]'),
  ).toContainText('Saved');

  await unlink(source);
  await app.page.getByRole('tab', { name: 'recover.md' }).click({
    button: 'right',
  });
  await app.page
    .getByRole('menu', { name: 'Tab actions' })
    .getByRole('menuitem', { name: 'Reveal in file manager', exact: true })
    .click();
  const secondMissing = app.page.locator(
    '[data-notification-code="not_found"]',
  );
  await expect(secondMissing).toHaveCount(1);
  await secondMissing.getByRole('button', { name: 'Copy path' }).click();
  await expect(
    app.page
      .getByRole('status')
      .filter({ hasText: 'Copied path for recover.md' }),
  ).toHaveCount(1);
  await expect(secondMissing).toHaveCount(0);
});

// Proves: FR-033
test('offers Retry for a transient Save inspection refusal and commits after recovery', async ({
  app,
}) => {
  const original = '# Retry me\n\nBefore.\n';
  const refusedContent = '# Retry me\n\nAfter the directory is restored.\n';
  const source = await app.writeDocument('retry.md', original);
  await app.seedRecents([source]);
  await app.launch();
  await openRecentFromLauncher(app.page, 'retry.md');
  await disableAutosave(app.page);
  await editDocument(app.page, refusedContent);

  await chmod(app.documentDirectory, 0o600);
  try {
    await app.page.keyboard.press('ControlOrMeta+S');
    const refusal = app.page.locator('[data-notification-code="io"]');
    await expect(refusal).toHaveCount(1);
    await expect(refusal).toContainText('The document could not be inspected.');
    await expect(refusal.getByRole('button', { name: 'Retry' })).toBeEnabled();

    await chmod(app.documentDirectory, 0o755);
    await refusal.getByRole('button', { name: 'Retry' }).click();
    await expect(
      app.page.locator('[data-notification-code="save-success"]'),
    ).toHaveCount(1);
    await expect(refusal).toHaveCount(0);
    expect(await readFile(source, 'utf8')).toBe(refusedContent);
  } finally {
    await chmod(app.documentDirectory, 0o755);
  }
});

// Proves: FR-033
test('shows a bounded external-change prompt and keeps the active buffer on Skip', async ({
  app,
}) => {
  const original = '# Original buffer\n\nYours stays loaded.\n';
  const external = '# External version\n\nWritten by another process.\n';
  const source = await app.writeDocument('external.md', original);
  await app.seedRecents([source]);
  await app.launch();
  await openRecentFromLauncher(app.page, 'external.md');

  await writeFile(source, external, 'utf8');
  await app.page.evaluate(() => {
    window.dispatchEvent(new Event('focus'));
  });

  const prompt = app.page.getByRole('dialog', { name: 'File changed on disk' });
  await expect(prompt).toBeVisible();
  await expect(prompt).toContainText('external.md');
  await expect(prompt).toContainText('On disk');
  await expect(prompt).toContainText('Yours');
  await expect(prompt).not.toContainText(source);
  await expect(
    prompt.getByRole('button', { name: 'Reload from disk' }),
  ).toBeVisible();
  await expect(prompt.getByRole('button', { name: 'Keep mine' })).toBeVisible();
  await expect(prompt.getByRole('button', { name: 'Skip' })).toBeFocused();

  await prompt.getByRole('button', { name: 'Skip' }).click();
  await expect(prompt).toHaveCount(0);
  await expect(
    app.page.locator('[data-editor-surface] .view-lines').first(),
  ).toContainText('Yours stays loaded.');
  expect(await readFile(source, 'utf8')).toBe(external);
});
