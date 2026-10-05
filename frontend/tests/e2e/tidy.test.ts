import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Locator, Page } from '@playwright/test';

import { expect, test, type E2EAppHarness } from '../support/harness';
import { makeDeepLists, makeLargeMarkdown } from './largeMarkdown';

// Large worker fixtures share host resources; keep each isolated app journey sequential.
test.describe.configure({ mode: 'default' });

const toolbar = (page: Page): Locator => page.getByRole('toolbar', { name: 'Document toolbar' });
const action = (page: Page, id: 'format' | 'compact' | 'lint'): Locator =>
    toolbar(page).locator(`[data-action-id="${id}"]`);

const formattedMessy = [
    '# Messy document',
    '',
    'This is _important_ prose with a line break  ',
    'and a one-space ending.',
    '',
    '- first bullet',
    '- second bullet',
    '',
    'A paragraph dividing the bullet lists.',
    '',
    '- plus bullet',
    '',
    '| Name  | Value |',
    '| ----- | ----- |',
    '| alpha | one   |',
    '',
    'A paragraph after extra blank lines.',
    '',
    'The word foo*bar*baz keeps its intraword markers.',
    '',
    '- tight first',
    '- tight second',
    '',
    '* adjacent first',
    '* adjacent second',
    '',
    '1. repeated first',
    '1. repeated second',
    '1. repeated third',
    '',
    '1. sequential first',
    '2. sequential second',
    '3. sequential third',
    '',
    '```text',
    'code has trailing spaces  ',
    '',
    '',
    'code blank lines stay',
    '```',
    '',
    '    indented code has spaces  ',
    '',
    '    its blank line stays',
    '',
].join('\n');

const compactedMessy = [
    'Messy document',
    '==============',
    '',
    'This is *important* prose with a line break  ',
    'and a one-space ending.',
    '',
    '* first bullet',
    '* second bullet',
    '',
    'A paragraph dividing the bullet lists.',
    '',
    '+ plus bullet',
    '',
    '| Name| Value|',
    '|---|---|',
    '|alpha|one|',
    '',
    'A paragraph after extra blank lines.',
    '',
    'The word foo*bar*baz keeps its intraword markers.',
    '',
    '- tight first',
    '- tight second',
    '',
    '* adjacent first',
    '* adjacent second',
    '',
    '1. repeated first',
    '1. repeated second',
    '1. repeated third',
    '',
    '1. sequential first',
    '2. sequential second',
    '3. sequential third',
    '',
    '```text',
    'code has trailing spaces  ',
    '',
    '',
    'code blank lines stay',
    '```',
    '',
    '    indented code has spaces  ',
    '',
    '    its blank line stays',
    '',
].join('\n');

async function activeText(page: Page): Promise<string> {
    return page.evaluate(async () => {
        const root = window as unknown as {
            go: {
                appmodel: {
                    AppModelHandler: {
                        GetState: (request: {
                            id: string;
                        }) => Promise<{ data?: { activeBuffer?: { content?: string } } }>;
                    };
                };
            };
        };
        const response = await root.go.appmodel.AppModelHandler.GetState({ id: crypto.randomUUID() });
        return response.data?.activeBuffer?.content ?? '';
    });
}

async function openDocument(app: E2EAppHarness, filename: string, contents: string): Promise<void> {
    const source = await app.writeDocument(filename, contents);
    await app.seedRecents([source]);
    await app.launch();
    const { page } = app;
    await page
        .getByRole('tab', { name: /Untitled/u })
        .locator('..')
        .getByRole('button', { name: /^Close /u })
        .click();
    await page.getByTestId('document-launcher').getByRole('button', { name: filename, exact: true }).click();
    await expect(page.getByRole('tab', { name: filename })).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => activeText(page), { timeout: 30_000 }).toBe(contents);
    await expect(page.locator('[data-editor-surface] .view-lines')).toContainText(contents.split('\n')[0]);
}

async function fixture(app: E2EAppHarness, filename: string): Promise<string> {
    return readFile(join(app.repositoryDirectory, 'frontend', 'tests', 'fixtures', filename), 'utf8');
}

async function disableAutosave(page: Page): Promise<void> {
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const menu = page.getByRole('menu', { name: 'Settings menu' });
    const autosave = menu.getByRole('checkbox', { name: 'Autosave' });
    if (await autosave.isChecked()) await menu.locator('[data-settings-toggle="Autosave"]').click();
    await page.keyboard.press('Escape');
}

const palettes = [
    ['Material', 'Light', 'material', 'light'],
    ['Material', 'Dark', 'material', 'dark'],
    ['Liquid Glass', 'Light', 'glass', 'light'],
    ['Liquid Glass', 'Dark', 'glass', 'dark'],
    ['Minimal', 'Light', 'minimal', 'light'],
    ['Minimal', 'Dark', 'minimal', 'dark'],
] as const;

async function choosePalette(page: Page, themeLabel: string, modeLabel: string): Promise<void> {
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const menu = page.getByRole('menu', { name: 'Settings menu' });
    await menu.getByRole('radio', { name: themeLabel, exact: true }).click();
    await menu.getByRole('radio', { name: modeLabel, exact: true }).click();
    await page.keyboard.press('Escape');
}

async function visibleTextContrast(page: Page, target: Locator): Promise<number> {
    const box = await target.boundingBox();
    if (box === null) throw new Error('the text target has no screen position');
    const screenshot = await page.screenshot();
    return target.evaluate(
        async (element, { imageUrl, x, y }) => {
            const image = new Image();
            image.src = imageUrl;
            await image.decode();
            const canvas = document.createElement('canvas');
            canvas.width = image.naturalWidth;
            canvas.height = image.naturalHeight;
            const context = canvas.getContext('2d');
            if (context === null) throw new Error('screenshot canvas unavailable');
            context.drawImage(image, 0, 0);
            const pixel = context.getImageData(Math.round(x), Math.round(y), 1, 1).data;
            const foreground = getComputedStyle(element)
                .color.match(/[\d.]+/gu)
                ?.slice(0, 3)
                .map(Number);
            if (foreground === undefined || foreground.length !== 3) throw new Error('text color unavailable');
            const luminance = (rgb: number[]): number => {
                const linear = rgb.map((value) => {
                    const normalized = value / 255;
                    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
                });
                return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
            };
            const first = luminance(foreground);
            const second = luminance([...pixel].slice(0, 3));
            return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
        },
        {
            imageUrl: `data:image/png;base64,${screenshot.toString('base64')}`,
            x: box.x + 3,
            y: box.y + box.height / 2,
        },
    );
}

test('formats the messy document canonically and restores the source with one Undo', async ({ app }) => {
    const original = await fixture(app, 'messy-document.md');
    await openDocument(app, 'messy-document.md', original);
    const { page } = app;
    await disableAutosave(page);

    await action(page, 'format').click();
    await expect.poll(() => activeText(page)).toBe(formattedMessy);
    await expect(page.locator('[aria-label="Document identity"]')).toContainText('Unsaved changes');

    await action(page, 'format').click();
    await expect(action(page, 'format')).toBeEnabled();
    await expect.poll(() => activeText(page)).toBe(formattedMessy);
    const editor = page.locator('[data-editor-surface] textarea').first();
    await editor.focus();
    await expect(editor).toBeFocused();
    const modifier = await page.evaluate(() => (navigator.userAgent.includes('Macintosh') ? 'Meta' : 'Control'));
    await editor.press(`${modifier}+z`);
    await expect.poll(() => activeText(page)).toBe(original);
    app.expectNoForeignRequests();
});

test('compacts whitespace while preserving hard breaks and the rendered preview', async ({ app }) => {
    const original = await fixture(app, 'messy-document.md');
    await openDocument(app, 'messy-document.md', original);
    const { page } = app;
    await disableAutosave(page);
    const arrangement = page.getByRole('radiogroup', { name: 'View arrangement' });
    await arrangement.getByRole('radio', { name: 'Split' }).click();
    const preview = page.getByRole('region', { name: 'Preview pane' });
    await expect(preview).toContainText('A paragraph after extra blank lines.');
    const rendered = async (): Promise<string> =>
        preview.locator('article').evaluate((element) => {
            const clone = element.cloneNode(true) as HTMLElement;
            clone.querySelectorAll('[data-source-line]').forEach((node) => node.removeAttribute('data-source-line'));
            return clone.innerHTML;
        });
    const before = await rendered();

    await action(page, 'compact').click();
    await expect.poll(() => activeText(page)).toBe(compactedMessy);
    await expect.poll(rendered).toBe(before);
    app.expectNoForeignRequests();
});

test('keeps visible Monaco text when changing views and docking or closing Problems', async ({ app }) => {
    const source = '# Visible editor line\n\n* marker\n';
    await openDocument(app, 'view-switch.md', source);
    const { page } = app;
    await page.setViewportSize({ width: 1280, height: 720 });
    const arrangement = page.getByRole('radiogroup', { name: 'View arrangement' });
    const lines = page.locator('[data-editor-surface] .view-lines');
    await expect(lines).toContainText('Visible editor line');
    await arrangement.getByRole('radio', { name: 'Preview' }).click();
    await expect(page.getByRole('heading', { name: 'Visible editor line' })).toBeVisible();
    await arrangement.getByRole('radio', { name: 'Editor' }).click();
    await expect(lines).toContainText('Visible editor line');
    await arrangement.getByRole('radio', { name: 'Split' }).click();
    await expect(lines).toContainText('Visible editor line');

    await action(page, 'lint').click();
    await expect(page.getByRole('button', { name: '1 problems' })).toBeVisible();
    await page.getByRole('button', { name: '1 problems' }).click();
    const panel = page.getByRole('region', { name: 'Problems' });
    await expect(panel).toBeVisible();
    const visibleGeometry = async (): Promise<{ editor: boolean; panel: boolean }> =>
        page.evaluate(() => {
            const editor = document.querySelector('[data-editor-surface]')?.getBoundingClientRect();
            const problems = document.querySelector('section[aria-label="Problems"]')?.getBoundingClientRect();
            return {
                editor: editor !== undefined && editor.width > 200 && editor.height > 80,
                panel: problems !== undefined && problems.width > 200 && problems.height > 40,
            };
        });
    await expect.poll(visibleGeometry).toEqual({ editor: true, panel: true });
    await expect(lines).toContainText('Visible editor line');
    await panel.getByRole('button', { name: 'Close Problems' }).click();
    await expect(panel).toHaveCount(0);
    await expect(lines).toContainText('Visible editor line');
    await page.getByRole('button', { name: 'View', exact: true }).click();
    const problemsMenuItem = page
        .getByRole('menu', { name: 'View options' })
        .getByRole('menuitemcheckbox', { name: 'Problems' });
    await expect(problemsMenuItem).toBeVisible();
    await problemsMenuItem.click();
    await expect(panel).toBeVisible();
    await panel.getByRole('button', { name: 'Close Problems' }).click();
    const editor = page.locator('[data-editor-surface] textarea').first();
    await editor.focus();
    await expect(editor).toBeFocused();
    await page.keyboard.insertText('X');
    await expect.poll(() => activeText(page)).toContain('X');
    app.expectNoForeignRequests();
});

test('shows real worker progress, cancels a large Format without edits, and completes a repeat run', async ({
    app,
}) => {
    test.setTimeout(240_000);
    const source = makeLargeMarkdown(3 * 1024 * 1024);
    expect(Buffer.byteLength(source, 'utf8')).toBeGreaterThanOrEqual(3 * 1024 * 1024);
    expect(Buffer.byteLength(source, 'utf8')).toBeLessThan(10 * 1024 * 1024);
    await openDocument(app, 'large-format.md', source);
    const { page } = app;
    await disableAutosave(page);
    const started = performance.now();
    await action(page, 'format').click();
    const cancel = action(page, 'format');
    await expect(cancel).toHaveAccessibleName('Cancel');
    await expect(page.getByRole('status', { name: 'Tidying document…' })).toContainText(/\d+\/\d+/u);
    await cancel.click();
    await expect(page.locator('[data-notification-code="tidy-cancelled"]')).toBeVisible();
    await expect.poll(() => activeText(page), { timeout: 20_000 }).toBe(source);
    console.log(`[tidy] large cancelMs=${Math.round(performance.now() - started)} ${process.platform}/${process.arch}`);

    const repeated = performance.now();
    await action(page, 'format').click();
    await expect.poll(() => activeText(page), { timeout: 180_000 }).not.toBe(source);
    await expect.poll(() => action(page, 'format').getAttribute('aria-label'), { timeout: 180_000 }).toBe('Format');
    expect(await activeText(page)).toContain('- item 0-0 with _emphasis_ and prose.');
    console.log(
        `[tidy] large completeMs=${Math.round(performance.now() - repeated)} ${process.platform}/${process.arch}`,
    );
    app.expectNoForeignRequests();
});

test('blocks typing during close Save Format while progress and Cancel remain usable', async ({ app }) => {
    test.setTimeout(240_000);
    const source = makeLargeMarkdown(3 * 1024 * 1024);
    const path = await app.writeDocument('close-save-format.md', source);
    await app.seedRecents([path]);
    await app.launch();
    const { page } = app;
    await page
        .getByRole('tab', { name: /Untitled/u })
        .locator('..')
        .getByRole('button', { name: /^Close /u })
        .click();
    await page.getByTestId('document-launcher').getByRole('button', { name: 'close-save-format.md' }).click();
    await expect(page.getByRole('tab', { name: 'close-save-format.md' })).toBeVisible();
    await disableAutosave(page);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const menu = page.getByRole('menu', { name: 'Settings menu' });
    await menu.getByRole('menuitemcheckbox', { name: 'Format on save' }).click();
    if (await menu.isVisible()) await page.keyboard.press('Escape');
    const editor = page.locator('[data-editor-surface] textarea').first();
    await editor.focus();
    await page.keyboard.insertText('X');
    const edited = `X${source}`;
    await expect.poll(() => activeText(page), { timeout: 30_000 }).toBe(edited);

    await page
        .getByRole('tab', { name: 'close-save-format.md' })
        .locator('..')
        .getByRole('button', { name: /^Close /u })
        .click();
    const prompt = page.getByRole('dialog', { name: 'Save changes before closing?' });
    await prompt.getByRole('button', { name: 'Save', exact: true }).click();
    const cancel = action(page, 'format');
    await expect(cancel).toHaveAccessibleName('Cancel', { timeout: 30_000 });
    await expect(page.getByRole('status', { name: 'Tidying document…' })).toContainText(/\d+\/\d+/u);
    await expect(page.locator('[role="tabpanel"][inert]')).toHaveCount(1);

    await editor.evaluate((element: HTMLTextAreaElement) => element.focus());
    expect(await editor.evaluate((element) => document.activeElement === element)).toBe(false);
    await page.keyboard.insertText('RACE');
    expect(await activeText(page)).toBe(edited);
    await cancel.click();

    await expect(page.getByRole('tab', { name: 'close-save-format.md' })).toHaveCount(0, { timeout: 180_000 });
    expect(await readFile(path, 'utf8')).toBe(edited);
    app.expectNoForeignRequests();
});

test('disables other tidy actions while Format runs and discards a result after typing', async ({ app }) => {
    test.setTimeout(120_000);
    const source = makeLargeMarkdown(3 * 1024 * 1024);
    await openDocument(app, 'large-stale.md', source);
    const { page } = app;
    await disableAutosave(page);
    await action(page, 'format').click();
    await expect(action(page, 'format')).toHaveAccessibleName('Cancel');
    for (const id of ['compact', 'lint'] as const) {
        await expect(action(page, id)).toBeDisabled();
        await expect(action(page, id)).toHaveAttribute('title', 'Another operation is in progress.');
    }
    const editor = page.locator('[data-editor-surface] textarea').first();
    await editor.focus();
    await page.keyboard.insertText('X');
    await expect(page.locator('[data-notification-code="tidy-stale"]')).toBeVisible({ timeout: 120_000 });
    await expect.poll(() => activeText(page)).toBe(`X${source}`);
    app.expectNoForeignRequests();
});

test('reveals Cancel after one second for a smaller nested-list run', async ({ app }) => {
    test.setTimeout(120_000);
    const source = makeDeepLists(512 * 1024);
    expect(Buffer.byteLength(source, 'utf8')).toBeGreaterThanOrEqual(512 * 1024);
    expect(Buffer.byteLength(source, 'utf8')).toBeLessThan(1024 * 1024);
    await openDocument(app, 'delayed-format.md', source);
    const { page } = app;
    const started = performance.now();
    await action(page, 'format').click();
    await expect(action(page, 'format')).toHaveAccessibleName('Cancel', { timeout: 30_000 });
    const elapsed = performance.now() - started;
    expect(elapsed).toBeGreaterThanOrEqual(1000);
    await expect(page.getByRole('status', { name: 'Tidying document…' })).toContainText(/\d+\/\d+/u);
    await action(page, 'format').click();
    await expect(page.locator('[data-notification-code="tidy-cancelled"]')).toBeVisible();
    await expect.poll(() => activeText(page)).toBe(source);
    console.log(`[tidy] delayed cancelMs=${Math.round(elapsed)} ${process.platform}/${process.arch}`);
    app.expectNoForeignRequests();
});

test('keeps the Problems panel legible and reachable in every theme and mode', async ({ app }) => {
    await openDocument(app, 'palette-problems.md', '# Palette\n\n* bullet\n');
    const { page } = app;
    await page.setViewportSize({ width: 1280, height: 720 });
    await action(page, 'lint').click();
    const status = page.getByRole('button', { name: '1 problems' });
    await expect(status).toBeVisible();
    await status.click();
    const panel = page.getByRole('region', { name: 'Problems' });
    await expect(panel.locator('[data-problem-row="true"]')).toHaveCount(1);

    for (const [themeLabel, modeLabel, theme, mode] of palettes) {
        await choosePalette(page, themeLabel, modeLabel);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await expect(page.locator('html')).toHaveAttribute('data-mode', mode);
        await expect(panel).toBeVisible();
        await expect(panel.locator('[data-problem-row="true"]')).toContainText('List bullet marker');
        const box = await panel.boundingBox();
        expect(box?.width ?? 0).toBeGreaterThan(200);
        expect(box?.height ?? 0).toBeGreaterThan(40);
        const visible = await panel.evaluate((element) => {
            const rect = element.getBoundingClientRect();
            const hit = document.elementFromPoint(rect.left + 20, rect.top + 20);
            return rect.top >= 0 && rect.bottom <= window.innerHeight && hit !== null && element.contains(hit);
        });
        expect(visible).toBe(true);
        const row = panel.locator('[data-problem-row="true"]').first();
        expect(await visibleTextContrast(page, row)).toBeGreaterThanOrEqual(4.5);
        await panel.getByRole('button', { name: 'Close Problems' }).focus();
        await page.keyboard.press('Tab');
        await expect(row).toBeFocused();
        await expect(row).toHaveCSS('outline-style', 'solid');
        await page.keyboard.press('Enter');
        await expect(page.locator('[data-editor-surface] textarea').first()).toBeFocused();
    }
    app.expectNoForeignRequests();
});

test('keeps progress and Cancel usable in every theme and mode', async ({ app }) => {
    test.setTimeout(180_000);
    const source = makeLargeMarkdown(1024 * 1024 + 32 * 1024);
    await openDocument(app, 'palette-cancel.md', source);
    const { page } = app;
    await page.setViewportSize({ width: 1280, height: 720 });
    for (const [themeLabel, modeLabel, theme, mode] of palettes) {
        await choosePalette(page, themeLabel, modeLabel);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await expect(page.locator('html')).toHaveAttribute('data-mode', mode);
        await action(page, 'format').focus();
        await action(page, 'format').press('Enter');
        await expect(action(page, 'format')).toHaveAccessibleName('Cancel');
        await expect(page.getByRole('status', { name: 'Tidying document…' })).toBeVisible();
        expect(await visibleTextContrast(page, action(page, 'format'))).toBeGreaterThanOrEqual(4.5);
        await action(page, 'format').focus();
        await page.keyboard.press('Tab');
        await page.keyboard.press('Shift+Tab');
        await expect(action(page, 'format')).toBeFocused();
        expect(await action(page, 'format').evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe(
            'none',
        );
        const box = await action(page, 'format').boundingBox();
        expect(box?.width ?? 0).toBeGreaterThan(20);
        expect(box?.height ?? 0).toBeGreaterThan(15);
        await action(page, 'format').press('Enter');
        await expect(action(page, 'format')).toHaveAccessibleName('Format');
        await expect.poll(() => activeText(page)).toBe(source);
    }
    app.expectNoForeignRequests();
});
