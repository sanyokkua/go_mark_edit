import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { Provider } from 'react-redux';

import { hydrateProjection, resetProjection } from '../../src/logic/store/appModelProjectionActions';
import type { UILayout } from '../../src/logic/store/appModelTypes';
import { store } from '../../src/logic/store';
import { hydrateSettings, resetSettingsProjection } from '../../src/logic/store/settingsSlice';
import { loadedMarkdownSettings } from '../support/loadedMarkdownSettings';
import AppShell from '../../src/ui/widgets/AppShell';
import { WorkspaceTreeTestProvider } from '../support/WorkspaceTreeTestProvider';
import * as problemsSummary from '../../src/logic/operations/problemsSummary';

jest.mock('../../src/logic/adapter', () => ({
    appModelAdapter: {
        setUILayout: jest.fn(async (): Promise<void> => undefined),
    },
}));

jest.mock('../../src/ui/widgets/EditorView', () => ({
    __esModule: true,
    default: (): React.JSX.Element => <p>Document consumer</p>,
}));

function renderShell(layout: UILayout): void {
    store.dispatch(
        hydrateProjection({
            revision: 1,
            documents: {},
            activeDocumentId: null,
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

beforeEach(() => {
    store.dispatch(resetProjection());
    store.dispatch(resetSettingsProjection());
});

afterEach(() => {
    problemsSummary.clear();
    store.dispatch(resetProjection());
    store.dispatch(resetSettingsProjection());
});

it('shows the exact problem count after Lint, marks stale results, and clears on document activation', () => {
    const document = {
        documentId: 'doc-1',
        title: 'notes.md',
        path: '/notes.md',
        dirty: false,
        encoding: 'utf-8',
        lineEnding: 'lf',
        wordCount: 1,
        status: 'saved' as const,
        view: {
            arrangement: 'editor' as const,
            editorVisible: true,
            previewVisible: false,
            cursor: { line: 1, column: 1 },
            selection: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
            scroll: { editor: 0, preview: 0 },
        },
    };
    store.dispatch(
        hydrateProjection({ revision: 1, documents: { 'doc-1': document }, activeDocumentId: 'doc-1', ui: {} }),
    );
    const onToggleProblems = jest.fn();
    render(
        <Provider store={store}>
            <WorkspaceTreeTestProvider>
                <AppShell problemsOpen={false} onToggleProblems={onToggleProblems} />
            </WorkspaceTreeTestProvider>
        </Provider>,
    );
    const status = screen.getByRole('status', { name: 'Document status' });
    expect(status.querySelector('[data-status-item="problems"]')).toBeNull();
    const initialWidth = window.innerWidth;
    try {
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 375 });
        fireEvent(window, new Event('resize'));
        expect(status.querySelector('[data-status-item="cursor"]')).toBeInTheDocument();
    } finally {
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: initialWidth });
        fireEvent(window, new Event('resize'));
    }

    act(() => problemsSummary.replace('doc-1', [], 0, 'clean'));
    const count = within(status).getByRole('button', { name: '0 problems' });
    fireEvent.click(count);
    expect(onToggleProblems).toHaveBeenCalledTimes(1);

    act(() => problemsSummary.replace('doc-1', [], 12000, 'old'));
    expect(within(status).getByRole('button', { name: '12,000 problems' })).toBeInTheDocument();
    act(() => problemsSummary.markStale('doc-1', 'edited'));
    expect(within(status).getByRole('button', { name: /12,000 problems.*out of date/ })).toBeInTheDocument();

    const previousWidth = window.innerWidth;
    try {
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 375 });
        fireEvent(window, new Event('resize'));
        expect(status.querySelector('[data-status-item="problems"]')).toBeInTheDocument();
        expect(status.querySelector('[data-status-item="cursor"]')).toBeNull();
        fireEvent.click(within(status).getByRole('button', { name: 'Document details' }));
        const details = screen.getByRole('region', { name: 'Document details' });
        expect(within(details).getByRole('button', { name: /Problems: 12,000.*out of date/ })).toBeInTheDocument();
        expect(details).toHaveTextContent('Ln 1, Col 1');
    } finally {
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: previousWidth });
        fireEvent(window, new Event('resize'));
    }

    act(() => {
        store.dispatch(
            hydrateProjection({
                revision: 2,
                documents: { 'doc-2': { ...document, documentId: 'doc-2' } },
                activeDocumentId: 'doc-2',
                ui: {},
            }),
        );
    });
    expect(
        screen.getByRole('status', { name: 'Document status' }).querySelector('[data-status-item="problems"]'),
    ).toBeNull();
});

it('omits the standard in status and details until hydration, then shows the stored value', () => {
    const document = {
        documentId: 'doc-1',
        title: 'notes.md',
        path: '/notes.md',
        dirty: false,
        encoding: 'utf-8',
        lineEnding: 'lf',
        wordCount: 1,
        status: 'saved' as const,
        view: {
            arrangement: 'editor' as const,
            editorVisible: true,
            previewVisible: false,
            cursor: { line: 1, column: 1 },
            selection: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
            scroll: { editor: 0, preview: 0 },
        },
    };
    store.dispatch(
        hydrateProjection({ revision: 1, documents: { 'doc-1': document }, activeDocumentId: 'doc-1', ui: {} }),
    );
    render(
        <Provider store={store}>
            <WorkspaceTreeTestProvider>
                <AppShell />
            </WorkspaceTreeTestProvider>
        </Provider>,
    );
    const status = screen.getByRole('status', { name: 'Document status' });
    expect(status.querySelector('[data-status-item="standard-kind"]')).toBeNull();
    fireEvent.click(within(status).getByRole('button', { name: 'Document details' }));
    expect(screen.getByRole('region', { name: 'Document details' })).not.toHaveTextContent('Markdown ·');

    act(() => {
        store.dispatch(hydrateSettings(loadedMarkdownSettings));
    });
    expect(status.querySelector('[data-status-item="standard-kind"]')).toHaveTextContent('Full');
    act(() => {
        store.dispatch(resetSettingsProjection());
    });
    expect(status.querySelector('[data-status-item="standard-kind"]')).toBeNull();
});

it('renders workspace and document regions while reserving the assistant track', () => {
    renderShell({ sidebarVisible: true, sidebarWidth: 288 });

    expect(screen.getByRole('complementary', { name: 'Sidebar' })).toBeInTheDocument();
    expect(screen.getByRole('main', { name: 'Document area' })).toHaveTextContent('Document consumer');
    expect(screen.queryByLabelText(/assistant/i)).not.toBeInTheDocument();
});
