import type { Page } from '@playwright/test';

import { expect, test } from '../support/harness';

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

test('Enter continues a list, ends it on an empty item, and undoes in one step', async ({ app }) => {
    const { page, editor } = await openDocument(app, 'list-enter.md', 'intro\n- apple');
    const modifier = await page.evaluate(() => (navigator.userAgent.includes('Macintosh') ? 'Meta' : 'Control'));

    await editor.press('ControlOrMeta+End');
    await editor.press('Enter');
    await expect.poll(() => activeBufferContent(page)).toBe('intro\n- apple\n- ');
    await editor.press(`${modifier}+z`);
    await expect.poll(() => activeBufferContent(page)).toBe('intro\n- apple');

    await editor.press('Enter');
    await editor.press('Enter');
    await expect.poll(() => activeBufferContent(page)).toBe('intro\n- apple\n');

    await editor.press('Shift+Enter');
    await expect.poll(() => activeBufferContent(page)).toBe('intro\n- apple\n\n');
});

test('Enter inside a fenced block inserts a plain line', async ({ app }) => {
    const { page, editor } = await openDocument(app, 'list-fence.md', '```\n- item');
    await editor.press('ControlOrMeta+End');
    await editor.press('Enter');
    await expect.poll(() => activeBufferContent(page)).toBe('```\n- item\n');
});

test('Enter leaves a read-only document unchanged', async ({ app }) => {
    const text = '- apple\0';
    const { page, editor } = await openDocument(app, 'list-readonly.md', text);
    await editor.press('ControlOrMeta+End');
    await editor.press('Enter');
    await expect.poll(() => activeBufferContent(page)).toBe(text);
});
