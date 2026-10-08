import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Page } from '@playwright/test';

import { expect, test } from '../support/harness';

const SHELL = '[data-testid="application-shell"]';

async function chooseViewerDefault(page: Page): Promise<void> {
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const menu = page.getByRole('menu', { name: 'Settings menu' });
    await menu.getByRole('menuitemradio', { name: 'Reading (Viewer)', exact: true }).click();
    await expect(menu.getByRole('menuitemradio', { name: 'Reading (Viewer)', exact: true })).toHaveAttribute(
        'aria-checked',
        'true',
    );
    await page.keyboard.press('Escape');
}

test('a file argument opens in the only tab', async ({ app }) => {
    const file = await app.writeDocument('argument.md', '# From the command line\n');
    await app.launch([file]);
    const { page } = app;

    await expect(page.getByRole('tab', { name: 'argument.md' })).toBeVisible();
    await expect(page.getByRole('tab')).toHaveCount(1);
    await expect(page.locator('[data-editor-surface]')).toBeVisible();
    app.expectNoForeignRequests();
});

test('a folder argument shows the folder tree', async ({ app }) => {
    const folder = join(app.documentDirectory, 'argument-folder');
    await mkdir(folder);
    await app.writeDocument('argument-folder/chapter.md', '# Chapter\n');
    await app.launch([folder]);

    await expect(app.page.getByRole('treeitem', { name: 'argument-folder', exact: true })).toBeVisible();
});

test('a flag before the file argument is skipped', async ({ app }) => {
    const file = await app.writeDocument('after-flag.md', '# After the flag\n');
    await app.launch(['-psn_0_1', file]);

    await expect(app.page.getByRole('tab', { name: 'after-flag.md' })).toBeVisible();
});

test('a missing file argument reports the missing file and keeps the Untitled tab', async ({ app }) => {
    await app.launch([join(app.documentDirectory, 'missing.md')]);
    const { page } = app;

    await expect(page.getByText('The file no longer exists.').first()).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Untitled' })).toBeVisible();
    await expect(page.getByRole('tab')).toHaveCount(1);
});

test('an unsupported file argument reports the file type and opens no tab for it', async ({ app }) => {
    const unsupported = await app.writeDocument('server.log', 'line one\n');
    await app.launch([unsupported]);
    const { page } = app;

    await expect(page.getByText('The selected file type is not supported.').first()).toBeVisible();
    await expect(page.getByRole('tab', { name: 'server.log' })).toHaveCount(0);
});

test('a launched file is first in Recent Items', async ({ app }) => {
    const earlier = await app.writeDocument('earlier.md', '# Earlier\n');
    const launched = await app.writeDocument('launched.md', '# Launched\n');
    await app.seedRecents([earlier]);
    await app.launch([launched]);
    const { page } = app;

    await expect(page.getByRole('tab', { name: 'launched.md' })).toBeVisible();
    await page.getByRole('button', { name: 'File', exact: true }).click();
    const recents = page.getByRole('menu', { name: 'File' }).getByRole('menuitem', { name: /\.md$/u });
    await expect(recents.first()).toHaveAccessibleName('launched.md');
    await expect(recents.nth(1)).toHaveAccessibleName('earlier.md');
});

test('with the Viewer default a file argument starts in Reading mode', async ({ app }) => {
    const file = await app.writeDocument('viewer.md', '# Viewer\n\nBody paragraph.\n');
    await app.launch([file]);
    const { page } = app;
    await expect(page.getByRole('tab', { name: 'viewer.md' })).toBeVisible();
    await expect(page.locator(SHELL)).not.toHaveAttribute('data-reading', /.*/u);
    await chooseViewerDefault(page);

    await app.relaunch();

    await expect(page.locator(SHELL)).toHaveAttribute('data-reading', 'true');
    await expect(page.locator('section[aria-label="Preview pane"]')).toContainText('Body paragraph.');
});

test('with the Viewer default a folder argument opens the tree without Reading mode', async ({ app }) => {
    const folder = join(app.documentDirectory, 'viewer-folder');
    await mkdir(folder);
    await app.writeDocument('viewer-folder/chapter.md', '# Chapter\n');
    await app.launch([folder]);
    const { page } = app;
    await expect(page.getByRole('treeitem', { name: 'viewer-folder', exact: true })).toBeVisible();
    await chooseViewerDefault(page);

    await app.relaunch();

    await expect(page.getByRole('treeitem', { name: 'viewer-folder', exact: true })).toBeVisible();
    await expect(page.locator(SHELL)).not.toHaveAttribute('data-reading', /.*/u);
});
