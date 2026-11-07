import { writeFile } from 'node:fs/promises';

import { expect, test } from '../support/harness';

test('keeps the conflict label, filename, and close control in separate bounded tab regions', async ({ app }) => {
    const filename = 'long-document-name-that-needs-truncation.md';
    const source = await app.writeDocument(filename, '# Original\n');
    const neighbor = await app.writeDocument('neighbor.md', '# Neighbor\n');
    await app.seedRecents([source, neighbor]);
    await app.launch();
    const { page } = app;
    await page.getByTestId('document-launcher').getByRole('button', { name: filename, exact: true }).click();
    await page.getByRole('button', { name: 'File', exact: true }).click();
    await page.getByRole('menu', { name: 'File' }).getByRole('menuitem', { name: 'neighbor.md', exact: true }).click();

    await writeFile(source, '# Changed on disk\n', 'utf8');
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.getByRole('dialog', { name: 'File changed on disk' })).toBeVisible();
    const tab = page.getByRole('tab', { name: /Blocked by conflict/u });
    await expect(tab).toHaveAttribute('aria-selected', 'false');
    const marker = tab.locator('[data-conflict-blocked]');
    await expect(marker).toHaveText('Blocked by conflict');

    for (const width of [375, 768, 1280]) {
        await page.setViewportSize({ width, height: 720 });
        const layout = await tab.evaluate((button) => {
            const status = button.querySelector('[data-conflict-blocked]') as HTMLElement;
            const label = status.nextElementSibling as HTMLElement;
            const item = button.closest('[data-tab-item]') as HTMLElement;
            const close = item.querySelector('button:last-child') as HTMLElement;
            const statusBounds = status.getBoundingClientRect();
            const labelBounds = label.getBoundingClientRect();
            const closeBounds = close.getBoundingClientRect();
            const itemBounds = item.getBoundingClientRect();
            const range = document.createRange();
            range.selectNodeContents(status);
            return {
                statusWidth: statusBounds.width,
                textWidth: range.getBoundingClientRect().width,
                statusOverflow: getComputedStyle(status).overflow,
                statusRight: statusBounds.right,
                labelLeft: labelBounds.left,
                labelWidth: labelBounds.width,
                labelRight: labelBounds.right,
                closeLeft: closeBounds.left,
                closeRight: closeBounds.right,
                closeWidth: closeBounds.width,
                itemRight: itemBounds.right,
                itemWidth: itemBounds.width,
                maxWidth: Number.parseFloat(getComputedStyle(item).maxWidth),
            };
        });
        expect(layout.statusWidth).toBeGreaterThan(20);
        expect(layout.statusOverflow === 'hidden' || layout.textWidth <= layout.statusWidth + 1).toBe(true);
        expect(layout.statusRight).toBeLessThanOrEqual(layout.labelLeft);
        expect(layout.labelWidth).toBeGreaterThan(10);
        expect(layout.labelRight).toBeLessThanOrEqual(layout.closeLeft);
        expect(layout.closeWidth).toBeGreaterThan(0);
        expect(layout.closeRight).toBeLessThanOrEqual(layout.itemRight);
        expect(layout.itemWidth).toBeLessThanOrEqual(layout.maxWidth);
    }
});
