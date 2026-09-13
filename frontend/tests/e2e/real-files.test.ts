import type { Page } from '@playwright/test';
import { chmod, readFile, unlink, writeFile } from 'node:fs/promises';

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

async function closeTab(page: Page, filename: string): Promise<void> {
    const tab = page.getByRole('tab', { name: filename });
    await expect(tab).toBeVisible();
    await tab
        .locator('..')
        .getByRole('button', { name: /^Close /u })
        .click();
}

async function openRecentFromLauncher(page: Page, filename: string): Promise<void> {
    await closeTab(page, 'Untitled');
    const launcher = page.getByTestId('document-launcher');
    await expect(launcher).toBeVisible();
    await expect(page.locator('[data-editor-surface]')).toHaveCount(0);
    await launcher.getByRole('button', { name: filename, exact: true }).click();
    await expect(page.getByRole('tab', { name: filename })).toBeVisible();
}

async function openRecentFromFileMenu(page: Page, filename: string): Promise<void> {
    await page.getByRole('button', { name: 'File', exact: true }).click();
    const menu = page.getByRole('menu', { name: 'File' });
    await menu.getByRole('menuitem', { name: filename, exact: true }).click();
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

async function editorModifier(page: Page): Promise<'Control' | 'Meta'> {
    return page.evaluate(() => (navigator.userAgent.includes('Macintosh') ? 'Meta' : 'Control'));
}

async function tabOrder(page: Page): Promise<(string | null)[]> {
    return page.getByRole('tab').evaluateAll((tabs) => tabs.map((tab) => tab.getAttribute('data-document-id')));
}

async function editDocument(page: Page, content: string): Promise<void> {
    const editor = page.locator('[data-editor-surface] textarea').first();
    await expect(editor).toBeVisible();
    await page.locator('[data-editor-surface] .view-lines').first().click();
    await expect(editor).toBeFocused();
    const modifier = await editorModifier(page);
    await editor.press(`${modifier}+A`);
    await page.keyboard.insertText(content);
    await expect.poll(() => activeBufferContent(page)).toBe(content);
}

test('creates a document, opens Recents, saves once, moves tabs, and restores saved state', async ({ app }) => {
    const original = '# First document\n\nBefore the edit.\n';
    const saved = '# First document\n\nSaved from the real editor.\n';
    const first = await app.writeDocument('first.md', original);
    const second = await app.writeDocument('second.md', '# Second document\n');
    await app.seedRecents([first, second]);
    await app.launch();

    await app.page.getByRole('button', { name: 'File', exact: true }).click();
    await app.page.getByRole('menu', { name: 'File' }).getByRole('menuitem', { name: 'New File', exact: true }).click();
    await expect(app.page.getByRole('tab')).toHaveCount(2);
    const newDocumentTab = app.page.getByRole('tab').nth(1);
    await expect(newDocumentTab).toBeVisible();
    await newDocumentTab
        .locator('..')
        .getByRole('button', { name: /^Close /u })
        .click();
    await expect(app.page.getByRole('tab')).toHaveCount(1);

    await openRecentFromLauncher(app.page, 'first.md');
    await openRecentFromFileMenu(app.page, 'second.md');
    const beforeMove = await tabOrder(app.page);
    expect(beforeMove).toHaveLength(2);

    await app.page.getByRole('tab', { name: 'second.md' }).click({
        button: 'right',
    });
    const tabMenu = app.page.getByRole('menu', { name: 'Tab actions' });
    await tabMenu.getByRole('menuitem', { name: 'Move tab left', exact: true }).click();
    await expect(app.page.getByRole('status').filter({ hasText: 'Moved' })).toContainText('position 1 of 2');
    expect(await tabOrder(app.page)).toEqual([beforeMove[1], beforeMove[0]]);

    await app.page.getByRole('tab', { name: 'first.md' }).click();
    await disableAutosave(app.page);
    await editDocument(app.page, saved);
    await app.page.keyboard.press('ControlOrMeta+S');
    await expect(app.page.locator('[data-notification-code="save-success"]')).toHaveCount(1);
    await expect(app.page.locator('[aria-label="Document identity"]')).toContainText('Saved');
    expect(await readFile(first, 'utf8')).toBe(saved);

    await app.relaunch();
    await expect(app.page.getByRole('tab', { name: 'Untitled' })).toBeVisible();
    await openRecentFromLauncher(app.page, 'first.md');
    await expect(app.page.locator('[aria-label="Document identity"]')).toContainText('Saved');
    await expect(app.page.locator('[data-editor-surface] .view-lines').first()).toContainText(
        'Saved from the real editor.',
    );
    expect(await readFile(first, 'utf8')).toBe(saved);
});

test('reveals a missing real file and completes Save to recreate and Copy path remediations', async ({ app }) => {
    const original = '# Recover me\n\nThe buffer remains available.\n';
    const source = await app.writeDocument('recover.md', original);
    const background = await app.writeDocument('stay-active.md', '# Active file stays unchanged\n');
    await app.seedRecents([source, background]);
    await app.launch();
    await openRecentFromLauncher(app.page, 'recover.md');

    await unlink(source);
    await app.page.getByRole('tab', { name: 'recover.md' }).click({
        button: 'right',
    });
    await app.page
        .getByRole('menu', { name: 'Tab actions' })
        .getByRole('menuitem', { name: 'Reveal in file manager', exact: true })
        .click();

    const missing = app.page.locator('[data-notification-code="not_found"]');
    await expect(missing).toHaveCount(1);
    await expect(missing).toContainText('The document could not be found.');
    await expect(missing).not.toContainText(source);
    await expect(missing.getByRole('button', { name: 'Save to recreate' })).toBeEnabled();
    await expect(missing.getByRole('button', { name: 'Copy path' })).toBeEnabled();

    await openRecentFromFileMenu(app.page, 'stay-active.md');
    await missing.getByRole('button', { name: 'Save to recreate' }).click();
    await expect(app.page.locator('[data-notification-code="save-success"]')).toHaveCount(1);
    expect(await readFile(source, 'utf8')).toBe(original);
    expect(await activeBufferContent(app.page)).toBe('# Active file stays unchanged\n');
    expect(await readFile(background, 'utf8')).toBe('# Active file stays unchanged\n');
    await expect(app.page.locator('[aria-label="Document identity"]')).toContainText('Saved');

    await unlink(source);
    await app.page.getByRole('tab', { name: 'recover.md' }).click({
        button: 'right',
    });
    await app.page
        .getByRole('menu', { name: 'Tab actions' })
        .getByRole('menuitem', { name: 'Reveal in file manager', exact: true })
        .click();
    const secondMissing = app.page.locator('[data-notification-code="not_found"]');
    await expect(secondMissing).toHaveCount(1);
    await secondMissing.getByRole('button', { name: 'Copy path' }).click();
    await expect(app.page.getByRole('status').filter({ hasText: 'Copied path for recover.md' })).toHaveCount(1);
    await expect(secondMissing).toHaveCount(0);
    await expect(app.page.getByRole('status').filter({ hasText: 'Copied path for recover.md' })).toHaveCount(0);
});

test('offers Retry for a transient Save inspection refusal and commits after recovery', async ({ app }) => {
    const original = '# Retry me\n\nBefore.\n';
    const refusedContent = '# Retry me\n\nAfter the directory is restored.\n';
    const source = await app.writeDocument('retry.md', original);
    await app.seedRecents([source]);
    await app.launch();
    await openRecentFromLauncher(app.page, 'retry.md');
    await disableAutosave(app.page);
    await editDocument(app.page, refusedContent);

    await chmod(app.documentDirectory, 0o600);
    try {
        await app.page.keyboard.press('ControlOrMeta+S');
        const refusal = app.page.locator('[data-notification-code="io"]');
        await expect(refusal).toHaveCount(1);
        await expect(refusal).toContainText('The document could not be inspected.');
        await expect(refusal.getByRole('button', { name: 'Retry' })).toBeEnabled();

        await chmod(app.documentDirectory, 0o755);
        await refusal.getByRole('button', { name: 'Retry' }).click();
        await expect(app.page.locator('[data-notification-code="save-success"]')).toHaveCount(1);
        await expect(refusal).toHaveCount(0);
        expect(await readFile(source, 'utf8')).toBe(refusedContent);
    } finally {
        await chmod(app.documentDirectory, 0o755);
    }
});

test('shows a bounded external-change prompt and keeps the active buffer on Skip', async ({ app }) => {
    const original = '# Original buffer\n\nYours stays loaded.\n';
    const external = '# External version\n\nWritten by another process.\n';
    const source = await app.writeDocument('external.md', original);
    await app.seedRecents([source]);
    await app.launch();
    await openRecentFromLauncher(app.page, 'external.md');

    await writeFile(source, external, 'utf8');
    await app.page.evaluate(() => {
        window.dispatchEvent(new Event('focus'));
    });

    const prompt = app.page.getByRole('dialog', { name: 'File changed on disk' });
    await expect(prompt).toBeVisible();
    await expect(prompt).toContainText('external.md');
    await expect(prompt).toContainText('On disk');
    await expect(prompt).toContainText('Yours');
    await expect(prompt).not.toContainText(source);
    await expect(prompt.getByRole('button', { name: 'Reload from disk' })).toBeVisible();
    await expect(prompt.getByRole('button', { name: 'Keep mine' })).toBeVisible();
    await expect(prompt.getByRole('button', { name: 'Skip' })).toBeFocused();

    await prompt.getByRole('button', { name: 'Skip' }).click();
    await expect(prompt).toHaveCount(0);
    await expect(app.page.locator('[data-editor-surface] .view-lines').first()).toContainText('Yours stays loaded.');
    expect(await readFile(source, 'utf8')).toBe(external);
});

test('retains a dirty tab on Cancel, saves before closing, and discards only the requested tab', async ({ app }) => {
    const original = '# Close draft\n';
    const edited = '# Saved before closing\n';
    const source = await app.writeDocument('close-draft.md', original);
    await app.seedRecents([source]);
    await app.launch();
    await openRecentFromLauncher(app.page, 'close-draft.md');
    await disableAutosave(app.page);
    await editDocument(app.page, edited);

    await closeTab(app.page, 'close-draft.md');
    const prompt = app.page.getByRole('dialog', { name: 'Save changes before closing?' });
    await expect(prompt.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
    await prompt.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(prompt).toHaveCount(0);
    await expect(app.page.getByRole('tab', { name: 'close-draft.md' })).toBeVisible();
    expect(await readFile(source, 'utf8')).toBe(original);
    expect(await activeBufferContent(app.page)).toBe(edited);

    await closeTab(app.page, 'close-draft.md');
    await prompt.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(app.page.getByTestId('document-launcher')).toBeVisible();
    expect(await readFile(source, 'utf8')).toBe(edited);

    await app.page
        .getByTestId('document-launcher')
        .getByRole('button', { name: 'close-draft.md', exact: true })
        .click();
    await editDocument(app.page, '# Discard this change\n');
    await closeTab(app.page, 'close-draft.md');
    await prompt.getByRole('button', { name: 'Discard', exact: true }).click();
    await expect(app.page.getByTestId('document-launcher')).toBeVisible();
    expect(await readFile(source, 'utf8')).toBe(edited);
});

test('cancels mixed-ending Save without writing and confirms a fresh normalization request', async ({ app }) => {
    const original = '# Mixed\r\n\r\nOne line\nAnother line\r\n';
    const source = await app.writeDocument('mixed-save.md', original);
    await app.seedRecents([source]);
    await app.launch();
    await openRecentFromLauncher(app.page, 'mixed-save.md');
    await disableAutosave(app.page);
    await editDocument(app.page, '# Normalized after confirmation\n');
    await app.page.keyboard.press('ControlOrMeta+S');
    const prompt = app.page.getByRole('dialog', { name: 'Normalize line endings?' });
    await expect(prompt).toContainText('mixed-save.md');
    await prompt.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(prompt).toHaveCount(0);
    expect(await readFile(source, 'utf8')).toBe(original);
    await expect(app.page.locator('[aria-label="Document identity"]')).toContainText('Unsaved changes');

    await app.page.keyboard.press('ControlOrMeta+S');
    await prompt.getByRole('button', { name: 'Normalize and save', exact: true }).click();
    await expect(prompt).toHaveCount(0);
    await expect(app.page.locator('[data-notification-code="save-success"]')).toHaveCount(1);
    expect((await readFile(source, 'utf8')).replaceAll('\r\n', '\n')).toBe('# Normalized after confirmation\n');
});

test('resumes the original Save after an exact-version Keep mine decision', async ({ app }) => {
    const source = await app.writeDocument('write-conflict.md', '# Original\n');
    await app.seedRecents([source]);
    await app.launch();
    await openRecentFromLauncher(app.page, 'write-conflict.md');
    await disableAutosave(app.page);
    const mine = '# Mine wins only after confirmation\n';
    await editDocument(app.page, mine);
    await writeFile(source, '# External version\n', 'utf8');
    await app.page.keyboard.press('ControlOrMeta+S');
    const prompt = app.page.getByRole('dialog', { name: 'File changed on disk' });
    await expect(prompt).toHaveCount(1);
    await expect(prompt).toContainText('write-conflict.md');
    expect(await readFile(source, 'utf8')).toBe('# External version\n');
    await prompt.getByRole('button', { name: 'Keep mine', exact: true }).click();
    await expect(prompt).toHaveCount(0);
    await expect(app.page.locator('[data-notification-code="save-success"]')).toHaveCount(1);
    expect(await readFile(source, 'utf8')).toBe(mine);
});

async function requestNativeQuit(page: Page): Promise<void> {
    await page.evaluate(() => {
        const root = globalThis as unknown as { runtime?: { Quit?: () => void } };
        if (root.runtime?.Quit === undefined) throw new Error('The native Quit binding is absent');
        root.runtime.Quit();
    });
}

test('closes a mixed-ending document after confirming normalization once', async ({ app }) => {
    const source = await app.writeDocument('mixed-close.md', '# Mixed\r\nOne\nTwo\r\n');
    await app.seedRecents([source]);
    await app.launch();
    await openRecentFromLauncher(app.page, 'mixed-close.md');
    await disableAutosave(app.page);
    await editDocument(app.page, '# Confirm once\n');
    await closeTab(app.page, 'mixed-close.md');
    await app.page
        .getByRole('dialog', { name: 'Save changes before closing?' })
        .getByRole('button', { name: 'Save', exact: true })
        .click();
    const normalization = app.page.getByRole('dialog', { name: 'Normalize line endings?' });
    await normalization.getByRole('button', { name: 'Normalize and save' }).click();
    await expect(normalization).toHaveCount(0);
    await expect(app.page.getByTestId('document-launcher')).toBeVisible();
    expect((await readFile(source, 'utf8')).replaceAll('\r\n', '\n')).toBe('# Confirm once\n');
});

test('dismisses foreground Keep mine after authorizing without writing', async ({ app }) => {
    const original = '# Original stays in the editor\n';
    const external = '# Disk stays external\n';
    const source = await app.writeDocument('foreground-keep.md', original);
    await app.seedRecents([source]);
    await app.launch();
    await openRecentFromLauncher(app.page, 'foreground-keep.md');
    await disableAutosave(app.page);
    await writeFile(source, external, 'utf8');
    await app.page.evaluate(() => window.dispatchEvent(new Event('focus')));
    const conflict = app.page.getByRole('dialog', { name: 'File changed on disk' });
    await conflict.getByRole('button', { name: 'Keep mine' }).click();
    await expect(conflict).toHaveCount(0);
    expect(await activeBufferContent(app.page)).toBe(original);
    expect(await readFile(source, 'utf8')).toBe(external);
    await expect(app.page.locator('[data-notification-code="save-success"]')).toHaveCount(0);
});

test('prioritizes the close conflict and resumes a deferred Save only after its own decision', async ({ app }) => {
    const source = await app.writeDocument('overlap.md', '# Original\n');
    await app.seedRecents([source]);
    await app.launch();
    await openRecentFromLauncher(app.page, 'overlap.md');
    await disableAutosave(app.page);
    const mine = '# Preserve my pending Save\n';
    const external = '# External overlap\n';
    await editDocument(app.page, mine);
    await writeFile(source, external, 'utf8');
    await app.page.keyboard.press('ControlOrMeta+S');
    const conflict = app.page.getByRole('dialog', { name: 'File changed on disk' });
    await expect(conflict).toHaveCount(1);
    await app.page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await requestNativeQuit(app.page);
    const close = app.page.locator('[data-close-prompt]');
    await expect(close).toHaveAttribute('data-close-kind', 'quit');
    await close.locator('[data-close-choice="save-all"]').click();
    await expect(conflict).toHaveCount(1);
    await conflict.getByRole('button', { name: 'Skip', exact: true }).click();
    await expect(close).toHaveCount(0);
    await expect(conflict).toHaveCount(1);
    await expect(conflict.getByRole('button', { name: 'Keep mine' })).toBeEnabled();
    expect(await readFile(source, 'utf8')).toBe(external);
    await expect(app.page.locator('[data-notification-code="save-success"]')).toHaveCount(0);
    await conflict.getByRole('button', { name: 'Keep mine' }).click();
    await expect(conflict).toHaveCount(0);
    await expect(app.page.locator('[data-notification-code="save-success"]')).toHaveCount(1);
    expect(await readFile(source, 'utf8')).toBe(mine);
    await expect(app.page.getByRole('tab', { name: 'overlap.md' })).toBeVisible();
});

test('rechecks a deferred foreground comparison after close cancellation', async ({ app }) => {
    const source = await app.writeDocument('deferred.md', '# Original\n');
    await app.seedRecents([source]);
    await app.launch();
    await openRecentFromLauncher(app.page, 'deferred.md');
    await disableAutosave(app.page);
    await editDocument(app.page, '# Keep editing\n');
    await writeFile(source, '# First external version\n', 'utf8');
    await app.page.evaluate(() => window.dispatchEvent(new Event('focus')));
    const conflict = app.page.getByRole('dialog', { name: 'File changed on disk' });
    await expect(conflict).toContainText('First external version');
    await requestNativeQuit(app.page);
    const close = app.page.locator('[data-close-prompt]');
    await expect(close).toBeVisible();
    await writeFile(source, '# Fresh external version\n', 'utf8');
    await close.locator('[data-close-choice="cancel"]').click();
    await expect(conflict).toHaveCount(1);
    await expect(conflict).toContainText('Fresh external version');
    await expect(conflict).not.toContainText('First external version');
    await conflict.getByRole('button', { name: 'Skip', exact: true }).click();
    expect(await activeBufferContent(app.page)).toBe('# Keep editing\n');
    expect(await readFile(source, 'utf8')).toBe('# Fresh external version\n');
});

test('installs foreground reload content in the existing active editor', async ({ app }) => {
    const source = await app.writeDocument('reload.md', '# Original editor content\n');
    await app.seedRecents([source]);
    await app.launch();
    await openRecentFromLauncher(app.page, 'reload.md');
    await writeFile(source, '# Reloaded editor content\n', 'utf8');
    await app.page.evaluate(() => window.dispatchEvent(new Event('focus')));
    const conflict = app.page.getByRole('dialog', { name: 'File changed on disk' });
    await conflict.getByRole('button', { name: 'Reload from disk' }).click();
    await expect(conflict).toHaveCount(0);
    await expect(app.page.locator('[data-editor-surface] .view-lines').first()).toContainText(
        'Reloaded editor content',
    );
    expect(await activeBufferContent(app.page)).toBe('# Reloaded editor content\n');
});

test('retries a failed multi-tab close at a fresh revision with only its original targets', async ({ app }) => {
    const first = await app.writeDocument('close-first.md', '# First original\n');
    const second = await app.writeDocument('close-second.md', '# Second original\n');
    const keep = await app.writeDocument('keep.md', '# Keep open\n');
    await app.seedRecents([first, second, keep]);
    await app.launch();
    await openRecentFromLauncher(app.page, 'close-first.md');
    await disableAutosave(app.page);
    await editDocument(app.page, '# First saved on retry\n');
    await openRecentFromFileMenu(app.page, 'close-second.md');
    await editDocument(app.page, '# Second saved on retry\n');
    await openRecentFromFileMenu(app.page, 'keep.md');
    await app.page.getByRole('tab', { name: 'keep.md' }).click({ button: 'right' });
    await app.page
        .getByRole('menu', { name: 'Tab actions' })
        .getByRole('menuitem', { name: 'Close Others', exact: true })
        .click();
    const close = app.page.locator('[data-close-prompt]');
    await expect(close).toHaveAttribute('data-close-kind', 'others');
    await chmod(app.documentDirectory, 0o600);
    try {
        await close.locator('[data-close-choice="save-all"]').click();
        const refusal = app.page.locator('[data-notification-code="io"]');
        await expect(refusal).toHaveCount(1);
        await expect(close).toHaveCount(0);
        await expect(app.page.getByRole('tab')).toHaveCount(3);
        await chmod(app.documentDirectory, 0o755);
        await app.page.getByRole('button', { name: 'File', exact: true }).click();
        await app.page
            .getByRole('menu', { name: 'File' })
            .getByRole('menuitem', { name: 'New File', exact: true })
            .click();
        await expect(app.page.getByRole('tab')).toHaveCount(4);
        await refusal.getByRole('button', { name: 'Retry' }).click();
        await expect(close).toHaveAttribute('data-close-kind', 'others');
        await close.locator('[data-close-choice="save-all"]').click();
        await expect(app.page.getByRole('tab')).toHaveCount(2);
        await expect(app.page.getByRole('tab', { name: 'keep.md' })).toBeVisible();
        await expect(app.page.getByRole('tab', { name: 'Untitled' })).toBeVisible();
        await expect(refusal).toHaveCount(0);
        expect(await readFile(first, 'utf8')).toBe('# First saved on retry\n');
        expect(await readFile(second, 'utf8')).toBe('# Second saved on retry\n');
    } finally {
        await chmod(app.documentDirectory, 0o755);
    }
});

test('reloads a close conflict and finishes the original close without overwriting disk', async ({ app }) => {
    const source = await app.writeDocument('close-reload.md', '# Original\n');
    await app.seedRecents([source]);
    await app.launch();
    await openRecentFromLauncher(app.page, 'close-reload.md');
    await disableAutosave(app.page);
    await editDocument(app.page, '# My dirty version\n');
    await writeFile(source, '# Disk version wins\n', 'utf8');
    await closeTab(app.page, 'close-reload.md');
    await app.page.locator('[data-close-prompt]').getByRole('button', { name: 'Save', exact: true }).click();
    const conflict = app.page.getByRole('dialog', { name: 'File changed on disk' });
    await conflict.getByRole('button', { name: 'Reload from disk' }).click();
    await expect(conflict).toHaveCount(0);
    await expect(app.page.getByRole('tab')).toHaveCount(0);
    await expect(app.page.locator('[data-editor-surface]')).toHaveCount(0);
    await expect(app.page.getByTestId('document-launcher')).toBeVisible();
    expect(await readFile(source, 'utf8')).toBe('# Disk version wins\n');
});

test('preserves editor focus and undo when an ordinary Save completes', async ({ app }) => {
    const original = '# Undo remains available\n';
    const source = await app.writeDocument('save-undo.md', original);
    await app.seedRecents([source]);
    await app.launch();
    await openRecentFromLauncher(app.page, 'save-undo.md');
    await disableAutosave(app.page);
    const editor = app.page.locator('[data-editor-surface] textarea').first();
    await app.page.locator('[data-editor-surface] .view-lines').first().click();
    await editor.press('Home');
    await app.page.keyboard.type('x');
    await expect.poll(() => activeBufferContent(app.page)).not.toBe(original);
    const edited = await activeBufferContent(app.page);
    await app.page.keyboard.press('ControlOrMeta+S');
    await expect(app.page.locator('[data-notification-code="save-success"]')).toHaveCount(1);
    await expect(editor).toBeFocused();
    await app.page.keyboard.press('ControlOrMeta+Z');
    await expect.poll(() => activeBufferContent(app.page)).toBe(original);
    expect(await readFile(source, 'utf8')).toBe(edited);
});

test('retries deferred write validation without starting its Save automatically', async ({ app }) => {
    const source = await app.writeDocument('validation-retry.md', '# Original\n');
    await app.seedRecents([source]);
    await app.launch();
    await openRecentFromLauncher(app.page, 'validation-retry.md');
    await disableAutosave(app.page);
    const mine = '# Save after my decision\n';
    const external = '# External version\n';
    await editDocument(app.page, mine);
    await writeFile(source, external, 'utf8');
    await app.page.keyboard.press('ControlOrMeta+S');
    const conflict = app.page.getByRole('dialog', { name: 'File changed on disk' });
    await expect(conflict).toBeVisible();
    await requestNativeQuit(app.page);
    const close = app.page.locator('[data-close-prompt]');
    await expect(close).toBeVisible();
    await chmod(app.documentDirectory, 0o600);
    try {
        await close.locator('[data-close-choice="cancel"]').click();
        const failure = app.page.locator('[data-notification-code="io"]');
        await expect(failure).toHaveCount(1);
        await expect(conflict).toHaveCount(0);
        await chmod(app.documentDirectory, 0o755);
        await failure.getByRole('button', { name: 'Retry' }).click();
        await expect(conflict).toBeVisible();
        await expect(conflict.getByRole('button', { name: 'Keep mine' })).toBeEnabled();
        await expect(failure).toHaveCount(0);
        expect(await readFile(source, 'utf8')).toBe(external);
        await conflict.getByRole('button', { name: 'Keep mine' }).click();
        await expect(conflict).toHaveCount(0);
        expect(await readFile(source, 'utf8')).toBe(mine);
    } finally {
        await chmod(app.documentDirectory, 0o755);
    }
});

for (const dismissFirst of [false, true]) {
    test(`saves the selected document after a deferred validation failure${dismissFirst ? ' is dismissed' : ''}`, async ({
        app,
    }) => {
        const source = await app.writeDocument('failed-target.md', '# Original\n');
        const other = await app.writeDocument('selected.md', '# Selected original\n');
        await app.seedRecents([source, other]);
        await app.launch();
        await openRecentFromLauncher(app.page, 'failed-target.md');
        await disableAutosave(app.page);
        await editDocument(app.page, '# Preserve failed intent\n');
        await writeFile(source, '# External remains\n', 'utf8');
        await app.page.keyboard.press('ControlOrMeta+S');
        const conflict = app.page.getByRole('dialog', { name: 'File changed on disk' });
        await expect(conflict).toBeVisible();
        await requestNativeQuit(app.page);
        const close = app.page.locator('[data-close-prompt]');
        await expect(close).toBeVisible();
        await chmod(app.documentDirectory, 0o600);
        try {
            await close.locator('[data-close-choice="cancel"]').click();
            const failure = app.page.locator('[data-notification-code="io"]');
            await expect(failure).toHaveCount(1);
            await expect(conflict).toHaveCount(0);
            await chmod(app.documentDirectory, 0o755);
            if (dismissFirst) {
                await failure.getByRole('button', { name: 'Dismiss', exact: true }).click();
                await expect(failure).toHaveCount(0);
            }
            await openRecentFromFileMenu(app.page, 'selected.md');
            await editDocument(app.page, '# Save the selected document\n');
            await app.page.keyboard.press('ControlOrMeta+S');
            await expect(app.page.locator('[data-notification-code="save-success"]')).toHaveCount(1);
            await expect(conflict).toHaveCount(0);
            expect(await readFile(other, 'utf8')).toBe('# Save the selected document\n');
            expect(await readFile(source, 'utf8')).toBe('# External remains\n');
            expect(await activeBufferContent(app.page)).toBe('# Save the selected document\n');
        } finally {
            await chmod(app.documentDirectory, 0o755);
        }
    });
}
