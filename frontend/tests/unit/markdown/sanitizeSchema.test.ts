import { fireEvent, render } from '@testing-library/react';
import { createElement } from 'react';
import Markdown from 'react-markdown';

import { createPipeline } from '../../../src/logic/markdown/pipeline';
import MarkdownView from '../../../src/ui/components/MarkdownView';

function preview(source: string): HTMLElement {
    const pipeline = createPipeline('gfm');
    return render(
        createElement(Markdown, { ...pipeline, remarkRehypeOptions: { allowDangerousHtml: true }, children: source }),
    ).container;
}

it('renders allowed raw HTML and unwraps unknown elements', () => {
    const html =
        '<details><summary>More</summary><kbd>K</kbd><sub>sub</sub><sup>sup</sup><mark>mark</mark><ins>ins</ins><del>del</del><br><abbr title="Term">abbr</abbr></details><odd-element>kept <strong>bold</strong></odd-element>';
    const rendered = preview(html);
    for (const tag of ['details', 'summary', 'kbd', 'sub', 'sup', 'mark', 'ins', 'del', 'br', 'abbr']) {
        expect(rendered.querySelector(tag)).not.toBeNull();
    }
    expect(rendered.querySelector('odd-element')).toBeNull();
    expect(rendered).toHaveTextContent('kept bold');
});

it('strips executable, embedding, foreign and form elements with their contents', () => {
    const contentTags = [
        'script',
        'style',
        'iframe',
        'object',
        'form',
        'noscript',
        'template',
        'textarea',
        'select',
        'button',
        'svg',
        'math',
        'title',
        'applet',
        'audio',
        'video',
        'canvas',
        'noembed',
        'noframes',
        'xmp',
        'plaintext',
        'dialog',
        'portal',
    ];
    for (const tag of contentTags) {
        const rendered = preview(`safe <${tag}>unsafe-token</${tag}> tail`);
        expect(rendered.querySelector(tag)).toBeNull();
        expect(rendered).not.toHaveTextContent('unsafe-token');
        expect(rendered).toHaveTextContent('safe');
    }
    for (const tag of ['embed', 'head', 'frame', 'link', 'meta', 'base']) {
        expect(preview(`<${tag}>safe`).querySelector(tag)).toBeNull();
    }
});

it('strips hostile attributes and URL schemes while keeping an authored id', () => {
    const rendered = preview(
        '<h2 id="setup" onclick="bad()" style="color:red">Setup</h2>\n\n<a href="JaVaScRiPt:alert(1)">case</a> <a href=" javascript:alert(1)">space</a> <a href="java&#x09;script:alert(1)">tab</a> <a href="data:text/html,hi">data</a>',
    );
    expect(rendered.querySelector('h2')).toHaveAttribute('id', 'setup');
    expect(rendered.querySelector('[onclick], [style]')).toBeNull();
    for (const anchor of rendered.querySelectorAll('a')) expect(anchor).not.toHaveAttribute('href');
    const actual = render(createElement(MarkdownView, { source: '<h2 id="setup">Setup</h2>' }));
    expect(actual.container.querySelector('h2')).toHaveAttribute('id', 'setup');
});

it('keeps matching footnote targets, source lines and adjacent text around stripped content', () => {
    const rendered = preview('First[^a].\n\n[^a]: safe <script>unsafe-token</script> end');
    const link = rendered.querySelector('p a[href^="#"]');
    expect(link).not.toBeNull();
    expect(rendered.querySelector(link?.getAttribute('href') ?? '')).not.toBeNull();
    expect(rendered.querySelector('p')).toHaveAttribute('data-source-line', '1');
    expect(rendered).not.toHaveTextContent('unsafe-token');
    expect(rendered).toHaveTextContent('safe');
});

it('lets the preview visibly refuse file links while removing dangerous schemes', () => {
    const onActivateLink = jest.fn();
    const { container } = render(
        createElement(MarkdownView, {
            documentId: 'doc-1',
            documentPath: '/notes/current.md',
            onActivateLink,
            source: '[local file](file:///tmp/x.md) [script](javascript:alert%281%29) [payload](data:text/html,hi)',
        }),
    );
    const fileLink = container.querySelector('a[href="file:///tmp/x.md"]');
    expect(fileLink).not.toBeNull();
    fireEvent.click(fileLink as HTMLAnchorElement);
    expect(onActivateLink).toHaveBeenCalledWith('doc-1', {
        kind: 'refused',
        href: 'file:///tmp/x.md',
        reason: 'scheme',
    });
    expect(container.querySelector('a[href^="javascript:"], a[href^="data:"]')).toBeNull();
});
