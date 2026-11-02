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

test('Link in the editor wins over Monaco’s chord', async ({ app }) => {
    const source = await app.writeDocument('link-shortcut.md', 'hello');
    await app.seedRecents([source]);
    await app.launch();
    const { page } = app;
    await page.getByTestId('document-launcher').getByRole('button', { name: 'link-shortcut.md', exact: true }).click();
    await page.locator('[data-editor-surface] .view-lines').first().click();
    await expect(page.locator('[data-editor-surface] textarea.inputarea').first()).toBeFocused();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('ControlOrMeta+k');
    await expect.poll(() => activeBufferContent(page)).toContain('[hello](');
});

test('Inline code works from the editor with the platform modifier', async ({ app }) => {
    const source = await app.writeDocument('code-shortcut.md', 'hello');
    await app.seedRecents([source]);
    await app.launch();
    const { page } = app;
    await page.getByTestId('document-launcher').getByRole('button', { name: 'code-shortcut.md', exact: true }).click();
    await page.locator('[data-editor-surface] .view-lines').first().click();
    await expect(page.locator('[data-editor-surface] textarea.inputarea').first()).toBeFocused();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('ControlOrMeta+e');
    await expect.poll(() => activeBufferContent(page)).toBe('`hello`');
});

test('Previous tab from the editor uses the Control+PageUp alias', async ({ app }) => {
    const first = await app.writeDocument('previous-one.md', 'first');
    const second = await app.writeDocument('previous-two.md', 'second');
    await app.seedRecents([first, second]);
    await app.launch();
    const { page } = app;
    await page.getByTestId('document-launcher').getByRole('button', { name: 'previous-one.md', exact: true }).click();
    await page.getByRole('button', { name: 'File', exact: true }).click();
    await page
        .getByRole('menu', { name: 'File' })
        .getByRole('menuitem', { name: 'previous-two.md', exact: true })
        .click();
    await page.locator('[data-editor-surface] .view-lines').first().click();
    await page.keyboard.press('Control+PageUp');
    await expect(page.getByRole('tab', { name: 'previous-one.md' })).toHaveAttribute('aria-selected', 'true');
    await page.locator('[data-editor-surface] .view-lines').first().click();
    await page.keyboard.press('Control+Tab');
    await expect(page.getByRole('tab', { name: 'previous-two.md' })).toHaveAttribute('aria-selected', 'true');
    await page.locator('[data-editor-surface] .view-lines').first().click();
    await page.keyboard.press('Control+Shift+Tab');
    await expect(page.getByRole('tab', { name: 'previous-one.md' })).toHaveAttribute('aria-selected', 'true');
});

test('Catalogue shortcut wins over an editor key', async ({ app }) => {
    const source = await app.writeDocument('reading-shortcut.md', 'hello');
    await app.seedRecents([source]);
    await app.launch();
    const { page } = app;
    await page
        .getByTestId('document-launcher')
        .getByRole('button', { name: 'reading-shortcut.md', exact: true })
        .click();
    await page.locator('[data-editor-surface] .view-lines').first().click();
    await page.keyboard.press('ControlOrMeta+Enter');
    await expect(page.locator('[data-reading]')).toHaveAttribute('data-reading', 'true');
    await expect.poll(() => activeBufferContent(page)).toBe('hello');
});
