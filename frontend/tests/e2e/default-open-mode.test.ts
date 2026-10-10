import { expect, test } from '../support/harness';

test('the Default open mode choice persists after restart in the dialog', async ({ app }) => {
    await app.launch();
    const { page } = app;

    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const menu = page.getByRole('menu', { name: 'Settings menu' });
    await expect(menu.getByText('Default open mode')).toHaveCount(0);
    await menu.getByRole('menuitem', { name: 'All settings…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Settings' });
    const group = dialog.getByRole('radiogroup', { name: 'Default open mode' });
    await expect(group.getByRole('radio', { name: 'Editor', exact: true })).toHaveAttribute('aria-checked', 'true');
    await group.getByRole('radio', { name: 'Reading (Viewer)', exact: true }).click();
    await expect(group.getByRole('radio', { name: 'Reading (Viewer)', exact: true })).toHaveAttribute(
        'aria-checked',
        'true',
    );
    await page.keyboard.press('Escape');

    await app.relaunch();

    await page.keyboard.press('ControlOrMeta+,');
    const reopened = page.getByRole('dialog', { name: 'Settings' });
    await expect(
        reopened
            .getByRole('radiogroup', { name: 'Default open mode' })
            .getByRole('radio', { name: 'Reading (Viewer)', exact: true }),
    ).toHaveAttribute('aria-checked', 'true');

    await reopened.getByRole('button', { name: 'Reset appearance' }).click();
    await expect(
        reopened.getByRole('radiogroup', { name: 'Default open mode' }).getByRole('radio', {
            name: 'Editor',
            exact: true,
        }),
    ).toHaveAttribute('aria-checked', 'true');
    app.expectNoForeignRequests();
});
