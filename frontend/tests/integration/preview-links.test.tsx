import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import PreviewPane from '../../src/ui/widgets/PreviewPane';

it('scrolls an activated fragment to the first matching heading inside its own preview', async () => {
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
        await screen.findByRole('link', { name: 'go' });
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

it('keeps a raw alert anchor and scrolls the first matching ID inside its preview', async () => {
    const outside = document.createElement('div');
    outside.id = 'setup';
    outside.scrollIntoView = jest.fn();
    document.body.append(outside);
    try {
        const { container } = render(
            <PreviewPane
                standard="full"
                accepted={{
                    byteLength: 120,
                    content:
                        '[Jump](#setup)\n\n<blockquote id="setup"><p>[!NOTE]\nBody</p></blockquote>\n\n<h2 id="setup">Later</h2>',
                    revision: 1,
                }}
                documentId="doc-1"
                onRefresh={jest.fn()}
            />,
        );
        await screen.findByRole('link', { name: 'Jump' }, { timeout: 3_000 });
        const alert = container.querySelector('[role="note"]');
        const later = container.querySelector('h2');
        expect(alert).toHaveAttribute('id', 'setup');
        const alertScroll = jest.fn();
        alert!.scrollIntoView = alertScroll;
        later!.scrollIntoView = jest.fn();
        fireEvent.click(screen.getByRole('link', { name: 'Jump' }));
        expect(alertScroll).toHaveBeenCalledWith({ block: 'start' });
        expect(later!.scrollIntoView).not.toHaveBeenCalled();
        expect(outside.scrollIntoView).not.toHaveBeenCalled();
    } finally {
        outside.remove();
    }
}, 10_000);

it('scrolls a percent-encoded Unicode fragment to its heading', async () => {
    const { container } = render(
        <PreviewPane
            standard="gfm"
            accepted={{ byteLength: 40, content: '[go](#über-uns)\n\n## Über uns', revision: 1 }}
            documentId="doc-1"
            onRefresh={jest.fn()}
        />,
    );
    await screen.findByRole('link', { name: 'go' });
    const heading = container.querySelector('h2');
    expect(heading).toHaveAttribute('id', 'über-uns');
    const scroll = jest.fn();
    heading!.scrollIntoView = scroll;

    fireEvent.click(screen.getByRole('link', { name: 'go' }));
    expect(scroll).toHaveBeenCalledWith({ block: 'start' });
});

it('scrolls an encoded literal percent fragment to a raw author id', async () => {
    const { container } = render(
        <PreviewPane
            standard="gfm"
            accepted={{ byteLength: 48, content: '[go](#a%2520b)\n\n<h2 id="a%20b">Raw target</h2>', revision: 1 }}
            documentId="doc-1"
            onRefresh={jest.fn()}
        />,
    );
    await screen.findByRole('link', { name: 'go' });
    const heading = container.querySelector('h2');
    expect(heading).toHaveAttribute('id', 'a%20b');
    const scroll = jest.fn();
    heading!.scrollIntoView = scroll;

    fireEvent.click(screen.getByRole('link', { name: 'go' }));
    expect(scroll).toHaveBeenCalledWith({ block: 'start' });
});

it('hands a local document link to the one application command without opening through the preview adapter', async () => {
    const onOpenLink = jest.fn(async () => undefined);
    render(
        <PreviewPane
            standard="gfm"
            accepted={{ byteLength: 19, content: '[self](./a.md)', revision: 1 }}
            documentId="doc-1"
            documentPath="/notes/a.md"
            linkAdapter={{ openExternalLink: jest.fn() }}
            onOpenLink={onOpenLink}
            onRefresh={jest.fn()}
        />,
    );

    fireEvent.click(await screen.findByRole('link', { name: 'self' }));

    await waitFor(() => expect(onOpenLink).toHaveBeenCalledWith({ kind: 'localDocument', href: './a.md' }, 'doc-1'));
});

it('refuses a relative local link from an untitled preview before calling the application command', async () => {
    const onOpenLink = jest.fn(async () => undefined);
    const warn = jest.fn();
    render(
        <PreviewPane
            standard="gfm"
            accepted={{ byteLength: 19, content: '[self](./a.md)', revision: 1 }}
            documentId="doc-1"
            onOpenLink={onOpenLink}
            notificationOwner={{ warn }}
            onRefresh={jest.fn()}
        />,
    );

    fireEvent.click(await screen.findByRole('link', { name: 'self' }));

    expect(onOpenLink).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith('./a.md', expect.stringContaining('saved document'));
});
