import { join } from 'node:path';
import type { Page } from '@playwright/test';

import { expect, test, type E2EAppHarness } from '../support/harness';

const SHELL = '[data-testid="application-shell"]';
const TOGGLE = 'ControlOrMeta+\\';

async function expectSidebar(page: Page, shown: boolean): Promise<void> {
    await expect(page.locator(SHELL)).toHaveAttribute('data-workspace-visible', String(shown));
}

async function folderWithNote(app: E2EAppHarness, name: string): Promise<string> {
    await app.writeDocument(`${name}/${name}-note.md`, `# ${name}\n`);
    return join(app.documentDirectory, name);
}

async function setSidebarWidth(page: Page, width: number): Promise<void> {
    await page.evaluate(async (value): Promise<void> => {
        const root = window as unknown as {
            go: {
                appmodel: {
                    AppModelHandler: {
                        SetUILayout: (request: { id: string }, layout: { sidebarWidth: number }) => Promise<unknown>;
                    };
                };
            };
        };
        await root.go.appmodel.AppModelHandler.SetUILayout({ id: crypto.randomUUID() }, { sidebarWidth: value });
    }, width);
}

test('starts with no sidebar when launched from the icon', async ({ app }) => {
    await app.launch();
    await expectSidebar(app.page, false);
    await expect(app.page.getByTestId('document-launcher')).toBeVisible();
});

test('starts with no sidebar when launched with a file argument', async ({ app }) => {
    const file = await app.writeDocument('start.md', '# Start\n');
    await app.launch([file]);
    await expect(app.page.getByRole('tab', { name: 'start.md' })).toBeVisible();
    await expectSidebar(app.page, false);
});

test('opening a folder shows the tree, and Ctrl+Backslash with no folder explains the empty sidebar', async ({
    app,
}) => {
    const root = await folderWithNote(app, 'shown');
    await app.launch();
    const { page } = app;
    await expect(page.getByTestId('document-launcher')).toBeVisible();
    await page.keyboard.press(TOGGLE);
    await expectSidebar(page, true);
    await expect(page.getByText('No folder open')).toBeVisible();
    await page.keyboard.press(TOGGLE);
    await expectSidebar(page, false);

    await app.openWorkspace(root);
    await expectSidebar(page, true);
    await expect(page.getByRole('treeitem', { name: 'shown-note.md', exact: true })).toBeVisible();
});

test('a hidden sidebar is shown again by replacing the folder or re-opening the same folder', async ({ app }) => {
    const first = await folderWithNote(app, 'first');
    const second = await folderWithNote(app, 'second');
    await app.seedRecents([
        { path: first, kind: 'folder' },
        { path: second, kind: 'folder' },
    ]);
    await app.launch();
    const { page } = app;
    const launcher = page.getByTestId('document-launcher');
    await launcher.getByRole('button', { name: 'first', exact: true }).click();
    await expectSidebar(page, true);
    await expect(page.getByRole('treeitem', { name: 'first-note.md', exact: true })).toBeVisible();

    await page.keyboard.press(TOGGLE);
    await expectSidebar(page, false);
    await launcher.getByRole('button', { name: 'second', exact: true }).first().click();
    await page.getByRole('button', { name: 'Replace Folder' }).click();
    await expectSidebar(page, true);
    await expect(page.getByRole('treeitem', { name: 'second-note.md', exact: true })).toBeVisible();

    await page.keyboard.press(TOGGLE);
    await expectSidebar(page, false);
    await launcher.getByRole('button', { name: 'second', exact: true }).first().click();
    await expect(page.getByText('Open another folder?')).toHaveCount(0);
    await expectSidebar(page, true);
    await expect(page.getByRole('treeitem', { name: 'second-note.md', exact: true })).toBeVisible();
});

test('re-opening the shown folder from the launcher keeps the tabs and shows the sidebar without a prompt', async ({
    app,
}) => {
    const root = await folderWithNote(app, 'again');
    await app.seedRecents([{ path: root, kind: 'folder' }]);
    await app.launch();
    const { page } = app;
    await app.openWorkspace(root);
    await page.getByRole('treeitem', { name: 'again-note.md', exact: true }).click();
    await expect(page.getByRole('tab', { name: 'again-note.md' })).toBeVisible();
    await page.keyboard.press(TOGGLE);
    await expectSidebar(page, false);

    await page.getByRole('button', { name: 'File', exact: true }).click();
    await page
        .getByRole('menu', { name: 'File' })
        .getByRole('menuitem', { name: 'again', exact: true })
        .first()
        .click();
    await expectSidebar(page, true);
    await expect(page.getByText('Open another folder?')).toHaveCount(0);
    await expect(page.getByRole('tab')).toHaveCount(1);
    await expect(page.getByRole('treeitem', { name: 'again-note.md', exact: true })).toBeVisible();
});

test('closing the last tab keeps the folder sidebar, and Close Folder hides it', async ({ app }) => {
    const root = await folderWithNote(app, 'tabs');
    await app.launch();
    const { page } = app;
    await app.openWorkspace(root);
    await page.getByRole('treeitem', { name: 'tabs-note.md', exact: true }).click();
    await expect(page.getByRole('tab', { name: 'tabs-note.md' })).toBeVisible();
    await page.getByRole('tab', { name: 'tabs-note.md' }).press('ControlOrMeta+W');
    await expect(page.getByRole('tab')).toHaveCount(0);
    await expect(page.getByTestId('document-launcher')).toBeVisible();
    await expectSidebar(page, true);

    await page.getByRole('treeitem', { name: 'tabs-note.md', exact: true }).click();
    await expect(page.getByRole('tab', { name: 'tabs-note.md' })).toBeVisible();
    await page.getByRole('button', { name: 'Close Folder' }).click();
    await page.getByRole('button', { name: 'Close the tabs too' }).click();
    await expect(page.getByTestId('document-launcher')).toBeVisible();
    await expect(page.getByRole('tab')).toHaveCount(0);
    await expectSidebar(page, false);
});

test('with no folder, closing the only tab leaves the launcher and no sidebar', async ({ app }) => {
    const file = await app.writeDocument('solo.md', '# Solo\n');
    await app.launch([file]);
    const { page } = app;
    await expect(page.getByRole('tab', { name: 'solo.md' })).toBeVisible();
    await page.getByRole('tab', { name: 'solo.md' }).press('ControlOrMeta+W');
    await expect(page.getByTestId('document-launcher')).toBeVisible();
    await expectSidebar(page, false);
});

test('a sidebar width of 280 px survives a restart', async ({ app }) => {
    const root = await folderWithNote(app, 'width');
    await app.launch();
    await app.openWorkspace(root);
    await setSidebarWidth(app.page, 280);
    await expect(app.page.getByRole('complementary', { name: 'Sidebar' })).toHaveCSS('--sidebar-width', '280px');

    await app.relaunch();
    await expectSidebar(app.page, false);
    await app.openWorkspace(root);
    await expect
        .poll(async () => (await app.page.getByRole('complementary', { name: 'Sidebar' }).boundingBox())?.width)
        .toBe(280);
});
