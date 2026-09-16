import { createElement } from 'react';

import { render, screen } from '@testing-library/react';
import { sanitize } from 'hast-util-sanitize';
import type { Element, Root } from 'hast';

import { baseGfmSanitizeSchema } from '../../../src/logic/markdown/renderer';
import { rehypeSourceLines, SOURCE_LINE_ATTRIBUTE } from '../../../src/logic/markdown/sourceLines';
import MarkdownView from '../../../src/ui/components/MarkdownView';

it('annotates each rendered block with its one-based source line', () => {
    const source = [
        '# H1',
        '## H2',
        '### H3',
        '#### H4',
        '##### H5',
        '###### H6',
        '',
        'Paragraph text.',
        '',
        '> Blockquote text.',
        '',
        '- Item one',
        '- Item two',
        '',
        '1. Ordered one',
        '',
        '```',
        'code line',
        '```',
        '',
        '| A | B |',
        '| --- | --- |',
        '| 1 | 2 |',
        '',
        '---',
    ].join('\n');

    const { container } = render(createElement(MarkdownView, { source }));

    expect(container.querySelector('h1')).toHaveAttribute(SOURCE_LINE_ATTRIBUTE, '1');
    expect(container.querySelector('h2')).toHaveAttribute(SOURCE_LINE_ATTRIBUTE, '2');
    expect(container.querySelector('h3')).toHaveAttribute(SOURCE_LINE_ATTRIBUTE, '3');
    expect(container.querySelector('h4')).toHaveAttribute(SOURCE_LINE_ATTRIBUTE, '4');
    expect(container.querySelector('h5')).toHaveAttribute(SOURCE_LINE_ATTRIBUTE, '5');
    expect(container.querySelector('h6')).toHaveAttribute(SOURCE_LINE_ATTRIBUTE, '6');
    expect(container.querySelector('p')).toHaveAttribute(SOURCE_LINE_ATTRIBUTE, '8');
    expect(container.querySelector('blockquote')).toHaveAttribute(SOURCE_LINE_ATTRIBUTE, '10');

    const unorderedItems = container.querySelectorAll('ul li');
    expect(container.querySelector('ul')).toHaveAttribute(SOURCE_LINE_ATTRIBUTE, '12');
    expect(unorderedItems[0]).toHaveAttribute(SOURCE_LINE_ATTRIBUTE, '12');
    expect(unorderedItems[1]).toHaveAttribute(SOURCE_LINE_ATTRIBUTE, '13');

    expect(container.querySelector('ol')).toHaveAttribute(SOURCE_LINE_ATTRIBUTE, '15');
    expect(container.querySelector('ol li')).toHaveAttribute(SOURCE_LINE_ATTRIBUTE, '15');

    expect(container.querySelector('pre')).toHaveAttribute(SOURCE_LINE_ATTRIBUTE, '17');
    expect(container.querySelector('pre code')).not.toHaveAttribute(SOURCE_LINE_ATTRIBUTE);

    const tableRows = container.querySelectorAll('table tr');
    expect(container.querySelector('table')).toHaveAttribute(SOURCE_LINE_ATTRIBUTE, '21');
    expect(tableRows[0]).toHaveAttribute(SOURCE_LINE_ATTRIBUTE, '21');
    expect(tableRows[1]).toHaveAttribute(SOURCE_LINE_ATTRIBUTE, '23');
    expect(container.querySelector('thead')).not.toHaveAttribute(SOURCE_LINE_ATTRIBUTE);
    expect(container.querySelector('tbody')).not.toHaveAttribute(SOURCE_LINE_ATTRIBUTE);
    expect(container.querySelector('th')).not.toHaveAttribute(SOURCE_LINE_ATTRIBUTE);
    expect(container.querySelector('td')).not.toHaveAttribute(SOURCE_LINE_ATTRIBUTE);

    expect(container.querySelector('hr')).toHaveAttribute(SOURCE_LINE_ATTRIBUTE, '25');
});

it('annotates a nested list and each blockquote paragraph with their own source line', () => {
    const source = ['- top item', '  - nested item', '', '> Quote line one.', '>', '> Quote line two.'].join('\n');

    const { container } = render(createElement(MarkdownView, { source }));

    expect(container.querySelector('ul')).toHaveAttribute(SOURCE_LINE_ATTRIBUTE, '1');
    expect(container.querySelector('ul > li')).toHaveAttribute(SOURCE_LINE_ATTRIBUTE, '1');
    expect(container.querySelector('ul > li > ul')).toHaveAttribute(SOURCE_LINE_ATTRIBUTE, '2');
    expect(container.querySelector('ul > li > ul > li')).toHaveAttribute(SOURCE_LINE_ATTRIBUTE, '2');

    const quoteParagraphs = container.querySelectorAll('blockquote p');
    expect(container.querySelector('blockquote')).toHaveAttribute(SOURCE_LINE_ATTRIBUTE, '4');
    expect(quoteParagraphs).toHaveLength(2);
    expect(quoteParagraphs[0]).toHaveAttribute(SOURCE_LINE_ATTRIBUTE, '4');
    expect(quoteParagraphs[1]).toHaveAttribute(SOURCE_LINE_ATTRIBUTE, '6');
});

it('keeps GFM task-list classes beside the source line', () => {
    const source = ['- [ ] Task one', '- [x] Task two'].join('\n');

    const { container } = render(createElement(MarkdownView, { source }));

    const list = container.querySelector('ul');
    const items = container.querySelectorAll('ul li');

    expect(list).toHaveClass('contains-task-list');
    expect(list).toHaveAttribute(SOURCE_LINE_ATTRIBUTE, '1');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveClass('task-list-item');
    expect(items[0]).toHaveAttribute(SOURCE_LINE_ATTRIBUTE, '1');
    expect(items[1]).toHaveClass('task-list-item');
    expect(items[1]).toHaveAttribute(SOURCE_LINE_ATTRIBUTE, '2');
});

it('leaves inline elements and footnote definitions unannotated', () => {
    const source =
        'Some **bold**, *em*, `code`, a [link](https://example.test/x) and a note[^n].\n\n[^n]: Footnote body.';

    const { container } = render(createElement(MarkdownView, { source }));

    const paragraphs = container.querySelectorAll('p');
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]).toHaveAttribute(SOURCE_LINE_ATTRIBUTE, '1');
    expect(paragraphs[1]).not.toHaveAttribute(SOURCE_LINE_ATTRIBUTE);

    expect(container.querySelector('strong')).not.toHaveAttribute(SOURCE_LINE_ATTRIBUTE);
    expect(container.querySelector('em')).not.toHaveAttribute(SOURCE_LINE_ATTRIBUTE);
    expect(container.querySelector('code')).not.toHaveAttribute(SOURCE_LINE_ATTRIBUTE);
    expect(container.querySelector('a[href="https://example.test/x"]')).not.toHaveAttribute(SOURCE_LINE_ATTRIBUTE);

    expect(container.querySelector('ol')).not.toHaveAttribute(SOURCE_LINE_ATTRIBUTE);
    expect(screen.getByRole('listitem')).not.toHaveAttribute(SOURCE_LINE_ATTRIBUTE);
});

it('does not let raw HTML in the source forge a source-line attribute', () => {
    const source = 'Real paragraph.\n\n<p data-source-line="999">Injected paragraph.</p>\n\nAnother real one.';

    const { container } = render(createElement(MarkdownView, { source }));

    const paragraphs = container.querySelectorAll('p');
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]).toHaveAttribute(SOURCE_LINE_ATTRIBUTE, '1');
    expect(paragraphs[1]).toHaveAttribute(SOURCE_LINE_ATTRIBUTE, '5');
    expect(container.querySelector('[data-source-line="999"]')).toBeNull();
    expect(screen.queryByText(/Injected paragraph/)).not.toBeInTheDocument();
});

it('keeps a numeric source line through sanitization and strips any other value', () => {
    const paragraph = (dataSourceLine: number | string): Element => ({
        type: 'element',
        tagName: 'p',
        properties: { dataSourceLine },
        children: [{ type: 'text', value: 'Text.' }],
    });
    const tree: Root = {
        type: 'root',
        children: [paragraph(5), paragraph('drop-table'), paragraph(0), paragraph(-3), paragraph(1.5)],
    };

    const result = sanitize(tree, baseGfmSanitizeSchema) as Root;
    const [valid, nonNumeric, zero, negative, nonInteger] = result.children as Element[];

    expect(valid.properties.dataSourceLine).toBe(5);
    expect(nonNumeric.properties.dataSourceLine).toBeUndefined();
    expect(zero.properties.dataSourceLine).toBeUndefined();
    expect(negative.properties.dataSourceLine).toBeUndefined();
    expect(nonInteger.properties.dataSourceLine).toBeUndefined();
});

it('annotates a deeply nested tree without exceeding the call stack', () => {
    const depth = 20_000;
    const root: Root = { type: 'root', children: [] };
    let parent: Root | Element = root;

    for (let line = 1; line <= depth; line += 1) {
        const child: Element = {
            type: 'element',
            tagName: 'blockquote',
            properties: {},
            children: [],
            position: { start: { line, column: 1 }, end: { line, column: 2 } },
        };
        parent.children.push(child);
        parent = child;
    }

    expect(() => rehypeSourceLines()(root)).not.toThrow();

    let node: Root | Element = root;
    let deepestLine: unknown;
    let visited = 0;
    while (node.children.length > 0) {
        const child = node.children[0] as Element;
        deepestLine = child.properties.dataSourceLine;
        node = child;
        visited += 1;
    }

    expect(visited).toBe(depth);
    expect(deepestLine).toBe(depth);
});

it('keeps the source line on headings that receive generated ids', () => {
    const { container } = render(createElement(MarkdownView, { source: 'Intro paragraph.\n\n## Café Life & Times' }));

    const heading = container.querySelector('h2');

    expect(heading).toHaveAttribute(SOURCE_LINE_ATTRIBUTE, '3');
    expect(heading?.id.length).toBeGreaterThan(0);
});

it('counts source lines across CRLF and lone carriage-return line endings', () => {
    const lines = ['# Heading', '', 'Paragraph text.', '', '> Quote text.'];

    for (const eol of ['\r\n', '\r']) {
        const { container, unmount } = render(createElement(MarkdownView, { source: lines.join(eol) }));

        expect(container.querySelector('h1')).toHaveAttribute(SOURCE_LINE_ATTRIBUTE, '1');
        expect(container.querySelector('p')).toHaveAttribute(SOURCE_LINE_ATTRIBUTE, '3');
        expect(container.querySelector('blockquote')).toHaveAttribute(SOURCE_LINE_ATTRIBUTE, '5');

        unmount();
    }
});
