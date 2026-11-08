import { join } from 'node:path';
import type { Page } from '@playwright/test';

import { expect, newUntitledDocument, test } from '../support/harness';

const SHELL = '[data-testid="application-shell"]';
const ARRANGEMENT = { name: 'View arrangement' };

type ModeLabel = 'Reading' | 'Editor' | 'Split' | 'Preview' | 'Remember last used';

async function openSettings(page: Page) {
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('menuitem', { name: 'All settings…', exact: true }).click();
    return page.getByRole('dialog', { name: 'Settings' });
}

async function chooseOpenMode(page: Page, label: ModeLabel): Promise<void> {
    const dialog = await openSettings(page);
    await dialog.getByRole('combobox', { name: 'Default open mode' }).selectOption({ label });
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
}

async function openFromLauncher(page: Page, filename: string): Promise<void> {
    const launcher = page.getByTestId('document-launcher');
    await expect(launcher).toBeVisible();
    await launcher.getByRole('button', { name: filename, exact: true }).click();
    await expect(launcher).toBeHidden();
}

async function expectArrangement(page: Page, name: 'Editor' | 'Split' | 'Preview'): Promise<void> {
    await expect(page.locator(SHELL)).not.toHaveAttribute('data-reading', /.*/u);
    await expect(page.getByRole('radiogroup', ARRANGEMENT).getByRole('radio', { name, exact: true })).toHaveAttribute(
        'aria-checked',
        'true',
    );
}

async function pickArrangement(page: Page, name: 'Editor' | 'Split' | 'Preview'): Promise<void> {
    await page.getByRole('radiogroup', ARRANGEMENT).getByRole('radio', { name, exact: true }).click();
    await expectArrangement(page, name);
}

test('the Default open mode choice persists after restart in the dialog and Settings menu excludes it', async ({
    app,
}) => {
    await app.launch();
    const { page } = app;

    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const menu = page.getByRole('menu', { name: 'Settings menu' });
    await expect(menu.getByText('Default open mode')).toHaveCount(0);
    await menu.getByRole('menuitem', { name: 'All settings…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Settings' });
    const select = dialog.getByRole('combobox', { name: 'Default open mode' });
    await expect(select).toHaveValue('last');
    await expect(select.getByRole('option')).toHaveText([
        'Reading',
        'Editor',
        'Split',
        'Preview',
        'Remember last used',
    ]);
    await select.selectOption({ label: 'Preview' });
    await expect(select).toHaveValue('preview');
    await page.keyboard.press('Escape');

    await app.relaunch();

    await expect(page.getByTestId('document-launcher')).toBeVisible();
    const reopened = page.getByRole('dialog', { name: 'Settings' });
    await expect(async () => {
        await page.keyboard.press('ControlOrMeta+,');
        await expect(reopened).toBeVisible({ timeout: 1000 });
    }).toPass();
    await expect(reopened.getByRole('combobox', { name: 'Default open mode' })).toHaveValue('preview');

    await reopened.getByRole('button', { name: 'Reset appearance' }).click();
    await expect(reopened.getByRole('combobox', { name: 'Default open mode' })).toHaveValue('last');
    app.expectNoForeignRequests();
});

for (const arrangement of ['Editor', 'Split', 'Preview'] as const) {
    test(`with the ${arrangement} default a file opens in ${arrangement}, overriding the file's saved arrangement`, async ({
        app,
    }) => {
        const source = await app.writeDocument('fixed.md', '# Fixed\n\nBody.\n');
        await app.seedRecents([source]);
        await app.launch();
        const { page } = app;
        await page.setViewportSize({ width: 1280, height: 720 });
        await openFromLauncher(page, 'fixed.md');
        // Give the document a different saved arrangement than the setting asks for.
        await pickArrangement(page, arrangement === 'Split' ? 'Preview' : 'Split');
        await chooseOpenMode(page, arrangement);

        await app.relaunch();
        await openFromLauncher(page, 'fixed.md');

        await expectArrangement(page, arrangement);
        app.expectNoForeignRequests();
    });
}

test('with the Reading default a file opens in Reading mode', async ({ app }) => {
    const source = await app.writeDocument('read.md', '# Read\n\nBody.\n');
    await app.seedRecents([source]);
    await app.launch();
    const { page } = app;
    await page.setViewportSize({ width: 1280, height: 720 });
    await chooseOpenMode(page, 'Reading');

    await openFromLauncher(page, 'read.md');

    await expect(page.locator(SHELL)).toHaveAttribute('data-reading', 'true');
    app.expectNoForeignRequests();
});

test('Remember last used reopens in the last arrangement after a restart', async ({ app }) => {
    const source = await app.writeDocument('last.md', '# Last\n\nBody.\n');
    await app.seedRecents([source]);
    await app.launch();
    const { page } = app;
    await page.setViewportSize({ width: 1280, height: 720 });
    await openFromLauncher(page, 'last.md');
    await pickArrangement(page, 'Preview');

    await app.relaunch();
    await openFromLauncher(page, 'last.md');

    await expectArrangement(page, 'Preview');
    app.expectNoForeignRequests();
});

test('Remember last used reopens in Reading mode after a restart when Reading was the last mode', async ({ app }) => {
    const source = await app.writeDocument('last-reading.md', '# Last reading\n\nBody.\n');
    await app.seedRecents([source]);
    await app.launch();
    const { page } = app;
    await page.setViewportSize({ width: 1280, height: 720 });
    await openFromLauncher(page, 'last-reading.md');
    await page.keyboard.press('ControlOrMeta+Enter');
    await expect(page.locator(SHELL)).toHaveAttribute('data-reading', 'true');

    await app.relaunch();
    await openFromLauncher(page, 'last-reading.md');

    await expect(page.locator(SHELL)).toHaveAttribute('data-reading', 'true');

    await page.keyboard.press('ControlOrMeta+Enter');
    await expect(page.locator(SHELL)).not.toHaveAttribute('data-reading', /.*/u);
    app.expectNoForeignRequests();
});

test('a new document opens in the Editor with no Reading mode whatever the default open mode', async ({ app }) => {
    await app.launch();
    const { page } = app;
    await page.setViewportSize({ width: 1280, height: 720 });
    await chooseOpenMode(page, 'Reading');

    await newUntitledDocument(page);
    await expectArrangement(page, 'Editor');
    app.expectNoForeignRequests();
});

test('opening a file with a fixed default while Reading mode is on leaves Reading and shows that arrangement', async ({
    app,
}) => {
    const root = join(app.documentDirectory, 'fixed-notes');
    const first = await app.writeDocument('fixed-notes/first.md', '# First\n');
    await app.writeDocument('fixed-notes/second.md', '# Second\n');
    await app.seedRecents([first]);
    await app.launch();
    await app.openWorkspace(root);
    const { page } = app;
    await page.setViewportSize({ width: 1280, height: 720 });
    await chooseOpenMode(page, 'Split');
    await page.getByRole('treeitem', { name: 'first.md' }).click();
    await expectArrangement(page, 'Split');
    await page.keyboard.press('ControlOrMeta+Enter');
    await expect(page.locator(SHELL)).toHaveAttribute('data-reading', 'true');

    await page.getByRole('button', { name: 'Show or hide sidebar' }).click();
    await page.getByRole('complementary', { name: 'Sidebar' }).getByRole('treeitem', { name: 'second.md' }).click();

    await expectArrangement(page, 'Split');
    await expect(page.getByRole('tab', { name: 'second.md', selected: true })).toBeVisible();
    app.expectNoForeignRequests();
});
