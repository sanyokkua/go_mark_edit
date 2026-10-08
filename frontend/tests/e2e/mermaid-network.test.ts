import { expect, test } from '../support/harness';

test(
    'Mermaid resource syntax neither requests a foreign asset nor leaves an external SVG reference',
    { tag: '@perf' },
    async ({ app }) => {
        const source = [
            '```mermaid',
            'flowchart LR',
            '  A@{ img: "https://example.invalid/mermaid-image.png", label: "Start" }',
            '  A --> B[Finish]',
            '```',
            '',
            '```mermaid',
            'classDiagram',
            '  class A',
            '  style A fill:url(https://example.invalid/mermaid-filter.svg#paint)',
            '```',
            '',
            '```mermaid',
            'classDiagram',
            '  class A',
            '  style A mask:image-set("https://example.invalid/mermaid-image-set.png" 1x)',
            '```',
        ].join('\n');
        const path = await app.writeDocument('mermaid-network.md', source);
        await app.seedRecents([path]);
        const { page } = app;
        const foreignAttempts: string[] = [];
        const cspFailures: string[] = [];
        page.on('requestfailed', (request) => {
            if (request.url().includes('example.invalid')) {
                cspFailures.push(`${request.url()}: ${request.failure()?.errorText}`);
            }
        });
        await page.route('**/*', async (route) => {
            const url = new URL(route.request().url());
            if (
                (url.protocol === 'http:' || url.protocol === 'https:') &&
                !['localhost', '127.0.0.1', 'wails.localhost'].includes(url.hostname)
            ) {
                foreignAttempts.push(url.href);
                await route.abort();
                return;
            }
            await route.continue();
        });
        await app.launch();
        await page.getByTestId('document-launcher').getByRole('button', { name: 'mermaid-network.md' }).click();
        await page
            .getByRole('radiogroup', { name: 'View arrangement' })
            .getByRole('radio', { name: 'Preview' })
            .click();

        const blocks = page.locator('article.gme-preview [data-mermaid-block]');
        await expect(blocks).toHaveCount(3);
        await expect(blocks.nth(0).getByRole('alert')).toBeVisible();
        await expect(blocks.nth(1).locator('svg')).toBeVisible();
        await expect(blocks.nth(2).locator('svg')).toBeVisible();
        await expect
            .poll(async () => (await blocks.locator('svg').count()) + (await blocks.getByRole('alert').count()))
            .toBe(3);
        const markup = await blocks
            .locator('svg')
            .evaluateAll((nodes) => nodes.map((node) => node.outerHTML).join('\n'));
        expect(markup).not.toMatch(/example\.invalid|data:image|image-set|<image\b|<foreignObject\b/iu);
        expect(foreignAttempts).toEqual([]);
        expect(cspFailures).toEqual(expect.arrayContaining([expect.stringContaining('mermaid-image-set.png: csp')]));
        expect(cspFailures.every((failure) => failure.endsWith(': csp'))).toBe(true);
        app.expectNoForeignRequests();

        await page.evaluate(async () => {
            try {
                await fetch('https://example.invalid/guard-sentinel');
            } catch {
                // The route below rejects the synthetic attempt; the harness must still report it.
            }
        });
        expect(foreignAttempts).toContain('https://example.invalid/guard-sentinel');
        expect(() => app.expectNoForeignRequests()).toThrow();
    },
);
