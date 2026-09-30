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

it('keeps the committed preview through a failed same-document source refresh and isolates the next document', () => {
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
    expect(screen.getByRole('heading', { name: 'Committed output' })).toBeInTheDocument();

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

it('retains a committed preview across editor-only mode without parsing the hidden source', () => {
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
    expect(screen.getByRole('heading', { name: 'Committed before hiding' })).toBeInTheDocument();
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
    expect(screen.getByRole('heading', { name: 'Committed before pause' })).toBeInTheDocument();
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

it('keeps the editor and preview content in explicit panes for split view', () => {
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
    expect(screen.getByRole('heading', { name: 'Preview' })).toBeInTheDocument();
});

it('hides the preview header standard and document until Markdown settings hydrate', () => {
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
    expect(within(pane).getByRole('heading', { name: 'Preview' })).toBeInTheDocument();
});

it('updates the preview syntax when the stored standard changes without remounting the editor', () => {
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
    expect(within(pane).getByRole('table')).toBeInTheDocument();

    act(() => {
        store.dispatch(acknowledgeMarkdownSettings({ ...loadedMarkdownSettings.markdown, standard: 'minimal' }));
    });
    expect(within(pane).queryByRole('table')).toBeNull();
    expect(within(pane).getByText(/\| Ada \|/)).toBeInTheDocument();
    expect(within(pane).getByText('Minimal')).toBeInTheDocument();
    expect(screen.getByLabelText('Markdown source')).toBe(editor);
});

it('uses current pane owners for retained links and images after hiding and a failed remount', () => {
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
    expect(screen.getByRole('img', { name: 'Local' })).toHaveAttribute('src', '/preview-image?owner=first');
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
