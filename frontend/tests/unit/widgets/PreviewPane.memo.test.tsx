import { fireEvent, render } from '@testing-library/react';
import type { Components } from 'react-markdown';

import {
    PreviewPaneContent,
    type PreviewNotificationOwner,
    type PreviewPaneState,
} from '../../../src/ui/widgets/PreviewPane';

const mockRenderCount = { value: 0 };

/*
 * Stubs `react-markdown` so a render is cheap to count and so the mock can
 * hand back the pane's own `a` renderer as a real, clickable element. The
 * pane wires its link-activation callback into that renderer; going through
 * it (rather than calling the callback directly) proves the wiring a user's
 * click actually exercises, not just the callback in isolation.
 */
jest.mock('react-markdown', () => ({
    __esModule: true,
    default: ({ components }: { children: string; components?: Components }): React.JSX.Element => {
        mockRenderCount.value += 1;
        const Anchor = components?.a;
        return (
            <div data-testid="markdown">{Anchor ? <Anchor href="https://example.test/page">link</Anchor> : null}</div>
        );
    },
}));

beforeEach((): void => {
    mockRenderCount.value = 0;
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

it('does not re-render the markdown when the pane re-renders with a new notification owner', () => {
    const controller = renderedController();
    const { rerender } = render(
        <PreviewPaneContent controller={controller} documentId="doc-1" notificationOwner={{ warn: jest.fn() }} />,
    );
    expect(mockRenderCount.value).toBe(1);

    rerender(<PreviewPaneContent controller={controller} documentId="doc-1" notificationOwner={{ warn: jest.fn() }} />);

    expect(mockRenderCount.value).toBe(1);
});

it('warns through the latest notification owner after the pane re-renders', () => {
    const controller = renderedController();
    const firstOwner: PreviewNotificationOwner = { warn: jest.fn() };
    const secondOwner: PreviewNotificationOwner = { warn: jest.fn() };
    const { getByText, rerender } = render(
        <PreviewPaneContent controller={controller} documentId="doc-1" notificationOwner={firstOwner} />,
    );

    rerender(<PreviewPaneContent controller={controller} documentId="doc-1" notificationOwner={secondOwner} />);
    fireEvent.click(getByText('link'));

    expect(secondOwner.warn).toHaveBeenCalledWith('https://example.test/page', expect.any(String));
    expect(firstOwner.warn).not.toHaveBeenCalled();
});

it('opens through the latest link adapter after the pane re-renders', () => {
    const controller = renderedController();
    const firstAdapter = { openExternalLink: jest.fn() };
    const secondAdapter = { openExternalLink: jest.fn() };
    const { getByText, rerender } = render(
        <PreviewPaneContent controller={controller} documentId="doc-1" linkAdapter={firstAdapter} />,
    );

    rerender(<PreviewPaneContent controller={controller} documentId="doc-1" linkAdapter={secondAdapter} />);
    fireEvent.click(getByText('link'));

    expect(secondAdapter.openExternalLink).toHaveBeenCalledWith('https://example.test/page');
    expect(firstAdapter.openExternalLink).not.toHaveBeenCalled();
});
