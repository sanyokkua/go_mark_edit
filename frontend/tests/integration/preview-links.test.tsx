import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import PreviewPane from '../../src/ui/widgets/PreviewPane';

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
