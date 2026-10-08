import { expect, test } from '../support/harness';

test('runs tidy from the active document and enables Export and Distraction-free reading while Assistant and the About links stay deferred', async ({
    app,
}) => {
    const source = await app.writeDocument('tidy-surface.md', '* item\n');
    await app.seedRecents([source]);
    await app.launch();

    const { page } = app;
    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(page.getByTestId('application-shell')).toBeVisible();

    await page.getByTestId('document-launcher').getByRole('button', { name: 'tidy-surface.md' }).click();
    await expect(page.getByRole('tab', { name: 'tidy-surface.md' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Editor content' })).toBeVisible();
    await expect(page.locator('[data-editor-surface] .view-lines')).toContainText('* item');

    const toolbar = page.getByRole('toolbar', { name: 'Document toolbar' });
    for (const id of ['format', 'compact', 'lint'] as const) {
        await expect(toolbar.locator(`[data-action-id="${id}"]`)).toBeEnabled();
    }
    await toolbar.locator('[data-action-id="format"]').click();
    await expect
        .poll(async () =>
            page.evaluate(async (): Promise<string> => {
                const root = window as unknown as {
                    go?: {
                        appmodel?: {
                            AppModelHandler?: {
                                GetState?: (request: {
                                    id: string;
                                }) => Promise<{ data?: { activeBuffer?: { content?: string } } }>;
                            };
                        };
                    };
                };
                const state = await root.go?.appmodel?.AppModelHandler?.GetState?.({ id: crypto.randomUUID() });
                return state?.data?.activeBuffer?.content ?? '';
            }),
        )
        .toBe('- item\n');

    await page.getByRole('menubar').getByRole('button', { name: 'Format', exact: true }).click();
    const formatMenu = page.getByRole('menu', { name: 'Format' });
    await expect(formatMenu.getByRole('menuitem', { name: /Lint/u })).toBeEnabled();
    await page.keyboard.press('Escape');

    const assistant = page.getByRole('button', { name: 'Toggle Assistant' });
    await expect(assistant).toBeVisible();
    await expect(assistant).toBeDisabled();

    await page.getByRole('button', { name: 'File', exact: true }).click();
    const fileMenu = page.getByRole('menu', { name: 'File' });
    await expect(fileMenu.getByRole('menuitem', { name: 'Open Folder', exact: true })).toBeEnabled();
    await expect(fileMenu.getByRole('menuitem', { name: 'Export to PDF', exact: true })).toBeEnabled();
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'About', exact: true }).click();
    const aboutMenu = page.locator('[data-viewport-popup="about-menu"]');
    await expect(aboutMenu.getByRole('menuitem', { name: 'Open logs folder' })).toBeDisabled();
    await expect(aboutMenu.getByRole('menuitem', { name: /View on GitHub/u })).toBeDisabled();
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'View', exact: true }).click();
    const viewMenu = page.getByRole('menu', { name: 'View options' });
    await expect(viewMenu.getByRole('menuitem', { name: 'Toggle Assistant' })).toBeDisabled();
    await expect(viewMenu.getByRole('menuitem', { name: 'Distraction-free reading' })).toBeEnabled();
    await page.keyboard.press('Escape');

    const shell = page.getByTestId('application-shell');
    const columns = await shell.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(/\s+/u));
    expect(columns).toHaveLength(3);
    expect(Number.parseFloat(columns[2] ?? 'NaN')).toBe(0);
    await expect(shell.locator('.lights')).toHaveCount(0);
    await expect(shell.locator('[class*="traffic"], [class*="windowControl"]')).toHaveCount(0);
});
