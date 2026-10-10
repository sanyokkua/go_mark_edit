import { join } from 'node:path';
import type { Page } from '@playwright/test';

import { expect, test } from '../support/harness';

const EDITOR_LINES = '[data-editor-surface] .view-lines';

function settingsDialog(page: Page) {
    return page.getByRole('dialog', { name: 'Settings' });
}

test('Ctrl/Cmd+, opens the Settings dialog on Appearance and Up, Down, Home and End switch sections', async ({
    app,
}) => {
    await app.launch();
    const { page } = app;
    await page.setViewportSize({ width: 1280, height: 800 });

    await page.keyboard.press('ControlOrMeta+,');
    const dialog = settingsDialog(page);
    await expect(dialog).toBeVisible();
    await expect(page.getByRole('menu', { name: 'Settings menu' })).toHaveCount(0);
    await expect(dialog.getByRole('tab', { name: 'Appearance' })).toHaveAttribute('aria-selected', 'true');
    await expect(dialog.getByRole('tab')).toHaveText(['Appearance', 'Editor', 'Markdown', 'Workspace', 'Export']);

    await page.keyboard.press('ArrowDown');
    await expect(dialog.getByRole('tab', { name: 'Editor' })).toBeFocused();
    await expect(dialog.getByRole('tabpanel', { name: 'Editor' })).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await expect(dialog.getByRole('tabpanel', { name: 'Markdown' })).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await expect(dialog.getByRole('tabpanel', { name: 'Workspace' })).toBeVisible();
    await page.keyboard.press('End');
    await expect(dialog.getByRole('tabpanel', { name: 'Export' })).toBeVisible();
    await page.keyboard.press('ArrowUp');
    await expect(dialog.getByRole('tabpanel', { name: 'Workspace' })).toBeVisible();
    await page.keyboard.press('Home');
    await expect(dialog.getByRole('tabpanel', { name: 'Appearance' })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    // The Settings button still opens the quick menu, with All settings… leading to the dialog.
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(page.getByRole('menu', { name: 'Settings menu' })).toBeVisible();
    await page.getByRole('menuitem', { name: 'All settings…' }).click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('tab', { name: 'Appearance' })).toHaveAttribute('aria-selected', 'true');
});

test('Font size 16 resizes every open editor and survives a restart', async ({ app }) => {
    const first = await app.writeDocument('font-first.md', '# First\n\nAlpha.\n');
    const second = await app.writeDocument('font-second.md', '# Second\n\nBeta.\n');
    await app.seedRecents([first, second]);
    await app.launch();
    const { page } = app;
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.getByTestId('document-launcher').getByRole('button', { name: 'font-first.md' }).click();
    await page.getByRole('button', { name: 'File', exact: true }).click();
    await page.getByRole('menu', { name: 'File' }).getByRole('menuitem', { name: 'font-second.md' }).click();
    await expect(page.getByRole('tab', { name: 'font-second.md' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator(EDITOR_LINES).first()).toHaveCSS('font-size', '14px');

    await page.keyboard.press('ControlOrMeta+,');
    const dialog = settingsDialog(page);
    await dialog.getByRole('tab', { name: 'Editor' }).click();
    await dialog.getByRole('combobox', { name: 'Font size' }).selectOption('16');
    await expect(page.locator(EDITOR_LINES).first()).toHaveCSS('font-size', '16px');
    await page.keyboard.press('Escape');
    await page.getByRole('tab', { name: 'font-first.md' }).click();
    await expect(page.locator(EDITOR_LINES).first()).toHaveCSS('font-size', '16px');

    await app.relaunch();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('menuitem', { name: 'All settings…' }).click();
    await settingsDialog(page).getByRole('tab', { name: 'Editor' }).click();
    await expect(settingsDialog(page).getByRole('combobox', { name: 'Font size' })).toHaveValue('16');
    app.expectNoForeignRequests();
});

test('at 375 px the section list sits above the rows and nothing scrolls horizontally', async ({ app }) => {
    await app.launch();
    const { page } = app;
    await page.setViewportSize({ width: 375, height: 700 });

    await page.keyboard.press('ControlOrMeta+,');
    const dialog = settingsDialog(page);
    await expect(dialog).toBeVisible();
    for (const section of ['Appearance', 'Editor', 'Markdown', 'Workspace', 'Export']) {
        await dialog.getByRole('tab', { name: section }).click();
        const tablist = (await dialog.getByRole('tablist').boundingBox())!;
        const panel = (await dialog.getByRole('tabpanel').boundingBox())!;
        expect(tablist.y + tablist.height).toBeLessThanOrEqual(panel.y + 1);
        const overflow = await dialog.getByRole('tabpanel').evaluate((el) => el.scrollWidth - el.clientWidth);
        expect(overflow).toBeLessThanOrEqual(0);
        const box = (await dialog.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(375);
    }
    await page.screenshot({ path: test.info().outputPath('settings-dialog-375.png') });
});

test('Show hidden folders can be turned on in the dialog with no folder open and applies to the next folder', async ({
    app,
}) => {
    await app.writeDocument('notes/.notes/hidden-note.md', '# Hidden\n');
    await app.writeDocument('notes/readme.md', '# Readme\n');
    const root = join(app.documentDirectory, 'notes');
    await app.launch();
    const { page } = app;
    await page.setViewportSize({ width: 1280, height: 800 });

    await page.keyboard.press('ControlOrMeta+,');
    const dialog = settingsDialog(page);
    await dialog.getByRole('tab', { name: 'Workspace' }).click();
    const toggle = dialog.getByRole('switch', { name: 'Show hidden folders' });
    await expect(toggle).toBeEnabled();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    await app.openWorkspace(root);
    await expect(page.getByRole('treeitem', { name: '.notes', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Show hidden folders' })).toHaveAttribute('aria-pressed', 'true');

    await page.getByRole('button', { name: 'Show hidden folders' }).click();
    await page.keyboard.press('ControlOrMeta+,');
    await dialog.getByRole('tab', { name: 'Workspace' }).click();
    await expect(dialog.getByRole('switch', { name: 'Show hidden folders' })).toHaveAttribute('aria-checked', 'false');
    app.expectNoForeignRequests();
});
