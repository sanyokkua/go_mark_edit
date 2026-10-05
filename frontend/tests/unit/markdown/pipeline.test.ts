import { render } from '@testing-library/react';
import { createElement } from 'react';
import Markdown from 'react-markdown';

import { createPipeline, syntaxPlugins, type MarkdownStandard } from '../../../src/logic/markdown/pipeline';

function preview(source: string, standard: MarkdownStandard, sourceAware = false): HTMLElement {
    const pipeline = sourceAware ? createPipeline(standard, source) : createPipeline(standard);
    return render(
        createElement(Markdown, { ...pipeline, remarkRehypeOptions: { allowDangerousHtml: true }, children: source }),
    ).container;
}

describe.each(['gfm', 'full'] as const)('source-aware %s preview', (standard) => {
    it('renders ordinary headings, links, Mermaid fences, and source lines like the full pipeline', () => {
        const source =
            '# Notes\n\n## Notes\n\n[local](./note.md)\n\n```mermaid\ngraph TD\n  A-->B\n```\n\nSetext heading\n--------------\n\n---';
        const expected = preview(source, standard);
        const actual = preview(source, standard, true);
        expect(actual.innerHTML).toBe(expected.innerHTML);
        expect(actual.querySelectorAll('h1, h2')).toHaveLength(3);
        expect(actual.querySelector('h2#notes-1')).not.toBeNull();
        expect(actual.querySelector('a[href="./note.md"]')).not.toBeNull();
        expect(actual.querySelector('code[data-mermaid-index="1"]')).not.toBeNull();
        expect(actual.querySelector('pre[data-source-line="7"]')).not.toBeNull();
        expect(actual.querySelector('h2[data-source-line="12"]')).not.toBeNull();
        expect(actual.querySelector('hr')).not.toBeNull();
    });

    it('retains front matter and Full-only math on eligible prose', () => {
        const source = '---\nHidden title\n---\n\nBefore $x^2$ after.';
        const expected = preview(source, standard);
        const actual = preview(source, standard, true);
        expect(actual.innerHTML).toBe(expected.innerHTML);
        expect(actual).not.toHaveTextContent('Hidden title');
        if (standard === 'full') {
            expect(actual.querySelector('.katex')).not.toBeNull();
        }
    });

    it.each([
        ['a two-column table', '| A | B |\n| --- | --- |\n| one | two |', 'table'],
        ['a one-column table', 'A\n:---\none', 'table'],
        ['strikethrough', '~~gone~~', 'del'],
        ['a footnote', 'A note[^n].\n\n[^n]: Footnote body', 'section[data-footnotes]'],
        ['a task list', '- [x] done\n- [ ] pending', 'input[type="checkbox"]'],
        ['a www autolink', 'www.example.test', 'a[href="http://www.example.test"]'],
        ['an uppercase www autolink', 'WWW.example.test', 'a[href="http://WWW.example.test"]'],
        ['a protocol autolink', 'https://example.test', 'a[href="https://example.test"]'],
        ['an email autolink', 'person@example.test', 'a[href="mailto:person@example.test"]'],
        ['an escaped www autolink', 'www\\.example.test', 'a[href="http://www.example.test"]'],
        ['an encoded www autolink', 'www&#46;example.test', 'a[href="http://www.example.test"]'],
        ['an encoded email autolink', 'person&#64;example.test', 'a[href="mailto:person@example.test"]'],
        ['a single-tilde strikethrough', '~gone~', 'del'],
        ['an uppercase task list', '- [X] done', 'input[type="checkbox"]'],
    ])('preserves %s using the full GFM parser', (_name, source, selector) => {
        const expected = preview(source, standard);
        const actual = preview(source, standard, true);
        expect(actual.innerHTML).toBe(expected.innerHTML);
        expect(actual.querySelector(selector)).not.toBeNull();
    });

    it('retains Full containers and alerts when their source needs the full parser', () => {
        const source = ':::note\nSafe content\n:::\n\n> [!WARNING]\n> Be careful';
        const expected = preview(source, standard);
        const actual = preview(source, standard, true);
        expect(actual.innerHTML).toBe(expected.innerHTML);
        expect(actual).toHaveTextContent('Safe content');
        if (standard === 'full') {
            expect(actual.querySelectorAll('.md-alert')).toHaveLength(2);
        }
    });

    it('retains Full alerts on eligible prose', () => {
        const source = '> [!WARNING]\n> Be careful';
        const expected = preview(source, standard);
        const actual = preview(source, standard, true);
        expect(actual.innerHTML).toBe(expected.innerHTML);
        expect(actual).toHaveTextContent('Be careful');
        if (standard === 'full') {
            expect(actual.querySelector('.md-alert-warning')).toHaveAttribute('role', 'note');
        }
    });

    it('keeps entity decoding and raw HTML sanitization identical', () => {
        const source = 'Safe &amp; sound <kbd>key</kbd><script>hidden</script>';
        const expected = preview(source, standard);
        const actual = preview(source, standard, true);
        expect(actual.innerHTML).toBe(expected.innerHTML);
        expect(actual.querySelector('kbd')).toHaveTextContent('key');
        expect(actual.querySelector('script')).toBeNull();
        expect(actual).not.toHaveTextContent('hidden');
    });

    it.each(['- [\n] pending', '- [\r\n] pending', '- [\n  ] pending'])(
        'preserves a multiline task checkbox in %j',
        (source) => {
            const expected = preview(source, standard);
            expect(expected.querySelector('input[type="checkbox"]')).not.toBeNull();
            const actual = preview(source, standard, true);
            expect(actual.innerHTML).toBe(expected.innerHTML);
            expect(actual.querySelector('input[type="checkbox"]')).not.toBeNull();
        },
    );
});

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
