import { runOnText } from '../../../src/logic/tidy/engine';
import { parseFull } from '../../../src/logic/tidy/parser';
import { applyEdits, compactEdits } from '../../../src/logic/tidy/edits';
import type { TidyPreferences } from '../../../src/logic/tidy/prefs';

const prefs: TidyPreferences = { bullet: '-', emphasis: '_', heading: 'atx' };

function compact(source: string): string {
    const result = runOnText('compact', source, prefs);
    expect(result.kind).toBe('edits');
    if (result.kind !== 'edits') throw new Error('Compact refused a safe fixture');
    return applyEdits(source, result.edits);
}

test('when prose has excess blank lines and trailing whitespace, Compact removes only those bytes', () => {
    expect(compact('first  \n\n \t\n\nsecond\t \n')).toBe('first\n\nsecond\n');
});

test('when a parsed hard break has two spaces, Compact preserves the break but strips a single space', () => {
    expect(compact('line  \nnext \n')).toBe('line  \nnext\n');
});

test('when protected syntax contains whitespace, Compact preserves the source inside each construct', () => {
    const source = [
        '---',
        'title: keep  ',
        '---',
        '',
        '```md',
        'code  ',
        '',
        '',
        '```',
        '',
        '    indented  ',
        '',
        '$$',
        'x  ',
        '$$',
        '',
        '<!-- raw  ',
        '',
        '-->',
        '',
        'outside  ',
        '',
        '',
        'done',
    ].join('\n');
    expect(compact(source)).toBe(source.replace('outside  \n\n\ndone', 'outside\n\ndone'));
});

test('when inline code spans lines, Compact preserves whitespace inside it', () => {
    const source = 'before ``one  \ntwo`` after  \n';
    expect(compact(source)).toBe('before ``one  \ntwo`` after\n');
});

test('when inline math spans lines, Compact preserves whitespace inside it', () => {
    const source = 'before $x  \ny$ after  \n';
    expect(compact(source)).toBe('before $x  \ny$ after\n');
});

test('when a document is already compact, Compact returns no edits', () => {
    expect(runOnText('compact', 'one\n\ntwo\n', prefs)).toEqual({ kind: 'edits', edits: [] });
});

test('Compact strips only ASCII horizontal whitespace and preserves hard breaks', () => {
    expect(compact('x\u00a0 \t\n')).toBe('x\u00a0\n');
    expect(compact('x \u00a0\n')).toBe('x \u00a0\n');
    expect(compact('one  \nnext\n')).toBe('one  \nnext\n');
    expect(compact('one \t\nnext\n')).toBe('one\nnext\n');
    for (const suffix of ['\r', '\u2028', '\u2029']) {
        const source = `x ${suffix}\n`;
        expect(compactEdits(source, parseFull(source))).toEqual([]);
    }
});

test('Compact handles long interior whitespace without repeated suffix scans', () => {
    const source = 'x' + ' '.repeat(40_000) + 'x\n';
    const tree = parseFull(source);
    const start = performance.now();
    const edits = compactEdits(source, tree);
    const elapsed = performance.now() - start;
    expect(edits).toEqual([]);
    expect(elapsed).toBeLessThan(1200);
});
