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

it('returns stable pipeline and syntax lists per standard', () => {
    for (const standard of ['minimal', 'gfm', 'full'] as const) {
        expect(createPipeline(standard)).toBe(createPipeline(standard));
        expect(syntaxPlugins(standard)).toBe(syntaxPlugins(standard));
        expect(createPipeline(standard).remarkPlugins).toBe(syntaxPlugins(standard));
    }
});
