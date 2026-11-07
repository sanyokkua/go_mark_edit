import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Provider } from 'react-redux';

const setUILayout = jest.fn(async (): Promise<void> => undefined);

jest.mock('../../src/logic/adapter', () => ({
    appModelAdapter: { setUILayout },
}));

jest.mock('../../src/ui/widgets/EditorView', () => ({
    __esModule: true,
    default: (): React.JSX.Element => <p>Existing document consumer</p>,
}));

import { hydrateProjection, resetProjection } from '../../src/logic/store/appModelProjectionActions';
import type { DocumentMetadata, UILayout } from '../../src/logic/store/appModelTypes';
import { store } from '../../src/logic/store';
import { hydrateSettings } from '../../src/logic/store/settingsSlice';
import AppShell from '../../src/ui/widgets/AppShell';
import { WorkspaceTreeTestProvider } from '../support/WorkspaceTreeTestProvider';

function pointerEvent(type: 'pointerdown' | 'pointermove' | 'pointerup', clientX: number, pointerId: number): Event {
    const event = new Event(type, { bubbles: true });
    Object.defineProperties(event, {
        clientX: { value: clientX },
        pointerId: { value: pointerId },
    });
    return event;
}

function setViewportWidth(width: number): void {
    Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        value: width,
    });
}

function renderShell(layout: UILayout = {}): void {
    store.dispatch(
        hydrateProjection({
            revision: 1,
            documents: {},
            activeDocumentId: '',
            ui: layout,
        }),
    );
    render(
        <Provider store={store}>
            <WorkspaceTreeTestProvider>
                <AppShell />
            </WorkspaceTreeTestProvider>
        </Provider>,
    );
}

beforeEach((): void => {
    store.dispatch(resetProjection());
    setUILayout.mockClear();
});

afterEach((): void => {
    store.dispatch(resetProjection());
});

it('keeps workspace and document regions while the reserved Assistant track has no surface', () => {
    renderShell({ sidebarVisible: true, sidebarWidth: 288 });

    expect(screen.getByRole('complementary', { name: 'Sidebar' })).toBeInTheDocument();
    expect(screen.getByRole('main', { name: 'Document area' })).toHaveTextContent('Existing document consumer');
    expect(screen.queryByLabelText(/assistant/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/assistant/i)).not.toBeInTheDocument();
    expect(screen.getByTestId('application-shell')).toHaveAttribute('data-document-state', 'empty');
});

it('renders an immediate non-durable divider width while sending the durable intent to Go', () => {
    renderShell({ sidebarVisible: true, sidebarWidth: 288 });

    const shell = screen.getByTestId('application-shell');
    expect(shell).toHaveAttribute('data-workspace-visible', 'true');
    expect(shell).toHaveStyle({ '--shell-left-width': '288px' });

    const divider = screen.getByRole('separator', {
        name: 'Resize sidebar',
    });
    fireEvent(divider, pointerEvent('pointerdown', 288, 7));
    fireEvent(window, pointerEvent('pointermove', 320, 7));
    fireEvent(window, pointerEvent('pointerup', 320, 7));

    expect(setUILayout).toHaveBeenCalledWith({ sidebarWidth: 320 });
    expect(shell).toHaveStyle({ '--shell-left-width': '320px' });
});

it('restores the last acknowledged divider width after its delayed layout write fails', async () => {
    renderShell({ sidebarVisible: true, sidebarWidth: 288 });

    const shell = screen.getByTestId('application-shell');
    const divider = screen.getByRole('separator', {
        name: 'Resize sidebar',
    });
    setUILayout.mockRejectedValueOnce(new Error('layout update failed'));
    fireEvent(divider, pointerEvent('pointerdown', 288, 7));
    fireEvent(window, pointerEvent('pointermove', 320, 7));
    fireEvent(window, pointerEvent('pointerup', 320, 7));
    expect(shell).toHaveStyle({ '--shell-left-width': '320px' });

    await waitFor(() => {
        expect(shell).toHaveStyle({ '--shell-left-width': '288px' });
    });
});

it('keeps the workspace divider keyboard reachable and requests fixed width steps', () => {
    renderShell({ sidebarVisible: true, sidebarWidth: 288 });

    const divider = screen.getByRole('separator', {
        name: 'Resize sidebar',
    });
    divider.focus();
    expect(divider).toHaveFocus();

    fireEvent.keyDown(divider, { key: 'ArrowRight' });
    expect(setUILayout).toHaveBeenLastCalledWith({ sidebarWidth: 304 });

    fireEvent.keyDown(divider, { key: 'ArrowLeft' });
    expect(setUILayout).toHaveBeenLastCalledWith({ sidebarWidth: 288 });
});

/*
 * The native minimum window is 375x480 (`main.go:104-105`), and frame rounding
 * can expose 376 CSS pixels at that size, so both widths are the minimum
 * window.
 */
for (const width of [375, 376]) {
    it(`renders no workspace panel and no divider at ${width}px`, () => {
        setViewportWidth(width);
        try {
            renderShell({ sidebarVisible: true, sidebarWidth: 288 });

            expect(screen.queryByRole('complementary', { name: 'Sidebar' })).not.toBeInTheDocument();
            expect(screen.queryByRole('separator', { name: 'Resize sidebar' })).not.toBeInTheDocument();
            /*
             * The stored preference is the single source of truth and it is
             * untouched: App.tsx hands the same value to the View menu's toggle, so
             * if the collapse owned a second "is it open" state this would read
             * `false` and the toggle would stop agreeing with the panel. Nothing is
             * written either — the preference still governs the wide layout.
             */
            expect(screen.getByTestId('application-shell')).toHaveAttribute('data-workspace-visible', 'true');
            expect(setUILayout).not.toHaveBeenCalled();
        } finally {
            setViewportWidth(1024);
        }
    });
}

it('keeps the workspace panel and divider one pixel above the minimum window', () => {
    setViewportWidth(377);
    try {
        renderShell({ sidebarVisible: true, sidebarWidth: 288 });

        expect(screen.getByRole('complementary', { name: 'Sidebar' })).toBeInTheDocument();
        expect(screen.getByRole('separator', { name: 'Resize sidebar' })).toBeInTheDocument();
    } finally {
        setViewportWidth(1024);
    }
});

it('still reports a stored hidden workspace at the minimum window', () => {
    setViewportWidth(375);
    try {
        renderShell({ sidebarVisible: false, sidebarWidth: 288 });

        expect(screen.queryByRole('complementary', { name: 'Sidebar' })).not.toBeInTheDocument();
        expect(screen.getByTestId('application-shell')).toHaveAttribute('data-workspace-visible', 'false');
    } finally {
        setViewportWidth(1024);
    }
});

it('places the 28px status surface below editor content in the shell region', () => {
    const document: DocumentMetadata = {
        documentId: 'document-1',
        title: 'notes.md',
        path: '/Users/test/projects/notes.md',
        displayName: 'notes.md',
        parentName: 'projects',
        dirty: false,
        encoding: 'utf-8',
        lineEnding: 'lf',
        wordCount: 3,
        status: 'saved',
        view: {
            arrangement: 'editor',
            editorVisible: true,
            previewVisible: false,
            cursor: { line: 4, column: 2 },
            selection: {
                start: { line: 1, column: 1 },
                end: { line: 1, column: 1 },
            },
            scroll: { editor: 0, preview: 0 },
        },
    };
    store.dispatch(
        hydrateProjection({
            revision: 1,
            documents: { [document.documentId]: document },
            activeDocumentId: document.documentId,
            ui: {},
        }),
    );
    render(
        <Provider store={store}>
            <WorkspaceTreeTestProvider>
                <AppShell />
            </WorkspaceTreeTestProvider>
        </Provider>,
    );

    const documentArea = screen.getByRole('main', { name: 'Document area' });
    const status = within(documentArea).getByRole('status', {
        name: 'Document status',
    });
    // The row no longer prints the save status — the title bar owns it — so the
    // backend projection is asserted on the authoritative attribute instead.
    expect(status).toHaveAttribute('data-status-state', 'saved');
    /*
     * The row sits one level down since : its own `overflow: hidden` clipped
     * the `Document details` disclosure to nothing, so the panel moved out of the
     * row and into a dock that wraps it. The contract this test exists for is
     * unchanged — the status surface is inside the document area, not full width
     * beneath the sidebar — so it is asserted through the dock rather than
     * loosened to a `contains` check.
     */
    const dock = status.parentElement;
    expect(dock).toHaveAttribute('data-status-dock', 'true');
    expect(dock?.parentElement).toBe(documentArea);
});

it('projects an acknowledged autosave-on setting into status details', () => {
    const document: DocumentMetadata = {
        documentId: 'document-autosave-off',
        title: 'notes.md',
        path: '/Users/test/projects/notes.md',
        displayName: 'notes.md',
        parentName: 'projects',
        dirty: false,
        encoding: 'utf-8',
        lineEnding: 'lf',
        wordCount: 3,
        status: 'saved',
        view: {
            arrangement: 'editor',
            editorVisible: true,
            previewVisible: false,
            cursor: { line: 1, column: 1 },
            selection: {
                start: { line: 1, column: 1 },
                end: { line: 1, column: 1 },
            },
            scroll: { editor: 0, preview: 0 },
        },
    };
    store.dispatch(
        hydrateProjection({
            revision: 1,
            documents: { [document.documentId]: document },
            activeDocumentId: document.documentId,
            ui: {},
        }),
    );
    store.dispatch(
        hydrateSettings({
            appearance: {
                theme: 'glass',
                mode: 'light',
                defaultOpenMode: 'split',
                readingWidth: 'page',
                pdfAppearance: 'styled',
            },
            markdown: {
                standard: 'gfm',
                formatOnSave: false,
                lintOnSave: false,
                bulletMarker: '-',
                emphasisMarker: '*',
                headingStyle: 'atx',
            },
            contentPrivacy: { remotePolicy: 'local-only' },
            file: { autosave: true },
        }),
    );

    render(
        <Provider store={store}>
            <WorkspaceTreeTestProvider>
                <AppShell />
            </WorkspaceTreeTestProvider>
        </Provider>,
    );

    const status = screen.getByRole('status', { name: 'Document status' });
    fireEvent.click(within(status).getByRole('button', { name: 'Document details' }));
    // Docked beside the row rather than inside it, so the row's clip cannot hide
    // it — .
    expect(screen.getByRole('region', { name: 'Document details' })).toHaveTextContent('Autosave on');

    act(() => {
        store.dispatch(
            hydrateSettings({
                appearance: {
                    theme: 'glass',
                    mode: 'light',
                    defaultOpenMode: 'split',
                    readingWidth: 'page',
                    pdfAppearance: 'styled',
                },
                markdown: {
                    standard: 'gfm',
                    formatOnSave: false,
                    lintOnSave: false,
                    bulletMarker: '-',
                    emphasisMarker: '*',
                    headingStyle: 'atx',
                },
                contentPrivacy: { remotePolicy: 'local-only' },
                file: { autosave: false },
            }),
        );
    });
    expect(screen.getByRole('region', { name: 'Document details' })).toHaveTextContent('Autosave off');
});

it('uses exact responsive presentations without durable responsive write-back', () => {
    renderShell({ sidebarVisible: true, sidebarWidth: 288 });

    Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        value: 768,
    });
    fireEvent(window, new Event('resize'));
    Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        value: 375,
    });
    fireEvent(window, new Event('resize'));

    expect(setUILayout).not.toHaveBeenCalled();
});

it('shows the workspace panel and divider when enabled', () => {
    setViewportWidth(1024);
    renderShell({ sidebarVisible: true, sidebarWidth: 288 });
    expect(screen.getByRole('complementary', { name: 'Sidebar' })).toBeInTheDocument();
    expect(screen.getByRole('separator', { name: 'Resize sidebar' })).toBeInTheDocument();
});
