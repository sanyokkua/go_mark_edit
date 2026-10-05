import type { Page } from '@playwright/test';
import { cp, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';

import { expect, test } from '../support/harness';
import { createCommandRecorder } from '../support/commandRecorder';

interface PreviewState {
    data?: {
        activeBuffer?: {
            content?: string;
            documentId?: string;
        } | null;
        snapshot?: {
            activeDocumentId?: string | null;
        };
    };
}

async function getState(page: Page): Promise<PreviewState> {
    return page.evaluate(async () => {
        const root = globalThis as unknown as {
            go?: {
                appmodel?: {
                    AppModelHandler?: {
                        GetState?: (request: { id: string }) => Promise<unknown>;
                    };
                };
            };
        };
        const getState = root.go?.appmodel?.AppModelHandler?.GetState;
        if (getState === undefined) {
            throw new Error('the generated AppModelHandler.GetState binding is absent');
        }
        return (await getState({ id: crypto.randomUUID() })) as PreviewState;
    });
}

async function clickWithoutNavigation(
    page: Page,
    link: ReturnType<Page['getByRole']>,
    originalUrl: string,
): Promise<void> {
    await expect(link).toBeVisible();
    await link.click();
    await expect.poll(() => page.url()).toBe(originalUrl);
}

async function expectOneAutoDismissingWarning(page: Page, target: string, reason: string): Promise<void> {
    const warnings = page.locator('[data-notification-code="preview-link-refused"]');
    const warning = warnings.filter({ hasText: target });

    await expect(warning).toHaveCount(1);
    await expect(warning).toContainText(reason);
    await expect(warnings).toHaveCount(1);
    await expect(warning).toHaveCount(0, { timeout: 10_000 });
}

test('case 1 keeps preview link activation in the app session', async ({ app }) => {
    const outsidePath = join(app.tempDirectory, 'outside.md');
    const sourcePath = await app.writeDocument('D/a.md', '# placeholder');
    await app.writeDocument('D/next.md', '# sibling');
    await writeFile(outsidePath, '# outside', 'utf8');

    const outsideHref = relativeHref(sourcePath, outsidePath);
    const sourceContent = [
        '# Preview links',
        '[top](#top)',
        '[self](./a.md#top)',
        '[next](./next.md)',
        `[out](${outsideHref})`,
        '[web](https://example.com/docs)',
        '[mail](mailto:x@y)',
        '[file](file:///etc/hosts)',
        '[ftp](ftp://example.test/a.md)',
        '[tel](tel:+1234)',
        '[custom](custom:a.md)',
        '[script](javascript:alert%281%29)',
        '[payload](data:text/plain,hi)',
        '',
        ...Array.from({ length: 80 }, (_, index) => [`filler line ${index + 1}`, '']).flat(),
        '',
        '## top',
        'anchor target',
    ].join('\n');
    await writeFile(sourcePath, sourceContent, 'utf8');

    await app.seedRecents([sourcePath]);
    await app.launch();

    const { page } = app;
    const originalUrl = page.url();
    const recorder = await recordLinkBridge(page);
    const initialTab = page.getByRole('tab', { name: 'Untitled' });
    await initialTab
        .locator('..')
        .getByRole('button', { name: /^Close /u })
        .click();

    const launcher = page.getByTestId('document-launcher');
    await expect(launcher).toBeVisible();
    await launcher.getByRole('button', { name: 'a.md' }).click();
    await expect(page.getByRole('tab', { name: 'a.md' })).toBeVisible();

    const arrangement = page.getByRole('radiogroup', {
        name: 'View arrangement',
    });
    await arrangement.getByRole('radio', { name: 'Preview' }).click();
    await expect(page.getByRole('link', { name: 'top' })).toBeVisible();

    await page.evaluate(() => {
        const root = globalThis as unknown as {
            runtime?: {
                BrowserOpenURL?: (url: string) => void;
            };
            __previewBrowserUrls?: string[];
        };
        const urls: string[] = [];
        if (root.runtime === undefined) {
            throw new Error('the Wails runtime object is absent');
        }
        root.runtime.BrowserOpenURL = (url: string): void => {
            urls.push(url);
        };
        root.__previewBrowserUrls = urls;
    });

    const sourceState = await getState(page);
    expect(sourceState.data?.activeBuffer?.content).toBe(sourceContent);
    expect(sourceState.data?.snapshot?.activeDocumentId).toBe(sourceState.data?.activeBuffer?.documentId);

    const previewScroll = page.locator('section[aria-label="Preview pane"] > div');
    const scrollBeforeAnchor = await previewScroll.evaluate((element) => (element as HTMLElement).scrollTop);
    await clickWithoutNavigation(page, page.getByRole('link', { name: 'top' }), originalUrl);
    await expect
        .poll(() => previewScroll.evaluate((element) => (element as HTMLElement).scrollTop))
        .toBeGreaterThan(scrollBeforeAnchor);
    await expect(page.locator('#top')).toBeVisible();
    await clickWithoutNavigation(page, page.getByRole('link', { name: 'self' }), originalUrl);
    await arrangement.getByRole('radio', { name: 'Split' }).click();
    await expect(page.locator('[data-editor-surface] .view-line').filter({ hasText: '## top' })).toBeVisible();
    await arrangement.getByRole('radio', { name: 'Preview' }).click();

    await clickWithoutNavigation(page, page.getByRole('link', { name: 'web' }), originalUrl);
    await expect
        .poll(() =>
            page.evaluate(
                () => (globalThis as unknown as { __previewBrowserUrls?: string[] }).__previewBrowserUrls ?? [],
            ),
        )
        .toEqual(['https://example.com/docs']);

    const tabCountBeforeOutside = await page.getByRole('tab').count();
    await clickWithoutNavigation(page, page.getByRole('link', { name: 'out' }), originalUrl);
    await expect(page.getByRole('tab', { name: 'outside.md' })).toBeVisible();
    await expect(page.getByRole('tab')).toHaveCount(tabCountBeforeOutside + 1);
    await expect.poll(() => getState(page).then((state) => state.data?.activeBuffer?.content)).toBe('# outside');
    await page.getByRole('tab', { name: 'a.md' }).click();
    await expect(page.getByRole('link', { name: 'mail' })).toBeVisible();
    const tabCountBeforeRefusals = await page.getByRole('tab').count();

    await clickWithoutNavigation(page, page.getByRole('link', { name: 'mail' }), originalUrl);
    await expectOneAutoDismissingWarning(page, 'mailto:x@y', 'Only local documents and http(s) links are allowed');
    await expect(page.getByRole('tab')).toHaveCount(tabCountBeforeRefusals);

    await clickWithoutNavigation(page, page.getByRole('link', { name: 'file' }), originalUrl);
    await expectOneAutoDismissingWarning(
        page,
        'file:///etc/hosts',
        'Only local documents and http(s) links are allowed',
    );
    await expect(page.getByRole('tab')).toHaveCount(tabCountBeforeRefusals);
    await expect((await getState(page)).data?.activeBuffer?.content).toBe(sourceContent);

    const openCallsBeforeSchemes = recorder.calls.filter((call) => call.name === 'OpenPreviewLink').length;
    for (const [label, target] of [
        ['ftp', 'ftp://example.test/a.md'],
        ['custom', 'custom:a.md'],
        ['script', 'javascript:alert%281%29'],
        ['payload', 'data:text/plain,hi'],
    ]) {
        const link = page.getByRole('link', { name: label });
        await clickWithoutNavigation(page, link, originalUrl);
        await expectOneAutoDismissingWarning(page, target, 'Only local documents and http(s) links are allowed');
    }
    const telephone = page.getByRole('link', { name: 'tel' });
    await expect(telephone).toHaveAttribute('href', '#');
    await telephone.focus();
    await telephone.press('Enter');
    await expect.poll(() => page.url()).toBe(originalUrl);
    await expectOneAutoDismissingWarning(page, 'tel:+1234', 'Only local documents and http(s) links are allowed');
    expect(recorder.calls.filter((call) => call.name === 'OpenPreviewLink')).toHaveLength(openCallsBeforeSchemes);
    await expect(page.getByRole('tab')).toHaveCount(tabCountBeforeRefusals);
    await expect
        .poll(() =>
            page.evaluate(
                () => (globalThis as unknown as { __previewBrowserUrls?: string[] }).__previewBrowserUrls ?? [],
            ),
        )
        .toEqual(['https://example.com/docs']);
    app.expectNoForeignRequests();

    await clickWithoutNavigation(page, page.getByRole('link', { name: 'next' }), originalUrl);
    await expect(page.getByRole('tab', { name: 'next.md' })).toBeVisible();

    await page.getByRole('button', { name: 'New tab' }).click();
    await expect(page.getByRole('tab', { name: 'Untitled' })).toBeVisible();
    await arrangement.getByRole('radio', { name: 'Editor' }).click();

    const editorInput = page.locator('[data-editor-surface] textarea').first();
    await expect(editorInput).toBeVisible();
    await editorInput.focus();
    await editorInput.press('ControlOrMeta+A');
    await page.keyboard.insertText('[rel](./next.md)');
    await expect.poll(() => getState(page).then((state) => state.data?.activeBuffer?.content)).toBe('[rel](./next.md)');

    await arrangement.getByRole('radio', { name: 'Preview' }).click();
    await clickWithoutNavigation(page, page.getByRole('link', { name: 'rel' }), originalUrl);
    await expectOneAutoDismissingWarning(page, './next.md', 'Relative links need a saved document');
    await expect(page.getByRole('tab')).toHaveCount(tabCountBeforeRefusals + 2);
    await expect((await getState(page)).data?.activeBuffer?.content).toBe('[rel](./next.md)');
});

function relativeHref(fromPath: string, toPath: string): string {
    return relative(dirname(fromPath), toPath).replaceAll('\\', '/');
}

async function recordLinkBridge(page: Page): Promise<ReturnType<typeof createCommandRecorder>> {
    const recorder = createCommandRecorder();
    await page.exposeFunction(
        '__recordLinkBridgeCommand',
        (name: string, request: { id: string }, ...args: unknown[]): void => {
            void recorder.binding(name, args.length)(request, ...args);
        },
    );
    await page.evaluate(() => {
        const root = window as unknown as {
            go: {
                appmodel: {
                    AppModelHandler: {
                        OpenPreviewLink: (
                            request: { id: string },
                            documentId: string,
                            href: string,
                        ) => Promise<unknown>;
                        RevealWorkspacePath: (request: { id: string }, path: string) => Promise<unknown>;
                    };
                };
            };
            __recordLinkBridgeCommand: (name: string, request: { id: string }, ...args: unknown[]) => void;
        };
        const binding = root.go.appmodel.AppModelHandler;
        const originalOpen = binding.OpenPreviewLink;
        const originalReveal = binding.RevealWorkspacePath;
        binding.OpenPreviewLink = (request, documentId, href): Promise<unknown> => {
            root.__recordLinkBridgeCommand('OpenPreviewLink', request, documentId, href);
            return originalOpen(request, documentId, href);
        };
        binding.RevealWorkspacePath = (request, path): Promise<unknown> => {
            root.__recordLinkBridgeCommand('RevealWorkspacePath', request, path);
            return originalReveal(request, path);
        };
    });
    return recorder;
}

async function expectActiveDocument(page: Page, name: string, heading: string): Promise<void> {
    await expect(page.getByRole('tab', { name })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[data-editor-surface] .view-lines')).toContainText(heading);
    await expect(page.locator('section[aria-label="Preview pane"]')).toContainText(heading);
    await expect.poll(() => getState(page).then((state) => state.data?.activeBuffer?.content)).toContain(heading);
}

async function expectRowInTreeViewport(page: Page, name: string): Promise<void> {
    const row = page.getByRole('treeitem', { name, exact: true });
    await expect(row).toBeVisible();
    await expect(row).toHaveAttribute('aria-selected', 'true');
    await expect(row).toBeInViewport({ ratio: 0.8 });
}

async function disableAutosave(page: Page): Promise<void> {
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const menu = page.getByRole('menu', { name: 'Settings menu' });
    const autosave = menu.getByRole('checkbox', { name: 'Autosave' });
    if (await autosave.isChecked()) await menu.locator('[data-settings-toggle="Autosave"]').click();
    await page.keyboard.press('Escape');
    await expect(menu).not.toBeVisible();
}

async function clickEditorText(
    page: Page,
    lineText: string,
    text: string,
    modifier = false,
    linked = true,
): Promise<void> {
    const line = page.locator('[data-editor-surface] .view-line').filter({ hasText: lineText });
    await expect(line).toBeVisible();
    if (modifier && linked) await expect(line.locator('.detected-link').first()).toBeVisible();
    if (modifier && !linked) await expect(line.locator('.detected-link')).toHaveCount(0);
    let point!: { x: number; y: number };
    await expect
        .poll(async () => {
            const candidate = await line.evaluate((element, needle) => {
                if (!element.isConnected) return null;
                const source = element.textContent ?? '';
                const start = source.indexOf(needle);
                if (start < 0) throw new Error(`Editor text not found: ${needle}`);
                const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
                let node = walker.nextNode();
                let offset = 0;
                let first: Text | null = null;
                let last: Text | null = null;
                let firstOffset = 0;
                let lastOffset = 0;
                while (node !== null) {
                    const length = node.textContent?.length ?? 0;
                    if (first === null && start < offset + length) {
                        first = node as Text;
                        firstOffset = start - offset;
                    }
                    if (start + needle.length <= offset + length) {
                        last = node as Text;
                        lastOffset = start + needle.length - offset;
                        break;
                    }
                    offset += length;
                    node = walker.nextNode();
                }
                if (first === null || last === null) throw new Error(`Editor range not found: ${needle}`);
                const range = document.createRange();
                range.setStart(first, firstOffset);
                range.setEnd(last, lastOffset);
                const rect = range.getBoundingClientRect();
                const lineRect = element.getBoundingClientRect();
                if (rect.width === 0 || rect.height === 0 || lineRect.width === 0 || lineRect.height === 0) return null;
                return {
                    x: rect.left - lineRect.left + rect.width / 2,
                    y: rect.top - lineRect.top + rect.height / 2,
                };
            }, text);
            if (candidate === null) return false;
            point = candidate;
            return true;
        })
        .toBe(true);
    const key = await page.evaluate((): 'Meta' | 'Control' =>
        navigator.userAgent.includes('Macintosh') ? 'Meta' : 'Control',
    );
    await line.click({ position: point, modifiers: modifier ? [key] : [] });
}

test('editor links follow the preview path only when clicked with the platform modifier', async ({ app }) => {
    const fixtureRoot = join(app.repositoryDirectory, 'frontend/tests/fixtures/link-tree');
    const root = join(app.documentDirectory, 'link-tree');
    await cp(fixtureRoot, root, { recursive: true });
    const source = join(root, 'docs/a.md');
    await writeFile(
        source,
        (await readFile(source, 'utf8')).replace(
            '[web](https://example.com/docs)',
            '[web](https://example.com/docs)\n[ftp](ftp://example.test/a.md)\n[custom](custom:a.md)',
        ),
    );
    await app.seedRecents([source]);
    await app.launch();
    const { page } = app;
    const recorder = await recordLinkBridge(page);
    await page
        .getByRole('tab', { name: 'Untitled' })
        .locator('..')
        .getByRole('button', { name: /^Close /u })
        .click();
    await page.getByTestId('document-launcher').getByRole('button', { name: 'a.md' }).click();
    await page.getByRole('radiogroup', { name: 'View arrangement' }).getByRole('radio', { name: 'Editor' }).click();

    const browserUrls: string[] = [];
    await page.exposeFunction('__recordEditorBrowserUrl', (url: string): void => {
        browserUrls.push(url);
    });
    await page.evaluate(() => {
        const root = window as unknown as {
            runtime: { BrowserOpenURL: (url: string) => void };
            __recordEditorBrowserUrl: (url: string) => void;
        };
        root.runtime.BrowserOpenURL = (url): void => root.__recordEditorBrowserUrl(url);
    });

    const beforePlain = recorder.calls.filter((call) => call.name === 'OpenPreviewLink').length;
    await clickEditorText(page, '[sibling](sub/b.md)', 'sibling');
    await expect(page.locator('[data-status-item="cursor"]')).toContainText('Ln 3, Col');
    expect(recorder.calls.filter((call) => call.name === 'OpenPreviewLink')).toHaveLength(beforePlain);
    await expect(page.getByRole('tab', { name: 'a.md' })).toHaveAttribute('aria-selected', 'true');

    const siblingLink = page
        .locator('[data-editor-surface] .view-line')
        .filter({ hasText: '[sibling](sub/b.md)' })
        .locator('.detected-link')
        .first();
    await siblingLink.hover();
    const hoverAction = page.locator('.monaco-hover:visible a').filter({ hasText: 'Follow link' });
    await expect(hoverAction).toBeVisible();
    await expect(hoverAction).toHaveAttribute(
        'data-href',
        /^https:\/\/editor-link\.gomarkedit\.invalid\/\d+\/\d+\/\d+$/u,
    );
    await hoverAction.click();
    await expect(page.getByRole('tab', { name: 'b.md' })).toHaveAttribute('aria-selected', 'true');
    const hoverOpenCalls = recorder.calls.filter((call) => call.name === 'OpenPreviewLink');
    expect(hoverOpenCalls).toHaveLength(beforePlain + 1);
    expect(hoverOpenCalls.at(-1)?.args[1]).toBe('sub/b.md');
    await page.getByRole('tab', { name: 'a.md' }).click();

    await clickEditorText(page, '[sibling](sub/b.md)', 'sibling', true);
    await expect(page.getByRole('tab', { name: 'b.md' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[data-editor-surface] .view-lines')).toContainText('Sibling document');
    await expect
        .poll(() => getState(page).then((state) => state.data?.activeBuffer?.content))
        .toContain('Sibling document');
    await page.getByRole('tab', { name: 'a.md' }).click();
    await clickEditorText(page, '[sibling](sub/b.md)', 'sub/b.md', true);
    await expect(page.getByRole('tab', { name: 'b.md' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tab', { name: 'b.md' })).toHaveCount(1);

    await page.getByRole('tab', { name: 'a.md' }).click();
    await clickEditorText(page, '[web](https://example.com/docs)', 'web', true);
    await expect.poll(() => browserUrls).toEqual(['https://example.com/docs']);
    await expect(page.getByRole('tab', { name: 'a.md' })).toHaveAttribute('aria-selected', 'true');

    await clickEditorText(page, '`https://example.org/inline-code`', 'https://example.org/inline-code', true, false);
    await clickEditorText(page, 'https://example.org/fenced-code', 'https://example.org/fenced-code', true, false);
    expect(browserUrls).toEqual(['https://example.com/docs']);
    await expect(page.getByRole('tab', { name: 'a.md' })).toHaveAttribute('aria-selected', 'true');

    const openCallsBeforeSchemes = recorder.calls.filter((call) => call.name === 'OpenPreviewLink').length;
    for (const [label, target] of [
        ['ftp', 'ftp://example.test/a.md'],
        ['custom', 'custom:a.md'],
    ]) {
        await clickEditorText(page, `[${label}](${target})`, label, true);
        await expectOneAutoDismissingWarning(page, target, 'Only local documents and http(s) links are allowed');
        expect(recorder.calls.filter((call) => call.name === 'OpenPreviewLink')).toHaveLength(openCallsBeforeSchemes);
        await expect(page.getByRole('tab', { name: 'a.md' })).toHaveAttribute('aria-selected', 'true');
        await page.keyboard.press('Escape');
    }
    expect(browserUrls).toEqual(['https://example.com/docs']);
    app.expectNoForeignRequests();

    await clickEditorText(page, '[heading](sub/b.md#setup)', 'heading', true);
    await expect(page.getByRole('tab', { name: 'b.md' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[data-editor-surface] .view-line').filter({ hasText: '## Setup' })).toBeVisible();
    await expect(page.locator('[data-status-item="cursor"]')).toContainText('Ln 105, Col 1');
    await expect.poll(() => getState(page).then((state) => state.data?.activeBuffer?.content)).toContain('## Setup');
    app.expectNoForeignRequests();
});

test('preview links activate and reveal documents in and outside the folder', async ({ app }) => {
    const fixtureRoot = join(app.repositoryDirectory, 'frontend/tests/fixtures/link-tree');
    const root = join(app.documentDirectory, 'link-tree');
    await cp(fixtureRoot, root, { recursive: true });
    const outside = join(app.documentDirectory, 'link-outside.md');
    await writeFile(
        outside,
        await readFile(join(app.repositoryDirectory, 'frontend/tests/fixtures/link-outside.md'), 'utf8'),
    );
    const source = join(root, 'docs/a.md');
    const savedSource = await readFile(source, 'utf8');
    for (let index = 1; index <= 12; index += 1) {
        await app.writeDocument(`link-tree/docs/sub/a-${String(index).padStart(2, '0')}.md`, `# Earlier ${index}\n`);
    }
    await app.seedRecents([source]);
    await app.launch();
    const { page } = app;
    const originalUrl = page.url();
    const recorder = await recordLinkBridge(page);
    await disableAutosave(page);
    await page
        .getByRole('tab', { name: 'Untitled' })
        .locator('..')
        .getByRole('button', { name: /^Close /u })
        .click();
    await page.getByTestId('document-launcher').getByRole('button', { name: 'a.md' }).click();
    await app.openWorkspace(root);
    await page.getByRole('treeitem', { name: 'docs', exact: true }).click({ position: { x: 4, y: 10 } });
    await expect(page.getByRole('treeitem', { name: 'sub', exact: true })).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('treeitem', { name: 'b.md' })).toHaveCount(0);
    const treeScrollport = page.getByRole('tree').locator('..');
    await treeScrollport.evaluate((element) => {
        const scrollport = element as HTMLElement;
        scrollport.style.height = '128px';
        scrollport.style.flex = 'none';
        scrollport.scrollTop = 0;
    });
    const arrangement = page.getByRole('radiogroup', { name: 'View arrangement' });
    await arrangement.getByRole('radio', { name: 'Split' }).click();
    await expectActiveDocument(page, 'a.md', 'Link journeys');

    const editor = page.locator('[data-editor-surface] textarea').first();
    await editor.focus();
    await editor.press('ControlOrMeta+End');
    await page.keyboard.insertText('\nUnsaved source edit.');
    await expect(page.locator('[data-editor-surface] .view-lines')).toContainText('Unsaved source edit.');
    await expect(page.getByRole('treeitem', { name: 'a.md' })).toHaveAttribute('aria-description', /Unsaved changes/u);
    expect(await readFile(source, 'utf8')).toBe(savedSource);
    await clickWithoutNavigation(page, page.getByRole('link', { name: 'sibling' }), originalUrl);
    await expectActiveDocument(page, 'b.md', 'Sibling document');
    await expect(page.getByRole('treeitem', { name: 'sub', exact: true })).toHaveAttribute('aria-expanded', 'true');
    await expectRowInTreeViewport(page, 'b.md');
    await expect.poll(() => treeScrollport.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    expect(await readFile(source, 'utf8')).toBe(savedSource);
    await page.getByRole('tab', { name: 'a.md' }).click();
    await expect(page.getByRole('tab', { name: 'a.md' })).toHaveAttribute('aria-selected', 'true');
    await expect
        .poll(() => getState(page).then((state) => state.data?.activeBuffer?.content))
        .toContain('Unsaved source edit.');
    await expect(page.locator('[data-editor-surface] .view-lines')).toContainText('Unsaved source edit.');
    await clickWithoutNavigation(page, page.getByRole('link', { name: 'sibling' }), originalUrl);
    await expectActiveDocument(page, 'b.md', 'Sibling document');
    await expect(page.getByRole('tab', { name: 'b.md' })).toHaveCount(1);
    await expectRowInTreeViewport(page, 'b.md');

    await page.getByRole('tab', { name: 'a.md' }).click();
    await clickWithoutNavigation(page, page.getByRole('link', { name: 'heading' }), originalUrl);
    await expect(page.getByRole('tab', { name: 'b.md' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('section[aria-label="Preview pane"]')).toContainText('Sibling document');
    await expect
        .poll(() => getState(page).then((state) => state.data?.activeBuffer?.content))
        .toContain('Sibling document');
    await expect(page.locator('section[aria-label="Preview pane"] #setup')).toBeInViewport();
    await expect
        .poll(() => page.locator('section[aria-label="Preview pane"] > div').evaluate((element) => element.scrollTop))
        .toBeGreaterThan(0);
    await expect(page.locator('[data-editor-surface] .view-lines').filter({ hasText: '## Setup' })).toBeVisible();

    await page.getByRole('tab', { name: 'a.md' }).click();
    await clickWithoutNavigation(page, page.getByRole('link', { name: 'parent' }), originalUrl);
    await expectActiveDocument(page, 'c.md', 'Parent document');
    await expectRowInTreeViewport(page, 'c.md');
    await page.getByRole('tab', { name: 'a.md' }).click();
    await expect(page.getByRole('treeitem', { name: 'a.md' })).toHaveAttribute('aria-selected', 'true');
    const selectedBeforeOutside = await page.getByRole('treeitem', { selected: true }).getAttribute('aria-label');
    await clickWithoutNavigation(page, page.getByRole('link', { name: 'outside' }), originalUrl);
    await expectActiveDocument(page, 'link-outside.md', 'Outside document');
    await expect(page.getByRole('treeitem', { selected: true })).toHaveAttribute(
        'aria-label',
        selectedBeforeOutside ?? '',
    );
    await page.getByRole('tab', { name: 'a.md' }).click();
    await expect(page.getByRole('treeitem', { name: 'a.md' })).toHaveAttribute('aria-selected', 'true');
    const selectedBeforeHidden = await page.getByRole('treeitem', { selected: true }).getAttribute('aria-label');
    await clickWithoutNavigation(page, page.getByRole('link', { name: 'hidden' }), originalUrl);
    await expectActiveDocument(page, 'd.md', 'Hidden document');
    await expect(page.getByRole('treeitem', { name: '.hidden' })).toHaveCount(0);
    await expect(page.getByRole('treeitem', { selected: true })).toHaveAttribute(
        'aria-label',
        selectedBeforeHidden ?? '',
    );
    await expect(page.getByRole('status').filter({ hasText: /tree|folder/u })).toHaveCount(0);

    await page.getByRole('tab', { name: 'a.md' }).click();
    await clickWithoutNavigation(page, page.getByRole('link', { name: 'encoded' }), originalUrl);
    await expectActiveDocument(page, 'My Notes.md', 'Encoded document');
    await page.getByRole('tab', { name: 'a.md' }).click();
    await clickWithoutNavigation(page, page.getByRole('link', { name: 'angle' }), originalUrl);
    await expectActiveDocument(page, 'My Notes.md', 'Encoded document');
    await expect(page.getByRole('tab', { name: 'My Notes.md' })).toHaveCount(1);

    await page.getByRole('tab', { name: 'a.md' }).click();
    await expectActiveDocument(page, 'a.md', 'Link journeys');
    const beforeUnsupported = await page.getByRole('tab').count();
    await clickWithoutNavigation(page, page.getByRole('link', { name: 'unsupported' }), originalUrl);
    const unsupported = page.locator('[data-notification-code="link-unsupported-file"]');
    await expect(unsupported).toContainText('report.pdf');
    await expect(unsupported).toContainText('This file is not a document the editor can open.');
    await expect(page.getByRole('tab')).toHaveCount(beforeUnsupported);
    await unsupported.getByRole('button', { name: 'Reveal in file manager' }).click();
    await expect.poll(() => recorder.calls.filter((call) => call.name === 'RevealWorkspacePath').length).toBe(1);
    expect(recorder.calls.find((call) => call.name === 'RevealWorkspacePath')?.args).toEqual([
        await realpath(join(root, 'report.pdf')),
    ]);

    await clickWithoutNavigation(page, page.getByRole('link', { name: 'missing' }), originalUrl);
    await expect(page.locator('[data-notification-code="not_found"]')).toContainText('missing.md');
    await expect(page.getByRole('tab')).toHaveCount(beforeUnsupported);
    const openCallsBeforeNetwork = recorder.calls.filter((call) => call.name === 'OpenPreviewLink').length;
    await clickWithoutNavigation(page, page.getByRole('link', { name: 'network' }), originalUrl);
    await expectOneAutoDismissingWarning(page, '//server/share/notes.md', 'Network and device paths cannot be opened.');
    expect(recorder.calls.filter((call) => call.name === 'OpenPreviewLink')).toHaveLength(openCallsBeforeNetwork);
    await expect(page.getByRole('tab', { name: 'a.md' })).toHaveAttribute('aria-selected', 'true');
    app.expectNoForeignRequests();
});

test('local preview links open tabs when no folder is open', async ({ app }) => {
    const root = join(app.documentDirectory, 'link-tree');
    await cp(join(app.repositoryDirectory, 'frontend/tests/fixtures/link-tree'), root, { recursive: true });
    await writeFile(
        join(app.documentDirectory, 'link-outside.md'),
        await readFile(join(app.repositoryDirectory, 'frontend/tests/fixtures/link-outside.md'), 'utf8'),
    );
    await app.seedRecents([join(root, 'docs/a.md')]);
    await app.launch();
    const { page } = app;
    await page
        .getByRole('tab', { name: 'Untitled' })
        .locator('..')
        .getByRole('button', { name: /^Close /u })
        .click();
    await page.getByTestId('document-launcher').getByRole('button', { name: 'a.md' }).click();
    await page.getByRole('radiogroup', { name: 'View arrangement' }).getByRole('radio', { name: 'Split' }).click();
    await expect(page.getByText('No folder open')).toBeVisible();
    await clickWithoutNavigation(page, page.getByRole('link', { name: 'sibling' }), page.url());
    await expectActiveDocument(page, 'b.md', 'Sibling document');
    await page.getByRole('tab', { name: 'a.md' }).click();
    await clickWithoutNavigation(page, page.getByRole('link', { name: 'outside' }), page.url());
    await expectActiveDocument(page, 'link-outside.md', 'Outside document');
    await expect(page.getByText('No folder open')).toBeVisible();
    app.expectNoForeignRequests();
});

test('a preview link to a forty-first document shows the open-capacity notice', async ({ app }) => {
    const source = await app.writeDocument('capacity/source.md', '# Capacity source\n\n[extra](extra.md)\n');
    await app.writeDocument('capacity/extra.md', '# Forty-first document\n');
    for (let index = 1; index < 40; index += 1) {
        await app.writeDocument(`capacity/open-${String(index).padStart(2, '0')}.md`, `# Open ${index}\n`);
    }
    await app.seedRecents([source]);
    await app.launch();
    const { page } = app;
    await page
        .getByRole('tab', { name: 'Untitled' })
        .locator('..')
        .getByRole('button', { name: /^Close /u })
        .click();
    await page.getByTestId('document-launcher').getByRole('button', { name: 'source.md' }).click();
    await app.openWorkspace(dirname(source));
    for (let index = 1; index < 40; index += 1) {
        const name = `open-${String(index).padStart(2, '0')}.md`;
        await page.getByRole('treeitem', { name, exact: true }).click();
        await expect(page.getByRole('tab', { name })).toHaveAttribute('aria-selected', 'true');
        await expect
            .poll(() => getState(page).then((state) => state.data?.activeBuffer?.content))
            .toContain(`# Open ${index}`);
    }
    await expect(page.getByRole('tab')).toHaveCount(40);
    await page.getByRole('tab', { name: 'source.md' }).click();
    await page.getByRole('radiogroup', { name: 'View arrangement' }).getByRole('radio', { name: 'Preview' }).click();
    await clickWithoutNavigation(page, page.getByRole('link', { name: 'extra' }), page.url());
    await expect(page.getByRole('tab', { name: 'extra.md' })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'source.md' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tab')).toHaveCount(40);
    await expect(page.locator('[data-notification-code="capacity-limit"]')).toContainText('extra.md');
    app.expectNoForeignRequests();
});
