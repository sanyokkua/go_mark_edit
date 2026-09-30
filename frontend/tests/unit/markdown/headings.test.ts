import { extractHeadings, headingAnchor, scrollToAnchor } from '../../../src/logic/markdown/headings';

it('keeps Unicode letters, combining marks and underscores in heading anchors', () => {
    expect(extractHeadings('# Über uns\n## Hello_World\n### 中文 标题\n#### Привет мир\n##### हिंदी शीर्षक')).toEqual([
        { depth: 1, text: 'Über uns', slug: 'über-uns', line: 1 },
        { depth: 2, text: 'Hello_World', slug: 'hello_world', line: 2 },
        { depth: 3, text: '中文 标题', slug: '中文-标题', line: 3 },
        { depth: 4, text: 'Привет мир', slug: 'привет-мир', line: 4 },
        { depth: 5, text: 'हिंदी शीर्षक', slug: 'हिंदी-शीर्षक', line: 5 },
    ]);
});

it('numbers repeated Markdown headings in document order without counting raw HTML headings', () => {
    const headings = extractHeadings('# Notes\n\n<h2 id="notes-1">Notes</h2>\n\n## Notes\n\nNotes\n-----');
    expect(headings).toEqual([
        { depth: 1, text: 'Notes', slug: 'notes', line: 1 },
        { depth: 2, text: 'Notes', slug: 'notes-1', line: 5 },
        { depth: 2, text: 'Notes', slug: 'notes-2', line: 7 },
    ]);
    expect(headingAnchor(headings, 'notes-1')).toEqual(headings[1]);
    expect(headingAnchor(headings, 'missing')).toBeUndefined();
});

it('excludes image alt and raw HTML tags while retaining visible heading text', () => {
    expect(extractHeadings('# First ![hidden](./image.png) <em>visible</em> Last')).toEqual([
        { depth: 1, text: 'First  visible Last', slug: 'first--visible-last', line: 1 },
    ]);
});

it('scrolls the first matching id inside the preview without selecting outside collisions', () => {
    const outside = document.createElement('h2');
    outside.id = 'setup';
    const container = document.createElement('section');
    container.innerHTML = '<h2 id="setup">First</h2><h2 id="setup">Second</h2>';
    document.body.append(outside, container);
    const first = container.children[0] as HTMLElement;
    const second = container.children[1] as HTMLElement;
    const outsideScroll = jest.fn();
    const firstScroll = jest.fn();
    const secondScroll = jest.fn();
    outside.scrollIntoView = outsideScroll;
    first.scrollIntoView = firstScroll;
    second.scrollIntoView = secondScroll;

    try {
        scrollToAnchor(container, 'setup');
        scrollToAnchor(container, 'missing');
        expect(firstScroll).toHaveBeenCalledWith({ block: 'start' });
        expect(firstScroll).toHaveBeenCalledTimes(1);
        expect(secondScroll).not.toHaveBeenCalled();
        expect(outsideScroll).not.toHaveBeenCalled();
    } finally {
        outside.remove();
        container.remove();
    }
});
