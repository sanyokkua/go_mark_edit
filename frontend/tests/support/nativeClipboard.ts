import type { Page } from '@playwright/test';

import { expect } from './harness';

export async function setNativeClipboard(page: Page, text: string): Promise<void> {
    await page.evaluate(async (value): Promise<void> => {
        const runtime = (
            globalThis as unknown as {
                runtime?: { ClipboardSetText?: (nextText: string) => Promise<boolean> };
            }
        ).runtime;
        if (runtime?.ClipboardSetText === undefined) {
            throw new Error('the Wails native ClipboardSetText runtime is absent');
        }
        if (!(await runtime.ClipboardSetText(value))) {
            throw new Error('the Wails native clipboard rejected the text write');
        }
    }, text);
}

export async function nativeClipboardText(page: Page): Promise<string> {
    return page.evaluate(async (): Promise<string> => {
        const runtime = (
            globalThis as unknown as {
                runtime?: { ClipboardGetText?: () => Promise<string> };
            }
        ).runtime;
        if (runtime?.ClipboardGetText === undefined) {
            throw new Error('the Wails native ClipboardGetText runtime is absent');
        }
        return runtime.ClipboardGetText();
    });
}

export async function invokeEditorContextAction(page: Page, actionName: string): Promise<void> {
    const editor = page.locator('[data-editor-surface] textarea').first();
    await expect(editor).toBeFocused();
    await editor.press('Shift+F10');
    const menu = page.locator('[data-viewport-popup="context-menu"]');
    await expect(menu).toBeVisible();
    await menu.getByRole('menuitem', { name: actionName, exact: true }).click();
    await expect(menu).toHaveCount(0);
    await expect(editor).toBeFocused();
}

export async function invokePreviewContextAction(page: Page, actionName: string): Promise<void> {
    await page.keyboard.press('Shift+F10');
    const menu = page.getByRole('menu', { name: 'Preview context menu' });
    await expect(menu).toBeVisible();
    await menu.getByRole('menuitem', { name: actionName, exact: true }).click();
    await expect(menu).toHaveCount(0);
}
