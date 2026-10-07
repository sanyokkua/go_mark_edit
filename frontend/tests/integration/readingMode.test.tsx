import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import type { EditorProps } from '@monaco-editor/react';
import type { editor, IDisposable, IScrollEvent } from 'monaco-editor';

import { loadedMarkdownSettings } from '../support/loadedMarkdownSettings';
import { WorkspaceTreeTestProvider } from '../support/WorkspaceTreeTestProvider';

const FRAME_MS = 16;
const PREVIEW_TOP = 100;
const PREVIEW_CLIENT_HEIGHT = 400;
const PREVIEW_SCROLL_HEIGHT = 3000;
const SAVED_PREVIEW_OFFSET = 1200;
const THREE_MIB = 3 * 1024 * 1024;

interface MockEditor {
    readonly scrollTop: number;
    readonly saveViewState: jest.Mock;
    readonly focus: jest.Mock;
    userScroll(scrollTop: number): void;
}

const mockMonaco: { instances: MockEditor[] } = { instances: [] };

function mockCreateEditor(content: string): MockEditor & { instance: editor.IStandaloneCodeEditor } {
    const lineCount = content.split('\n').length;
    const scrollListeners = new Set<(event: IScrollEvent) => void>();
    let scrollTop = 0;
    const model = { dispose: jest.fn(), getLineCount: (): number => lineCount, getValue: (): string => content };
    const report = (): void => {
        for (const listener of [...scrollListeners]) {
            listener({ scrollTop, scrollTopChanged: true } as IScrollEvent);
        }
    };
    const idle = (): IDisposable => ({ dispose: (): void => undefined });
    const instance = {
        dispose: jest.fn(),
        focus: jest.fn(),
        getBottomForLineNumber: (lineNumber: number): number => 12 + lineNumber * 20,
        getLayoutInfo: (): editor.EditorLayoutInfo => ({ height: 300 }) as editor.EditorLayoutInfo,
        getModel: () => model,
        getScrollTop: (): number => scrollTop,
        getSelection: (): null => null,
        getTopForLineNumber: (lineNumber: number): number => 12 + (lineNumber - 1) * 20,
        layout: jest.fn(),
        onDidBlurEditorText: idle,
        onDidChangeConfiguration: idle,
        onDidChangeCursorPosition: idle,
        onDidChangeCursorSelection: idle,
        onDidChangeHiddenAreas: idle,
        onDidChangeModelContent: idle,
        onDidContentSizeChange: idle,
        onDidLayoutChange: idle,
        onDidScrollChange: (listener: (event: IScrollEvent) => void): IDisposable => {
            scrollListeners.add(listener);
            return { dispose: (): void => void scrollListeners.delete(listener) };
        },
        restoreViewState: jest.fn(),
        saveViewState: jest.fn((): null => null),
        setScrollTop: (next: number): void => {
            if (next === scrollTop) return;
            scrollTop = next;
            report();
        },
        setSelection: jest.fn(),
        updateOptions: jest.fn(),
    };

    return {
        instance: instance as unknown as editor.IStandaloneCodeEditor,
        saveViewState: instance.saveViewState,
        focus: instance.focus,
        get scrollTop(): number {
            return scrollTop;
        },
        userScroll(next: number): void {
            scrollTop = next;
            report();
        },
    };
}

jest.mock('@monaco-editor/react', () => {
    const React = jest.requireActual<typeof import('react')>('react');

    const MockMonacoEditor = (props: EditorProps): React.JSX.Element => {
        const { defaultValue, onMount } = props;
        const [mounted] = React.useState(() => mockCreateEditor(defaultValue ?? ''));

        React.useEffect((): void => {
            mockMonaco.instances.push(mounted);
            onMount?.(mounted.instance, { editor: { ScrollType: { Immediate: 1 } } } as unknown as Parameters<
                NonNullable<EditorProps['onMount']>
            >[1]);
        }, [mounted]);

        return React.createElement('textarea', { 'aria-label': 'Markdown source', defaultValue });
    };

    return { __esModule: true, default: MockMonacoEditor, loader: { config: jest.fn() } };
});

jest.mock('../../src/ui/components/monacoSetup', () => ({
    __esModule: true,
    applyMonacoThemeFromRoot: jest.fn(() => jest.fn()),
    monaco: {},
    registerEditorLinkModel: jest.fn(() => ({ dispose: jest.fn() })),
}));

jest.mock('../../src/logic/adapter', () => ({
    appModelAdapter: {
        flushBuffer: jest.fn(() => Promise.resolve()),
        flushDocView: jest.fn(() => Promise.resolve()),
        setDocView: jest.fn(() => Promise.resolve()),
        setUILayout: jest.fn(() => Promise.resolve()),
        subscribeAcceptedBuffers: jest.fn(() => jest.fn()),
        updateBuffer: jest.fn(() => Promise.resolve()),
        updateDocView: jest.fn(() => Promise.resolve()),
    },
    settingsAdapter: {
        getSettings: jest.fn(() =>
            Promise.resolve({
                appearance: { defaultOpenMode: 'editor', readingWidth: 'page', mode: 'light', theme: 'material' },
            }),
        ),
        updateAppearance: jest.fn(() => Promise.resolve()),
    },
    windowAdapter: { toggleFullscreen: jest.fn() },
}));

import { AppFrame, type AppFrameProps } from '../../src/app/AppFrame';
import { appModelAdapter, settingsAdapter } from '../../src/logic/adapter';
import { hydrateProjection, resetProjection } from '../../src/logic/store/appModelProjectionActions';
import type { DocumentMetadata } from '../../src/logic/store/appModelTypes';
import { store } from '../../src/logic/store';
import { resetReading } from '../../src/logic/store/readingSlice';
import { hydrateSettings, resetSettingsProjection } from '../../src/logic/store/settingsSlice';
import { EditorSessionProvider } from '../../src/ui/widgets/editorSession';

/** Fifty paragraphs, one every other line, so the document ends at line 99. */
const DOCUMENT_CONTENT = Array.from({ length: 50 }, (_, index) => `Paragraph ${index + 1}`).join('\n\n');

function rectAt(top: number): DOMRect {
    return {
        bottom: top,
        height: 0,
        left: 0,
        right: 0,
        toJSON: (): Record<string, never> => ({}),
        top,
        width: 0,
        x: 0,
        y: top,
    };
}

function isPreviewContainer(element: Element): boolean {
    return element.classList.contains('previewContent');
}

/** jsdom lays nothing out, so the preview reports a 3000 px document in a 400 px pane. */
function stubPreviewGeometry(): void {
    Object.defineProperties(HTMLElement.prototype, {
        clientHeight: {
            configurable: true,
            get(this: HTMLElement): number {
                return isPreviewContainer(this) ? PREVIEW_CLIENT_HEIGHT : 0;
            },
        },
        scrollHeight: {
            configurable: true,
            get(this: HTMLElement): number {
                return isPreviewContainer(this) ? PREVIEW_SCROLL_HEIGHT : 0;
            },
        },
    });
    jest.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element): DOMRect {
        if (isPreviewContainer(this)) return rectAt(PREVIEW_TOP);
        const container = this.closest('.previewContent');
        const line = Number(this.getAttribute('data-source-line'));
        if (container === null || !Number.isInteger(line) || line <= 0) return rectAt(0);
        return rectAt(PREVIEW_TOP + (line - 1) * 30 - container.scrollTop);
    });
}

function restorePreviewGeometry(): void {
    const prototype = HTMLElement.prototype as unknown as Record<string, unknown>;
    delete prototype.clientHeight;
    delete prototype.scrollHeight;
}

function documentFor(documentId: string, arrangement: 'editor' | 'split', previewScroll: number): DocumentMetadata {
    return {
        documentId,
        title: `${documentId}.md`,
        path: `/notes/${documentId}.md`,
        dirty: false,
        encoding: 'utf-8',
        lineEnding: 'lf',
        wordCount: 100,
        capability: 'writable',
        status: 'saved',
        view: {
            arrangement,
            editorVisible: true,
            previewVisible: arrangement === 'split',
            cursor: { line: 7, column: 3 },
            selection: { start: { line: 7, column: 3 }, end: { line: 7, column: 3 } },
            scroll: { editor: 410, preview: previewScroll },
        },
    };
}

const onActivateDocument = jest.fn(() => Promise.resolve({}));

function Harness({ content }: { content: string }): React.JSX.Element {
    const [settingsOpen, setSettingsOpen] = useState(false);
    const noop = (): Promise<undefined> => Promise.resolve(undefined);
    const menuState: AppFrameProps['menuState'] = {
        modalOpen: settingsOpen,
        onAbout: (): void => undefined,
        onNewDocument: noop,
        onOpenDocument: noop,
        onOpenFolder: noop,
        onNewWindow: noop,
        onCloseFolder: noop,
        onOpenRecentItem: noop,
        onRefreshRecentItems: noop,
        onClearRecentItems: noop,
        onReopenLastFile: noop,
        onSave: noop,
        onSaveAs: noop,
        onCloseDocument: noop,
        onExportPdf: noop,
        onQuit: (): void => undefined,
        documentId: 'doc-1',
        sessionDocumentId: 'doc-1',
        writable: true,
        onShortcuts: (): void => undefined,
        requestedMenu: null,
        onRequestedMenuHandled: (): void => undefined,
    };

    return (
        <Provider store={store}>
            <button type="button" onClick={(): void => setSettingsOpen(true)}>
                Open settings
            </button>
            <WorkspaceTreeTestProvider>
                <EditorSessionProvider activeBuffer={{ documentId: 'doc-1', content }}>
                    <AppFrame
                        printRequest={null}
                        banners={[]}
                        bootstrap={{
                            failure: null,
                            isRetrying: false,
                            result: null,
                            retry: jest.fn(),
                            status: 'ready',
                        }}
                        menuState={menuState}
                        notices={[]}
                        onDismiss={jest.fn()}
                        onQuit={jest.fn()}
                        onRetry={jest.fn()}
                        onSettingsOpenChange={setSettingsOpen}
                        onToggleProblems={jest.fn()}
                        problemsOpen={false}
                        recovery={null}
                        settingsOpen={settingsOpen}
                        shell={{ onActivateDocument }}
                    />
                </EditorSessionProvider>
            </WorkspaceTreeTestProvider>
        </Provider>
    );
}

function hydrate(arrangement: 'editor' | 'split', previewScroll = 0): void {
    act((): void => {
        store.dispatch(
            hydrateProjection({
                revision: 1,
                tabSetRevision: 1,
                documents: {
                    'doc-1': documentFor('doc-1', arrangement, previewScroll),
                    'doc-2': documentFor('doc-2', 'editor', 0),
                },
                orderedDocumentIds: ['doc-1', 'doc-2'],
                activeDocumentId: 'doc-1',
                ui: { sidebarVisible: true, sidebarWidth: 280 },
            }),
        );
    });
}

async function renderApp(
    arrangement: 'editor' | 'split',
    previewScroll = 0,
    content = DOCUMENT_CONTENT,
): Promise<void> {
    hydrate(arrangement, previewScroll);
    render(<Harness content={content} />);
    await screen.findByLabelText('Markdown source');
}

function pressCtrl(key: string): void {
    fireEvent.keyDown(window, { key, ctrlKey: true });
}

function toggleReading(): void {
    pressCtrl('Enter');
}

function previewScrollContainer(): HTMLElement {
    const container = screen.getByRole('region', { name: 'Preview pane' }).querySelector('.previewContent');
    if (container === null) throw new Error('expected a preview scroll container');
    return container as HTMLElement;
}

async function advanceFrames(count: number): Promise<void> {
    await act(async (): Promise<void> => {
        await jest.advanceTimersByTimeAsync(FRAME_MS * count);
    });
}

function setWindowWidth(width: number): void {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    fireEvent(window, new Event('resize'));
}

const initialWidth = window.innerWidth;

beforeEach((): void => {
    store.dispatch(hydrateSettings(loadedMarkdownSettings));
    mockMonaco.instances.length = 0;
    stubPreviewGeometry();
});

afterEach((): void => {
    setWindowWidth(initialWidth);
    restorePreviewGeometry();
    jest.restoreAllMocks();
    jest.clearAllMocks();
    store.dispatch(resetReading());
    store.dispatch(resetProjection());
    store.dispatch(resetSettingsProjection());
    document.documentElement.removeAttribute('data-mode');
    document.documentElement.removeAttribute('data-theme');
});

it('hides the chrome in Reading mode and restores it with the arrangement, split ratio and cursor unchanged', async () => {
    await renderApp('split', SAVED_PREVIEW_OFFSET);
    const ratio = screen
        .getByRole('separator', { name: 'Resize editor and preview panes' })
        .getAttribute('aria-valuenow');
    const viewBefore = store.getState().documents.byId['doc-1']?.view;

    toggleReading();

    expect(screen.queryByRole('complementary', { name: 'Sidebar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Document status' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: /arrangement|view/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Split' })).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Application actions' })).not.toBeInTheDocument();
    expect(screen.getByRole('banner', { name: 'Document identity', hidden: true })).not.toBeVisible();
    expect(screen.getByRole('region', { name: 'Preview pane' })).toBeVisible();

    toggleReading();

    expect(screen.getByRole('banner', { name: 'Document identity' })).toBeVisible();
    expect(screen.getByRole('complementary', { name: 'Sidebar' })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Document status' })).toBeInTheDocument();
    expect(screen.getByRole('tablist')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Application actions' })).toBeVisible();
    expect(screen.getByRole('radio', { name: 'Split' })).toBeChecked();
    expect(screen.getByRole('separator', { name: 'Resize editor and preview panes' })).toHaveAttribute(
        'aria-valuenow',
        ratio,
    );
    expect(store.getState().documents.byId['doc-1']?.view).toEqual(viewBefore);
    expect(appModelAdapter.setDocView).not.toHaveBeenCalled();
});

it('captures the editor view state when Reading mode is entered from Split or the Editor arrangement', async () => {
    for (const arrangement of ['split', 'editor'] as const) {
        await renderApp(arrangement);
        const [mounted] = mockMonaco.instances;
        mounted?.saveViewState.mockClear();

        toggleReading();

        expect(mounted?.saveViewState).toHaveBeenCalled();
        cleanup();
        mockMonaco.instances.length = 0;
        store.dispatch(resetReading());
        store.dispatch(resetProjection());
    }
});

it('does not capture the editor view state when Reading mode is entered from the Preview arrangement', async () => {
    hydrate('split');
    act((): void => {
        const document = store.getState().documents.byId['doc-1'];
        if (document === undefined) throw new Error('expected doc-1');
        store.dispatch(
            hydrateProjection({
                revision: 2,
                tabSetRevision: 1,
                documents: {
                    'doc-1': {
                        ...document,
                        view: { ...document.view, arrangement: 'preview', editorVisible: false, previewVisible: true },
                    },
                },
                orderedDocumentIds: ['doc-1'],
                activeDocumentId: 'doc-1',
                ui: { sidebarVisible: true, sidebarWidth: 280 },
            }),
        );
    });
    render(<Harness content={DOCUMENT_CONTENT} />);
    await screen.findByRole('region', { name: 'Preview pane' });
    mockMonaco.instances.forEach((mounted) => mounted.saveViewState.mockClear());

    toggleReading();

    expect(mockMonaco.instances.every((mounted) => mounted.saveViewState.mock.calls.length === 0)).toBe(true);
});

it('shows no editor pane and keeps the editor still while the preview scrolls in Reading mode', async () => {
    jest.useFakeTimers();
    try {
        await renderApp('split', SAVED_PREVIEW_OFFSET);
        await advanceFrames(3);
        toggleReading();
        await advanceFrames(3);
        const editorScrollBefore = mockMonaco.instances.at(-1)?.scrollTop;

        const preview = previewScrollContainer();
        preview.scrollTop = 600;
        fireEvent.scroll(preview);
        await advanceFrames(3);

        expect(screen.queryByRole('region', { name: 'Editor pane' })).not.toBeInTheDocument();
        expect(mockMonaco.instances.at(-1)?.scrollTop).toBe(editorScrollBefore);
    } finally {
        jest.useRealTimers();
    }
});

it('shows the saved preview offset when Reading mode is entered from Split and again after leaving', async () => {
    await renderApp('split', SAVED_PREVIEW_OFFSET);
    previewScrollContainer().scrollTop = 0;

    toggleReading();
    expect(previewScrollContainer().scrollTop).toBe(SAVED_PREVIEW_OFFSET);

    previewScrollContainer().scrollTop = 0;
    toggleReading();
    expect(previewScrollContainer().scrollTop).toBe(SAVED_PREVIEW_OFFSET);
});

it('shows the saved preview offset when Reading mode is entered from the Editor arrangement', async () => {
    await renderApp('editor', SAVED_PREVIEW_OFFSET);

    toggleReading();

    expect(previewScrollContainer().scrollTop).toBe(SAVED_PREVIEW_OFFSET);
});

it('shows the paused notice with Refresh for a 3 MiB document in Reading mode', async () => {
    await renderApp('editor', 0, 'a'.repeat(THREE_MIB));

    toggleReading();

    const pane = screen.getByRole('region', { name: 'Preview pane' });
    expect(within(pane).getByText(/live preview is paused/i)).toBeInTheDocument();
    expect(within(pane).getByRole('button', { name: 'Refresh preview' })).toBeEnabled();
});

it('restyles at once when the appearance changes from Light to Dark and stays in Reading mode', async () => {
    await renderApp('split');
    await waitFor(() => expect(document.documentElement).toHaveAttribute('data-mode', 'light'));
    toggleReading();

    fireEvent.click(screen.getByRole('button', { name: 'Open settings' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Dark' }));

    await waitFor(() => expect(document.documentElement).toHaveAttribute('data-mode', 'dark'));
    expect(settingsAdapter.updateAppearance).toHaveBeenCalled();
    expect(store.getState().reading.active).toBe(true);
    expect(screen.queryByRole('navigation', { name: 'Application actions' })).not.toBeInTheDocument();
});

it('lays the stage out by the Reading width and restyles at once from the Settings dialog while reading', async () => {
    await renderApp('split');
    toggleReading();
    const stage = (): HTMLElement => screen.getByRole('tabpanel');
    expect(stage()).toHaveAttribute('data-variant', 'reading');
    expect(stage()).toHaveAttribute('data-reading-width', 'page');

    fireEvent.click(screen.getByRole('button', { name: 'Open settings' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Full width' }));

    await waitFor(() => expect(stage()).toHaveAttribute('data-reading-width', 'full'));
    expect(store.getState().reading.active).toBe(true);
    expect(stage()).toHaveAttribute('data-variant', 'reading');

    fireEvent.click(within(dialog).getByRole('radio', { name: 'Page' }));
    await waitFor(() => expect(stage()).toHaveAttribute('data-reading-width', 'page'));
    expect(store.getState().reading.active).toBe(true);
});

it('does not mark the stage with a reading width outside Reading mode', async () => {
    await renderApp('split');
    expect(screen.getByRole('tabpanel')).not.toHaveAttribute('data-reading-width');
});

it('keeps the rendered document in the window at 375 px and shows no editor pane', async () => {
    setWindowWidth(375);
    await renderApp('editor', SAVED_PREVIEW_OFFSET);

    toggleReading();

    expect(screen.getByRole('region', { name: 'Preview pane' })).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Editor pane' })).not.toBeInTheDocument();
    expect(previewScrollContainer().scrollTop).toBe(SAVED_PREVIEW_OFFSET);
});

it('leaves the stored sidebar visibility and width untouched', async () => {
    await renderApp('split');

    toggleReading();
    toggleReading();

    expect(appModelAdapter.setUILayout).not.toHaveBeenCalled();
    expect(store.getState().ui.layout).toMatchObject({ sidebarVisible: true, sidebarWidth: 280 });
    expect(screen.getByRole('complementary', { name: 'Sidebar' })).toBeInTheDocument();
});

it('keeps the menu bar and the tab shortcuts working while Reading mode is active', async () => {
    await renderApp('split');
    toggleReading();

    expect(screen.getByRole('navigation', { name: 'Application actions', hidden: true })).not.toBeVisible();
    pressCtrl('Tab');

    await waitFor(() => expect(onActivateDocument).toHaveBeenCalledWith('doc-2', 1));
    expect(store.getState().reading.active).toBe(true);
});

it('enters Reading mode with Ctrl+Enter while an arrangement radio has focus and keeps the arrangement', async () => {
    await renderApp('split');
    const split = screen.getByRole('radio', { name: 'Split' });
    split.focus();

    fireEvent.keyDown(split, { key: 'Enter', ctrlKey: true });

    expect(store.getState().reading.active).toBe(true);
    expect(store.getState().documents.byId['doc-1']?.view.arrangement).toBe('split');
    expect(appModelAdapter.setDocView).not.toHaveBeenCalled();
});

function pressEscape(): void {
    fireEvent.keyDown(document.body, { key: 'Escape' });
}

it('leaves Reading mode when Escape is pressed with nothing else open', async () => {
    await renderApp('split');
    toggleReading();

    pressEscape();

    expect(store.getState().reading.active).toBe(false);
    expect(screen.getByRole('banner', { name: 'Document identity' })).toBeVisible();
});

it('closes the Settings menu with Escape and stays in Reading mode', async () => {
    await renderApp('split');
    toggleReading();
    pressCtrl(',');
    expect(await screen.findByRole('menu', { name: 'Settings menu' })).toBeVisible();

    pressEscape();

    await waitFor(() => expect(screen.queryByRole('menu', { name: 'Settings menu' })).not.toBeInTheDocument());
    expect(store.getState().reading.active).toBe(true);

    pressEscape();

    expect(store.getState().reading.active).toBe(false);
});

it('ignores Escape while a dialog is open', async () => {
    await renderApp('split');
    toggleReading();
    fireEvent.click(screen.getByRole('button', { name: 'Open settings' }));

    pressEscape();

    expect(store.getState().reading.active).toBe(true);
});

it('stays in Reading mode when the active document closes and another remains', async () => {
    await renderApp('split');
    toggleReading();

    act((): void => {
        store.dispatch(
            hydrateProjection({
                revision: 2,
                tabSetRevision: 2,
                documents: { 'doc-2': documentFor('doc-2', 'editor', 0) },
                orderedDocumentIds: ['doc-2'],
                activeDocumentId: 'doc-2',
                ui: { sidebarVisible: true, sidebarWidth: 280 },
            }),
        );
    });

    expect(store.getState().reading.active).toBe(true);
});

it('leaves Reading mode when the last document closes', async () => {
    await renderApp('split');
    toggleReading();

    act((): void => {
        store.dispatch(
            hydrateProjection({
                revision: 2,
                tabSetRevision: 2,
                documents: {},
                orderedDocumentIds: [],
                activeDocumentId: null,
                ui: { sidebarVisible: true, sidebarWidth: 280 },
            }),
        );
    });

    expect(store.getState().reading.active).toBe(false);
});

it('moves focus to the rendered document on entry and back to the previous control on exit', async () => {
    await renderApp('split');
    const opener = screen.getByRole('button', { name: 'Open settings' });
    opener.focus();

    toggleReading();

    expect(previewScrollContainer()).toHaveFocus();

    pressEscape();

    expect(opener).toHaveFocus();
});

it('returns focus to the editor on exit when the previously focused control no longer exists', async () => {
    await renderApp('split');
    screen.getByRole('radio', { name: 'Split' }).focus();
    toggleReading();

    pressEscape();

    expect(mockMonaco.instances[0]?.focus).toHaveBeenCalled();
});
