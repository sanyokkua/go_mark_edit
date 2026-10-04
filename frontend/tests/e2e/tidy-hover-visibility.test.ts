import { expect, test } from '../support/harness';

for (const scenario of [
    { name: 'writable', text: '* item\n', readOnly: false },
    { name: 'read-only', text: '* item\n\0', readOnly: true },
] as const) {
    for (const appearance of [
        { name: 'Material', value: 'material' },
        { name: 'Liquid Glass', value: 'glass' },
        { name: 'Minimal', value: 'minimal' },
    ] as const) {
        for (const mode of ['Light', 'Dark'] as const) {
            test(`keeps a ${appearance.name} ${mode} lint hover readable for ${scenario.name} documents`, async ({
                app,
            }) => {
                const source = await app.writeDocument('lint-hover.md', scenario.text);
                await app.seedRecents([source]);
                await app.launch();

                const { page } = app;
                await page.setViewportSize({ width: 1280, height: 720 });
                await page
                    .getByRole('tab', { name: /Untitled/u })
                    .locator('..')
                    .getByRole('button', { name: /^Close /u })
                    .click();
                await page.getByTestId('document-launcher').getByRole('button', { name: 'lint-hover.md' }).click();

                await page.getByRole('button', { name: 'Settings' }).click();
                await page.getByRole('radio', { name: appearance.name, exact: true }).click();
                await page.getByRole('radio', { name: mode, exact: true }).click();
                await page.keyboard.press('Escape');
                await expect(page.locator('html')).toHaveAttribute('data-theme', appearance.value);
                await expect(page.locator('html')).toHaveAttribute('data-mode', mode.toLowerCase());

                const editor = page.getByRole('textbox', { name: 'Editor content' });
                await expect(editor).toBeVisible();
                await expect(page.locator('[data-editor-surface] .view-lines')).toContainText('* item');
                const toolbar = page.getByRole('toolbar', { name: 'Document toolbar' });
                if (scenario.readOnly) await expect(toolbar.locator('[data-action-id="format"]')).toBeDisabled();
                await expect(toolbar.locator('[data-action-id="lint"]')).toBeEnabled();
                await toolbar.locator('[data-action-id="lint"]').click();
                const marker = page.locator('.squiggly-warning').first();
                await expect(marker).toBeVisible();
                const markerBox = await marker.boundingBox();
                if (markerBox === null) throw new Error('Lint marker has no screen position');
                await page.mouse.move(markerBox.x + markerBox.width / 2, markerBox.y + markerBox.height / 2);

                const hover = page.locator('.monaco-hover:visible').filter({ hasText: 'Unordered list marker' });
                await expect(hover).toBeVisible();
                await expect(hover).toContainText('Unordered list marker differs from the preferred marker.');
                await expect(hover).toContainText('Use the preferred bullet marker for this item.');
                if (appearance.value === 'glass') {
                    await expect(hover).toHaveCSS(
                        'background-color',
                        mode === 'Light' ? 'rgba(255, 255, 255, 0.8)' : 'rgba(28, 30, 54, 0.82)',
                    );
                    const backdrop = await hover.evaluate((element) => {
                        const probe = document.createElement('div');
                        probe.style.backdropFilter = 'var(--blur)';
                        document.body.append(probe);
                        const expected = getComputedStyle(probe).backdropFilter;
                        probe.remove();
                        return { actual: getComputedStyle(element).backdropFilter, expected };
                    });
                    expect(backdrop.expected).not.toBe('none');
                    expect(backdrop.actual).toBe(backdrop.expected);
                }
                const visibility = await hover.evaluate((element) => {
                    const rect = element.getBoundingClientRect();
                    const points = [
                        [rect.left + 8, rect.top + 8],
                        [rect.right - 8, rect.top + 8],
                        [rect.left + 8, rect.bottom - 8],
                        [rect.right - 8, rect.bottom - 8],
                    ];
                    return {
                        insideViewport:
                            rect.left >= 0 &&
                            rect.top >= 0 &&
                            rect.right <= window.innerWidth &&
                            rect.bottom <= window.innerHeight,
                        visibleCorners: points.map(([x, y]) => {
                            const hit = document.elementFromPoint(x, y);
                            return hit !== null && (hit === element || element.contains(hit));
                        }),
                    };
                });
                expect(visibility.insideViewport).toBe(true);
                expect(visibility.visibleCorners).toEqual([true, true, true, true]);
            });
        }
    }
}
