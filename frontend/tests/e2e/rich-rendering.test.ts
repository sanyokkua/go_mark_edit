import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { expect, test } from '../support/harness';

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
    await expect(preview.getByRole('note')).toHaveCount(0);
    await expect(preview).toContainText('[!NOTE]');
    await expect(preview).toContainText(':::note');
    await chooseStandard('Minimal (CommonMark)', 'Minimal');
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
