import { chmod } from 'node:fs/promises';

import { expect, test } from '../support/harness';

test('Monaco registers word and line editing actions', async ({ app }) => {
    const source = await app.writeDocument('line-keys.md', 'hello world\na\nb\nc');
    await app.seedRecents([source]);
    await app.launch();
    const { page } = app;
    await page.getByTestId('document-launcher').getByRole('button', { name: 'line-keys.md', exact: true }).click();
    await page.locator('[data-editor-surface] .view-lines').first().click();
    const actions = await page.evaluate(async () => {
        const path = '/src/ui/components/monacoSetup.ts';
        const setup = (await import(/* @vite-ignore */ path)) as typeof import('../../src/ui/components/monacoSetup');
        return setup.monaco.editor
            .getEditors()[0]
            .getSupportedActions()
            .map((action: { id: string }) => action.id);
    });
    expect(actions).toContain('editor.action.moveLinesUpAction');
    expect(actions).toContain('editor.action.copyLinesDownAction');
});

test('word and document navigation and line editing use platform keys', async ({ app }) => {
    const source = await app.writeDocument('navigation.md', 'hello world\na\nb\nc');
    await app.seedRecents([source]);
    await app.launch();
    const { page } = app;
    await page.getByTestId('document-launcher').getByRole('button', { name: 'navigation.md', exact: true }).click();
    await page.locator('[data-editor-surface] .view-lines').first().click();
    await expect(page.locator('[data-editor-surface] textarea.inputarea').first()).toBeFocused();
    const mac = process.platform === 'darwin';
    const word = mac ? 'Alt' : 'Control';
    const mod = mac ? 'Meta' : 'Control';
    const editor = async () =>
        page.evaluate(async () => {
            const path = '/src/ui/components/monacoSetup.ts';
            const setup = (await import(
                /* @vite-ignore */ path
            )) as typeof import('../../src/ui/components/monacoSetup');
            const instance = setup.monaco.editor.getEditors()[0];
            return {
                value: instance.getValue(),
                position: instance.getPosition()!,
                selection: instance.getSelection()!,
            };
        });
    const position = async (lineNumber: number, column: number) =>
        page.evaluate(
            async ({ lineNumber, column }) => {
                const path = '/src/ui/components/monacoSetup.ts';
                const setup = (await import(
                    /* @vite-ignore */ path
                )) as typeof import('../../src/ui/components/monacoSetup');
                setup.monaco.editor.getEditors()[0].setPosition({ lineNumber, column });
            },
            { lineNumber, column },
        );
    await position(1, 1);
    await page.keyboard.press(`${word}+ArrowRight`);
    await expect.poll(async () => (await editor()).position.column).toBe(6);
    await position(1, 12);
    await page.keyboard.press(`${word}+Shift+ArrowLeft`);
    await expect.poll(async () => (await editor()).selection.startColumn).toBe(7);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press(`${word}+Backspace`);
    await expect.poll(async () => (await editor()).value).toBe('hello \na\nb\nc');
    await page.keyboard.press(`${mod}+z`);
    await position(1, 4);
    await page.keyboard.press(mac ? 'Meta+ArrowLeft' : 'Home');
    await expect.poll(async () => (await editor()).position.column).toBe(1);
    await page.keyboard.press(mac ? 'Meta+ArrowRight' : 'End');
    await expect.poll(async () => (await editor()).position.column).toBe(12);
    await page.keyboard.press(mac ? 'Meta+ArrowDown' : 'Control+End');
    await expect.poll(async () => (await editor()).position.lineNumber).toBe(4);
    await page.keyboard.press(mac ? 'Meta+ArrowUp' : 'Control+Home');
    await expect.poll(async () => (await editor()).position.lineNumber).toBe(1);
    await position(3, 1);
    await page.keyboard.press('Alt+ArrowUp');
    await expect.poll(async () => (await editor()).value).toBe('hello world\nb\na\nc');
    await page.keyboard.press(`${mod}+z`);
    await expect.poll(async () => (await editor()).value).toBe('hello world\na\nb\nc');
    await position(3, 1);
    await page.keyboard.press('Shift+Alt+ArrowDown');
    await expect.poll(async () => (await editor()).value).toBe('hello world\na\nb\nb\nc');
    await page.keyboard.press(`${mod}+Shift+k`);
    await expect.poll(async () => (await editor()).value).toBe('hello world\na\nb\nc');
    await position(3, 1);
    await page.keyboard.press(`${mod}+]`);
    await expect.poll(async () => (await editor()).value).toMatch(/\n\s+b\n/u);
    await page.keyboard.press(`${mod}+[`);
    await expect.poll(async () => (await editor()).value).toBe('hello world\na\nb\nc');
    await page.keyboard.press(`${mod}+Shift+Enter`);
    await expect.poll(async () => (await editor()).value).toBe('hello world\na\n\nb\nc');
    if (mac) {
        await position(1, 6);
        await page.keyboard.press('Meta+Backspace');
        await expect.poll(async () => (await editor()).value).toBe(' world\na\n\nb\nc');
    }
});

test('read-only editor allows word navigation but refuses line edits', async ({ app }) => {
    const source = await app.writeDocument('locked-line-keys.md', 'hello world\nsecond');
    await chmod(source, 0o444);
    await app.seedRecents([source]);
    await app.launch();
    const { page } = app;
    await page
        .getByTestId('document-launcher')
        .getByRole('button', { name: 'locked-line-keys.md', exact: true })
        .click();
    await page.locator('[data-editor-surface] .view-lines').first().click();
    const state = async () =>
        page.evaluate(async () => {
            const path = '/src/ui/components/monacoSetup.ts';
            const setup = (await import(
                /* @vite-ignore */ path
            )) as typeof import('../../src/ui/components/monacoSetup');
            const instance = setup.monaco.editor.getEditors()[0];
            return { value: instance.getValue(), position: instance.getPosition()! };
        });
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Alt+ArrowUp');
    expect((await state()).value).toBe('hello world\nsecond');
    const mac = process.platform === 'darwin';
    await page.keyboard.press(mac ? 'Meta+ArrowUp' : 'Control+Home');
    await page.keyboard.press(mac ? 'Alt+ArrowRight' : 'Control+ArrowRight');
    await expect.poll(async () => (await state()).position.column).toBe(6);
    expect((await state()).value).toBe('hello world\nsecond');
});
