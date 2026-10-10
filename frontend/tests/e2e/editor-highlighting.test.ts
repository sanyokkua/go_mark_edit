import { readFile } from 'node:fs/promises';
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

const source = [
    '```mermaid',
    'flowchart LR',
    'subgraph NodePlain',
    'A --> B["MERMAID_LABEL"]',
    'end',
    '%% MERMAID_COMMENT',
    '```',
    '```python',
    'def example():',
    '    return "PY_STRING"',
    '# PY_COMMENT',
    '```',
].join('\n');

async function replaceEditor(page: Page, contents: string, sentinel: string): Promise<void> {
    const editor = page.getByRole('textbox', { name: 'Editor content' });
    await expect(editor).toBeVisible();
    await editor.focus();
    const modifier = await page.evaluate(() => (navigator.userAgent.includes('Macintosh') ? 'Meta' : 'Control'));
    await editor.press(`${modifier}+A`);
    await page.keyboard.insertText(contents);
    await expect(page.locator('[data-editor-surface] .view-lines')).toContainText(sentinel);
}

async function tokenColor(page: Page, lineText: string, target: string): Promise<string> {
    const line = page.locator('[data-editor-surface] .view-line').filter({ hasText: lineText });
    await expect(line).toHaveCount(1);
    let sampled = '';
    await expect
        .poll(
            async () => {
                sampled = await line.evaluate((element, word) => {
                    if (!element.isConnected) return '';
                    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
                    const parts: Array<{ start: number; end: number; color: string }> = [];
                    let rendered = '';
                    while (walker.nextNode()) {
                        const node = walker.currentNode;
                        const text = node.textContent ?? '';
                        const parent = node.parentElement;
                        if (parent === null) throw new Error('Monaco text has no painted parent');
                        parts.push({
                            start: rendered.length,
                            end: rendered.length + text.length,
                            color: getComputedStyle(parent).color,
                        });
                        rendered += text;
                    }
                    const start = rendered.indexOf(word);
                    if (start < 0 || rendered.indexOf(word, start + word.length) >= 0) {
                        throw new Error(`Expected one ${word} in rendered Monaco line: ${rendered}`);
                    }
                    const colors = [
                        ...new Set(
                            parts
                                .filter((part) => part.end > start && part.start < start + word.length)
                                .map((part) => part.color),
                        ),
                    ];
                    if (colors.length !== 1)
                        throw new Error(`Expected one colour for ${word}: ${JSON.stringify(colors)}`);
                    return colors[0];
                }, target);
                return sampled;
            },
            { message: `painted Monaco colour for ${target}` },
        )
        .not.toBe('');
    return sampled;
}

async function paletteColor(page: Page, family: string): Promise<string> {
    return page.evaluate((name) => {
        const probe = document.createElement('span');
        probe.style.color = `var(${name.startsWith('--') ? name : `--hl-${name}`})`;
        document.body.append(probe);
        const color = getComputedStyle(probe).color;
        probe.remove();
        return color;
    }, family);
}

async function chooseAppearance(
    page: Page,
    label: string,
    mode: string,
    theme: string,
    resolvedMode: string,
): Promise<void> {
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const menu = page.getByRole('menu', { name: 'Settings menu' });
    await menu.getByRole('radio', { name: label, exact: true }).press('Space');
    await menu.getByRole('radio', { name: mode, exact: true }).press('Space');
    await page.keyboard.press('Escape');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(page.locator('html')).toHaveAttribute('data-mode', resolvedMode);
}

test('recolours Mermaid and Python source with the preview palette through every appearance', async ({ app }) => {
    test.setTimeout(180_000);
    await app.launch();
    const { page } = app;
    await newUntitledDocument(page);
    await page.getByRole('radiogroup', { name: 'View arrangement' }).getByRole('radio', { name: 'Split' }).click();
    await replaceEditor(page, source, 'PY_COMMENT');

    for (const [label, modeLabel, theme, mode] of appearances) {
        await chooseAppearance(page, label, modeLabel, theme, mode);
        for (const [line, word, family] of [
            ['flowchart LR', 'flowchart', 'keyword'],
            ['subgraph NodePlain', 'subgraph', 'keyword'],
            ['A --> B["MERMAID_LABEL"]', '-->', 'punct'],
            ['A --> B["MERMAID_LABEL"]', '"MERMAID_LABEL"', 'string'],
            ['%% MERMAID_COMMENT', 'MERMAID_COMMENT', 'comment'],
        ] as const) {
            await expect
                .poll(() => tokenColor(page, line, word), { message: `${theme}/${mode} ${word}` })
                .toBe(await paletteColor(page, family));
        }
        const plain = await tokenColor(page, 'subgraph NodePlain', 'NodePlain');
        for (const [line, word] of [
            ['flowchart LR', 'flowchart'],
            ['subgraph NodePlain', 'subgraph'],
            ['A --> B["MERMAID_LABEL"]', '"MERMAID_LABEL"'],
            ['%% MERMAID_COMMENT', 'MERMAID_COMMENT'],
        ] as const) {
            expect(await tokenColor(page, line, word)).not.toBe(plain);
        }

        for (const [line, word, family, previewClass] of [
            ['def example():', 'def', 'keyword', 'keyword'],
            ['    return "PY_STRING"', '"PY_STRING"', 'string', 'string'],
            ['# PY_COMMENT', 'PY_COMMENT', 'comment', 'comment'],
        ] as const) {
            const expected = await paletteColor(page, family);
            await expect
                .poll(() => tokenColor(page, line, word), { message: `${theme}/${mode} ${word}` })
                .toBe(expected);
            await expect(
                page.locator(`.gme-preview code.language-python .hljs-${previewClass}`).filter({ hasText: word }),
            ).toHaveCSS('color', expected);
        }
    }
    app.expectNoForeignRequests();
});

test('a saved document recolours fenced keywords across appearances without a source edit', async ({ app }) => {
    const path = await app.writeDocument('saved-highlighting.md', source);
    await app.seedRecents([path]);
    await app.launch();
    const { page } = app;
    await page.getByTestId('document-launcher').getByRole('button', { name: 'saved-highlighting.md' }).click();
    await expect(page.getByRole('textbox', { name: 'Editor content' })).toBeVisible();
    const initialKeyword = await paletteColor(page, 'keyword');
    await expect.poll(() => tokenColor(page, 'flowchart LR', 'flowchart')).toBe(initialKeyword);
    await expect.poll(() => tokenColor(page, 'def example():', 'def')).toBe(initialKeyword);
    await page.getByRole('radiogroup', { name: 'View arrangement' }).getByRole('radio', { name: 'Editor' }).click();
    await expect(page.locator('[aria-label="Document identity"]')).toContainText('Saved');

    for (const [label, modeLabel, theme, mode] of appearances) {
        await chooseAppearance(page, label, modeLabel, theme, mode);
        await expect(page.getByRole('textbox', { name: 'Editor content' })).not.toBeFocused();
        const expected = await paletteColor(page, 'keyword');
        for (const [line, word] of [
            ['flowchart LR', 'flowchart'],
            ['subgraph NodePlain', 'subgraph'],
            ['end', 'end'],
            ['def example():', 'def'],
            ['    return "PY_STRING"', 'return'],
        ] as const) {
            await expect
                .poll(() => tokenColor(page, line, word), { message: `${theme}/${mode} saved ${word}` })
                .toBe(expected);
        }
        await expect(page.locator('[aria-label="Document identity"]')).toContainText('Saved');
    }

    expect(await readFile(path, 'utf8')).toBe(source);
    app.expectNoForeignRequests();
});

test('keeps tilde fenced Python source plain while backtick fenced Python is coloured', async ({ app }) => {
    await app.launch();
    const { page } = app;
    await newUntitledDocument(page);
    await replaceEditor(
        page,
        ['~~~python', 'def tilde_sample():', '    return "TILDE_STRING"', '~~~'].join('\n'),
        'TILDE_STRING',
    );
    const codeForeground = await paletteColor(page, '--code-fg');
    await expect.poll(() => tokenColor(page, 'def tilde_sample():', 'def')).toBe(codeForeground);
    await expect.poll(() => tokenColor(page, 'def tilde_sample():', 'tilde_sample')).toBe(codeForeground);
    const plain = await tokenColor(page, 'def tilde_sample():', 'def');
    expect(plain).toBe(await tokenColor(page, 'def tilde_sample():', 'tilde_sample'));
    expect(plain).not.toBe(await paletteColor(page, 'keyword'));
    await replaceEditor(
        page,
        ['```python', 'def backtick_sample():', '    return "BACKTICK_STRING"', '```'].join('\n'),
        'BACKTICK_STRING',
    );
    await expect
        .poll(() => tokenColor(page, 'def backtick_sample():', 'def'))
        .toBe(await paletteColor(page, 'keyword'));
    app.expectNoForeignRequests();
});

interface FenceSample {
    id: string;
    code: string;
    line: string;
    word: string;
    family: string;
}

const fenceSamples: readonly FenceSample[] = [
    { id: 'javascript', code: 'const sample = "value";', line: 'const sample', word: 'const', family: 'keyword' },
    {
        id: 'typescript',
        code: 'const sample: string = "value";',
        line: 'const sample',
        word: 'const',
        family: 'keyword',
    },
    { id: 'go', code: 'func sample() {}', line: 'func sample', word: 'func', family: 'keyword' },
    { id: 'python', code: 'def sample(): pass', line: 'def sample', word: 'def', family: 'keyword' },
    { id: 'java', code: 'class Sample {}', line: 'class Sample', word: 'class', family: 'keyword' },
    { id: 'c', code: 'int sample() { return 0; }', line: 'int sample', word: 'return', family: 'keyword' },
    { id: 'cpp', code: 'int sample() { return 0; }', line: 'int sample', word: 'return', family: 'keyword' },
    { id: 'csharp', code: 'class Sample {}', line: 'class Sample', word: 'class', family: 'keyword' },
    { id: 'rust', code: 'fn sample() {}', line: 'fn sample', word: 'fn', family: 'keyword' },
    { id: 'ruby', code: 'def sample; end', line: 'def sample', word: 'def', family: 'keyword' },
    { id: 'php', code: '<?php echo "value"; ?>', line: 'php echo', word: 'echo', family: 'keyword' },
    { id: 'kotlin', code: 'fun sample() {}', line: 'fun sample', word: 'fun', family: 'keyword' },
    { id: 'swift', code: 'func sample() {}', line: 'func sample', word: 'func', family: 'keyword' },
    { id: 'sql', code: 'SELECT title FROM records;', line: 'SELECT title', word: 'SELECT', family: 'keyword' },
    { id: 'json', code: '{"sample": "value"}', line: 'sample', word: '"sample"', family: 'attr' },
    { id: 'yaml', code: 'sample: "YAML_VALUE"', line: 'YAML_VALUE', word: '"YAML_VALUE"', family: 'string' },
    { id: 'xml', code: '<sample attr="value"/>', line: 'sample attr', word: 'sample', family: 'attr' },
    { id: 'html', code: '<sample attr="value"/>', line: 'sample attr', word: 'sample', family: 'attr' },
    { id: 'css', code: 'sample { color: red; }', line: 'color: red', word: 'color', family: 'attr' },
    { id: 'scss', code: 'sample { color: red; }', line: 'color: red', word: 'color', family: 'attr' },
    { id: 'powershell', code: 'function Sample {}', line: 'function Sample', word: 'function', family: 'keyword' },
    { id: 'dockerfile', code: 'FROM alpine', line: 'FROM alpine', word: 'FROM', family: 'keyword' },
    { id: 'shell', code: 'if true; then echo yes; fi', line: 'if true', word: 'if', family: 'keyword' },
    { id: 'markdown', code: '# Sample heading', line: '# Sample heading', word: '#', family: 'function' },
    { id: 'ini', code: 'sample="INI_VALUE"', line: 'INI_VALUE', word: '"INI_VALUE"', family: 'string' },
    { id: 'diff', code: '+added marker', line: '+added marker', word: 'added', family: 'string' },
    {
        id: 'makefile',
        code: 'sample_target:\n\t@echo value',
        line: 'sample_target:',
        word: 'sample_target',
        family: 'type',
    },
    { id: 'jsx', code: 'const sample = "value";', line: 'const sample', word: 'const', family: 'keyword' },
    { id: 'tsx', code: 'const sample: string = "value";', line: 'const sample', word: 'const', family: 'keyword' },
    { id: 'bash', code: 'if true; then echo yes; fi', line: 'if true', word: 'if', family: 'keyword' },
    { id: 'zsh', code: 'if true; then echo yes; fi', line: 'if true', word: 'if', family: 'keyword' },
    { id: 'console', code: 'if true; then echo yes; fi', line: 'if true', word: 'if', family: 'keyword' },
    { id: 'md', code: '# Sample heading', line: '# Sample heading', word: '#', family: 'function' },
    { id: 'cs', code: 'class Sample {}', line: 'class Sample', word: 'class', family: 'keyword' },
    { id: 'rs', code: 'fn sample() {}', line: 'fn sample', word: 'fn', family: 'keyword' },
    { id: 'kt', code: 'fun sample() {}', line: 'fun sample', word: 'fun', family: 'keyword' },
    { id: 'docker', code: 'FROM alpine', line: 'FROM alpine', word: 'FROM', family: 'keyword' },
    { id: 'patch', code: '+added marker', line: '+added marker', word: 'added', family: 'string' },
    {
        id: 'make',
        code: 'sample_target:\n\t@echo value',
        line: 'sample_target:',
        word: 'sample_target',
        family: 'type',
    },
    { id: 'mk', code: 'sample_target:\n\t@echo value', line: 'sample_target:', word: 'sample_target', family: 'type' },
    { id: 'toml', code: 'sample="TOML_VALUE"', line: 'TOML_VALUE', word: '"TOML_VALUE"', family: 'string' },
];

test('tokenises every supported canonical and alias fence in the real editor', { tag: '@perf' }, async ({ app }) => {
    test.setTimeout(180_000);
    await app.launch();
    const { page } = app;
    await newUntitledDocument(page);
    await page.getByRole('radiogroup', { name: 'View arrangement' }).getByRole('radio', { name: 'Editor' }).click();
    const failures: string[] = [];
    for (const { id, code, line, word, family } of fenceSamples) {
        await replaceEditor(page, ['```' + id, code, '```'].join('\n'), line);
        const expected = await paletteColor(page, family);
        try {
            await expect
                .poll(() => tokenColor(page, line, word), { message: `${id} fence must colour ${word}` })
                .toBe(expected);
        } catch {
            const actual = await tokenColor(page, line, word);
            failures.push(`${id}: ${word} was ${actual}, expected ${expected}`);
        }
    }
    expect(failures).toEqual([]);
    app.expectNoForeignRequests();
});

test('colours structural JSON, diff, and Makefile tokens from the shared palette', async ({ app }) => {
    await app.launch();
    const { page } = app;
    await newUntitledDocument(page);
    await page.getByRole('radiogroup', { name: 'View arrangement' }).getByRole('radio', { name: 'Editor' }).click();
    for (const [id, code, checks] of [
        [
            'json',
            '{"sample": "JSON_VALUE", "count": 123}',
            [
                ['"sample"', 'attr'],
                ['"JSON_VALUE"', 'string'],
                ['123', 'number'],
            ],
        ],
        [
            'diff',
            'diff --git a/a b/a\n@@ -1 +1 @@\n-removed marker\n+added marker',
            [
                ['diff', 'keyword'],
                ['-1', 'number'],
                ['removed', 'comment'],
                ['added', 'string'],
            ],
        ],
        [
            'makefile',
            'sample_target:\n\t@echo MAKE_RECIPE\n# MAKE_COMMENT',
            [
                ['sample_target', 'type'],
                ['MAKE_RECIPE', 'string'],
                ['MAKE_COMMENT', 'comment'],
            ],
        ],
    ] as const) {
        await replaceEditor(page, ['```' + id, code, '```'].join('\n'), code.split('\n').at(-1) ?? code);
        for (const [word, family] of checks) {
            const line = code.split('\n').find((candidate) => candidate.includes(word));
            if (line === undefined) throw new Error(`Missing ${word} fixture line`);
            await expect
                .poll(() => tokenColor(page, line, word), { message: `${id} ${word}` })
                .toBe(await paletteColor(page, family));
        }
    }
    app.expectNoForeignRequests();
});

test('recolours CSS numbers, units, and hex values through every appearance', { tag: '@perf' }, async ({ app }) => {
    await app.launch();
    const { page } = app;
    await newUntitledDocument(page);
    await page.getByRole('radiogroup', { name: 'View arrangement' }).getByRole('radio', { name: 'Editor' }).click();
    await replaceEditor(page, ['```css', 'sample { width: 12px; color: #abc; }', '```'].join('\n'), '#abc');
    for (const [label, modeLabel, theme, mode] of appearances) {
        await chooseAppearance(page, label, modeLabel, theme, mode);
        const expected = await paletteColor(page, 'number');
        for (const token of ['12', 'px', '#abc']) {
            await expect.poll(() => tokenColor(page, 'sample { width:', token)).toBe(expected);
        }
    }
    app.expectNoForeignRequests();
});

interface CategorySample {
    ids: readonly string[];
    code: string;
    checks: readonly (readonly [line: string, word: string, family: string])[];
}

// Each alias uses its canonical grammar's source. JSON has no comments; INI and Makefile have
// no keyword class; Markdown uses heading, strong, and emphasis instead of code keywords.
const categorySamples: readonly CategorySample[] = [
    {
        ids: ['javascript', 'typescript', 'jsx', 'tsx'],
        code: 'const value = "STRING_SAMPLE"; // COMMENT_SAMPLE',
        checks: [
            ['const value', 'const', 'keyword'],
            ['STRING_SAMPLE', 'STRING_SAMPLE', 'string'],
            ['COMMENT_SAMPLE', 'COMMENT_SAMPLE', 'comment'],
        ],
    },
    {
        ids: ['go'],
        code: 'func sample() { value := "STRING_SAMPLE" } // COMMENT_SAMPLE',
        checks: [
            ['func sample', 'func', 'keyword'],
            ['STRING_SAMPLE', 'STRING_SAMPLE', 'string'],
            ['COMMENT_SAMPLE', 'COMMENT_SAMPLE', 'comment'],
        ],
    },
    {
        ids: ['java', 'csharp', 'cs'],
        code: 'class Sample { String value = "STRING_SAMPLE"; } // COMMENT_SAMPLE',
        checks: [
            ['class Sample', 'class', 'keyword'],
            ['STRING_SAMPLE', 'STRING_SAMPLE', 'string'],
            ['COMMENT_SAMPLE', 'COMMENT_SAMPLE', 'comment'],
        ],
    },
    {
        ids: ['c', 'cpp'],
        code: 'int sample() { return "STRING_SAMPLE"[0]; } // COMMENT_SAMPLE',
        checks: [
            ['return', 'return', 'keyword'],
            ['STRING_SAMPLE', 'STRING_SAMPLE', 'string'],
            ['COMMENT_SAMPLE', 'COMMENT_SAMPLE', 'comment'],
        ],
    },
    {
        ids: ['python'],
        code: 'def sample(): return "STRING_SAMPLE" # COMMENT_SAMPLE',
        checks: [
            ['def sample', 'def', 'keyword'],
            ['STRING_SAMPLE', 'STRING_SAMPLE', 'string'],
            ['COMMENT_SAMPLE', 'COMMENT_SAMPLE', 'comment'],
        ],
    },
    {
        ids: ['rust', 'rs'],
        code: 'fn sample() { let value = "STRING_SAMPLE"; } // COMMENT_SAMPLE',
        checks: [
            ['fn sample', 'fn', 'keyword'],
            ['STRING_SAMPLE', 'STRING_SAMPLE', 'string'],
            ['COMMENT_SAMPLE', 'COMMENT_SAMPLE', 'comment'],
        ],
    },
    {
        ids: ['ruby'],
        code: 'def sample; value = "STRING_SAMPLE"; end # COMMENT_SAMPLE',
        checks: [
            ['def sample', 'def', 'keyword'],
            ['STRING_SAMPLE', 'STRING_SAMPLE', 'string'],
            ['COMMENT_SAMPLE', 'COMMENT_SAMPLE', 'comment'],
        ],
    },
    {
        ids: ['php'],
        code: '<?php echo "STRING_SAMPLE"; // COMMENT_SAMPLE',
        checks: [
            ['php echo', 'echo', 'keyword'],
            ['STRING_SAMPLE', 'STRING_SAMPLE', 'string'],
            ['COMMENT_SAMPLE', 'COMMENT_SAMPLE', 'comment'],
        ],
    },
    {
        ids: ['kotlin', 'kt'],
        code: 'fun sample() { val value = "STRING_SAMPLE" } // COMMENT_SAMPLE',
        checks: [
            ['fun sample', 'fun', 'keyword'],
            ['STRING_SAMPLE', 'STRING_SAMPLE', 'string'],
            ['COMMENT_SAMPLE', 'COMMENT_SAMPLE', 'comment'],
        ],
    },
    {
        ids: ['swift'],
        code: 'func sample() { let value = "STRING_SAMPLE" } // COMMENT_SAMPLE',
        checks: [
            ['func sample', 'func', 'keyword'],
            ['STRING_SAMPLE', 'STRING_SAMPLE', 'string'],
            ['COMMENT_SAMPLE', 'COMMENT_SAMPLE', 'comment'],
        ],
    },
    {
        ids: ['sql'],
        code: "SELECT 'STRING_SAMPLE'; -- COMMENT_SAMPLE",
        checks: [
            ['SELECT', 'SELECT', 'keyword'],
            ['STRING_SAMPLE', 'STRING_SAMPLE', 'string'],
            ['COMMENT_SAMPLE', 'COMMENT_SAMPLE', 'comment'],
        ],
    },
    {
        ids: ['yaml'],
        code: 'enabled: true\nsample: "STRING_SAMPLE" # COMMENT_SAMPLE',
        checks: [
            ['enabled: true', 'true', 'keyword'],
            ['STRING_SAMPLE', 'STRING_SAMPLE', 'string'],
            ['COMMENT_SAMPLE', 'COMMENT_SAMPLE', 'comment'],
        ],
    },
    {
        ids: ['ini', 'toml'],
        code: 'sample="STRING_SAMPLE"\n# COMMENT_SAMPLE',
        checks: [
            ['STRING_SAMPLE', 'STRING_SAMPLE', 'string'],
            ['COMMENT_SAMPLE', 'COMMENT_SAMPLE', 'comment'],
        ],
    },
    {
        ids: ['xml', 'html'],
        code: '<sample attr="STRING_SAMPLE">\n<!-- COMMENT_SAMPLE -->\n</sample>',
        checks: [
            ['<sample attr', 'sample', 'attr'],
            ['STRING_SAMPLE', 'STRING_SAMPLE', 'string'],
            ['COMMENT_SAMPLE', 'COMMENT_SAMPLE', 'comment'],
        ],
    },
    {
        ids: ['css', 'scss'],
        code: 'sample { content: "STRING_SAMPLE"; } /* COMMENT_SAMPLE */',
        checks: [
            ['content:', 'content', 'attr'],
            ['STRING_SAMPLE', 'STRING_SAMPLE', 'string'],
            ['COMMENT_SAMPLE', 'COMMENT_SAMPLE', 'comment'],
        ],
    },
    {
        ids: ['powershell'],
        code: 'function Sample { "STRING_SAMPLE" } # COMMENT_SAMPLE',
        checks: [
            ['function Sample', 'function', 'keyword'],
            ['STRING_SAMPLE', 'STRING_SAMPLE', 'string'],
            ['COMMENT_SAMPLE', 'COMMENT_SAMPLE', 'comment'],
        ],
    },
    {
        ids: ['dockerfile', 'docker'],
        code: 'FROM alpine\nRUN echo "STRING_SAMPLE"\n# COMMENT_SAMPLE',
        checks: [
            ['FROM alpine', 'FROM', 'keyword'],
            ['STRING_SAMPLE', 'STRING_SAMPLE', 'string'],
            ['COMMENT_SAMPLE', 'COMMENT_SAMPLE', 'comment'],
        ],
    },
    {
        ids: ['shell', 'bash', 'zsh', 'console'],
        code: 'if true; then echo "STRING_SAMPLE"; fi # COMMENT_SAMPLE',
        checks: [
            ['if true', 'if', 'keyword'],
            ['STRING_SAMPLE', 'STRING_SAMPLE', 'string'],
            ['COMMENT_SAMPLE', 'COMMENT_SAMPLE', 'comment'],
        ],
    },
    {
        ids: ['diff', 'patch'],
        code: 'diff --git a/a b/a\n-removed marker\n+added marker',
        checks: [
            ['diff --git', 'diff', 'keyword'],
            ['-removed', 'removed', 'comment'],
            ['+added', 'added', 'string'],
        ],
    },
    {
        ids: ['makefile', 'make', 'mk'],
        code: 'sample_target:\n\t@echo STRING_SAMPLE\n# COMMENT_SAMPLE',
        checks: [
            ['sample_target:', 'sample_target', 'type'],
            ['STRING_SAMPLE', 'STRING_SAMPLE', 'string'],
            ['COMMENT_SAMPLE', 'COMMENT_SAMPLE', 'comment'],
        ],
    },
    {
        ids: ['json'],
        code: '{"sample": "STRING_SAMPLE", "enabled": true}',
        checks: [
            ['"sample"', '"sample"', 'attr'],
            ['STRING_SAMPLE', 'STRING_SAMPLE', 'string'],
            ['true', 'true', 'keyword'],
        ],
    },
    {
        ids: ['markdown', 'md'],
        code: '# Heading\n**STRONG_SAMPLE**\n*EMPHASIS_SAMPLE*',
        checks: [
            ['# Heading', '#', 'function'],
            ['STRONG_SAMPLE', 'STRONG_SAMPLE', 'number'],
            ['EMPHASIS_SAMPLE', 'EMPHASIS_SAMPLE', 'keyword'],
        ],
    },
];

test('colours supported source categories in every canonical and alias fence', { tag: '@perf' }, async ({ app }) => {
    test.setTimeout(180_000);
    expect(categorySamples.flatMap(({ ids }) => ids).sort()).toEqual(fenceSamples.map(({ id }) => id).sort());
    await app.launch();
    const { page } = app;
    await newUntitledDocument(page);
    await page.getByRole('radiogroup', { name: 'View arrangement' }).getByRole('radio', { name: 'Editor' }).click();
    const failures: string[] = [];
    for (const { ids, code, checks } of categorySamples) {
        for (const id of ids) {
            await replaceEditor(page, ['```' + id, code, '```'].join('\n'), checks.at(-1)?.[0] ?? code);
            for (const [line, word, family] of checks) {
                const expected = await paletteColor(page, family);
                try {
                    await expect.poll(() => tokenColor(page, line, word), { message: `${id} ${word}` }).toBe(expected);
                } catch {
                    failures.push(`${id}: ${word} was ${await tokenColor(page, line, word)}, expected ${expected}`);
                }
            }
        }
    }
    expect(failures).toEqual([]);
    app.expectNoForeignRequests();
});
