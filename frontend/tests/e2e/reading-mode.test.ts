import { join } from 'node:path';
import type { Page } from '@playwright/test';

import { expect, test } from '../support/harness';

const SHELL = '[data-testid="application-shell"]';
const PREVIEW = 'section[aria-label="Preview pane"]';

async function openRecentFromLauncher(page: Page, filename: string): Promise<void> {
    const launcher = page.getByTestId('document-launcher');
    if (!(await launcher.isVisible())) {
        await page
            .getByRole('tab', { name: /Untitled/u })
            .locator('..')
            .getByRole('button', { name: /^Close /u })
            .click();
    }
    await expect(launcher).toBeVisible();
    await launcher.getByRole('button', { name: filename, exact: true }).click();
    await expect(page.getByRole('tab', { name: filename })).toBeVisible();
}

async function expectReading(page: Page): Promise<void> {
    await expect(page.locator(SHELL)).toHaveAttribute('data-reading', 'true');
    await expect(page.getByRole('menubar')).toBeHidden();
    await expect(page.getByLabel('Document identity')).toBeHidden();
    await expect(page.getByRole('tab').first()).toBeHidden();
    await expect(page.getByRole('toolbar', { name: 'Document toolbar' })).toHaveCount(0);
    await expect(page.locator('[data-editor-surface]')).toBeHidden();
    await expect(page.locator(PREVIEW)).toBeVisible();
}

async function expectNormal(page: Page): Promise<void> {
    await expect(page.locator(SHELL)).not.toHaveAttribute('data-reading', /.*/u);
    await expect(page.getByRole('menubar')).toBeVisible();
    await expect(page.getByLabel('Document identity')).toBeVisible();
    await expect(page.getByRole('tab').first()).toBeVisible();
    await expect(page.getByRole('toolbar', { name: 'Document toolbar' })).toBeVisible();
    await expect(page.locator('[data-editor-surface]')).toBeVisible();
}

test('toggles Reading mode with Ctrl+Enter twice, hiding all chrome and restoring it afterwards', async ({ app }) => {
    const source = await app.writeDocument('reading.md', '# Reading title\n\nBody paragraph.\n');
    await app.seedRecents([source]);
    await app.launch();
    const { page } = app;
    await page.setViewportSize({ width: 1280, height: 720 });
    await openRecentFromLauncher(page, 'reading.md');
    await expectNormal(page);

    await page.keyboard.press('ControlOrMeta+Enter');
    await expectReading(page);
    await expect(page.locator(PREVIEW)).toContainText('Body paragraph.');

    await page.keyboard.press('ControlOrMeta+Enter');
    await expectNormal(page);
});

test('enters Reading mode from the View menu Distraction-free reading row', async ({ app }) => {
    const source = await app.writeDocument('reading-menu.md', '# Menu\n\nVia the menu.\n');
    await app.seedRecents([source]);
    await app.launch();
    const { page } = app;
    await page.setViewportSize({ width: 1280, height: 720 });
    await openRecentFromLauncher(page, 'reading-menu.md');

    await page.getByRole('button', { name: 'View', exact: true }).click();
    await page
        .getByRole('menu', { name: 'View options' })
        .getByRole('menuitem', { name: 'Distraction-free reading' })
        .click();
    await expectReading(page);
});

test('Ctrl+Tab still switches documents while Reading mode is active', async ({ app }) => {
    const first = await app.writeDocument('one.md', '# One\n\nFirst document text.\n');
    const second = await app.writeDocument('two.md', '# Two\n\nSecond document text.\n');
    await app.seedRecents([first, second]);
    await app.launch();
    const { page } = app;
    await page.setViewportSize({ width: 1280, height: 720 });
    await openRecentFromLauncher(page, 'one.md');
    await page.getByRole('button', { name: 'File', exact: true }).click();
    await page.getByRole('menu', { name: 'File' }).getByRole('menuitem', { name: 'two.md', exact: true }).click();
    await expect(page.getByRole('tab', { name: 'two.md' })).toHaveAttribute('aria-selected', 'true');
    await page.locator('[data-editor-surface] .view-lines').first().click();

    await page.keyboard.press('ControlOrMeta+Enter');
    await expectReading(page);
    await expect(page.locator(PREVIEW)).toContainText('Second document text.');

    await page.keyboard.press('ControlOrMeta+Tab');
    await expectReading(page);
    await expect(page.locator(PREVIEW)).toContainText('First document text.');
    await expect(page.locator(PREVIEW)).not.toContainText('Second document text.');
});

test('Ctrl+, in Reading mode opens the Settings menu and Escape closes it while Reading mode stays active', async ({
    app,
}) => {
    const source = await app.writeDocument('reading-settings.md', '# Settings\n\nText.\n');
    await app.seedRecents([source]);
    await app.launch();
    const { page } = app;
    await page.setViewportSize({ width: 1280, height: 720 });
    await openRecentFromLauncher(page, 'reading-settings.md');
    await page.keyboard.press('ControlOrMeta+Enter');
    await expectReading(page);

    await page.keyboard.press('ControlOrMeta+,');
    const menu = page.getByRole('menu', { name: 'Settings menu' });
    await expect(menu).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(page.locator(SHELL)).toHaveAttribute('data-reading', 'true');
});

test('the Keyboard shortcuts dialog lists Distraction-free reading with Ctrl+Enter', async ({ app }) => {
    await app.launch();
    const { page } = app;
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.getByRole('button', { name: 'About', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Keyboard shortcuts' }).click();
    const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
    await expect(dialog).toBeVisible();
    const row = dialog.locator('[data-action-id="distraction-free-reading"]');
    await expect(row).toContainText('Distraction-free reading');
    await expect(row.locator('kbd')).toHaveText(/^(Ctrl\+Enter|⌘↩)$/u);
});

test('Ctrl+Enter inside the editor Find input does not enter Reading mode', async ({ app }) => {
    const source = await app.writeDocument('reading-find.md', '# Find\n\nalpha beta alpha\n');
    await app.seedRecents([source]);
    await app.launch();
    const { page } = app;
    await page.setViewportSize({ width: 1280, height: 720 });
    await openRecentFromLauncher(page, 'reading-find.md');
    await page.locator('[data-editor-surface] .view-lines').first().click();
    await page.keyboard.press('ControlOrMeta+f');
    const widget = page.locator('[data-editor-surface] .find-widget');
    await expect(widget).toBeVisible();
    const findInput = widget.locator('.find-part textarea').first();
    await findInput.fill('alpha');
    await findInput.press('Control+Enter');

    await expect(findInput).toHaveValue('alpha\n');
    await expect(page.locator(SHELL)).not.toHaveAttribute('data-reading', /.*/u);
    await expect(page.locator('[data-editor-surface]')).toBeVisible();
    await expect(widget).toBeVisible();
});

test('starts in the normal window after relaunch from Reading mode and keeps the saved arrangement', async ({
    app,
}) => {
    const source = await app.writeDocument('reading-restart.md', '# Restart\n\nPersisted arrangement.\n');
    await app.seedRecents([source]);
    await app.launch();
    const { page } = app;
    await page.setViewportSize({ width: 1280, height: 720 });
    await openRecentFromLauncher(page, 'reading-restart.md');
    await page.getByRole('radiogroup', { name: 'View arrangement' }).getByRole('radio', { name: 'Split' }).click();
    await expect(
        page.getByRole('radiogroup', { name: 'View arrangement' }).getByRole('radio', { name: 'Split' }),
    ).toBeChecked();
    await page.locator('[data-editor-surface] .view-lines').first().click();

    await page.keyboard.press('ControlOrMeta+Enter');
    await expectReading(page);

    await app.relaunch();
    await expect(page.getByTestId('application-shell')).toBeVisible();
    await expect(page.locator(SHELL)).not.toHaveAttribute('data-reading', /.*/u);
    await expect(page.getByRole('menubar')).toBeVisible();
    await openRecentFromLauncher(page, 'reading-restart.md');
    await expect(page.locator(SHELL)).not.toHaveAttribute('data-reading', /.*/u);
    await expect(
        page.getByRole('radiogroup', { name: 'View arrangement' }).getByRole('radio', { name: 'Split' }),
    ).toBeChecked();
    await expect(page.locator('[data-editor-surface]')).toBeVisible();
    await expect(page.locator(PREVIEW)).toBeVisible();
});

test('centers the Reading mode document column at no more than 700 px wide in a 1280 px window', async ({ app }) => {
    const source = await app.writeDocument('reading-column.md', '# Column\n\nCentered text.\n');
    await app.seedRecents([source]);
    await app.launch();
    const { page } = app;
    await page.setViewportSize({ width: 1280, height: 720 });
    await openRecentFromLauncher(page, 'reading-column.md');
    await page.keyboard.press('ControlOrMeta+Enter');
    await expectReading(page);

    const box = await page.locator(PREVIEW).boundingBox();
    expect(box).not.toBeNull();
    const { x, width } = box!;
    expect(width).toBeLessThanOrEqual(700);
    expect(Math.abs(x + width / 2 - 1280 / 2)).toBeLessThanOrEqual(2);
});

test('fills the 375 px window with the Reading mode document column minus its padding', async ({ app }) => {
    const source = await app.writeDocument('reading-narrow.md', '# Narrow\n\nNarrow text.\n');
    await app.seedRecents([source]);
    await app.launch();
    const { page } = app;
    await page.setViewportSize({ width: 1280, height: 720 });
    await openRecentFromLauncher(page, 'reading-narrow.md');
    await page.keyboard.press('ControlOrMeta+Enter');
    await expectReading(page);
    await page.setViewportSize({ width: 375, height: 720 });

    await expect(async () => {
        const box = await page.locator(PREVIEW).boundingBox();
        expect(box).not.toBeNull();
        expect(box!.width).toBeGreaterThan(375 - 80);
        expect(box!.width).toBeLessThanOrEqual(375);
    }).toPass();
});

const appearances = [
    { family: 'Liquid Glass', mode: 'Light' },
    { family: 'Liquid Glass', mode: 'Dark' },
    { family: 'Material', mode: 'Light' },
    { family: 'Material', mode: 'Dark' },
    { family: 'Minimal', mode: 'Light' },
    { family: 'Minimal', mode: 'Dark' },
] as const;

for (const { family, mode } of appearances) {
    test(`shows the rendered document filling the window in Reading mode with ${family} ${mode}`, async ({ app }) => {
        const source = await app.writeDocument(
            'reading-visible.md',
            '# Visible heading\n\nParagraph with **bold** and `code` text.\n',
        );
        await app.seedRecents([source]);
        await app.launch();
        const { page } = app;
        await page.setViewportSize({ width: 1280, height: 720 });
        await openRecentFromLauncher(page, 'reading-visible.md');
        await page.getByRole('button', { name: 'Settings', exact: true }).click();
        const menu = page.getByRole('menu', { name: 'Settings menu' });
        for (const choice of [family, mode]) {
            const radio = menu.getByRole('radio', { name: choice, exact: true });
            await radio.press('Space');
            await expect(radio).toHaveAttribute('aria-checked', 'true');
        }
        await page.keyboard.press('Escape');
        await expect(menu).toBeHidden();

        await page.keyboard.press('ControlOrMeta+Enter');
        await expectReading(page);

        const heading = page.locator(PREVIEW).getByRole('heading', { name: 'Visible heading' });
        await expect(heading).toBeInViewport({ ratio: 1 });
        const box = await heading.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.height).toBeGreaterThan(0);
        const hit = await heading.evaluate((element) => {
            const rect = element.getBoundingClientRect();
            const target = document.elementFromPoint(rect.left + 4, rect.top + rect.height / 2);
            return target !== null && element.contains(target);
        });
        expect(hit).toBe(true);
        const pane = await page.locator(PREVIEW).boundingBox();
        expect(pane).not.toBeNull();
        expect(pane!.height).toBeGreaterThan(720 / 2);
    });
}

test('keeps the Image toolbar button disabled and ignores Ctrl/Cmd+Shift+I for a writable document', async ({
    app,
}) => {
    const source = await app.writeDocument('image-unavailable.md', 'Unchanged text\n');
    await app.seedRecents([source]);
    await app.launch();
    const { page } = app;
    await page.setViewportSize({ width: 1280, height: 720 });
    await openRecentFromLauncher(page, 'image-unavailable.md');
    const image = page.getByRole('toolbar', { name: 'Document toolbar' }).getByRole('button', { name: 'Image' });
    await expect(image).toBeDisabled();
    await image.click({ force: true });
    await page.locator('[data-editor-surface] .view-lines').first().click();
    await page.keyboard.press('ControlOrMeta+Shift+I');

    await expect(page.locator('[data-editor-surface] .view-lines').first()).toHaveText('Unchanged text', {
        useInnerText: true,
    });
});

test('leaves Reading mode with Escape and returns focus to the editor', async ({ app }) => {
    const source = await app.writeDocument('reading-escape.md', '# Escape\n\nBody paragraph.\n');
    await app.seedRecents([source]);
    await app.launch();
    const { page } = app;
    await page.setViewportSize({ width: 1280, height: 720 });
    await openRecentFromLauncher(page, 'reading-escape.md');
    await page.locator('[data-editor-surface] .view-lines').first().click();

    await page.keyboard.press('ControlOrMeta+Enter');
    await expectReading(page);
    const inDocument = await page.evaluate(() => document.activeElement?.closest('[data-reading-document]') !== null);
    expect(inDocument).toBe(true);

    await page.keyboard.press('Escape');
    await expectNormal(page);
    await expect(page.locator('[data-editor-surface] textarea').first()).toBeFocused();
});

const EXIT = { name: 'Exit Reading mode' };
const SIDEBAR_TOGGLE = { name: 'Show or hide sidebar' };
const TABS_TOGGLE = { name: 'Show or hide tab bar' };

async function enterReadingFrom(page: Page, filename: string): Promise<void> {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openRecentFromLauncher(page, filename);
    await page.locator('[data-editor-surface] .view-lines').first().click();
    await page.keyboard.press('ControlOrMeta+Enter');
    await expectReading(page);
}

function opacityOf(page: Page, name: string): Promise<number> {
    return page
        .getByRole('button', { name, exact: true })
        .evaluate((element) => Number(getComputedStyle(element).opacity));
}

test('reveals the tab bar and sidebar controls from anywhere along the top and left edges', async ({ app }) => {
    const source = await app.writeDocument('reading-edges/reading-edges.md', '# Edges\n\nBody paragraph.\n');
    await app.seedRecents([source]);
    await app.launch();
    await app.openWorkspace(join(app.documentDirectory, 'reading-edges'));
    const { page } = app;
    await enterReadingFrom(page, 'reading-edges.md');
    const viewport = page.viewportSize()!;

    await page.mouse.move(120, 10);
    expect(await opacityOf(page, TABS_TOGGLE.name)).toBe(1);
    await page.mouse.move(viewport.width - 200, 10);
    expect(await opacityOf(page, TABS_TOGGLE.name)).toBe(1);

    await page.mouse.move(10, 120);
    expect(await opacityOf(page, SIDEBAR_TOGGLE.name)).toBe(1);
    await page.mouse.move(10, viewport.height - 60);
    expect(await opacityOf(page, SIDEBAR_TOGGLE.name)).toBe(1);

    await page.mouse.move(viewport.width / 2, viewport.height / 2);
    expect(await opacityOf(page, TABS_TOGGLE.name)).toBe(0);
    expect(await opacityOf(page, SIDEBAR_TOGGLE.name)).toBe(0);
});

test('shows the three reading controls only on hover or keyboard focus, with the Exit control faint under the pointer', async ({
    app,
}) => {
    const source = await app.writeDocument('reading-controls/reading-controls.md', '# Controls\n\nBody paragraph.\n');
    await app.seedRecents([source]);
    await app.launch();
    await app.openWorkspace(join(app.documentDirectory, 'reading-controls'));
    const { page } = app;
    await enterReadingFrom(page, 'reading-controls.md');
    const column = (await page.locator(PREVIEW).boundingBox())!;

    for (const name of [EXIT.name, SIDEBAR_TOGGLE.name, TABS_TOGGLE.name]) {
        expect(await opacityOf(page, name)).toBe(0);
    }

    await page.getByRole('button', EXIT).hover();
    expect(await opacityOf(page, EXIT.name)).toBeLessThanOrEqual(0.15);

    await page.mouse.move(640, 360);
    for (const name of [SIDEBAR_TOGGLE.name, TABS_TOGGLE.name]) {
        await page.getByRole('button', { name, exact: true }).hover();
        expect(await opacityOf(page, name)).toBe(1);
    }

    await page.mouse.move(640, 360);
    expect(await opacityOf(page, EXIT.name)).toBe(0);
    for (const name of [EXIT.name, SIDEBAR_TOGGLE.name, TABS_TOGGLE.name]) {
        await page.getByRole('button', { name, exact: true }).focus();
        await page.keyboard.press('Shift+Tab');
        await page.keyboard.press('Tab');
        await expect(page.getByRole('button', { name, exact: true })).toBeFocused();
        expect(await opacityOf(page, name)).toBe(1);
    }
    expect(await page.locator(PREVIEW).boundingBox()).toEqual(column);

    await page.getByRole('button', EXIT).focus();
    await page.keyboard.press('Enter');
    await expectNormal(page);
});

test('opens a file from the sidebar overlay and switches tabs from the tab overlay without leaving Reading mode', async ({
    app,
}) => {
    const root = join(app.documentDirectory, 'reading-notes');
    const first = await app.writeDocument('reading-notes/first.md', '# First\n\nFirst body.\n');
    await app.writeDocument('reading-notes/second.md', '# Second\n\nSecond body.\n');
    await app.seedRecents([first]);
    await app.launch();
    await app.openWorkspace(root);
    const { page } = app;
    await enterReadingFrom(page, 'first.md');
    const column = (await page.locator(PREVIEW).boundingBox())!;

    await page.getByRole('button', SIDEBAR_TOGGLE).click();
    const sidebar = page.getByRole('complementary', { name: 'Sidebar' });
    await expect(sidebar).toBeVisible();
    expect(await page.locator(PREVIEW).boundingBox()).toEqual(column);
    await sidebar.getByRole('treeitem', { name: 'second.md' }).click();
    await expect(page.locator(PREVIEW)).toContainText('Second body.');
    await expectReading(page);

    await page.getByRole('button', TABS_TOGGLE).click();
    await expect(page.getByRole('tab', { name: 'first.md' })).toBeVisible();
    expect(await page.locator(PREVIEW).boundingBox()).toEqual(column);
    await page.getByRole('tab', { name: 'first.md' }).click();
    await expect(page.locator(PREVIEW)).toContainText('First body.');
    await expect(page.locator(SHELL)).toHaveAttribute('data-reading', 'true');
});

test('closes the overlay with Escape before leaving Reading mode and keeps the stored sidebar width', async ({
    app,
}) => {
    const root = join(app.documentDirectory, 'reading-width');
    const source = await app.writeDocument('reading-width/doc.md', '# Doc\n\nBody.\n');
    await app.seedRecents([source]);
    await app.launch();
    await app.openWorkspace(root);
    const { page } = app;
    await page.setViewportSize({ width: 1280, height: 720 });
    await openRecentFromLauncher(page, 'doc.md');
    const widthBefore = (await page.getByRole('complementary', { name: 'Sidebar' }).boundingBox())!.width;
    await page.locator('[data-editor-surface] .view-lines').first().click();
    await page.keyboard.press('ControlOrMeta+Enter');
    await expectReading(page);

    await page.keyboard.press('ControlOrMeta+\\');
    const overlay = page.getByRole('complementary', { name: 'Sidebar' });
    await expect(overlay).toBeVisible();
    expect((await overlay.boundingBox())!.width).toBe(widthBefore);
    await expect(page.getByRole('separator', { name: 'Resize sidebar' })).toHaveCount(0);

    await page.keyboard.press('Escape');
    await expect(overlay).toBeHidden();
    await expect(page.locator(SHELL)).toHaveAttribute('data-reading', 'true');

    await page.keyboard.press('Escape');
    await expectNormal(page);
    expect((await page.getByRole('complementary', { name: 'Sidebar' }).boundingBox())!.width).toBe(widthBefore);
});

test('restores the first document scroll offset after switching to another tab and back in Reading mode', async ({
    app,
}) => {
    const lines = Array.from({ length: 200 }, (_, index) => `Paragraph ${index + 1}`).join('\n\n');
    const first = await app.writeDocument('scroll-a.md', `# A\n\n${lines}\n`);
    const second = await app.writeDocument('scroll-b.md', '# B\n\nShort.\n');
    await app.seedRecents([first, second]);
    await app.launch();
    const { page } = app;
    await page.setViewportSize({ width: 1280, height: 720 });
    await openRecentFromLauncher(page, 'scroll-a.md');
    await page.getByRole('button', { name: 'File', exact: true }).click();
    await page.getByRole('menu', { name: 'File' }).getByRole('menuitem', { name: 'scroll-b.md', exact: true }).click();
    await page.getByRole('tab', { name: 'scroll-a.md' }).click();
    await page.locator('[data-editor-surface] .view-lines').first().click();
    await page.keyboard.press('ControlOrMeta+Enter');
    await expectReading(page);
    const reader = page.locator('[data-reading-document]');
    await reader.evaluate((element) => {
        element.scrollTop = 800;
        element.dispatchEvent(new Event('scroll'));
    });
    await expect.poll(() => reader.evaluate((element) => element.scrollTop)).toBe(800);

    await page.getByRole('button', TABS_TOGGLE).click();
    await page.getByRole('tab', { name: 'scroll-b.md' }).click();
    await expect(page.locator(PREVIEW)).toContainText('Short.');
    await page.getByRole('tab', { name: 'scroll-a.md' }).click();

    await expect(page.locator(PREVIEW)).toContainText('Paragraph 1');
    await expect.poll(() => page.locator('[data-reading-document]').evaluate((element) => element.scrollTop)).toBe(800);
});
