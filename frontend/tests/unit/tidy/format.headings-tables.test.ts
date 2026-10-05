import { applyEdits } from '../../../src/logic/tidy/edits';
import { runOnText } from '../../../src/logic/tidy/engine';
import { parseFull } from '../../../src/logic/tidy/parser';
import type { TidyPreferences } from '../../../src/logic/tidy/prefs';

const defaults: TidyPreferences = { bullet: '-', emphasis: '_', heading: 'atx' };

function format(source: string, prefs = defaults): string {
    const result = runOnText('format', source, prefs);
    expect(result.kind).toBe('edits');
    if (result.kind !== 'edits') throw new Error('Format refused a safe fixture');
    let previous = 0;
    for (const edit of result.edits) {
        expect(edit.from).toBeGreaterThanOrEqual(previous);
        expect(edit.to).toBeGreaterThanOrEqual(edit.from);
        previous = edit.to;
    }
    const formatted = applyEdits(source, result.edits);
    const tree = (text: string): string =>
        JSON.stringify(parseFull(text), (key, value: unknown) => (key === 'position' ? undefined : value));
    expect(tree(formatted)).toBe(tree(source));
    expect(runOnText('format', formatted, prefs)).toEqual({ kind: 'edits', edits: [] });
    return formatted;
}

test.each([
    { source: 'Title\n=====\n', want: '# Title\n' },
    { source: 'Subtitle\n--------\n', want: '## Subtitle\n' },
])('when a single-line Setext heading is formatted by default, it becomes ATX', ({ source, want }) => {
    expect(format(source)).toBe(want);
});

test.each([
    { source: '# Title\n', want: 'Title\n=====\n' },
    { source: '## 字A\n', want: '字A\n---\n' },
    { source: '# X\n', want: 'X\n===\n' },
    { source: '# *Title*\n', want: '_Title_\n=====\n' },
])('when Setext is preferred, a safe level-one or level-two ATX heading becomes Setext', ({ source, want }) => {
    expect(format(source, { ...defaults, heading: 'setext' })).toBe(want);
});

test.each(['### Three\n', '#### Four\n', '##### Five\n', '###### Six\n'])(
    'when Setext is preferred, a level-three through level-six heading stays ATX',
    (source) => {
        expect(format(source, { ...defaults, heading: 'setext' })).toBe(source);
    },
);

test('when Setext content spans multiple lines, Format leaves that heading unchanged', () => {
    const source = 'First line\nsecond line\n===========\n';
    expect(format(source)).toBe(source);
});

test('when a Setext candidate would parse as a list, Format leaves the ATX heading unchanged', () => {
    const source = '# * item\n';
    expect(format(source, { ...defaults, heading: 'setext' })).toBe(source);
});

test.each([
    {
        source: '> # Title\n\n*outside*\n',
        want: '> Title\n> =====\n\n_outside_\n',
    },
    {
        source: '- # Title\n\n*outside*\n',
        want: '- Title\n  =====\n\n_outside_\n',
    },
])('when Setext is preferred, Format keeps quote or list prefixes on a converted heading', ({ source, want }) => {
    expect(format(source, { ...defaults, heading: 'setext' })).toBe(want);
});

test.each([
    {
        source: '> Title\n> =====\n\n*outside*\n',
        want: '> # Title\n\n_outside_\n',
    },
    {
        source: '- Title\n  =====\n\n*outside*\n',
        want: '- # Title\n\n_outside_\n',
    },
])('when ATX is preferred, Format keeps quote or list prefixes on a converted heading', ({ source, want }) => {
    expect(format(source)).toBe(want);
});

test.each([
    { marker: '-\t', continuation: '    ' },
    { marker: '1.\t', continuation: '    ' },
    { marker: '> -\t', continuation: '>   ' },
])('when Setext is preferred, Format measures a tab-delimited $marker list indent', ({ marker, continuation }) => {
    const source = `${marker}# Title\n\n*outside*\n`;
    const want = `${marker}Title\n${continuation}=====\n\n_outside_\n`;
    expect(format(source, { ...defaults, heading: 'setext' })).toBe(want);
});

test.each([
    { marker: '-\t', continuation: '    ' },
    { marker: '1.\t', continuation: '    ' },
    { marker: '> -\t', continuation: '>   ' },
])('when ATX is preferred, Format removes a tab-delimited $marker list underline', ({ marker, continuation }) => {
    const source = `${marker}Title\n${continuation}=====\n\n*outside*\n`;
    const want = `${marker}# Title\n\n_outside_\n`;
    expect(format(source)).toBe(want);
});

test('when a table is unpadded, Format aligns existing columns by display width', () => {
    const source = '| Name | Age |\n| --- | --- |\n| Ada | 3 |\n';
    const want = '| Name | Age |\n| ---- | --- |\n| Ada  | 3   |\n';
    expect(format(source)).toBe(want);
});

test('when a table contains wide characters, Format counts each one as two columns', () => {
    const source = '| Label | Value |\n| --- | --- |\n| 字 | A |\n| a | xx |\n';
    const want = '| Label | Value |\n| ----- | ----- |\n| 字    | A     |\n| a     | xx    |\n';
    expect(format(source)).toBe(want);
});

test('when a table cell contains an escaped pipe, Format keeps it inside that cell', () => {
    const source = '| A | B |\n| --- | --- |\n| x\\|y | z |\n';
    const want = '| A    | B   |\n| ---- | --- |\n| x\\|y | z   |\n';
    expect(format(source)).toBe(want);
});

test('when a table has a ragged row, Format does not add a missing cell', () => {
    const source = '| A | B |\n| --- | --- |\n| x |\n';
    const want = '| A   | B   |\n| --- | --- |\n| x   |\n';
    expect(format(source)).toBe(want);
});

test('when a table has alignment colons, Format keeps their direction', () => {
    const source = '| Label | Right |\n| :--- | ---: |\n| x | y |\n';
    const want = '| Label | Right |\n| :---- | ----: |\n| x     | y     |\n';
    expect(format(source)).toBe(want);
});

test('when a table cell has Markdown emphasis, Format keeps the cell content while aligning it', () => {
    const source = '| Name | Value |\n| --- | --- |\n| *A* | b |\n';
    const want = '| Name | Value |\n| ---- | ----- |\n| *A*  | b     |\n';
    expect(format(source)).toBe(want);
});

test('when a table row has a code span pipe, Format leaves the ambiguous row unchanged', () => {
    const source = '| A | B |\n| --- | --- |\n| `x|y` | z |\n';
    expect(format(source)).toBe(source);
});

test.each([
    {
        source: '> | A | B |\n> | --- | --- |\n> | x | y |\n',
        want: '> | A   | B   |\n> | --- | --- |\n> | x   | y   |\n',
    },
    {
        source: '- | A | B |\n  | --- | --- |\n  | x | y |\n',
        want: '- | A   | B   |\n  | --- | --- |\n  | x   | y   |\n',
    },
])('when a table is nested, Format pads its cells without changing container indentation', ({ source, want }) => {
    expect(format(source)).toBe(want);
});

test.each(['*A*', '__B__', '_*nested*_', '`a  b`', 'x\\|y', '[*link*](</target> "Title")'])(
    'when a table cell contains %s, Format preserves its exact source while padding surroundings',
    (cell) => {
        const source = `| ${cell} | Value |\n| --- | --- |\n| ${cell} | b |\n\n*outside*\n`;
        const result = format(source);
        const lines = result.split('\n');
        expect(lines[0].startsWith(`| ${cell} `)).toBe(true);
        expect(lines[2].startsWith(`| ${cell} `)).toBe(true);
        expect(lines[2].endsWith('| b     |')).toBe(true);
        expect(result.endsWith('\n\n_outside_\n')).toBe(true);
    },
);
