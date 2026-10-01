import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Page } from '@playwright/test';

import { expect, test } from '../support/harness';
import { invokeEditorContextAction, nativeClipboardText, setNativeClipboard } from '../support/nativeClipboard';

const strippedElements = [
    'script',
    'style',
    'iframe',
    'object',
    'embed',
    'form',
    'noscript',
    'template',
    'textarea',
    'select',
    'button',
    'svg',
    'math',
    'title',
    'head',
    'frame',
    'applet',
    'link',
    'meta',
    'base',
    'audio',
    'video',
    'canvas',
    'noembed',
    'noframes',
    'xmp',
    'plaintext',
    'dialog',
    'portal',
] as const;

const strippedTextElements = strippedElements.filter(
    (name) => !['embed', 'link', 'meta', 'base', 'head', 'frame'].includes(name),
);

const alertKinds = ['note', 'tip', 'important', 'warning', 'caution'] as const;

const appearances = [
    ['Liquid Glass', 'Light', 'glass', 'light'],
    ['Liquid Glass', 'Dark', 'glass', 'dark'],
    ['Material', 'Light', 'material', 'light'],
    ['Material', 'Dark', 'material', 'dark'],
    ['Minimal', 'Light', 'minimal', 'light'],
    ['Minimal', 'Dark', 'minimal', 'dark'],
] as const;

async function watchDiagramRedraw(page: Page, theme: string, mode: string): Promise<void> {
    await page.evaluate(
        ({ theme, mode }) => {
            const root = document.documentElement;
            const previous = document.querySelector('article.gme-preview [data-mermaid-block] svg');
            const record: { started: number; elapsed?: number } = { started: performance.now() };
            (window as unknown as { __diagramRedraw?: typeof record }).__diagramRedraw = record;
            const observer = new MutationObserver(() => {
                const current = document.querySelector('article.gme-preview [data-mermaid-block] svg');
                if (root.dataset.theme === theme && root.dataset.mode === mode && current && current !== previous) {
                    record.elapsed = performance.now() - record.started;
                    observer.disconnect();
                }
            });
            observer.observe(root, { attributes: true, childList: true, subtree: true });
        },
        { theme, mode },
    );
}

async function measuredRedraw(page: Page, theme: string, mode: string): Promise<number> {
    await expect
        .poll(
            () =>
                page.evaluate(
                    () => (window as unknown as { __diagramRedraw?: { elapsed?: number } }).__diagramRedraw?.elapsed,
                ),
            {
                timeout: 5_000,
            },
        )
        .toBeGreaterThan(0);
    const elapsed = await page.evaluate(
        () => (window as unknown as { __diagramRedraw?: { elapsed?: number } }).__diagramRedraw?.elapsed,
    );
    if (elapsed === undefined) throw new Error('The browser did not record a diagram redraw');
    console.log(`[mermaid] redraw ${theme}/${mode} ${Math.round(elapsed)}ms`);
    expect(elapsed).toBeLessThanOrEqual(1_000);
    return elapsed;
}

function contrastRatio(foreground: string, background: string): number {
    const channels = (value: string): number[] => {
        const match = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)$/u.exec(value);
        if (match === null) throw new Error(`Cannot compare SVG colors: ${value}`);
        return match.slice(1, 4).map((channel) => {
            const normalized = Number(channel) / 255;
            return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
        });
    };
    const luminance = (value: string): number => {
        const [red, green, blue] = channels(value);
        return red * 0.2126 + green * 0.7152 + blue * 0.0722;
    };
    const first = luminance(foreground);
    const second = luminance(background);
    return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

async function activeBufferContent(page: Page): Promise<string> {
    return page.evaluate(async () => {
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
        const getState = root.go?.appmodel?.AppModelHandler?.GetState;
        if (!getState) throw new Error('The app state binding is unavailable');
        const result = await getState({ id: crypto.randomUUID() });
        return result.data?.activeBuffer?.content ?? '';
    });
}

test('the reference document renders rich Markdown safely and follows standard changes within one second', async ({
    app,
}) => {
    const source = await readFile(
        join(app.repositoryDirectory, 'frontend/tests/fixtures/reference-document.md'),
        'utf8',
    );
    const path = await app.writeDocument('reference-document.md', source);
    await app.seedRecents([path]);
    await app.launch();

    const { page } = app;
    await page
        .getByRole('tab', { name: 'Untitled' })
        .locator('..')
        .getByRole('button', { name: /^Close /u })
        .click();
    await expect(page.getByTestId('document-launcher')).toBeVisible();
    await page.getByTestId('document-launcher').getByRole('button', { name: 'reference-document.md' }).click();
    await expect(page.getByRole('tab', { name: 'reference-document.md' })).toBeVisible();
    await page.getByRole('radiogroup', { name: 'View arrangement' }).getByRole('radio', { name: 'Preview' }).click();

    const pane = page.locator('section[aria-label="Preview pane"]');
    const preview = pane.locator('article.gme-preview');
    const scroll = pane.locator(':scope > div');
    const header = pane.locator('header');
    const status = page.getByRole('status', { name: 'Document status' });
    await expect(preview.getByRole('heading', { name: 'Rich rendering reference' })).toBeVisible();
    await expect(header).toContainText('Full');
    await expect(status).toContainText('Markdown · Full');

    const table = preview.getByRole('table');
    await expect(table.getByRole('columnheader', { name: 'Name' })).toHaveCSS('text-align', 'left');
    await expect(table.getByRole('columnheader', { name: 'Count' })).toHaveCSS('text-align', 'right');
    await expect(table.getByRole('columnheader', { name: 'State' })).toHaveCSS('text-align', 'center');
    await expect(table.getByRole('cell', { name: '12' })).toBeVisible();
    const tasks = preview.locator('li.task-list-item input[type="checkbox"]');
    await expect(tasks).toHaveCount(2);
    await expect(tasks.nth(0)).toBeChecked();
    await expect(tasks.nth(1)).not.toBeChecked();
    for (const task of await tasks.all()) await expect(task).toBeDisabled();
    await expect(preview.locator('del')).toContainText('Removed wording');
    await expect(preview.getByRole('link', { name: 'https://example.com/reference' })).toHaveAttribute(
        'href',
        'https://example.com/reference',
    );
    await expect(preview).not.toContainText('frontmatter-hidden-sentinel');
    await expect(preview.locator('a[href^="#user-content-fn-"]').first()).toBeVisible();
    await expect(preview.locator('section[data-footnotes]')).toContainText('Footnote detail with a return link.');

    for (const kind of alertKinds) {
        const title = kind[0].toUpperCase() + kind.slice(1);
        await expect(preview.getByRole('note').filter({ hasText: `GitHub ${kind} body.` })).toContainText(title);
        await expect(preview.getByRole('note').filter({ hasText: `Directive ${kind} body.` })).toContainText(title);
    }
    await expect(preview).toContainText(':::unknown');
    await expect(preview.locator('pre code.language-go [class^="hljs-"]').first()).toBeVisible();
    await expect(preview.locator('.katex')).toHaveCount(3);
    await expect(preview.locator('.katex-display')).toHaveCount(2);
    await expect(preview.locator('.katex-error')).toHaveText('\\notacommand');
    await expect(preview).not.toContainText('$E=mc^2$');
    await expect(preview).not.toContainText('x^2 + y^2 = z^2');
    const diagrams = preview.locator('[data-mermaid-block]');
    await expect(diagrams).toHaveCount(2);
    await expect(diagrams.nth(0).locator('svg')).toBeVisible();
    await expect(diagrams.nth(1).getByRole('alert')).toBeVisible();
    await expect(diagrams.nth(1).locator('pre')).toHaveText(
        "Parse error on line 3:\n...wchart LR    A -->\n---------------------^\nExpecting 'AMP', 'COLON', 'PIPE', 'TESTSTR', 'DOWN', 'DEFAULT', 'NUM', 'COMMA', 'NODE_STRING', 'BRKT', 'MINUS', 'MULT', 'UNICODE_TEXT', got 'EOF'",
    );
    await expect(diagrams.nth(0)).not.toContainText('flowchart LR');
    const unknownCode = preview.locator('pre code.language-unknown-language');
    await expect(unknownCode).toContainText('unknown block stays plain');
    await expect(unknownCode.locator('[class^="hljs-"]')).toHaveCount(0);
    await expect(preview.getByText('The price is $5 and $10, and an escaped dollar is $5.')).toBeVisible();
    await expect(preview.locator('kbd')).toContainText('Ctrl');
    await expect(preview.locator('mark')).toContainText('marked');

    await expect(preview.locator('#notes')).toHaveText('Notes');
    await expect(preview.locator('#notes-1')).toHaveText('Notes');
    await expect(preview.locator('#über-uns')).toHaveText('Über uns');
    for (const [label, target] of [
        ['see', '#getting-started'],
        ['first note', '#notes'],
        ['second note', '#notes-1'],
        ['about', '#über-uns'],
    ]) {
        await scroll.evaluate((element) => {
            (element as HTMLElement).scrollTop = 0;
        });
        const link = preview.getByRole('link', { name: label, exact: true });
        await link.click();
        await expect.poll(() => scroll.evaluate((element) => (element as HTMLElement).scrollTop)).toBeGreaterThan(0);
        await expect(preview.locator(target)).toBeInViewport();
    }

    const footnote = preview.locator('a[href^="#user-content-fn-"]').first();
    await scroll.evaluate((element) => {
        (element as HTMLElement).scrollTop = 0;
    });
    await footnote.scrollIntoViewIfNeeded();
    const beforeFootnote = await scroll.evaluate((element) => (element as HTMLElement).scrollTop);
    await footnote.click();
    await expect(preview.locator('section[data-footnotes]')).toContainText('Footnote detail with a return link.');
    await expect
        .poll(() => scroll.evaluate((element) => (element as HTMLElement).scrollTop))
        .toBeGreaterThan(beforeFootnote);
    await expect(preview.locator('#user-content-fn-detail')).toBeInViewport();
    const beforeBackref = await scroll.evaluate((element) => (element as HTMLElement).scrollTop);
    await preview.locator('a[href^="#user-content-fnref-"]').first().click();
    await expect
        .poll(() => scroll.evaluate((element) => (element as HTMLElement).scrollTop))
        .toBeLessThan(beforeBackref);

    for (const element of strippedElements) {
        if (element === 'svg') {
            expect(
                await preview
                    .locator('svg')
                    .evaluateAll((nodes) =>
                        nodes.every(
                            (node) =>
                                node.closest('[role="note"]') !== null || node.closest('[data-mermaid-block]') !== null,
                        ),
                    ),
            ).toBe(true);
        } else if (element === 'style') {
            expect(
                await preview
                    .locator('style')
                    .evaluateAll((nodes) => nodes.every((node) => node.closest('[data-mermaid-block] svg') !== null)),
            ).toBe(true);
        } else {
            await expect(preview.locator(element)).toHaveCount(0);
        }
    }
    for (const element of strippedTextElements) await expect(preview).not.toContainText(`strip-${element}-sentinel`);
    await expect(preview).toContainText('Unknown wrapper text survives.');
    await expect(preview.locator('unknown-widget')).toHaveCount(0);
    await expect(preview).toContainText('Safe paragraph survives.');
    await expect(preview.locator('[onclick]')).toHaveCount(0);
    const safeParagraph = preview.getByText('Safe paragraph survives.');
    expect(await safeParagraph.evaluate((element) => element.hasAttribute('style'))).toBe(false);
    await safeParagraph.click();
    expect(
        await page.evaluate(() => (globalThis as unknown as { __hostileClicked?: boolean }).__hostileClicked),
    ).toBeUndefined();
    for (const label of [
        'unsafe-js-lower',
        'unsafe-js-mixed',
        'unsafe-js-space',
        'unsafe-js-entity',
        'unsafe-data-lower',
        'unsafe-data-mixed',
        'unsafe-data-space',
        'unsafe-data-entity',
    ]) {
        await expect(preview.getByText(label)).toBeVisible();
        await expect(preview.getByRole('link', { name: label })).toHaveCount(0);
    }

    async function chooseStandard(label: string, expected: 'GFM' | 'Minimal'): Promise<void> {
        const menu = page.getByRole('menu', { name: 'Settings menu' });
        if (!(await menu.isVisible())) await page.getByRole('button', { name: 'Settings', exact: true }).click();
        const started = performance.now();
        await menu.getByRole('menuitemradio', { name: label, exact: true }).click({ timeout: 1_000 });
        const remaining = 1_000 - (performance.now() - started);
        expect(remaining).toBeGreaterThan(0);
        await expect
            .poll(
                async () => {
                    const [headerText, statusText, rendered] = await Promise.all([
                        header.textContent(),
                        status.textContent(),
                        preview.evaluate((article, target) => {
                            const text = article.textContent ?? '';
                            if (target === 'GFM') {
                                return (
                                    article.querySelector('table') !== null &&
                                    article.querySelector('[role="note"]') === null &&
                                    text.includes('[!NOTE]') &&
                                    text.includes(':::note')
                                );
                            }
                            return (
                                article.querySelector('table') === null &&
                                text.includes('| Name | Count | State |') &&
                                text.includes('~~Removed wording~~') &&
                                text.includes('frontmatter-hidden-sentinel')
                            );
                        }, expected),
                    ]);
                    return [headerText?.includes(expected), statusText?.includes(`Markdown · ${expected}`), rendered];
                },
                { timeout: remaining },
            )
            .toEqual([true, true, true]);
    }

    await chooseStandard('GFM', 'GFM');
    await expect(table).toBeVisible();
    await expect(diagrams.nth(0).locator('svg')).toBeVisible();
    await expect(preview.locator('.katex')).toHaveCount(0);
    await expect(preview).toContainText('$E=mc^2$');
    await expect(preview).toContainText('x^2 + y^2 = z^2');
    await expect(preview).toContainText('\\frac{a}{b}');
    await expect(preview.getByRole('note')).toHaveCount(0);
    await expect(preview).toContainText('[!NOTE]');
    await expect(preview).toContainText(':::note');
    await chooseStandard('Minimal (CommonMark)', 'Minimal');
    await expect(diagrams.nth(0).locator('svg')).toBeVisible();
    await expect(preview.locator('.katex')).toHaveCount(0);
    await expect(preview).toContainText('$E=mc^2$');
    await expect(preview.getByRole('table')).toHaveCount(0);
    await expect(preview).toContainText('| Name | Count | State |');
    await expect(preview).toContainText('~~Removed wording~~');
    await expect(preview).toContainText('frontmatter-hidden-sentinel');
    app.expectNoForeignRequests();
});

test('a standalone plaintext element removes its content and the source that follows it', async ({ app }) => {
    const path = await app.writeDocument(
        'plaintext.md',
        '# Safe beginning\n\n<plaintext>hidden-plaintext-sentinel\n\nAfter plaintext.\n',
    );
    await app.seedRecents([path]);
    await app.launch();
    const { page } = app;
    await page
        .getByRole('tab', { name: 'Untitled' })
        .locator('..')
        .getByRole('button', { name: /^Close /u })
        .click();
    await page.getByTestId('document-launcher').getByRole('button', { name: 'plaintext.md' }).click();
    await page.getByRole('radiogroup', { name: 'View arrangement' }).getByRole('radio', { name: 'Preview' }).click();
    const preview = page.locator('section[aria-label="Preview pane"] article.gme-preview');
    await expect(preview.getByRole('heading', { name: 'Safe beginning' })).toBeVisible();
    await expect(preview.locator('plaintext')).toHaveCount(0);
    await expect(preview).not.toContainText('hidden-plaintext-sentinel');
    await expect(preview).not.toContainText('After plaintext.');
    app.expectNoForeignRequests();
});

test('all supported Mermaid diagram types render safe SVG', async ({ app }) => {
    const source = await readFile(join(app.repositoryDirectory, 'frontend/tests/fixtures/mermaid-diagrams.md'), 'utf8');
    const path = await app.writeDocument('mermaid-diagrams.md', source);
    await app.seedRecents([path]);
    await app.launch();
    const { page } = app;
    await page
        .getByRole('tab', { name: 'Untitled' })
        .locator('..')
        .getByRole('button', { name: /^Close /u })
        .click();
    await page.getByTestId('document-launcher').getByRole('button', { name: 'mermaid-diagrams.md' }).click();
    await page.getByRole('radiogroup', { name: 'View arrangement' }).getByRole('radio', { name: 'Preview' }).click();
    const preview = page.locator('article.gme-preview');
    const blocks = preview.locator('[data-mermaid-block]');
    await expect(blocks).toHaveCount(12);
    await expect(blocks.locator('svg')).toHaveCount(12, { timeout: 30_000 });
    await expect(blocks.getByRole('alert')).toHaveCount(0);
    const unsafe = await blocks.locator('svg').evaluateAll((svgs) =>
        svgs.flatMap((svg, index) => {
            const problems: string[] = [];
            for (const element of [svg, ...svg.querySelectorAll('*')]) {
                const tag = element.localName.toLowerCase();
                if (['script', 'foreignobject', 'img', 'image', 'use'].includes(tag)) problems.push(`${index}:${tag}`);
                for (const attribute of element.attributes) {
                    const name = attribute.name.toLowerCase();
                    const value = attribute.value.trim();
                    if (name.startsWith('on')) problems.push(`${index}:${name}`);
                    if ((name === 'href' || name === 'xlink:href') && (tag === 'a' || !value.startsWith('#')))
                        problems.push(`${index}:${name}=${value}`);
                    if (name !== 'xmlns' && name !== 'xmlns:xlink' && /(?:javascript:|data:|https?:\/\/)/iu.test(value))
                        problems.push(`${index}:${name}=${value}`);
                }
                if (tag === 'style' && /@import|url\(\s*['"]?(?!#)/iu.test(element.textContent ?? ''))
                    problems.push(`${index}:external style`);
            }
            return problems;
        }),
    );
    expect(unsafe).toEqual([]);
    app.expectNoForeignRequests();
});

test('Mermaid and formula limits replace only the excess or oversized blocks', async ({ app }) => {
    const valid = '```mermaid\nflowchart LR\n    A[Start] --> B[Finish]\n```';
    const source = [
        '# Diagram limits',
        ...Array.from({ length: 51 }, () => valid),
        `$$\n${'x'.repeat(10_001)}\n$$`,
    ].join('\n\n');
    const path = await app.writeDocument('diagram-limits.md', source);
    const oversized = `\`\`\`mermaid\nflowchart TD\n${'A'.repeat(50_001)}\n\`\`\``;
    const oversizedPath = await app.writeDocument('oversized-diagram.md', oversized);
    await app.seedRecents([path, oversizedPath]);
    await app.launch();
    const { page } = app;
    await page
        .getByRole('tab', { name: 'Untitled' })
        .locator('..')
        .getByRole('button', { name: /^Close /u })
        .click();
    await page.getByTestId('document-launcher').getByRole('button', { name: 'diagram-limits.md' }).click();
    await page.getByRole('radiogroup', { name: 'View arrangement' }).getByRole('radio', { name: 'Preview' }).click();
    const preview = page.locator('article.gme-preview');
    const blocks = preview.locator('[data-mermaid-block]');
    await expect(blocks).toHaveCount(51);
    await expect(blocks.locator('svg')).toHaveCount(50, { timeout: 30_000 });
    await expect(blocks.nth(50).getByRole('status')).toHaveText('Too many diagrams to render');
    await expect(blocks.nth(50).locator('svg')).toHaveCount(0);
    await expect(preview.locator('[data-math-limit="too-large"]')).toHaveText('Formula too large to render');
    app.expectNoForeignRequests();

    await page
        .getByRole('tab', { name: 'diagram-limits.md' })
        .locator('..')
        .getByRole('button', { name: /^Close /u })
        .click();
    await page.getByTestId('document-launcher').getByRole('button', { name: 'oversized-diagram.md' }).click();
    const oversizedBlock = page.locator('article.gme-preview [data-mermaid-block]');
    await expect(oversizedBlock.getByRole('status')).toHaveText('Diagram too large to render');
    await expect(oversizedBlock.locator('svg')).toHaveCount(0);
    app.expectNoForeignRequests();
});

test('all six appearances redraw readable diagrams and recolor code, math, and alerts within one second', async ({
    app,
}) => {
    const source = [
        '# Palette',
        'Inline math $E=mc^2$.',
        '> [!NOTE]',
        '> A themed alert.',
        '```go',
        'func main() {}',
        '```',
        '```mermaid',
        'flowchart LR',
        '    startNode["Start"] --> finishNode["Finish"]',
        '```',
    ].join('\n\n');
    const path = await app.writeDocument('mermaid-palettes.md', source);
    await app.seedRecents([path]);
    await app.launch();
    const { page } = app;
    await page
        .getByRole('tab', { name: 'Untitled' })
        .locator('..')
        .getByRole('button', { name: /^Close /u })
        .click();
    await page.getByTestId('document-launcher').getByRole('button', { name: 'mermaid-palettes.md' }).click();
    await page.getByRole('radiogroup', { name: 'View arrangement' }).getByRole('radio', { name: 'Preview' }).click();
    const preview = page.locator('article.gme-preview');
    await expect(preview.locator('[data-mermaid-block] svg')).toBeVisible();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const menu = page.getByRole('menu', { name: 'Settings menu' });
    const colorResults: Array<{
        theme: string;
        mode: string;
        node: string;
        label: string;
        keyword: string;
        formula: string;
        alert: string;
    }> = [];

    for (const [familyLabel, modeLabel, theme, mode] of appearances) {
        const currentTheme = await page.locator('html').getAttribute('data-theme');
        const currentMode = await page.locator('html').getAttribute('data-mode');
        const family = menu.getByRole('radio', { name: familyLabel, exact: true });
        const appearance = menu.getByRole('radio', { name: modeLabel, exact: true });
        if (currentTheme !== theme && currentMode !== mode) {
            await family.press('Space');
            await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
            await watchDiagramRedraw(page, theme, mode);
            await appearance.press('Space');
        } else if (currentTheme !== theme) {
            await watchDiagramRedraw(page, theme, mode);
            await family.press('Space');
        } else if (currentMode !== mode) {
            await watchDiagramRedraw(page, theme, mode);
            await appearance.press('Space');
        }
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await expect(page.locator('html')).toHaveAttribute('data-mode', mode);
        if (currentTheme !== theme || currentMode !== mode) await measuredRedraw(page, theme, mode);

        const colors = await preview.evaluate((article) => {
            const svg = article.querySelector('[data-mermaid-block] svg');
            const node = svg?.querySelector('.node rect');
            const label = svg?.querySelector('.node text');
            const keyword = article.querySelector('code.language-go .hljs-keyword');
            const formula = article.querySelector('.katex');
            const paragraph = formula?.closest('p');
            const alertTitle = article.querySelector('[role="note"] p');
            if (!node || !label || !keyword || !formula || !paragraph || !alertTitle)
                throw new Error('Expected themed diagram, highlighted code, formula, and alert');
            const probe = document.createElement('span');
            article.appendChild(probe);
            const token = (name: string): string => {
                probe.style.color = `var(${name})`;
                return getComputedStyle(probe).color;
            };
            const opaqueToken = (name: string): string => {
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                if (!context) throw new Error('Cannot resolve a diagram palette token');
                context.fillStyle = token(name);
                context.fillRect(0, 0, 1, 1);
                const [red, green, blue] = context.getImageData(0, 0, 1, 1).data;
                return `rgb(${red}, ${green}, ${blue})`;
            };
            const result = {
                node: getComputedStyle(node).fill,
                nodeToken: opaqueToken('--elevated'),
                label: getComputedStyle(label).fill,
                labelToken: opaqueToken('--text'),
                keyword: getComputedStyle(keyword).color,
                keywordToken: token('--hl-keyword'),
                formula: getComputedStyle(formula).color,
                paragraph: getComputedStyle(paragraph).color,
                alert: getComputedStyle(alertTitle).color,
                alertToken: token('--accent-ink'),
            };
            probe.remove();
            return result;
        });
        expect(colors.keyword).toBe(colors.keywordToken);
        expect(colors.node).toBe(colors.nodeToken);
        expect(colors.label).toBe(colors.labelToken);
        expect(colors.formula).toBe(colors.paragraph);
        expect(colors.alert).toBe(colors.alertToken);
        const ratio = contrastRatio(colors.label, colors.node);
        console.log(`[mermaid] contrast ${theme}/${mode} ${ratio.toFixed(2)}:1; alert=${colors.alert}`);
        expect(ratio).toBeGreaterThanOrEqual(4.5);
        colorResults.push({
            theme,
            mode,
            node: colors.node,
            label: colors.label,
            keyword: colors.keyword,
            formula: colors.formula,
            alert: colors.alert,
        });
    }
    for (const theme of ['glass', 'material', 'minimal']) {
        const light = colorResults.find((item) => item.theme === theme && item.mode === 'light');
        const dark = colorResults.find((item) => item.theme === theme && item.mode === 'dark');
        if (!light || !dark) throw new Error(`Missing ${theme} appearance measurements`);
        expect(dark.node).not.toBe(light.node);
        expect(dark.label).not.toBe(light.label);
        expect(dark.keyword).not.toBe(light.keyword);
        expect(dark.formula).not.toBe(light.formula);
        expect(dark.alert).not.toBe(light.alert);
    }
    await page.keyboard.press('Escape');
    app.expectNoForeignRequests();
});

test.describe('shipping-assets performance', () => {
    test.use({ frontendAssets: 'production' });
    test('a cold 100 KB document shows ten distinct diagrams within two seconds and typed text within 300 ms', async ({
        app,
    }) => {
        const diagrams = Array.from(
            { length: 10 },
            (_, index) =>
                `\`\`\`mermaid\nflowchart LR\n    start${index}["Start ${index}"] --> finish${index}["Finish ${index}"]\n\`\`\``,
        );
        let source = ['# Rendering performance', ...diagrams].join('\n\n') + '\n\n';
        const filler = 'A local Markdown paragraph fills this performance document.\n\n';
        while (Buffer.byteLength(source + filler, 'utf8') <= 99_950) source += filler;
        source += 'x'.repeat(99_950 - Buffer.byteLength(source, 'utf8'));
        const marker = 'Latest preview marker';
        expect(Buffer.byteLength(source + marker, 'utf8')).toBeLessThanOrEqual(100_000);
        const path = await app.writeDocument('rendering-performance.md', source);
        await app.seedRecents([path]);
        await app.launch();
        const { page } = app;
        await page.getByRole('radiogroup', { name: 'View arrangement' }).getByRole('radio', { name: 'Split' }).click();
        await page
            .getByRole('tab', { name: 'Untitled' })
            .locator('..')
            .getByRole('button', { name: /^Close /u })
            .click();
        const launcher = page
            .getByTestId('document-launcher')
            .getByRole('button', { name: 'rendering-performance.md' });
        await launcher.evaluate((button) => {
            const record: { started?: number; elapsed?: number } = {};
            (window as unknown as { __mermaidOpenTiming?: typeof record }).__mermaidOpenTiming = record;
            button.addEventListener(
                'click',
                () => {
                    record.started = performance.now();
                },
                { capture: true, once: true },
            );
            const observer = new MutationObserver(() => {
                if (record.started === undefined || record.elapsed !== undefined) return;
                if (document.querySelectorAll('article.gme-preview [data-mermaid-block] svg').length === 10) {
                    record.elapsed = performance.now() - record.started;
                    observer.disconnect();
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
        });
        await launcher.click();
        await expect
            .poll(
                () =>
                    page.evaluate(
                        () =>
                            (window as unknown as { __mermaidOpenTiming?: { elapsed?: number } }).__mermaidOpenTiming
                                ?.elapsed,
                    ),
                {
                    timeout: 10_000,
                },
            )
            .toBeGreaterThan(0);
        const diagramMs = await page.evaluate(
            () => (window as unknown as { __mermaidOpenTiming?: { elapsed?: number } }).__mermaidOpenTiming?.elapsed,
        );
        if (diagramMs === undefined) throw new Error('The browser did not record diagram completion');
        console.log(
            `[mermaid] cold ${Buffer.byteLength(source, 'utf8')} bytes, 10 distinct diagrams ${Math.round(diagramMs)}ms`,
        );
        expect(diagramMs).toBeLessThanOrEqual(2_000);

        const editor = page.locator('[data-editor-surface] textarea').first();
        await editor.focus();
        const documentEnd = await page.evaluate(() =>
            navigator.userAgent.includes('Macintosh') ? 'Meta+ArrowDown' : 'Control+End',
        );
        await editor.press(documentEnd);
        await page.evaluate((text) => {
            const input = document.querySelector('[data-editor-surface] textarea');
            const preview = document.querySelector('article.gme-preview');
            if (!input || !preview) throw new Error('Split editor and preview must remain mounted');
            const record: { lastInput?: number; elapsed?: number; count: number } = { count: 0 };
            (window as unknown as { __mermaidTypingTiming?: typeof record }).__mermaidTypingTiming = record;
            input.addEventListener(
                'input',
                () => {
                    record.lastInput = performance.now();
                    record.count++;
                },
                { capture: true },
            );
            const observer = new MutationObserver(() => {
                if (record.lastInput === undefined || record.elapsed !== undefined) return;
                if (preview.textContent?.includes(text)) {
                    record.elapsed = performance.now() - record.lastInput;
                    observer.disconnect();
                }
            });
            observer.observe(preview, { childList: true, characterData: true, subtree: true });
        }, marker);
        await page.keyboard.type(marker);
        await expect
            .poll(() =>
                page.evaluate(
                    () =>
                        (window as unknown as { __mermaidTypingTiming?: { elapsed?: number } }).__mermaidTypingTiming
                            ?.elapsed,
                ),
            )
            .toBeGreaterThanOrEqual(0);
        const typing = await page.evaluate(
            () =>
                (window as unknown as { __mermaidTypingTiming?: { elapsed?: number; count: number } })
                    .__mermaidTypingTiming,
        );
        if (typing?.elapsed === undefined) throw new Error('The browser did not record a preview update');
        expect(typing.count).toBe(marker.length);
        console.log(`[mermaid] last input to preview ${Math.round(typing.elapsed)}ms`);
        expect(typing.elapsed).toBeLessThanOrEqual(300);
        const editedSource = await activeBufferContent(page);
        expect(editedSource.endsWith(marker)).toBe(true);
        expect(Buffer.byteLength(editedSource, 'utf8')).toBeLessThanOrEqual(100_000);
        await expect(page.locator('article.gme-preview [data-mermaid-block] svg')).toHaveCount(10);
        app.expectNoForeignRequests();
    });
});

test(
    'rapid editor revisions never insert a Mermaid result from an older source',
    { tag: '@native-clipboard' },
    async ({ app }) => {
        const initial = '```mermaid\nflowchart LR\n    A[Initial] --> B[Done]\n```';
        const intermediate =
            Array.from(
                { length: 50 },
                (_, index) => `~~~mermaid\nflowchart LR\n    A${index}[Intermediate ${index}] --> B${index}[Done]\n~~~`,
            ).join('\n\n') + '\n';
        const latestPrefix = '# Latest revision\n\n~~~mermaid\nflowchart LR\n    A[Latest ';
        const typedSuffix = 'typed node] --> B[Done]';
        const latest = latestPrefix + typedSuffix;
        const path = await app.writeDocument('rapid-diagram-edits.md', initial);
        await app.seedRecents([path]);
        await app.launch();
        const { page } = app;
        await page
            .getByRole('tab', { name: 'Untitled' })
            .locator('..')
            .getByRole('button', { name: /^Close /u })
            .click();
        await page.getByTestId('document-launcher').getByRole('button', { name: 'rapid-diagram-edits.md' }).click();
        await page.getByRole('radiogroup', { name: 'View arrangement' }).getByRole('radio', { name: 'Split' }).click();
        const preview = page.locator('article.gme-preview');
        await expect(preview.locator('[data-mermaid-block] svg')).toHaveCount(1);
        const editor = page.locator('[data-editor-surface] textarea').first();
        const modifier = await page.evaluate(() => (navigator.userAgent.includes('Macintosh') ? 'Meta' : 'Control'));
        const originalClipboard = await nativeClipboardText(page);
        try {
            await editor.focus();
            await editor.press(`${modifier}+A`);
            await setNativeClipboard(page, intermediate);
            await invokeEditorContextAction(page, 'Paste');
            await expect.poll(() => activeBufferContent(page)).toBe(intermediate);
            await expect(preview.locator('[data-mermaid-block]')).toHaveCount(50);
            const pendingCount = await preview.locator('[data-mermaid-block] svg').count();
            expect(pendingCount).toBeLessThan(50);
            await page.evaluate(() => {
                const article = document.querySelector('article.gme-preview');
                const input = document.querySelector('[data-editor-surface] textarea');
                if (!article || !input) throw new Error('The editor and preview must both be mounted');
                const record = {
                    started: false,
                    accepted: false,
                    typingStarted: false,
                    stale: false,
                    inputCount: 0,
                    maxKeyDelay: 0,
                    maxInputGap: 0,
                    pendingAtRevision: -1,
                };
                (window as unknown as { __mermaidStaleCheck?: typeof record }).__mermaidStaleCheck = record;
                let lastKeydown: number | undefined;
                let lastInput: number | undefined;
                input.addEventListener(
                    'keydown',
                    (event) => {
                        const keyboard = event as KeyboardEvent;
                        if (
                            (keyboard.key.length === 1 || keyboard.key === 'Enter') &&
                            !keyboard.metaKey &&
                            !keyboard.ctrlKey
                        ) {
                            record.typingStarted = true;
                            lastKeydown = performance.now();
                        }
                    },
                    { capture: true },
                );
                input.addEventListener(
                    'input',
                    () => {
                        const now = performance.now();
                        if (!record.typingStarted) return;
                        record.inputCount++;
                        if (lastKeydown !== undefined)
                            record.maxKeyDelay = Math.max(record.maxKeyDelay, now - lastKeydown);
                        if (lastInput !== undefined) record.maxInputGap = Math.max(record.maxInputGap, now - lastInput);
                        lastInput = now;
                    },
                    { capture: true },
                );
                const observer = new MutationObserver((changes) => {
                    if (!record.started) return;
                    if (!record.accepted) {
                        if (article.querySelector('h1')?.textContent !== 'Latest revision') return;
                        record.accepted = true;
                    }
                    for (const change of changes) {
                        for (const added of change.addedNodes) {
                            if (!(added instanceof Element)) continue;
                            const diagrams = [
                                ...(added.matches('[data-mermaid-block] svg') ? [added] : []),
                                ...added.querySelectorAll('[data-mermaid-block] svg'),
                            ];
                            if (diagrams.some((diagram) => diagram.textContent?.includes('Intermediate')))
                                record.stale = true;
                        }
                    }
                });
                observer.observe(article, { childList: true, subtree: true });
            });
            await editor.focus();
            await editor.press(`${modifier}+A`);
            await setNativeClipboard(page, latestPrefix);
            await editor.press('Shift+F10');
            const menu = page.locator('[data-viewport-popup="context-menu"]');
            await expect(menu).toBeVisible();
            const paste = menu.getByRole('menuitem', { name: 'Paste', exact: true });
            await paste.evaluate((item) => {
                item.addEventListener(
                    'click',
                    () => {
                        const record = (
                            window as unknown as {
                                __mermaidStaleCheck?: {
                                    started: boolean;
                                    pendingAtRevision: number;
                                };
                            }
                        ).__mermaidStaleCheck;
                        if (!record) throw new Error('Stale render observer is absent');
                        record.pendingAtRevision = document.querySelectorAll(
                            'article.gme-preview [data-mermaid-block] svg',
                        ).length;
                        record.started = true;
                    },
                    { capture: true, once: true },
                );
            });
            await paste.click();
            await expect(menu).toHaveCount(0);
            await expect(editor).toBeFocused();
            await page.keyboard.type(typedSuffix);
            await expect.poll(() => activeBufferContent(page)).toBe(latest);
            await expect(preview.locator('[data-mermaid-block]')).toHaveCount(1);
            await expect(preview.locator('h1')).toHaveText('Latest revision');
            await expect(preview.locator('[data-mermaid-block] svg')).toContainText('Latest typed node', {
                timeout: 10_000,
            });
            await page.waitForTimeout(300);
            const stale = await page.evaluate(
                () =>
                    (
                        window as unknown as {
                            __mermaidStaleCheck?: {
                                started: boolean;
                                accepted: boolean;
                                stale: boolean;
                                inputCount: number;
                                maxKeyDelay: number;
                                maxInputGap: number;
                                pendingAtRevision: number;
                            };
                        }
                    ).__mermaidStaleCheck,
            );
            expect(stale?.started).toBe(true);
            expect(stale?.accepted).toBe(true);
            expect(stale?.inputCount).toBe(typedSuffix.length);
            expect(stale?.pendingAtRevision).toBeGreaterThanOrEqual(0);
            expect(stale?.pendingAtRevision).toBeLessThan(50);
            expect(stale?.stale).toBe(false);
            console.log(
                `[mermaid] pending=${pendingCount}/50, max key-to-input ${Math.round(stale?.maxKeyDelay ?? 0)}ms, max input gap ${Math.round(stale?.maxInputGap ?? 0)}ms`,
            );
            expect(stale?.maxKeyDelay).toBeLessThanOrEqual(100);
            expect(stale?.maxInputGap).toBeLessThanOrEqual(100);
            await expect(preview.locator('[data-mermaid-block] svg')).toContainText('Latest typed node');
            app.expectNoForeignRequests();
        } finally {
            await setNativeClipboard(page, originalClipboard);
        }
    },
);
