import { splitIntoChunks } from '../../../src/logic/tidy/chunking';
import { runOnText } from '../../../src/logic/tidy/engine';
import { applyEdits, compactEdits } from '../../../src/logic/tidy/edits';
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
