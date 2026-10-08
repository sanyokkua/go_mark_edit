import type { Page } from '@playwright/test';

import { expect, newUntitledDocument, test } from '../support/harness';

const appearances = [
    ['Liquid Glass', 'Light', 'glass', 'light'],
    ['Liquid Glass', 'Dark', 'glass', 'dark'],
    ['Material', 'Light', 'material', 'light'],
    ['Material', 'Dark', 'material', 'dark'],
    ['Minimal', 'Light', 'minimal', 'light'],
    ['Minimal', 'Dark', 'minimal', 'dark'],
] as const;

async function openDocument(page: Page, name: string): Promise<void> {
    await page.getByTestId('document-launcher').getByRole('button', { name }).click();
    await expect(page.getByRole('tab', { name })).toBeVisible();
}

test('table words stay intact in narrow Split and wide Preview under Full and GFM', async ({ app }) => {
    const longCode = 'unbroken' + 'x'.repeat(220);
    const prose = 'outside' + 'y'.repeat(600);
    const markdown = [
        prose,
        '',
        '| Anchor | Document Label | Owner Name | Region | Priority | Status |',
        '| --- | --- | --- | --- | --- | --- |',
        '| Anchor | Brief Account | `inline code words` | North region | Medium | Active |',
        '',
        '| Long value | Description |',
        '| --- | --- |',
        `| \`${longCode}\` | Scroll to read the whole code value |`,
    ].join('\n');
    const path = await app.writeDocument('table-caret.md', markdown);
    await app.seedRecents([path]);
    await app.launch();
    const { page } = app;
    await openDocument(page, 'table-caret.md');
    const arrangement = page.getByRole('radiogroup', { name: 'View arrangement' });
    const preview = page.getByRole('region', { name: 'Preview pane' });

    for (const standard of ['Full', 'GFM'] as const) {
        if (standard === 'GFM') {
            await page.getByRole('button', { name: 'Settings', exact: true }).click();
            await page
                .getByRole('menu', { name: 'Settings menu' })
                .getByRole('menuitemradio', { name: 'GFM', exact: true })
                .click();
        }
        await expect(page.getByRole('status', { name: 'Document status' })).toContainText(`Markdown · ${standard}`);
        for (const [view, width] of [
            ['Split', 768],
            ['Preview', 1280],
        ] as const) {
            await page.setViewportSize({ width, height: 720 });
            await arrangement.getByRole('radio', { name: view, exact: true }).click();
            const tables = preview.getByRole('table');
            await expect(tables).toHaveCount(2);
            const short = tables.first();
            const long = tables.last();
            await expect(short.getByRole('columnheader', { name: 'Anchor' })).toBeVisible();
            await expect(short.getByRole('cell', { name: 'Brief Account' })).toBeVisible();
            await expect(short.getByRole('cell', { name: 'inline code words' })).toBeVisible();

            const split = await short.evaluate((table) => {
                const targets = [
                    table.querySelector('th'),
                    table.querySelectorAll('td')[1],
                    table.querySelectorAll('td')[2]?.querySelector('code'),
                ];
                return targets.map((target) => {
                    if (target === null || target === undefined) throw new Error('Expected table label is missing');
                    const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
                    const broken: string[] = [];
                    while (walker.nextNode()) {
                        const node = walker.currentNode;
                        const text = node.textContent ?? '';
                        for (const match of text.matchAll(/\S+/gu)) {
                            const range = document.createRange();
                            range.setStart(node, match.index);
                            range.setEnd(node, match.index + match[0].length);
                            if (range.getClientRects().length > 1) broken.push(match[0]);
                        }
                    }
                    return broken;
                });
            });
            expect(split, `${standard} ${view}: table words split inside cells`).toEqual([[], [], []]);
            if (view === 'Split') {
                const wordTops = await short.getByRole('cell', { name: 'Brief Account' }).evaluate((cell) => {
                    const node = cell.firstChild;
                    if (node === null) throw new Error('Multiword table cell is empty');
                    const positions = ['Brief', 'Account'].map((word) => {
                        const start = (node.textContent ?? '').indexOf(word);
                        if (start < 0) throw new Error(`Expected ${word} in multiword table cell`);
                        const range = document.createRange();
                        range.setStart(node, start);
                        range.setEnd(node, start + word.length);
                        return range.getBoundingClientRect().top;
                    });
                    return positions;
                });
                expect(wordTops[1], `${standard} Split: multiword label should wrap at its space`).toBeGreaterThan(
                    wordTops[0] + 1,
                );
            }

            await expect(long.locator('code')).toHaveText(longCode);
            const scrollPosition = await long.evaluate((table) => {
                const overflow = table.scrollWidth - table.clientWidth;
                table.scrollLeft = table.scrollWidth;
                return { overflow, reached: table.scrollLeft };
            });
            expect(
                scrollPosition.overflow,
                `${standard} ${view}: long code should overflow horizontally`,
            ).toBeGreaterThan(1);
            expect(
                scrollPosition.reached,
                `${standard} ${view}: long code should be scrollable to the end`,
            ).toBeCloseTo(scrollPosition.overflow, 0);
            const proseLines = await preview
                .locator('p')
                .first()
                .evaluate((paragraph) => {
                    const text = paragraph.firstChild;
                    if (text === null) throw new Error('Surrounding prose is missing');
                    const range = document.createRange();
                    range.selectNodeContents(text);
                    return range.getClientRects().length;
                });
            expect(proseLines, `${standard} ${view}: surrounding prose should still wrap`).toBeGreaterThan(1);
        }
    }
    app.expectNoForeignRequests();
});

test('focused Monaco input has no decoration while editor boundary and caret retain each theme accent', async ({
    app,
}) => {
    await app.launch();
    const { page } = app;
    await newUntitledDocument(page);
    const input = page.locator('[data-editor-surface] textarea.inputarea');
    await expect(input).toBeVisible();
    for (const [label, modeLabel, theme, mode] of appearances) {
        await page.getByRole('button', { name: 'Settings', exact: true }).click();
        const menu = page.getByRole('menu', { name: 'Settings menu' });
        await menu.getByRole('radio', { name: label, exact: true }).press('Space');
        await menu.getByRole('radio', { name: modeLabel, exact: true }).press('Space');
        await page.keyboard.press('Escape');
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await expect(page.locator('html')).toHaveAttribute('data-mode', mode);
        await input.focus();
        await expect(input).toBeFocused();
        const styles = await input.evaluate((element) => {
            const style = getComputedStyle(element);
            const monaco = element.closest('.monaco-editor');
            if (monaco === null) throw new Error('Monaco editor boundary is missing');
            const boundary = getComputedStyle(monaco);
            const cursor = monaco.querySelector('.cursor');
            if (cursor === null) throw new Error('Monaco caret is missing');
            const caret = getComputedStyle(cursor);
            const probe = document.createElement('span');
            probe.style.color = 'var(--accent)';
            document.body.append(probe);
            const accent = getComputedStyle(probe).color;
            probe.remove();
            return {
                inputShadow: style.boxShadow,
                inputOutline: style.outlineStyle,
                boundaryOutline: boundary.outlineStyle,
                boundaryOutlineWidth: Number.parseFloat(boundary.outlineWidth),
                boundaryOutlineColor: boundary.outlineColor,
                caretColor: caret.backgroundColor,
                accent,
            };
        });
        expect(styles.inputShadow, `${theme} ${mode}: focused Monaco input shadow`).toBe('none');
        expect(styles.inputOutline, `${theme} ${mode}: focused Monaco input outline`).toBe('none');
        expect(styles.boundaryOutline, `${theme} ${mode}: editor boundary outline`).toBe('solid');
        expect(styles.boundaryOutlineWidth, `${theme} ${mode}: editor boundary outline width`).toBeGreaterThan(0);
        expect(styles.boundaryOutlineColor, `${theme} ${mode}: editor boundary focus color`).toBe(styles.accent);
        expect(styles.caretColor, `${theme} ${mode}: Monaco caret color`).toBe(styles.accent);
    }
    app.expectNoForeignRequests();
});
