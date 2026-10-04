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
    const withoutPositions = (text: string): string =>
        JSON.stringify(parseFull(text), (key, value: unknown) => (key === 'position' ? undefined : value));
    expect(withoutPositions(formatted)).toBe(withoutPositions(source));
    expect(runOnText('format', formatted, prefs)).toEqual({ kind: 'edits', edits: [] });
    return formatted;
}

test.each([
    {
        name: 'default bullet and emphasis',
        source: '* one\n* two\n\n*word*',
        want: '- one\n- two\n\n_word_\n',
        prefs: defaults,
    },
    {
        name: 'star bullet preference',
        source: '- one\n- two\n',
        want: '* one\n* two\n',
        prefs: { ...defaults, bullet: '*' as const },
    },
    {
        name: 'plus bullet preference',
        source: '- one\n- two\n',
        want: '+ one\n+ two\n',
        prefs: { ...defaults, bullet: '+' as const },
    },
    {
        name: 'star emphasis preference',
        source: '_one_ and *two*',
        want: '*one* and *two*\n',
        prefs: { ...defaults, emphasis: '*' as const },
    },
    { name: 'intraword emphasis', source: 'foo*bar*baz', want: 'foo*bar*baz\n', prefs: defaults },
    { name: 'strong markers', source: '__bold__', want: '**bold**\n', prefs: defaults },
    { name: 'nested delimiters', source: '_*x*_', want: '*_x_*\n', prefs: defaults },
])('when $name is formatted, markers follow the preference without changing rendering', ({ source, want, prefs }) => {
    expect(format(source, prefs)).toBe(want);
});

test.each([
    { source: '* first\n+ second\n', want: '- first\n* second\n', prefs: defaults },
    { source: '- first\n+ second\n', want: '* first\n- second\n', prefs: { ...defaults, bullet: '*' as const } },
    { source: '- first\n* second\n', want: '+ first\n- second\n', prefs: { ...defaults, bullet: '+' as const } },
])('when adjacent lists use different markers, Format keeps them distinct', ({ source, want, prefs }) => {
    expect(format(source, prefs)).toBe(want);
});

test('when a list is tight and another is loose, Format preserves their spacing', () => {
    const source = '* tight one\n* tight two\n\n+ loose one\n\n+ loose two\n';
    expect(format(source)).toBe('- tight one\n- tight two\n\n* loose one\n\n* loose two\n');
});

test('when ordered lists use repeated or increasing numbers, Format keeps each source style', () => {
    const source = '1. one\n1. two\n1. three\n\n1. four\n2. five\n3. six';
    expect(format(source)).toBe(source + '\n');
});

test('when prose has soft and hard breaks, Format keeps them and removes other trailing whitespace', () => {
    const source = 'first \nsecond  \nthird\t\n\n\n# Heading \nnext';
    expect(format(source)).toBe('first\nsecond  \nthird\n\n# Heading\n\nnext\n');
});

test('when separate prose blocks have no blank line, Format adds one outside lists', () => {
    expect(format('# Heading\nParagraph')).toBe('# Heading\n\nParagraph\n');
});

test('when a blockquote has separate blocks, Format adds one quoted blank line', () => {
    expect(format('> # Heading\n> Paragraph')).toBe('> # Heading\n>\n> Paragraph\n');
});

test('when a large document splits before a heading, Format keeps the boundary blank line', () => {
    const prefix = 'x'.repeat(256 * 1024) + '\n\n';
    expect(format(prefix + '# Next\n* item')).toBe(prefix + '# Next\n\n- item\n');
});

test.each(['```\ntext\n```  ', '<!-- item -->  ', '---\ntitle: x\n---  ', '$$\nx\n$$  '])(
    'when protected syntax ends with spaces and no newline, Format appends a newline without touching its bytes',
    (source) => {
        expect(format(source)).toBe(source + '\n');
    },
);

test.each(['__*x*__', '**_x_**'])(
    'when star-preferred emphasis touches a strong parent, Format keeps distinct delimiters',
    (source) => {
        expect(format(source, { ...defaults, emphasis: '*' })).toBe('**_x_**\n');
    },
);

test('when protected constructs contain marker or whitespace syntax, Format leaves their bytes intact', () => {
    const source = [
        '---',
        'title: *keep*  ',
        '---',
        '',
        '```md',
        '* keep  ',
        '',
        '',
        '```',
        '',
        '    * indented  ',
        '',
        '$$',
        '* keep  ',
        '$$',
        '',
        '<!-- *keep*  -->',
    ].join('\n');
    expect(format(source)).toBe(source + '\n');
});
