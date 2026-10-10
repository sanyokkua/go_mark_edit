import { expect, test } from '../support/harness';
import { openMarkdownMenuItem } from '../support/markdownMenu';

test('editor formatting is unavailable and inert while the editor is not shown', async ({ app }) => {
    const source = await app.writeDocument('formatting-availability.md', '# Title\n\nplain text\n');
    await app.seedRecents([source]);
    await app.launch();
    const { page } = app;
    page.setDefaultTimeout(8_000);
    await page
        .getByTestId('document-launcher')
        .getByRole('button', { name: 'formatting-availability.md', exact: true })
        .click();
    const editorLines = page.locator('[data-editor-surface] .view-lines').first();
    await expect(editorLines).toContainText('plain text');

    const arrangements = page.getByRole('radiogroup', { name: 'View arrangement' });
    await arrangements.getByRole('radio', { name: 'Preview', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Bold', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Format', exact: true })).toBeEnabled();

    await page.keyboard.press('ControlOrMeta+b');
    await expect(await openMarkdownMenuItem(page, 'bold')).toBeDisabled();
    await page.keyboard.press('Escape');

    await arrangements.getByRole('radio', { name: 'Editor', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Bold', exact: true })).toBeEnabled();
    await expect(editorLines).toContainText('plain text');
    await expect(editorLines).not.toContainText('**');
});
