import type { PhrasingContent, Root } from 'mdast';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

import { remarkMathStrict } from '../../../src/logic/markdown/syntax/mathStrict';

const parser = unified().use(remarkParse).use(remarkMathStrict);

function parse(source: string): Root {
    return parser.parse(source);
}

function phrasing(source: string): PhrasingContent[] {
    const node = parse(source).children[0];
    if (node?.type !== 'paragraph') throw new Error('Expected a paragraph');
    return node.children;
}

it('parses a single-dollar formula when both delimiters meet the strict rule', () => {
    expect(phrasing('$E=mc^2$')).toMatchObject([{ type: 'inlineMath', value: 'E=mc^2' }]);
});

it.each([
    ['$5 and $10', '$5 and $10'],
    ['\\$5', '$5'],
    ['$ x $', '$ x $'],
    ['$20,000 and $30,000', '$20,000 and $30,000'],
    ['$x$5', '$x$5'],
    ['$x$٥', '$x$٥'],
    ['$x$５', '$x$５'],
    ['$x$𝟏', '$x$𝟏'],
    ['$\tx$', '$\tx$'],
    ['$\nx$', '$\nx$'],
    ['$x $', '$x $'],
    ['$x\t$', '$x\t$'],
    ['$x\n$', '$x\n$'],
])('leaves %j as prose when a delimiter is escaped or touches whitespace or a digit', (source, expected) => {
    expect(phrasing(source)).toMatchObject([{ type: 'text', value: expected }]);
});

it('parses a formula between ordinary letters', () => {
    expect(phrasing('a$b$c')).toMatchObject([
        { type: 'text', value: 'a' },
        { type: 'inlineMath', value: 'b' },
        { type: 'text', value: 'c' },
    ]);
});

it('parses a formula after ordinary prose when the closer ends the paragraph', () => {
    expect(phrasing('cost $10$')).toMatchObject([
        { type: 'text', value: 'cost ' },
        { type: 'inlineMath', value: '10' },
    ]);
});

it('uses the first eligible closer even after an ineligible dollar', () => {
    expect(phrasing('$5.00 and $x$')).toMatchObject([{ type: 'inlineMath', value: '5.00 and $x' }]);
});

it('keeps an escaped dollar inside a formula as math source', () => {
    expect(phrasing('$a \\$ b$')).toMatchObject([{ type: 'inlineMath', value: 'a \\$ b' }]);
});

it('keeps a line ending within a formula when neither delimiter touches it', () => {
    expect(phrasing('$a\n+b$')).toMatchObject([{ type: 'inlineMath', value: 'a\n+b' }]);
});

it('leaves dollars inside an inline code span as code', () => {
    expect(phrasing('`$x$`')).toMatchObject([{ type: 'inlineCode', value: '$x$' }]);
});

it('parses double-dollar display syntax with the stock math extension', () => {
    expect(parse('$$\n x \n$$').children).toMatchObject([{ type: 'math', value: ' x ' }]);
});

it('keeps a math fence as a code block for the later renderer', () => {
    expect(parse('```math\nx^2\n```').children).toMatchObject([{ type: 'code', lang: 'math', value: 'x^2' }]);
});

it('leaves a formula beyond the lookahead limit as prose', () => {
    const source = `$${'x'.repeat(10_001)}$`;
    expect(phrasing(source)).toMatchObject([{ type: 'text', value: source }]);
});

it('accepts a closer at the 10,000th following source character', () => {
    expect(phrasing(`$${'x'.repeat(9_999)}$`)).toMatchObject([{ type: 'inlineMath', value: 'x'.repeat(9_999) }]);
});

it('leaves a closer at the 10,001st following source character as prose', () => {
    const source = `$${'x'.repeat(10_000)}$`;
    expect(phrasing(source)).toMatchObject([{ type: 'text', value: source }]);
});

it('counts source tabs once when they occur inside a formula', () => {
    expect(phrasing(`$a${'\t'.repeat(3_000)}b$`)).toMatchObject([
        { type: 'inlineMath', value: `a${'\t'.repeat(3_000)}b` },
    ]);
});

it('accepts a formula with tabs when its closer is exactly at the source limit', () => {
    expect(phrasing(`$a${'\t'.repeat(9_997)}b$`)).toMatchObject([
        { type: 'inlineMath', value: `a${'\t'.repeat(9_997)}b` },
    ]);
});

it('uses the current document when the same parser reads another document', () => {
    expect(phrasing('$x$')).toMatchObject([{ type: 'inlineMath', value: 'x' }]);
    expect(phrasing('cost $5 and $10')).toMatchObject([{ type: 'text', value: 'cost $5 and $10' }]);
    expect(phrasing('😀 $y$')).toMatchObject([
        { type: 'text', value: '😀 ' },
        { type: 'inlineMath', value: 'y' },
    ]);
});

function elapsed(source: string): number {
    const started = performance.now();
    const tree = parse(source);
    const duration = performance.now() - started;
    expect(tree.type).toBe('root');
    return duration;
}

function fastestOfTwo(source: string): number {
    return Math.min(elapsed(source), elapsed(source));
}

it.each(['$x ', 'costs $5 and '])(
    'parses 32,000 unmatched %j openers without quadratic rescanning',
    (fragment) => {
        elapsed(fragment.repeat(1_000));

        const small = fastestOfTwo(fragment.repeat(32_000));
        const large = fastestOfTwo(fragment.repeat(64_000));

        expect(small).toBeLessThan(20_000);
        expect(large).toBeLessThan(40_000);
        expect(large).toBeLessThan(small * 4);
    },
    180_000,
);
