import type { Page } from '@playwright/test';

import { expect, test } from '../support/harness';
import { expectCompactMenuRows } from '../support/menuRows';

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
        if (getState === undefined) throw new Error('the generated AppModelHandler.GetState binding is absent');
        const state = (await getState({ id: crypto.randomUUID() })) as ActiveState;
        return state.data?.activeBuffer?.content ?? '';
    });
}

test('keeps toolbar overflow and tab scrolling reachable at narrow widths', async ({ app }) => {
    await app.launch();

    const { page } = app;
    await page.setViewportSize({ width: 1280, height: 720 });
    for (let index = 0; index < 7; index += 1) {
        await page.getByRole('button', { name: 'New tab' }).click();
    }

    const toolbar = page.getByRole('toolbar', { name: 'Document toolbar' });
    const tabsBar = page.getByRole('group', { name: 'Document tabs' });
    const tablist = page.getByRole('tablist', { name: 'Document tabs' });

    for (const viewport of [
        { width: 375, height: 480 },
        { width: 768, height: 720 },
    ] as const) {
        await page.setViewportSize(viewport);

        await expect(toolbar).toHaveAttribute('data-bar-overflow', 'menu');
        await expect(toolbar).toHaveAttribute('data-bar-overflowing', 'true');
        const overflowTrigger = toolbar.getByRole('button', {
            name: 'More actions',
        });
        await expect(overflowTrigger).toBeVisible();
        await overflowTrigger.click();
        const overflowPopup = page.locator('[data-viewport-popup="editor-overflow"]');
        await expect(overflowPopup).toBeVisible();
        await expectCompactMenuRows(overflowPopup);
        const link = overflowPopup.getByRole('menuitem', { name: 'Link', exact: true });
        await expect(link).toBeVisible();
        await expect(link).toContainText('Link');
        await expect(link).toHaveAttribute('data-shortcut', /K$/u);
        const overflowGroup = link.locator('..');
        await expect(overflowGroup).toHaveAttribute('data-toolbar-overflow-group', 'true');
        const groupLayout = await overflowGroup.evaluate((element) => {
            const style = getComputedStyle(element);
            const rows = Array.from(element.children)
                .filter((child): child is HTMLElement => child instanceof HTMLElement)
                .map((child) => child.getBoundingClientRect());
            return {
                backdropFilter: style.backdropFilter,
                backgroundColor: style.backgroundColor,
                flexDirection: style.flexDirection,
                padding: style.padding,
                verticallyStacked: rows.every((row, index) => index === 0 || row.top >= rows[index - 1].bottom),
            };
        });
        expect(groupLayout).toEqual({
            backdropFilter: 'none',
            backgroundColor: 'rgba(0, 0, 0, 0)',
            flexDirection: 'column',
            padding: '0px',
            verticallyStacked: true,
        });
        if (viewport.height === 480) {
            await page.keyboard.press('End');
            const compactViewport = await overflowPopup.evaluate((element) => {
                const popupBounds = element.getBoundingClientRect();
                const enabledItems = Array.from(
                    element.querySelectorAll<HTMLElement>(
                        '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]',
                    ),
                ).filter((item) => {
                    const bounds = item.getBoundingClientRect();
                    return (
                        !item.hasAttribute('disabled') &&
                        item.getAttribute('aria-disabled') !== 'true' &&
                        bounds.width > 0 &&
                        bounds.height > 0
                    );
                });
                const finalItem = enabledItems.at(-1);
                const finalBounds = finalItem?.getBoundingClientRect();
                return {
                    finalItemFocused: finalItem === document.activeElement,
                    finalItemInViewport:
                        finalBounds !== undefined && finalBounds.top >= 0 && finalBounds.bottom <= window.innerHeight,
                    popupInViewport:
                        popupBounds.left >= 0 &&
                        popupBounds.top >= 0 &&
                        popupBounds.right <= window.innerWidth &&
                        popupBounds.bottom <= window.innerHeight,
                };
            });
            expect(compactViewport).toEqual({
                finalItemFocused: true,
                finalItemInViewport: true,
                popupInViewport: true,
            });
        }
        await page.keyboard.press('Escape');
        await expect(overflowPopup).toHaveCount(0);

        await expect(tabsBar).toHaveAttribute('data-bar-overflow', 'scroll');
        await expect(tablist).toBeVisible();
        await expect.poll(() => tablist.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
        await expect
            .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
            .toBe(true);
    }
});

test('formats the selected text once from the toolbar overflow', async ({ app }) => {
    await app.launch();

    const { page } = app;
    const editor = page.locator('[data-editor-surface] textarea').first();
    await expect(editor).toBeVisible();
    await editor.focus();
    await page.keyboard.insertText('word');
    await expect.poll(() => activeBufferContent(page)).toBe('word');
    await editor.press('ControlOrMeta+A');

    await page.setViewportSize({ width: 375, height: 720 });
    const toolbar = page.getByRole('toolbar', { name: 'Document toolbar' });
    await toolbar.getByRole('button', { name: 'More actions' }).click();
    const overflowPopup = page.locator('[data-viewport-popup="editor-overflow"]');
    const bold = overflowPopup.getByRole('menuitem', { name: 'Bold', exact: true });
    await expect(bold).toContainText('Bold');
    await bold.click();

    await expect.poll(() => activeBufferContent(page)).toBe('**word**');
});
