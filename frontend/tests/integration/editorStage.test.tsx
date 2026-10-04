import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import type { Plugin } from 'unified';
import { loadedMarkdownSettings } from '../support/loadedMarkdownSettings';
import {
    acknowledgeMarkdownSettings,
    hydrateSettings,
    resetSettingsProjection,
} from '../../src/logic/store/settingsSlice';

import type { EditorStageAdapter } from '../../src/ui/widgets/EditorStage/EditorStage';
import EditorStage from '../../src/ui/widgets/EditorStage/EditorStage';
import { hydrateProjection, resetProjection } from '../../src/logic/store/appModelProjectionActions';
import type { DocumentMetadata } from '../../src/logic/store/appModelTypes';
import { store } from '../../src/logic/store';
import { EditorSessionProvider } from '../../src/ui/widgets/editorSession';
import { PREVIEW_BYTE_LIMIT } from '../../src/ui/widgets/PreviewPane';
import { createPipeline } from '../../src/logic/markdown/pipeline';

jest.mock('../../src/logic/markdown/pipeline', () => {
    const actual = jest.requireActual<typeof import('../../src/logic/markdown/pipeline')>(
        '../../src/logic/markdown/pipeline',
    );
    return { ...actual, createPipeline: jest.fn(actual.createPipeline) };
});

const actualCreatePipeline = jest.requireActual<typeof import('../../src/logic/markdown/pipeline')>(
    '../../src/logic/markdown/pipeline',
).createPipeline;
const mockCreatePipeline = jest.mocked(createPipeline);

jest.mock('../../src/ui/components/CodeEditor', () => {
    const React = jest.requireActual<typeof import('react')>('react');
    const MockCodeEditor = React.forwardRef<HTMLTextAreaElement, { initialValue: string }>(function MockCodeEditor(
        { initialValue },
        ref,
    ): React.JSX.Element {
        return React.createElement('textarea', {
            'aria-label': 'Markdown source',
            defaultValue: initialValue,
            ref,
        });
    });
    return { __esModule: true, default: MockCodeEditor };
});

const adapter: EditorStageAdapter = {
    flushBuffer: jest.fn(async (): Promise<void> => undefined),
    flushDocView: jest.fn(async (): Promise<void> => undefined),
    subscribeAcceptedBuffers: jest.fn(() => jest.fn()),
    updateBuffer: jest.fn(async (): Promise<void> => undefined),
    updateDocView: jest.fn(async (): Promise<void> => undefined),
};

function documentFor(arrangement: DocumentMetadata['view']['arrangement']): DocumentMetadata {
    return {
        documentId: 'document-1',
        title: 'Long document title',
        path: '',
        dirty: false,
        encoding: 'utf-8',
        lineEnding: 'lf',
        wordCount: 2,
        view: {
            arrangement,
            editorVisible: arrangement !== 'preview',
            previewVisible: arrangement !== 'editor',
            cursor: { line: 2, column: 3 },
            selection: {
                start: { line: 1, column: 1 },
                end: { line: 1, column: 4 },
            },
            scroll: { editor: 0, preview: 0 },
        },
    };
}

beforeEach(() => {
    store.dispatch(hydrateSettings(loadedMarkdownSettings));
    store.dispatch(resetProjection());
});

afterEach(() => {
    store.dispatch(resetProjection());
    mockCreatePipeline.mockReset().mockImplementation(actualCreatePipeline);
});

it('resizes the split without replacing the editor and commits only the ratio intent', async () => {
    const document = documentFor('split');
    const setDocView = jest.fn(async () => undefined);
    render(
        <Provider store={store}>
            <EditorSessionProvider activeBuffer={{ documentId: document.documentId, content: '# Heading' }}>
                <EditorStage
                    adapter={{ ...adapter, setDocView }}
                    activeBuffer={{ documentId: document.documentId, content: '# Heading' }}
                    activeDocument={document}
                    editorVisible
                    previewVisible
                    readOnly={false}
                    view={document.view}
                    onLiveCursorChange={jest.fn()}
                    onPreviewWarning={jest.fn()}
                />
            </EditorSessionProvider>
        </Provider>,
    );
    const editor = screen.getByLabelText('Markdown source');
    const divider = screen.getByRole('separator', { name: 'Resize editor and preview panes' });
    fireEvent.keyDown(divider, { key: 'ArrowRight' });
    expect(divider).toHaveAttribute('aria-valuenow', '52');
    expect(screen.getByLabelText('Markdown source')).toBe(editor);
    await waitFor(() =>
        expect(setDocView).toHaveBeenCalledWith(
            document.documentId,
            { splitRatio: 0.52 },
            expect.objectContaining({ cursor: document.view.cursor, scroll: document.view.scroll }),
        ),
    );
});

it('restores the acknowledged ratio and reports a refused resize command', async () => {
    const document = documentFor('split');
    const noticesBefore = store.getState().notifications.items.length;
    const setDocView = jest.fn(async () => {
        throw { code: 'validation', message: 'Invalid ratio', title: 'Invalid input', retryable: false };
    });
    render(
        <Provider store={store}>
            <EditorSessionProvider activeBuffer={{ documentId: document.documentId, content: '# Heading' }}>
                <EditorStage
                    adapter={{ ...adapter, setDocView }}
                    activeBuffer={{ documentId: document.documentId, content: '# Heading' }}
                    activeDocument={document}
                    editorVisible
                    previewVisible
                    readOnly={false}
                    view={document.view}
                    onLiveCursorChange={jest.fn()}
                    onPreviewWarning={jest.fn()}
                />
            </EditorSessionProvider>
        </Provider>,
    );
    const divider = screen.getByRole('separator', { name: 'Resize editor and preview panes' });
    fireEvent.keyDown(divider, { key: 'ArrowRight' });
    await waitFor(() => expect(divider).toHaveAttribute('aria-valuenow', '50'));
    expect(store.getState().notifications.items.length).toBeGreaterThan(noticesBefore);
});

it('discards an uncommitted drag when switching away from a document and back', () => {
    const first = documentFor('split');
    const setDocView = jest.fn(async () => undefined);
    const renderStage = (documentId: string, previewVisible = true): React.JSX.Element => (
        <Provider store={store}>
            <EditorSessionProvider activeBuffer={{ documentId, content: '# Heading' }}>
                <EditorStage
                    adapter={{ ...adapter, setDocView }}
                    activeBuffer={{ documentId, content: '# Heading' }}
                    activeDocument={{ ...first, documentId }}
                    editorVisible
                    previewVisible={previewVisible}
                    readOnly={false}
                    view={{ ...first.view, splitRatio: 0.5 }}
                    onLiveCursorChange={jest.fn()}
                    onPreviewWarning={jest.fn()}
                />
            </EditorSessionProvider>
        </Provider>
    );
    const { rerender } = render(renderStage('one'));
    const panes = screen.getAllByRole('region');
    for (const pane of panes) jest.spyOn(pane, 'getBoundingClientRect').mockReturnValue({ width: 500 } as DOMRect);
    const event = (type: string, x: number): Event => {
        const pointer = new Event(type, { bubbles: true });
        Object.defineProperties(pointer, { clientX: { value: x }, pointerId: { value: 7 }, button: { value: 0 } });
        return pointer;
    };
    fireEvent(screen.getByRole('separator'), event('pointerdown', 500));
    fireEvent(window, event('pointermove', 700));
    expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '70');
    rerender(renderStage('two'));
    rerender(renderStage('one'));
    expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '50');
    fireEvent(window, event('pointerup', 700));
    expect(setDocView).not.toHaveBeenCalled();
    fireEvent(screen.getByRole('separator'), event('pointerdown', 500));
    fireEvent(window, event('pointermove', 700));
    rerender(renderStage('one', false));
    rerender(renderStage('one'));
    expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '50');
});

it('restores each document ratio and hides the divider in single-pane and narrow layouts', () => {
    const first = documentFor('split');
    const renderStage = (documentId: string, splitRatio: number, previewVisible = true): React.JSX.Element => (
        <Provider store={store}>
            <EditorSessionProvider activeBuffer={{ documentId, content: '# Heading' }}>
                <EditorStage
                    adapter={adapter}
                    activeBuffer={{ documentId, content: '# Heading' }}
                    activeDocument={{ ...first, documentId }}
                    editorVisible
                    previewVisible={previewVisible}
                    readOnly={false}
                    view={{ ...first.view, splitRatio }}
                    onLiveCursorChange={jest.fn()}
                    onPreviewWarning={jest.fn()}
                />
            </EditorSessionProvider>
        </Provider>
    );
    const { rerender } = render(renderStage('one', 0.65));
    expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '65');
    rerender(renderStage('two', 0.35));
    expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '35');
    rerender(renderStage('one', 0.65, false));
    expect(screen.queryByRole('separator')).toBeNull();
    rerender(renderStage('one', 0.65));
    expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '65');
    const originalWidth = window.innerWidth;
    try {
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 376 });
        fireEvent(window, new Event('resize'));
        expect(screen.queryByRole('separator')).toBeNull();
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
        fireEvent(window, new Event('resize'));
        expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '65');
    } finally {
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth });
    }
});

it('keeps the committed preview through a failed same-document source refresh and isolates the next document', async () => {
    const failBrokenSource: Plugin = () => (_tree, file) => {
        if (String(file.value).includes('broken document')) throw new Error('parse failed');
    };
    mockCreatePipeline.mockImplementation((standard) => {
        const pipeline = actualCreatePipeline(standard);
        return { ...pipeline, remarkPlugins: [...pipeline.remarkPlugins, failBrokenSource] };
    });
    const document = documentFor('split');
    const view = (documentId: string, content: string, documentRevision: number): React.JSX.Element => {
        const buffer = { documentId, content, documentRevision };
        return (
            <Provider store={store}>
                <EditorSessionProvider activeBuffer={buffer}>
                    <EditorStage
                        adapter={adapter}
                        activeBuffer={buffer}
                        activeDocument={{ ...document, documentId }}
                        editorVisible
                        previewVisible
                        readOnly={false}
                        view={document.view}
                        onLiveCursorChange={jest.fn()}
                        onPreviewWarning={jest.fn()}
                    />
                </EditorSessionProvider>
            </Provider>
        );
    };
    const { rerender } = render(view('document-1', '# Committed output', 1));
    expect(await screen.findByRole('heading', { name: 'Committed output' })).toBeInTheDocument();

    rerender(view('document-1', 'broken document', 2));
    expect(screen.getByRole('alert')).toHaveTextContent('Preview could not be rendered');
    expect(screen.getByRole('heading', { name: 'Committed output' })).toBeInTheDocument();

    rerender(view('document-1', '# Recovered output', 3));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Recovered output' })).toBeInTheDocument();

    rerender(view('document-2', 'broken document', 1));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Recovered output' })).toBeNull();
});

it('retains a committed preview across editor-only mode without parsing the hidden source', async () => {
    let unavailable = false;
    mockCreatePipeline.mockImplementation((standard) => {
        if (unavailable) throw new Error('renderer unavailable');
        return actualCreatePipeline(standard);
    });
    const view = (content: string, previewVisible: boolean): React.JSX.Element => {
        const document = documentFor(previewVisible ? 'split' : 'editor');
        const buffer = { documentId: document.documentId, content };
        return (
            <Provider store={store}>
                <EditorSessionProvider activeBuffer={buffer}>
                    <EditorStage
                        adapter={adapter}
                        activeBuffer={buffer}
                        activeDocument={document}
                        editorVisible
                        previewVisible={previewVisible}
                        readOnly={false}
                        view={document.view}
                        onLiveCursorChange={jest.fn()}
                        onPreviewWarning={jest.fn()}
                    />
                </EditorSessionProvider>
            </Provider>
        );
    };
    const { rerender } = render(view('# Committed before hiding', true));
    expect(await screen.findByRole('heading', { name: 'Committed before hiding' })).toBeInTheDocument();
    expect(mockCreatePipeline).toHaveBeenCalledTimes(1);
    const parses = mockCreatePipeline.mock.calls.length;

    unavailable = true;
    rerender(view('broken while hidden', false));
    expect(screen.queryByLabelText('Preview pane')).not.toBeInTheDocument();
    expect(mockCreatePipeline).toHaveBeenCalledTimes(parses);

    rerender(view('broken while hidden', true));
    expect(screen.getByRole('alert')).toHaveTextContent('Showing the last successful version');
    expect(screen.getByRole('heading', { name: 'Committed before hiding' })).toBeInTheDocument();
});

it('retains a committed preview across a large-document pause and failing manual refresh', async () => {
    let unavailable = false;
    mockCreatePipeline.mockImplementation((standard) => {
        if (unavailable) throw new Error('renderer unavailable');
        return actualCreatePipeline(standard);
    });
    const document = documentFor('split');
    const view = (content: string): React.JSX.Element => {
        const buffer = { documentId: document.documentId, content };
        return (
            <Provider store={store}>
                <EditorSessionProvider activeBuffer={buffer}>
                    <EditorStage
                        adapter={adapter}
                        activeBuffer={buffer}
                        activeDocument={document}
                        editorVisible
                        previewVisible
                        readOnly={false}
                        view={document.view}
                        onLiveCursorChange={jest.fn()}
                        onPreviewRefresh={(accepted) => Promise.resolve(accepted)}
                        onPreviewWarning={jest.fn()}
                    />
                </EditorSessionProvider>
            </Provider>
        );
    };
    const { rerender } = render(view('# Committed before pause'));
    expect(await screen.findByRole('heading', { name: 'Committed before pause' })).toBeInTheDocument();
    const parses = mockCreatePipeline.mock.calls.length;

    unavailable = true;
    rerender(view(`broken large source\n${'x'.repeat(PREVIEW_BYTE_LIMIT)}`));
    expect(screen.getByRole('button', { name: 'Refresh preview' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Committed before pause' })).toBeNull();
    expect(mockCreatePipeline).toHaveBeenCalledTimes(parses);

    fireEvent.click(screen.getByRole('button', { name: 'Refresh preview' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Showing the last successful version'));
    expect(screen.getByRole('heading', { name: 'Committed before pause' })).toBeInTheDocument();

    unavailable = false;
    rerender(view('# Recovered after pause'));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Recovered after pause' })).toBeInTheDocument();
});

it('pauses after replacing a manually refreshed large source with the same implicit revision', async () => {
    const document = documentFor('split');
    const view = (content: string): React.JSX.Element => {
        const buffer = { documentId: document.documentId, content };
        return (
            <Provider store={store}>
                <EditorSessionProvider activeBuffer={buffer}>
                    <EditorStage
                        adapter={adapter}
                        activeBuffer={buffer}
                        activeDocument={document}
                        editorVisible
                        previewVisible
                        readOnly={false}
                        view={document.view}
                        onLiveCursorChange={jest.fn()}
                        onPreviewRefresh={(accepted) => Promise.resolve(accepted)}
                        onPreviewWarning={jest.fn()}
                    />
                </EditorSessionProvider>
            </Provider>
        );
    };
    const first = `# Large source A\n${'x'.repeat(PREVIEW_BYTE_LIMIT)}`;
    const second = `# Large source B\n${'y'.repeat(PREVIEW_BYTE_LIMIT)}`;
    const { rerender } = render(view(first));
    expect(screen.getByRole('button', { name: 'Refresh preview' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Refresh preview' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Large source A' })).toBeInTheDocument());

    rerender(view(second));
    expect(screen.getByRole('button', { name: 'Refresh preview' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Large source A' })).toBeNull();
});

it('keeps the editor and preview content in explicit panes for split view', async () => {
    const document = documentFor('split');
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
            <EditorSessionProvider activeBuffer={{ documentId: document.documentId, content: '# Preview' }}>
                <EditorStage
                    adapter={adapter}
                    activeBuffer={{
                        documentId: document.documentId,
                        content: '# Preview',
                    }}
                    activeDocument={document}
                    editorVisible
                    labelledBy="active-tab"
                    panelId="editor-tabpanel"
                    previewVisible
                    readOnly={false}
                    view={document.view}
                    onLiveCursorChange={jest.fn()}
                    onPreviewWarning={jest.fn()}
                />
            </EditorSessionProvider>
        </Provider>,
    );

    expect(screen.getByRole('tabpanel')).toHaveAttribute('id', 'editor-tabpanel');
    expect(screen.getByLabelText('Editor pane')).toBeInTheDocument();
    expect(screen.getByLabelText('Preview pane')).toBeInTheDocument();
    expect(screen.getByLabelText('Markdown source')).toHaveValue('# Preview');
    expect(await screen.findByRole('heading', { name: 'Preview' })).toBeInTheDocument();
});

it('hides the preview header standard and document until Markdown settings hydrate', async () => {
    const document = documentFor('split');
    store.dispatch(resetSettingsProjection());
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
            <EditorSessionProvider activeBuffer={{ documentId: document.documentId, content: '# Preview' }}>
                <EditorStage
                    adapter={adapter}
                    activeBuffer={{ documentId: document.documentId, content: '# Preview' }}
                    activeDocument={document}
                    editorVisible
                    labelledBy="active-tab"
                    previewVisible
                    readOnly={false}
                    view={document.view}
                    onLiveCursorChange={jest.fn()}
                    onPreviewWarning={jest.fn()}
                />
            </EditorSessionProvider>
        </Provider>,
    );
    const pane = screen.getByRole('region', { name: 'Preview pane' });
    expect(within(pane).queryByText('Full')).toBeNull();
    expect(within(pane).getByRole('status')).toHaveTextContent('Loading Markdown settings');
    expect(within(pane).queryByRole('heading', { name: 'Preview' })).toBeNull();

    act(() => {
        store.dispatch(hydrateSettings(loadedMarkdownSettings));
    });
    expect(within(pane).getByText('Full')).toBeInTheDocument();
    expect(await within(pane).findByRole('heading', { name: 'Preview' })).toBeInTheDocument();
});

it('updates the preview syntax when the stored standard changes without remounting the editor', async () => {
    const document = documentFor('split');
    const content = '| Name |\n| --- |\n| Ada |';
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
            <EditorSessionProvider activeBuffer={{ documentId: document.documentId, content }}>
                <EditorStage
                    adapter={adapter}
                    activeBuffer={{ documentId: document.documentId, content }}
                    activeDocument={document}
                    editorVisible
                    previewVisible
                    readOnly={false}
                    view={document.view}
                    onLiveCursorChange={jest.fn()}
                    onPreviewWarning={jest.fn()}
                />
            </EditorSessionProvider>
        </Provider>,
    );
    const editor = screen.getByLabelText('Markdown source');
    const pane = screen.getByRole('region', { name: 'Preview pane' });
    expect(await within(pane).findByRole('table')).toBeInTheDocument();

    act(() => {
        store.dispatch(acknowledgeMarkdownSettings({ ...loadedMarkdownSettings.markdown, standard: 'minimal' }));
    });
    expect(within(pane).queryByRole('table')).toBeNull();
    expect(within(pane).getByText(/\| Ada \|/)).toBeInTheDocument();
    expect(within(pane).getByText('Minimal')).toBeInTheDocument();
    expect(screen.getByLabelText('Markdown source')).toBe(editor);
});

it('uses current pane owners for retained links and images after hiding and a failed remount', async () => {
    const firstAdapter = {
        ...adapter,
        openExternalLink: jest.fn(),
        resolvePreviewImage: jest.fn(() => '/preview-image?owner=first'),
    };
    const secondAdapter = {
        ...adapter,
        openExternalLink: jest.fn(),
        resolvePreviewImage: jest.fn(() => '/preview-image?owner=second'),
    };
    const thirdAdapter = { ...adapter, resolvePreviewImage: jest.fn(() => '/preview-image?owner=third') };
    const firstWarning = jest.fn();
    const secondWarning = jest.fn();
    const thirdWarning = jest.fn();
    const view = (
        content: string,
        visible: boolean,
        currentAdapter: EditorStageAdapter,
        path: string,
        warning: typeof firstWarning,
    ): React.JSX.Element => {
        const document = { ...documentFor(visible ? 'split' : 'editor'), path };
        const buffer = { documentId: document.documentId, content };
        return (
            <Provider store={store}>
                <EditorSessionProvider activeBuffer={buffer}>
                    <EditorStage
                        adapter={currentAdapter}
                        activeBuffer={buffer}
                        activeDocument={document}
                        editorVisible
                        previewVisible={visible}
                        readOnly={false}
                        view={document.view}
                        onLiveCursorChange={jest.fn()}
                        onPreviewWarning={warning}
                    />
                </EditorSessionProvider>
            </Provider>
        );
    };
    const { rerender } = render(
        view(
            '[Website](https://example.test/page)\n\n![Local](./local.png)',
            true,
            firstAdapter,
            '/old/note.md',
            firstWarning,
        ),
    );
    expect(await screen.findByRole('img', { name: 'Local' })).toHaveAttribute('src', '/preview-image?owner=first');
    const parses = mockCreatePipeline.mock.calls.length;
    mockCreatePipeline.mockImplementation(() => {
        throw new Error('pipeline unavailable');
    });
    rerender(view('broken', false, secondAdapter, '/new/note.md', secondWarning));
    expect(screen.queryByLabelText('Preview pane')).not.toBeInTheDocument();
    expect(mockCreatePipeline).toHaveBeenCalledTimes(parses);

    rerender(view('broken', true, secondAdapter, '/new/note.md', secondWarning));
    expect(screen.getByRole('alert')).toHaveTextContent('Showing the last successful version');
    fireEvent.click(screen.getByRole('link', { name: 'Website' }));
    expect(secondAdapter.openExternalLink).toHaveBeenCalledWith('https://example.test/page');
    expect(firstAdapter.openExternalLink).not.toHaveBeenCalled();
    expect(screen.getByRole('img', { name: 'Local' })).toHaveAttribute('src', '/preview-image?owner=second');
    const attempts = mockCreatePipeline.mock.calls.length;

    rerender(view('broken', true, thirdAdapter, '/new/note.md', thirdWarning));
    fireEvent.click(screen.getByRole('link', { name: 'Website' }));
    expect(thirdWarning).toHaveBeenCalledWith('https://example.test/page', expect.any(String));
    expect(firstWarning).not.toHaveBeenCalled();
    expect(secondWarning).not.toHaveBeenCalled();
    expect(secondAdapter.openExternalLink).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('img', { name: 'Local' })).toHaveAttribute('src', '/preview-image?owner=third');

    rerender(view('broken', true, thirdAdapter, '', thirdWarning));
    expect(screen.getByRole('img', { name: 'Local' }).tagName).toBe('SPAN');
    expect(mockCreatePipeline).toHaveBeenCalledTimes(attempts);
});
