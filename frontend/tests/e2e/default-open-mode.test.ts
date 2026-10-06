import { expect, test } from '../support/harness';

test('the Default open mode choice persists after restart in the menu and the dialog', async ({ app }) => {
    await app.launch();
    const { page } = app;

    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const menu = page.getByRole('menu', { name: 'Settings menu' });
    await expect(menu.getByRole('menuitemradio', { name: 'Editor', exact: true })).toHaveAttribute(
        'aria-checked',
        'true',
    );
    await menu.getByRole('menuitemradio', { name: 'Reading (Viewer)', exact: true }).click();
    await expect(menu.getByRole('menuitemradio', { name: 'Reading (Viewer)', exact: true })).toHaveAttribute(
        'aria-checked',
        'true',
    );
    await page.keyboard.press('Escape');

    await app.relaunch();

    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const reopened = page.getByRole('menu', { name: 'Settings menu' });
    await expect(reopened.getByRole('menuitemradio', { name: 'Reading (Viewer)', exact: true })).toHaveAttribute(
        'aria-checked',
        'true',
    );
    await reopened.getByRole('menuitem', { name: 'All settings…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Settings' });
    await expect(
        dialog
            .getByRole('radiogroup', { name: 'Default open mode' })
            .getByRole('radio', { name: 'Reading (Viewer)', exact: true }),
    ).toHaveAttribute('aria-checked', 'true');

    await dialog.getByRole('button', { name: 'Reset appearance' }).click();
    await expect(
        dialog
            .getByRole('radiogroup', { name: 'Default open mode' })
            .getByRole('radio', { name: 'Editor', exact: true }),
    ).toHaveAttribute('aria-checked', 'true');
    app.expectNoForeignRequests();
});
