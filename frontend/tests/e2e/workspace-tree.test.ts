import { chmod, mkdir, readFile, readdir, realpath, rename, rmdir, unlink } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { Locator, Page } from '@playwright/test';

import { expect, test, type E2EAppHarness } from '../support/harness';

async function fixture(app: E2EAppHarness): Promise<string> {
    const root = join(app.documentDirectory, 'notes');
    await app.writeDocument('notes/projects/release-notes.md', '# Release notes\n');
    await app.writeDocument('notes/projects/spec-draft.md', '# Spec draft\n');
    await app.writeDocument('notes/readme.md', '# Readme\n');
    await app.writeDocument('notes/todo.txt', 'Todo\n');
    await app.writeDocument('notes/readme.png', 'not markdown\n');
    await app.writeDocument('notes/.gitignore', 'hidden\n');
    await app.writeDocument('notes/.config-notes/vault-note.md', '# Vault\n');
    await mkdir(join(root, 'archive', 'locked'), { recursive: true });
    await mkdir(join(root, 'empty-folder'), { recursive: true });
    await chmod(join(root, 'archive', 'locked'), 0o000);
    return root;
}

async function fileMenu(page: Page): Promise<Locator> {
    const menu = page.getByRole('menu', { name: 'File' });
    if (!(await menu.isVisible())) {
        await page.getByRole('button', { name: 'File', exact: true }).click();
    }
    await expect(menu).toBeVisible();
    return menu;
}

test('recent menu shows ordered names, paths and icons and clears only after confirmation', async ({ app }) => {
    const folder = join(app.documentDirectory, 'recent-folder');
    await mkdir(folder);
    const file = await app.writeDocument('recent-file.md', '# Recent\n');
    const canonicalFile = await realpath(file);
    await app.seedRecents([
        { path: file, kind: 'file' },
        { path: folder, kind: 'folder' },
    ]);
    await app.launch();
    const { page } = app;
    let menu = await fileMenu(page);
    const fileEntry = menu.getByRole('menuitem', { name: 'recent-file.md' });
    const folderEntry = menu.getByRole('menuitem', { name: 'recent-folder' });
    await expect(fileEntry).toHaveAttribute('title', canonicalFile);
    await expect(folderEntry).toHaveAttribute('title', folder);
    await expect(fileEntry.locator('svg')).toHaveAttribute('data-icon-name', 'file');
    await expect(folderEntry.locator('svg')).toHaveAttribute('data-icon-name', 'folder');
    expect(
        await menu
            .getByRole('menuitem')
            .evaluateAll((elements) =>
                elements
                    .filter((element) => element.getAttribute('title') !== null)
                    .map((element) => element.getAttribute('title')),
            ),
    ).toEqual([canonicalFile, folder]);
    await menu.getByRole('menuitem', { name: 'Clear Recent…' }).click();
    await expect(page.getByText('Clear recent items?')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    menu = await fileMenu(page);
    await expect(menu.getByRole('menuitem', { name: 'recent-file.md' })).toBeVisible();
    await menu.getByRole('menuitem', { name: 'Clear Recent…' }).click();
    await page.getByRole('button', { name: 'Clear Recent…' }).click();
    menu = await fileMenu(page);
    await expect(menu.locator('[data-no-recent-items]')).toBeVisible();
});

test('Reopen Last first restores a closed tab and after relaunch opens recent folder', async ({ app }) => {
    const folder = join(app.documentDirectory, 'reopen-folder');
    await mkdir(folder);
    const file = await app.writeDocument('reopen-file.md', '# Reopen\n');
    await app.seedRecents([{ path: file, kind: 'file' }]);
    await app.launch();
    const { page } = app;
    await (await fileMenu(page)).getByRole('menuitem', { name: 'reopen-file.md' }).click();
    await expect(page.getByRole('tab', { name: 'reopen-file.md' })).toBeVisible();
    await page
        .getByRole('tab', { name: 'reopen-file.md' })
        .locator('..')
        .getByRole('button', { name: /^Close /u })
        .click();
    await expect(page.getByRole('tab', { name: 'reopen-file.md' })).toHaveCount(0);
    await (await fileMenu(page)).getByRole('menuitem', { name: 'Reopen Last' }).click();
    await expect(page.getByRole('tab', { name: 'reopen-file.md' })).toBeVisible();
    await app.openWorkspace(folder);
    await app.relaunch();
    await (await fileMenu(page)).getByRole('menuitem', { name: 'Reopen Last' }).click();
    await expect(page.getByRole('treeitem', { name: 'reopen-folder', exact: true })).toBeVisible();
    await (await fileMenu(page)).getByRole('menuitem', { name: 'reopen-file.md' }).click();
    await expect(page.getByRole('tab', { name: 'reopen-file.md' })).toBeVisible();
    await app.relaunch();
    await (await fileMenu(page)).getByRole('menuitem', { name: 'Reopen Last' }).click();
    await expect(page.getByRole('tab', { name: 'reopen-file.md' })).toBeVisible();
});

test('a missing recent folder reports unavailable and is removed', async ({ app }) => {
    const folder = join(app.documentDirectory, 'missing-recent');
    await mkdir(folder);
    await app.seedRecents([{ path: folder, kind: 'folder' }]);
    await app.launch();
    const menu = await fileMenu(app.page);
    const entry = menu.getByRole('menuitem', { name: 'missing-recent' });
    await expect(entry).toBeVisible();
    await rmdir(folder);
    await entry.click();
    await expect(app.page.getByRole('listitem').filter({ hasText: 'The folder could not be found.' })).toBeVisible();
    await expect((await fileMenu(app.page)).getByRole('menuitem', { name: 'missing-recent' })).toHaveCount(0);
});

test('opening eleven distinct file and folder paths keeps only the newest ten recent items', async ({ app }) => {
    const folder = join(app.documentDirectory, 'many-recent');
    for (let index = 1; index <= 10; index += 1) {
        await app.writeDocument(`many-recent/recent-${String(index).padStart(2, '0')}.md`, `# ${index}\n`);
    }
    await app.launch();
    await app.openWorkspace(folder);
    for (let index = 1; index <= 10; index += 1) {
        await app.page
            .getByRole('treeitem', { name: `recent-${String(index).padStart(2, '0')}.md`, exact: true })
            .click();
        await expect(app.page.getByRole('tab', { name: `recent-${String(index).padStart(2, '0')}.md` })).toBeVisible();
    }
    const menu = await fileMenu(app.page);
    await expect(menu.getByRole('menuitem', { name: 'recent-10.md' })).toBeVisible();
    const recentPaths = await menu
        .getByRole('menuitem')
        .evaluateAll((elements) =>
            elements.map((element) => element.getAttribute('title')).filter((title) => title !== null),
        );
    expect(recentPaths).toHaveLength(10);
    expect(recentPaths.map((path) => basename(path ?? ''))).toEqual(
        Array.from({ length: 10 }, (_, index) => `recent-${String(10 - index).padStart(2, '0')}.md`),
    );
});

test.afterEach(async ({ app }) => {
    try {
        await chmod(join(app.documentDirectory, 'notes', 'archive', 'locked'), 0o700);
    } catch {
        // Tests without the locked fixture have nothing to restore.
    }
});

async function disableAutosave(page: Page): Promise<void> {
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const menu = page.getByRole('menu', { name: 'Settings menu' });
    const autosave = menu.getByRole('checkbox', { name: 'Autosave' });
    if (await autosave.isChecked()) await menu.locator('[data-settings-toggle="Autosave"]').click();
    await page.keyboard.press('Escape');
}

async function editDocument(page: Page, content: string): Promise<void> {
    const editor = page.locator('[data-editor-surface] textarea').first();
    await page.locator('[data-editor-surface] .view-lines').first().click();
    await expect(editor).toBeFocused();
    await editor.press('ControlOrMeta+A');
    await page.keyboard.insertText(content);
    await expect(page.locator('[aria-label="Document identity"]')).toContainText('Unsaved changes');
}

async function tabFullyVisible(tab: Locator): Promise<boolean> {
    return tab.evaluate((element) => {
        const item = element.parentElement;
        const strip = element.closest('[role="tablist"]');
        if (item === null || strip === null) return false;
        const itemBounds = item.getBoundingClientRect();
        const stripBounds = strip.getBoundingClientRect();
        return itemBounds.left >= stripBounds.left - 1 && itemBounds.right <= stripBounds.right + 1;
    });
}

test('keeps newly opened and reactivated folder tabs in the visible ribbon', async ({ app }) => {
    const folder = join(app.documentDirectory, 'ribbon-notes');
    for (let index = 1; index <= 8; index += 1) {
        await app.writeDocument(
            `ribbon-notes/ribbon-${String(index).padStart(2, '0')}.md`,
            index === 1 ? '# Note 1\n\n[self](./ribbon-01.md)\n' : `# Note ${index}\n`,
        );
    }
    await app.launch();
    const { page } = app;
    await page.setViewportSize({ width: 820, height: 720 });
    await app.openWorkspace(folder);

    for (let index = 1; index <= 8; index += 1) {
        const name = `ribbon-${String(index).padStart(2, '0')}.md`;
        await page.getByRole('treeitem', { name, exact: true }).click();
        await expect(page.getByRole('tab', { name })).toHaveAttribute('aria-selected', 'true');
    }
    const tablist = page.getByRole('tablist', { name: 'Document tabs' });
    const lastTab = tablist.getByRole('tab', { name: 'ribbon-08.md' });
    await expect.poll(() => tablist.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
    await expect(lastTab).toHaveAttribute('aria-selected', 'true');
    await expect.poll(() => tabFullyVisible(lastTab)).toBe(true);

    await tablist.evaluate((element) => {
        element.scrollLeft = element.scrollWidth;
    });
    const firstTab = tablist.getByRole('tab', { name: 'ribbon-01.md' });
    await expect.poll(() => tabFullyVisible(firstTab)).toBe(false);
    await page.getByRole('treeitem', { name: 'ribbon-01.md', exact: true }).click();
    await expect(firstTab).toHaveAttribute('aria-selected', 'true');
    await expect.poll(() => tabFullyVisible(firstTab)).toBe(true);

    await tablist.evaluate((element) => {
        element.scrollLeft = element.scrollWidth;
    });
    await expect.poll(() => tabFullyVisible(firstTab)).toBe(false);
    await page.getByRole('treeitem', { name: 'ribbon-01.md', exact: true }).click();
    await expect.poll(() => tabFullyVisible(firstTab)).toBe(true);

    const arrangement = page.getByRole('radiogroup', { name: 'View arrangement' });
    await arrangement.getByRole('radio', { name: 'Preview' }).click();
    const selfLink = page.getByRole('link', { name: 'self' });
    await expect(selfLink).toBeVisible();
    await tablist.evaluate((element) => {
        element.scrollLeft = element.scrollWidth;
    });
    await expect.poll(() => tabFullyVisible(firstTab)).toBe(false);
    await selfLink.click();
    await expect.poll(() => tabFullyVisible(firstTab)).toBe(true);
});

test('when a folder opens, the tree filters and orders rows and refreshes stale files', async ({ app }, testInfo) => {
    const root = await fixture(app);
    await app.launch();
    const page = app.page;
    await expect(page.getByText('No folder open')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open Folder' })).toBeVisible();
    await app.openWorkspace(root);
    await page.screenshot({ path: testInfo.outputPath('populated-tree.png'), fullPage: true });

    const tree = page.getByRole('treeitem', { name: basename(root), exact: true });
    await expect(page.getByRole('tree').getByRole('treeitem').first()).toHaveAttribute('aria-label', basename(root));
    await expect(tree).toHaveAttribute('aria-expanded', 'true');
    for (const name of ['archive', 'empty-folder', 'projects', 'readme.md', 'todo.txt']) {
        await expect(page.getByRole('treeitem', { name, exact: true })).toBeVisible();
    }
    const rootChildren = tree.locator(':scope > ul > li');
    expect(await rootChildren.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label')))).toEqual([
        'archive',
        'empty-folder',
        'projects',
        'readme.md',
        'todo.txt',
    ]);
    await tree.click({ position: { x: 4, y: 10 } });
    await expect(tree).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('treeitem', { name: 'projects', exact: true })).toHaveCount(0);
    await tree.click({ position: { x: 4, y: 10 } });
    await expect(tree).toHaveAttribute('aria-expanded', 'true');
    expect(await app.openWorkspace(root)).toBe('unchanged');
    await page.getByRole('button', { name: 'Close Folder' }).focus();
    await page.keyboard.press('Tab');
    await expect(tree).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('treeitem', { name: 'archive', exact: true })).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(tree).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(tree).toHaveAttribute('aria-expanded', 'false');
    await page.keyboard.press('Enter');
    await expect(tree).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('treeitem', { name: 'projects', exact: true })).toHaveAttribute(
        'aria-expanded',
        'false',
    );
    await page.getByRole('treeitem', { name: 'archive', exact: true }).click({ position: { x: 4, y: 10 } });
    if (process.getuid?.() !== 0) {
        const locked = page.getByRole('treeitem', { name: 'locked', exact: true });
        await expect(locked).toHaveAttribute('aria-description', 'Unreadable folder');
        await locked.click({ position: { x: 4, y: 10 } });
        await expect(locked).not.toHaveAttribute('aria-expanded', 'true');
        await expect(page.getByRole('treeitem', { name: 'readme.md', exact: true })).toBeVisible();
    }
    await page.getByRole('treeitem', { name: 'archive', exact: true }).click({ position: { x: 4, y: 10 } });
    await expect(page.getByRole('treeitem', { name: 'release-notes.md', exact: true })).toHaveCount(0);
    for (const excluded of ['readme.png', '.gitignore', '.config-notes']) {
        await expect(page.getByRole('treeitem', { name: excluded, exact: true })).toHaveCount(0);
    }
    for (const suffix of ['.md', '.markdown', '.mdown', '.txt'])
        await expect(page.getByText(suffix, { exact: true })).toBeVisible();

    const projects = page.getByRole('treeitem', { name: 'projects', exact: true });
    await projects.click({ position: { x: 4, y: 10 } });
    await page.getByRole('treeitem', { name: 'projects', exact: true }).focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('treeitem', { name: 'release-notes.md', exact: true })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('tab', { name: 'release-notes.md' })).toBeVisible();
    const draft = page.getByRole('treeitem', { name: 'spec-draft.md', exact: true });
    await expect(draft).toBeVisible();
    await draft.click();
    await expect(page.getByRole('tab', { name: 'spec-draft.md' })).toBeVisible();
    await draft.click();
    await expect(page.getByRole('tab', { name: 'spec-draft.md' })).toHaveCount(1);

    await app.writeDocument('notes/projects/new-file.md', '# New\n');
    await expect(page.getByRole('treeitem', { name: 'new-file.md', exact: true })).toHaveCount(0);
    const loadingSeen = page.evaluate(
        () =>
            new Promise<boolean>((resolve) => {
                const observer = new MutationObserver(() => {
                    if (!document.body.textContent?.includes('Loading folder…')) return;
                    observer.disconnect();
                    clearTimeout(timeout);
                    resolve(true);
                });
                const timeout = setTimeout(() => {
                    observer.disconnect();
                    resolve(false);
                }, 5_000);
                observer.observe(document.body, { subtree: true, childList: true, characterData: true });
            }),
    );
    await page.getByRole('button', { name: 'Refresh' }).click();
    expect(await loadingSeen).toBe(true);
    await expect(page.getByRole('treeitem', { name: 'new-file.md', exact: true })).toBeVisible();
    await expect(page.getByRole('treeitem', { name: 'projects', exact: true })).toHaveAttribute(
        'aria-expanded',
        'true',
    );
    await expect(draft).toHaveAttribute('aria-selected', 'true');
    await unlink(join(root, 'todo.txt'));
    await page.getByRole('button', { name: 'Refresh' }).click();
    await expect(page.getByRole('treeitem', { name: 'todo.txt', exact: true })).toHaveCount(0);

    await unlink(join(root, 'readme.md'));
    await page.getByRole('treeitem', { name: 'readme.md', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: /no longer|not found|missing/iu })).toBeVisible();
    await expect(page.getByRole('treeitem', { name: 'readme.md', exact: true })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'readme.md' })).toHaveCount(0);
});

test('when hidden folders are enabled, they remain visible after relaunch while dot files stay hidden', async ({
    app,
}) => {
    const root = await fixture(app);
    await app.launch();
    await app.openWorkspace(root);
    const hidden = app.page.getByRole('button', { name: 'Show hidden folders' });
    await expect(hidden).toHaveAttribute('aria-pressed', 'false');
    await hidden.click();
    await expect(hidden).toHaveAttribute('aria-pressed', 'true');
    await expect(app.page.getByRole('treeitem', { name: '.config-notes', exact: true })).toBeVisible();
    await app.page.getByRole('treeitem', { name: '.config-notes', exact: true }).click();
    await app.page.getByRole('treeitem', { name: 'vault-note.md', exact: true }).click();
    await expect(app.page.getByRole('tab', { name: 'vault-note.md' })).toBeVisible();
    await expect(app.page.getByRole('treeitem', { name: '.gitignore', exact: true })).toHaveCount(0);
    await app.relaunch();
    await app.openWorkspace(root);
    await expect(app.page.getByRole('button', { name: 'Show hidden folders' })).toHaveAttribute('aria-pressed', 'true');
    await expect(app.page.getByRole('treeitem', { name: '.config-notes', exact: true })).toBeVisible();
});

test('when each tree row is right-clicked, its menu offers only actions that can work there', async ({ app }) => {
    const root = await fixture(app);
    await app.launch();
    await app.openWorkspace(root);
    const { page } = app;
    const menu = page.getByRole('menu', { name: 'Workspace item actions' });

    for (const folder of [basename(root), 'projects']) {
        await page
            .getByRole('treeitem', { name: folder, exact: true })
            .getByRole('button', { name: folder, exact: true })
            .click({ button: 'right' });
        await expect(menu.getByRole('menuitem')).toHaveCount(4);
        for (const action of ['New File', 'New Folder', 'Reveal in file manager', 'Copy path']) {
            await expect(menu.getByRole('menuitem', { name: action, exact: true })).toBeVisible();
        }
        await page.keyboard.press('Escape');
    }

    await page.getByRole('treeitem', { name: 'readme.md', exact: true }).click({ button: 'right' });
    await expect(menu.getByRole('menuitem')).toHaveCount(2);
    for (const action of ['Reveal in file manager', 'Copy path']) {
        await expect(menu.getByRole('menuitem', { name: action, exact: true })).toBeVisible();
    }
    await page.keyboard.press('Escape');

    if (process.getuid?.() !== 0) {
        await page.getByRole('treeitem', { name: 'archive', exact: true }).click({ position: { x: 4, y: 10 } });
        const locked = page.getByRole('treeitem', { name: 'locked', exact: true });
        await expect(locked).toHaveAttribute('aria-description', 'Unreadable folder');
        await locked.click({ button: 'right' });
        await expect(menu.getByRole('menuitem')).toHaveCount(2);
        for (const action of ['Reveal in file manager', 'Copy path']) {
            await expect(menu.getByRole('menuitem', { name: action, exact: true })).toBeVisible();
        }
        await page.keyboard.press('Escape');
        await locked.click();
        await expect(locked).not.toHaveAttribute('aria-expanded', 'true');
    }
});

test('when entries are created from a folder row, the tree, disk, tab and inline refusals agree', async ({ app }) => {
    const root = await fixture(app);
    await app.launch();
    await app.openWorkspace(root);
    const { page } = app;
    const projects = page.getByRole('treeitem', { name: 'projects', exact: true });
    const menu = page.getByRole('menu', { name: 'Workspace item actions' });
    const newFile = page.getByRole('dialog', { name: 'New file' });
    const newFolder = page.getByRole('dialog', { name: 'New folder' });

    await expect(projects).toHaveAttribute('aria-expanded', 'false');
    await projects.getByRole('button', { name: 'projects' }).click({ button: 'right' });
    await menu.getByRole('menuitem', { name: 'New File', exact: true }).click();
    await newFile.getByRole('textbox', { name: 'Name' }).fill('ideas');
    await newFile.getByRole('button', { name: 'Create' }).click();
    await expect(newFile).toHaveCount(0);
    await expect(projects).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('treeitem', { name: 'ideas.md', exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'ideas.md' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[data-editor-surface] textarea').first()).toBeFocused();
    expect(await readFile(join(root, 'projects', 'ideas.md'), 'utf8')).toBe('');

    await projects.getByRole('button', { name: 'projects' }).click({ button: 'right' });
    await menu.getByRole('menuitem', { name: 'New File', exact: true }).click();
    await newFile.getByRole('textbox', { name: 'Name' }).fill('notes.txt');
    await newFile.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByRole('treeitem', { name: 'notes.txt', exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'notes.txt' })).toHaveAttribute('aria-selected', 'true');
    expect(await readFile(join(root, 'projects', 'notes.txt'), 'utf8')).toBe('');
    expect(await readdir(join(root, 'projects'))).not.toContain('notes.txt.md');

    await projects.getByRole('button', { name: 'projects' }).click({ button: 'right' });
    await menu.getByRole('menuitem', { name: 'New File', exact: true }).click();
    await newFile.getByRole('textbox', { name: 'Name' }).fill('notes.txt');
    await newFile.getByRole('button', { name: 'Create' }).click();
    await expect(newFile).toBeVisible();
    await expect(newFile.getByRole('textbox', { name: 'Name' })).toHaveValue('notes.txt');
    await expect(newFile.getByRole('alert')).toContainText('already exists');
    expect(await readFile(join(root, 'projects', 'notes.txt'), 'utf8')).toBe('');

    await newFile.getByRole('textbox', { name: 'Name' }).fill('.draft');
    await newFile.getByRole('button', { name: 'Create' }).click();
    await expect(newFile.getByRole('textbox', { name: 'Name' })).toHaveValue('.draft');
    await expect(newFile.getByRole('alert')).toContainText('Names beginning with a dot');
    expect(await readdir(join(root, 'projects'))).not.toContain('.draft');
    await newFile.getByRole('button', { name: 'Cancel' }).click();

    await projects.getByRole('button', { name: 'projects' }).click({ button: 'right' });
    await menu.getByRole('menuitem', { name: 'New Folder', exact: true }).click();
    await newFolder.getByRole('textbox', { name: 'Name' }).fill('.hidden');
    await newFolder.getByRole('button', { name: 'Create' }).click();
    await expect(newFolder.getByRole('textbox', { name: 'Name' })).toHaveValue('.hidden');
    await expect(newFolder.getByRole('alert')).toContainText('Names beginning with a dot');
    expect(await readdir(join(root, 'projects'))).not.toContain('.hidden');
    await newFolder.getByRole('textbox', { name: 'Name' }).fill('team');
    const tabsBeforeFolder = await page.getByRole('tablist', { name: 'Document tabs' }).getByRole('tab').count();
    await newFolder.getByRole('button', { name: 'Create' }).click();
    await expect(newFolder).toHaveCount(0);
    await expect(page.getByRole('treeitem', { name: 'team', exact: true })).toBeVisible();
    await expect(page.getByRole('tablist', { name: 'Document tabs' }).getByRole('tab')).toHaveCount(tabsBeforeFolder);
    expect((await readdir(join(root, 'projects'))).sort()).toEqual([
        'ideas.md',
        'notes.txt',
        'release-notes.md',
        'spec-draft.md',
        'team',
    ]);
    const children = projects.locator(':scope > ul > li');
    expect(await children.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label')))).toEqual([
        'team',
        'ideas.md',
        'notes.txt',
        'release-notes.md',
        'spec-draft.md',
    ]);

    await projects.getByRole('button', { name: 'projects' }).click({ button: 'right' });
    await menu.getByRole('menuitem', { name: 'New Folder', exact: true }).click();
    await newFolder.getByRole('textbox', { name: 'Name' }).fill('team');
    await newFolder.getByRole('button', { name: 'Create' }).click();
    await expect(newFolder).toBeVisible();
    await expect(newFolder.getByRole('textbox', { name: 'Name' })).toHaveValue('team');
    await expect(newFolder.getByRole('alert')).toContainText('already exists');
    expect((await readdir(join(root, 'projects'))).filter((entry) => entry === 'team')).toHaveLength(1);
    await newFolder.getByRole('button', { name: 'Cancel' }).click();

    const rootRow = page.getByRole('treeitem', { name: basename(root), exact: true });
    await rootRow.getByRole('button', { name: basename(root), exact: true }).click({ button: 'right' });
    await menu.getByRole('menuitem', { name: 'New File', exact: true }).click();
    await newFile.getByRole('textbox', { name: 'Name' }).fill('root-note');
    await newFile.getByRole('button', { name: 'Create' }).click();
    await expect(rootRow).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('treeitem', { name: 'root-note.md', exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'root-note.md' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[data-editor-surface] textarea').first()).toBeFocused();
    expect(await readFile(join(root, 'root-note.md'), 'utf8')).toBe('');
});

test('when a folder is empty or closed, the sidebar explains its state and honors tab choices', async ({ app }) => {
    const root = join(app.documentDirectory, 'empty-notes');
    await mkdir(root, { recursive: true });
    await app.launch();
    await app.openWorkspace(root);
    await expect(app.page.getByText('No matching files')).toBeVisible();
    const file = await app.writeDocument('empty-notes/one.md', '# One\n');
    await app.page.getByRole('button', { name: 'Refresh' }).click();
    await app.page.getByRole('treeitem', { name: basename(file), exact: true }).click();
    await disableAutosave(app.page);
    await editDocument(app.page, '# Edited before closing\n');
    await app.page.getByRole('button', { name: 'File', exact: true }).click();
    await app.page.getByRole('menu', { name: 'File' }).getByRole('menuitem', { name: 'Close Folder' }).click();
    await expect(app.page.getByText('Close folder?')).toBeVisible();
    await app.page.getByRole('button', { name: 'Cancel' }).click();
    await expect(app.page.getByRole('treeitem', { name: basename(root), exact: true })).toBeVisible();
    await expect(app.page.getByRole('tab', { name: 'one.md' })).toBeVisible();
    expect(await readFile(file, 'utf8')).toBe('# One\n');
    await app.page.getByRole('button', { name: 'Close Folder' }).click();
    await app.page.getByRole('button', { name: 'Keep them open' }).click();
    await expect(app.page.getByText('No folder open')).toBeVisible();
    await expect(app.page.getByRole('tab', { name: 'one.md' })).toBeVisible();
    await expect(app.page.locator('[aria-label="Document identity"]')).toContainText('Unsaved changes');
    await app.openWorkspace(root);
    await app.page.getByRole('button', { name: 'Close Folder' }).click();
    await app.page.getByRole('button', { name: 'Close the tabs too' }).click();
    const savePrompt = app.page.getByRole('dialog', { name: 'Save changes before closing?' });
    await expect(savePrompt).toBeVisible();
    await savePrompt.getByRole('button', { name: 'Save all', exact: true }).click();
    await expect(app.page.getByText('No folder open')).toBeVisible();
    await expect(app.page.getByRole('tab', { name: 'one.md' })).toHaveCount(0);
    expect(await readFile(file, 'utf8')).toContain('Edited before closing');
    await app.openWorkspace(root);
    await rename(root, `${root}-moved`);
    await app.page.getByRole('button', { name: 'Refresh' }).click();
    await expect(app.page.getByText('This folder is no longer available')).toBeVisible();
    await expect(app.page.getByRole('button', { name: 'Retry' })).toBeVisible();
});
