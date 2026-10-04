import { createRef, useEffect, type PropsWithChildren, type Ref } from 'react';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import type { EditorProps } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';

import type { LinkTarget } from '../../src/logic/markdown/linkPolicy';
import { documentFixture } from '../support/appFixtures';
import { loadedMarkdownSettings } from '../support/loadedMarkdownSettings';

const mockEditors: Array<{ content: string; path?: string; setPosition: jest.Mock; restoreViewState: jest.Mock }> = [];
let mockDeferMonacoMount = false;
const mockPendingMonacoMounts: Array<() => void> = [];
let mockLinkActivation: ((href: string) => void) | null = null;

jest.mock('@monaco-editor/react', () => {
    const React = jest.requireActual<typeof import('react')>('react');
    const MockMonaco = ({ defaultValue, onChange, onMount, path }: EditorProps): React.JSX.Element => {
        const [runtime] = React.useState(() => {
            const state = { content: defaultValue ?? '', path, setPosition: jest.fn(), restoreViewState: jest.fn() };
            mockEditors.push(state);
            return state;
        });
        const [value, setValue] = React.useState(runtime.content);
        const onMountRef = React.useRef(onMount);
        onMountRef.current = onMount;
        React.useEffect(() => {
            const idle = () => ({ dispose: jest.fn() });
            const model = {
                getValue: () => runtime.content,
                getLineCount: () => runtime.content.split('\n').length,
                dispose: jest.fn(),
            };
            const instance = {
                dispose: jest.fn(),
                focus: jest.fn(),
                getModel: () => model,
                getSelection: () => null,
                getScrollTop: () => 0,
                getLayoutInfo: () => ({ height: 300 }),
                getTopForLineNumber: () => 0,
                getBottomForLineNumber: () => 0,
                layout: jest.fn(),
                onDidBlurEditorText: idle,
                onDidChangeCursorPosition: idle,
                onDidChangeCursorSelection: idle,
                onDidScrollChange: idle,
                onDidContentSizeChange: idle,
                onDidChangeModelContent: idle,
                onDidLayoutChange: idle,
                onDidChangeConfiguration: idle,
                onDidChangeHiddenAreas: idle,
                saveViewState: () => ({ cursorState: [] }) as unknown as editor.ICodeEditorViewState,
                restoreViewState: runtime.restoreViewState,
                setPosition: runtime.setPosition,
                setSelection: jest.fn(),
                revealLineInCenter: jest.fn(),
                updateOptions: jest.fn(),
            };
            const mount = (): void =>
                onMountRef.current?.(
                    instance as unknown as editor.IStandaloneCodeEditor,
                    { editor: { ScrollType: { Immediate: 1 } } } as unknown as Parameters<
                        NonNullable<EditorProps['onMount']>
                    >[1],
                );
            if (mockDeferMonacoMount) mockPendingMonacoMounts.push(mount);
            else mount();
        }, [runtime]);
        return React.createElement('textarea', {
            'aria-label': 'Markdown source',
            value,
            onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => {
                runtime.content = event.target.value;
                setValue(event.target.value);
                onChange?.(event.target.value, {} as editor.IModelContentChangedEvent);
            },
        });
    };
    return { __esModule: true, default: MockMonaco, loader: { config: jest.fn() } };
});

jest.mock('../../src/ui/components/monacoSetup', () => ({
    __esModule: true,
    applyMonacoThemeFromRoot: jest.fn(() => jest.fn()),
    monaco: {},
    registerEditorLinkModel: jest.fn((_model, activate: (href: string) => void) => {
        mockLinkActivation = activate;
        return { dispose: jest.fn() };
    }),
}));

jest.mock('../../src/logic/adapter', () => ({
    appModelAdapter: {
        flushActiveSession: jest.fn(),
        flushBuffer: jest.fn(async () => undefined),
        flushDocView: jest.fn(async () => undefined),
        openPreviewLink: jest.fn(),
        openExternalLink: jest.fn(),
        registerActiveSession: jest.fn(),
        subscribeAcceptedBuffers: jest.fn(() => jest.fn()),
        updateBuffer: jest.fn(async () => undefined),
        updateDocView: jest.fn(async () => undefined),
    },
    settingsAdapter: {},
    windowAdapter: {},
}));

import { useCommands } from '../../src/app/useCommands';
import { useDocumentSession } from '../../src/app/useDocumentSession';
import { appModelAdapter } from '../../src/logic/adapter';
import { store } from '../../src/logic/store';
import { hydrateProjection, resetProjection } from '../../src/logic/store/appModelProjectionActions';
import { resetNotifications } from '../../src/logic/store/notificationsSlice';
import { defaultEditorSettings, hydrateSettings, resetSettingsProjection } from '../../src/logic/store/settingsSlice';
import EditorStage, { type EditorStageHandle } from '../../src/ui/widgets/EditorStage/EditorStage';
import { EditorSessionProvider } from '../../src/ui/widgets/editorSession';

const wrapper = ({ children }: PropsWithChildren): React.JSX.Element => <Provider store={store}>{children}</Provider>;
const splitView = {
    ...documentFixture('source').view,
    arrangement: 'split' as const,
    editorVisible: true,
    previewVisible: true,
    scroll: { editor: 0, preview: 80 },
};
const source = { ...documentFixture('source'), path: '/notes/source.md', view: splitView };
const target = { ...documentFixture('target'), path: '/notes/target.md', view: splitView };
const link: LinkTarget & { kind: 'localDocument' } = { kind: 'localDocument', href: './target.md' };

function project(activeDocumentId: string, revision: number, includeTarget: boolean): void {
    store.dispatch(
        hydrateProjection({
            activeDocumentId,
            revision,
            tabSetRevision: revision,
            orderedDocumentIds: includeTarget ? ['source', 'target'] : ['source'],
            documents: includeTarget ? { source, target } : { source },
            ui: {},
        }),
    );
}

function openLinkFrom(
    commands: ReturnType<typeof useCommands>,
): (target: typeof link, sourceDocumentId: string) => Promise<void> {
    return commands.openLink;
}

function useLinkOwner() {
    const session = useDocumentSession();
    return { session, commands: useCommands(session, async () => 'closed') };
}

function LinkedStage({
    sourceContent = '# Source\n\n[Go](./target.md)',
    editorVisible = true,
    stageRef,
    warn = jest.fn(),
}: {
    sourceContent?: string;
    editorVisible?: boolean;
    stageRef?: Ref<EditorStageHandle>;
    warn?: (target: string, reason: string) => void;
}): React.JSX.Element | null {
    const { session, commands } = useLinkOwner();
    const onBootstrapReady = session.onBootstrapReady;
    useEffect(() => {
        onBootstrapReady({
            status: 'ready',
            applicationVersion: 'dev',
            activeBuffer: {
                documentId: 'source',
                content: sourceContent,
                documentRevision: 0,
                projectionRevision: 1,
            },
        });
    }, [onBootstrapReady, sourceContent]);
    if (session.activeBuffer === null || session.activeDocument === undefined) return null;
    return (
        <EditorSessionProvider activeBuffer={session.activeBuffer} externalEpoch={session.externalEpoch}>
            <EditorStage
                ref={stageRef}
                activeBuffer={session.activeBuffer}
                activeDocument={session.activeDocument}
                adapter={appModelAdapter}
                editorVisible={editorVisible}
                previewVisible
                readOnly={false}
                view={session.activeDocument.view}
                onLiveCursorChange={jest.fn()}
                onPreviewWarning={warn}
                onOpenLink={commands.openLink}
                fragmentRequest={commands.fragmentRequest}
            />
        </EditorSessionProvider>
    );
}

function bootstrapSource(owner: ReturnType<typeof renderHook<ReturnType<typeof useLinkOwner>, unknown>>): void {
    act(() =>
        owner.result.current.session.onBootstrapReady({
            status: 'ready',
            applicationVersion: 'dev',
            activeBuffer: {
                documentId: 'source',
                content: '# Source content',
                documentRevision: 0,
                projectionRevision: 1,
            },
        }),
    );
}

beforeEach(() => {
    jest.clearAllMocks();
    mockEditors.length = 0;
    mockDeferMonacoMount = false;
    mockPendingMonacoMounts.length = 0;
    mockLinkActivation = null;
    store.dispatch(resetProjection());
    store.dispatch(resetNotifications());
    store.dispatch(resetSettingsProjection());
    store.dispatch(
        hydrateSettings({ ...loadedMarkdownSettings, editor: { ...defaultEditorSettings, scrollSync: false } }),
    );
    project('source', 1, false);
});

it('routes editor document links through the same application command as preview links', async () => {
    (appModelAdapter.flushActiveSession as jest.Mock).mockResolvedValue(undefined);
    (appModelAdapter.openPreviewLink as jest.Mock).mockImplementation(async () => {
        project('target', 2, true);
        return {
            status: 'opened',
            documentId: 'target',
            activeBuffer: { documentId: 'target', content: '## Target', documentRevision: 0, projectionRevision: 2 },
        };
    });
    render(<LinkedStage sourceContent="[Go](./target.md)" />, { wrapper });
    await waitFor(() => expect(mockLinkActivation).not.toBeNull());

    act(() => mockLinkActivation?.('./target.md'));

    await waitFor(() => expect(appModelAdapter.openPreviewLink).toHaveBeenCalledWith('source', './target.md'));
    await screen.findByRole('heading', { name: 'Target' });
});

it('routes editor web links and refused schemes through the preview policy', async () => {
    const warn = jest.fn();
    render(<LinkedStage sourceContent="[web](https://example.org) [mail](mailto:x@y)" warn={warn} />, {
        wrapper,
    });
    await waitFor(() => expect(mockLinkActivation).not.toBeNull());

    act(() => {
        mockLinkActivation?.('https://example.org');
        mockLinkActivation?.('mailto:x@y');
    });

    expect(appModelAdapter.openExternalLink).toHaveBeenCalledWith('https://example.org');
    expect(warn).toHaveBeenCalledWith('mailto:x@y', expect.stringContaining('http(s)'));
    expect(appModelAdapter.openPreviewLink).not.toHaveBeenCalled();
});

it('moves the editor caret to a same-document heading without opening another tab', async () => {
    render(<LinkedStage sourceContent={'# Source\n\n[setup](#setup)\n\n## Setup'} />, { wrapper });
    await waitFor(() => expect(mockLinkActivation).not.toBeNull());

    act(() => mockLinkActivation?.('#setup'));

    await waitFor(() => expect(mockEditors.at(-1)?.setPosition).toHaveBeenCalledWith({ lineNumber: 5, column: 1 }));
    expect(appModelAdapter.openPreviewLink).not.toHaveBeenCalled();
});

it('moves the visible preview and editor to a linked heading after the target renders', async () => {
    (appModelAdapter.flushActiveSession as jest.Mock).mockResolvedValue(undefined);
    (appModelAdapter.openPreviewLink as jest.Mock).mockImplementation(async () => {
        project('target', 2, true);
        return {
            status: 'opened',
            documentId: 'target',
            activeBuffer: {
                documentId: 'target',
                content: '# Intro\n\n## Setup\n\nBody',
                documentRevision: 0,
                projectionRevision: 2,
            },
        };
    });
    const scrolled: Element[] = [];
    const originalScroll = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = function () {
        scrolled.push(this);
    };
    try {
        render(
            <Provider store={store}>
                <LinkedStage sourceContent={'# Source\n\n[Go](./target.md#setup)'} />
            </Provider>,
        );
        fireEvent.click(await screen.findByRole('link', { name: 'Go' }));

        const heading = await screen.findByRole('heading', { name: 'Setup' });
        await waitFor(() => expect(scrolled).toContain(heading));
        await waitFor(() => expect(mockEditors.at(-1)?.setPosition).toHaveBeenCalledWith({ lineNumber: 3, column: 1 }));
    } finally {
        HTMLElement.prototype.scrollIntoView = originalScroll;
    }
});

it('moves the editor caret when Monaco attaches after the linked fragment request', async () => {
    (appModelAdapter.flushActiveSession as jest.Mock).mockResolvedValue(undefined);
    (appModelAdapter.openPreviewLink as jest.Mock).mockImplementation(async () => {
        project('target', 2, true);
        return {
            status: 'opened',
            documentId: 'target',
            activeBuffer: {
                documentId: 'target',
                content: '# Intro\n\n## Setup\n\nBody',
                documentRevision: 0,
                projectionRevision: 2,
            },
        };
    });
    render(
        <Provider store={store}>
            <LinkedStage sourceContent={'# Source\n\n[Go](./target.md#setup)'} />
        </Provider>,
    );
    await screen.findByRole('link', { name: 'Go' });
    mockDeferMonacoMount = true;
    fireEvent.click(screen.getByRole('link', { name: 'Go' }));
    await screen.findByRole('heading', { name: 'Setup' });
    await waitFor(() => expect(mockPendingMonacoMounts).toHaveLength(1));
    expect(mockEditors.at(-1)?.setPosition).not.toHaveBeenCalled();

    act(() => mockPendingMonacoMounts.shift()?.());

    await waitFor(() => expect(mockEditors.at(-1)?.setPosition).toHaveBeenCalledWith({ lineNumber: 3, column: 1 }));
});

it('shows an unknown linked fragment from the top without raising a notice', async () => {
    (appModelAdapter.flushActiveSession as jest.Mock).mockResolvedValue(undefined);
    (appModelAdapter.openPreviewLink as jest.Mock).mockImplementation(async () => {
        project('target', 2, true);
        return {
            status: 'opened',
            documentId: 'target',
            activeBuffer: {
                documentId: 'target',
                content: '# Intro\n\nBody',
                documentRevision: 0,
                projectionRevision: 2,
            },
        };
    });
    const { container } = render(
        <Provider store={store}>
            <LinkedStage sourceContent={'# Source\n\n[Go](./target.md#unknown)'} />
        </Provider>,
    );
    fireEvent.click(await screen.findByRole('link', { name: 'Go' }));

    await screen.findByRole('heading', { name: 'Intro' });
    await waitFor(() => expect(mockEditors.at(-1)?.setPosition).toHaveBeenCalledWith({ lineNumber: 1, column: 1 }));
    await waitFor(() => expect(container.querySelector('.previewContent')?.scrollTop).toBe(0));
    expect(store.getState().notifications.items).toHaveLength(0);
});

it('scrolls a self-link fragment without reinstalling the editor session', async () => {
    (appModelAdapter.flushActiveSession as jest.Mock).mockResolvedValue(undefined);
    (appModelAdapter.openPreviewLink as jest.Mock).mockResolvedValue({
        status: 'focused',
        documentId: 'source',
        activeBuffer: { documentId: 'source', content: 'stale source', documentRevision: 0, projectionRevision: 1 },
    });
    const scrolled: Element[] = [];
    const originalScroll = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = function () {
        scrolled.push(this);
    };
    try {
        render(
            <Provider store={store}>
                <LinkedStage sourceContent={'# Source\n\n[Self](./source.md#setup)\n\n## Setup'} />
            </Provider>,
        );
        const editorCount = mockEditors.length;
        fireEvent.click(await screen.findByRole('link', { name: 'Self' }));

        const heading = await screen.findByRole('heading', { name: 'Setup' });
        await waitFor(() => expect(scrolled).toContain(heading));
        await waitFor(() => expect(mockEditors.at(-1)?.setPosition).toHaveBeenCalledWith({ lineNumber: 5, column: 1 }));
        expect(mockEditors).toHaveLength(editorCount);
        expect(screen.getByRole('textbox', { name: 'Markdown source' })).toHaveValue(
            '# Source\n\n[Self](./source.md#setup)\n\n## Setup',
        );
    } finally {
        HTMLElement.prototype.scrollIntoView = originalScroll;
    }
});

it('keeps a queued editor view-state restore from overriding a fragment opened while the editor was hidden', async () => {
    (appModelAdapter.flushActiveSession as jest.Mock).mockResolvedValue(undefined);
    (appModelAdapter.openPreviewLink as jest.Mock).mockResolvedValue({
        status: 'focused',
        documentId: 'source',
        activeBuffer: { documentId: 'source', content: 'stale source', documentRevision: 0, projectionRevision: 1 },
    });
    const frames = new Map<number, FrameRequestCallback>();
    const requestFrame = jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
        const id = frames.size + 1;
        frames.set(id, callback);
        return id;
    });
    const cancelFrame = jest.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
        frames.delete(id);
    });
    const stageRef = createRef<EditorStageHandle>();
    const stage = (editorVisible: boolean): React.JSX.Element => (
        <Provider store={store}>
            <LinkedStage
                sourceContent={'# Source\n\n## Setup\n\n[Go](./source.md#setup)'}
                editorVisible={editorVisible}
                stageRef={stageRef}
            />
        </Provider>
    );
    try {
        const view = render(stage(true));
        await screen.findByRole('link', { name: 'Go' });
        act(() => stageRef.current?.captureViewState());
        view.rerender(stage(false));
        fireEvent.click(screen.getByRole('link', { name: 'Go' }));
        await waitFor(() => expect(appModelAdapter.openPreviewLink).toHaveBeenCalledTimes(1));
        view.rerender(stage(true));
        await waitFor(() => expect(mockEditors[0]?.setPosition).toHaveBeenCalledWith({ lineNumber: 3, column: 1 }));
        act(() => Array.from(frames.values()).forEach((callback) => callback(0)));
        expect(mockEditors[0]?.restoreViewState).not.toHaveBeenCalled();
    } finally {
        requestFrame.mockRestore();
        cancelFrame.mockRestore();
    }
});

it('does not replay a consumed fragment after visiting another document', async () => {
    const scrolled: Element[] = [];
    const originalScroll = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = function () {
        scrolled.push(this);
    };
    const fragmentRequest = { documentId: 'target', slug: 'setup', seq: 1 };
    const stage = (documentId: 'source' | 'target'): React.JSX.Element => {
        const activeBuffer = {
            documentId,
            content: documentId === 'target' ? '## Setup' : '# Source',
            documentRevision: 0,
        };
        const metadata = documentId === 'target' ? target : source;
        return (
            <Provider store={store}>
                <EditorSessionProvider activeBuffer={activeBuffer}>
                    <EditorStage
                        activeBuffer={activeBuffer}
                        activeDocument={metadata}
                        adapter={appModelAdapter}
                        editorVisible
                        previewVisible
                        readOnly={false}
                        view={metadata.view}
                        fragmentRequest={fragmentRequest}
                        onLiveCursorChange={jest.fn()}
                        onPreviewWarning={jest.fn()}
                    />
                </EditorSessionProvider>
            </Provider>
        );
    };
    try {
        const view = render(stage('target'));
        await waitFor(() => expect(scrolled).toHaveLength(1));
        view.rerender(stage('source'));
        await screen.findByRole('heading', { name: 'Source' });
        view.rerender(stage('target'));
        await screen.findByRole('heading', { name: 'Setup' });
        expect(scrolled).toHaveLength(1);
    } finally {
        HTMLElement.prototype.scrollIntoView = originalScroll;
    }
});

afterEach(() => {
    store.dispatch(resetProjection());
    store.dispatch(resetNotifications());
    store.dispatch(resetSettingsProjection());
});

it('flushes the source before a linked document opens and installs its active buffer', async () => {
    const order: string[] = [];
    (appModelAdapter.flushActiveSession as jest.Mock).mockImplementation(async () => {
        order.push('flush');
    });
    (appModelAdapter.openPreviewLink as jest.Mock).mockImplementation(async () => {
        order.push('open');
        project('target', 2, true);
        return {
            status: 'opened',
            documentId: 'target',
            activeBuffer: {
                documentId: 'target',
                content: '## Target content',
                documentRevision: 0,
                projectionRevision: 2,
            },
        };
    });
    const owner = renderHook(useLinkOwner, { wrapper });
    bootstrapSource(owner);

    await act(async () => openLinkFrom(owner.result.current.commands)(link, 'source'));

    expect(order).toEqual(['flush', 'open']);
    expect(appModelAdapter.openPreviewLink).toHaveBeenCalledWith('source', './target.md');
    await waitFor(() => expect(owner.result.current.session.activeBuffer?.content).toBe('## Target content'));
    expect(owner.result.current.commands.tabRevealRequest?.documentId).toBe('target');
    expect(owner.result.current.commands.treeRevealRequest).toBeNull();
});

it('publishes a tree reveal only when the backend identifies a visible row', async () => {
    (appModelAdapter.flushActiveSession as jest.Mock).mockResolvedValue(undefined);
    (appModelAdapter.openPreviewLink as jest.Mock).mockImplementation(async () => {
        project('target', 2, true);
        return {
            status: 'opened',
            documentId: 'target',
            treePath: '/notes/target.md',
            activeBuffer: { documentId: 'target', content: '## Setup', documentRevision: 0, projectionRevision: 2 },
        };
    });
    const owner = renderHook(useLinkOwner, { wrapper });
    bootstrapSource(owner);

    await act(async () => openLinkFrom(owner.result.current.commands)(link, 'source'));

    expect(owner.result.current.commands.treeRevealRequest).toEqual({
        documentId: 'target',
        path: '/notes/target.md',
        seq: 1,
    });
});

it('keeps the source active and avoids a backend call when its outgoing edits cannot flush', async () => {
    (appModelAdapter.flushActiveSession as jest.Mock).mockRejectedValue(new Error('flush failed'));
    const owner = renderHook(useLinkOwner, { wrapper });
    bootstrapSource(owner);

    await act(async () => openLinkFrom(owner.result.current.commands)(link, 'source'));

    expect(appModelAdapter.openPreviewLink).not.toHaveBeenCalled();
    expect(owner.result.current.session.activeBuffer?.documentId).toBe('source');
    expect(store.getState().documents.activeDocumentId).toBe('source');
    expect(store.getState().notifications.items).toHaveLength(1);
});

it('publishes only a fragment request for a link to the installed document', async () => {
    (appModelAdapter.flushActiveSession as jest.Mock).mockResolvedValue(undefined);
    (appModelAdapter.openPreviewLink as jest.Mock).mockResolvedValue({
        status: 'focused',
        documentId: 'source',
        activeBuffer: { documentId: 'source', content: 'stale copy', documentRevision: 0, projectionRevision: 1 },
    });
    const owner = renderHook(useLinkOwner, { wrapper });
    bootstrapSource(owner);
    const installed = owner.result.current.session.activeBuffer;

    await act(async () => openLinkFrom(owner.result.current.commands)({ ...link, fragment: 'setup' }, 'source'));

    expect(owner.result.current.session.activeBuffer).toBe(installed);
    expect(Reflect.get(owner.result.current.commands, 'fragmentRequest')).toEqual({
        documentId: 'source',
        slug: 'setup',
        seq: 1,
    });
    expect(owner.result.current.commands.tabRevealRequest).toBeNull();
});

it('reports backend link refusals without offering Retry', async () => {
    (appModelAdapter.flushActiveSession as jest.Mock).mockResolvedValue(undefined);
    (appModelAdapter.openPreviewLink as jest.Mock).mockResolvedValue({
        status: 'refused',
        error: {
            category: 'not-found',
            dedupKey: 'source:not-found',
            message: 'The file could not be found.',
            remediations: ['Retry'],
            safeSubject: 'missing.md',
        },
    });
    const owner = renderHook(useLinkOwner, { wrapper });
    bootstrapSource(owner);

    await act(async () => openLinkFrom(owner.result.current.commands)({ ...link, href: './missing.md' }, 'source'));

    expect(owner.result.current.session.activeBuffer?.documentId).toBe('source');
    const notice = store.getState().notifications.items.at(-1);
    expect(notice?.title).toBe('missing.md');
    expect(notice?.remediations).toHaveLength(0);
});

it('shows the Open capacity notice when a link would exceed forty tabs', async () => {
    const ids = ['source', ...Array.from({ length: 39 }, (_, index) => `open-${index}`)];
    store.dispatch(
        hydrateProjection({
            activeDocumentId: 'source',
            revision: 1,
            tabSetRevision: 1,
            orderedDocumentIds: ids,
            documents: Object.fromEntries(ids.map((id) => [id, id === 'source' ? source : documentFixture(id)])),
            ui: {},
        }),
    );
    (appModelAdapter.flushActiveSession as jest.Mock).mockResolvedValue(undefined);
    (appModelAdapter.openPreviewLink as jest.Mock).mockResolvedValue({
        status: 'refused',
        error: {
            category: 'capacity-limit',
            dedupKey: 'source:capacity',
            safeSubject: 'target.md',
            message: 'The window already contains 40 documents.',
            remediations: [],
        },
    });
    const owner = renderHook(useLinkOwner, { wrapper });
    bootstrapSource(owner);

    await act(async () => openLinkFrom(owner.result.current.commands)(link, 'source'));

    expect(store.getState().documents.orderedIds).toHaveLength(40);
    expect(store.getState().notifications.items.at(-1)?.message).toContain('40 documents');
    expect(store.getState().notifications.items.at(-1)?.remediations).toHaveLength(0);
});

it('offers Reveal for an existing unsupported file without opening another tab', async () => {
    (appModelAdapter.flushActiveSession as jest.Mock).mockResolvedValue(undefined);
    (appModelAdapter.openPreviewLink as jest.Mock).mockResolvedValue({
        status: 'refused',
        revealPath: '/notes/report.pdf',
        error: {
            category: 'unsupported-input',
            dedupKey: 'source:unsupported',
            safeSubject: 'report.pdf',
            message: 'The preview link has a file type the Open dialog does not accept.',
            remediations: [],
        },
    });
    const owner = renderHook(useLinkOwner, { wrapper });
    bootstrapSource(owner);

    await act(async () => openLinkFrom(owner.result.current.commands)({ ...link, href: './report.pdf' }, 'source'));

    const notice = store.getState().notifications.items.at(-1);
    expect(notice?.code).toBe('link-unsupported-file');
    expect(notice?.title).toBe('report.pdf');
    expect(notice?.remediations).toEqual([
        expect.objectContaining({ intent: 'reveal-workspace-path', path: '/notes/report.pdf' }),
    ]);
    expect(store.getState().documents.activeDocumentId).toBe('source');
});

it('ignores an older link response after a newer fragment and tree request has won', async () => {
    (appModelAdapter.flushActiveSession as jest.Mock).mockResolvedValue(undefined);
    const pending: Array<(value: unknown) => void> = [];
    (appModelAdapter.openPreviewLink as jest.Mock).mockImplementation(
        () => new Promise((resolve) => pending.push(resolve)),
    );
    const owner = renderHook(useLinkOwner, { wrapper });
    bootstrapSource(owner);
    let older!: Promise<void>;
    let newer!: Promise<void>;
    act(() => {
        older = openLinkFrom(owner.result.current.commands)({ ...link, fragment: 'old' }, 'source');
        newer = openLinkFrom(owner.result.current.commands)({ ...link, fragment: 'new' }, 'source');
    });
    await waitFor(() => expect(pending).toHaveLength(2));
    await act(async () => {
        project('target', 2, true);
        pending[1]({
            status: 'opened',
            documentId: 'target',
            treePath: '/notes/target.md',
            activeBuffer: { documentId: 'target', content: '## New', documentRevision: 0, projectionRevision: 2 },
        });
        await newer;
    });
    await act(async () => {
        pending[0]({
            status: 'focused',
            documentId: 'target',
            treePath: '/notes/old.md',
            activeBuffer: { documentId: 'target', content: '## Old', documentRevision: 0, projectionRevision: 1 },
        });
        await older;
    });
    expect(owner.result.current.commands.fragmentRequest).toEqual({ documentId: 'target', slug: 'new', seq: 1 });
    expect(owner.result.current.commands.treeRevealRequest).toEqual({
        documentId: 'target',
        path: '/notes/target.md',
        seq: 1,
    });
});

it('keeps an unsaved source edit and shows a linked target in both editor and preview panes', async () => {
    let activeSession: { documentId: string; flushActiveSession: () => Promise<void> } | undefined;
    const flushOrder: string[] = [];
    (appModelAdapter.registerActiveSession as jest.Mock).mockImplementation((session) => {
        activeSession = session;
        return () => {
            if (activeSession === session) activeSession = undefined;
        };
    });
    (appModelAdapter.flushActiveSession as jest.Mock).mockImplementation(async () => {
        flushOrder.push('flush');
        await activeSession?.flushActiveSession();
    });
    (appModelAdapter.openPreviewLink as jest.Mock).mockImplementation(async () => {
        flushOrder.push('open');
        project('target', 2, true);
        return {
            status: 'opened',
            documentId: 'target',
            activeBuffer: {
                documentId: 'target',
                content: '## Setup\n\nTarget body',
                documentRevision: 0,
                projectionRevision: 2,
            },
        };
    });

    render(
        <Provider store={store}>
            <LinkedStage />
        </Provider>,
    );
    const sourceEditor = await screen.findByRole('textbox', { name: 'Markdown source' });
    expect(await screen.findByRole('link', { name: 'Go' })).toBeVisible();
    fireEvent.change(sourceEditor, { target: { value: '# Edited source\n\n[Go](./target.md)' } });
    expect(appModelAdapter.updateBuffer).toHaveBeenCalledWith('source', '# Edited source\n\n[Go](./target.md)');
    fireEvent.click(screen.getByRole('link', { name: 'Go' }));

    await waitFor(() =>
        expect(screen.getByRole('textbox', { name: 'Markdown source' })).toHaveValue('## Setup\n\nTarget body'),
    );
    expect(await screen.findByRole('heading', { name: 'Setup' })).toBeVisible();
    expect(flushOrder).toEqual(['flush', 'open']);
    expect(appModelAdapter.flushBuffer).toHaveBeenCalledWith('source');
});
