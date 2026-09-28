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
import {
    BUFFER_SYNC_MS,
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
    activeBuffer: { documentId: '', content: '' },
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

it('exposes guarded New/Open commands without converting classified outcomes', async () => {
    const newDocument = jest.fn(async (expectedTabSetRevision: number) => {
        void expectedTabSetRevision;
        return { data: { documentId: 'new-doc', content: '' } };
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
            updateBuffer: async (_documentId: string, _content: string): Promise<VoidResult> => {
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
        data: { documentId: 'new-doc', content: '' },
    });
    await expect(adapter.openDocument?.(4)).resolves.toEqual({
        status: 'cancelled',
    });
    expect(newDocument).toHaveBeenCalledWith(4);
    expect(openDocument).toHaveBeenCalledWith(4);
});

it('flushes the latest buffer and view queues as one ordered lifecycle drain', async () => {
    const calls: string[] = [];
    const updateBuffer = jest.fn(async (documentId: string, content: string): Promise<VoidResult> => {
        void documentId;
        calls.push(`buffer:${content}`);
        return {};
    });
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

    await adapter.updateBuffer('document-1', 'latest');
    await adapter.updateDocView('document-1', viewAt(8));
    await adapter.flushActiveSession?.('document-1');

    expect(calls).toEqual(['buffer:latest', 'view']);
    expect(updateBuffer).toHaveBeenCalledWith('document-1', 'latest');
    expect(setDocView).toHaveBeenCalledWith('document-1', viewAt(8));
});

it('routes imperative flush through the registered activation session', async () => {
    const flushActiveSession = jest.fn(async (): Promise<void> => undefined);
    const adapter = createAppModelAdapter(
        {
            getState: async (): Promise<{ data: AppModelState }> => ({ data: state }),
            updateBuffer: async (_documentId: string, _content: string): Promise<VoidResult> => {
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
    await adapter.updateBuffer('document-1', 'fallback queue');
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
    const updateBuffer = jest.fn<Promise<VoidResult>, [string, string]>(async (): Promise<VoidResult> => ({}));
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
    await adapter.updateBuffer('document-1', 'stale content');
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
            updateBuffer: async (documentId: string, content: string): Promise<VoidResult> => {
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

    await adapter.updateBuffer('document-1', 'latest');
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
    const adapter = createAppModelAdapter(
        {
            getState,
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
    await jest.advanceTimersByTimeAsync(250);
    await jest.advanceTimersByTimeAsync(1000);
    await expect(recovery).resolves.toMatchObject({
        persistent: true,
        savedOnDisk: true,
        commandsBlocked: true,
    });
    expect(getState).toHaveBeenCalledTimes(3);
    await expect(adapter.updateBuffer('document-1', 'blocked')).rejects.toThrow('editor-state recovery failed');

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
    await expect(adapter.updateBuffer('document-1', 'retry-unblocked')).resolves.toBeUndefined();
});

it('coalesces edits in the adapter-owned timer', async () => {
    jest.useFakeTimers();
    const updateBuffer = jest.fn<Promise<VoidResult>, [string, string]>(
        async (documentId: string, content: string): Promise<VoidResult> => {
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

    void adapter.updateBuffer('document-1', 'first');
    void adapter.updateBuffer('document-1', 'latest');

    expect(updateBuffer).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(200);

    expect(updateBuffer).toHaveBeenCalledTimes(1);
    expect(updateBuffer).toHaveBeenCalledWith('document-1', 'latest');
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
    await jest.advanceTimersByTimeAsync(BUFFER_SYNC_MS);

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
    await jest.advanceTimersByTimeAsync(BUFFER_SYNC_MS);
    const arrangementCommand = adapter.setDocView('document-1', arrangementView);
    await adapter.updateDocView('document-2', viewAt(8));
    await jest.advanceTimersByTimeAsync(BUFFER_SYNC_MS);
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
        await jest.advanceTimersByTimeAsync(BUFFER_SYNC_MS);
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
    await jest.advanceTimersByTimeAsync(BUFFER_SYNC_MS);

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
    await jest.advanceTimersByTimeAsync(BUFFER_SYNC_MS);
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
    await jest.advanceTimersByTimeAsync(BUFFER_SYNC_MS);
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
        updateBuffer(documentId, content) {
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
    await expect(adapter.updateBuffer('document-1', 'draft')).resolves.toBeUndefined();
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
    await mismatchedAdapter.updateBuffer('document-1', 'draft');
    await expect(mismatchedAdapter.flushBuffer('document-1')).rejects.toMatchObject({
        code: 'internal',
        message: 'AppModelHandler.UpdateBuffer expects 1 argument(s), received 2.',
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
