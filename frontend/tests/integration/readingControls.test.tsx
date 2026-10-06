import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import type { EditorProps } from '@monaco-editor/react';
import type { editor, IDisposable, IScrollEvent } from 'monaco-editor';

import { loadedMarkdownSettings } from '../support/loadedMarkdownSettings';
import {
    WorkspaceTreeCommandsContext,
    type WorkspaceTreeCommands,
} from '../../src/ui/widgets/WorkspaceTree/workspaceTreeCommands';

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
            Promise.resolve({ appearance: { defaultOpenMode: 'editor', mode: 'light', theme: 'material' } }),
        ),
        updateAppearance: jest.fn(() => Promise.resolve()),
    },
    windowAdapter: { toggleFullscreen: jest.fn() },
}));

import { AppFrame, type AppFrameProps } from '../../src/app/AppFrame';
import { appModelAdapter } from '../../src/logic/adapter';
import { hydrateProjection, resetProjection } from '../../src/logic/store/appModelProjectionActions';
import type { DocumentMetadata, WorkspaceSnapshot } from '../../src/logic/store/appModelTypes';
import { store } from '../../src/logic/store';
import { resetReading } from '../../src/logic/store/readingSlice';
import { hydrateSettings, resetSettingsProjection } from '../../src/logic/store/settingsSlice';
import { EditorSessionProvider } from '../../src/ui/widgets/editorSession';
import { EditorClipboardPortContext } from '../../src/ui/widgets/useEditorActionExecutor';

const DOCUMENT_CONTENT = Array.from({ length: 5 }, (_, index) => `Paragraph ${index + 1}`).join('\n\n');

const WORKSPACE: WorkspaceSnapshot = {
    rootPath: '/notes',
    rootName: 'notes',
    root: {
        path: '/notes',
        name: 'notes',
        isDir: true,
        children: [{ path: '/notes/other.md', name: 'other.md', isDir: false }],
    },
    totalEntries: 2,
    truncated: false,
    unavailable: false,
    filterSuffixes: ['.md'],
    showHiddenFolders: false,
};

function documentFor(documentId: string): DocumentMetadata {
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
            arrangement: 'split',
            editorVisible: true,
            previewVisible: true,
            cursor: { line: 1, column: 1 },
            selection: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
            scroll: { editor: 0, preview: 0 },
        },
    };
}

const onActivateDocument = jest.fn(() => Promise.resolve({}));
const clipboard = { readText: jest.fn(() => Promise.resolve('')), writeText: jest.fn(() => Promise.resolve(true)) };
const onOpenTreeFile = jest.fn((): Promise<undefined> => Promise.resolve(undefined));

function Harness(): React.JSX.Element {
    const noop = (): Promise<undefined> => Promise.resolve(undefined);
    const commands: WorkspaceTreeCommands = {
        onOpenFolder: (): void => undefined,
        onCloseFolder: (): void => undefined,
        onRefreshWorkspace: (): void => undefined,
        onSetWorkspaceHiddenFolders: (): void => undefined,
        onOpenTreeFile,
    };
    const menuState: AppFrameProps['menuState'] = {
        modalOpen: false,
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
            <EditorClipboardPortContext.Provider value={clipboard}>
                <WorkspaceTreeCommandsContext.Provider value={commands}>
                    <EditorSessionProvider activeBuffer={{ documentId: 'doc-1', content: DOCUMENT_CONTENT }}>
                        <AppFrame
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
                            onSettingsOpenChange={jest.fn()}
                            onToggleProblems={jest.fn()}
                            problemsOpen={false}
                            recovery={null}
                            settingsOpen={false}
                            shell={{ onActivateDocument }}
                        />
                    </EditorSessionProvider>
                </WorkspaceTreeCommandsContext.Provider>
            </EditorClipboardPortContext.Provider>
        </Provider>
    );
}

async function renderApp({ workspace = true }: { workspace?: boolean } = {}): Promise<void> {
    act((): void => {
        store.dispatch(
            hydrateProjection({
                revision: 1,
                tabSetRevision: 1,
                documents: { 'doc-1': documentFor('doc-1'), 'doc-2': documentFor('doc-2') },
                orderedDocumentIds: ['doc-1', 'doc-2'],
                activeDocumentId: 'doc-1',
                workspace: workspace ? WORKSPACE : undefined,
                ui: { sidebarVisible: true, sidebarWidth: 280 },
            }),
        );
    });
    render(<Harness />);
    await screen.findByLabelText('Markdown source');
}

function enterReading(): void {
    fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true });
}

function pressEscape(): void {
    fireEvent.keyDown(document.body, { key: 'Escape' });
}

function toggleSidebarShortcut(): void {
    fireEvent.keyDown(window, { key: '\\', ctrlKey: true });
}

const exitControl = (): HTMLElement => screen.getByRole('button', { name: 'Exit Reading mode' });
const sidebarControl = (): HTMLElement => screen.getByRole('button', { name: 'Show or hide sidebar' });
const tabsControl = (): HTMLElement => screen.getByRole('button', { name: 'Show or hide tab bar' });
const sidebarOverlay = (): HTMLElement | null => screen.queryByRole('complementary', { name: 'Sidebar' });

function setWindowWidth(width: number): void {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    fireEvent(window, new Event('resize'));
}

const initialWidth = window.innerWidth;

beforeEach((): void => {
    store.dispatch(hydrateSettings(loadedMarkdownSettings));
    mockMonaco.instances.length = 0;
});

afterEach((): void => {
    setWindowWidth(initialWidth);
    jest.clearAllMocks();
    store.dispatch(resetReading());
    store.dispatch(resetProjection());
    store.dispatch(resetSettingsProjection());
});

it('offers no reading controls outside Reading mode', async () => {
    await renderApp();

    expect(screen.queryByRole('button', { name: 'Exit Reading mode' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show or hide sidebar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show or hide tab bar' })).not.toBeInTheDocument();
});

it('offers the three controls in Reading mode, reachable by keyboard and named', async () => {
    await renderApp();
    enterReading();

    for (const control of [exitControl(), sidebarControl(), tabsControl()]) {
        expect(control).not.toHaveAttribute('tabindex', '-1');
        control.focus();
        expect(control).toHaveFocus();
    }
});

it('leaves Reading mode when the Exit control is activated', async () => {
    await renderApp();
    enterReading();

    fireEvent.click(exitControl());

    expect(store.getState().reading.active).toBe(false);
});

it('keeps the sidebar and the tab bar hidden on entry', async () => {
    await renderApp();
    enterReading();

    expect(sidebarOverlay()).not.toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
});

it('shows the file tree over the document at the stored width without a resize handle', async () => {
    await renderApp();
    enterReading();

    fireEvent.click(sidebarControl());

    const overlay = sidebarOverlay();
    expect(overlay).toBeVisible();
    expect(within(overlay as HTMLElement).getByRole('tree', { name: 'Folder files' })).toBeVisible();
    expect(overlay).toHaveStyle({ width: '280px' });
    expect(screen.queryByRole('separator', { name: 'Resize sidebar' })).not.toBeInTheDocument();
    expect(screen.getByTestId('application-shell')).toHaveStyle({ '--shell-left-width': '280px' });
    expect(screen.getByRole('main').parentElement).toBe(screen.getByTestId('application-shell'));
    expect(overlay?.parentElement).not.toBe(screen.getByRole('main'));

    fireEvent.click(sidebarControl());

    expect(sidebarOverlay()).not.toBeInTheDocument();
});

it('shows the active document in Reading mode when a file is opened from the sidebar overlay', async () => {
    await renderApp();
    enterReading();
    fireEvent.click(sidebarControl());

    fireEvent.click(screen.getByRole('treeitem', { name: 'other.md' }));

    await waitFor(() => expect(onOpenTreeFile).toHaveBeenCalledWith('/notes/other.md', 1));
    expect(store.getState().reading.active).toBe(true);
});

it('shows and hides the tab bar with its control and switches documents without leaving Reading mode', async () => {
    await renderApp();
    enterReading();

    fireEvent.click(tabsControl());

    expect(screen.getByRole('tablist')).toBeVisible();
    fireEvent.click(screen.getByRole('tab', { name: /doc-2/ }));
    await waitFor(() => expect(onActivateDocument).toHaveBeenCalledWith('doc-2', 1));
    expect(store.getState().reading.active).toBe(true);

    fireEvent.click(tabsControl());

    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
});

it('toggles the sidebar overlay with Ctrl+\\ and leaves the stored sidebar state alone', async () => {
    await renderApp();
    enterReading();

    toggleSidebarShortcut();
    expect(sidebarOverlay()).toBeVisible();
    toggleSidebarShortcut();
    expect(sidebarOverlay()).not.toBeInTheDocument();
    toggleSidebarShortcut();
    fireEvent.click(sidebarControl());
    fireEvent.click(sidebarControl());

    expect(appModelAdapter.setUILayout).not.toHaveBeenCalled();
    expect(store.getState().ui.layout).toMatchObject({ sidebarVisible: true, sidebarWidth: 280 });

    fireEvent.click(exitControl());

    expect(screen.getByRole('complementary', { name: 'Sidebar' })).toBeVisible();
    expect(store.getState().ui.layout).toMatchObject({ sidebarVisible: true, sidebarWidth: 280 });
});

it('offers no sidebar control and ignores Ctrl+\\ when no workspace is open', async () => {
    await renderApp({ workspace: false });
    enterReading();

    expect(screen.queryByRole('button', { name: 'Show or hide sidebar' })).not.toBeInTheDocument();
    toggleSidebarShortcut();

    expect(sidebarOverlay()).not.toBeInTheDocument();
    expect(store.getState().reading.sidebarShown).toBe(false);
    expect(appModelAdapter.setUILayout).not.toHaveBeenCalled();
});

it('offers no sidebar control in a window 376 px wide or narrower', async () => {
    setWindowWidth(375);
    await renderApp();
    enterReading();

    expect(screen.queryByRole('button', { name: 'Show or hide sidebar' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show or hide tab bar' })).toBeInTheDocument();
    toggleSidebarShortcut();

    expect(store.getState().reading.sidebarShown).toBe(false);
});

it('closes an open overlay with Escape before leaving Reading mode', async () => {
    await renderApp();
    enterReading();
    fireEvent.click(sidebarControl());
    fireEvent.click(tabsControl());

    pressEscape();

    expect(sidebarOverlay()).not.toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(store.getState().reading.active).toBe(true);

    pressEscape();

    expect(store.getState().reading.active).toBe(false);
});

it('leaves Reading mode with one Escape after the sidebar overlay became unavailable', async () => {
    await renderApp();
    enterReading();
    fireEvent.click(sidebarControl());

    act(() => setWindowWidth(375));
    pressEscape();

    expect(store.getState().reading.active).toBe(false);
});

function placeControl(control: HTMLElement, rect: Partial<DOMRect>): void {
    jest.spyOn(control, 'getBoundingClientRect').mockReturnValue({
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: 0,
        height: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
        ...rect,
    });
}

it('reveals the tab bar control while the pointer is anywhere along the top edge', async () => {
    await renderApp();
    enterReading();
    placeControl(tabsControl(), { top: 0, bottom: 40, left: 600, right: 640 });

    fireEvent.mouseMove(window, { clientX: 100, clientY: 20 });
    expect(tabsControl()).toHaveAttribute('data-edge-hover', 'true');

    fireEvent.mouseMove(window, { clientX: 100, clientY: 400 });
    expect(tabsControl()).not.toHaveAttribute('data-edge-hover', 'true');
});

it('reveals the sidebar control while the pointer is anywhere along the left edge', async () => {
    await renderApp();
    enterReading();
    placeControl(sidebarControl(), { top: 380, bottom: 420, left: 0, right: 40 });

    fireEvent.mouseMove(window, { clientX: 10, clientY: 700 });
    expect(sidebarControl()).toHaveAttribute('data-edge-hover', 'true');

    fireEvent.mouseMove(window, { clientX: 400, clientY: 700 });
    expect(sidebarControl()).not.toHaveAttribute('data-edge-hover', 'true');
});

it('extends the top and left reveal zones past an open overlay up to its control', async () => {
    await renderApp();
    enterReading();
    fireEvent.click(tabsControl());
    placeControl(tabsControl(), { top: 36, bottom: 76, left: 600, right: 640 });

    fireEvent.mouseMove(window, { clientX: 100, clientY: 70 });
    expect(tabsControl()).toHaveAttribute('data-edge-hover', 'true');
});

it('hides both overlays again when Reading mode is entered a second time', async () => {
    await renderApp();
    enterReading();
    fireEvent.click(tabsControl());
    fireEvent.click(sidebarControl());
    fireEvent.click(exitControl());

    enterReading();

    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(sidebarOverlay()).not.toBeInTheDocument();
});

it('keeps the document column width while overlays are shown', async () => {
    await renderApp();
    enterReading();
    const shell = screen.getByTestId('application-shell');
    const before = shell.getAttribute('style');

    fireEvent.click(sidebarControl());
    fireEvent.click(tabsControl());

    expect(shell.getAttribute('style')).toBe(before);
    expect(shell).toHaveAttribute('data-reading');
});

const previewMenu = (): HTMLElement => screen.getByRole('menu', { name: 'Preview context menu' });
const previewDocument = (): HTMLElement => {
    const article = document.querySelector<HTMLElement>('article.gme-preview');
    if (article === null) throw new Error('expected the rendered document');
    return article;
};

function selectText(node: Node): void {
    const range = document.createRange();
    range.selectNodeContents(node);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
}

function openPreviewMenuWithPointer(): void {
    fireEvent.contextMenu(screen.getByText('Paragraph 2'));
}

function itemNamed(name: string): HTMLElement {
    return within(previewMenu()).getByRole('menuitem', { name });
}

afterEach((): void => {
    window.getSelection()?.removeAllRanges();
});

it('disables Copy in the preview menu when nothing is selected', async () => {
    await renderApp();
    openPreviewMenuWithPointer();

    expect(itemNamed('Copy')).toBeDisabled();
    expect(itemNamed('Select all')).toBeEnabled();
});

it('disables Copy in the preview menu when the selection lies outside the rendered document', async () => {
    await renderApp();
    selectText(screen.getByLabelText('Markdown source'));
    openPreviewMenuWithPointer();

    expect(itemNamed('Copy')).toBeDisabled();
});

it('copies the selected rendered text through the native clipboard port', async () => {
    await renderApp();
    selectText(screen.getByText('Paragraph 2'));
    openPreviewMenuWithPointer();

    fireEvent.click(itemNamed('Copy'));

    await waitFor(() => expect(clipboard.writeText).toHaveBeenCalledWith('Paragraph 2'));
    expect(screen.queryByRole('menu', { name: 'Preview context menu' })).not.toBeInTheDocument();
});

it('opens the preview menu from Shift+F10 and the Menu key with the first enabled item focused', async () => {
    await renderApp();
    enterReading();
    const reading = screen.getByRole('main').querySelector<HTMLElement>('[data-reading-document]');
    reading?.focus();

    fireEvent.keyDown(reading as HTMLElement, { key: 'F10', shiftKey: true });
    await waitFor(() => expect(itemNamed('Select all')).toHaveFocus());
    expect(itemNamed('Copy')).toBeDisabled();

    fireEvent.keyDown(reading as HTMLElement, { key: 'Escape' });
    expect(screen.queryByRole('menu', { name: 'Preview context menu' })).not.toBeInTheDocument();

    fireEvent.keyDown(reading as HTMLElement, { key: 'ContextMenu' });
    await waitFor(() => expect(itemNamed('Select all')).toHaveFocus());
});

it('closes the preview menu with Escape, returns focus and stays in Reading mode', async () => {
    await renderApp();
    enterReading();
    const reading = screen.getByRole('main').querySelector<HTMLElement>('[data-reading-document]') as HTMLElement;
    reading.focus();
    fireEvent.keyDown(reading, { key: 'F10', shiftKey: true });
    await waitFor(() => expect(itemNamed('Select all')).toHaveFocus());

    pressEscape();

    expect(screen.queryByRole('menu', { name: 'Preview context menu' })).not.toBeInTheDocument();
    expect(reading).toHaveFocus();
    expect(store.getState().reading.active).toBe(true);
});

it('selects only the rendered document with Select all while the tab overlay is open', async () => {
    await renderApp();
    enterReading();
    fireEvent.click(tabsControl());
    openPreviewMenuWithPointer();

    fireEvent.click(itemNamed('Select all'));

    await waitFor(() => expect(window.getSelection()?.toString()).toContain('Paragraph 1'));
    const selected = window.getSelection()?.toString() ?? '';
    expect(selected).toContain('Paragraph 5');
    expect(selected).not.toContain('doc-1.md');
    expect(selected).not.toContain('Exit Reading mode');
});

it('offers the preview menu in the Split arrangement without the editor menu items', async () => {
    await renderApp();
    openPreviewMenuWithPointer();

    expect(
        within(previewMenu())
            .getAllByRole('menuitem')
            .map((item) => item.textContent),
    ).toEqual(['Copy', 'Select all']);
    expect(previewDocument()).toBeInTheDocument();
});

it('returns focus to the rendered document after Escape closes a mouse-opened preview menu in Reading mode', async () => {
    await renderApp();
    enterReading();
    openPreviewMenuWithPointer();

    pressEscape();

    expect(screen.queryByRole('menu', { name: 'Preview context menu' })).not.toBeInTheDocument();
    expect(screen.getByRole('main').querySelector('[data-reading-document]')).toHaveFocus();
    expect(store.getState().reading.active).toBe(true);
});

it('opens the preview menu from Shift+F10 on the focused preview in the Split arrangement', async () => {
    await renderApp();
    const content = screen.getByRole('region', { name: 'Preview pane' }).querySelector<HTMLElement>('.previewContent');
    content?.focus();
    expect(content).toHaveFocus();

    fireEvent.keyDown(content as HTMLElement, { key: 'F10', shiftKey: true });

    await waitFor(() => expect(itemNamed('Select all')).toHaveFocus());
});
