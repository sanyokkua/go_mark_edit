import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import PreviewPane from '../../src/ui/widgets/PreviewPane';

it('scrolls an activated fragment to the first matching heading inside its own preview', () => {
    const outside = document.createElement('h2');
    outside.id = 'setup';
    outside.scrollIntoView = jest.fn();
    document.body.append(outside);
    try {
        const { container } = render(
            <PreviewPane
                standard="gfm"
                accepted={{
                    byteLength: 80,
                    content: '[go](#setup)\n\n## Setup\n\n<h2 id="setup">Raw setup</h2>',
                    revision: 1,
                }}
                documentId="doc-1"
                onRefresh={jest.fn()}
            />,
        );
        const headings = container.querySelectorAll('h2');
        expect(headings).toHaveLength(2);
        const headingScroll = jest.fn();
        headings[0].scrollIntoView = headingScroll;
        headings[1].scrollIntoView = jest.fn();
        fireEvent.click(screen.getByRole('link', { name: 'go' }));
        expect(headingScroll).toHaveBeenCalledWith({ block: 'start' });
        expect(headings[1].scrollIntoView).not.toHaveBeenCalled();
        expect(outside.scrollIntoView).not.toHaveBeenCalled();
    } finally {
        outside.remove();
    }
});

it('scrolls a percent-encoded Unicode fragment to its heading', () => {
    const { container } = render(
        <PreviewPane
            standard="gfm"
            accepted={{ byteLength: 40, content: '[go](#über-uns)\n\n## Über uns', revision: 1 }}
            documentId="doc-1"
            onRefresh={jest.fn()}
        />,
    );
    const heading = container.querySelector('h2');
    expect(heading).toHaveAttribute('id', 'über-uns');
    const scroll = jest.fn();
    heading!.scrollIntoView = scroll;

    fireEvent.click(screen.getByRole('link', { name: 'go' }));
    expect(scroll).toHaveBeenCalledWith({ block: 'start' });
});

it('scrolls an encoded literal percent fragment to a raw author id', () => {
    const { container } = render(
        <PreviewPane
            standard="gfm"
            accepted={{ byteLength: 48, content: '[go](#a%2520b)\n\n<h2 id="a%20b">Raw target</h2>', revision: 1 }}
            documentId="doc-1"
            onRefresh={jest.fn()}
        />,
    );
    const heading = container.querySelector('h2');
    expect(heading).toHaveAttribute('id', 'a%20b');
    const scroll = jest.fn();
    heading!.scrollIntoView = scroll;

    fireEvent.click(screen.getByRole('link', { name: 'go' }));
    expect(scroll).toHaveBeenCalledWith({ block: 'start' });
});

it('reports a focused self-link open so its existing tab can be revealed', async () => {
    const onFocusedDocumentOpen = jest.fn();
    const openPreviewLink = jest.fn(async () => ({ status: 'focused' as const, documentId: 'doc-1' }));
    render(
        <PreviewPane
            standard="gfm"
            accepted={{ byteLength: 19, content: '[self](./a.md)', revision: 1 }}
            documentId="doc-1"
            documentPath="/notes/a.md"
            linkAdapter={{ openPreviewLink }}
            onFocusedDocumentOpen={onFocusedDocumentOpen}
            onRefresh={jest.fn()}
        />,
    );

    fireEvent.click(screen.getByRole('link', { name: 'self' }));

    await waitFor(() => expect(onFocusedDocumentOpen).toHaveBeenCalledWith('doc-1'));
    expect(openPreviewLink).toHaveBeenCalledWith('doc-1', './a.md');
});

it('does not request tab reveal for a refused preview link', async () => {
    const onFocusedDocumentOpen = jest.fn();
    const openPreviewLink = jest.fn(async () => ({ status: 'refused' as const }));
    render(
        <PreviewPane
            standard="gfm"
            accepted={{ byteLength: 19, content: '[self](./a.md)', revision: 1 }}
            documentId="doc-1"
            documentPath="/notes/a.md"
            linkAdapter={{ openPreviewLink }}
            onFocusedDocumentOpen={onFocusedDocumentOpen}
            onRefresh={jest.fn()}
        />,
    );

    fireEvent.click(screen.getByRole('link', { name: 'self' }));

    await waitFor(() => expect(openPreviewLink).toHaveBeenCalledTimes(1));
    expect(onFocusedDocumentOpen).not.toHaveBeenCalled();
});
