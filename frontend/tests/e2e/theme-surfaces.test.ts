import type { Page } from '@playwright/test';

import { expect, test } from '../support/harness';

const transparent = 'rgba(0, 0, 0, 0)';
const palettes = [
    {
        label: 'Liquid Glass',
        theme: 'glass',
        mode: 'light',
        app: 'rgba(255, 255, 255, 0.42)',
        pane: 'rgba(255, 255, 255, 0.34)',
        selected: 'rgba(91, 124, 255, 0.14)',
        text: 'rgb(28, 35, 56)',
    },
    {
        label: 'Liquid Glass',
        theme: 'glass',
        mode: 'dark',
        app: 'rgba(255, 255, 255, 0.1)',
        pane: 'rgba(255, 255, 255, 0.1)',
        selected: 'rgba(122, 162, 255, 0.16)',
        text: 'rgb(234, 240, 255)',
    },
    {
        label: 'Material',
        theme: 'material',
        mode: 'light',
        app: 'rgb(250, 248, 255)',
        pane: 'rgb(255, 255, 255)',
        selected: 'rgb(223, 228, 255)',
        text: 'rgb(27, 27, 34)',
    },
    {
        label: 'Material',
        theme: 'material',
        mode: 'dark',
        app: 'rgb(22, 22, 28)',
        pane: 'rgb(29, 29, 37)',
        selected: 'rgb(52, 65, 122)',
        text: 'rgb(230, 230, 238)',
    },
    {
        label: 'Minimal',
        theme: 'minimal',
        mode: 'light',
        app: 'rgb(251, 251, 250)',
        pane: transparent,
        selected: transparent,
        text: 'rgb(31, 35, 40)',
    },
    {
        label: 'Minimal',
        theme: 'minimal',
        mode: 'dark',
        app: 'rgb(20, 20, 22)',
        pane: transparent,
        selected: transparent,
        text: 'rgb(231, 231, 234)',
    },
] as const;

async function chooseAppearance(page: Page, label: string, mode: string): Promise<void> {
    await expect(page.locator('.monaco-editor')).toBeVisible();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const menu = page.getByRole('menu', { name: 'Settings menu' });
    const family = menu.getByRole('radio', { name: label, exact: true });
    await family.press('Space');
    await expect(family).toHaveAttribute('aria-checked', 'true');
    await expect(family).toBeFocused();
    const appearance = menu.getByRole('radio', { name: mode, exact: true });
    await appearance.press('Space');
    await expect(appearance).toHaveAttribute('aria-checked', 'true');
    await expect(appearance).toBeFocused();
    await page.keyboard.press('Escape');
}

async function expectContinuousTabs(page: Page): Promise<{ x: number; y: number; width: number; height: number }> {
    const frame = page.locator('[data-bar-role="tablist-host"]');
    const strip = page.getByRole('tablist', { name: 'Document tabs' });
    await expect(frame).toHaveCSS('border-bottom-width', '1px');
    await expect(strip).toHaveCSS('border-bottom-width', '0px');
    await expect(strip).toHaveCSS('background-color', transparent);
    await expect(strip).toHaveCSS('backdrop-filter', 'none');
    const frameBounds = await frame.boundingBox();
    const stripBounds = await strip.boundingBox();
    const documentBounds = await page.getByRole('main', { name: 'Document area' }).boundingBox();
    if (frameBounds === null || stripBounds === null || documentBounds === null) {
        throw new Error('The document tab row must remain visible');
    }
    expect(frameBounds.x).toBeCloseTo(documentBounds.x, 0);
    expect(frameBounds.width).toBeCloseTo(documentBounds.width, 0);
    expect(stripBounds.x).toBeCloseTo(frameBounds.x, 0);
    expect(stripBounds.width).toBeCloseTo(frameBounds.width, 0);
    expect(stripBounds.height).toBeLessThanOrEqual(frameBounds.height);
    expect(stripBounds.y).toBeGreaterThanOrEqual(frameBounds.y);
    expect(stripBounds.y + stripBounds.height).toBeLessThanOrEqual(frameBounds.y + frameBounds.height);
    await expect(page.getByRole('button', { name: 'New tab' })).toHaveCSS('width', '28px');
    await expect(page.getByRole('button', { name: 'New tab' })).toHaveCSS('height', '28px');
    await expect(page.getByRole('button', { name: 'New tab' })).toHaveCSS('border-radius', '7px');
    await expect(page.getByRole('button', { name: 'New tab' })).toHaveCSS('border-top-width', '1px');
    return frameBounds;
}

async function expectSingleViewFrame(page: Page, glass: boolean): Promise<void> {
    const wrapper = page.locator('[data-toolbar-arrangement]');
    const selector = wrapper.getByRole('radiogroup');
    await expect(wrapper).toHaveCSS('background-color', transparent);
    await expect(wrapper).toHaveCSS('backdrop-filter', 'none');
    await expect(wrapper).toHaveCSS('border-top-width', '0px');
    await expect(wrapper).toHaveCSS('padding', '0px');
    await expect(selector).toHaveCSS('border-top-width', '1px');
    await expect(selector).toHaveCSS('border-radius', '10px');
    const selectorBounds = await selector.boundingBox();
    const toolbarBounds = await page.getByRole('toolbar', { name: 'Document toolbar' }).boundingBox();
    if (selectorBounds === null || toolbarBounds === null) throw new Error('The view selector must remain visible');
    expect(selectorBounds.y).toBeGreaterThanOrEqual(toolbarBounds.y);
    expect(selectorBounds.y + selectorBounds.height).toBeLessThanOrEqual(toolbarBounds.y + toolbarBounds.height);
    expect(selectorBounds.x + selectorBounds.width).toBeLessThanOrEqual(toolbarBounds.x + toolbarBounds.width);
    const selected = selector.getByRole('radio', { checked: true });
    await page.getByRole('tab', { selected: true }).click();
    await expect(selected).toHaveCSS('outline-width', '0px');
    await expect(selected).toHaveCSS('background-image', glass ? /linear-gradient/u : 'none');
    if (glass) await expect(selected).not.toHaveCSS('box-shadow', 'none');
}

for (const palette of palettes) {
    test(
        'keeps ' + palette.label + ' ' + palette.mode + ' surfaces continuous as tabs grow and close',
        async ({ app }) => {
            await app.launch();
            const { page } = app;
            await chooseAppearance(page, palette.label, palette.mode === 'dark' ? 'Dark' : 'Light');
            await expect(page.locator('html')).toHaveAttribute('data-theme', palette.theme);
            await expect(page.locator('html')).toHaveAttribute('data-mode', palette.mode);
            const originalBounds = await expectContinuousTabs(page);
            const tabs = page.getByRole('tab');
            for (let count = 2; count <= 40; count += 1) {
                await page.getByRole('button', { name: 'New tab' }).click();
                await expect(tabs).toHaveCount(count);
                if ([2, 3, 40].includes(count)) expect(await expectContinuousTabs(page)).toEqual(originalBounds);
            }

            const strip = page.getByRole('tablist', { name: 'Document tabs' });
            await expect(strip).toHaveAttribute('data-tabs-overflowing', 'true');
            await expect(tabs.last()).toBeInViewport();
            await expect.poll(() => strip.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
            await tabs.last().press('Home');
            await expect(tabs.first()).toBeFocused();
            await expect(tabs.first()).toBeInViewport();
            await tabs.first().press('Space');
            await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
            await tabs.first().press('ArrowRight');
            await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
            await expect(tabs.nth(1)).toBeFocused();
            await expect(tabs.nth(1)).not.toHaveCSS('box-shadow', 'none');

            for (let count = 39; count >= 1; count -= 1) {
                await tabs
                    .last()
                    .locator('..')
                    .getByRole('button', { name: /^Close /u })
                    .click();
                await expect(tabs).toHaveCount(count);
                if ([3, 2, 1].includes(count)) expect(await expectContinuousTabs(page)).toEqual(originalBounds);
            }
            await expect.poll(() => strip.evaluate((element) => element.scrollLeft)).toBe(0);
            await page.getByRole('button', { name: 'New tab' }).click();
            await expect(tabs).toHaveCount(2);

            await expect(page.locator('.application-frame')).toHaveCSS('background-color', palette.app);
            await expect(page.locator('.application-frame')).toHaveCSS(
                'backdrop-filter',
                palette.theme === 'glass' ? /blur/u : 'none',
            );
            await expect(page.locator('[data-status-state]')).toHaveCSS('background-color', transparent);
            await expect(page.locator('[data-bar-role="tablist-host"]')).toHaveCSS(
                'backdrop-filter',
                palette.theme === 'glass' ? /blur/u : 'none',
            );
            await expect(tabs.first().locator('..')).toHaveCSS('background-color', transparent);
            await expect(tabs.last().locator('..')).toHaveCSS('background-color', palette.selected);
            await expect(tabs.last()).toHaveCSS('color', palette.text);
            await expect(tabs.last().locator('..')).toHaveCSS(
                'border-radius',
                palette.theme === 'minimal' ? '0px' : palette.theme === 'material' ? '18px' : '9px',
            );
            if (palette.theme === 'minimal') {
                await expect(tabs.last().locator('..')).toHaveCSS('border-bottom-color', palette.text);
                await expect(tabs.last().locator('..')).toHaveCSS('border-bottom-width', '2px');
            }
            if (palette.theme !== 'glass') {
                await expect(page.locator('body')).toHaveCSS(
                    'font-family',
                    palette.theme === 'material' ? /GME Roboto/u : /GME Inter/u,
                );
            }
            const headerButtons = page.locator('[data-menu-row-actions] button');
            for (const button of await headerButtons.all()) {
                await expect(button).toHaveCSS('width', '29px');
                await expect(button).toHaveCSS('height', '29px');
                await expect(button).toHaveCSS('border-top-width', '1px');
            }
            await expect(page.getByRole('button', { name: 'Toggle Assistant' })).toBeDisabled();
            const utilities = page.getByRole('toolbar').locator('[data-action-id="format"]').locator('..');
            await expect(utilities).toHaveCSS('background-color', transparent);
            await expect(utilities).toHaveCSS('backdrop-filter', 'none');

            for (const width of [375, 768, 1280]) {
                await page.setViewportSize({ width, height: 720 });
                await expectContinuousTabs(page);
                await expectSingleViewFrame(page, palette.theme === 'glass');
                if (width <= 768) {
                    const toolbar = page.getByRole('toolbar', { name: 'Document toolbar' });
                    const hiddenGroups = toolbar.locator('[data-bar-slot="main"] > [data-bar-item][hidden]');
                    await expect
                        .poll(() =>
                            hiddenGroups.evaluateAll((elements) => [
                                ...new Set(elements.map((element) => getComputedStyle(element).display)),
                            ]),
                        )
                        .toEqual(['none']);
                    const overflow = toolbar.getByRole('button', { name: 'More actions' });
                    await overflow.click();
                    await expect(
                        page
                            .locator('[data-viewport-popup="editor-overflow"]')
                            .getByRole('menuitem', { name: 'Link', exact: true }),
                    ).toBeVisible();
                    await page.keyboard.press('Escape');
                    await expect(overflow).toBeFocused();
                }
                for (const arrangement of ['Editor', 'Split', 'Preview']) {
                    const choice = page
                        .locator('[data-toolbar-arrangement]')
                        .getByRole('radio', { name: arrangement, exact: true });
                    await choice.click({ timeout: 10_000 });
                    await expect(choice).toHaveAttribute('aria-checked', 'true');
                    await expect(choice).toBeInViewport();
                    const editor = page.locator('[data-pane-identity="editor"]');
                    const preview = page.locator('[data-pane-identity="preview"]');
                    if (arrangement === 'Preview') await expect(editor).toBeHidden();
                    else {
                        await expect(editor).toBeVisible();
                        await expect(editor).toHaveCSS('background-color', palette.pane);
                        const backgrounds = page.locator(
                            '.monaco-editor, .monaco-editor-background, .monaco-editor .margin',
                        );
                        await expect
                            .poll(() =>
                                backgrounds.evaluateAll((elements) => [
                                    ...new Set(elements.map((element) => getComputedStyle(element).backgroundColor)),
                                ]),
                            )
                            .toEqual([transparent]);
                        if (palette.theme === 'minimal') await expect(editor).toHaveCSS('box-shadow', 'none');
                        if (palette.theme === 'material') {
                            const shadow = await editor.evaluate((element) => getComputedStyle(element).boxShadow);
                            expect(shadow).toContain('0px 1px');
                            expect(shadow).not.toContain('70px');
                        }
                    }
                    // The minimum-width presentation keeps Split's stored choice
                    // while showing only the editor; Preview remains selectable.
                    if (arrangement === 'Editor' || (width === 375 && arrangement === 'Split'))
                        await expect(preview).toHaveCount(0);
                    else {
                        await expect(preview).toBeVisible();
                        await expect(preview).toHaveCSS('background-color', palette.pane);
                        await expect(preview.locator(':scope > div').last()).toHaveCSS('background-color', transparent);
                        await expect(preview.locator(':scope > div').last()).toHaveCSS('backdrop-filter', 'none');
                    }
                    await expectSingleViewFrame(page, palette.theme === 'glass');
                    await expect
                        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
                        .toBe(true);
                }
            }
        },
    );
}

test('keeps surface ownership through Auto transitions and tab drag reorder', async ({ app }) => {
    await app.launch();
    const { page } = app;
    for (const label of ['Liquid Glass', 'Material', 'Minimal']) {
        await chooseAppearance(page, label, 'Auto (system)');
        for (const mode of ['dark', 'light'] as const) {
            await page.emulateMedia({ colorScheme: mode });
            await expect(page.locator('html')).toHaveAttribute('data-mode', mode);
            await expectContinuousTabs(page);
            await expectSingleViewFrame(page, label === 'Liquid Glass');
            await expect(page.locator('.monaco-editor')).toHaveCSS('background-color', transparent);
        }
    }
    await page.getByRole('button', { name: 'New tab' }).click();
    await page.getByRole('button', { name: 'New tab' }).click();
    const tabs = page.getByRole('tab');
    await expect(tabs).toHaveCount(3);
    const before = await tabs.evaluateAll((elements) =>
        elements.map((element) => element.getAttribute('data-document-id')),
    );
    const first = await tabs.first().boundingBox();
    const last = await tabs.last().boundingBox();
    if (first === null || last === null) throw new Error('Drag endpoints must be visible');
    await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
    await page.mouse.down();
    await page.mouse.move(last.x + last.width, last.y + last.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect
        .poll(() => tabs.evaluateAll((elements) => elements.map((element) => element.getAttribute('data-document-id'))))
        .toEqual([before[1], before[2], before[0]]);
    await expectContinuousTabs(page);
    const selector = page.locator('[data-toolbar-arrangement]');
    await selector.getByRole('radio', { checked: true }).press('Home');
    await expect(selector.getByRole('radio', { name: 'Editor', exact: true })).toBeFocused();
    await selector.getByRole('radio', { name: 'Editor', exact: true }).press('ArrowRight');
    await expect(selector.getByRole('radio', { name: 'Split', exact: true })).toBeFocused();
    await expect(selector.getByRole('radio', { name: 'Split', exact: true })).not.toHaveCSS('outline-width', '0px');
});
