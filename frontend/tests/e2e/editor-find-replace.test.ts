import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';

import { expect, test } from '../support/harness';

async function openRecent(page: Page, filename: string): Promise<void> {
    await page.getByTestId('document-launcher').getByRole('button', { name: filename, exact: true }).click();
    await expect(page.getByRole('tab', { name: filename })).toBeVisible();
}

async function disableAutosave(page: Page): Promise<void> {
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const menu = page.getByRole('menu', { name: 'Settings menu' });
    const autosave = menu.getByRole('checkbox', { name: 'Autosave' });
    if (await autosave.isChecked()) await menu.locator('[data-settings-toggle="Autosave"]').click();
    await page.keyboard.press('Escape');
}

async function focusEditor(page: Page): Promise<void> {
    await page.locator('[data-editor-surface] .view-lines').first().click();
    await expect(page.locator('[data-editor-surface] textarea').first()).toBeFocused();
}

async function editorModifier(page: Page): Promise<'Control' | 'Meta'> {
    return page.evaluate(() => (navigator.userAgent.includes('Macintosh') ? 'Meta' : 'Control'));
}

test('finds and replaces within the active document through Monaco while preserving undo and saving bytes', async ({
    app,
}) => {
    const original = '# Search\n\nalpha Alpha alpha\n';
    const source = await app.writeDocument('find-replace.md', original);
    await app.seedRecents([source]);
    await app.launch();
    const { page } = app;
    page.setDefaultTimeout(8_000);
    await openRecent(page, 'find-replace.md');
    await expect(page.locator('[data-editor-surface] .view-lines').first()).toContainText('alpha Alpha alpha');
    await disableAutosave(page);
    const modifier = await editorModifier(page);
    await page.getByRole('radiogroup', { name: 'View arrangement' }).getByRole('radio', { name: 'Split' }).click();
    await focusEditor(page);

    await page.keyboard.press('ControlOrMeta+f');
    const widget = page.locator('[data-editor-surface] .find-widget');
    await expect(widget).toBeVisible();
    const findInput = widget.locator('.find-part textarea').first();
    await findInput.fill('alpha');
    await expect(widget.locator('.matchesCount')).toContainText('3');
    await findInput.press('Enter');
    await expect(widget.locator('.matchesCount')).toContainText(/\d of 3/u);
    await widget.getByRole('checkbox', { name: /^Match Case/u }).click();
    await expect(widget.locator('.matchesCount')).toContainText('2');
    await widget.getByRole('checkbox', { name: /^Match Whole Word/u }).click();
    await findInput.fill('alph');
    await expect(widget.locator('.matchesCount')).toContainText('No results');
    await widget.getByRole('checkbox', { name: /^Match Whole Word/u }).click();
    await expect(widget.locator('.matchesCount')).toContainText('2');
    await widget.getByRole('checkbox', { name: /^Use Regular Expression/u }).click();
    await findInput.fill('alph(a|A)');
    await expect(widget.locator('.matchesCount')).toContainText('2');
    await widget.getByRole('checkbox', { name: /^Match Case/u }).click();
    await expect(widget.locator('.matchesCount')).toContainText('3');
    await widget.getByRole('checkbox', { name: /^Use Regular Expression/u }).click();
    await findInput.fill('alpha');

    await findInput.press('ControlOrMeta+r');
    const replaceInput = widget.locator('.replace-part textarea').first();
    await expect(replaceInput).toBeVisible();
    await replaceInput.fill('beta');
    await widget.getByRole('button', { name: /Replace All/u }).click();
    await expect(page.locator('[data-editor-surface] .view-lines').first()).toContainText('beta beta beta');
    await expect(page.getByRole('region', { name: 'Preview pane' })).toContainText('beta beta beta');
    await expect(page.locator('[aria-label="Document identity"]')).toContainText('Unsaved changes');

    await focusEditor(page);
    await page.keyboard.press(`${modifier}+z`);
    await expect(page.locator('[data-editor-surface] .view-lines').first()).toContainText('alpha Alpha alpha');
    await page.keyboard.press(modifier === 'Meta' ? 'Meta+Alt+f' : 'Control+h');
    await expect(replaceInput).toBeVisible();
    await findInput.fill('Alpha');
    await replaceInput.fill('Beta');
    await widget.getByRole('button', { name: /^Replace(?: \(.+\))?$/u }).click();
    await expect(page.locator('[data-editor-surface] .view-lines').first()).toContainText('alpha Beta alpha');
    await focusEditor(page);
    await page.keyboard.press('ControlOrMeta+s');
    await expect(page.locator('[data-notification-code="save-success"]')).toHaveCount(1);
    expect(await readFile(source, 'utf8')).toBe('# Search\n\nalpha Beta alpha\n');
    app.expectNoForeignRequests();
});

test('Find remains available in a read-only document while Replace and modal shortcuts cannot edit', async ({
    app,
}) => {
    const original = '# Read only\ralpha alpha\n';
    const source = await app.writeDocument('read-only-find.md', original);
    await app.seedRecents([source]);
    await app.launch();
    const { page } = app;
    page.setDefaultTimeout(8_000);
    await openRecent(page, 'read-only-find.md');
    await expect(page.locator('[data-editor-surface] .view-lines').first()).toContainText('alpha alpha');
    await focusEditor(page);

    await page.keyboard.press('ControlOrMeta+f');
    const widget = page.locator('[data-editor-surface] .find-widget');
    await expect(widget).toBeVisible();
    const findInput = widget.locator('.find-part textarea').first();
    await findInput.fill('alpha');
    await expect(widget.locator('.matchesCount')).toContainText('2');
    await findInput.press('ControlOrMeta+r');
    await expect(widget.locator('.replace-part textarea').first()).not.toBeVisible();

    await widget.getByRole('button', { name: /^Close/u }).click();
    await expect(widget).toHaveAttribute('aria-hidden', 'true');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('menu', { name: 'Settings menu' }).getByRole('menuitem', { name: 'All settings…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Settings' });
    await expect(dialog).toBeVisible();
    await page.keyboard.press('ControlOrMeta+f');
    await page.keyboard.press('ControlOrMeta+r');
    await expect(dialog).toBeVisible();
    await expect(widget).toHaveAttribute('aria-hidden', 'true');
    await expect(widget.locator('.replace-part textarea').first()).not.toBeVisible();
    expect(await readFile(source, 'utf8')).toBe(original);
    app.expectNoForeignRequests();
});
