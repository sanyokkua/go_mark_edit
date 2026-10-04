import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Page } from '@playwright/test';

import { expect, test, type E2EAppHarness } from '../support/harness';

async function activeText(page: Page): Promise<string> {
    return page.evaluate(async () => {
        const root = window as unknown as {
            go: {
                appmodel: {
                    AppModelHandler: {
                        GetState: (request: {
                            id: string;
                        }) => Promise<{ data?: { activeBuffer?: { content?: string } } }>;
                    };
                };
            };
        };
        const response = await root.go.appmodel.AppModelHandler.GetState({ id: crypto.randomUUID() });
        return response.data?.activeBuffer?.content ?? '';
    });
}

async function hasUnderlineAtCaret(page: Page): Promise<boolean> {
    return page.evaluate(() => {
        const caret = document.querySelector('[data-editor-surface] .cursor')?.getBoundingClientRect();
        if (caret === undefined) return false;
        return [...document.querySelectorAll('.squiggly-warning')].some((element) => {
            const marker = element.getBoundingClientRect();
            return Math.abs(marker.top - caret.top) < 1 && Math.abs(marker.bottom - caret.bottom) < 1;
        });
    });
}

async function openDocument(app: E2EAppHarness, filename: string, contents: string): Promise<Page> {
    const source = await app.writeDocument(filename, contents);
    await app.seedRecents([source]);
    await app.launch();
    const { page } = app;
    await page
        .getByRole('tab', { name: /Untitled/u })
        .locator('..')
        .getByRole('button', { name: /^Close /u })
        .click();
    await page.getByTestId('document-launcher').getByRole('button', { name: filename, exact: true }).click();
    await expect(page.getByRole('tab', { name: filename })).toBeVisible();
    await expect(page.locator('[data-editor-surface] .view-lines')).toContainText(contents.split(/[\r\n]/u)[0]);
    return page;
}

function lint(page: Page): ReturnType<Page['locator']> {
    return page.getByRole('toolbar', { name: 'Document toolbar' }).locator('[data-action-id="lint"]');
}

async function openProblems(page: Page, count: number): Promise<ReturnType<Page['getByRole']>> {
    const status = page.getByRole('button', { name: `${count.toLocaleString('en-US')} problems` });
    await expect(status).toBeVisible();
    await status.click();
    const panel = page.getByRole('region', { name: 'Problems' });
    await expect(panel).toBeVisible();
    return panel;
}

test('shows three distinct lint rules, hover guidance, and mouse and keyboard finding navigation', async ({ app }) => {
    const original = await readFile(
        join(app.repositoryDirectory, 'frontend', 'tests', 'fixtures', 'three-findings.md'),
        'utf8',
    );
    const page = await openDocument(app, 'three-findings.md', original);
    await lint(page).click();
    const panel = await openProblems(page, 3);
    const rows = panel.locator('[data-problem-row="true"]');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText('List bullet marker');
    await expect(rows.nth(1)).toContainText('Trailing whitespace');
    await expect(rows.nth(2)).toContainText('Missing fence language');
    await expect(rows.nth(0)).toContainText('Line 3');
    await expect(rows.nth(1)).toContainText('Line 5');
    await expect(rows.nth(2)).toContainText('Line 7');
    await expect(page.locator('.squiggly-warning')).toHaveCount(2);
    await expect(page.locator('.squiggly-error')).toHaveCount(1);

    const marker = page.locator('.squiggly-warning').first();
    const box = await marker.boundingBox();
    if (box === null) throw new Error('the lint marker has no screen position');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    const hover = page.locator('.monaco-hover:visible').filter({ hasText: 'Unordered list marker' });
    await expect(hover).toContainText('Warning');
    await expect(hover).toContainText('Use the preferred bullet marker for this item.');

    await rows.nth(0).click();
    await expect(page.locator('[data-editor-surface] textarea').first()).toBeFocused();
    await expect(page.getByRole('status', { name: 'Document status' })).toContainText('Ln 3, Col 1');
    await rows.nth(2).focus();
    await rows.nth(2).press('Enter');
    await expect(page.locator('[data-editor-surface] textarea').first()).toBeFocused();
    await expect(page.getByRole('status', { name: 'Document status' })).toContainText('Ln 7, Col 1');
    app.expectNoForeignRequests();
});

test('shows zero findings on clean text and retains stale findings after an edit', async ({ app }) => {
    const page = await openDocument(app, 'stale.md', '# Heading\n\n* bullet\n');
    await lint(page).click();
    const panel = await openProblems(page, 1);
    await expect(page.locator('.squiggly-warning')).toHaveCount(1);
    const editor = page.locator('[data-editor-surface] textarea').first();
    await editor.focus();
    await page.keyboard.insertText('X');
    await expect(page.getByRole('button', { name: /1 problems.*out of date/u })).toBeVisible();
    await expect(panel).toContainText('Results are out of date until Lint runs again');
    await expect(panel.locator('[data-problem-row="true"]')).toHaveCount(1);
    await expect(page.locator('.squiggly-warning')).toHaveCount(1);
    const modifier = await page.evaluate(() => (navigator.userAgent.includes('Macintosh') ? 'Meta' : 'Control'));
    await editor.press(`${modifier}+a`);
    await page.keyboard.insertText('# Clean\n');
    await expect.poll(() => activeText(page)).toBe('# Clean\n');
    await lint(page).click();
    await expect(page.getByRole('button', { name: '0 problems' })).toBeVisible();
    await expect(panel).toContainText('No problems');
    await expect(page.locator('.squiggly-warning, .squiggly-error')).toHaveCount(0);
    app.expectNoForeignRequests();
});

test('keeps Lint available for a read-only document with a lone carriage return', async ({ app }) => {
    const page = await openDocument(app, 'read-only.md', '# Read only\rA line\n');
    const toolbar = page.getByRole('toolbar', { name: 'Document toolbar' });
    for (const id of ['format', 'compact']) {
        const control = toolbar.locator(`[data-action-id="${id}"]`);
        await expect(control).toBeDisabled();
        await expect(control).toHaveAttribute('title', 'This document is read-only.');
    }
    await expect(lint(page)).toBeEnabled();
    await lint(page).click();
    await expect(page.getByRole('button', { name: /\d+ problems/u })).toBeVisible();
    app.expectNoForeignRequests();
});

test('clears the prior document summary on activation and publishes fresh clean findings', async ({ app }) => {
    const first = await app.writeDocument('first-lint.md', '# First\n\n* bullet\n');
    const second = await app.writeDocument('second-clean.md', '# Second\n');
    await app.seedRecents([first, second]);
    await app.launch();
    const { page } = app;
    await page
        .getByRole('tab', { name: /Untitled/u })
        .locator('..')
        .getByRole('button', { name: /^Close /u })
        .click();
    await page.getByTestId('document-launcher').getByRole('button', { name: 'first-lint.md' }).click();
    await expect(page.locator('[data-editor-surface] .view-lines')).toContainText('First');
    await lint(page).click();
    const panel = await openProblems(page, 1);
    await expect(panel.locator('[data-problem-row="true"]')).toHaveCount(1);

    await page.getByRole('button', { name: 'File', exact: true }).click();
    await page.getByRole('menu', { name: 'File' }).getByRole('menuitem', { name: 'second-clean.md' }).click();
    await expect(page.getByRole('tab', { name: 'second-clean.md' })).toBeVisible();
    await expect(page.locator('[data-editor-surface] .view-lines')).toContainText('Second');
    await expect(page.getByRole('button', { name: '1 problems' })).toHaveCount(0);
    await expect(panel).toContainText('Run Lint to check this document');
    await lint(page).click();
    await expect(page.getByRole('button', { name: '0 problems' })).toBeVisible();
    await expect(panel).toContainText('No problems');
    await page.getByRole('tab', { name: 'first-lint.md' }).click();
    await expect(page.locator('[data-editor-surface] .view-lines')).toContainText('First');
    await expect(
        page.getByRole('status', { name: 'Document status' }).getByRole('button', { name: /problems/u }),
    ).toHaveCount(0);
    await expect(panel).toContainText('Run Lint to check this document');
    app.expectNoForeignRequests();
});

for (const count of [1500, 12000] as const) {
    test(`shows the exact total and bounded rows when Lint finds ${count.toLocaleString('en-US')} issues`, async ({
        app,
    }) => {
        const source = `# Findings\n\n${'* item\n'.repeat(count)}`;
        const page = await openDocument(app, `findings-${count}.md`, source);
        await lint(page).click();
        const panel = await openProblems(page, count);
        await expect(panel.locator('[data-problem-row="true"]')).toHaveCount(Math.min(count, 10000));
        const visibleMarkers = await page.locator('.squiggly-warning').count();
        expect(visibleMarkers).toBeGreaterThan(0);
        expect(visibleMarkers).toBeLessThanOrEqual(1000);
        if (count === 1500) {
            await panel.locator('[data-problem-row="true"]').nth(999).click();
            await expect(page.getByRole('status', { name: 'Document status' })).toContainText('Ln 1002');
            await expect.poll(() => hasUnderlineAtCaret(page)).toBe(true);
            const markerBox = await page.evaluate(() => {
                const caret = document.querySelector('[data-editor-surface] .cursor')?.getBoundingClientRect();
                const marker = [...document.querySelectorAll('.squiggly-warning')]
                    .map((element) => element.getBoundingClientRect())
                    .find((rect) => caret !== undefined && Math.abs(rect.top - caret.top) < 1);
                return marker === undefined
                    ? null
                    : { x: marker.x, y: marker.y, width: marker.width, height: marker.height };
            });
            if (markerBox === null) throw new Error('the 1,000th underline has no screen position');
            await page.mouse.move(markerBox.x + markerBox.width / 2, markerBox.y + markerBox.height / 2);
            await expect(page.locator('.monaco-hover:visible')).toContainText('Unordered list marker differs');
            await panel.locator('[data-problem-row="true"]').nth(1000).click();
            await expect(page.getByRole('status', { name: 'Document status' })).toContainText('Ln 1003');
            await expect.poll(() => hasUnderlineAtCaret(page)).toBe(false);
        }
        if (count === 12000) {
            await expect(panel).toContainText('2,000 more not shown');
            await page.setViewportSize({ width: 375, height: 720 });
            const status = page.getByRole('button', { name: '12,000 problems' });
            await expect(status).toBeVisible();
            const statusBox = await status.boundingBox();
            expect(statusBox).not.toBeNull();
            expect(statusBox!.x).toBeGreaterThanOrEqual(0);
            expect(statusBox!.x + statusBox!.width).toBeLessThanOrEqual(375);
            await expect(panel.locator('[data-problem-row="true"]')).toHaveCount(10000);
            const editor = page.locator('[data-editor-surface] textarea').first();
            await editor.focus();
            await page.keyboard.insertText('X');
            await expect(page.getByRole('button', { name: /12,000 problems.*out of date/u })).toBeVisible();
            const details = page.getByRole('button', { name: 'Document details' });
            const detailsBox = await details.boundingBox();
            expect(detailsBox).not.toBeNull();
            expect(detailsBox!.x).toBeGreaterThanOrEqual(0);
            expect(detailsBox!.x + detailsBox!.width).toBeLessThanOrEqual(375);
            await details.focus();
            await details.press('Enter');
            const detailCount = page.locator('[data-status-detail="problems"]');
            await expect(detailCount).toBeVisible();
            await expect(detailCount).toContainText('12,000 · out of date');
            await detailCount.getByRole('button').press('Enter');
            await expect(panel).toHaveCount(0);
        }
        app.expectNoForeignRequests();
    });
}
