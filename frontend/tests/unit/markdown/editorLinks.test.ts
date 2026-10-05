import { extractEditorLinks } from '../../../src/logic/markdown/editorLinks';

it('returns clickable source ranges for inline, reference and autolinks', () => {
    const source = [
        '[label](<My Notes.md>)',
        '[named][destination] [destination] <https://example.org>',
        '',
        '[destination]: sub/b.md#setup',
    ].join('\n');

    expect(extractEditorLinks(source)).toEqual([
        {
            href: 'My Notes.md',
            range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 23 },
        },
        {
            href: 'sub/b.md#setup',
            range: { startLineNumber: 2, startColumn: 1, endLineNumber: 2, endColumn: 21 },
        },
        {
            href: 'sub/b.md#setup',
            range: { startLineNumber: 2, startColumn: 22, endLineNumber: 2, endColumn: 35 },
        },
        {
            href: 'https://example.org',
            range: { startLineNumber: 2, startColumn: 36, endLineNumber: 2, endColumn: 57 },
        },
    ]);
});

it('excludes unresolved references and links written inside code', () => {
    const source = [
        '[missing][undefined]',
        '`[inline](https://example.org)`',
        '```md',
        '[fenced](https://example.org)',
        '```',
        '[real](next.md)',
    ].join('\n');

    expect(extractEditorLinks(source)).toEqual([
        { href: 'next.md', range: { startLineNumber: 6, startColumn: 1, endLineNumber: 6, endColumn: 16 } },
    ]);
});

it('uses the first definition when a reference label is defined twice', () => {
    const source = '[go][target]\n\n[target]: first.md\n[target]: second.md';
    expect(extractEditorLinks(source)).toEqual([
        { href: 'first.md', range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 13 } },
    ]);
});
