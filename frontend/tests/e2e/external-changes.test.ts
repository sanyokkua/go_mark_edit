import type { Page } from '@playwright/test';
import { readFile, utimes, writeFile } from 'node:fs/promises';

import { expect, test } from '../support/harness';

async function openDocuments(page: Page): Promise<void> {
    await page.getByTestId('document-launcher').getByRole('button', { name: 'a.md', exact: true }).click();
    for (const name of ['b.md', 'c.md']) {
        await page.getByRole('button', { name: 'File', exact: true }).click();
        await page.getByRole('menu', { name: 'File' }).getByRole('menuitem', { name, exact: true }).click();
    }
    await expect(page.getByRole('tab', { name: 'c.md' })).toHaveAttribute('aria-selected', 'true');
}

async function closeTab(page: Page, name: string): Promise<void> {
    await page
        .getByRole('tab', { name })
        .locator('..')
        .getByRole('button', { name: /^Close /u })
        .click();
}

async function reloadPrompt(page: Page, name: string): Promise<void> {
    const prompt = page.getByRole('dialog', { name: 'File changed on disk' });
    await expect(prompt).toBeVisible();
    await expect(prompt).toContainText(name);
    await prompt.getByRole('button', { name: 'Reload from disk' }).click();
}

test('focus checks background files in tab order without changing the active document', async ({ app }) => {
    const a = await app.writeDocument('a.md', '# Original A\n');
    const b = await app.writeDocument('b.md', '# Original B\n');
    const c = await app.writeDocument('c.md', '# Original C\n');
    const timestamp = new Date('2020-01-01T00:00:00Z');
    await utimes(a, timestamp, timestamp);
    await app.seedRecents([a, b, c]);
    await app.launch();
    await openDocuments(app.page);

    // A retains both its size and modification time despite different contents.
    await writeFile(a, '# External A\n');
    await utimes(a, timestamp, timestamp);
    await writeFile(b, '# External B\n');
    await app.page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await reloadPrompt(app.page, 'a.md');
    await reloadPrompt(app.page, 'b.md');
    await expect(app.page.getByRole('dialog', { name: 'File changed on disk' })).toHaveCount(0);
    await expect(app.page.getByRole('tab', { name: 'c.md' })).toHaveAttribute('aria-selected', 'true');
    await expect(app.page.locator('[data-editor-surface] .view-lines').first()).toContainText('Original C');

    await app.page.getByRole('tab', { name: 'a.md' }).click();
    await expect(app.page.locator('[data-editor-surface] .view-lines').first()).toContainText('External A');
    await app.page.getByRole('tab', { name: 'b.md' }).click();
    await expect(app.page.locator('[data-editor-surface] .view-lines').first()).toContainText('External B');
    expect(await readFile(a, 'utf8')).toBe('# External A\n');
    expect(await readFile(b, 'utf8')).toBe('# External B\n');
    expect(await readFile(c, 'utf8')).toBe('# Original C\n');
});

test('closing active tabs checks each newly activated file for external changes', async ({ app }) => {
    const a = await app.writeDocument('a.md', '# Original A\n');
    const b = await app.writeDocument('b.md', '# Original B\n');
    const c = await app.writeDocument('c.md', '# Original C\n');
    await app.seedRecents([a, b, c]);
    await app.launch();
    await openDocuments(app.page);

    await writeFile(a, '# External A\n');
    await writeFile(b, '# External B\n');
    await closeTab(app.page, 'c.md');
    await reloadPrompt(app.page, 'b.md');
    await expect(app.page.getByRole('tab', { name: 'b.md' })).toHaveAttribute('aria-selected', 'true');
    await expect(app.page.locator('[data-editor-surface] .view-lines').first()).toContainText('External B');
    await closeTab(app.page, 'b.md');
    await reloadPrompt(app.page, 'a.md');
    await expect(app.page.getByRole('tab', { name: 'a.md' })).toHaveAttribute('aria-selected', 'true');
    await expect(app.page.locator('[data-editor-surface] .view-lines').first()).toContainText('External A');
    expect(await readFile(a, 'utf8')).toBe('# External A\n');
    expect(await readFile(b, 'utf8')).toBe('# External B\n');
    expect(await readFile(c, 'utf8')).toBe('# Original C\n');
});
