import type { Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';

import { expect, newUntitledDocument, test } from '../support/harness';
import { createCommandRecorder, type CommandRecorder } from '../support/commandRecorder';

const PARAGRAPH_COUNT = 400;
const ONE_PIXEL_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
);

async function recordPrintWindow(page: Page): Promise<CommandRecorder> {
    const recorder = createCommandRecorder();
    await page.exposeFunction('__recordPrintCommand', (name: string, request: { id: string }): void => {
        void recorder.binding(name, 0)(request);
    });
    await page.evaluate(() => {
        const root = window as unknown as {
            go: {
                application: {
                    ApplicationHandler: { PrintWindow: (request: { id: string }) => Promise<unknown> };
                };
            };
            __recordPrintCommand: (name: string, request: { id: string }) => void;
        };
        const binding = root.go.application.ApplicationHandler;
        const original = binding.PrintWindow;
        binding.PrintWindow = (request): Promise<unknown> => {
            root.__recordPrintCommand('PrintWindow', request);
            return original(request);
        };
    });
    return recorder;
}

async function openLongDocument(app: {
    writeDocument: (path: string, contents: string) => Promise<string>;
    launch: (args?: readonly string[]) => Promise<void>;
}): Promise<void> {
    const paragraphs = Array.from(
        { length: PARAGRAPH_COUNT },
        (_, index) => `Paragraph ${index + 1} of the exported document, with enough words to fill a line.`,
    );
    const source = await app.writeDocument(
        'long-export.md',
        [
            '# Export Fixture Title',
            '',
            '## Export Fixture Section',
            '',
            '| Name | Value |',
            '| ---- | ----- |',
            '| alpha | 1 |',
            '',
            '```ts',
            'const exported = true;',
            '```',
            '',
            ...paragraphs.flatMap((paragraph) => [paragraph, '']),
        ].join('\n'),
    );
    await app.launch([source]);
}

/** What the print dialog would paint: the visible text of the page under print media. */
async function printedText(page: Page): Promise<string> {
    await page.emulateMedia({ media: 'print' });
    return page.evaluate(() => document.body.innerText);
}

/** The number of pages Chromium lays out for the print copy. */
async function pdfPageCount(page: Page): Promise<number> {
    const pdf = await page.pdf({ printBackground: true });
    const counts = [...pdf.toString('latin1').matchAll(/\/Type\s*\/Pages\b[^>]*?\/Count\s+(\d+)/gu)].map((match) =>
        Number(match[1]),
    );
    return Math.max(0, ...counts);
}

test('Ctrl+P with the editor focused and the File menu entry each open one print dialog', async ({ app }) => {
    await openLongDocument(app);
    const { page } = app;
    await expect(page.getByRole('tab', { name: 'long-export.md' })).toBeVisible();
    const recorder = await recordPrintWindow(page);

    await page.locator('[data-editor-surface] .view-lines').first().click();
    await page.keyboard.press('ControlOrMeta+p');
    await expect.poll(() => recorder.calls.length).toBe(1);

    await page.getByRole('button', { name: 'File', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Export to PDF', exact: true }).click();
    await expect.poll(() => recorder.calls.length).toBe(2);
    expect(recorder.calls.map((call) => call.name)).toEqual(['PrintWindow', 'PrintWindow']);
    app.expectNoForeignRequests();
});

test('the print copy holds the whole document and none of the application chrome', async ({ app }) => {
    await openLongDocument(app);
    const { page } = app;
    await expect(page.getByRole('tab', { name: 'long-export.md' })).toBeVisible();
    const recorder = await recordPrintWindow(page);

    await page.keyboard.press('ControlOrMeta+p');
    await expect.poll(() => recorder.calls.length).toBe(1);

    const text = await printedText(page);
    expect(text).toContain('Export Fixture Title');
    expect(text).toContain('Export Fixture Section');
    expect(text).toContain('Paragraph 1 of the exported document');
    expect(text).toContain(`Paragraph ${PARAGRAPH_COUNT} of the exported document`);
    for (const chrome of ['Settings', 'Problems', 'long-export.md', 'Preview pane']) {
        expect(text).not.toContain(chrome);
    }
    expect(await pdfPageCount(page)).toBeGreaterThan(1);
});

test('the print copy holds the drawn diagram and the loaded image when the print dialog opens', async ({ app }) => {
    const source = await app.writeDocument(
        'diagram-export.md',
        [
            '# Diagram Export',
            '',
            '```mermaid',
            'flowchart LR',
            '  A[Start] --> B[Finish]',
            '```',
            '',
            '![Figure](./figure.png)',
        ].join('\n'),
    );
    await writeFile(join(app.documentDirectory, 'figure.png'), ONE_PIXEL_PNG);
    await app.launch([source]);
    const { page } = app;
    await expect(page.getByRole('tab', { name: 'diagram-export.md' })).toBeVisible();
    const recorder = await recordPrintWindow(page);

    await page.keyboard.press('ControlOrMeta+p');
    await expect.poll(() => recorder.calls.length).toBe(1);

    await page.emulateMedia({ media: 'print' });
    const copy = page.locator('[data-print-copy]');
    await expect(copy.locator("[data-mermaid-state='drawn'] svg")).toHaveCount(1);
    await expect(copy.locator('[data-mermaid-state="pending"]')).toHaveCount(0);
    await expect(copy).not.toContainText('Rendering diagram');
    const image = await copy.locator('img').evaluate((element: HTMLImageElement) => ({
        complete: element.complete,
        width: element.naturalWidth,
    }));
    expect(image).toEqual({ complete: true, width: 1 });
    expect(await pdfPageCount(page)).toBeGreaterThan(0);
});

test('text typed into Untitled and not saved appears in the print copy', async ({ app }) => {
    await app.launch();
    const { page } = app;
    await newUntitledDocument(page);
    const recorder = await recordPrintWindow(page);

    const editor = page.locator('[data-editor-surface] textarea').first();
    await editor.focus();
    await page.keyboard.insertText('# Unsaved Draft Heading\n\nA line that was never saved.');
    await page.keyboard.press('ControlOrMeta+p');
    await expect.poll(() => recorder.calls.length).toBe(1);

    const text = await printedText(page);
    expect(text).toContain('Unsaved Draft Heading');
    expect(text).toContain('A line that was never saved.');
    expect(text).not.toContain('Untitled');
});

test('Material in Dark mode prints on a dark page', async ({ app }) => {
    await app.launch();
    const { page } = app;
    await newUntitledDocument(page);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const menu = page.getByRole('menu', { name: 'Settings menu' });
    await menu.getByRole('radio', { name: 'Material', exact: true }).click();
    await menu.getByRole('radio', { name: 'Dark', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
    await page.keyboard.press('Escape');
    const recorder = await recordPrintWindow(page);

    await page.locator('[data-editor-surface] textarea').first().focus();
    await page.keyboard.insertText('Dark page text');
    await page.keyboard.press('ControlOrMeta+p');
    await expect.poll(() => recorder.calls.length).toBe(1);

    await page.emulateMedia({ media: 'print' });
    const colours = await page.evaluate(() => {
        const copy = document.querySelector<HTMLElement>('[data-print-copy]');
        if (copy === null) throw new Error('the print copy is missing');
        const probe = document.createElement('span');
        probe.style.color = 'var(--surface)';
        copy.append(probe);
        const surface = getComputedStyle(probe).color;
        probe.remove();
        const style = getComputedStyle(copy);
        return { background: style.backgroundColor, exact: style.getPropertyValue('print-color-adjust'), surface };
    });
    expect(colours.background).toBe(colours.surface);
    expect(colours.exact).toBe('exact');
    const [red = 255, green = 255, blue = 255] = (colours.background.match(/\d+/gu) ?? []).map(Number);
    expect(red + green + blue).toBeLessThan(3 * 128);
});

/** The drawing operators of every page, with each Flate stream expanded. */
function pdfContent(pdf: Buffer): string {
    const text = pdf.toString('latin1');
    const streams: string[] = [];
    for (const match of text.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/gu)) {
        try {
            streams.push(inflateSync(Buffer.from(match[1] ?? '', 'latin1')).toString('latin1'));
        } catch {
            // Fonts and images are not Flate text; only page content matters here.
        }
    }
    return streams.join('\n');
}

/** The fill of each full-page rectangle, in paint order: the last one is what the page shows. */
function pageFills(content: string): number[][] {
    const fill = /(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) rg\s+(?:\/\S+ gs\s+)?0 0 \d+ \d+ re\s+f\b/gu;
    return [...content.matchAll(fill)].map((match) => [Number(match[1]), Number(match[2]), Number(match[3])]);
}

test('Clean prints a white page from Dark mode, keeps the screen dark and survives a restart', async ({ app }) => {
    await app.launch();
    const { page } = app;
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const menu = page.getByRole('menu', { name: 'Settings menu' });
    await menu.getByRole('radio', { name: 'Material', exact: true }).click();
    await menu.getByRole('radio', { name: 'Dark', exact: true }).click();
    await menu.getByRole('menuitemradio', { name: 'Clean', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
    await page.keyboard.press('Escape');

    await app.relaunch();
    const restarted = app.page;
    await newUntitledDocument(restarted);
    await restarted.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(
        restarted
            .getByRole('menu', { name: 'Settings menu' })
            .getByRole('menuitemradio', { name: 'Clean', exact: true }),
    ).toBeChecked();
    await restarted.keyboard.press('Escape');
    await expect(restarted.locator('html')).toHaveAttribute('data-mode', 'dark');

    const recorder = await recordPrintWindow(restarted);
    await restarted.locator('[data-editor-surface] textarea').first().focus();
    await restarted.keyboard.insertText('Clean page text');
    await restarted.keyboard.press('ControlOrMeta+p');
    await expect.poll(() => recorder.calls.length).toBe(1);

    await restarted.emulateMedia({ media: 'print' });
    const copy = restarted.locator('[data-print-copy]');
    await expect(copy).toHaveAttribute('data-print-appearance', 'clean');
    await expect(copy).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    const fills = pageFills(pdfContent(await restarted.pdf({ printBackground: true })));
    expect(fills.at(-1)).toEqual([1, 1, 1]);

    await restarted.emulateMedia({ media: 'screen' });
    await expect(restarted.locator('html')).toHaveAttribute('data-mode', 'dark');
});

test('with no document open Export is disabled and Ctrl+P opens nothing', async ({ app }) => {
    await app.launch();
    const { page } = app;
    await expect(page.getByTestId('document-launcher')).toBeVisible();
    const recorder = await recordPrintWindow(page);

    await page.getByRole('button', { name: 'File', exact: true }).click();
    await expect(page.getByRole('menuitem', { name: 'Export to PDF', exact: true })).toBeDisabled();
    await page.keyboard.press('Escape');

    await page.keyboard.press('ControlOrMeta+p');
    await page.waitForTimeout(500);
    expect(recorder.calls).toHaveLength(0);
    await expect(page.locator('[data-print-copy]')).toHaveCount(0);
});

test('the Keyboard shortcuts dialog lists Export to PDF with Ctrl+P', async ({ app }) => {
    await app.launch();
    const { page } = app;
    await page.getByRole('button', { name: 'About', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Keyboard shortcuts' }).click();
    const row = page.getByRole('dialog', { name: 'Keyboard shortcuts' }).locator('[data-action-id="export-pdf"]');
    await expect(row).toContainText('Export to PDF');
    await expect(row.locator('kbd')).toHaveText(/^(Ctrl\+P|⌘P)$/u);
});

test('a saved document suggests its file name as the page title under print, and Untitled keeps the default', async ({
    app,
}) => {
    const source = await app.writeDocument('suggested-name.md', '# Named\n');
    await app.launch([source]);
    const { page } = app;
    await expect(page.getByRole('tab', { name: 'suggested-name.md' })).toBeVisible();
    const recorder = await recordPrintWindow(page);
    expect(await page.title()).not.toBe('suggested-name');

    await page.keyboard.press('ControlOrMeta+p');
    await expect.poll(() => recorder.calls.length).toBe(1);
    await expect.poll(() => page.title()).toBe('suggested-name');
});

test('an Untitled document keeps the default page title when exported', async ({ app }) => {
    await app.launch();
    const { page } = app;
    await newUntitledDocument(page);
    const recorder = await recordPrintWindow(page);
    const defaultTitle = await page.title();

    await page.locator('[data-editor-surface] textarea').first().focus();
    await page.keyboard.insertText('Unsaved');
    await page.keyboard.press('ControlOrMeta+p');
    await expect.poll(() => recorder.calls.length).toBe(1);
    expect(await page.title()).toBe(defaultTitle);
});
