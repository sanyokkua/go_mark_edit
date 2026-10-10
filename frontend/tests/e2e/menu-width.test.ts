import { expect, test } from '../support/harness';

const POPUP_MAX_WIDTH = 360;

test('a very long recent file name does not widen the File menu beyond the popup maximum', async ({ app }) => {
    const longName = `${'long-recent-document-name-'.repeat(8)}end.md`;
    const source = await app.writeDocument(longName, '# Long\n');
    await app.seedRecents([source]);
    await app.launch();
    const { page } = app;
    await page.setViewportSize({ width: 1400, height: 800 });

    await page.getByRole('button', { name: 'File', exact: true }).click();
    const popup = page.locator('[data-viewport-popup="file-menu"]');
    await expect(popup).toBeVisible();

    const box = (await popup.boundingBox())!;
    expect(box.width).toBeLessThanOrEqual(POPUP_MAX_WIDTH);

    const row = popup.getByRole('menuitem', { name: new RegExp(longName.slice(0, 20), 'u') });
    await expect(row).toBeVisible();
    await expect(row).toHaveAttribute('title', new RegExp(`${longName}$`, 'u'));
    const rowBox = (await row.boundingBox())!;
    expect(rowBox.x + rowBox.width).toBeLessThanOrEqual(box.x + box.width);
    app.expectNoForeignRequests();
});
