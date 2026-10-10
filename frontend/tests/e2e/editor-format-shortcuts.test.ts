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

test('Bold italic, Heading 6 and Numbered list shortcuts each undo in one step', async ({ app }) => {
    const original = 'a\nb\nc';
    const source = await app.writeDocument('format-shortcuts.md', original);
    await app.seedRecents([source]);
    await app.launch();
    const { page } = app;
    page.setDefaultTimeout(8_000);
    await page
        .getByTestId('document-launcher')
        .getByRole('button', { name: 'format-shortcuts.md', exact: true })
        .click();
    const modifier = await page.evaluate(() => (navigator.userAgent.includes('Macintosh') ? 'Meta' : 'Control'));
    const editor = page.locator('[data-editor-surface] textarea').first();
    await expect(editor).toBeVisible();
    await page.locator('[data-editor-surface] .view-lines').first().click();
    await expect(editor).toBeFocused();
    await expect.poll(() => activeBufferContent(page)).toBe(original);

    await editor.press('ArrowUp');
    await editor.press('ArrowUp');
    await editor.press('Home');
    await editor.press('Shift+End');
    await editor.press('ControlOrMeta+Shift+B');
    await expect.poll(() => activeBufferContent(page)).toBe('**_a_**\nb\nc');
    await editor.press(`${modifier}+z`);
    await expect.poll(() => activeBufferContent(page)).toBe(original);

    await editor.press('ControlOrMeta+6');
    await expect.poll(() => activeBufferContent(page)).toBe('###### a\nb\nc');
    await editor.press(`${modifier}+z`);
    await expect.poll(() => activeBufferContent(page)).toBe(original);

    await editor.press('ControlOrMeta+a');
    await editor.press('ControlOrMeta+Shift+7');
    await expect.poll(() => activeBufferContent(page)).toBe('1. a\n2. b\n3. c');
    await editor.press(`${modifier}+z`);
    await expect.poll(() => activeBufferContent(page)).toBe(original);
});
