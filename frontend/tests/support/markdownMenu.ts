import type { Locator, Page } from '@playwright/test';

import { expect } from '@playwright/test';

/** Open the in-app Markdown menu and return the menu item of one action. */
export async function openMarkdownMenuItem(page: Page, id: string): Promise<Locator> {
    const menu = page.getByRole('menu', { name: 'Markdown' });
    if (!(await menu.isVisible())) {
        await page.getByRole('menubar').getByRole('button', { name: 'Markdown', exact: true }).click();
    }
    await expect(menu).toBeVisible();
    return menu.locator(`[data-action-id="${id}"]`);
}

/** Choose one action in the Markdown menu; the menu closes afterwards. */
export async function runFromMarkdownMenu(page: Page, id: string): Promise<void> {
    await (await openMarkdownMenuItem(page, id)).click();
    await expect(page.getByRole('menu', { name: 'Markdown' })).toHaveCount(0);
}
