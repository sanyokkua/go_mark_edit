import { expect, test } from '../support/harness';

test.use({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/149.0.0.0 Safari/537.36' });

test('Linux Copy Line Down uses Shift+Alt+Down and replaces the Monaco default', async ({ app }) => {
    await app.page.addInitScript(() => Object.defineProperty(navigator, 'platform', { get: () => 'Linux x86_64' }));
    const source = await app.writeDocument('linux-lines.md', 'a\nb\nc');
    await app.seedRecents([source]);
    await app.launch();
    const { page } = app;
    await page.getByTestId('document-launcher').getByRole('button', { name: 'linux-lines.md', exact: true }).click();
    await page.locator('[data-editor-surface] .view-lines').first().click();
    const editor = async () =>
        page.evaluate(async () => {
            const path = '/src/ui/components/monacoSetup.ts';
            const setup = (await import(
                /* @vite-ignore */ path
            )) as typeof import('../../src/ui/components/monacoSetup');
            return setup.monaco.editor.getEditors()[0].getValue();
        });
    await page.keyboard.press('Control+Home');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Shift+Alt+ArrowDown');
    await expect.poll(editor).toBe('a\nb\nb\nc');
    await page.keyboard.press('Control+z');
    await expect.poll(editor).toBe('a\nb\nc');
    await page.keyboard.press('Control+Shift+Alt+ArrowDown');
    await expect.poll(editor).toBe('a\nb\nc');
});
