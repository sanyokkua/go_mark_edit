import { readFile } from 'node:fs/promises';
import type { Locator, Page } from '@playwright/test';

import { expect, test, type E2EAppHarness } from '../support/harness';
import { runFromMarkdownMenu } from '../support/markdownMenu';

const markdownGroups = [
    ['Markdown standard', 'Full', 'Minimal'],
    ['Bullet marker', '-', '*'],
    ['Emphasis marker', '_ _', '* *'],
    ['Heading style', 'ATX (#)', 'Setext'],
] as const;

const palettes = [
    ['Material', 'Light', 'material', 'light'],
    ['Material', 'Dark', 'material', 'dark'],
    ['Liquid Glass', 'Light', 'glass', 'light'],
    ['Liquid Glass', 'Dark', 'glass', 'dark'],
    ['Minimal', 'Light', 'minimal', 'light'],
    ['Minimal', 'Dark', 'minimal', 'dark'],
] as const;

function toolbarAction(page: Page, id: string): Locator {
    return page.getByRole('toolbar', { name: 'Document toolbar' }).locator(`[data-action-id="${id}"]`);
}

function markdownGroup(page: Page): Locator {
    return page.getByRole('dialog', { name: 'Settings' }).getByRole('tabpanel', { name: 'Markdown' });
}

async function showSection(page: Page, name: string): Promise<void> {
    const tab = page.getByRole('dialog', { name: 'Settings' }).getByRole('tab', { name, exact: true });
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
}

async function openSettings(page: Page): Promise<Locator> {
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('menu', { name: 'Settings menu' }).getByRole('menuitem', { name: 'All settings…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Settings' });
    await expect(dialog).toBeVisible();
    return dialog;
}

async function closeSettings(page: Page): Promise<void> {
    await page.getByRole('dialog', { name: 'Settings' }).getByRole('button', { name: 'Close' }).click();
}

async function setSegment(page: Page, group: string, option: string): Promise<void> {
    const choice = markdownGroup(page).getByRole('radiogroup', { name: group }).getByRole('radio', {
        name: option,
        exact: true,
    });
    await choice.click();
    await expect(choice).toHaveAttribute('aria-checked', 'true');
}

async function setSwitch(page: Page, label: string, on: boolean): Promise<void> {
    const toggle = markdownGroup(page).getByRole('switch', { name: label, exact: true });
    if ((await toggle.isChecked()) !== on) await toggle.click();
    if (on) await expect(toggle).toBeChecked();
    else await expect(toggle).not.toBeChecked();
}

async function openDocument(app: E2EAppHarness, filename: string, contents: string): Promise<string> {
    const path = await app.writeDocument(filename, contents);
    await app.seedRecents([path]);
    await app.launch();
    const { page } = app;
    await page.getByTestId('document-launcher').getByRole('button', { name: filename, exact: true }).click();
    await expect(page.getByRole('tab', { name: filename })).toBeVisible();
    await expect.poll(() => activeText(page)).toBe(contents);
    await expect(page.locator('[data-editor-surface] .view-lines')).toContainText(contents.split('\n')[0]);
    return path;
}

async function disableAutosave(page: Page): Promise<void> {
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const menu = page.getByRole('menu', { name: 'Settings menu' });
    const toggle = menu.getByRole('checkbox', { name: 'Autosave' });
    if (await toggle.isChecked()) await menu.locator('[data-settings-toggle="Autosave"]').click();
    await page.keyboard.press('Escape');
}

async function activeText(page: Page): Promise<string> {
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
        if (getState === undefined) throw new Error('GetState binding is unavailable');
        const response = await getState({ id: crypto.randomUUID() });
        return response.data?.activeBuffer?.content ?? '';
    });
}

async function editDocument(page: Page, content: string): Promise<void> {
    const editor = page.locator('[data-editor-surface] textarea').first();
    await expect(editor).toBeVisible();
    await page.locator('[data-editor-surface] .view-lines').first().click();
    await expect(editor).toBeFocused();
    const modifier = await page.evaluate(() => (navigator.userAgent.includes('Macintosh') ? 'Meta' : 'Control'));
    await editor.press(`${modifier}+A`);
    await page.keyboard.insertText(content);
    await expect.poll(() => activeText(page)).toBe(content);
}

async function appendToDocument(page: Page, added: string, expected: string): Promise<void> {
    const editor = page.locator('[data-editor-surface] textarea').first();
    await expect(editor).toBeVisible();
    await editor.focus();
    const endOfDocument = await page.evaluate(() =>
        navigator.userAgent.includes('Macintosh') ? 'Meta+ArrowDown' : 'Control+End',
    );
    await editor.press(endOfDocument);
    await page.keyboard.insertText(added);
    await expect.poll(() => activeText(page)).toBe(expected);
}

async function expectDefaults(page: Page): Promise<void> {
    const group = markdownGroup(page);
    for (const [name, selected] of markdownGroups) {
        const control = group.getByRole('radiogroup', { name });
        await expect(control).toBeVisible();
        await expect(control.getByRole('radio', { name: selected, exact: true })).toHaveAttribute(
            'aria-checked',
            'true',
        );
        expect(await control.getAttribute('aria-describedby')).toBeTruthy();
    }
    await expect(group.getByRole('switch', { name: 'Format on save' })).not.toBeChecked();
    await expect(group.getByRole('switch', { name: 'Lint on save' })).toBeChecked();
    for (const name of ['Format on save', 'Lint on save']) {
        expect(await group.getByRole('switch', { name }).getAttribute('aria-describedby')).toBeTruthy();
    }
}

test('fresh Markdown preferences are named and persist after keyboard changes and relaunch', async ({ app }) => {
    await app.launch();
    const { page } = app;
    await openSettings(page);
    await showSection(page, 'Markdown');
    await expectDefaults(page);
    const standard = markdownGroup(page).getByRole('radiogroup', { name: 'Markdown standard' });
    await standard.getByRole('radio', { name: 'Full' }).focus();
    await page.keyboard.press('ArrowLeft');
    await expect(standard.getByRole('radio', { name: 'GFM' })).toHaveAttribute('aria-checked', 'true');
    await expect(standard.getByRole('radio', { name: 'GFM' })).toBeFocused();
    await setSegment(page, 'Bullet marker', '*');
    await setSegment(page, 'Emphasis marker', '* *');
    await setSegment(page, 'Heading style', 'Setext');
    const formatSwitch = markdownGroup(page).getByRole('switch', { name: 'Format on save' });
    await formatSwitch.focus();
    await formatSwitch.press('Space');
    await expect(formatSwitch).toBeChecked();
    await setSwitch(page, 'Lint on save', false);
    await closeSettings(page);

    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const popup = page.getByRole('menu', { name: 'Settings menu' });
    await expect(popup.getByRole('menuitemradio', { name: 'GFM', exact: true })).toHaveAttribute(
        'aria-checked',
        'true',
    );
    await expect(popup.getByRole('menuitemcheckbox', { name: 'Format on save' })).toHaveAttribute(
        'aria-checked',
        'true',
    );
    await expect(popup.getByRole('menuitemcheckbox', { name: 'Lint on save' })).toHaveAttribute(
        'aria-checked',
        'false',
    );
    await page.keyboard.press('Escape');

    await app.relaunch();
    await openSettings(page);
    await showSection(page, 'Markdown');
    for (const [name, selected] of [
        ['Markdown standard', 'GFM'],
        ['Bullet marker', '*'],
        ['Emphasis marker', '* *'],
        ['Heading style', 'Setext'],
    ] as const) {
        await expect(
            markdownGroup(page).getByRole('radiogroup', { name }).getByRole('radio', { name: selected, exact: true }),
        ).toHaveAttribute('aria-checked', 'true');
    }
    await expect(markdownGroup(page).getByRole('switch', { name: 'Format on save' })).toBeChecked();
    await expect(markdownGroup(page).getByRole('switch', { name: 'Lint on save' })).not.toBeChecked();
    app.expectNoForeignRequests();
});

test(
    'changing standards updates every open document and the visible labels within one second',
    { tag: '@perf' },
    async ({ app }) => {
        const source = [
            '# Dialect',
            '',
            '$E=mc^2$',
            '',
            ':::note',
            'A note.',
            ':::',
            '',
            '| Name | Count |',
            '| --- | ---: |',
            '| one | 1 |',
            '',
            'Footnote[^one].',
            '',
            '[^one]: Detail.',
            '',
            '```mermaid',
            'flowchart LR',
            '    A --> B',
            '```',
            '',
        ].join('\n');
        const first = await app.writeDocument('first.md', source);
        const second = await app.writeDocument('second.md', source.replace('# Dialect', '# Second dialect'));
        await app.seedRecents([first, second]);
        await app.launch();
        const { page } = app;
        await page.getByTestId('document-launcher').getByRole('button', { name: 'first.md' }).click();
        await page.getByRole('button', { name: 'File', exact: true }).click();
        await page.getByRole('menu', { name: 'File' }).getByRole('menuitem', { name: 'second.md' }).click();
        await expect(page.getByRole('tab', { name: 'first.md' })).toBeVisible();
        await expect(page.getByRole('tab', { name: 'second.md' })).toBeVisible();
        await page
            .getByRole('radiogroup', { name: 'View arrangement' })
            .getByRole('radio', { name: 'Preview' })
            .click();
        const preview = page.getByRole('region', { name: 'Preview pane' });
        await expect(preview.locator('.katex').first()).toBeVisible();
        await expect(preview.getByRole('note')).toBeVisible();
        await expect(preview.getByRole('table')).toBeVisible();
        await expect(preview.locator('section[data-footnotes]')).toBeVisible();
        await expect(preview.locator('[data-mermaid-block] svg')).toBeVisible();

        async function changeStandard(label: string, target: 'GFM' | 'Minimal'): Promise<void> {
            await page.getByRole('button', { name: 'Settings', exact: true }).click();
            const choice = page.getByRole('menu', { name: 'Settings menu' }).getByRole('menuitemradio', {
                name: label,
                exact: true,
            });
            const started = performance.now();
            await choice.click({ timeout: 1_000 });
            const remaining = 1_000 - (performance.now() - started);
            expect(remaining).toBeGreaterThan(0);
            await expect
                .poll(
                    async () => {
                        const header = await preview.locator('header').textContent();
                        const status = await page.getByRole('status', { name: 'Document status' }).textContent();
                        return [header?.includes(target), status?.includes(`Markdown · ${target}`)];
                    },
                    { timeout: remaining },
                )
                .toEqual([true, true]);
            const menu = page.getByRole('menu', { name: 'Settings menu' });
            if (await menu.isVisible()) await page.keyboard.press('Escape');
        }

        await changeStandard('GFM', 'GFM');
        await expect(preview.locator('.katex')).toHaveCount(0);
        await expect(preview).toContainText('$E=mc^2$');
        await expect(preview).toContainText(':::note');
        await expect(preview.getByRole('note')).toHaveCount(0);
        await expect(preview.getByRole('table')).toBeVisible();
        await expect(preview.locator('section[data-footnotes]')).toBeVisible();
        await page.getByRole('tab', { name: 'first.md' }).click();
        await expect(preview).toContainText('$E=mc^2$');
        await expect(preview.getByRole('table')).toBeVisible();
        await expect(preview.locator('section[data-footnotes]')).toBeVisible();
        await expect(preview.locator('header')).toContainText('GFM');
        await expect(page.getByRole('status', { name: 'Document status' })).toContainText('Markdown · GFM');

        await changeStandard('Minimal (CommonMark)', 'Minimal');
        await expect(preview.getByRole('table')).toHaveCount(0);
        await expect(preview).toContainText('| Name | Count |');
        await expect(preview.locator('[data-mermaid-block] svg')).toBeVisible();
        await page.getByRole('tab', { name: 'second.md' }).click();
        await expect(preview.getByRole('table')).toHaveCount(0);
        await expect(preview).toContainText('| Name | Count |');
        await expect(preview.locator('[data-mermaid-block] svg')).toBeVisible();
        await expect(preview.locator('header')).toContainText('Minimal');
        await expect(page.getByRole('status', { name: 'Document status' })).toContainText('Markdown · Minimal');
        app.expectNoForeignRequests();
    },
);

test('Format and Lint use stored markers while toolbar headings stay ATX', async ({ app }) => {
    await openDocument(app, 'markers.md', '# Title\n\n- item\n\n_an emphasis_\n');
    const { page } = app;
    await disableAutosave(page);
    await openSettings(page);
    await showSection(page, 'Markdown');
    await setSegment(page, 'Bullet marker', '*');
    await setSegment(page, 'Emphasis marker', '* *');
    await setSegment(page, 'Heading style', 'Setext');
    await closeSettings(page);
    await toolbarAction(page, 'format').click();
    await expect.poll(() => activeText(page)).toContain('Title\n=====');
    await expect.poll(() => activeText(page)).toContain('* item');
    await expect.poll(() => activeText(page)).toContain('*an emphasis*');

    await editDocument(page, '# Wrong heading\n\n- wrong bullet\n');
    await runFromMarkdownMenu(page, 'lint');
    await expect(page.getByRole('button', { name: '2 problems' })).toBeVisible();
    await page.getByRole('button', { name: '2 problems' }).click();
    const problems = page.getByRole('region', { name: 'Problems' });
    await expect(problems).toContainText('list marker');
    await expect(problems).toContainText('Heading style');
    await problems.getByRole('button', { name: 'Close Problems' }).click();

    await editDocument(page, 'item');
    await toolbarAction(page, 'bullet-list').click();
    await expect.poll(() => activeText(page)).toBe('* item');
    await editDocument(page, 'word');
    const editor = page.locator('[data-editor-surface] textarea').first();
    await editor.press('ControlOrMeta+A');
    await toolbarAction(page, 'italic').click();
    await expect.poll(() => activeText(page)).toBe('*word*');
    await editDocument(page, 'Heading');
    await toolbarAction(page, 'heading-1').click();
    await expect.poll(() => activeText(page)).toBe('# Heading');
    app.expectNoForeignRequests();
});

test('explicit Save persists formatted bytes and then reports the saved document findings', async ({ app }) => {
    const path = await openDocument(app, 'explicit.md', '# One\n\n# Two\n\n- item\n');
    const { page } = app;
    await disableAutosave(page);
    await openSettings(page);
    await showSection(page, 'Markdown');
    await setSegment(page, 'Bullet marker', '*');
    await setSwitch(page, 'Format on save', true);
    await setSwitch(page, 'Lint on save', true);
    await closeSettings(page);
    const raw = '# One\n\n# Two\n\n- item\n- changed item\n';
    await appendToDocument(page, '- changed item\n', raw);
    await page.keyboard.press('ControlOrMeta+S');
    await expect.poll(() => readFile(path, 'utf8')).toBe('# One\n\n# Two\n\n* item\n* changed item\n');
    await expect(page.locator('[aria-label="Document identity"]')).toContainText('Saved');
    await expect(page.getByRole('button', { name: '1 problems' })).toBeVisible();
    await page.getByRole('button', { name: '1 problems' }).click();
    const problems = page.getByRole('region', { name: 'Problems' });
    await expect(problems).toContainText('more than one top-level heading');
    await problems.getByRole('button', { name: 'Close Problems' }).click();
    const editor = page.locator('[data-editor-surface] textarea').first();
    await editor.focus();
    const modifier = await page.evaluate(() => (navigator.userAgent.includes('Macintosh') ? 'Meta' : 'Control'));
    await editor.press(`${modifier}+z`);
    await expect.poll(() => activeText(page)).toBe(raw);
    app.expectNoForeignRequests();
});

test('backend autosave writes raw text without running Format or Lint', async ({ app }) => {
    const path = await openDocument(app, 'autosave.md', '# Autosave\n\n- original\n');
    const { page } = app;
    await openSettings(page);
    await showSection(page, 'Markdown');
    await setSegment(page, 'Bullet marker', '*');
    await setSwitch(page, 'Format on save', true);
    await setSwitch(page, 'Lint on save', true);
    await closeSettings(page);
    const raw = '# Autosave\n\n- changed\n';
    await editDocument(page, raw);
    await expect(page.getByRole('button', { name: /problems/u })).toHaveCount(0);
    await expect(page.locator('[aria-label="Document identity"]')).toContainText('Autosaved', { timeout: 15_000 });
    await expect.poll(() => readFile(path, 'utf8')).toBe(raw);
    await expect(page.getByRole('button', { name: /problems/u })).toHaveCount(0);
    await expect(page.locator('.squiggly-warning, .squiggly-error')).toHaveCount(0);
    await expect(page.locator('[data-notification-code="format-on-save-skipped"]')).toHaveCount(0);
    app.expectNoForeignRequests();
});

test('closing a dirty background tab saves its original bytes and explains why Format was skipped', async ({ app }) => {
    const first = await app.writeDocument('background.md', '# Background\n\n- original\n');
    const second = await app.writeDocument('foreground.md', '# Foreground\n');
    await app.seedRecents([first, second]);
    await app.launch();
    const { page } = app;
    await page.getByTestId('document-launcher').getByRole('button', { name: 'background.md' }).click();
    await disableAutosave(page);
    await openSettings(page);
    await showSection(page, 'Markdown');
    await setSegment(page, 'Bullet marker', '*');
    await setSwitch(page, 'Format on save', true);
    await closeSettings(page);
    const raw = '# Background\n\n- original\n- edited\n';
    await appendToDocument(page, '- edited\n', raw);
    await page.getByRole('button', { name: 'File', exact: true }).click();
    await page.getByRole('menu', { name: 'File' }).getByRole('menuitem', { name: 'foreground.md' }).click();
    await expect(page.getByRole('tab', { name: 'foreground.md' })).toHaveAttribute('aria-selected', 'true');
    await page
        .getByRole('tab', { name: 'background.md' })
        .locator('..')
        .getByRole('button', { name: /^Close /u })
        .click();
    const prompt = page.locator('[data-close-prompt]');
    await expect(prompt).toBeVisible();
    await prompt.locator('[data-close-choice="save"]').click();
    await expect(page.getByRole('tab', { name: 'background.md' })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'foreground.md' })).toHaveAttribute('aria-selected', 'true');
    await expect.poll(() => readFile(first, 'utf8')).toBe(raw);
    await expect(page.locator('[data-notification-code="format-on-save-skipped"]')).toContainText('not active');
    app.expectNoForeignRequests();
});

test('the Markdown controls remain visible and keyboard usable in all six palettes', async ({ app }) => {
    await app.launch();
    const { page } = app;
    await page.setViewportSize({ width: 1280, height: 800 });
    const dialog = await openSettings(page);
    const appearanceTheme = dialog.getByRole('radiogroup', { name: 'Theme' });
    const appearanceMode = dialog.getByRole('radiogroup', { name: 'Color mode', exact: true });
    for (const [themeLabel, modeLabel, theme, mode] of palettes) {
        await showSection(page, 'Appearance');
        await appearanceTheme.getByRole('radio', { name: themeLabel, exact: true }).click();
        await appearanceMode.getByRole('radio', { name: modeLabel, exact: true }).click();
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await expect(page.locator('html')).toHaveAttribute('data-mode', mode);
        // Start at the section list, then reach the Appearance rows through Tab order.
        await dialog.getByRole('tab', { name: 'Appearance', exact: true }).focus();
        await page.keyboard.press('Tab');
        await expect(appearanceTheme.getByRole('radio', { checked: true })).toBeFocused();
        await page.keyboard.press('Tab');
        await expect(appearanceMode.getByRole('radio', { checked: true })).toBeFocused();
        await page.keyboard.press('Tab');
        await expect(
            dialog.getByRole('radiogroup', { name: 'Default open mode' }).getByRole('radio', { checked: true }),
        ).toBeFocused();
        await page.keyboard.press('Tab');
        await expect(
            dialog.getByRole('radiogroup', { name: 'Reading width' }).getByRole('radio', { checked: true }),
        ).toBeFocused();

        // The Markdown section: Tab from its section-list entry reaches each row in turn.
        await dialog.getByRole('tab', { name: 'Appearance', exact: true }).focus();
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('ArrowDown');
        await expect(dialog.getByRole('tab', { name: 'Markdown', exact: true })).toBeFocused();
        await expect(markdownGroup(page)).toBeVisible();
        const rowOrder = [
            'Markdown standard',
            'Format on save',
            'Lint on save',
            'Bullet marker',
            'Emphasis marker',
            'Heading style',
        ];
        for (const name of rowOrder) {
            const group = markdownGroups.find(([groupName]) => groupName === name);
            const unfocusedOffset =
                group === undefined
                    ? 0
                    : await markdownGroup(page)
                          .getByRole('radiogroup', { name })
                          .getByRole('radio', { name: group[1], exact: true })
                          .evaluate((element) => Number.parseFloat(getComputedStyle(element).outlineOffset));
            await page.keyboard.press('Tab');
            if (group === undefined) {
                const toggle = markdownGroup(page).getByRole('switch', { name });
                await expect(toggle).toBeFocused();
                await expect(toggle).toBeInViewport();
                const before = await toggle.isChecked();
                await page.keyboard.press('Space');
                if (before) await expect(toggle).not.toBeChecked();
                else await expect(toggle).toBeChecked();
                await page.keyboard.press('Space');
                if (before) await expect(toggle).toBeChecked();
                else await expect(toggle).not.toBeChecked();
                continue;
            }
            const [, selected, nextLabel] = group;
            const control = markdownGroup(page).getByRole('radiogroup', { name });
            const radio = control.getByRole('radio', { name: selected, exact: true });
            await expect(radio).toBeFocused();
            await expect(radio).toBeInViewport();
            await expect
                .poll(() => radio.evaluate((element) => Number.parseFloat(getComputedStyle(element).outlineOffset)))
                .toBeGreaterThan(unfocusedOffset);
            await expect(radio).toHaveAttribute('aria-checked', 'true');
            await page.keyboard.press('ArrowRight');
            const next = control.getByRole('radio', { name: nextLabel, exact: true });
            await expect(next).toHaveAttribute('aria-checked', 'true');
            await expect(next).toBeFocused();
            await page.keyboard.press('ArrowLeft');
            await expect(radio).toHaveAttribute('aria-checked', 'true');
            await expect(radio).toBeFocused();
        }
    }
    app.expectNoForeignRequests();
});
