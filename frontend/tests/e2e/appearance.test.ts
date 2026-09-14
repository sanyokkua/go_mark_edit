import type { Page } from '@playwright/test';

import { expect, test } from '../support/harness';

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
        await page.keyboard.press('Escape');
    }
});

test('keeps compact Settings theme rows labeled, stacked, and frame-bounded', async ({ app }) => {
    await app.launch();

    const { page } = app;
    const themeNames = ['Liquid Glass', 'Material', 'Minimal'] as const;
    for (const width of [375, 768, 1280]) {
        await page.setViewportSize({ width, height: 720 });
        await openAppearance(page);

        const rows = themeNames.map((name) => page.getByRole('radio', { name, exact: true }));
        const group = page.getByRole('radiogroup', { name: 'Theme', exact: true });
        const groupBounds = await group.boundingBox();
        const groupMetrics = await group.evaluate((element) => {
            const style = getComputedStyle(element);
            return {
                borderLeft: Number.parseFloat(style.borderLeftWidth),
                paddingLeft: Number.parseFloat(style.paddingLeft),
                paddingRight: Number.parseFloat(style.paddingRight),
            };
        });
        const rowMetrics = await Promise.all(
            rows.map((row) =>
                row.evaluate((element) => {
                    const rowStyle = getComputedStyle(element);
                    const swatchStyle = getComputedStyle(element, '::before');
                    const rowBounds = element.getBoundingClientRect();
                    const range = document.createRange();
                    range.selectNodeContents(element);
                    const labelBounds = range.getBoundingClientRect();
                    return {
                        background:
                            swatchStyle.backgroundImage === 'none'
                                ? swatchStyle.backgroundColor
                                : swatchStyle.backgroundImage,
                        boxShadow: rowStyle.boxShadow,
                        checked: element.getAttribute('aria-checked') === 'true',
                        height: swatchStyle.height,
                        labelLeft: labelBounds.left,
                        labelRight: labelBounds.right,
                        labelBottom: labelBounds.bottom,
                        labelTop: labelBounds.top,
                        labelWidth: labelBounds.width,
                        outline: rowStyle.outlineStyle,
                        paddingLeft: Number.parseFloat(rowStyle.paddingLeft),
                        paddingRight: Number.parseFloat(rowStyle.paddingRight),
                        rowBottom: rowBounds.bottom,
                        rowLeft: rowBounds.left,
                        rowRight: rowBounds.right,
                        rowTop: rowBounds.top,
                        rowWidth: rowBounds.width,
                        swatchOutline: swatchStyle.outlineStyle,
                        width: swatchStyle.width,
                    };
                }),
            ),
        );
        const popup = await page.getByRole('menu', { name: 'Settings menu' }).boundingBox();

        expect(groupBounds).not.toBeNull();
        expect(popup).not.toBeNull();
        for (const [index, row] of rowMetrics.entries()) {
            const groupContentWidth = (groupBounds?.width ?? 0) - groupMetrics.paddingLeft - groupMetrics.paddingRight;
            const groupContentLeft = (groupBounds?.x ?? 0) + groupMetrics.borderLeft + groupMetrics.paddingLeft;
            const inferredSwatchRight = row.rowLeft + row.paddingLeft + Number.parseFloat(row.width);

            expect(row.rowWidth).toBeCloseTo(groupContentWidth, 0);
            expect(row.rowLeft).toBeCloseTo(groupContentLeft, 0);
            expect(row.rowLeft).toBeGreaterThanOrEqual(popup?.x ?? 0);
            expect(row.rowRight).toBeLessThanOrEqual((popup?.x ?? 0) + (popup?.width ?? 0));
            expect(row.labelWidth).toBeGreaterThan(0);
            expect(row.labelLeft).toBeGreaterThan(inferredSwatchRight);
            expect(row.labelRight).toBeLessThanOrEqual(row.rowRight);
            expect(row.labelTop).toBeGreaterThanOrEqual(row.rowTop);
            expect(row.labelBottom).toBeLessThanOrEqual(row.rowBottom);
            if (index > 0) expect(row.rowTop).toBeGreaterThanOrEqual(rowMetrics[index - 1]?.rowBottom ?? 0);
        }
        for (const row of rowMetrics) {
            expect(row.width).toBe('22px');
            expect(row.height).toBe('22px');
            expect(row.background).not.toBe('rgba(0, 0, 0, 0)');
        }
        const selectedRow = group.locator('[role="radio"][aria-checked="true"]');
        const selectedMetrics = rowMetrics.find((row) => row.checked);
        expect(selectedMetrics?.outline).toBe('none');
        expect(selectedMetrics?.swatchOutline).toBe('solid');
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
    const allSettings = page.getByRole('menuitem', { name: 'All settings…', exact: true });
    await page.keyboard.press('End');
    await expect(allSettings).toBeFocused();
    await expect(allSettings).toBeInViewport();
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
