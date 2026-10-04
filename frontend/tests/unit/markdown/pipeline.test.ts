import { render } from '@testing-library/react';
import { createElement } from 'react';
import Markdown from 'react-markdown';

import { createPipeline, syntaxPlugins, type MarkdownStandard } from '../../../src/logic/markdown/pipeline';

function preview(source: string, standard: MarkdownStandard): HTMLElement {
    const pipeline = createPipeline(standard);
    return render(
        createElement(Markdown, { ...pipeline, remarkRehypeOptions: { allowDangerousHtml: true }, children: source }),
    ).container;
}

it('renders extension syntax at GFM and Full while Minimal keeps its source text', () => {
    const source =
        '| A | B |\n| --- | --- |\n| one | two |\n\n- [ ] task\n\n~~gone~~ and https://example.test and note[^n].\n\n[^n]: footnote body';
    const minimal = preview(source, 'minimal');
    expect(minimal.querySelector('table, input, del, section')).toBeNull();
    expect(minimal.textContent).toContain('| A | B |');
    expect(minimal.textContent).toContain('[ ] task');
    expect(minimal.textContent).toContain('~~gone~~');
    expect(minimal.textContent).toContain('note[^n]');

    for (const standard of ['gfm', 'full'] as const) {
        const rendered = preview(source, standard);
        expect(rendered.querySelector('table')).not.toBeNull();
        expect(rendered.querySelector('input[type="checkbox"]')).toHaveAttribute('disabled');
        expect(rendered.querySelector('del')).toHaveTextContent('gone');
        expect(rendered.querySelector('a[href="https://example.test"]')).not.toBeNull();
        expect(rendered.querySelector('section[data-footnotes]')).not.toBeNull();
    }
});

it('parses YAML front matter only at the beginning for GFM and Full', () => {
    const source = '---\ntitle: Hidden\n---\n\nVisible';
    expect(preview(source, 'minimal')).toHaveTextContent('title: Hidden');
    for (const standard of ['gfm', 'full'] as const) {
        expect(preview(source, standard)).not.toHaveTextContent('title: Hidden');
        expect(preview(`Visible\n\n${source}`, standard)).toHaveTextContent('title: Hidden');
    }
});

it('keeps unknown and unlabelled fences as plain code', () => {
    for (const standard of ['minimal', 'gfm', 'full'] as const) {
        const rendered = preview('```unknown\nplain code\n```\n\n```\nother code\n```', standard);
        expect(rendered.querySelectorAll('pre code')).toHaveLength(2);
        expect(rendered.querySelector('pre')).toHaveTextContent('plain code');
        expect(rendered.querySelector('[class*="hljs"]')).toBeNull();
    }
});

it.each(['minimal', 'gfm', 'full'] as const)(
    'numbers Mermaid fences in document order at %s while reserving math for Full',
    (standard) => {
        const source =
            '```mermaid\ngraph TD\n  A-->B\n```\n\n```go\npackage main\n```\n\n```mermaid\ngraph TD\n  B-->C\n```\n\n$x^2$';
        const rendered = preview(source, standard);
        expect(
            [...rendered.querySelectorAll('pre code.language-mermaid')].map((code) =>
                code.getAttribute('data-mermaid-index'),
            ),
        ).toEqual(['1', '2']);
        if (standard === 'full') {
            expect(rendered.querySelector('.katex')).not.toBeNull();
        } else {
            expect(rendered).toHaveTextContent('$x^2$');
            expect(rendered.querySelector('.katex')).toBeNull();
        }
    },
);

it('returns stable pipeline and syntax lists per standard', () => {
    for (const standard of ['minimal', 'gfm', 'full'] as const) {
        expect(createPipeline(standard)).toBe(createPipeline(standard));
        expect(syntaxPlugins(standard)).toBe(syntaxPlugins(standard));
        expect(createPipeline(standard).remarkPlugins).toBe(createPipeline(standard).remarkPlugins);
        expect(createPipeline(standard).remarkPlugins).toHaveLength(syntaxPlugins(standard).length + 1);
    }
});

it('assigns ids to parsed headings without changing raw or footnote headings', () => {
    const rendered = preview(
        '# Notes\n\n<h2 id="notes-1">Raw Notes</h2>\n\n## Notes\n\n## Notes\n\nReference[^a].\n\n[^a]: Footnote',
        'gfm',
    );
    const headings = Array.from(rendered.querySelectorAll('h1, h2'));
    expect(headings.slice(0, 4).map((heading) => heading.id)).toEqual(['notes', 'notes-1', 'notes-1', 'notes-2']);
    expect(headings.slice(0, 4).map((heading) => heading.textContent)).toEqual([
        'Notes',
        'Raw Notes',
        'Notes',
        'Notes',
    ]);
    expect(headings.at(-1)).toHaveAttribute('class', 'sr-only');
    expect(headings.at(-1)).toHaveAttribute('id', 'footnote-label');
});

it('keeps same-line raw heading ids while numbering only Markdown headings', () => {
    const rendered = preview('## Notes <h2 id="raw">Raw</h2>\n\n## Notes <h2>Raw</h2>', 'gfm');
    const headings = Array.from(rendered.querySelectorAll('h2'));

    expect(headings.map((heading) => heading.id)).toEqual(['notes-raw', 'raw', 'notes-raw-1', '']);
});
