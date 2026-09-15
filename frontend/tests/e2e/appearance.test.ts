import type { Page } from '@playwright/test';

import { expect, test } from '../support/harness';
import { expectCompactMenuRows } from '../support/menuRows';

const palettes = [
    ['Liquid Glass', 'Light', 'glass', 'light'],
    ['Liquid Glass', 'Dark', 'glass', 'dark'],
    ['Material', 'Light', 'material', 'light'],
    ['Material', 'Dark', 'material', 'dark'],
    ['Minimal', 'Light', 'minimal', 'light'],
    ['Minimal', 'Dark', 'minimal', 'dark'],
] as const;

async function openAppearance(page: Page): Promise<void> {
    if ((page.viewportSize()?.width ?? 1280) <= 376) {
        await page.getByRole('button', { name: 'More actions' }).first().click();
        await page.getByRole('menuitem', { name: 'Settings' }).click();
    } else {
        await page.getByRole('button', { name: 'Settings' }).click();
    }
    await expect(page.getByRole('menu', { name: 'Settings menu' })).toBeVisible();
}

async function stabilizeMonacoScrollbar(page: Page, expectedColor: string): Promise<void> {
    await page.addStyleTag({
        content: '.monaco-scrollable-element .scrollbar.vertical { opacity: 1 !important; }',
    });
    await expect(page.locator('.monaco-scrollable-element .scrollbar.vertical').first()).toHaveCSS('opacity', '1');
    await expect(page.locator('.monaco-scrollable-element .scrollbar.vertical .slider').first()).toHaveCSS(
        'background-color',
        expectedColor,
    );
}

test('changes all six palettes through keyboard-reachable controls without overflow', async ({ app }) => {
    await app.launch();

    const { page } = app;
    for (const width of [375, 768, 1280]) {
        await page.setViewportSize({ width, height: 720 });
        await openAppearance(page);

        await expectCompactMenuRows(page.getByRole('menu', { name: 'Settings menu' }));

        for (const [themeLabel, modeLabel, theme, mode] of palettes) {
            const themeControl = page.getByRole('radio', { name: themeLabel, exact: true });
            await themeControl.press('Space');
            await expect(themeControl).toHaveAttribute('aria-checked', 'true');
            await expect.poll(() => page.locator('html').getAttribute('data-theme')).toBe(theme);
            await expect(themeControl).toBeFocused();
            const modeControl = page.getByRole('radio', { name: modeLabel, exact: true });
            await modeControl.press('Space');
            await expect(modeControl).toHaveAttribute('aria-checked', 'true');
            await expect.poll(() => page.locator('html').getAttribute('data-mode')).toBe(mode);
            await expect(modeControl).toBeFocused();
            await expectCompactMenuRows(page.getByRole('menu', { name: 'Settings menu' }));
            await expect(page.locator('.monaco-editor')).toBeVisible();
            await expect
                .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
                .toBe(true);
            if (width === 1280) {
                await stabilizeMonacoScrollbar(
                    page,
                    mode === 'light' ? 'rgba(0, 0, 0, 0.18)' : 'rgba(255, 255, 255, 0.2)',
                );
            }
        }
        for (const [themeLabel, theme] of [
            ['Liquid Glass', 'glass'],
            ['Material', 'material'],
            ['Minimal', 'minimal'],
        ] as const) {
            await page.getByRole('radio', { name: themeLabel, exact: true }).click();
            await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
            await page.getByRole('radio', { name: 'Auto (system)', exact: true }).click();
            for (const colorScheme of ['light', 'dark'] as const) {
                await page.emulateMedia({ colorScheme });
                await expect(page.locator('html')).toHaveAttribute('data-mode', colorScheme);
                await expectCompactMenuRows(page.getByRole('menu', { name: 'Settings menu' }));
            }
        }
        await page.keyboard.press('Escape');
    }
});

test('keeps compact Settings theme rows labeled, stacked, and frame-bounded', async ({ app }, testInfo) => {
    await app.launch();

    const { page } = app;
    const themeNames = ['Liquid Glass', 'Material', 'Minimal'] as const;
    for (const width of [375, 768, 1280]) {
        await page.setViewportSize({ width, height: 720 });
        await openAppearance(page);

        const popup = page.getByRole('menu', { name: 'Settings menu' });
        await expectCompactMenuRows(popup);
        const group = page.getByRole('radiogroup', { name: 'Theme', exact: true });
        const themeRows = group.getByRole('radio');
        await expect(themeRows).toHaveText([...themeNames]);
        const rowMetrics = await themeRows.evaluateAll((elements) =>
            elements.map((element) => {
                const swatch = element.querySelector<HTMLElement>('[data-menu-swatch]');
                if (swatch === null) throw new Error('theme row has no swatch');
                const label = swatch.parentElement?.nextElementSibling;
                if (label === null || label === undefined) throw new Error('theme row has no label');
                const group = element.parentElement;
                if (group === null) throw new Error('theme row has no group');
                const rowBounds = element.getBoundingClientRect();
                const labelBounds = label.getBoundingClientRect();
                const swatchBounds = swatch.getBoundingClientRect();
                const swatchStyle = getComputedStyle(swatch);
                return {
                    rowTop: rowBounds.top,
                    rowBottom: rowBounds.bottom,
                    rowWidth: rowBounds.width,
                    groupWidth: group.getBoundingClientRect().width,
                    labelVisible: labelBounds.width > 0 && label.scrollWidth <= label.clientWidth,
                    labelContained:
                        labelBounds.left > swatchBounds.right &&
                        labelBounds.right <= rowBounds.right &&
                        labelBounds.top >= rowBounds.top &&
                        labelBounds.bottom <= rowBounds.bottom,
                    swatchContained: swatchBounds.top >= rowBounds.top && swatchBounds.bottom <= rowBounds.bottom,
                    swatchWidth: swatchBounds.width,
                    swatchHeight: swatchBounds.height,
                    iconSize: Number.parseFloat(getComputedStyle(element).getPropertyValue('--icon-size')),
                    swatchPainted:
                        swatchStyle.backgroundImage !== 'none' || swatchStyle.backgroundColor !== 'rgba(0, 0, 0, 0)',
                    swatchOutline: swatchStyle.outlineStyle,
                };
            }),
        );
        for (const [index, row] of rowMetrics.entries()) {
            expect(row.rowWidth).toBeCloseTo(row.groupWidth, 1);
            expect(row.labelVisible).toBe(true);
            expect(row.labelContained).toBe(true);
            expect(row.swatchContained).toBe(true);
            expect(row.swatchWidth).toBe(row.iconSize);
            expect(row.swatchHeight).toBe(row.iconSize);
            expect(row.swatchPainted).toBe(true);
            expect(row.swatchOutline).toBe('none');
            if (index > 0) expect(row.rowTop).toBeCloseTo(rowMetrics[index - 1].rowBottom, 1);
        }
        for (const radioGroup of [group, page.getByRole('radiogroup', { name: 'Appearance', exact: true })]) {
            await expect(radioGroup.locator('[data-icon-name="check"]')).toHaveCount(1);
            await expect(radioGroup.locator('[aria-checked="true"] [data-icon-name="check"]')).toHaveCount(1);
            await expect(radioGroup.locator('[role="radio"][aria-checked="true"]')).toHaveCSS('box-shadow', 'none');
        }
        const selectedRow = group.locator('[role="radio"][aria-checked="true"]');
        await selectedRow.focus();
        await page.keyboard.press('ArrowDown');
        const focusedRow = group.locator('[role="radio"]:focus');
        await expect(focusedRow).toHaveCount(1);
        await expect.poll(() => focusedRow.evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe('none');
        await expect
            .poll(() =>
                page
                    .getByRole('menu', { name: 'Settings menu' })
                    .evaluate((element) => element.scrollWidth <= element.clientWidth),
            )
            .toBe(true);
        await expect
            .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
            .toBe(true);
        if (width === 1280) await page.screenshot({ path: testInfo.outputPath('settings-menu-desktop.png') });
        await page.keyboard.press('Escape');
    }

    await page.setViewportSize({ width: 375, height: 480 });
    await openAppearance(page);
    const popup = page.getByRole('menu', { name: 'Settings menu' });
    await expect
        .poll(() =>
            popup.evaluate((element) => {
                const bounds = element.getBoundingClientRect();
                return (
                    bounds.top >= 0 &&
                    bounds.left >= 0 &&
                    bounds.right <= window.innerWidth &&
                    bounds.bottom <= window.innerHeight
                );
            }),
        )
        .toBe(true);
    await expectCompactMenuRows(popup);
    await expect.poll(() => popup.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
    const allSettings = page.getByRole('menuitem', { name: 'All settings…', exact: true });
    await page.keyboard.press('End');
    await expect(allSettings).toBeFocused();
    await expect(allSettings).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath('settings-menu-minimum.png') });
});

test('applies the pre-paint theme mirror before backend reconciliation and keeps Settings focused', async ({ app }) => {
    await app.page.addInitScript(() => {
        const writes: Array<{ mode: string | null; theme: string | null }> = [];
        const setAttribute = Element.prototype.setAttribute;
        Element.prototype.setAttribute = function (name: string, value: string): void {
            setAttribute.call(this, name, value);
            if (this === document.documentElement && (name === 'data-theme' || name === 'data-mode')) {
                writes.push({
                    mode: this.getAttribute('data-mode'),
                    theme: this.getAttribute('data-theme'),
                });
            }
        };
        localStorage.setItem('gme.theme', JSON.stringify({ version: 1, theme: 'minimal', mode: 'dark' }));
        (
            globalThis as typeof globalThis & {
                gmeRootAttributeWrites: typeof writes;
            }
        ).gmeRootAttributeWrites = writes;
    });
    await app.page.emulateMedia({ reducedMotion: 'reduce' });
    await app.launch();

    const { page } = app;
    const writes = await page.evaluate(
        () =>
            (
                globalThis as typeof globalThis & {
                    gmeRootAttributeWrites: Array<{
                        mode: string | null;
                        theme: string | null;
                    }>;
                }
            ).gmeRootAttributeWrites,
    );
    const mirrorIndex = writes.findIndex((write) => write.theme === 'minimal' && write.mode === 'dark');
    const canonicalIndex = writes.findIndex(
        (write, index) => index > mirrorIndex && write.theme === 'material' && write.mode === 'light',
    );

    expect(mirrorIndex).toBeGreaterThanOrEqual(0);
    expect(canonicalIndex).toBeGreaterThan(mirrorIndex);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'material');
    await expect(page.locator('html')).toHaveAttribute('data-mode', 'light');
    const settings = page.getByRole('button', { name: 'Settings' });
    await settings.focus();
    await expect.poll(() => settings.evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe('none');
    await expect
        .poll(() => page.locator('body').evaluate((element) => getComputedStyle(element).fontFamily))
        .toMatch(/GME Inter|GME Roboto|system-ui/);
    await expect
        .poll(() =>
            page.locator('html').evaluate((element) => getComputedStyle(element).getPropertyValue('--dur-base').trim()),
        )
        .toBe('0ms');
});
