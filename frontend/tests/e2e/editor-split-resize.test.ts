import type { Page } from '@playwright/test';

import { expect, test } from '../support/harness';

async function closeTab(page: Page, name: string): Promise<void> {
    await expect(page.getByRole('tab', { name })).toBeVisible();
    await page
        .getByRole('tab', { name })
        .locator('..')
        .getByRole('button', { name: /^Close /u })
        .click();
}

async function openFirst(page: Page, name: string): Promise<void> {
    await page.getByTestId('document-launcher').getByRole('button', { name, exact: true }).click();
    await expect(page.getByRole('tab', { name })).toBeVisible();
}

async function openRecent(page: Page, name: string): Promise<void> {
    await page.getByRole('button', { name: 'File', exact: true }).click();
    await page.getByRole('menu', { name: 'File' }).getByRole('menuitem', { name, exact: true }).click();
    await expect(page.getByRole('tab', { name })).toBeVisible();
}

async function split(page: Page): Promise<void> {
    await page
        .getByRole('radiogroup', { name: 'View arrangement' })
        .getByRole('radio', { name: 'Split', exact: true })
        .click();
    await expect(page.getByRole('separator', { name: 'Resize editor and preview panes' })).toBeVisible();
}

async function currentRatio(page: Page): Promise<number> {
    return page.evaluate(async () => {
        const root = globalThis as unknown as {
            go: {
                appmodel: {
                    AppModelHandler: {
                        GetState: (request: { id: string }) => Promise<{
                            data: {
                                snapshot: {
                                    documents: Record<string, { documentId: string; view: { splitRatio: number } }>;
                                    activeDocumentId: string;
                                };
                            };
                        }>;
                    };
                };
            };
        };
        const result = await root.go.appmodel.AppModelHandler.GetState({ id: crypto.randomUUID() });
        const state = result.data.snapshot;
        return state.documents[state.activeDocumentId]?.view.splitRatio ?? -1;
    });
}

async function paneWidths(page: Page): Promise<{ editor: number; preview: number }> {
    return {
        editor: (await page.locator('[data-pane-identity="editor"]').boundingBox())?.width ?? 0,
        preview: (await page.locator('[data-pane-identity="preview"]').boundingBox())?.width ?? 0,
    };
}

test('dragging and keyboard resizing change real pane widths without losing editor undo or viewing mode', async ({
    app,
}) => {
    const path = await app.writeDocument('resize.md', '# Heading\n\nOriginal paragraph.');
    await app.seedRecents([path]);
    await app.launch();
    const { page } = app;
    await openFirst(page, 'resize.md');
    await split(page);
    const divider = page.getByRole('separator', { name: 'Resize editor and preview panes' });
    const initial = await paneWidths(page);
    expect(Math.abs(initial.editor - initial.preview)).toBeLessThan(2);

    const editor = page.locator('[data-editor-surface] textarea').first();
    await page.locator('[data-editor-surface] .view-lines').first().click();
    await editor.press('ControlOrMeta+End');
    await page.keyboard.type(' Added text.');
    await expect(page.getByRole('region', { name: 'Preview pane' })).toContainText('Added text.');

    const bounds = await divider.boundingBox();
    if (bounds === null) throw new Error('divider is not measurable');
    const start = bounds.x + bounds.width / 2;
    await page.mouse.move(start, bounds.y + 100);
    await page.mouse.down();
    await page.mouse.move(start + 120, bounds.y + 100, { steps: 6 });
    await page.mouse.up();
    await expect.poll(() => currentRatio(page)).toBeGreaterThan(0.5);
    const resized = await paneWidths(page);
    expect(resized.editor).toBeGreaterThan(initial.editor + 100);
    expect(resized.preview).toBeLessThan(initial.preview - 100);

    await page.locator('[data-editor-surface] .view-lines').first().click();
    await editor.press('ControlOrMeta+Z');
    await expect(page.getByRole('region', { name: 'Preview pane' })).not.toContainText('Added text.');

    await divider.focus();
    await divider.press('Home');
    await expect.poll(() => currentRatio(page)).toBe(0.2);
    const narrow = await paneWidths(page);
    expect(narrow.editor / (narrow.editor + narrow.preview)).toBeCloseTo(0.2, 2);
    await divider.press('ArrowRight');
    await expect.poll(() => currentRatio(page)).toBe(0.22);
    await divider.press('End');
    await expect.poll(() => currentRatio(page)).toBe(0.8);

    const arrangements = page.getByRole('radiogroup', { name: 'View arrangement' });
    await arrangements.getByRole('radio', { name: 'Preview', exact: true }).click();
    await expect(divider).toHaveCount(0);
    await arrangements.getByRole('radio', { name: 'Editor', exact: true }).click();
    await expect(divider).toHaveCount(0);
    await split(page);
    await expect(divider).toHaveAttribute('aria-valuenow', '80');
    await page.setViewportSize({ width: 375, height: 600 });
    await expect(divider).toHaveCount(0);
    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(divider).toHaveAttribute('aria-valuenow', '80');
});

test('each saved document restores its own split position after tabs close and the backend restarts', async ({
    app,
}) => {
    const first = await app.writeDocument('left.md', '# Left');
    const second = await app.writeDocument('right.md', '# Right');
    await app.seedRecents([first, second]);
    await app.launch();
    const { page } = app;
    await openFirst(page, 'left.md');
    await split(page);
    const divider = page.getByRole('separator', { name: 'Resize editor and preview panes' });
    await divider.focus();
    await divider.press('Home');
    await expect.poll(() => currentRatio(page)).toBe(0.2);
    await openRecent(page, 'right.md');
    await split(page);
    await expect(divider).toHaveAttribute('aria-valuenow', '50');
    await divider.focus();
    await divider.press('End');
    await expect.poll(() => currentRatio(page)).toBe(0.8);
    await page.getByRole('tab', { name: 'left.md' }).click();
    await expect(divider).toHaveAttribute('aria-valuenow', '20');
    await closeTab(page, 'left.md');
    await openRecent(page, 'left.md');
    await expect(divider).toHaveAttribute('aria-valuenow', '20');

    await app.relaunch();
    await openFirst(page, 'left.md');
    await expect(divider).toHaveAttribute('aria-valuenow', '20');
    await openRecent(page, 'right.md');
    await expect(divider).toHaveAttribute('aria-valuenow', '80');
});
