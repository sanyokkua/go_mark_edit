import { fireEvent, render, screen } from '@testing-library/react';
import type { Components } from 'react-markdown';

import {
    PreviewPaneContent,
    type PreviewNotificationOwner,
    type PreviewPaneState,
} from '../../../src/ui/widgets/PreviewPane';

const mockRenderCount = { value: 0 };
const mockRenderFailure = { value: false };

/*
 * Stubs `react-markdown` so a render is cheap to count and so the mock can
 * hand back the pane's own `a` renderer as a real, clickable element. The
 * pane wires its link-activation callback into that renderer; going through
 * it (rather than calling the callback directly) proves the wiring a user's
 * click actually exercises, not just the callback in isolation.
 */
jest.mock('react-markdown', () => ({
    __esModule: true,
    default: ({ children, components }: { children: string; components?: Components }): React.JSX.Element => {
        if (mockRenderFailure.value) throw new Error('preview render failed');
        mockRenderCount.value += 1;
        const Anchor = components?.a;
        return (
            <div data-testid="markdown">
                {children}
                {Anchor ? <Anchor href="https://example.test/page">link</Anchor> : null}
            </div>
        );
    },
}));

beforeEach((): void => {
    mockRenderCount.value = 0;
    mockRenderFailure.value = false;
});

function renderedController(): PreviewPaneState {
    return {
        currentRefreshError: null,
        isPaused: false,
        isRefreshing: false,
        refresh: jest.fn(),
        rendered: { byteLength: 8, content: '# title\n', revision: 1 },
    };
}

it('shows localized loading until settings and the lazy preview module load, including paused previews', async () => {
    const controller = renderedController();
    const { rerender } = render(<PreviewPaneContent controller={controller} settingsLoaded={false} />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading Markdown settings');
    expect(screen.queryByTestId('markdown')).toBeNull();
    expect(mockRenderCount.value).toBe(0);

    rerender(<PreviewPaneContent controller={{ ...controller, isPaused: true }} settingsLoaded={false} />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading Markdown settings');
    expect(screen.queryByTestId('markdown')).toBeNull();

    rerender(<PreviewPaneContent standard="gfm" controller={controller} settingsLoaded />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading Markdown settings');
    expect(await screen.findByTestId('markdown')).toBeInTheDocument();
    expect(mockRenderCount.value).toBe(1);
});

it('retains the last committed preview after a pause and a local render failure', async () => {
    const controller = renderedController();
    const { rerender } = render(<PreviewPaneContent standard="gfm" controller={controller} documentId="doc-1" />);
    expect(await screen.findByText(/# title/)).toBeInTheDocument();

    rerender(<PreviewPaneContent standard="gfm" controller={{ ...controller, isPaused: true }} documentId="doc-1" />);
    expect(screen.queryByTestId('markdown')).toBeNull();

    mockRenderFailure.value = true;
    rerender(
        <PreviewPaneContent
            standard="gfm"
            controller={{ ...controller, rendered: { byteLength: 12, content: 'new source', revision: 2 } }}
            documentId="doc-1"
        />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Showing the last successful version');
    expect(screen.getByText(/# title/)).toBeInTheDocument();
    expect(screen.queryByText('new source')).toBeNull();
});

it('does not re-render the markdown when the pane re-renders with a new notification owner', () => {
    const controller = renderedController();
    const { rerender } = render(
        <PreviewPaneContent
            standard="gfm"
            controller={controller}
            documentId="doc-1"
            notificationOwner={{ warn: jest.fn() }}
        />,
    );
    expect(mockRenderCount.value).toBe(1);

    rerender(
        <PreviewPaneContent
            standard="gfm"
            controller={controller}
            documentId="doc-1"
            notificationOwner={{ warn: jest.fn() }}
        />,
    );

    expect(mockRenderCount.value).toBe(1);
});

it('warns through the latest notification owner after the pane re-renders', () => {
    const controller = renderedController();
    const firstOwner: PreviewNotificationOwner = { warn: jest.fn() };
    const secondOwner: PreviewNotificationOwner = { warn: jest.fn() };
    const { getByText, rerender } = render(
        <PreviewPaneContent standard="gfm" controller={controller} documentId="doc-1" notificationOwner={firstOwner} />,
    );

    rerender(
        <PreviewPaneContent
            standard="gfm"
            controller={controller}
            documentId="doc-1"
            notificationOwner={secondOwner}
        />,
    );
    fireEvent.click(getByText('link'));

    expect(secondOwner.warn).toHaveBeenCalledWith('https://example.test/page', expect.any(String));
    expect(firstOwner.warn).not.toHaveBeenCalled();
});

it('opens through the latest link adapter after the pane re-renders', () => {
    const controller = renderedController();
    const firstAdapter = { openExternalLink: jest.fn() };
    const secondAdapter = { openExternalLink: jest.fn() };
    const { getByText, rerender } = render(
        <PreviewPaneContent standard="gfm" controller={controller} documentId="doc-1" linkAdapter={firstAdapter} />,
    );

    rerender(
        <PreviewPaneContent standard="gfm" controller={controller} documentId="doc-1" linkAdapter={secondAdapter} />,
    );
    expect(mockRenderCount.value).toBe(1);
    fireEvent.click(getByText('link'));

    expect(secondAdapter.openExternalLink).toHaveBeenCalledWith('https://example.test/page');
    expect(firstAdapter.openExternalLink).not.toHaveBeenCalled();
});
