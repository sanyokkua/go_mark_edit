import type { Page } from '@playwright/test';

import { expect, test } from '../support/harness';
import { runFromMarkdownMenu } from '../support/markdownMenu';

interface ActiveState {
    data?: { activeBuffer?: { content?: string } | null };
}

async function activeBufferContent(page: Page): Promise<string> {
    return page.evaluate(async (): Promise<string> => {
        const root = globalThis as unknown as {
            go?: {
                appmodel?: {
                    AppModelHandler?: { GetState?: (request: { id: string }) => Promise<unknown> };
                };
            };
        };
        const getState = root.go?.appmodel?.AppModelHandler?.GetState;
        if (getState === undefined) {
            throw new Error('the generated AppModelHandler.GetState binding is absent');
        }
        const state = (await getState({ id: crypto.randomUUID() })) as ActiveState;
        return state.data?.activeBuffer?.content ?? '';
    });
}

async function openDocument(app: Parameters<Parameters<typeof test>[2]>[0]['app'], name: string, text: string) {
    const source = await app.writeDocument(name, text);
    await app.seedRecents([source]);
    await app.launch();
    const { page } = app;
    page.setDefaultTimeout(8_000);
    await page.getByTestId('document-launcher').getByRole('button', { name, exact: true }).click();
    const editor = page.locator('[data-editor-surface] textarea').first();
    await expect(editor).toBeVisible();
    await page.locator('[data-editor-surface] .view-lines').first().click();
    await expect(editor).toBeFocused();
    await expect.poll(() => activeBufferContent(page)).toBe(text);
    return { page, editor };
}

const table42 = [
    '| Header 1 | Header 2 | Header 3 | Header 4 |',
    '| --- | --- | --- | --- |',
    '|  |  |  |  |',
    '|  |  |  |  |',
].join('\n');

test('Mod+Shift+T inserts a 4 by 2 table as one undoable edit and returns focus to the editor', async ({ app }) => {
    const { page, editor } = await openDocument(app, 'table-shortcut.md', '\n');
    const modifier = await page.evaluate(() => (navigator.userAgent.includes('Macintosh') ? 'Meta' : 'Control'));

    await editor.press('ControlOrMeta+Shift+T');
    const dialog = page.getByRole('dialog', { name: 'Insert table' });
    await expect(dialog).toBeVisible();
    await expect(page.getByLabel('Columns')).toHaveValue('3');
    await expect(page.getByLabel('Rows')).toHaveValue('3');
    await expect(page.getByLabel('Columns')).toBeFocused();

    await page.getByLabel('Columns').fill('4');
    await page.getByLabel('Rows').fill('2');
    await page.getByLabel('Rows').press('Enter');

    await expect(dialog).toHaveCount(0);
    await expect.poll(() => activeBufferContent(page)).toBe(`\n${table42}`);
    await expect(editor).toBeFocused();

    await editor.press(`${modifier}+z`);
    await expect.poll(() => activeBufferContent(page)).toBe('\n');
});

test('the toolbar Table button and the Markdown menu item open the dialog; Cancel and Escape change nothing', async ({
    app,
}) => {
    const { page, editor } = await openDocument(app, 'table-entries.md', 'Intro\nmore');
    const dialog = page.getByRole('dialog', { name: 'Insert table' });

    await page.getByRole('button', { name: 'Table', exact: true }).click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(editor).toBeFocused();

    await runFromMarkdownMenu(page, 'table');
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(editor).toBeFocused();
    await expect.poll(() => activeBufferContent(page)).toBe('Intro\nmore');

    await page.getByRole('button', { name: 'Table', exact: true }).click();
    await page.getByLabel('Columns').fill('2');
    await page.getByLabel('Rows').fill('1');
    await dialog.getByRole('button', { name: 'Insert' }).click();
    await expect
        .poll(() => activeBufferContent(page))
        .toBe('Intro\nmore\n\n| Header 1 | Header 2 |\n| --- | --- |\n|  |  |');
});

test('the dialog rejects out-of-range sizes and a read-only document never opens it', async ({ app }) => {
    const { page, editor } = await openDocument(app, 'table-range.md', '\n');
    await editor.press('ControlOrMeta+Shift+T');
    await page.getByLabel('Columns').fill('21');
    await expect(page.getByText('Columns must be a whole number from 1 to 20.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Insert' })).toBeDisabled();
    await page.getByLabel('Columns').fill('3');
    await page.getByLabel('Rows').fill('0');
    await expect(page.getByText('Rows must be a whole number from 1 to 100.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Insert' })).toBeDisabled();
});

test('Mod+Shift+T leaves a read-only document unchanged', async ({ app }) => {
    const text = 'plain\0';
    const { page, editor } = await openDocument(app, 'table-readonly.md', text);
    await editor.press('ControlOrMeta+Shift+T');
    await expect(page.getByRole('dialog', { name: 'Insert table' })).toHaveCount(0);
    await expect.poll(() => activeBufferContent(page)).toBe(text);
});
