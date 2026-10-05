import { splitIntoChunks } from '../../../src/logic/tidy/chunking';
import { runOnText } from '../../../src/logic/tidy/engine';
import { applyEdits, compactEdits, formatEdits } from '../../../src/logic/tidy/edits';
import { guardEdits } from '../../../src/logic/tidy/equivalence';
import { visit } from 'unist-util-visit';
import { parseFull } from '../../../src/logic/tidy/parser';
import type { TidyPreferences } from '../../../src/logic/tidy/prefs';

const prefs: TidyPreferences = { bullet: '-', emphasis: '_', heading: 'atx' };

test('when input is exactly 256 KiB in UTF-8, it remains one chunk', () => {
    const source = 'a'.repeat(256 * 1024);
    expect(splitIntoChunks(source)).toEqual([{ offset: 0, text: source }]);
});

test('when UTF-8 input exceeds the limit, a qualifying heading starts a chunk at a UTF-16 offset', () => {
    const prefix = '漢'.repeat(88_000) + '\n\n';
    const source = prefix + '# next\nline  \n';
    const chunks = splitIntoChunks(source);
    expect(chunks).toHaveLength(2);
    expect(chunks[1]).toEqual({ offset: prefix.length, text: '# next\nline  \n' });
});

test('when headings occur inside protected blocks, chunking ignores them', () => {
    const source = [
        '---',
        '# yaml',
        '---',
        '',
        '```md',
        '# fence',
        '```',
        '',
        '~~~md',
        '# tilde',
        '~~~',
        '',
        '<!--',
        '# comment',
        '-->',
        '',
        '$$',
        '# math',
        '$$',
        '',
        ':::note',
        '# directive',
        ':::',
        '',
        'x'.repeat(256 * 1024),
        '',
        '# real',
        'tail',
    ].join('\n');
    const chunks = splitIntoChunks(source);
    expect(chunks).toHaveLength(2);
    expect(chunks[1].text).toBe('# real\ntail');
    expect(chunks.map((chunk) => chunk.text).join('')).toBe(source);
});

test('when display math opens with same-line content, chunking keeps its headings inside the math node', () => {
    const source = '$$ x\n\n# inside\n$$\n\n' + 'x'.repeat(256 * 1024) + '\n\n# after\nend  \n';
    const chunks = splitIntoChunks(source);
    expect(chunks).toHaveLength(2);
    expect(chunks[1].text.slice(0, 20)).toBe('# after\nend  \n');
    expect(chunks[1].text).toHaveLength('# after\nend  \n'.length);
    expect(chunks[0].text).toContain('$$ x\n\n# inside\n$$');
    const result = runOnText('compact', source, prefs);
    expect(result.kind).toBe('edits');
    if (result.kind !== 'edits') throw new Error('Expected safe Compact edits');
    expect(applyEdits(source, result.edits)).toBe(source.replace('end  \n', 'end\n'));
    expect(applyEdits(source, result.edits)).toBe(applyEdits(source, compactEdits(source, parseFull(source))));
});

test('when display math uses a longer dollar fence, chunking respects the matching close length', () => {
    const source =
        '$$$ meta\n\n# inside\n$$\n\n# still inside\n$$$\n\n' + 'x'.repeat(256 * 1024) + '\n\n# after\nend  \n';
    const chunks = splitIntoChunks(source);
    expect(chunks).toHaveLength(2);
    expect(chunks[1].text.slice(0, 20)).toBe('# after\nend  \n');
    const result = runOnText('compact', source, prefs);
    expect(result.kind).toBe('edits');
    if (result.kind !== 'edits') throw new Error('Expected safe Compact edits');
    expect(applyEdits(source, result.edits).endsWith('# after\nend\n')).toBe(true);
});

test.each(['--- ', '---\t', '\uFEFF---', '\uFEFF--- '])(
    'when front matter opens with %s, chunking keeps its headings and delimiter bytes protected',
    (opener) => {
        const source = opener + '\n\n# inside\n---\n\n' + 'x'.repeat(256 * 1024) + '\n\n# after\nend  \n';
        const chunks = splitIntoChunks(source);
        expect(chunks).toHaveLength(2);
        expect(chunks[1].text.slice(0, 20)).toBe('# after\nend  \n');
        const result = runOnText('compact', source, prefs);
        expect(result.kind).toBe('edits');
        if (result.kind !== 'edits') throw new Error('Expected safe Compact edits');
        const output = applyEdits(source, result.edits);
        expect(output.startsWith(opener + '\n\n# inside\n---')).toBe(true);
        expect(output.endsWith('# after\nend\n')).toBe(true);
        expect(output).toBe(applyEdits(source, compactEdits(source, parseFull(source))));
    },
);

test('when chunks contain Compact edits, whole-document offsets produce the same text as a single parse', () => {
    const prefix = 'x'.repeat(256 * 1024) + '\n\n';
    const source = prefix + '# second\n\n\nline  \n';
    const result = runOnText('compact', source, prefs);
    expect(result.kind).toBe('edits');
    if (result.kind !== 'edits') throw new Error('Expected safe chunk edits');
    expect(applyEdits(source, result.edits)).toBe(prefix + '# second\n\nline\n');
    expect(result.edits.every((edit) => edit.from >= prefix.length)).toBe(true);
    expect(applyEdits(source, result.edits)).toBe(applyEdits(source, compactEdits(source, parseFull(source))));
});

test('when HTML block forms contain heading text, chunking does not split within them', () => {
    const forms = [
        '<textarea>\n\n# hidden\n</textarea>',
        '<?xml test\n\n# hidden\n?>',
        '<![CDATA[\n\n# hidden\n]]>',
        '<!DOCTYPE\n\n# hidden\n>',
        '<div>\n# hidden\n</div>',
    ];
    for (const form of forms) {
        const source = form + '\n\n' + 'x'.repeat(256 * 1024) + '\n\n# real\ntext';
        const chunks = splitIntoChunks(source);
        expect(chunks).toHaveLength(2);
        expect(chunks[1].text).toBe('# real\ntext');
    }
});

test('when reference definitions can affect later chunks, chunking conservatively keeps one parse context', () => {
    const source = '[ref]: /target\n\n' + 'x'.repeat(256 * 1024) + '\n\n# next\n[ref]';
    expect(splitIntoChunks(source)).toEqual([{ offset: 0, text: source }]);
});

test.each([
    ['[a\\]b]: /target', '[a\\]b]'],
    ['> [foo]: /target', '[foo]'],
    ['[multi\nline]: /target', '[multi line]'],
])('when %s defines a later reference, chunking keeps the document in one parse context', (definition, reference) => {
    const source = definition + '\n\n' + 'x'.repeat(256 * 1024) + '\n\n# next\n' + reference + '\n';
    const chunks = splitIntoChunks(source);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe(source);
});

test.each(['plain ]: prose\n\n', '```md\n[foo]: /target\n```\n\n'])(
    'when %s is not a reference definition, a safe later heading still starts a chunk',
    (prefix) => {
        const source = prefix + 'x'.repeat(256 * 1024) + '\n\n# next\ntext';
        const chunks = splitIntoChunks(source);
        expect(chunks).toHaveLength(2);
        expect(chunks[1].text).toBe('# next\ntext');
    },
);

test.each(['script', 'pre', 'style', 'textarea', 'SCRIPT'])(
    'when a %s HTML opener ends at the tag name, chunking preserves its exact protected bytes',
    (tag) => {
        const html = `<${tag}\n\n# inside  \n</${tag}>`;
        const source = html + '\n\n' + 'x'.repeat(256 * 1024) + '\n\n# after\nend  \n';
        const chunks = splitIntoChunks(source);
        expect(chunks).toHaveLength(2);
        expect(chunks[1].text).toBe('# after\nend  \n');
        const original = parseFull(source);
        expect(original.children[0].type).toBe('html');
        const result = runOnText('compact', source, prefs);
        expect(result.kind).toBe('edits');
        if (result.kind !== 'edits') throw new Error('Expected safe Compact edits');
        const output = applyEdits(source, result.edits);
        expect(output).toBe(source.replace('end  \n', 'end\n'));
        expect(output.startsWith(html)).toBe(true);
        expect(output).toBe(applyEdits(source, compactEdits(source, original)));
        expect(guardEdits(source, result.edits, original).kind).toBe('edits');
        const formatted = runOnText('format', source, prefs);
        expect(formatted.kind).toBe('edits');
        if (formatted.kind !== 'edits') throw new Error('Expected safe Format edits');
        const formattedText = applyEdits(source, formatted.edits);
        expect(formattedText.startsWith(html)).toBe(true);
        expect(guardEdits(source, formatted.edits, original).kind).toBe('edits');
        expect(runOnText('format', formattedText, prefs)).toEqual({ kind: 'edits', edits: [] });
    },
);

test.each([
    '- item\n\n    [*x*]: /target',
    '>   [*x*]: /target',
    '- item\n\n\t[*x*]: /target',
    '> - item\n>\n>     [*x*]: /target',
    '123. item\n\n       [*x*]: /target',
    '- outer\n  - inner\n\n      [*x*]: /target',
])('when a container defines %s, Format preserves the global reference or refuses all edits', (definition) => {
    const source = definition + '\n\n' + 'x'.repeat(256 * 1024) + '\n\n# next\n[*x*]\n';
    const original = parseFull(source);
    const links: string[] = [];
    visit(original, 'linkReference', (node) => {
        links.push(node.identifier);
    });
    expect(links).toEqual(['*x*']);
    const result = runOnText('format', source, prefs);
    expect(result).toEqual({ kind: 'refused', reason: 'render-differs' });
    expect(result).toEqual(guardEdits(source, formatEdits(source, original, prefs), original));
    expect(splitIntoChunks(source)).toEqual([{ offset: 0, text: source }]);
});

test.each([
    '    [*x*]: /target\n\n',
    '>     [*x*]: /target\n\n',
    '- item\n\n      [*x*]: /target\n\n',
    'paragraph\n[*x*]: /target\n\n',
    '- ```md\n  [*x*]: /target\n  ```\n\n',
])('when %s is code or paragraph text, safe headings still split the document', (prefix) => {
    const source = prefix + 'x'.repeat(256 * 1024) + '\n\n# next\ntext';
    const definitions: string[] = [];
    visit(parseFull(source), 'definition', (node) => {
        definitions.push(node.identifier);
    });
    expect(definitions).toEqual([]);
    const chunks = splitIntoChunks(source);
    expect(chunks).toHaveLength(2);
    expect(chunks[1].text).toBe('# next\ntext');
});

test.each(['>   [^note]: footnote', '- item\n\n    [^note]: footnote'])(
    'when %s defines a later footnote, Format retains one Full parse context',
    (definition) => {
        const source = definition + '\n\n' + 'x'.repeat(256 * 1024) + '\n\n# next\nuse[^note]\n';
        const original = parseFull(source);
        const definitions: string[] = [];
        visit(original, 'footnoteDefinition', (node) => {
            definitions.push(node.identifier);
        });
        expect(definitions).toEqual(['note']);
        expect(splitIntoChunks(source)).toEqual([{ offset: 0, text: source }]);
        const result = runOnText('format', source, prefs);
        expect(result.kind).toBe('edits');
        if (result.kind !== 'edits') throw new Error('Expected safe footnote edits');
        expect(guardEdits(source, result.edits, original).kind).toBe('edits');
        expect(runOnText('format', applyEdits(source, result.edits), prefs)).toEqual({ kind: 'edits', edits: [] });
    },
);

test('when an indented definition follows an earlier reference chunk, Format refuses to break that link', () => {
    const source = '[*x*]\n\n' + 'x'.repeat(256 * 1024) + '\n\n# definitions\n\n>   [*x*]: /target\n';
    const original = parseFull(source);
    const links: string[] = [];
    visit(original, 'linkReference', (node) => {
        links.push(node.identifier);
    });
    expect(links).toEqual(['*x*']);
    expect(splitIntoChunks(source)).toEqual([{ offset: 0, text: source }]);
    expect(runOnText('format', source, prefs)).toEqual({ kind: 'refused', reason: 'render-differs' });
});

const containerFences = ['```', '~~~'].flatMap((marker) => [
    { marker, prefix: '- ', continuation: '  ' },
    { marker, prefix: '> ', continuation: '> ' },
    { marker, prefix: '> - ', continuation: '>   ' },
    { marker, prefix: '123. ', continuation: '     ' },
    { marker, prefix: '-\t', continuation: '\t' },
]);

test.each(containerFences)(
    'when a $prefix container closes its $marker fence, a later safe heading still starts a chunk',
    ({ marker, prefix, continuation }) => {
        const nested = `${prefix}${marker}md\n${continuation}nested\n${continuation}${marker}\n\n`;
        const source = nested + 'x'.repeat(256 * 1024) + '\n\n# next\ntext';
        const chunks = splitIntoChunks(source);
        expect(chunks).toHaveLength(2);
        expect(chunks[0].text.startsWith(nested)).toBe(true);
        expect(chunks[1].text).toBe('# next\ntext');
    },
);

test.each(containerFences)(
    'when a root fence follows a closed $prefix container $marker fence, tidy preserves all code bytes',
    ({ marker, prefix, continuation }) => {
        const nested = `${prefix}${marker}md\n${continuation}nested\n${continuation}${marker}\n\n`;
        const rootCode = `${marker}\n\n# protected  \n${marker}`;
        const source = nested + rootCode + '\n\n' + 'x'.repeat(256 * 1024) + '\n\n# next\nend  \n';
        const original = parseFull(source);
        const codeRanges: { from: number; to: number }[] = [];
        visit(original, 'code', (node) => {
            const from = node.position?.start.offset;
            const to = node.position?.end.offset;
            if (from !== undefined && to !== undefined) codeRanges.push({ from, to });
        });
        expect(codeRanges).toHaveLength(2);
        const chunks = splitIntoChunks(source);
        expect(chunks).toHaveLength(2);
        expect(chunks[1].text).toBe('# next\nend  \n');
        for (const chunk of chunks) {
            expect(codeRanges.some((range) => chunk.offset > range.from && chunk.offset < range.to)).toBe(false);
        }
        const compact = runOnText('compact', source, prefs);
        expect(compact.kind).toBe('edits');
        if (compact.kind !== 'edits') throw new Error('Expected safe Compact edits');
        const compacted = applyEdits(source, compact.edits);
        expect(compacted).toBe(source.replace('end  \n', 'end\n'));
        expect(compacted).toBe(applyEdits(source, compactEdits(source, original)));
        const formatted = runOnText('format', source, prefs);
        expect(formatted.kind).toBe('edits');
        if (formatted.kind !== 'edits') throw new Error('Expected safe Format edits');
        const output = applyEdits(source, formatted.edits);
        for (const range of codeRanges) expect(output).toContain(source.slice(range.from, range.to));
        expect(output).toContain(rootCode);
        expect(output).toBe(applyEdits(source, formatEdits(source, original, prefs)));
        expect(guardEdits(source, formatted.edits, original).kind).toBe('edits');
        expect(runOnText('format', output, prefs)).toEqual({ kind: 'edits', edits: [] });
    },
);

test.each(['- ```\n  nested\n', '> ~~~\n> nested\n'])(
    'when a container ends without an explicit fence close, its %s fence does not consume a later root block',
    (nested) => {
        const source = nested + '\n```\n\n# protected  \n```\n\n' + 'x'.repeat(256 * 1024) + '\n\n# next\nend  \n';
        const chunks = splitIntoChunks(source);
        expect(chunks).toHaveLength(2);
        expect(chunks[1].text).toBe('# next\nend  \n');
        const result = runOnText('compact', source, prefs);
        expect(result.kind).toBe('edits');
        if (result.kind !== 'edits') throw new Error('Expected safe Compact edits');
        expect(applyEdits(source, result.edits)).toBe(source.replace('end  \n', 'end\n'));
    },
);

test('when a document contains both a nested fence and a reference definition, Format keeps the global context', () => {
    const source = '- ```md\n  code\n  ```\n\n>   [*x*]: /target\n\n' + 'x'.repeat(256 * 1024) + '\n\n# next\n[*x*]\n';
    expect(splitIntoChunks(source)).toEqual([{ offset: 0, text: source }]);
    const original = parseFull(source);
    const links: string[] = [];
    visit(original, 'linkReference', (node) => {
        links.push(node.identifier);
    });
    expect(links).toEqual(['*x*']);
    expect(runOnText('format', source, prefs)).toEqual({ kind: 'refused', reason: 'render-differs' });
});
