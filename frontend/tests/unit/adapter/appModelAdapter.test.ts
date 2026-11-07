import { store } from '../../../src/logic/store';
import { dismissNotification } from '../../../src/logic/store/notificationsSlice';
import type {
    AppModelState,
    AppStatePatch,
    ClassifiedError,
    ClassifiedVoidResult,
    DocViewInput,
    WorkspaceResult,
} from '../../../src/logic/store/appModelTypes';
import type { WireError } from '../../../src/logic/utils/parseError';
import { isBufferSyncError } from '../../../src/logic/utils/bufferSyncError';
import {
    VIEW_SYNC_MS,
    createAppModelAdapter,
    normalizeRecentItems,
    type AppModelAdapter,
    type AppModelBindings,
    type AppModelRuntime,
} from '../../../src/logic/adapter/appModelAdapter';
import { createStatePatchDriver } from '../../support/statePatches';

type VoidResult = { error?: WireError };

const state: AppModelState = {
    snapshot: {
        revision: 1,
        documents: {},
        activeDocumentId: '',
        ui: {},
    },
    activeBuffer: { documentId: '', content: '', documentRevision: 0 },
};

function viewAt(line: number, previewVisible = false): DocViewInput {
    return {
        editorVisible: !previewVisible,
        previewVisible,
        cursor: { line, column: 1 },
        selection: {
            start: { line, column: 1 },
            end: { line, column: 1 },
        },
        scroll: { editor: line, preview: 0 },
    };
}

interface Deferred<T> {
    promise: Promise<T>;
    resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
    let resolve: (value: T) => void = (): void => undefined;
    const promise = new Promise<T>((resolvePromise): void => {
        resolve = resolvePromise;
    });
    return { promise, resolve };
}

afterEach((): void => {
    jest.useRealTimers();
    for (const notification of store.getState().notifications.items) {
        store.dispatch(dismissNotification(notification.id));
    }
});

it('normalizes recent-item wire kinds before the Redux projection', (): void => {
    expect(
        normalizeRecentItems([
            { path: '/tmp/notes.md', kind: 'file' },
            { path: '/tmp/notes', kind: 'folder' },
            { path: '/tmp/unsupported', kind: 'unknown' },
        ]),
    ).toEqual([
        { path: '/tmp/notes.md', kind: 'file' },
        { path: '/tmp/notes', kind: 'folder' },
    ]);
    expect(normalizeRecentItems(null)).toBeUndefined();
});

it('exposes guarded refresh and clear recent commands', async () => {
    const refreshRecentItems = jest.fn(async () => ({
        recentItems: [{ path: '/tmp/project', kind: 'folder' as const }],
    }));
    const clearRecentItems = jest.fn(async () => ({}));
    const adapter = createAppModelAdapter(
        {
            getState: async () => ({ data: state }),
            refreshRecentItems,
            clearRecentItems,
            updateBuffer: async () => ({}),
            setDocView: async () => ({}),
            setUILayout: async () => ({}),
        },
        { eventsOn: (): (() => void) => (): void => undefined },
    );
    expect(await adapter.refreshRecentItems?.()).toEqual({ recentItems: [{ path: '/tmp/project', kind: 'folder' }] });
    expect(await adapter.clearRecentItems?.()).toEqual({});
    await expect(Reflect.apply(adapter.refreshRecentItems!, undefined, ['extra'])).rejects.toThrow(
        'AppModelHandler.RefreshRecentItems expects 0 argument(s), received 1.',
    );
    await expect(Reflect.apply(adapter.clearRecentItems!, undefined, ['extra'])).rejects.toThrow(
        'AppModelHandler.ClearRecentItems expects 0 argument(s), received 1.',
    );
    expect(refreshRecentItems).toHaveBeenCalledTimes(1);
    expect(clearRecentItems).toHaveBeenCalledTimes(1);
});

it('preserves optional tab and path command forwarding, arity, and order', async () => {
    const commands = {
        revealWorkspacePath: jest.fn((_path: string) => {
            void _path;
            return Promise.resolve({});
        }),
        copyWorkspacePath: jest.fn((_path: string) => {
            void _path;
            return Promise.resolve({});
        }),
        openPreviewLink: jest.fn((_id: string, _href: string) => {
            void _id;
            void _href;
            return Promise.resolve({});
        }),
        activateDocument: jest.fn((_id: string, _revision: number) => {
            void _id;
            void _revision;
            return Promise.resolve({});
        }),
        reorderDocument: jest.fn((_id: string, _index: number, _revision: number) => {
            void _id;
            void _index;
            void _revision;
            return Promise.resolve({});
        }),
        closeDocument: jest.fn((_id: string, _revision: number) => {
            void _id;
            void _revision;
            return Promise.resolve({});
        }),
        copyPath: jest.fn((_id: string) => {
            void _id;
            return Promise.resolve({});
        }),
        revealInFileManager: jest.fn((_id: string) => {
            void _id;
            return Promise.resolve({});
        }),
    };
    const base = {
        getState: async () => ({ data: state }),
        updateBuffer: async () => ({}),
        setDocView: async () => ({}),
        setUILayout: async () => ({}),
    };
    const runtime = { eventsOn: (): (() => void) => (): void => undefined };
    const empty = createAppModelAdapter(base, runtime);
    const adapter = createAppModelAdapter({ ...base, ...commands } as unknown as AppModelBindings, runtime);
    const cases: Array<[keyof typeof commands, unknown[]]> = [
        ['revealWorkspacePath', ['/workspace/file']],
        ['copyWorkspacePath', ['/workspace/file']],
        ['openPreviewLink', ['doc', './file.md']],
        ['activateDocument', ['doc', 2]],
        ['reorderDocument', ['doc', 1, 2]],
        ['closeDocument', ['doc', 2]],
        ['copyPath', ['doc']],
        ['revealInFileManager', ['doc']],
    ];
    expect(Object.keys(adapter).filter((key) => Object.hasOwn(commands, key))).toEqual(cases.map(([key]) => key));
    for (const [key, args] of cases) {
        expect(empty[key]).toBeUndefined();
        const command = adapter[key];
        expect(command).toBeDefined();
        expect(command?.length).toBe(args.length);
        await expect(Reflect.apply(command!, undefined, args)).resolves.toEqual({});
        expect(commands[key]).toHaveBeenCalledWith(...args);
        await expect(Reflect.apply(command!, undefined, [...args, 'extra'])).resolves.toEqual({});
        expect(commands[key]).toHaveBeenCalledTimes(2);
        expect(commands[key]).toHaveBeenLastCalledWith(...args);
    }
});

it('exposes guarded New/Open commands without converting classified outcomes', async () => {
    const newDocument = jest.fn(async (expectedTabSetRevision: number) => {
        void expectedTabSetRevision;
        return { data: { documentId: 'new-doc', content: '', documentRevision: 0 } };
    });
    const openDocument = jest.fn(async (expectedTabSetRevision: number) => {
        void expectedTabSetRevision;
        return { status: 'cancelled' as const };
    });
    const adapter = createAppModelAdapter(
        {
            getState: async (): Promise<{ data: AppModelState }> => ({ data: state }),
            newDocument,
            openDocument,
            updateBuffer: async (_documentId: string, _content: string, baseRevision: number): Promise<VoidResult> => {
                void baseRevision;
                void _documentId;
                void _content;
                return {};
            },
            setDocView: async (_documentId: string, _view: DocViewInput): Promise<VoidResult> => {
                void _documentId;
                void _view;
                return {};
            },
            setUILayout: async (_layout): Promise<VoidResult> => {
                void _layout;
                return {};
            },
        },
        { eventsOn: (): (() => void) => (): void => undefined },
    );

    await expect(adapter.newDocument?.(4)).resolves.toEqual({
        data: { documentId: 'new-doc', content: '', documentRevision: 0 },
    });
    await expect(adapter.openDocument?.(4)).resolves.toEqual({
        status: 'cancelled',
    });
    expect(newDocument).toHaveBeenCalledWith(4);
    expect(openDocument).toHaveBeenCalledWith(4);
});

it('flushes the latest buffer and view queues as one ordered lifecycle drain', async () => {
    const calls: string[] = [];
    const updateBuffer = jest.fn(
        async (documentId: string, content: string, baseRevision: number): Promise<VoidResult> => {
            void baseRevision;
            void documentId;
            calls.push(`buffer:${content}`);
            return {};
        },
    );
    const setDocView = jest.fn(async (documentId: string, view: DocViewInput): Promise<VoidResult> => {
        void documentId;
        void view;
        calls.push('view');
        return {};
    });
    const adapter = createAppModelAdapter(
        {
            getState: async (): Promise<{ data: AppModelState }> => ({ data: state }),
            updateBuffer,
            setDocView,
            setUILayout: async (): Promise<VoidResult> => ({}),
        },
        { eventsOn: (): (() => void) => (): void => undefined },
    );

    await adapter.updateBuffer('document-1', 'latest', 0);
    await adapter.updateDocView('document-1', viewAt(8));
    await adapter.flushActiveSession?.('document-1');

    expect(calls).toEqual(['buffer:latest', 'view']);
    expect(updateBuffer).toHaveBeenCalledWith('document-1', 'latest', 0);
    expect(setDocView).toHaveBeenCalledWith('document-1', viewAt(8));
});

function supersedingBindings(supersededContent: string, currentRevision: number) {
    return jest.fn(
        async (
            documentId: string,
            content: string,
            baseRevision: number,
        ): Promise<VoidResult & { status?: string; documentRevision?: number }> => {
            void documentId;
            return content === supersededContent && baseRevision < currentRevision
                ? { status: 'superseded', documentRevision: currentRevision }
                : { status: 'accepted' };
        },
    );
}

it('keeps a superseded update unacknowledged, reports it with the current revision and refuses the flush', async () => {
    const updateBuffer = supersedingBindings('typed before reload', 9);
    const adapter = createAppModelAdapter(
        {
            getState: async (): Promise<{ data: AppModelState }> => ({ data: state }),
            updateBuffer,
            setDocView: async (): Promise<VoidResult> => ({}),
            setUILayout: async (): Promise<VoidResult> => ({}),
        },
        { eventsOn: (): (() => void) => (): void => undefined },
    );
    const accepted = jest.fn();
    const superseded = jest.fn();
    adapter.subscribeAcceptedBuffers(accepted);
    adapter.subscribeSupersededBuffers(superseded);

    await adapter.updateBuffer('document-1', 'typed before reload', 4);
    const failure: unknown = await adapter.flushBuffer('document-1').catch((error: unknown) => error);

    expect(isBufferSyncError(failure)).toBe(true);
    expect(updateBuffer).toHaveBeenCalledWith('document-1', 'typed before reload', 4);
    expect(accepted).not.toHaveBeenCalled();
    expect(superseded).toHaveBeenCalledWith({
        documentId: 'document-1',
        content: 'typed before reload',
        baseRevision: 4,
        currentRevision: 9,
    });
    expect(adapter.getPendingBufferDocumentIds()).toEqual(['document-1']);
});

it('acknowledges the superseded text once it is resent on the current revision', async () => {
    const updateBuffer = supersedingBindings('kept text', 9);
    const adapter = createAppModelAdapter(
        {
            getState: async (): Promise<{ data: AppModelState }> => ({ data: state }),
            updateBuffer,
            setDocView: async (): Promise<VoidResult> => ({}),
            setUILayout: async (): Promise<VoidResult> => ({}),
        },
        { eventsOn: (): (() => void) => (): void => undefined },
    );
    const accepted = jest.fn();
    adapter.subscribeAcceptedBuffers(accepted);
    adapter.subscribeSupersededBuffers((buffer): void => {
        void adapter.updateBuffer(buffer.documentId, buffer.content, buffer.currentRevision);
    });

    await adapter.updateBuffer('document-1', 'kept text', 4);
    await expect(adapter.flushBuffer('document-1')).resolves.toBeUndefined();

    expect(updateBuffer).toHaveBeenLastCalledWith('document-1', 'kept text', 9);
    expect(accepted).toHaveBeenCalledWith({ documentId: 'document-1', content: 'kept text', generation: 2 });
    expect(adapter.getPendingBufferDocumentIds()).toEqual([]);
});

it('forgets a superseded update when its editor session ends', async () => {
    const adapter = createAppModelAdapter(
        {
            getState: async (): Promise<{ data: AppModelState }> => ({ data: state }),
            updateBuffer: supersedingBindings('typed before reload', 9),
            setDocView: async (): Promise<VoidResult> => ({}),
            setUILayout: async (): Promise<VoidResult> => ({}),
        },
        { eventsOn: (): (() => void) => (): void => undefined },
    );

    await adapter.updateBuffer('document-1', 'typed before reload', 4);
    await adapter.flushBuffer('document-1').catch((): void => undefined);
    adapter.cancelPendingSession?.('document-1');

    expect(adapter.getPendingBufferDocumentIds()).toEqual([]);
    await expect(adapter.flushBuffer('document-1')).resolves.toBeUndefined();
});

it('ignores a superseded response that arrives after its editor session ended', async () => {
    let resolveUpdate: (result: VoidResult & { status?: string; documentRevision?: number }) => void = () => undefined;
    const adapter = createAppModelAdapter(
        {
            getState: async (): Promise<{ data: AppModelState }> => ({ data: state }),
            updateBuffer: (documentId: string, content: string, baseRevision: number) =>
                new Promise((resolve): void => {
                    void [documentId, content, baseRevision];
                    resolveUpdate = resolve;
                }),
            setDocView: async (): Promise<VoidResult> => ({}),
            setUILayout: async (): Promise<VoidResult> => ({}),
        },
        { eventsOn: (): (() => void) => (): void => undefined },
    );

    await adapter.updateBuffer('document-1', 'typed before reload', 4);
    const firstFlush = adapter.flushBuffer('document-1').catch((): void => undefined);
    await Promise.resolve();
    adapter.cancelPendingSession?.('document-1');
    resolveUpdate({ status: 'superseded', documentRevision: 9 });
    await firstFlush;

    await expect(adapter.flushBuffer('document-1')).resolves.toBeUndefined();
    expect(adapter.getPendingBufferDocumentIds()).toEqual([]);
});

it('routes imperative flush through the registered activation session', async () => {
    const flushActiveSession = jest.fn(async (): Promise<void> => undefined);
    const adapter = createAppModelAdapter(
        {
            getState: async (): Promise<{ data: AppModelState }> => ({ data: state }),
            updateBuffer: async (_documentId: string, _content: string, baseRevision: number): Promise<VoidResult> => {
                void baseRevision;
                void _documentId;
                void _content;
                return {};
            },
            setDocView: async (_documentId: string, _view: DocViewInput): Promise<VoidResult> => {
                void _documentId;
                void _view;
                return {};
            },
            setUILayout: async (_layout): Promise<VoidResult> => {
                void _layout;
                return {};
            },
        },
        { eventsOn: (): (() => void) => (): void => undefined },
    );
    const activationToken = Symbol('registered-activation');
    const dispose = adapter.registerActiveSession?.({
        documentId: 'document-1',
        activationToken,
        flushActiveSession,
    });

    await adapter.flushActiveSession?.('document-1', activationToken);
    expect(flushActiveSession).toHaveBeenCalledTimes(1);
    await expect(adapter.flushActiveSession?.('document-1', Symbol('stale-activation'))).rejects.toThrow(
        'activation changed',
    );

    dispose?.();
    await adapter.updateBuffer('document-1', 'fallback queue', 0);
    await adapter.flushActiveSession?.('document-1');
});

it('failed outgoing flush keeps the current session installed', async () => {
    const failure = new Error('outgoing flush failed');
    const flushActiveSession = jest
        .fn<Promise<void>, []>()
        .mockRejectedValueOnce(failure)
        .mockResolvedValueOnce(undefined);
    const adapter = createAppModelAdapter(
        {
            getState: async (): Promise<{ data: AppModelState }> => ({ data: state }),
            updateBuffer: async (): Promise<VoidResult> => ({}),
            setDocView: async (): Promise<VoidResult> => ({}),
            setUILayout: async (): Promise<VoidResult> => ({}),
        },
        { eventsOn: (): (() => void) => (): void => undefined },
    );
    const activationToken = Symbol('outgoing-activation');
    adapter.registerActiveSession?.({
        documentId: 'document-1',
        activationToken,
        flushActiveSession,
    });

    await expect(adapter.flushActiveSession?.('document-1', activationToken)).rejects.toBe(failure);
    await adapter.flushActiveSession?.('document-1', activationToken);
    expect(flushActiveSession).toHaveBeenCalledTimes(2);
});

it('ignores a stale activation flush after a newer document owns the session', async () => {
    const updateBuffer = jest.fn<Promise<VoidResult>, [string, string, number]>(async (): Promise<VoidResult> => ({}));
    const adapter = createAppModelAdapter(
        {
            getState: async (): Promise<{ data: AppModelState }> => ({ data: state }),
            updateBuffer,
            setDocView: async (): Promise<VoidResult> => ({}),
            setUILayout: async (): Promise<VoidResult> => ({}),
        },
        { eventsOn: (): (() => void) => (): void => undefined },
    );
    const oldActivation = Symbol('old-activation');
    adapter.registerActiveSession?.({
        documentId: 'document-1',
        activationToken: oldActivation,
        flushActiveSession: async (): Promise<void> => undefined,
    });
    await adapter.updateBuffer('document-1', 'stale content', 0);
    adapter.registerActiveSession?.({
        documentId: 'document-2',
        activationToken: Symbol('new-activation'),
        flushActiveSession: async (): Promise<void> => undefined,
    });

    await adapter.flushActiveSession?.('document-1', oldActivation);

    expect(updateBuffer).not.toHaveBeenCalled();
});

it('aborts the lifecycle drain before the view queue when content acceptance fails', async () => {
    const setDocView = jest.fn(async (documentId: string, view: DocViewInput): Promise<VoidResult> => {
        void documentId;
        void view;
        return { error: { code: 'io' } as WireError };
    });
    const adapter = createAppModelAdapter(
        {
            getState: async (): Promise<{ data: AppModelState }> => ({ data: state }),
            updateBuffer: async (documentId: string, content: string, baseRevision: number): Promise<VoidResult> => {
                void baseRevision;
                void documentId;
                void content;
                return {
                    error: {
                        code: 'io',
                        title: 'Buffer failed',
                        message: 'Buffer failed',
                        retryable: true,
                    },
                };
            },
            setDocView,
            setUILayout: async (): Promise<VoidResult> => ({}),
        },
        { eventsOn: (): (() => void) => (): void => undefined },
    );

    await adapter.updateBuffer('document-1', 'latest', 0);
    await adapter.updateDocView('document-1', viewAt(9));

    await expect(adapter.flushActiveSession?.('document-1')).rejects.toMatchObject({
        code: 'io',
    });
    expect(setDocView).not.toHaveBeenCalled();
});

it('committed result rehydrates without duplicate Save', async (): Promise<void> => {
    const getState = jest.fn(async (): Promise<{ data: AppModelState }> => ({
        data: state,
    }));
    const adapter = createAppModelAdapter(
        {
            getState,
            updateBuffer: async (): Promise<VoidResult> => ({}),
            setDocView: async (): Promise<VoidResult> => ({}),
            setUILayout: async (): Promise<VoidResult> => ({}),
        },
        { eventsOn: (): (() => void) => (): void => undefined },
    );

    await expect(
        adapter.reconcileCommittedWrite({
            documentId: 'document-1',
            writtenContentRevision: 3,
            committedProjectionRevision: 9,
            targetPathAdopted: false,
            lineEndingOutcome: 'preserved-lf',
            bomOutcome: 'absent',
            resyncRequired: true,
        }),
    ).resolves.toMatchObject({ snapshot: { revision: 1 } });
    expect(getState).toHaveBeenCalledTimes(1);
});

it('blocks later lifecycle work through bounded recovery and exposes saved-on-disk exhaustion', async (): Promise<void> => {
    jest.useFakeTimers();
    const getState = jest.fn(async (): Promise<{ data: AppModelState }> => {
        throw new Error('projection unavailable');
    });
    const newDocument = jest.fn((revision: number) => {
        void revision;
        return Promise.resolve({ data: { documentId: 'new-doc', content: '', documentRevision: 0 } });
    });
    const openDocument = jest.fn((revision: number) => {
        void revision;
        return Promise.resolve({ status: 'cancelled' as const });
    });
    const openWorkspace = jest.fn((path: string): Promise<WorkspaceResult> => {
        void path;
        return Promise.resolve({ status: 'unchanged' });
    });
    const copyPath = jest.fn((documentId: string) => {
        void documentId;
        return Promise.resolve({ status: 'copied' as const });
    });
    const adapter = createAppModelAdapter(
        {
            getState,
            newDocument,
            openDocument,
            openWorkspace,
            copyPath,
            updateBuffer: async (): Promise<VoidResult> => ({}),
            setDocView: async (): Promise<VoidResult> => ({}),
            setUILayout: async (): Promise<VoidResult> => ({}),
        },
        { eventsOn: (): (() => void) => (): void => undefined },
    );

    const recovery = adapter.reconcileCommittedWrite({
        documentId: 'document-1',
        writtenContentRevision: 3,
        committedProjectionRevision: 9,
        targetPathAdopted: false,
        lineEndingOutcome: 'preserved-lf',
        bomOutcome: 'absent',
        resyncRequired: true,
    });
    expect(getState).toHaveBeenCalledTimes(1);
    await expect(adapter.newDocument!(1)).rejects.toThrow();
    await expect(adapter.openWorkspace!('/tmp/project')).rejects.toThrow();
    await expect(adapter.copyPath!('document-1')).rejects.toThrow();
    expect(newDocument).not.toHaveBeenCalled();
    expect(openWorkspace).not.toHaveBeenCalled();
    expect(copyPath).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(250);
    await jest.advanceTimersByTimeAsync(1000);
    await expect(recovery).resolves.toMatchObject({
        persistent: true,
        savedOnDisk: true,
        commandsBlocked: true,
    });
    expect(getState).toHaveBeenCalledTimes(3);
    await expect(adapter.updateBuffer('document-1', 'blocked', 0)).rejects.toThrow('editor-state recovery failed');
    await expect(adapter.newDocument!(1)).rejects.toThrow('editor-state recovery failed');
    await expect(adapter.openWorkspace!('/tmp/project')).rejects.toThrow('editor-state recovery failed');
    await expect(adapter.copyPath!('document-1')).rejects.toThrow('editor-state recovery failed');
    expect(newDocument).not.toHaveBeenCalled();
    expect(openWorkspace).not.toHaveBeenCalled();
    expect(copyPath).not.toHaveBeenCalled();

    getState.mockResolvedValue({ data: state });
    await expect(
        adapter.reconcileCommittedWrite({
            documentId: 'document-1',
            writtenContentRevision: 3,
            committedProjectionRevision: 9,
            targetPathAdopted: false,
            lineEndingOutcome: 'preserved-lf',
            bomOutcome: 'absent',
            resyncRequired: true,
        }),
    ).resolves.toMatchObject({ snapshot: { revision: 1 } });
    await expect(adapter.updateBuffer('document-1', 'retry-unblocked', 0)).resolves.toBeUndefined();
});

it('coalesces edits in the adapter-owned timer', async () => {
    jest.useFakeTimers();
    const updateBuffer = jest.fn<Promise<VoidResult>, [string, string, number]>(
        async (documentId: string, content: string, baseRevision: number): Promise<VoidResult> => {
            void baseRevision;
            void documentId;
            void content;
            return {};
        },
    );
    const adapter = createAppModelAdapter(
        {
            getState: async (): Promise<{ data: AppModelState }> => ({ data: state }),
            updateBuffer,
            setDocView: async (): Promise<VoidResult> => ({}),
            setUILayout: async (): Promise<VoidResult> => ({}),
        },
        { eventsOn: (): (() => void) => (): void => undefined },
    );

    void adapter.updateBuffer('document-1', 'first', 0);
    void adapter.updateBuffer('document-1', 'latest', 0);

    expect(updateBuffer).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(49);
    expect(updateBuffer).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);

    expect(updateBuffer).toHaveBeenCalledTimes(1);
    expect(updateBuffer).toHaveBeenCalledWith('document-1', 'latest', 0);
});

it('keeps a newer view command from being overwritten by stale cursor synchronization', async () => {
    jest.useFakeTimers();
    const setDocView = jest.fn<Promise<VoidResult>, [string, DocViewInput]>(
        async (documentId: string, view: DocViewInput): Promise<VoidResult> => {
            void documentId;
            void view;
            return {};
        },
    );
    const adapter = createAppModelAdapter(
        {
            getState: async (): Promise<{ data: AppModelState }> => ({ data: state }),
            updateBuffer: async (): Promise<VoidResult> => ({}),
            setDocView,
            setUILayout: async (): Promise<VoidResult> => ({}),
        },
        { eventsOn: (): (() => void) => (): void => undefined },
    );
    const staleCursorView: DocViewInput = {
        editorVisible: true,
        previewVisible: false,
        cursor: { line: 4, column: 2 },
        selection: {
            start: { line: 4, column: 1 },
            end: { line: 4, column: 2 },
        },
        scroll: { editor: 0, preview: 0 },
    };
    const previewView: DocViewInput = {
        ...staleCursorView,
        editorVisible: false,
        previewVisible: true,
    };

    await adapter.updateDocView('document-1', staleCursorView);
    await adapter.setDocView('document-1', previewView);
    await jest.advanceTimersByTimeAsync(VIEW_SYNC_MS);

    expect(setDocView).toHaveBeenCalledTimes(1);
    expect(setDocView).toHaveBeenCalledWith('document-1', previewView);
});

it('serializes every document view intent while documents remain independent', async () => {
    jest.useFakeTimers();
    const firstDocumentCursor = deferred<VoidResult>();
    const secondDocumentCursor = deferred<VoidResult>();
    const arrangement = deferred<VoidResult>();
    const calls: Array<{ documentId: string; view: DocViewInput }> = [];
    let firstDocumentActive = 0;
    let maximumFirstDocumentActive = 0;
    const setDocView = jest.fn<Promise<VoidResult>, [string, DocViewInput]>(
        (documentId: string, view: DocViewInput): Promise<VoidResult> => {
            calls.push({ documentId, view });
            if (documentId === 'document-1') {
                firstDocumentActive += 1;
                maximumFirstDocumentActive = Math.max(maximumFirstDocumentActive, firstDocumentActive);
                const request = calls.filter((call): boolean => call.documentId === 'document-1').length;
                const response = request === 1 ? firstDocumentCursor : arrangement;
                return response.promise.finally((): void => {
                    firstDocumentActive -= 1;
                });
            }
            return secondDocumentCursor.promise;
        },
    );
    const adapter = createAppModelAdapter(
        {
            getState: async (): Promise<{ data: AppModelState }> => ({ data: state }),
            updateBuffer: async (): Promise<VoidResult> => ({}),
            setDocView,
            setUILayout: async (): Promise<VoidResult> => ({}),
        },
        { eventsOn: (): (() => void) => (): void => undefined },
    );
    const cursorView = viewAt(3);
    const arrangementView = viewAt(3, true);

    await adapter.updateDocView('document-1', cursorView);
    await jest.advanceTimersByTimeAsync(VIEW_SYNC_MS);
    const arrangementCommand = adapter.setDocView('document-1', arrangementView);
    await adapter.updateDocView('document-2', viewAt(8));
    await jest.advanceTimersByTimeAsync(VIEW_SYNC_MS);
    const flush = adapter.flushDocView('document-1');

    expect(calls).toEqual([
        { documentId: 'document-1', view: cursorView },
        { documentId: 'document-2', view: viewAt(8) },
    ]);
    expect(maximumFirstDocumentActive).toBe(1);

    secondDocumentCursor.resolve({});
    firstDocumentCursor.resolve({});
    await jest.advanceTimersByTimeAsync(0);
    expect(calls).toEqual([
        { documentId: 'document-1', view: cursorView },
        { documentId: 'document-2', view: viewAt(8) },
        { documentId: 'document-1', view: arrangementView },
    ]);
    arrangement.resolve({});
    await arrangementCommand;
    await flush;

    expect(maximumFirstDocumentActive).toBe(1);
});

it('serializes both attempted resolver orders around newer explicit intent', async () => {
    jest.useFakeTimers();

    for (const resolveNewerFirst of [true, false]) {
        const older = deferred<VoidResult>();
        const newer = deferred<VoidResult>();
        const calls: DocViewInput[] = [];
        const setDocView = jest.fn<Promise<VoidResult>, [string, DocViewInput]>(
            (_documentId, view): Promise<VoidResult> => {
                calls.push(view);
                return calls.length === 1 ? older.promise : newer.promise;
            },
        );
        const adapter = createAppModelAdapter(
            {
                getState: async (): Promise<{ data: AppModelState }> => ({
                    data: state,
                }),
                updateBuffer: async (): Promise<VoidResult> => ({}),
                setDocView,
                setUILayout: async (): Promise<VoidResult> => ({}),
            },
            { eventsOn: (): (() => void) => (): void => undefined },
        );
        const olderView = viewAt(1);
        const newerView = viewAt(2, true);

        await adapter.updateDocView('document-1', olderView);
        await jest.advanceTimersByTimeAsync(VIEW_SYNC_MS);
        const newerCommand = adapter.setDocView('document-1', newerView);

        if (resolveNewerFirst) {
            newer.resolve({});
            expect(calls).toEqual([olderView]);
            older.resolve({});
        } else {
            older.resolve({});
            await jest.advanceTimersByTimeAsync(0);
            expect(calls).toEqual([olderView, newerView]);
            newer.resolve({});
        }

        await newerCommand;
        expect(calls).toEqual([olderView, newerView]);
    }
});

it('replaces unsent view intent with the latest immutable snapshot', async () => {
    jest.useFakeTimers();
    const setDocView = jest.fn<Promise<VoidResult>, [string, DocViewInput]>(
        async (documentId: string, view: DocViewInput): Promise<VoidResult> => {
            void documentId;
            void view;
            return {};
        },
    );
    const adapter = createAppModelAdapter(
        {
            getState: async (): Promise<{ data: AppModelState }> => ({ data: state }),
            updateBuffer: async (): Promise<VoidResult> => ({}),
            setDocView,
            setUILayout: async (): Promise<VoidResult> => ({}),
        },
        { eventsOn: (): (() => void) => (): void => undefined },
    );
    const latest = viewAt(3, true);

    await adapter.updateDocView('document-1', viewAt(1));
    await adapter.updateDocView('document-1', viewAt(2));
    await adapter.updateDocView('document-1', latest);
    latest.cursor.line = 99;
    await jest.advanceTimersByTimeAsync(199);
    expect(setDocView).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);

    expect(setDocView).toHaveBeenCalledTimes(1);
    expect(setDocView).toHaveBeenCalledWith('document-1', viewAt(3, true));
});

it('flushes the latest document view intent after an in-flight request', async () => {
    jest.useFakeTimers();
    const older = deferred<VoidResult>();
    const newest = deferred<VoidResult>();
    const calls: DocViewInput[] = [];
    const setDocView = jest.fn<Promise<VoidResult>, [string, DocViewInput]>(
        (_documentId, view): Promise<VoidResult> => {
            calls.push(view);
            return calls.length === 1 ? older.promise : newest.promise;
        },
    );
    const adapter = createAppModelAdapter(
        {
            getState: async (): Promise<{ data: AppModelState }> => ({ data: state }),
            updateBuffer: async (): Promise<VoidResult> => ({}),
            setDocView,
            setUILayout: async (): Promise<VoidResult> => ({}),
        },
        { eventsOn: (): (() => void) => (): void => undefined },
    );
    const olderView = viewAt(1);
    const newestView = viewAt(2, true);

    await adapter.updateDocView('document-1', olderView);
    await jest.advanceTimersByTimeAsync(VIEW_SYNC_MS);
    await adapter.updateDocView('document-1', newestView);
    const flush = adapter.flushDocView('document-1');
    let flushed = false;
    void flush.then((): void => {
        flushed = true;
    });

    await Promise.resolve();
    expect(flushed).toBe(false);
    expect(calls).toEqual([olderView]);
    older.resolve({});
    await jest.advanceTimersByTimeAsync(0);
    expect(calls).toEqual([olderView, newestView]);
    expect(flushed).toBe(false);
    newest.resolve({});
    await expect(flush).resolves.toBeUndefined();
    expect(calls).toEqual([olderView, newestView]);
});

it('retains newest unsent intent after failure and reports the existing toast', async () => {
    jest.useFakeTimers();
    const wireError = {
        code: 'internal',
        title: 'View unavailable',
        message: 'The older view request failed.',
        retryable: true,
    } satisfies WireError;
    const older = deferred<VoidResult>();
    const newest = deferred<VoidResult>();
    const calls: DocViewInput[] = [];
    const setDocView = jest.fn<Promise<VoidResult>, [string, DocViewInput]>(
        (_documentId, view): Promise<VoidResult> => {
            calls.push(view);
            return calls.length === 1 ? older.promise : newest.promise;
        },
    );
    const adapter = createAppModelAdapter(
        {
            getState: async (): Promise<{ data: AppModelState }> => ({ data: state }),
            updateBuffer: async (): Promise<VoidResult> => ({}),
            setDocView,
            setUILayout: async (): Promise<VoidResult> => ({}),
        },
        { eventsOn: (): (() => void) => (): void => undefined },
    );
    const olderView = viewAt(1);
    const newestView = viewAt(2, true);

    await adapter.updateDocView('document-1', olderView);
    await jest.advanceTimersByTimeAsync(VIEW_SYNC_MS);
    const newerCommand = adapter.setDocView('document-1', newestView);
    older.resolve({ error: wireError });

    await expect(newerCommand).rejects.toBe(wireError);
    expect(store.getState().notifications.items).toEqual(
        expect.arrayContaining([expect.objectContaining({ error: wireError })]),
    );
    const retry = adapter.flushDocView('document-1');
    expect(calls).toEqual([olderView, newestView]);
    newest.resolve({});
    await expect(retry).resolves.toBeUndefined();
    expect(calls).toEqual([olderView, newestView]);
});

it('preserves adapter signatures and command-to-patch ownership', async () => {
    const setDocView = jest.fn<Promise<VoidResult>, [string, DocViewInput]>(
        async (documentId: string, view: DocViewInput): Promise<VoidResult> => {
            void documentId;
            void view;
            return {};
        },
    );
    const adapter: AppModelAdapter = createAppModelAdapter(
        {
            getState: async (): Promise<{ data: AppModelState }> => ({ data: state }),
            updateBuffer: async (): Promise<VoidResult> => ({}),
            setDocView,
            setUILayout: async (): Promise<VoidResult> => ({}),
        },
        { eventsOn: (): (() => void) => (): void => undefined },
    );
    const beforeCommands = store.getState();

    await adapter.updateDocView('document-1', viewAt(1));
    await adapter.setDocView('document-1', viewAt(2, true));
    await adapter.flushDocView('document-1');

    expect(adapter.setDocView).toEqual(expect.any(Function));
    expect(adapter.updateDocView).toEqual(expect.any(Function));
    expect(adapter.flushDocView).toEqual(expect.any(Function));
    expect(setDocView).toHaveBeenCalledWith('document-1', viewAt(2, true));
    expect(store.getState()).toBe(beforeCommands);
});

it('merges a partial arrangement with the newest cursor, selection, and editor and preview scroll', async () => {
    jest.useFakeTimers();
    const setDocView = jest.fn<Promise<VoidResult>, [string, DocViewInput]>(
        async (documentId: string, view: DocViewInput): Promise<VoidResult> => {
            void documentId;
            void view;

            return {};
        },
    );
    const adapter = createAppModelAdapter(
        {
            getState: async (): Promise<{ data: AppModelState }> => ({ data: state }),
            updateBuffer: async (): Promise<VoidResult> => ({}),
            setDocView,
            setUILayout: async (): Promise<VoidResult> => ({}),
        },
        { eventsOn: (): (() => void) => (): void => undefined },
    );
    const newest = {
        editorVisible: true,
        previewVisible: false,
        cursor: { line: 19, column: 7 },
        selection: {
            start: { line: 18, column: 2 },
            end: { line: 19, column: 7 },
        },
        scroll: { editor: 480, preview: 960 },
    } satisfies DocViewInput;

    await adapter.updateLocalDocView('document-1', newest);
    await adapter.setDocView('document-1', { editorVisible: false, previewVisible: true }, viewAt(1));

    expect(setDocView).toHaveBeenCalledTimes(1);
    expect(setDocView).toHaveBeenCalledWith('document-1', {
        ...newest,
        editorVisible: false,
        previewVisible: true,
    });
});

it('commits a split ratio with the latest cursor, selection, scroll, and pane visibility', async () => {
    const setDocView = jest.fn<Promise<VoidResult>, [string, DocViewInput]>((documentId, view) => {
        void documentId;
        void view;
        return Promise.resolve({});
    });
    const adapter = createAppModelAdapter(
        {
            getState: async (): Promise<{ data: AppModelState }> => ({ data: state }),
            updateBuffer: async (): Promise<VoidResult> => ({}),
            setDocView,
            setUILayout: async (): Promise<VoidResult> => ({}),
        },
        { eventsOn: (): (() => void) => (): void => undefined },
    );
    const fallback = viewAt(1);
    const latest = {
        ...viewAt(19, true),
        splitRatio: 0.4,
        selection: { start: { line: 18, column: 2 }, end: { line: 19, column: 7 } },
        scroll: { editor: 480, preview: 960 },
    } satisfies DocViewInput;

    await adapter.updateLocalDocView('document-1', latest);
    await adapter.setDocView('document-1', { splitRatio: 0.7 }, fallback);

    expect(setDocView).toHaveBeenCalledTimes(1);
    expect(setDocView).toHaveBeenCalledWith('document-1', { ...latest, splitRatio: 0.7 });
});

it('omits a committed split ratio from a later cursor-only view packet', async () => {
    jest.useFakeTimers();
    const setDocView = jest.fn<Promise<VoidResult>, [string, DocViewInput]>((documentId, view) => {
        void documentId;
        void view;
        return Promise.resolve({});
    });
    const adapter = createAppModelAdapter(
        {
            getState: async (): Promise<{ data: AppModelState }> => ({ data: state }),
            updateBuffer: async (): Promise<VoidResult> => ({}),
            setDocView,
            setUILayout: async (): Promise<VoidResult> => ({}),
        },
        { eventsOn: (): (() => void) => (): void => undefined },
    );
    const staleView = { ...viewAt(7), splitRatio: 0.5 };

    await adapter.setDocView('document-1', { splitRatio: 0.76 }, staleView);
    await adapter.updateLocalDocView('document-1', { ...staleView, cursor: { line: 8, column: 3 } });
    await adapter.flushDocView('document-1');

    expect(setDocView).toHaveBeenNthCalledWith(
        2,
        'document-1',
        expect.objectContaining({ cursor: { line: 8, column: 3 } }),
    );
    expect(setDocView.mock.calls[1]?.[1]).not.toHaveProperty('splitRatio');
});

it('persists a queued ratio change when a cursor update coalesces behind an in-flight view', async () => {
    const older = deferred<VoidResult>();
    const calls: DocViewInput[] = [];
    const setDocView = jest.fn<Promise<VoidResult>, [string, DocViewInput]>(
        async (_documentId, view): Promise<VoidResult> => {
            calls.push(view);
            return calls.length === 1 ? older.promise : {};
        },
    );
    const adapter = createAppModelAdapter(
        {
            getState: async (): Promise<{ data: AppModelState }> => ({ data: state }),
            updateBuffer: async (): Promise<VoidResult> => ({}),
            setDocView,
            setUILayout: async (): Promise<VoidResult> => ({}),
        },
        { eventsOn: (): (() => void) => (): void => undefined },
    );
    const staleView = { ...viewAt(3), splitRatio: 0.5 };

    const olderCommand = adapter.setDocView('document-1', staleView);
    const ratioCommand = adapter.setDocView('document-1', { splitRatio: 0.72 }, staleView);
    await adapter.updateLocalDocView('document-1', { ...staleView, cursor: { line: 8, column: 2 } });
    expect(calls).toHaveLength(1);

    older.resolve({});
    await olderCommand;
    await ratioCommand;

    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual({ ...staleView, cursor: { line: 8, column: 2 }, splitRatio: 0.72 });
});

it('omits a stale split ratio from a lifecycle view flush after a resize', async () => {
    const setDocView = jest.fn<Promise<VoidResult>, [string, DocViewInput]>((documentId, view) => {
        void documentId;
        void view;
        return Promise.resolve({});
    });
    const adapter = createAppModelAdapter(
        {
            getState: async (): Promise<{ data: AppModelState }> => ({ data: state }),
            updateBuffer: async (): Promise<VoidResult> => ({}),
            setDocView,
            setUILayout: async (): Promise<VoidResult> => ({}),
        },
        { eventsOn: (): (() => void) => (): void => undefined },
    );
    const staleView = { ...viewAt(3), splitRatio: 0.5 };

    await adapter.setDocView('document-1', { splitRatio: 0.7 }, staleView);
    await adapter.updateDocView('document-1', { ...staleView, scroll: { editor: 170, preview: 420 } });
    await adapter.flushDocView('document-1');

    expect(setDocView).toHaveBeenNthCalledWith(
        2,
        'document-1',
        expect.objectContaining({ scroll: { editor: 170, preview: 420 } }),
    );
    expect(setDocView.mock.calls[1]?.[1]).not.toHaveProperty('splitRatio');
});

it('keeps split ratios independent when views for two documents are queued', async () => {
    jest.useFakeTimers();
    const setDocView = jest.fn<Promise<VoidResult>, [string, DocViewInput]>((documentId, view) => {
        void documentId;
        void view;
        return Promise.resolve({});
    });
    const adapter = createAppModelAdapter(
        {
            getState: async (): Promise<{ data: AppModelState }> => ({ data: state }),
            updateBuffer: async (): Promise<VoidResult> => ({}),
            setDocView,
            setUILayout: async (): Promise<VoidResult> => ({}),
        },
        { eventsOn: (): (() => void) => (): void => undefined },
    );

    await adapter.setDocView('document-1', { splitRatio: 0.25 }, viewAt(1));
    await adapter.setDocView('document-2', { splitRatio: 0.75 }, viewAt(2));
    await adapter.setDocView('document-1', { editorVisible: false, previewVisible: true }, viewAt(1));
    await adapter.setDocView('document-2', { editorVisible: false, previewVisible: true }, viewAt(2));

    expect(setDocView).toHaveBeenNthCalledWith(1, 'document-1', {
        ...viewAt(1),
        splitRatio: 0.25,
    });
    expect(setDocView).toHaveBeenNthCalledWith(2, 'document-2', {
        ...viewAt(2),
        splitRatio: 0.75,
    });
    expect(setDocView).toHaveBeenNthCalledWith(3, 'document-1', {
        ...viewAt(1),
        editorVisible: false,
        previewVisible: true,
    });
    expect(setDocView).toHaveBeenNthCalledWith(4, 'document-2', {
        ...viewAt(2),
        editorVisible: false,
        previewVisible: true,
    });
});

it('retries the newest failed arrangement intent with current fields while stale completion cannot replace it', async () => {
    jest.useFakeTimers();
    const failed = {
        code: 'internal',
        title: 'View unavailable',
        message: 'The newest arrangement failed.',
        retryable: true,
    } satisfies WireError;
    const stale = deferred<VoidResult>();
    const calls: DocViewInput[] = [];
    const setDocView = jest.fn<Promise<VoidResult>, [string, DocViewInput]>(
        (_documentId, view): Promise<VoidResult> => {
            calls.push(view);
            if (calls.length === 1) {
                return Promise.resolve({ error: failed });
            }
            return stale.promise;
        },
    );
    const adapter = createAppModelAdapter(
        {
            getState: async (): Promise<{ data: AppModelState }> => ({ data: state }),
            updateBuffer: async (): Promise<VoidResult> => ({}),
            setDocView,
            setUILayout: async (): Promise<VoidResult> => ({}),
        },
        { eventsOn: (): (() => void) => (): void => undefined },
    );
    const failedIntent = viewAt(3, true);
    const current = {
        ...viewAt(27),
        selection: {
            start: { line: 25, column: 3 },
            end: { line: 27, column: 8 },
        },
        scroll: { editor: 720, preview: 1440 },
    } satisfies DocViewInput;

    await expect(adapter.setDocView('document-1', failedIntent)).rejects.toBe(failed);
    await adapter.updateLocalDocView('document-1', current);
    const retry = adapter.setDocView('document-1', { editorVisible: false, previewVisible: true }, failedIntent);

    expect(calls).toEqual([failedIntent, { ...current, editorVisible: false, previewVisible: true }]);
    stale.resolve({});
    await expect(retry).resolves.toBeUndefined();
    expect(calls).toHaveLength(2);
});

it('wraps app-model commands without optimistic state', async () => {
    const calls: string[] = [];
    const bindings: AppModelBindings = {
        getState(): Promise<{ data?: AppModelState }> {
            calls.push('get-state');
            return Promise.resolve({ data: state });
        },
        updateBuffer(documentId, content, baseRevision) {
            void baseRevision;
            calls.push(`buffer:${documentId}:${content}`);
            return Promise.resolve({ error: undefined });
        },
        setDocView(documentId, view) {
            void view;
            calls.push(`view:${documentId}`);
            return Promise.resolve({ error: undefined });
        },
        setUILayout(layout) {
            void layout;
            calls.push('layout');
            return Promise.resolve({ error: undefined });
        },
    };
    const eventsOn = jest.fn<() => void, [string, (payload: unknown) => void]>((): (() => void) => jest.fn());
    const runtime: AppModelRuntime = { eventsOn };
    const adapter = createAppModelAdapter(bindings, runtime);
    const beforeCommand = store.getState();

    await expect(adapter.getState()).resolves.toBe(state);
    await expect(adapter.updateBuffer('document-1', 'draft', 0)).resolves.toBeUndefined();
    await expect(adapter.flushBuffer('document-1')).resolves.toBeUndefined();
    await expect(
        adapter.setDocView('document-1', {
            editorVisible: true,
            previewVisible: false,
            cursor: { line: 1, column: 1 },
            selection: {
                start: { line: 1, column: 1 },
                end: { line: 1, column: 1 },
            },
            scroll: { editor: 0, preview: 0 },
        }),
    ).resolves.toBeUndefined();
    await expect(adapter.setUILayout({ sidebarVisible: false })).resolves.toBeUndefined();

    expect(calls).toEqual(['get-state', 'buffer:document-1:draft', 'view:document-1', 'layout']);
    expect(store.getState()).toBe(beforeCommand);
    expect(eventsOn).not.toHaveBeenCalled();

    const mismatchedAdapter = createAppModelAdapter(
        {
            ...bindings,
            updateBuffer: ((documentId: string) => {
                calls.push(`mismatched-buffer:${documentId}`);
                return Promise.resolve({ error: undefined });
            }) as unknown as AppModelBindings['updateBuffer'],
        },
        runtime,
    );
    await mismatchedAdapter.updateBuffer('document-1', 'draft', 0);
    await expect(mismatchedAdapter.flushBuffer('document-1')).rejects.toMatchObject({
        code: 'internal',
        message: 'AppModelHandler.UpdateBuffer expects 1 argument(s), received 3.',
        retryable: true,
    });

    const wireError = {
        code: 'validation',
        title: 'Invalid layout',
        message: 'The backend rejected the layout.',
        retryable: false,
    } satisfies WireError;
    const rejectingAdapter = createAppModelAdapter(
        {
            ...bindings,
            setUILayout: async (layout) => {
                void layout;
                return { error: wireError };
            },
        },
        runtime,
    );
    await expect(rejectingAdapter.setUILayout({})).rejects.toBe(wireError);
    expect(store.getState().notifications.items).toEqual(
        expect.arrayContaining([expect.objectContaining({ error: wireError })]),
    );
});

it('fans out state patches with independent disposal', () => {
    let eventCallback: ((payload: unknown) => void) | undefined;
    const unsubscribe = jest.fn();
    const runtime: AppModelRuntime = {
        eventsOn(_eventName, callback): () => void {
            eventCallback = callback;
            return (): void => {
                unsubscribe();
                eventCallback = undefined;
            };
        },
    };
    const bindings: AppModelBindings = {
        getState: async () => ({ data: state }),
        updateBuffer: async () => ({}),
        setDocView: async () => ({}),
        setUILayout: async () => ({}),
    };
    const adapter = createAppModelAdapter(bindings, runtime);
    const firstPatchHandler = jest.fn<void, [AppStatePatch]>();
    const repeatedConsumerHandler = jest.fn<void, [AppStatePatch]>();

    const firstDispose = adapter.subscribeStatePatches(firstPatchHandler);
    const repeatedDispose = adapter.subscribeStatePatches(repeatedConsumerHandler);
    eventCallback?.({ revision: 3 });

    expect(firstDispose).not.toBe(repeatedDispose);
    expect(firstPatchHandler).toHaveBeenCalledWith({ revision: 3 });
    expect(repeatedConsumerHandler).toHaveBeenCalledWith({ revision: 3 });

    firstDispose();
    eventCallback?.({ revision: 4 });

    expect(unsubscribe).not.toHaveBeenCalled();
    expect(firstPatchHandler).toHaveBeenCalledTimes(1);
    expect(repeatedConsumerHandler).toHaveBeenCalledTimes(2);

    repeatedDispose();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
});

/*
 * The bridge is the only place that sees the wire, so it is the only place that
 * can make the declared patch shape true.
 *
 * `apperr.AppStatePatch.OrderedDocumentIDs` is the one field tagged without
 * `omitempty`, so every layout-only patch the real backend emits arrives as
 * `orderedDocumentIds: null` — a value `AppStatePatch` declares impossible.
 * `just dev-ui` cannot show this: the mock bridge always sends an array.
 */
it('drops a null tab order at the bridge so the declared patch shape holds', () => {
    let eventCallback: ((payload: unknown) => void) | undefined;
    const runtime: AppModelRuntime = {
        eventsOn(_eventName, callback): () => void {
            eventCallback = callback;
            return (): void => {
                eventCallback = undefined;
            };
        },
    };
    const adapter = createAppModelAdapter(
        {
            getState: async () => ({ data: state }),
            updateBuffer: async () => ({}),
            setDocView: async () => ({}),
            setUILayout: async () => ({}),
        },
        runtime,
    );
    const received = jest.fn<void, [AppStatePatch]>();
    adapter.subscribeStatePatches(received);

    eventCallback?.({
        revision: 7,
        orderedDocumentIds: null,
        ui: { sidebarVisible: true },
    });

    expect(received).toHaveBeenCalledTimes(1);
    const [patch] = received.mock.calls[0];
    expect(patch.ui).toEqual({ sidebarVisible: true });
    expect(Object.hasOwn(patch, 'orderedDocumentIds')).toBe(false);
});

it('keeps an empty tab order, which is the last document closing', () => {
    let eventCallback: ((payload: unknown) => void) | undefined;
    const runtime: AppModelRuntime = {
        eventsOn(_eventName, callback): () => void {
            eventCallback = callback;
            return (): void => {
                eventCallback = undefined;
            };
        },
    };
    const adapter = createAppModelAdapter(
        {
            getState: async () => ({ data: state }),
            updateBuffer: async () => ({}),
            setDocView: async () => ({}),
            setUILayout: async () => ({}),
        },
        runtime,
    );
    const received = jest.fn<void, [AppStatePatch]>();
    adapter.subscribeStatePatches(received);

    eventCallback?.({ revision: 8, orderedDocumentIds: [] });

    expect(received.mock.calls[0][0].orderedDocumentIds).toEqual([]);
});

it('When the backend closes a workspace, the adapter preserves the explicit null patch.', (): void => {
    const runtime = createStatePatchDriver();
    const adapter = createAppModelAdapter(
        {
            getState: async () => ({ data: state }),
            updateBuffer: async () => ({}),
            setDocView: async () => ({}),
            setUILayout: async () => ({}),
        },
        runtime,
    );
    const received = jest.fn<void, [AppStatePatch]>();
    adapter.subscribeStatePatches(received);

    runtime.emitStatePatch({ revision: 9, workspace: null });

    expect(received).toHaveBeenCalledTimes(1);
    const patch = received.mock.calls[0][0];
    expect(Object.hasOwn(patch, 'workspace')).toBe(true);
    expect(patch.workspace).toBeNull();
});

it('When workspace commands receive valid calls, the adapter forwards each command and guards its arity.', async (): Promise<void> => {
    const openOutcome: WorkspaceResult = {
        category: 'permission-denied',
        subject: '/tmp/project',
        message: 'The folder is unavailable.',
        remediation: 'Copy path',
        id: 'workspace-open',
        status: 'refused',
        error: {
            category: 'permission-denied',
            message: 'The folder is unavailable.',
            remediations: ['Copy path'],
            dedupKey: 'workspace-open',
        },
    };
    const openWorkspace = jest.fn(async (folderPath: string): Promise<WorkspaceResult> => ({
        ...openOutcome,
        subject: folderPath,
    }));
    const refreshWorkspace = jest.fn(async (): Promise<WorkspaceResult> => ({ status: 'unchanged' }));
    const closeWorkspace = jest.fn(async (): Promise<ClassifiedVoidResult> => ({}));
    const adapter = createAppModelAdapter(
        {
            getState: async () => ({ data: state }),
            openWorkspace,
            refreshWorkspace,
            closeWorkspace,
            updateBuffer: async () => ({}),
            setDocView: async () => ({}),
            setUILayout: async () => ({}),
        },
        { eventsOn: (): (() => void) => (): void => undefined },
    );
    const openWorkspaceCommand = adapter.openWorkspace;
    const refreshWorkspaceCommand = adapter.refreshWorkspace;
    const closeWorkspaceCommand = adapter.closeWorkspace;

    expect(openWorkspaceCommand).toEqual(expect.any(Function));
    expect(refreshWorkspaceCommand).toEqual(expect.any(Function));
    expect(closeWorkspaceCommand).toEqual(expect.any(Function));
    if (
        openWorkspaceCommand === undefined ||
        refreshWorkspaceCommand === undefined ||
        closeWorkspaceCommand === undefined
    ) {
        throw new Error('Workspace adapter commands are unavailable.');
    }

    await expect(openWorkspaceCommand('/tmp/project')).resolves.toMatchObject({
        category: 'permission-denied',
        subject: '/tmp/project',
        message: 'The folder is unavailable.',
        remediation: 'Copy path',
        id: 'workspace-open',
        status: 'refused',
        error: {
            category: 'permission-denied',
            message: 'The folder is unavailable.',
            remediations: ['Copy path'],
            dedupKey: 'workspace-open',
        },
    });
    await expect(refreshWorkspaceCommand()).resolves.toEqual({ status: 'unchanged' });
    await expect(closeWorkspaceCommand()).resolves.toEqual({});
    await expect(Reflect.apply(openWorkspaceCommand, undefined, [])).rejects.toThrow(
        'AppModelHandler.OpenWorkspace expects 1 argument(s), received 0.',
    );
    await expect(Reflect.apply(refreshWorkspaceCommand, undefined, ['extra'])).rejects.toThrow(
        'AppModelHandler.RefreshWorkspace expects 0 argument(s), received 1.',
    );
    await expect(Reflect.apply(closeWorkspaceCommand, undefined, ['extra'])).rejects.toThrow(
        'AppModelHandler.CloseWorkspace expects 0 argument(s), received 1.',
    );
    expect(openWorkspace).toHaveBeenCalledWith('/tmp/project');
    expect(refreshWorkspace).toHaveBeenCalledTimes(1);
    expect(closeWorkspace).toHaveBeenCalledTimes(1);
});

it('returns a canonical chosen folder without opening it, and preserves picker cancellation and refusal', async () => {
    const chooseWorkspaceFolder = jest
        .fn()
        .mockResolvedValueOnce({ status: 'chosen', path: '/private/tmp/notes' })
        .mockResolvedValueOnce({ status: 'cancelled' })
        .mockResolvedValueOnce({
            status: 'refused',
            error: { category: 'permission-denied', message: 'Cannot read folder.', dedupKey: 'folder-picker' },
        });
    const openWorkspace = jest.fn();
    const adapter = createAppModelAdapter(
        {
            getState: async () => ({ data: state }),
            chooseWorkspaceFolder,
            openWorkspace,
            updateBuffer: async () => ({}),
            setDocView: async () => ({}),
            setUILayout: async () => ({}),
        },
        { eventsOn: (): (() => void) => (): void => undefined },
    );

    await expect(adapter.chooseWorkspaceFolder?.()).resolves.toMatchObject({
        status: 'chosen',
        path: '/private/tmp/notes',
    });
    await expect(adapter.chooseWorkspaceFolder?.()).resolves.toMatchObject({ status: 'cancelled' });
    await expect(adapter.chooseWorkspaceFolder?.()).resolves.toMatchObject({
        status: 'refused',
        error: { category: 'permission-denied', remediations: [] },
    });
    expect(openWorkspace).not.toHaveBeenCalled();
    expect(chooseWorkspaceFolder).toHaveBeenCalledTimes(3);
});

it('When workspace refusals omit remediations, the adapter provides an empty list.', async (): Promise<void> => {
    const refusalError: ClassifiedError = {
        category: 'permission-denied',
        message: 'The folder is unavailable.',
        remediations: [],
        dedupKey: 'workspace-refusal',
    };
    Reflect.deleteProperty(refusalError, 'remediations');
    const openOutcome: WorkspaceResult = {
        category: 'permission-denied',
        subject: '/tmp/project',
        message: 'The folder is unavailable.',
        id: 'workspace-open-refused',
        status: 'refused',
        error: refusalError,
    };
    const refreshOutcome: WorkspaceResult = {
        category: 'permission-denied',
        subject: '/tmp/project',
        message: 'The folder is unavailable.',
        id: 'workspace-refresh-refused',
        status: 'refused',
        error: refusalError,
    };
    const closeOutcome: ClassifiedVoidResult = {
        category: 'permission-denied',
        subject: '/tmp/project',
        message: 'The folder is unavailable.',
        id: 'workspace-close-refused',
        error: refusalError,
    };
    const openWorkspace = jest.fn(async (): Promise<WorkspaceResult> => openOutcome);
    const refreshWorkspace = jest.fn(async (): Promise<WorkspaceResult> => refreshOutcome);
    const closeWorkspace = jest.fn(async (): Promise<ClassifiedVoidResult> => closeOutcome);
    const adapter = createAppModelAdapter(
        {
            getState: async () => ({ data: state }),
            openWorkspace,
            refreshWorkspace,
            closeWorkspace,
            updateBuffer: async () => ({}),
            setDocView: async () => ({}),
            setUILayout: async () => ({}),
        },
        { eventsOn: (): (() => void) => (): void => undefined },
    );

    await expect(adapter.openWorkspace?.('/tmp/project')).resolves.toMatchObject({
        status: 'refused',
        error: { remediations: [] },
    });
    await expect(adapter.refreshWorkspace?.()).resolves.toMatchObject({
        status: 'refused',
        error: { remediations: [] },
    });
    await expect(adapter.closeWorkspace?.()).resolves.toMatchObject({
        error: { remediations: [] },
    });
});

it('reports the first buffer delivery failure until a successful delivery rearms reporting', async () => {
    const failure: WireError = {
        code: 'io',
        title: 'Sync failed',
        message: 'Could not sync',
        retryable: true,
        details: { subject: 'notes.md' },
    };
    const updateBuffer = jest
        .fn((id: string, content: string, baseRevision: number): Promise<VoidResult> => {
            void baseRevision;
            void id;
            void content;
            return Promise.resolve({});
        })
        .mockResolvedValueOnce({ error: failure })
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ error: failure });
    const adapter = createAppModelAdapter(
        {
            getState: () => Promise.resolve({ data: state }),
            updateBuffer,
            setDocView: () => Promise.resolve({}),
            setUILayout: () => Promise.resolve({}),
        },
        { eventsOn: () => () => undefined },
    );
    const errors = jest.fn();
    const unsubscribe = adapter.subscribeBufferSyncErrors(errors);
    await adapter.updateBuffer('one', 'first', 0);
    const firstFailure = adapter.flushBuffer('one');
    await expect(firstFailure).rejects.toBeInstanceOf(Error);
    await expect(firstFailure).rejects.toMatchObject(failure);
    expect(isBufferSyncError(await firstFailure.catch((error: unknown) => error))).toBe(true);
    await adapter.updateBuffer('one', 'latest', 0);
    await expect(adapter.flushBuffer('one')).rejects.toMatchObject({ code: 'internal', message: 'offline' });
    expect(errors).toHaveBeenCalledTimes(1);
    expect(errors).toHaveBeenCalledWith(failure);
    expect(store.getState().notifications.items).toHaveLength(0);
    await adapter.flushBuffer('one');
    expect(updateBuffer).toHaveBeenLastCalledWith('one', 'latest', 0);
    await adapter.updateBuffer('two', 'other', 0);
    await expect(adapter.flushBuffer('two')).rejects.toMatchObject(failure);
    expect(errors).toHaveBeenCalledTimes(2);
    unsubscribe();
});

it('keeps newer buffer text when an older in-flight delivery fails', async () => {
    const first = deferred<VoidResult>();
    const failure: WireError = { code: 'io', title: 'Sync failed', message: 'Could not sync', retryable: true };
    const updateBuffer = jest
        .fn((id: string, content: string, baseRevision: number): Promise<VoidResult> => {
            void baseRevision;
            void id;
            void content;
            return Promise.resolve({});
        })
        .mockReturnValueOnce(first.promise);
    const adapter = createAppModelAdapter(
        {
            getState: () => Promise.resolve({ data: state }),
            updateBuffer,
            setDocView: () => Promise.resolve({}),
            setUILayout: () => Promise.resolve({}),
        },
        { eventsOn: () => () => undefined },
    );
    const errors = jest.fn();
    adapter.subscribeBufferSyncErrors(errors);
    await adapter.updateBuffer('one', 'older', 0);
    const failedFlush = adapter.flushBuffer('one');
    await Promise.resolve();
    await adapter.updateBuffer('one', 'newer', 0);
    first.resolve({ error: failure });
    await expect(failedFlush).rejects.toMatchObject(failure);
    await adapter.flushBuffer('one');
    expect(updateBuffer.mock.calls.map(([, content]) => content)).toEqual(['older', 'newer']);
    expect(errors).toHaveBeenCalledTimes(1);
});

it('retains queued content across session cleanup only in interface recovery', async () => {
    jest.useFakeTimers();
    const updateBuffer = jest.fn((id: string, content: string, baseRevision: number): Promise<VoidResult> => {
        void baseRevision;
        void id;
        void content;
        return Promise.resolve({});
    });
    const setDocView = jest.fn((id: string, view: DocViewInput): Promise<VoidResult> => {
        void id;
        void view;
        return Promise.resolve({});
    });
    const adapter = createAppModelAdapter(
        { getState: async () => ({ data: state }), updateBuffer, setDocView, setUILayout: async () => ({}) },
        { eventsOn: () => () => undefined },
    );

    await adapter.updateBuffer('normal', 'discarded', 0);
    adapter.cancelPendingSession?.('normal');
    await adapter.flushBuffer('normal');
    expect(updateBuffer).not.toHaveBeenCalled();

    await adapter.updateBuffer('one', 'preserved', 0);
    await adapter.updateDocView('one', viewAt(2));
    adapter.retainPendingBuffers();
    adapter.retainPendingBuffers();
    adapter.cancelPendingSession?.('one');
    await adapter.updateBuffer('two', 'late edit', 0);
    jest.runAllTimers();
    expect(updateBuffer).not.toHaveBeenCalled();
    expect(setDocView).not.toHaveBeenCalled();
    expect(adapter.getPendingBufferDocumentIds()).toEqual(['one', 'two']);
    await adapter.flushBuffer('one');
    expect(updateBuffer).toHaveBeenCalledWith('one', 'preserved', 0);
    expect(adapter.getPendingBufferDocumentIds()).toEqual(['two']);
    await adapter.flushBuffer('two');
    expect(adapter.getPendingBufferDocumentIds()).toEqual([]);
});

it('retains newer pending content behind a failed in-flight delivery during recovery', async () => {
    const first = deferred<VoidResult>();
    const updateBuffer = jest.fn((id: string, content: string, baseRevision: number): Promise<VoidResult> => {
        void baseRevision;
        void id;
        void content;
        return Promise.resolve({});
    });
    updateBuffer.mockReturnValueOnce(first.promise);
    const adapter = createAppModelAdapter(
        {
            getState: async () => ({ data: state }),
            updateBuffer,
            setDocView: async () => ({}),
            setUILayout: async () => ({}),
        },
        { eventsOn: () => () => undefined },
    );
    await adapter.updateBuffer('one', 'older', 0);
    const inFlight = adapter.flushBuffer('one');
    await Promise.resolve();
    await adapter.updateBuffer('one', 'newer', 0);
    adapter.retainPendingBuffers();
    adapter.cancelPendingSession?.('one');
    expect(adapter.getPendingBufferDocumentIds()).toEqual(['one']);
    first.resolve({ error: { code: 'io', title: 'Sync failed', message: 'offline', retryable: true } });
    await expect(inFlight).rejects.toThrow();
    expect(adapter.getPendingBufferDocumentIds()).toEqual(['one']);
    await adapter.flushBuffer('one');
    expect(updateBuffer.mock.calls.map(([, content]) => content)).toEqual(['older', 'newer']);
    expect(adapter.getPendingBufferDocumentIds()).toEqual([]);
});
