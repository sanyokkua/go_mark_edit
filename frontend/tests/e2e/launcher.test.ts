import { expect, test } from '../support/harness';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

test('shows the launcher frame, actions, type scale, and recent files', async ({ app }) => {
    const recentFiles = await Promise.all(
        Array.from({ length: 6 }, (_, index) => app.writeDocument(`recent-${index + 1}.md`, `# Recent ${index + 1}`)),
    );
    await app.seedRecents(recentFiles);
    await app.launch();

    const { page } = app;
    const initialTab = page.getByRole('tab', { name: 'Untitled' });
    await expect(initialTab).toBeVisible();
    await initialTab
        .locator('..')
        .getByRole('button', { name: /^Close /u })
        .click();

    const frame = page.locator('.application-frame');
    await expect(frame).toBeVisible();
    const launcher = page.getByTestId('document-launcher');
    await expect(launcher).toBeVisible();
    await expect(launcher.getByRole('heading', { level: 1 })).toHaveCSS('font-size', '20px');
    await expect(launcher.locator('p').first()).toHaveCSS('font-size', '12.5px');
    await expect(launcher.getByRole('button', { name: 'New File' })).toBeVisible();
    await expect(launcher.getByRole('button', { name: 'Open File' })).toBeVisible();
    await expect(launcher.getByRole('button', { name: 'Open Folder' })).toBeEnabled();
    await expect(launcher.getByRole('listitem')).toHaveCount(6);
    await expect(launcher.getByRole('listitem').first()).toContainText('recent-1.md');
});

test('opens seeded file and folder recent items from the launcher', async ({ app }) => {
    const folder = join(app.documentDirectory, 'recent-folder');
    await mkdir(folder);
    const file = await app.writeDocument('recent-file.md', '# Recent file\n');
    await app.seedRecents([
        { path: folder, kind: 'folder' },
        { path: file, kind: 'file' },
    ]);
    await app.launch();
    const { page } = app;
    await page
        .getByRole('tab', { name: 'Untitled' })
        .locator('..')
        .getByRole('button', { name: /^Close /u })
        .click();
    const launcher = page.getByTestId('document-launcher');
    const entries = launcher.getByRole('listitem');
    await expect(entries).toHaveCount(2);
    await expect(entries.nth(0).locator('svg')).toHaveAttribute('data-icon-name', 'folder');
    await expect(entries.nth(1).locator('svg')).toHaveAttribute('data-icon-name', 'file');
    await entries.nth(0).getByRole('button', { name: 'recent-folder' }).click();
    await expect(page.getByRole('treeitem', { name: 'recent-folder', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Close Folder' }).click();
    await launcher.getByRole('button', { name: 'recent-file.md' }).click();
    await expect(page.getByRole('tab', { name: 'recent-file.md' })).toBeVisible();
});
