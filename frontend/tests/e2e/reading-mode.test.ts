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
