import { guardEdits } from '../../../src/logic/tidy/equivalence';

test('when an edit changes the Full syntax tree, the guard refuses all edits', () => {
    expect(guardEdits('# Heading\n', [{ from: 0, to: 2, text: '' }])).toEqual({
        kind: 'refused',
        reason: 'render-differs',
    });
});

test('when whitespace-only edits preserve the Full tree, the guard returns the edits', () => {
    const edits = [{ from: 6, to: 7, text: '' }];
    expect(guardEdits('plain \n', edits)).toEqual({ kind: 'edits', edits });
});

test('when an unknown directive is parsed, the guard compares its original literal content', () => {
    const source = ':::custom\nkeep\n:::\n';
    expect(guardEdits(source, [])).toEqual({ kind: 'edits', edits: [] });
    expect(guardEdits(source, [{ from: 10, to: 14, text: 'drop' }])).toEqual({
        kind: 'refused',
        reason: 'render-differs',
    });
});
