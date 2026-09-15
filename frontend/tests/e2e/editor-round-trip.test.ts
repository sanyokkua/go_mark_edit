import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

import { expect, test } from '../support/harness';

interface ActiveState {
    data?: {
        activeBuffer?: {
            content?: string;
        } | null;
    };
}

async function activeBufferContent(page: Page): Promise<string> {
    return page.evaluate(async (): Promise<string> => {
        const root = globalThis as unknown as {
            go?: {
                appmodel?: {
                    AppModelHandler?: {
                        GetState?: (request: { id: string }) => Promise<unknown>;
                    };
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

async function editorModifier(page: Page): Promise<'Control' | 'Meta'> {
    return page.evaluate(() => (navigator.userAgent.includes('Macintosh') ? 'Meta' : 'Control'));
}

async function closeUntitled(page: Page): Promise<void> {
    const tab = page.getByRole('tab', { name: /Untitled/u });
    await expect(tab).toBeVisible();
    await tab
        .locator('..')
        .getByRole('button', { name: /^Close /u })
        .click();
}

async function openRecent(page: Page, filename: string): Promise<void> {
    await closeUntitled(page);
    const launcher = page.getByTestId('document-launcher');
    await expect(launcher).toBeVisible();
    await launcher.getByRole('button', { name: filename, exact: true }).click();
    await expect(page.getByRole('tab', { name: filename })).toBeVisible();
}

async function disableAutosave(page: Page): Promise<void> {
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const menu = page.getByRole('menu', { name: 'Settings menu' });
    const autosave = menu.getByRole('checkbox', { name: 'Autosave' });
    if (await autosave.isChecked()) {
        await menu.locator('[data-settings-toggle="Autosave"]').click();
    }
    await page.keyboard.press('Escape');
}

async function editorCaret(page: Page): Promise<{
    left: number;
    top: number;
}> {
    const caret = page.locator('[data-editor-surface] .cursor').first();
    await expect(caret).toBeVisible();
    const bounds = await caret.boundingBox();
    if (bounds === null) throw new Error('the Monaco caret has no layout bounds');
    return { left: bounds.x, top: bounds.y };
}

async function setNativeClipboard(page: Page, text: string): Promise<void> {
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

async function nativeClipboardText(page: Page): Promise<string> {
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

async function invokeEditorContextAction(page: Page, actionName: string): Promise<void> {
    const editor = page.locator('[data-editor-surface] textarea').first();
    await expect(editor).toBeFocused();
    await editor.press('Shift+F10');
    const menu = page.locator('[data-viewport-popup="context-menu"]');
    await expect(menu).toBeVisible();
    await menu.getByRole('menuitem', { name: actionName, exact: true }).click();
    await expect(menu).toHaveCount(0);
    await expect(editor).toBeFocused();
}

test('keeps the real editor model, undo history, caret, and focus across Save', async ({ app }) => {
    const original = '# Round trip\n\nA paragraph.';
    const edited = 'X';
    const source = await app.writeDocument('round-trip.md', original);
    await app.seedRecents([source]);
    await app.launch();

    const { page } = app;
    await openRecent(page, 'round-trip.md');
    await disableAutosave(page);
    const modifier = await editorModifier(page);

    const editor = page.locator('[data-editor-surface] textarea').first();
    await expect(editor).toBeVisible();
    await page.locator('[data-editor-surface] .view-lines').first().click();
    await expect(editor).toBeFocused();
    await expect.poll(() => activeBufferContent(page)).toBe(original);
    await editor.press(`${modifier}+A`);
    await page.keyboard.type(edited);
    await expect.poll(() => activeBufferContent(page)).toBe(edited);

    const caretBeforeSave = await editorCaret(page);
    await expect(editor).toBeFocused();
    await page.keyboard.press('ControlOrMeta+S');
    await expect(page.locator('[data-notification-code="save-success"]')).toHaveCount(1);
    await expect(page.locator('[aria-label="Document identity"]')).toContainText('Saved');
    await expect(editor).toBeFocused();
    const caretAfterSave = await editorCaret(page);
    expect(caretAfterSave).toEqual(caretBeforeSave);

    // A remounted Monaco model would have no edit history, so this would leave
    // the just-saved text in place instead of undoing the edit.
    await editor.press(`${modifier}+z`);
    await expect.poll(() => activeBufferContent(page)).toBe(original);
    await expect(editor).toBeFocused();
    await expect(page.locator('[aria-label="Document identity"]')).toContainText('Unsaved changes');

    expect(await readFile(source, 'utf8')).toBe(edited);
});

test('keeps live Preview and Monaco focus while Save delivers metadata', async ({ app }) => {
    const original = '# Preview heading\n\nInitial paragraph.\n';
    const source = await app.writeDocument('preview-round-trip.md', original);
    await app.seedRecents([source]);
    await app.launch();

    const { page } = app;
    await openRecent(page, 'preview-round-trip.md');
    await disableAutosave(page);
    const modifier = await editorModifier(page);
    const arrangement = page.getByRole('radiogroup', {
        name: 'View arrangement',
    });
    await arrangement.getByRole('radio', { name: 'Split' }).click();
    await expect(page.getByRole('heading', { name: 'Preview heading' })).toBeVisible();

    const editor = page.locator('[data-editor-surface] textarea').first();
    await editor.focus();
    const edited = '# Preview heading\n\nInitial paragraph.\n\nLive preview edit';
    await editor.press(`${modifier}+A`);
    await page.keyboard.insertText(edited);
    await expect.poll(() => activeBufferContent(page)).toBe(edited);
    await expect(page.getByRole('region', { name: 'Preview pane' })).toContainText('Live preview edit');
    const caretBeforeSave = await editorCaret(page);

    await page.keyboard.press('ControlOrMeta+S');
    await expect(page.locator('[data-notification-code="save-success"]')).toHaveCount(1);
    await expect(page.getByRole('heading', { name: 'Preview heading' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Preview pane' })).toContainText('Live preview edit');
    await expect(editor).toBeFocused();
    expect(await editorCaret(page)).toEqual(caretBeforeSave);
});

test('uses the native clipboard for every editor popup action and keeps Monaco formatting focus stable', async ({
    app,
}) => {
    const source = await app.writeDocument('editor-actions.md', 'Cut this');
    await app.seedRecents([source]);
    await app.launch();

    const { page } = app;
    await openRecent(page, 'editor-actions.md');
    await disableAutosave(page);
    const modifier = await editorModifier(page);
    const editor = page.locator('[data-editor-surface] textarea').first();
    await expect(editor).toBeVisible();
    await editor.focus();

    await editor.press(`${modifier}+A`);
    await invokeEditorContextAction(page, 'Cut');
    await expect.poll(() => activeBufferContent(page)).toBe('');
    await expect.poll(() => nativeClipboardText(page)).toBe('Cut this');

    await setNativeClipboard(page, 'Paste this');
    await invokeEditorContextAction(page, 'Paste');
    await expect.poll(() => activeBufferContent(page)).toBe('Paste this');

    await editor.press(`${modifier}+A`);
    await invokeEditorContextAction(page, 'Copy');
    await expect.poll(() => nativeClipboardText(page)).toBe('Paste this');
    await expect.poll(() => activeBufferContent(page)).toBe('Paste this');

    await setNativeClipboard(page, 'Plain text');
    await editor.press(`${modifier}+A`);
    await invokeEditorContextAction(page, 'Paste as plain text');
    await expect.poll(() => activeBufferContent(page)).toBe('Plain text');

    await editor.press(`${modifier}+A`);
    await page.keyboard.insertText('Word');
    await expect.poll(() => activeBufferContent(page)).toBe('Word');
    await page.getByRole('button', { name: 'Bold' }).click();
    await expect.poll(() => activeBufferContent(page)).toBe('**Word**');
    await expect(editor).toBeFocused();

    // A selected word with another style would nest the next style. Collapse
    // first to exercise the caret-specific replacement path: **Word** -> _Word_.
    await editor.press('ArrowRight');
    await invokeEditorContextAction(page, 'Italic');
    await expect.poll(() => activeBufferContent(page)).toBe('_Word_');
    await expect(editor).toBeFocused();

    await editor.press(`${modifier}+I`);
    await expect.poll(() => activeBufferContent(page)).toBe('Word');
    await expect(editor).toBeFocused();
});
