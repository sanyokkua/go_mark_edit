import { expect, test } from '../support/harness';

test('relaunch retires the old document while its backend is alive and preserves the page and profile', async ({
    app,
}) => {
    await app.launch();
    const { page } = app;
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('menuitem', { name: 'All settings…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Settings' });
    await dialog
        .getByRole('radiogroup', { name: 'Default open mode' })
        .getByRole('radio', { name: 'Reading (Viewer)' })
        .click();
    await page.keyboard.press('Escape');

    const pid = app.appChildPid;
    expect(pid).toBeDefined();
    let retiredWhileAlive = false;
    page.on('framenavigated', (frame) => {
        if (frame === page.mainFrame() && frame.url() === 'about:blank' && pid !== undefined) {
            try {
                process.kill(pid, 0);
                retiredWhileAlive = true;
            } catch {
                retiredWhileAlive = false;
            }
        }
    });
    await app.relaunch();

    expect(retiredWhileAlive).toBe(true);
    expect(app.page).toBe(page);
    await expect(page.getByTestId('document-launcher')).toBeVisible();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('menuitem', { name: 'All settings…' }).click();
    await expect(
        dialog.getByRole('radiogroup', { name: 'Default open mode' }).getByRole('radio', { name: 'Reading (Viewer)' }),
    ).toHaveAttribute('aria-checked', 'true');
});
