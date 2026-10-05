import type { PropsWithChildren } from 'react';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';

jest.mock('../../src/logic/adapter', () => ({
    appModelAdapter: {
        getState: jest.fn(),
        chooseWorkspaceFolder: jest.fn(),
        openWorkspace: jest.fn(),
        refreshWorkspace: jest.fn(),
        setWorkspaceHiddenFolders: jest.fn(),
        closeWorkspace: jest.fn(),
        createWorkspaceFile: jest.fn(),
        createWorkspaceFolder: jest.fn(),
        revealWorkspacePath: jest.fn(),
        copyWorkspacePath: jest.fn(),
        openDocument: jest.fn(),
        openRecentFile: jest.fn(),
        setDocView: jest.fn(async () => undefined),
        classifyDroppedPaths: jest.fn(),
        refreshRecentItems: jest.fn(),
        clearRecentItems: jest.fn(),
        reopenLastFile: jest.fn(),
    },
    windowAdapter: { openNewWindow: jest.fn() },
}));
jest.mock('../../src/logic/adapter/events', () => ({ subscribeFileDrops: jest.fn(() => jest.fn()) }));
jest.mock('../../src/ui/widgets/EditorStage/EditorStage', () => ({
    __esModule: true,
    default: (): React.JSX.Element => <input aria-label="Editor text" />,
}));
jest.mock('../../src/ui/widgets/DocumentTabs/DocumentTabs', () => ({ __esModule: true, default: () => null }));
jest.mock('../../src/ui/widgets/FormattingToolbar/FormattingToolbar', () => ({
    __esModule: true,
    default: () => null,
}));

import { useCommands } from '../../src/app/useCommands';
import { useDropHandler } from '../../src/app/useDropHandler';
import type { DocumentSession } from '../../src/app/useDocumentSession';
import { appModelAdapter, windowAdapter } from '../../src/logic/adapter';
import { store } from '../../src/logic/store';
import { applyStatePatch, hydrateProjection, resetProjection } from '../../src/logic/store/appModelProjectionActions';
import { resetNotifications } from '../../src/logic/store/notificationsSlice';
import type { WorkspaceSnapshot } from '../../src/logic/store/appModelTypes';
import { documentFixture } from '../support/appFixtures';
import FolderDropPrompt from '../../src/ui/widgets/dialogs/FolderDropPrompt';
import WorkspaceReplacePrompt from '../../src/ui/widgets/dialogs/WorkspaceReplacePrompt';
import WorkspaceTree from '../../src/ui/widgets/WorkspaceTree/WorkspaceTree';
import { WorkspaceTreeCommandsContext } from '../../src/ui/widgets/WorkspaceTree/workspaceTreeCommands';
import EditorView from '../../src/ui/widgets/EditorView';
import { DocumentCommandContext, EditorSessionContext } from '../../src/ui/widgets/editorSession';
import { createDocumentCommands } from '../../src/logic/hooks/useDocumentCommands';
import type { CodeEditorHandle } from '../../src/ui/components/CodeEditor';
import { ModalStateContext } from '../../src/ui/widgets/modalStateContext';
import type { LintFinding } from '../../src/logic/tidy/protocol';

const wrapper = ({ children }: PropsWithChildren): React.JSX.Element => <Provider store={store}>{children}</Provider>;
const activation = { begin: () => 1, acknowledge: jest.fn() } as unknown as DocumentSession['activation'];
const session = { activeBuffer: null, activation } as Pick<DocumentSession, 'activeBuffer' | 'activation'>;

function workspace(rootPath: string): WorkspaceSnapshot {
    return {
        rootPath,
        rootName: rootPath.split('/').pop() ?? rootPath,
        root: { path: rootPath, name: rootPath.split('/').pop() ?? rootPath, isDir: true },
        totalEntries: 1,
        truncated: false,
        unavailable: false,
        filterSuffixes: ['.md'],
        showHiddenFolders: false,
    };
}

function hydrate(rootPath: string | null, tabIds: string[] = []): void {
    store.dispatch(
        hydrateProjection({
            revision: 1,
            tabSetRevision: 1,
            activeDocumentId: tabIds[0] ?? null,
            orderedDocumentIds: tabIds,
            documents: Object.fromEntries(tabIds.map((id) => [id, documentFixture(id)])),
            workspace: rootPath === null ? undefined : workspace(rootPath),
            ui: {},
        }),
    );
}

beforeEach(() => {
    jest.clearAllMocks();
    store.dispatch(resetProjection());
    store.dispatch(resetNotifications());
    (appModelAdapter.getState as jest.Mock).mockImplementation(async () => ({
        snapshot: {
            workspace: store.getState().workspace.snapshot,
            orderedDocumentIds: store.getState().documents.orderedIds,
        },
    }));
});

it('opens the editor and moves the caret and focus when a problem is activated from preview mode', async () => {
    const document = documentFixture('created');
    store.dispatch(
        hydrateProjection({
            revision: 1,
            activeDocumentId: 'created',
            orderedDocumentIds: ['created'],
            documents: {
                created: {
                    ...document,
                    view: { ...document.view, arrangement: 'preview', editorVisible: false, previewVisible: true },
                },
            },
            ui: {},
        }),
    );
    const finding: LintFinding = {
        rule: 'trailing-space',
        severity: 'warning',
        startLine: 8,
        startColumn: 4,
        endLine: 8,
        endColumn: 5,
        message: { key: 'lint.rule.trailing-space.message' },
        hint: 'lint.rule.trailing-space.hint',
    };
    const token = Symbol('problem-editor');
    const handle: CodeEditorHandle = {
        focus: jest.fn(() => {
            screen.getByRole('textbox', { name: 'Editor text' }).focus();
            return true;
        }),
        setPosition: jest.fn(() => true),
        getContent: () => '',
        getSelection: () => null,
        replaceRange: () => true,
        replaceAll: () => true,
        applyEdits: () => true,
        setMarkers: () => true,
    };
    const commands = createDocumentCommands('created', token, () => ({ documentId: 'created', token, handle }));
    render(
        <EditorSessionContext.Provider value={{ documentId: 'created', content: '' }}>
            <DocumentCommandContext.Provider value={commands}>
                <EditorView
                    problemsOpen
                    problemsSummary={{ findings: [finding], total: 1, stale: false }}
                    onCloseProblems={jest.fn()}
                />
            </DocumentCommandContext.Provider>
        </EditorSessionContext.Provider>,
        { wrapper },
    );
    fireEvent.click(screen.getByRole('button', { name: /Line 8, column 4/i }));
    await waitFor(() =>
        expect(appModelAdapter.setDocView).toHaveBeenCalledWith(
            'created',
            { editorVisible: true, previewVisible: false },
            expect.objectContaining({ editorVisible: true, previewVisible: false }),
        ),
    );
    act(() => {
        store.dispatch(
            hydrateProjection({
                revision: 2,
                activeDocumentId: 'created',
                orderedDocumentIds: ['created'],
                documents: {
                    created: {
                        ...document,
                        view: { ...document.view, arrangement: 'editor', editorVisible: true, previewVisible: false },
                    },
                },
                ui: {},
            }),
        );
    });
    expect(handle.setPosition).toHaveBeenCalledWith(8, 4);
    expect(screen.getByRole('textbox', { name: 'Editor text' })).toHaveFocus();
    const row = screen.getByRole('button', { name: /Line 8, column 4/i });
    row.focus();
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(handle.setPosition).toHaveBeenCalledTimes(2);
    expect(handle.focus).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('textbox', { name: 'Editor text' })).toHaveFocus();
});

it('scopes header creation to the selected folder and expands it after a successful create', async () => {
    hydrate('/notes');
    const tree = workspace('/notes');
    tree.root.children = [{ path: '/notes/drafts', name: 'drafts', isDir: true, children: [] }];
    tree.totalEntries = 2;
    act(() => {
        store.dispatch(applyStatePatch({ revision: 2, workspace: tree }));
    });
    const onCreateWorkspaceEntry = jest.fn(async (_kind: 'file' | 'folder', parentPath: string, name: string) => {
        const refreshed = workspace('/notes');
        refreshed.root.children = [
            {
                path: '/notes/drafts',
                name: 'drafts',
                isDir: true,
                children: [{ path: `${parentPath}/${name}`, name, isDir: false }],
            },
        ];
        refreshed.totalEntries = 3;
        store.dispatch(applyStatePatch({ revision: 3, workspace: refreshed }));
        return { status: 'opened' as const };
    });
    render(
        <WorkspaceTreeCommandsContext.Provider
            value={{
                onOpenFolder: jest.fn(),
                onCloseFolder: jest.fn(),
                onRefreshWorkspace: jest.fn(),
                onSetWorkspaceHiddenFolders: jest.fn(),
                onOpenTreeFile: jest.fn(),
                onCreateWorkspaceEntry,
            }}
        >
            <WorkspaceTree />
        </WorkspaceTreeCommandsContext.Provider>,
        { wrapper },
    );
    fireEvent.click(screen.getByRole('treeitem', { name: 'drafts' }));
    fireEvent.click(screen.getByRole('treeitem', { name: 'drafts' }));
    fireEvent.click(screen.getByRole('button', { name: 'New file or folder' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'New File' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(onCreateWorkspaceEntry).toHaveBeenCalledWith('file', '/notes/drafts', 'draft.md'));
    expect(screen.getByRole('treeitem', { name: 'draft.md' })).toBeInTheDocument();
});

it('scopes header creation to the root when no folder row is selected', async () => {
    hydrate('/notes');
    const onCreateWorkspaceEntry = jest.fn(async () => ({ status: 'opened' as const }));
    render(
        <WorkspaceTreeCommandsContext.Provider
            value={{
                onOpenFolder: jest.fn(),
                onCloseFolder: jest.fn(),
                onRefreshWorkspace: jest.fn(),
                onSetWorkspaceHiddenFolders: jest.fn(),
                onOpenTreeFile: jest.fn(),
                onCreateWorkspaceEntry,
            }}
        >
            <WorkspaceTree />
        </WorkspaceTreeCommandsContext.Provider>,
        { wrapper },
    );
    fireEvent.click(screen.getByRole('button', { name: 'New file or folder' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'New Folder' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'drafts' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(onCreateWorkspaceEntry).toHaveBeenCalledWith('folder', '/notes', 'drafts'));
});

it('requests editor focus only after a created file opens and the prompt closes', async () => {
    hydrate('/notes');
    const onFocusCreatedFile = jest.fn();
    render(
        <WorkspaceTreeCommandsContext.Provider
            value={{
                onOpenFolder: jest.fn(),
                onCloseFolder: jest.fn(),
                onRefreshWorkspace: jest.fn(),
                onSetWorkspaceHiddenFolders: jest.fn(),
                onOpenTreeFile: jest.fn(),
                onFocusCreatedFile,
                onCreateWorkspaceEntry: jest.fn(async () => ({
                    status: 'opened' as const,
                    openResult: { status: 'focused' as const, documentId: 'created' },
                })),
            }}
        >
            <WorkspaceTree />
        </WorkspaceTreeCommandsContext.Provider>,
        { wrapper },
    );
    fireEvent.click(screen.getByRole('button', { name: 'New file or folder' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'New File' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(onFocusCreatedFile).toHaveBeenCalledWith('created'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('moves keyboard focus into the created file editor after the modal closes', async () => {
    hydrate('/notes', ['created']);
    const token = Symbol('created-editor');
    const handle: CodeEditorHandle = {
        focus: () => {
            const input = screen.queryByRole('textbox', { name: 'Editor text' });
            input?.focus();
            return input !== null;
        },
        getContent: () => '',
        getSelection: () => null,
        replaceRange: () => true,
        replaceAll: () => true,
        applyEdits: () => true,
        setPosition: () => true,
        setMarkers: () => true,
    };
    const commands = createDocumentCommands('created', token, () => ({ documentId: 'created', token, handle }));
    const renderEditor = (modalOpen: boolean) => (
        <ModalStateContext.Provider value={modalOpen}>
            <EditorSessionContext.Provider value={{ documentId: 'created', content: '' }}>
                <DocumentCommandContext.Provider value={commands}>
                    <EditorView editorFocusRequest={{ documentId: 'created', sequence: 1 }} />
                </DocumentCommandContext.Provider>
            </EditorSessionContext.Provider>
        </ModalStateContext.Provider>
    );
    const view = render(renderEditor(true), { wrapper });
    expect(screen.getByRole('textbox', { name: 'Editor text' })).not.toHaveFocus();
    view.rerender(renderEditor(false));
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Editor text' })).toHaveFocus());
});

it('leaves editor input focused after creating a file from the real tree prompt', async () => {
    hydrate('/notes', ['created']);
    (appModelAdapter.createWorkspaceFile as jest.Mock).mockResolvedValue({ status: 'opened' });
    (appModelAdapter.openRecentFile as jest.Mock).mockResolvedValue({ status: 'focused', documentId: 'created' });
    const token = Symbol('created-editor');
    const handle: CodeEditorHandle = {
        focus: () => {
            const input = screen.queryByRole('textbox', { name: 'Editor text' });
            input?.focus();
            return input !== null;
        },
        getContent: () => '',
        getSelection: () => null,
        replaceRange: () => true,
        replaceAll: () => true,
        applyEdits: () => true,
        setPosition: () => true,
        setMarkers: () => true,
    };
    const documentCommands = createDocumentCommands('created', token, () => ({ documentId: 'created', token, handle }));
    const Harness = (): React.JSX.Element => {
        const commands = useCommands(session, jest.fn());
        return (
            <EditorSessionContext.Provider value={{ documentId: 'created', content: '' }}>
                <DocumentCommandContext.Provider value={documentCommands}>
                    <WorkspaceTreeCommandsContext.Provider value={commands}>
                        <WorkspaceTree />
                        <EditorView editorFocusRequest={commands.editorFocusRequest} />
                    </WorkspaceTreeCommandsContext.Provider>
                </DocumentCommandContext.Provider>
            </EditorSessionContext.Provider>
        );
    };
    render(<Harness />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: 'New file or folder' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'New File' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Editor text' })).toHaveFocus());
});

it('keeps a name collision in the prompt without raising a toast', async () => {
    hydrate('/notes');
    (appModelAdapter.createWorkspaceFile as jest.Mock).mockResolvedValue({
        status: 'refused',
        error: { category: 'conflict', message: 'Name taken', remediations: [], dedupKey: 'taken' },
    });
    const owner = renderHook(() => useCommands(session, jest.fn()), { wrapper });
    await act(async () => owner.result.current.onCreateWorkspaceEntry('file', '/notes', 'taken.md'));
    expect(store.getState().notifications.items).toHaveLength(0);
    expect(appModelAdapter.openRecentFile).not.toHaveBeenCalled();
});

it('opens a created file through the existing focused tab command and leaves a created folder unopened', async () => {
    hydrate('/notes');
    (appModelAdapter.createWorkspaceFile as jest.Mock).mockResolvedValue({ status: 'opened' });
    (appModelAdapter.createWorkspaceFolder as jest.Mock).mockResolvedValue({ status: 'opened' });
    (appModelAdapter.openRecentFile as jest.Mock).mockResolvedValue({ status: 'focused', documentId: 'created' });
    const owner = renderHook(() => useCommands(session, jest.fn()), { wrapper });
    await act(async () => owner.result.current.onCreateWorkspaceEntry('file', '/notes', 'draft.md'));
    expect(appModelAdapter.openRecentFile).toHaveBeenCalledWith('/notes/draft.md', 1);
    expect(owner.result.current.tabRevealRequest?.documentId).toBe('created');
    await act(async () => owner.result.current.onCreateWorkspaceEntry('folder', '/notes', 'drafts'));
    expect(appModelAdapter.openRecentFile).toHaveBeenCalledTimes(1);
});

it('reports that a created file could not open at the tab limit without retrying creation', async () => {
    hydrate('/notes');
    (appModelAdapter.createWorkspaceFile as jest.Mock).mockResolvedValue({ status: 'opened' });
    (appModelAdapter.openRecentFile as jest.Mock).mockResolvedValue({
        status: 'refused',
        error: { category: 'capacity-limit', message: 'Too many tabs', remediations: [], dedupKey: 'capacity' },
    });
    const owner = renderHook(() => useCommands(session, jest.fn()), { wrapper });
    let result: Awaited<ReturnType<typeof owner.result.current.onCreateWorkspaceEntry>>;
    await act(async () => {
        result = await owner.result.current.onCreateWorkspaceEntry('file', '/notes', 'draft.md');
    });
    expect(result?.status).toBe('opened');
    expect(result).toHaveProperty('openResult.status', 'refused');
    expect(appModelAdapter.createWorkspaceFile).toHaveBeenCalledTimes(1);
    expect(store.getState().notifications.items[0]?.message).toMatch(
        /created.*could not be opened.*close one or more tabs/i,
    );
});

it('keeps the committed create outcome when the follow-up open throws', async () => {
    hydrate('/notes');
    (appModelAdapter.createWorkspaceFile as jest.Mock).mockResolvedValue({ status: 'opened' });
    (appModelAdapter.openRecentFile as jest.Mock).mockRejectedValue(new Error('bridge unavailable'));
    const owner = renderHook(() => useCommands(session, jest.fn()), { wrapper });
    let result: Awaited<ReturnType<typeof owner.result.current.onCreateWorkspaceEntry>>;
    await act(async () => {
        result = await owner.result.current.onCreateWorkspaceEntry('file', '/notes', 'draft.md');
    });
    expect(result?.status).toBe('opened');
    expect(result?.openResult?.status).toBe('refused');
    expect(appModelAdapter.createWorkspaceFile).toHaveBeenCalledTimes(1);
    expect(store.getState().notifications.items[0]?.message).toMatch(/created.*could not be opened/i);
});

it('opens a created file with the canonical parent path separator on Windows', async () => {
    hydrate('/notes');
    (appModelAdapter.createWorkspaceFile as jest.Mock).mockResolvedValue({ status: 'opened' });
    (appModelAdapter.openRecentFile as jest.Mock).mockResolvedValue({ status: 'opened' });
    const owner = renderHook(() => useCommands(session, jest.fn()), { wrapper });
    await act(async () => owner.result.current.onCreateWorkspaceEntry('file', 'C:\\notes', 'draft.md'));
    expect(appModelAdapter.openRecentFile).toHaveBeenCalledWith('C:\\notes\\draft.md', 1);
});

it('preserves a literal backslash in a POSIX parent folder name when opening a created file', async () => {
    hydrate('/notes');
    (appModelAdapter.createWorkspaceFile as jest.Mock).mockResolvedValue({ status: 'opened' });
    (appModelAdapter.openRecentFile as jest.Mock).mockResolvedValue({ status: 'opened' });
    const owner = renderHook(() => useCommands(session, jest.fn()), { wrapper });
    await act(async () => owner.result.current.onCreateWorkspaceEntry('file', '/notes/archive\\2026', 'draft.md'));
    expect(appModelAdapter.openRecentFile).toHaveBeenCalledWith('/notes/archive\\2026/draft.md', 1);
});

it('signals each focused file-open outcome, including repeats, without signaling a refusal', async () => {
    hydrate('/notes', ['one']);
    (appModelAdapter.openRecentFile as jest.Mock).mockResolvedValue({ status: 'focused', documentId: 'one' });
    (appModelAdapter.openDocument as jest.Mock).mockResolvedValue({ status: 'focused', documentId: 'one' });
    (appModelAdapter.reopenLastFile as jest.Mock).mockResolvedValue({ status: 'refused' });
    const owner = renderHook(() => useCommands(session, jest.fn()), { wrapper });

    await act(async () => owner.result.current.onOpenRecentFile('/notes/one.md', 1));
    expect(owner.result.current).toHaveProperty('tabRevealRequest', { documentId: 'one', sequence: 1 });
    await act(async () => owner.result.current.onOpenDocument(1));
    expect(owner.result.current).toHaveProperty('tabRevealRequest', { documentId: 'one', sequence: 2 });
    await act(async () => owner.result.current.onReopenLastFile(1));
    expect(owner.result.current).toHaveProperty('tabRevealRequest', { documentId: 'one', sequence: 2 });
});

it('routes recent folders and a Reopen Last folder target through the shared replace prompt', async () => {
    hydrate('/current');
    const owner = renderHook(() => useCommands(session, jest.fn()), { wrapper });
    await act(async () => owner.result.current.onOpenRecentItem({ path: '/other', kind: 'folder' }, 1));
    expect(owner.result.current.replaceFolderPath).toBe('/other');
    expect(appModelAdapter.openRecentFile).not.toHaveBeenCalled();
    await act(async () => owner.result.current.onReplaceFolderChoice('cancel'));
    (appModelAdapter.reopenLastFile as jest.Mock).mockResolvedValue({ status: 'folder-target', path: '/third' });
    await act(async () => owner.result.current.onReopenLastFile(1));
    expect(owner.result.current.replaceFolderPath).toBe('/third');
    expect(appModelAdapter.openWorkspace).not.toHaveBeenCalled();
});

it('routes a dropped folder through the real empty-window folder command', async () => {
    hydrate(null);
    (appModelAdapter.classifyDroppedPaths as jest.Mock).mockResolvedValue({
        files: [],
        folders: ['/dropped'],
        unsupported: [],
    });
    (appModelAdapter.openWorkspace as jest.Mock).mockResolvedValue({
        status: 'opened',
        workspace: workspace('/dropped'),
    });
    const owner = renderHook(
        () => {
            const commands = useCommands(session, jest.fn());
            return { commands, drops: useDropHandler(commands, true) };
        },
        { wrapper },
    );
    await act(async () => owner.result.current.drops.handlePaths(['/dropped']));
    expect(appModelAdapter.openWorkspace).toHaveBeenCalledWith('/dropped');
    expect(owner.result.current.commands.replaceFolderPath).toBeNull();
});

it('routes first-only through the real occupied-window replace prompt', async () => {
    hydrate('/current');
    (appModelAdapter.classifyDroppedPaths as jest.Mock).mockResolvedValue({
        files: [],
        folders: ['/first', '/second'],
        unsupported: [],
    });
    const owner = renderHook(
        () => {
            const commands = useCommands(session, jest.fn());
            return { commands, drops: useDropHandler(commands, true) };
        },
        { wrapper },
    );
    await act(async () => owner.result.current.drops.handlePaths(['/first', '/second']));
    await act(async () => owner.result.current.drops.onFolderChoice('first-only'));
    expect(owner.result.current.commands.replaceFolderPath).toBe('/first');
    expect(appModelAdapter.openWorkspace).not.toHaveBeenCalled();
});

it('holds a queued drop until the reused replace prompt is decided', async () => {
    hydrate('/current');
    (appModelAdapter.classifyDroppedPaths as jest.Mock)
        .mockResolvedValueOnce({ files: [], folders: ['/first', '/second'], unsupported: [] })
        .mockResolvedValueOnce({ files: [], folders: ['/third'], unsupported: [] });
    const owner = renderHook(
        () => {
            const commands = useCommands(session, jest.fn());
            return { commands, drops: useDropHandler(commands, true) };
        },
        { wrapper },
    );
    await act(async () => owner.result.current.drops.handlePaths(['/first', '/second']));
    await act(async () => owner.result.current.drops.handlePaths(['/third']));
    await act(async () => owner.result.current.drops.onFolderChoice('first-only'));
    expect(owner.result.current.commands.replaceFolderPath).toBe('/first');
    expect(appModelAdapter.classifyDroppedPaths).toHaveBeenCalledTimes(1);
    await act(async () => owner.result.current.commands.onReplaceFolderChoice('cancel'));
    await waitFor(() => expect(appModelAdapter.classifyDroppedPaths).toHaveBeenCalledTimes(2));
    expect(owner.result.current.commands.replaceFolderPath).toBe('/third');
});

it('releases a queued drop after a real replace-dialog cancellation', async () => {
    hydrate('/current');
    (appModelAdapter.classifyDroppedPaths as jest.Mock)
        .mockResolvedValueOnce({ files: [], folders: ['/first', '/second'], unsupported: [] })
        .mockResolvedValueOnce({ files: [], folders: ['/third'], unsupported: [] });
    let dropPaths: ((paths: string[]) => Promise<void>) | undefined;
    const Harness = (): React.JSX.Element => {
        const commands = useCommands(session, jest.fn());
        const drops = useDropHandler(commands, true);
        dropPaths = drops.handlePaths;
        return (
            <>
                <FolderDropPrompt
                    open={drops.folderPaths.length > 1}
                    folderPaths={drops.folderPaths}
                    onChoice={drops.onFolderChoice}
                />
                <WorkspaceReplacePrompt
                    open={commands.replaceFolderPath !== null}
                    folderPath={commands.replaceFolderPath ?? ''}
                    onChoice={commands.onReplaceFolderChoice}
                />
            </>
        );
    };
    render(<Harness />, { wrapper });
    await act(async () => dropPaths?.(['/first', '/second']));
    await act(async () => dropPaths?.(['/third']));
    expect(appModelAdapter.classifyDroppedPaths).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Open only the first folder' }));
    await waitFor(() => expect(screen.getByText(/How would you like to open \/first/)).toBeInTheDocument());
    expect(appModelAdapter.classifyDroppedPaths).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(appModelAdapter.classifyDroppedPaths).toHaveBeenCalledTimes(2));
    expect(screen.getByText(/How would you like to open \/third/)).toBeInTheDocument();
    expect(appModelAdapter.openWorkspace).not.toHaveBeenCalled();
});

it('refreshes recents after a missing file or folder refuses to open', async () => {
    hydrate(null);
    (appModelAdapter.openRecentFile as jest.Mock).mockResolvedValue({
        status: 'refused',
        error: { category: 'not-found', message: 'Missing', remediations: [] },
    });
    (appModelAdapter.openWorkspace as jest.Mock).mockResolvedValue({
        status: 'refused',
        error: { category: 'not-found', message: 'Missing', remediations: [] },
    });
    const owner = renderHook(() => useCommands(session, jest.fn()), { wrapper });
    await act(async () => owner.result.current.onOpenRecentItem({ path: '/missing.md', kind: 'file' }, 1));
    await act(async () => owner.result.current.onOpenRecentItem({ path: '/missing', kind: 'folder' }, 1));
    expect(appModelAdapter.refreshRecentItems).toHaveBeenCalledTimes(2);
});

it('reports and prunes a deleted recent folder even when it matches the current root', async () => {
    hydrate('/notes');
    (appModelAdapter.openWorkspace as jest.Mock).mockResolvedValue({
        status: 'refused',
        error: { category: 'not-found', message: 'The folder is gone.', remediations: [] },
    });
    const owner = renderHook(() => useCommands(session, jest.fn()), { wrapper });
    await act(async () => owner.result.current.onOpenRecentItem({ path: '/notes', kind: 'folder' }, 1));
    expect(appModelAdapter.openWorkspace).toHaveBeenCalledWith('/notes');
    expect(appModelAdapter.refreshRecentItems).toHaveBeenCalledTimes(1);
    expect(store.getState().notifications.items).toHaveLength(1);
    expect(owner.result.current.replaceFolderPath).toBeNull();
});

it('keeps a healthy same-root recent folder unchanged without prompting', async () => {
    hydrate('/notes');
    (appModelAdapter.openWorkspace as jest.Mock).mockResolvedValue({
        status: 'unchanged',
        workspace: workspace('/notes'),
    });
    const owner = renderHook(() => useCommands(session, jest.fn()), { wrapper });
    await act(async () => owner.result.current.onOpenRecentItem({ path: '/notes', kind: 'folder' }, 1));
    expect(appModelAdapter.openWorkspace).toHaveBeenCalledWith('/notes');
    expect(owner.result.current.replaceFolderPath).toBeNull();
    expect(store.getState().notifications.items).toHaveLength(0);
});

it('validates a same-root Reopen Last folder target before treating it as unchanged', async () => {
    hydrate('/notes');
    (appModelAdapter.reopenLastFile as jest.Mock).mockResolvedValue({ status: 'folder-target', path: '/notes' });
    (appModelAdapter.openWorkspace as jest.Mock).mockResolvedValue({
        status: 'refused',
        error: { category: 'not-found', message: 'The folder is gone.', remediations: [] },
    });
    const owner = renderHook(() => useCommands(session, jest.fn()), { wrapper });
    await act(async () => owner.result.current.onReopenLastFile(1));
    expect(appModelAdapter.openWorkspace).toHaveBeenCalledWith('/notes');
    expect(appModelAdapter.refreshRecentItems).toHaveBeenCalledTimes(1);
    expect(store.getState().notifications.items).toHaveLength(1);
});

it('does nothing when the chosen canonical folder is already open', async () => {
    hydrate('/notes');
    const closeAll = jest.fn(async () => 'closed' as const);
    const owner = renderHook(() => useCommands(session, closeAll), { wrapper });

    await act(async () => owner.result.current.onOpenWorkspacePath('/notes'));

    expect(owner.result.current.replaceFolderPath).toBeNull();
    expect(closeAll).not.toHaveBeenCalled();
    expect(appModelAdapter.openWorkspace).not.toHaveBeenCalled();
});

it('opens only the folder chosen by the native picker and holds reading while it loads', async () => {
    hydrate(null);
    (appModelAdapter.chooseWorkspaceFolder as jest.Mock).mockResolvedValue({ status: 'chosen', path: '/notes' });
    let finishOpen: (value: { status: 'opened'; workspace: WorkspaceSnapshot }) => void = () => undefined;
    (appModelAdapter.openWorkspace as jest.Mock).mockImplementation(
        () => new Promise((resolve) => (finishOpen = resolve)),
    );
    const owner = renderHook(() => useCommands(session, jest.fn()), { wrapper });

    act(() => {
        void owner.result.current.onOpenFolder();
    });
    await waitFor(() => expect(appModelAdapter.openWorkspace).toHaveBeenCalledWith('/notes'));
    expect(store.getState().workspace.reading).toBe(true);
    await act(async () => finishOpen({ status: 'opened', workspace: workspace('/notes') }));
    await waitFor(() => expect(store.getState().workspace.reading).toBe(false));
});

it('holds workspace.reading through a pending refresh and clears it when the read completes', async () => {
    hydrate('/notes');
    let finishRefresh: (value: { status: 'opened'; workspace: WorkspaceSnapshot }) => void = () => undefined;
    (appModelAdapter.refreshWorkspace as jest.Mock).mockImplementation(
        () => new Promise((resolve) => (finishRefresh = resolve)),
    );
    const owner = renderHook(() => useCommands(session, jest.fn()), { wrapper });

    act(() => {
        void owner.result.current.onRefreshWorkspace();
    });
    await waitFor(() => expect(appModelAdapter.refreshWorkspace).toHaveBeenCalledTimes(1));
    expect(store.getState().workspace.reading).toBe(true);
    await act(async () => finishRefresh({ status: 'opened', workspace: workspace('/notes') }));
    await waitFor(() => expect(store.getState().workspace.reading).toBe(false));
});

it('keeps the prior tree during loading and projects an unavailable root after the read', async () => {
    hydrate('/notes');
    let finishRefresh: (value: { status: 'opened'; workspace: WorkspaceSnapshot }) => void = () => undefined;
    (appModelAdapter.refreshWorkspace as jest.Mock).mockImplementation(
        () => new Promise((resolve) => (finishRefresh = resolve)),
    );
    const owner = renderHook(() => useCommands(session, jest.fn()), { wrapper });

    act(() => {
        void owner.result.current.onRefreshWorkspace();
    });
    expect(store.getState().workspace.reading).toBe(true);
    expect(store.getState().workspace.snapshot?.rootPath).toBe('/notes');

    const unavailable = workspace('/notes');
    unavailable.unavailable = true;
    act(() => {
        store.dispatch(applyStatePatch({ revision: 2, workspace: unavailable }));
    });
    await act(async () => finishRefresh({ status: 'opened', workspace: unavailable }));

    expect(store.getState().workspace.reading).toBe(false);
    expect(store.getState().workspace.snapshot?.unavailable).toBe(true);
});

it('holds workspace.reading through a pending hidden-folder update', async () => {
    hydrate('/notes');
    let finishUpdate: (value: { status: 'opened'; workspace: WorkspaceSnapshot }) => void = () => undefined;
    (appModelAdapter.setWorkspaceHiddenFolders as jest.Mock).mockImplementation(
        () => new Promise((resolve) => (finishUpdate = resolve)),
    );
    const owner = renderHook(() => useCommands(session, jest.fn()), { wrapper });

    act(() => {
        void owner.result.current.onSetWorkspaceHiddenFolders(true);
    });
    await waitFor(() => expect(appModelAdapter.setWorkspaceHiddenFolders).toHaveBeenCalledWith(true));
    expect(store.getState().workspace.reading).toBe(true);
    await act(async () => finishUpdate({ status: 'opened', workspace: workspace('/notes') }));
    await waitFor(() => expect(store.getState().workspace.reading).toBe(false));
});

it('keeps workspace.reading true until overlapping refresh and hidden-folder reads both finish', async () => {
    hydrate('/notes');
    let finishRefresh: (value: { status: 'opened'; workspace: WorkspaceSnapshot }) => void = () => undefined;
    let finishUpdate: (value: { status: 'opened'; workspace: WorkspaceSnapshot }) => void = () => undefined;
    (appModelAdapter.refreshWorkspace as jest.Mock).mockImplementation(
        () => new Promise((resolve) => (finishRefresh = resolve)),
    );
    (appModelAdapter.setWorkspaceHiddenFolders as jest.Mock).mockImplementation(
        () => new Promise((resolve) => (finishUpdate = resolve)),
    );
    const owner = renderHook(() => useCommands(session, jest.fn()), { wrapper });

    act(() => {
        void owner.result.current.onRefreshWorkspace();
        void owner.result.current.onSetWorkspaceHiddenFolders(true);
    });
    await waitFor(() => {
        expect(appModelAdapter.refreshWorkspace).toHaveBeenCalledTimes(1);
        expect(appModelAdapter.setWorkspaceHiddenFolders).toHaveBeenCalledWith(true);
    });
    expect(store.getState().workspace.reading).toBe(true);

    await act(async () => finishUpdate({ status: 'opened', workspace: workspace('/notes') }));
    expect(store.getState().workspace.reading).toBe(true);
    await act(async () => finishRefresh({ status: 'opened', workspace: workspace('/notes') }));
    await waitFor(() => expect(store.getState().workspace.reading).toBe(false));
});

it('reports refresh failures with a retry remediation for the current folder', async () => {
    hydrate('/notes');
    (appModelAdapter.refreshWorkspace as jest.Mock).mockResolvedValue({
        status: 'refused',
        error: {
            category: 'io-failure',
            message: 'Folder refresh failed',
            remediations: ['Retry'],
            dedupKey: 'workspace-refresh:/notes',
        },
    });
    const owner = renderHook(() => useCommands(session, jest.fn()), { wrapper });

    await act(async () => owner.result.current.onRefreshWorkspace());

    expect(store.getState().notifications.items[0]?.remediations).toContainEqual(
        expect.objectContaining({ action: 'retry', intent: 'refresh-workspace' }),
    );
});

it('projects a refreshed tree and retains it when a later patch omits workspace', () => {
    hydrate('/notes');
    const refreshed = workspace('/notes');
    refreshed.root.children = [{ path: '/notes/new.md', name: 'new.md', isDir: false }];
    refreshed.totalEntries = 2;

    act(() => {
        store.dispatch(applyStatePatch({ revision: 2, workspace: refreshed }));
        store.dispatch(applyStatePatch({ revision: 3, orderedDocumentIds: [] }));
    });

    expect(store.getState().workspace.snapshot?.root.children).toEqual(refreshed.root.children);
    expect(store.getState().workspace.snapshot?.totalEntries).toBe(2);
});

it('refreshes a stale tree row after a missing file is refused without opening a tab', async () => {
    hydrate('/notes');
    const staleTree = workspace('/notes');
    staleTree.root.children = [{ path: '/notes/gone.md', name: 'gone.md', isDir: false }];
    staleTree.totalEntries = 2;
    act(() => {
        store.dispatch(applyStatePatch({ revision: 2, workspace: staleTree }));
    });
    expect(store.getState().workspace.snapshot?.root.children).toHaveLength(1);
    (appModelAdapter.openRecentFile as jest.Mock).mockResolvedValue({
        error: { category: 'not-found', message: 'The file is no longer there', remediations: [] },
    });
    (appModelAdapter.refreshWorkspace as jest.Mock).mockImplementation(async () => {
        const refreshed = workspace('/notes');
        store.dispatch(applyStatePatch({ revision: 3, workspace: refreshed }));
        return { status: 'opened', workspace: refreshed };
    });
    const owner = renderHook(() => useCommands(session, jest.fn()), { wrapper });

    await act(async () => owner.result.current.onOpenTreeFile('/notes/gone.md', 1));

    expect(appModelAdapter.openRecentFile).toHaveBeenCalledWith('/notes/gone.md', 1);
    expect(appModelAdapter.refreshWorkspace).toHaveBeenCalledTimes(1);
    expect(store.getState().notifications.items).toEqual([
        expect.objectContaining({ message: expect.stringContaining('no longer there') }),
    ]);
    expect(store.getState().workspace.snapshot?.root.children).toBeUndefined();
    expect(store.getState().documents.orderedIds).toEqual([]);
    expect(store.getState().workspace.reading).toBe(false);
});

it('does not refresh a tree row after a different file-open refusal', async () => {
    hydrate('/notes');
    (appModelAdapter.openRecentFile as jest.Mock).mockResolvedValue({
        error: { category: 'capacity-limit', message: 'Too many tabs', remediations: [] },
    });
    const owner = renderHook(() => useCommands(session, jest.fn()), { wrapper });

    await act(async () => owner.result.current.onOpenTreeFile('/notes/file.md', 1));

    expect(appModelAdapter.refreshWorkspace).not.toHaveBeenCalled();
});

it('does not open a folder when the picker is cancelled', async () => {
    hydrate(null);
    (appModelAdapter.chooseWorkspaceFolder as jest.Mock).mockResolvedValue({ status: 'cancelled' });
    const owner = renderHook(() => useCommands(session, jest.fn()), { wrapper });

    await act(async () => owner.result.current.onOpenFolder());

    expect(appModelAdapter.openWorkspace).not.toHaveBeenCalled();
});

it('checks the current folder after a pending picker resolves', async () => {
    hydrate(null);
    let finishPicker: (value: { status: 'chosen'; path: string }) => void = () => undefined;
    (appModelAdapter.chooseWorkspaceFolder as jest.Mock).mockImplementation(
        () => new Promise((resolve) => (finishPicker = resolve)),
    );
    const owner = renderHook(() => useCommands(session, jest.fn()), { wrapper });

    act(() => {
        void owner.result.current.onOpenFolder();
    });
    act(() => {
        store.dispatch(applyStatePatch({ revision: 2, workspace: workspace('/other') }));
    });
    await act(async () => finishPicker({ status: 'chosen', path: '/new' }));

    expect(owner.result.current.replaceFolderPath).toBe('/new');
    expect(appModelAdapter.openWorkspace).not.toHaveBeenCalled();
});

it('does not start a second read while a folder is opening', async () => {
    hydrate(null);
    let finishOpen: (value: { status: 'opened'; workspace: WorkspaceSnapshot }) => void = () => undefined;
    (appModelAdapter.openWorkspace as jest.Mock).mockImplementation(
        () => new Promise((resolve) => (finishOpen = resolve)),
    );
    const owner = renderHook(() => useCommands(session, jest.fn()), { wrapper });

    act(() => {
        void owner.result.current.onOpenWorkspacePath('/first');
    });
    act(() => {
        void owner.result.current.onOpenWorkspacePath('/second');
    });

    expect(appModelAdapter.openWorkspace).toHaveBeenCalledTimes(1);
    expect(store.getState().workspace.reading).toBe(true);
    await act(async () => finishOpen({ status: 'opened', workspace: workspace('/first') }));
    expect(store.getState().workspace.reading).toBe(false);
    expect(owner.result.current.replaceFolderPath).toBe('/second');
    expect(appModelAdapter.openWorkspace).toHaveBeenCalledTimes(1);
});

it('opens the queued folder if the first read is refused', async () => {
    hydrate(null);
    let finishFirst: (value: { status: 'refused' }) => void = () => undefined;
    (appModelAdapter.openWorkspace as jest.Mock)
        .mockImplementationOnce(() => new Promise((resolve) => (finishFirst = resolve)))
        .mockResolvedValueOnce({ status: 'opened', workspace: workspace('/second') });
    const owner = renderHook(() => useCommands(session, jest.fn()), { wrapper });

    act(() => {
        void owner.result.current.onOpenWorkspacePath('/first');
        void owner.result.current.onOpenWorkspacePath('/second');
    });
    expect(appModelAdapter.openWorkspace).toHaveBeenCalledTimes(1);
    await act(async () => finishFirst({ status: 'refused' }));

    await waitFor(() => expect(appModelAdapter.openWorkspace).toHaveBeenNthCalledWith(2, '/second'));
    expect(owner.result.current.replaceFolderPath).toBeNull();
});

it('waits for all tabs to close before replacing the folder', async () => {
    hydrate('/old', ['one', 'two']);
    let finishClose: (value: 'closed') => void = () => undefined;
    const closeAll = jest.fn(() => new Promise<'closed'>((resolve) => (finishClose = resolve)));
    (appModelAdapter.openWorkspace as jest.Mock).mockResolvedValue({ status: 'opened', workspace: workspace('/new') });
    const owner = renderHook(() => useCommands(session, closeAll), { wrapper });

    await act(async () => owner.result.current.onOpenWorkspacePath('/new'));
    expect(owner.result.current.replaceFolderPath).toBe('/new');
    act(() => {
        void owner.result.current.onReplaceFolderChoice('replace');
    });
    expect(closeAll).toHaveBeenCalledTimes(1);
    expect(appModelAdapter.openWorkspace).not.toHaveBeenCalled();
    await act(async () => finishClose('closed'));
    await waitFor(() => expect(appModelAdapter.openWorkspace).toHaveBeenCalledWith('/new'));
});

it('abandons replacement when a save prompt is cancelled', async () => {
    hydrate('/old', ['one', 'two']);
    const closeAll = jest.fn(async () => 'cancelled' as const);
    const owner = renderHook(() => useCommands(session, closeAll), { wrapper });

    await act(async () => owner.result.current.onOpenWorkspacePath('/new'));
    await act(async () => owner.result.current.onReplaceFolderChoice('replace'));

    expect(appModelAdapter.openWorkspace).not.toHaveBeenCalled();
    expect(store.getState().workspace.snapshot?.rootPath).toBe('/old');
    expect(store.getState().documents.orderedIds).toEqual(['one', 'two']);
});

it('abandons replacement when closing a dirty tab is refused', async () => {
    hydrate('/old', ['dirty']);
    const closeAll = jest.fn(async () => 'refused' as const);
    const owner = renderHook(() => useCommands(session, closeAll), { wrapper });

    await act(async () => owner.result.current.onOpenWorkspacePath('/new'));
    await act(async () => owner.result.current.onReplaceFolderChoice('replace'));

    expect(closeAll).toHaveBeenCalledTimes(1);
    expect(appModelAdapter.openWorkspace).not.toHaveBeenCalled();
    expect(store.getState().workspace.snapshot?.rootPath).toBe('/old');
    expect(store.getState().documents.orderedIds).toEqual(['dirty']);
});

it('leaves the old folder and its tabs untouched when replacement is cancelled', async () => {
    hydrate('/old', ['one']);
    const closeAll = jest.fn();
    const owner = renderHook(() => useCommands(session, closeAll), { wrapper });

    await act(async () => owner.result.current.onOpenWorkspacePath('/new'));
    await act(async () => owner.result.current.onReplaceFolderChoice('cancel'));

    expect(owner.result.current.replaceFolderPath).toBeNull();
    expect(closeAll).not.toHaveBeenCalled();
    expect(appModelAdapter.openWorkspace).not.toHaveBeenCalled();
    expect(store.getState().workspace.snapshot?.rootPath).toBe('/old');
    expect(store.getState().documents.orderedIds).toEqual(['one']);
});

it('opens the target in a new window without changing this window', async () => {
    hydrate('/old');
    (windowAdapter.openNewWindow as jest.Mock).mockResolvedValue(undefined);
    const owner = renderHook(() => useCommands(session, jest.fn()), { wrapper });

    await act(async () => owner.result.current.onOpenWorkspacePath('/new'));
    await act(async () => owner.result.current.onReplaceFolderChoice('new-window'));

    expect(windowAdapter.openNewWindow).toHaveBeenCalledWith('/new');
    expect(appModelAdapter.openWorkspace).not.toHaveBeenCalled();
});

it('opens a fresh New Window with an empty startup path without changing this window', async () => {
    hydrate('/old', ['one']);
    (windowAdapter.openNewWindow as jest.Mock).mockResolvedValue(undefined);
    const owner = renderHook(() => useCommands(session, jest.fn()), { wrapper });

    await act(async () => owner.result.current.onNewWindow());

    expect(windowAdapter.openNewWindow).toHaveBeenCalledWith('');
    expect(appModelAdapter.openWorkspace).not.toHaveBeenCalled();
    expect(store.getState().workspace.snapshot?.rootPath).toBe('/old');
    expect(store.getState().documents.orderedIds).toEqual(['one']);
});

it('reports a fresh New Window launch failure', async () => {
    hydrate('/old');
    (windowAdapter.openNewWindow as jest.Mock).mockRejectedValue(new Error('launch failed'));
    const owner = renderHook(() => useCommands(session, jest.fn()), { wrapper });

    await act(async () => owner.result.current.onNewWindow());

    expect(store.getState().notifications.items).toEqual([
        expect.objectContaining({
            error: expect.objectContaining({ message: 'launch failed' }),
            severity: 'error',
            subject: 'new-window',
        }),
    ]);
    expect(appModelAdapter.openWorkspace).not.toHaveBeenCalled();
});

it('reports a new-window launch failure without opening the target here', async () => {
    hydrate('/old');
    (windowAdapter.openNewWindow as jest.Mock).mockRejectedValue(new Error('launch failed'));
    const owner = renderHook(() => useCommands(session, jest.fn()), { wrapper });

    await act(async () => owner.result.current.onOpenWorkspacePath('/new'));
    await act(async () => owner.result.current.onReplaceFolderChoice('new-window'));

    expect(appModelAdapter.openWorkspace).not.toHaveBeenCalled();
    expect(store.getState().notifications.items).toHaveLength(1);
});

it('closes a folder without prompting when no tabs are open', async () => {
    hydrate('/notes');
    (appModelAdapter.closeWorkspace as jest.Mock).mockResolvedValue({});
    const owner = renderHook(() => useCommands(session, jest.fn()), { wrapper });

    await act(async () => owner.result.current.onCloseFolder());

    expect(owner.result.current.closeFolderPromptOpen).toBe(false);
    expect(appModelAdapter.closeWorkspace).toHaveBeenCalledTimes(1);
});

it('uses the current tab count after replacement closes the last tab', async () => {
    hydrate('/notes', ['one']);
    (appModelAdapter.closeWorkspace as jest.Mock).mockResolvedValue({});
    const owner = renderHook(() => useCommands(session, jest.fn()), { wrapper });
    const closeFolderFromMenu = owner.result.current.onCloseFolder;
    act(() => {
        store.dispatch(applyStatePatch({ revision: 2, orderedDocumentIds: [], activeDocument: { present: false } }));
    });

    await act(async () => closeFolderFromMenu());

    expect(owner.result.current.closeFolderPromptOpen).toBe(false);
    expect(appModelAdapter.closeWorkspace).toHaveBeenCalledTimes(1);
});

it('uses the backend tab count when the projection still lists a closed tab', async () => {
    hydrate('/notes', ['one']);
    (appModelAdapter.getState as jest.Mock).mockResolvedValue({
        snapshot: { workspace: workspace('/notes'), orderedDocumentIds: [] },
    });
    (appModelAdapter.closeWorkspace as jest.Mock).mockResolvedValue({});
    const owner = renderHook(() => useCommands(session, jest.fn()), { wrapper });

    await act(async () => owner.result.current.onCloseFolder());

    expect(owner.result.current.closeFolderPromptOpen).toBe(false);
    expect(appModelAdapter.closeWorkspace).toHaveBeenCalledTimes(1);
});

it('keeps tabs open when that close-folder choice is selected', async () => {
    hydrate('/notes', ['one']);
    (appModelAdapter.closeWorkspace as jest.Mock).mockResolvedValue({});
    const closeAll = jest.fn();
    const owner = renderHook(() => useCommands(session, closeAll), { wrapper });

    await act(async () => owner.result.current.onCloseFolder());
    expect(owner.result.current.closeFolderPromptOpen).toBe(true);
    await act(async () => owner.result.current.onCloseFolderChoice('keep-tabs'));

    expect(closeAll).not.toHaveBeenCalled();
    expect(appModelAdapter.closeWorkspace).toHaveBeenCalledTimes(1);
    expect(store.getState().documents.orderedIds).toEqual(['one']);
});

it('does not close the folder if closing its tabs is cancelled', async () => {
    hydrate('/notes', ['one']);
    const owner = renderHook(
        () =>
            useCommands(
                session,
                jest.fn(async () => 'cancelled' as const),
            ),
        { wrapper },
    );

    await act(async () => owner.result.current.onCloseFolder());
    await act(async () => owner.result.current.onCloseFolderChoice('close-tabs'));

    expect(appModelAdapter.closeWorkspace).not.toHaveBeenCalled();
    expect(store.getState().workspace.snapshot?.rootPath).toBe('/notes');
});

it('closes the folder only after all tabs close successfully', async () => {
    hydrate('/notes', ['one']);
    let finishClose: (value: 'closed') => void = () => undefined;
    const closeAll = jest.fn(() => new Promise<'closed'>((resolve) => (finishClose = resolve)));
    (appModelAdapter.closeWorkspace as jest.Mock).mockResolvedValue({});
    const owner = renderHook(() => useCommands(session, closeAll), { wrapper });

    await act(async () => owner.result.current.onCloseFolder());
    act(() => {
        void owner.result.current.onCloseFolderChoice('close-tabs');
    });
    expect(appModelAdapter.closeWorkspace).not.toHaveBeenCalled();
    await act(async () => finishClose('closed'));
    await waitFor(() => expect(appModelAdapter.closeWorkspace).toHaveBeenCalledTimes(1));
});

it('leaves the folder and tabs untouched when Close Folder is cancelled', async () => {
    hydrate('/notes', ['one']);
    const owner = renderHook(() => useCommands(session, jest.fn()), { wrapper });

    await act(async () => owner.result.current.onCloseFolder());
    await act(async () => owner.result.current.onCloseFolderChoice('cancel'));

    expect(appModelAdapter.closeWorkspace).not.toHaveBeenCalled();
    expect(store.getState().workspace.snapshot?.rootPath).toBe('/notes');
    expect(store.getState().documents.orderedIds).toEqual(['one']);
});
