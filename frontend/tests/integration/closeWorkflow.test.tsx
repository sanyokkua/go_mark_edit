import type { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';

jest.mock('../../src/logic/adapter', () => ({
    appModelAdapter: { getState: jest.fn(), flushActiveSession: jest.fn() },
    closePlanAdapter: { prepareClose: jest.fn(), resolveClosePlan: jest.fn(), executeClosePlan: jest.fn() },
    documentConflictAdapter: { reloadFromDisk: jest.fn() },
}));

import {
    appModelAdapter,
    closePlanAdapter,
    documentConflictAdapter,
    type NativeLifecycleAdapter,
} from '../../src/logic/adapter';
import { store } from '../../src/logic/store';
import { resetNotifications } from '../../src/logic/store/notificationsSlice';
import { hydrateProjection, resetProjection } from '../../src/logic/store/appModelProjectionActions';
import { bootstrapAppModelProjection, disposeAppModelProjection } from '../../src/logic/store/appModelProjection';
import type { ClosePlanSummary } from '../../src/logic/store/appModelTypes';
import type { WireError } from '../../src/logic/utils/parseError';
import { useDocumentSession } from '../../src/app/useDocumentSession';
import { useCloseWorkflow } from '../../src/app/useCloseWorkflow';
import { useConflictCommands } from '../../src/app/useConflictCommands';
import { useShutdown } from '../../src/app/useShutdown';
import { createCommandRecorder } from '../support/commandRecorder';
import { conflictFixture, documentFixture } from '../support/appFixtures';

const wrapper = ({ children }: PropsWithChildren): React.JSX.Element => <Provider store={store}>{children}</Provider>;
const unusedWrites = {
    saveForClose: jest.fn(async () => ({ status: 'refused' as const })),
    notifyInactiveFormatSkipped: jest.fn(),
};

function nativeRecorder() {
    const recorder = createCommandRecorder();
    let listener: ((id?: string) => void) | undefined;
    let closeID: string | undefined;
    let closeOwner: 'frontend' | 'native' = 'frontend';
    const cancel = recorder.binding('CancelQuit', 1);
    const authorize = recorder.binding('AuthorizeQuit', 1);
    const native: NativeLifecycleAdapter = {
        onCloseRequested: (next) => {
            listener = next;
            return () => {
                listener = undefined;
            };
        },
        requestQuit: () => undefined,
        acknowledgeRecoveryClose: async () => undefined,
        discardAndAuthorizeQuit: async () => undefined,
        cancelQuit: (id) => cancel({ id: 'cancel-command' }, id),
        authorizeQuit: (id) => authorize({ id: 'authorize-command' }, id),
    };
    const model = {
        getState: async () => ({
            snapshot: {
                revision: 1,
                documents: {},
                activeDocumentId: null,
                ui: {},
                pendingClose: closeID === undefined ? undefined : { id: closeID, owner: closeOwner },
            },
            activeBuffer: null,
        }),
    };
    return {
        native,
        recorder,
        model,
        emit: (id: string, owner: 'frontend' | 'native' = 'frontend') => {
            closeID = id;
            closeOwner = owner;
            listener?.(id);
        },
        clear: () => {
            closeID = undefined;
            listener?.();
        },
    };
}

beforeEach(() => {
    store.dispatch(
        hydrateProjection({
            revision: 1,
            activeDocumentId: 'one',
            orderedDocumentIds: ['one', 'two'],
            documents: {
                one: documentFixture(),
                two: { ...documentFixture('two'), dirty: false },
            },
            ui: {},
        }),
    );
});
afterEach(() => {
    disposeAppModelProjection();
    store.dispatch(resetProjection());
    store.dispatch(resetNotifications());
    jest.resetAllMocks();
});

function renderCloseWorkflow(
    writes?: { saveForClose: jest.Mock; notifyInactiveFormatSkipped?: jest.Mock },
    onExternalConflict = jest.fn(),
) {
    const runtime = nativeRecorder();
    return renderHook(
        () => {
            const session = useDocumentSession();
            const shutdown = useShutdown({
                bootstrapStatus: 'ready',
                hydratedPendingClose: null,
                dependencies: { native: runtime.native, appModel: runtime.model },
            });
            return useCloseWorkflow({
                session,
                shutdown,
                ...{ onExternalConflict },
                conflicts: useConflictCommands(session.activation),
                recoverySurface: null,
                writes: {
                    saveForClose:
                        writes?.saveForClose ??
                        jest.fn().mockResolvedValue({ status: 'saved', writtenContentRevision: 2 }),
                    notifyInactiveFormatSkipped: writes?.notifyInactiveFormatSkipped ?? jest.fn(),
                },
            });
        },
        { wrapper },
    );
}

it('does not start a close plan for a native-owned hydrated request', async () => {
    const runtime = nativeRecorder();
    const owner = renderHook(
        () => {
            const session = useDocumentSession();
            const shutdown = useShutdown({
                bootstrapStatus: 'ready',
                hydratedPendingClose: { id: 'native-owned', owner: 'native' },
                dependencies: { native: runtime.native, appModel: runtime.model },
            });
            return useCloseWorkflow({
                session,
                shutdown,
                conflicts: useConflictCommands(session.activation),
                recoverySurface: null,
                writes: unusedWrites,
            });
        },
        { wrapper },
    );
    await waitFor(() => expect(owner.result.current.active).toBe(false));
    expect(closePlanAdapter.prepareClose).not.toHaveBeenCalled();
    expect(closePlanAdapter.executeClosePlan).not.toHaveBeenCalled();
    expect(runtime.recorder.calls).toEqual([]);
    expect(store.getState().documents.orderedIds).toEqual(['one', 'two']);
});

it.each(['prepare', 'resolve', 'execute'] as const)(
    'stops a deferred %s continuation after native takeover and preserves tabs on native Cancel',
    async (stage) => {
        const runtime = nativeRecorder();
        const plan = { id: 'plan', kind: 'quit', status: 'ready', tabSetRevision: 0, targets: [] };
        const snapshot = {
            revision: 1,
            tabSetRevision: 0,
            activeDocumentId: null,
            orderedDocumentIds: ['one', 'two'],
            documents: {},
            ui: {},
        };
        (appModelAdapter.getState as jest.Mock).mockResolvedValue({ snapshot, activeBuffer: null });
        let finish!: (value: unknown) => void;
        const delayed = new Promise((resolve) => {
            finish = resolve;
        });
        (closePlanAdapter.prepareClose as jest.Mock).mockImplementation(() =>
            stage === 'prepare' ? delayed : Promise.resolve({ data: plan }),
        );
        (closePlanAdapter.resolveClosePlan as jest.Mock).mockImplementation(() =>
            stage === 'resolve' ? delayed : Promise.resolve({ data: plan }),
        );
        (closePlanAdapter.executeClosePlan as jest.Mock).mockImplementation(() =>
            stage === 'execute' ? delayed : Promise.resolve({ status: 'closed', orderedDocumentIds: [] }),
        );
        const owner = renderHook(
            () => {
                const session = useDocumentSession();
                const shutdown = useShutdown({
                    bootstrapStatus: 'ready',
                    hydratedPendingClose: null,
                    dependencies: { native: runtime.native, appModel: runtime.model },
                });
                return useCloseWorkflow({
                    session,
                    shutdown,
                    conflicts: useConflictCommands(session.activation),
                    recoverySurface: null,
                    writes: unusedWrites,
                });
            },
            { wrapper },
        );
        act(() => runtime.emit('close-1'));
        const call =
            stage === 'prepare'
                ? closePlanAdapter.prepareClose
                : stage === 'resolve'
                  ? closePlanAdapter.resolveClosePlan
                  : closePlanAdapter.executeClosePlan;
        await waitFor(() => expect(call).toHaveBeenCalledTimes(1));
        act(() => runtime.emit('close-1', 'native'));
        await waitFor(() => expect(owner.result.current.active).toBe(false));
        await act(async () => {
            finish(stage === 'execute' ? { status: 'closed', orderedDocumentIds: [] } : { data: plan });
        });
        act(() => runtime.clear());
        await waitFor(() => expect(owner.result.current.active).toBe(false));
        expect(runtime.recorder.calls).toEqual([]);
        expect(store.getState().documents.orderedIds).toEqual(['one', 'two']);
        if (stage === 'prepare') expect(closePlanAdapter.resolveClosePlan).not.toHaveBeenCalled();
        if (stage !== 'execute') expect(closePlanAdapter.executeClosePlan).not.toHaveBeenCalled();
    },
);

it.each([
    {
        label: 'continues the close after saving the active target and revalidating remaining choices',
        reordered: false,
    },
    { label: 'refuses a refreshed close plan that reorders the original targets', reordered: true },
])('$label', async ({ reordered }) => {
    const oldPlan = {
        id: 'old',
        kind: 'window',
        status: 'collecting',
        tabSetRevision: 0,
        targets: [
            { documentId: 'one', title: 'one.md', contentRevision: 1, dirty: true },
            { documentId: 'two', title: 'two.md', contentRevision: 1, dirty: true },
        ],
    };
    const freshPlan = {
        id: 'fresh',
        kind: 'window',
        status: 'collecting',
        tabSetRevision: 3,
        targets: [
            { documentId: 'one', title: 'one.md', contentRevision: 2, dirty: false },
            { documentId: 'two', title: 'two.md', contentRevision: 1, dirty: true },
        ],
    };
    store.dispatch(
        hydrateProjection({
            revision: 2,
            tabSetRevision: 0,
            activeDocumentId: 'one',
            orderedDocumentIds: ['one', 'two'],
            documents: { one: documentFixture('one', 1), two: documentFixture('two', 1) },
            ui: {},
        }),
    );
    (appModelAdapter.getState as jest.Mock).mockResolvedValue({
        snapshot: {
            revision: 3,
            tabSetRevision: 3,
            activeDocumentId: 'one',
            orderedDocumentIds: ['one', 'two'],
            documents: { one: { ...documentFixture('one', 2), dirty: false }, two: documentFixture('two', 1) },
            ui: {},
        },
    });
    (appModelAdapter.flushActiveSession as jest.Mock).mockResolvedValue(undefined);
    (closePlanAdapter.prepareClose as jest.Mock).mockResolvedValueOnce({ data: oldPlan }).mockResolvedValueOnce({
        data: reordered ? { ...freshPlan, targets: freshPlan.targets.toReversed() } : freshPlan,
    });
    (closePlanAdapter.executeClosePlan as jest.Mock).mockResolvedValue({ status: 'closed', orderedDocumentIds: [] });
    const events: string[] = [];
    const writes = {
        saveForClose: jest.fn(async () => {
            events.push('active-save');
            return { status: 'saved', writtenContentRevision: 2 };
        }),
    };
    (closePlanAdapter.resolveClosePlan as jest.Mock).mockImplementation(async (id: string, decisions: unknown[]) => {
        events.push(`resolve-${id}`);
        if (id === 'old') return { data: { ...oldPlan, status: 'cancelled' } };
        if (decisions.length === 1)
            return {
                data: {
                    ...freshPlan,
                    status: 'ready',
                    targets: [freshPlan.targets[0], { ...freshPlan.targets[1], choice: 'save' }],
                },
            };
        return { data: freshPlan };
    });
    const owner = renderCloseWorkflow(writes);
    await act(async () => {
        await owner.result.current.onCloseDocument('one', 0, 'window', ['one', 'two']);
    });
    expect(owner.result.current.state.phase).toBe('collecting');
    await act(async () => {
        await owner.result.current.choose('save-all');
    });
    expect(events.slice(0, 2)).toEqual(['resolve-old', 'active-save']);
    expect(closePlanAdapter.prepareClose).toHaveBeenLastCalledWith('window', ['one', 'two'], 3);
    if (reordered) {
        expect(closePlanAdapter.resolveClosePlan).toHaveBeenCalledTimes(1);
        expect(closePlanAdapter.executeClosePlan).not.toHaveBeenCalled();
        expect(owner.result.current.state.phase).toBe('failed');
        expect(store.getState().notifications.items).toEqual(
            expect.arrayContaining([expect.objectContaining({ subject: 'close:changed:old' })]),
        );
        return;
    }
    expect(closePlanAdapter.resolveClosePlan).toHaveBeenCalledWith('fresh', [{ choice: 'save', documentId: 'two' }]);
    expect(closePlanAdapter.executeClosePlan).toHaveBeenCalledWith('fresh');
});

it('finishes the original close after Reload using a fresh clean revision without flushing stale editor text', async () => {
    const original = {
        id: 'old',
        kind: 'single',
        status: 'collecting',
        tabSetRevision: 0,
        targets: [{ documentId: 'one', title: 'one.md', contentRevision: 1, dirty: true }],
    };
    const fresh = {
        id: 'fresh',
        kind: 'single',
        status: 'ready',
        tabSetRevision: 1,
        targets: [{ documentId: 'one', title: 'one.md', contentRevision: 3, dirty: false }],
    };
    store.dispatch(
        hydrateProjection({
            revision: 2,
            tabSetRevision: 0,
            activeDocumentId: 'one',
            orderedDocumentIds: ['one'],
            documents: { one: documentFixture('one', 1) },
            ui: {},
        }),
    );
    (appModelAdapter.getState as jest.Mock).mockResolvedValue({
        snapshot: {
            revision: 3,
            tabSetRevision: 1,
            activeDocumentId: 'one',
            orderedDocumentIds: ['one'],
            documents: { one: { ...documentFixture('one', 3), dirty: false } },
            ui: {},
        },
    });
    (closePlanAdapter.prepareClose as jest.Mock)
        .mockResolvedValueOnce({ data: original })
        .mockResolvedValueOnce({ data: fresh });
    (closePlanAdapter.resolveClosePlan as jest.Mock).mockImplementation(async (id: string) => ({
        data: id === 'old' ? { ...original, status: 'cancelled' } : fresh,
    }));
    (closePlanAdapter.executeClosePlan as jest.Mock).mockResolvedValue({ status: 'closed', orderedDocumentIds: [] });
    const writes = { saveForClose: jest.fn().mockResolvedValue({ status: 'reloaded', contentRevision: 3 }) };
    const owner = renderCloseWorkflow(writes);
    await act(async () => {
        await owner.result.current.onCloseDocument('one', 0);
    });
    await act(async () => {
        await owner.result.current.choose('save');
    });
    expect(closePlanAdapter.prepareClose).toHaveBeenNthCalledWith(2, 'single', ['one'], 1);
    expect(closePlanAdapter.executeClosePlan).toHaveBeenCalledWith('fresh');
    expect(appModelAdapter.flushActiveSession).not.toHaveBeenCalled();
});

it('re-prompts for remaining dirty targets after a close-owned Reload', async () => {
    const original = {
        id: 'old',
        kind: 'window',
        status: 'collecting',
        tabSetRevision: 0,
        targets: [
            { documentId: 'one', title: 'one.md', contentRevision: 1, dirty: true },
            { documentId: 'two', title: 'two.md', contentRevision: 1, dirty: true },
        ],
    };
    const fresh = {
        id: 'fresh',
        kind: 'window',
        status: 'collecting',
        tabSetRevision: 1,
        targets: [
            { documentId: 'one', title: 'one.md', contentRevision: 3, dirty: false },
            { documentId: 'two', title: 'two.md', contentRevision: 1, dirty: true },
        ],
    };
    store.dispatch(
        hydrateProjection({
            revision: 2,
            tabSetRevision: 0,
            activeDocumentId: 'one',
            orderedDocumentIds: ['one', 'two'],
            documents: { one: documentFixture('one', 1), two: documentFixture('two', 1) },
            ui: {},
        }),
    );
    (appModelAdapter.getState as jest.Mock).mockResolvedValue({
        snapshot: {
            revision: 3,
            tabSetRevision: 1,
            activeDocumentId: 'one',
            orderedDocumentIds: ['one', 'two'],
            documents: { one: { ...documentFixture('one', 3), dirty: false }, two: documentFixture('two', 1) },
            ui: {},
        },
    });
    (closePlanAdapter.prepareClose as jest.Mock)
        .mockResolvedValueOnce({ data: original })
        .mockResolvedValueOnce({ data: fresh });
    (closePlanAdapter.resolveClosePlan as jest.Mock).mockResolvedValue({
        data: { ...original, status: 'cancelled' },
    });
    const owner = renderCloseWorkflow({
        saveForClose: jest.fn().mockResolvedValue({ status: 'reloaded', contentRevision: 3 }),
    });
    await act(async () => {
        await owner.result.current.onCloseDocument('one', 0, 'window', ['one', 'two']);
    });
    await act(async () => {
        await owner.result.current.choose('save-all');
    });
    expect(owner.result.current.state.phase).toBe('collecting');
    if (owner.result.current.state.phase === 'collecting') expect(owner.result.current.state.plan.id).toBe('fresh');
    expect(closePlanAdapter.resolveClosePlan).toHaveBeenCalledTimes(1);
    expect(closePlanAdapter.executeClosePlan).not.toHaveBeenCalled();
});

it.each([
    [
        'another target changes',
        { one: { ...documentFixture('one', 2), dirty: false }, two: documentFixture('two', 2) },
        ['one', 'two'],
    ],
    ['another target disappears', { one: { ...documentFixture('one', 2), dirty: false } }, ['one']],
    [
        'a new tab opens',
        {
            one: { ...documentFixture('one', 2), dirty: false },
            two: documentFixture('two', 1),
            three: documentFixture('three', 1),
        },
        ['one', 'two', 'three'],
    ],
])('refuses a window close when %s while its active Save waits', async (_event, documents, orderedDocumentIds) => {
    const oldPlan = {
        id: 'old',
        kind: 'window',
        status: 'collecting',
        tabSetRevision: 0,
        targets: [
            { documentId: 'one', title: 'one.md', contentRevision: 1, dirty: true },
            { documentId: 'two', title: 'two.md', contentRevision: 1, dirty: true },
        ],
    };
    store.dispatch(
        hydrateProjection({
            revision: 2,
            tabSetRevision: 0,
            activeDocumentId: 'one',
            orderedDocumentIds: ['one', 'two'],
            documents: { one: documentFixture('one', 1), two: documentFixture('two', 1) },
            ui: {},
        }),
    );
    (appModelAdapter.flushActiveSession as jest.Mock).mockResolvedValue(undefined);
    (appModelAdapter.getState as jest.Mock).mockResolvedValue({
        snapshot: {
            revision: 3,
            tabSetRevision: 3,
            activeDocumentId: 'one',
            orderedDocumentIds,
            documents,
            ui: {},
        },
    });
    (closePlanAdapter.prepareClose as jest.Mock).mockResolvedValue({ data: oldPlan });
    (closePlanAdapter.resolveClosePlan as jest.Mock).mockResolvedValue({ data: { ...oldPlan, status: 'cancelled' } });
    const writes = { saveForClose: jest.fn().mockResolvedValue({ status: 'saved', writtenContentRevision: 2 }) };
    const owner = renderCloseWorkflow(writes);
    await act(async () => {
        await owner.result.current.onCloseDocument('one', 0, 'window', ['one', 'two']);
    });
    await act(async () => {
        await owner.result.current.choose('save-all');
    });
    expect(writes.saveForClose).toHaveBeenCalledWith('one');
    expect(closePlanAdapter.prepareClose).toHaveBeenCalledTimes(1);
    expect(closePlanAdapter.executeClosePlan).not.toHaveBeenCalled();
    expect(store.getState().documents.orderedIds).toEqual(['one', 'two']);
});

it('keeps the tab open when an edit queued during post-save Lint changes the saved revision', async () => {
    const original = {
        id: 'old',
        kind: 'single',
        status: 'collecting',
        tabSetRevision: 0,
        targets: [{ documentId: 'one', title: 'one.md', contentRevision: 1, dirty: true }],
    };
    store.dispatch(
        hydrateProjection({
            revision: 2,
            tabSetRevision: 0,
            activeDocumentId: 'one',
            orderedDocumentIds: ['one'],
            documents: { one: documentFixture('one', 1) },
            ui: {},
        }),
    );
    let flushes = 0;
    (appModelAdapter.flushActiveSession as jest.Mock).mockImplementation(async () => {
        flushes += 1;
    });
    (appModelAdapter.getState as jest.Mock).mockImplementation(async () => ({
        snapshot: {
            revision: 3,
            tabSetRevision: 0,
            activeDocumentId: 'one',
            orderedDocumentIds: ['one'],
            documents: { one: { ...documentFixture('one', flushes >= 1 ? 3 : 2), dirty: flushes >= 1 } },
            ui: {},
        },
    }));
    (closePlanAdapter.prepareClose as jest.Mock).mockResolvedValue({ data: original });
    (closePlanAdapter.resolveClosePlan as jest.Mock).mockResolvedValue({ data: { ...original, status: 'cancelled' } });
    let finishLint!: (result: { status: 'saved'; writtenContentRevision: number }) => void;
    const writes = {
        saveForClose: jest.fn(
            () =>
                new Promise<{ status: 'saved'; writtenContentRevision: number }>((resolve) => {
                    finishLint = resolve;
                }),
        ),
    };
    const owner = renderCloseWorkflow(writes);
    await act(async () => {
        await owner.result.current.onCloseDocument('one', 0);
    });
    act(() => {
        void owner.result.current.choose('save');
    });
    await waitFor(() => expect(owner.result.current.state.phase).toBe('saving-active'));
    await act(async () => {
        finishLint({ status: 'saved', writtenContentRevision: 2 });
    });
    await waitFor(() => expect(flushes).toBe(1));
    expect(closePlanAdapter.prepareClose).toHaveBeenCalledTimes(1);
    expect(closePlanAdapter.executeClosePlan).not.toHaveBeenCalled();
    expect(store.getState().documents.orderedIds).toEqual(['one']);
});

it.each([
    {
        label: 'reports formatting skipped for a completed background Save before a later batch refusal',
        probeFails: false,
    },
    { label: 'preserves the batch refusal without reporting an unconfirmed background Save', probeFails: true },
])('$label', async ({ probeFails }) => {
    const plan = {
        id: 'plan',
        kind: 'window',
        status: 'collecting',
        tabSetRevision: 0,
        targets: [
            { documentId: 'one', title: 'one.md', contentRevision: 1, dirty: true },
            { documentId: 'two', title: 'two.md', contentRevision: 1, dirty: true },
        ],
    };
    store.dispatch(
        hydrateProjection({
            revision: 2,
            tabSetRevision: 0,
            activeDocumentId: null,
            orderedDocumentIds: ['one', 'two'],
            documents: {
                one: documentFixture('one', 1),
                two: documentFixture('two', 1),
            },
            ui: {},
        }),
    );
    (appModelAdapter.flushActiveSession as jest.Mock).mockResolvedValue(undefined);
    jest.mocked(appModelAdapter.getState).mockImplementation(async () => {
        if (probeFails) throw new Error('Could not verify the background write');
        return {
            activeBuffer: null,
            snapshot: {
                revision: 3,
                tabSetRevision: 0,
                activeDocumentId: null,
                orderedDocumentIds: ['one', 'two'],
                documents: {
                    one: { ...documentFixture('one', 1), dirty: false, status: 'saved' },
                    two: documentFixture('two', 1),
                },
                ui: {},
            },
        };
    });
    (closePlanAdapter.prepareClose as jest.Mock).mockResolvedValue({ data: plan });
    (closePlanAdapter.resolveClosePlan as jest.Mock).mockResolvedValue({
        data: { ...plan, status: 'ready', targets: plan.targets.map((target) => ({ ...target, choice: 'save' })) },
    });
    (closePlanAdapter.executeClosePlan as jest.Mock).mockResolvedValue({
        status: 'refused',
        orderedDocumentIds: ['one', 'two'],
        error: {
            category: 'io-failure',
            message: 'The second write failed.',
            remediations: ['Retry'],
            dedupKey: 'batch-failed',
        },
    });
    const writes = { saveForClose: jest.fn(), notifyInactiveFormatSkipped: jest.fn() };
    const owner = renderCloseWorkflow(writes);
    await act(async () => {
        await owner.result.current.onCloseDocument('one', 0, 'window', ['one', 'two']);
    });
    await act(async () => {
        await owner.result.current.choose('save-all');
    });
    expect(appModelAdapter.getState).toHaveBeenCalledTimes(1);
    expect(writes.notifyInactiveFormatSkipped.mock.calls).toEqual(probeFails ? [] : [['one']]);
    expect(closePlanAdapter.executeClosePlan).toHaveBeenCalledWith('plan');
    expect(owner.result.current.state.phase).toBe('failed');
    expect(store.getState().documents.orderedIds).toEqual(['one', 'two']);
    expect(store.getState().notifications.items.map(({ message }) => message)).toEqual(['The second write failed.']);
});

it('reports closed only after the existing window plan closes every tab', async () => {
    (appModelAdapter.getState as jest.Mock).mockResolvedValue({
        snapshot: { revision: 2, activeDocumentId: null, orderedDocumentIds: [], documents: {}, ui: {} },
    });
    (closePlanAdapter.prepareClose as jest.Mock).mockResolvedValue({
        data: { id: 'plan', kind: 'window', status: 'ready', tabSetRevision: 0, targets: [] },
    });
    (closePlanAdapter.resolveClosePlan as jest.Mock).mockResolvedValue({
        data: { id: 'plan', kind: 'window', status: 'ready', tabSetRevision: 0, targets: [] },
    });
    let finishExecution: ((result: unknown) => void) | undefined;
    (closePlanAdapter.executeClosePlan as jest.Mock).mockImplementation(
        () => new Promise((resolve) => (finishExecution = resolve)),
    );
    const owner = renderCloseWorkflow();
    let outcome: string | undefined;
    act(() => {
        void owner.result.current.closeAllWindowTabs().then((value) => (outcome = value));
    });
    await waitFor(() => expect(closePlanAdapter.executeClosePlan).toHaveBeenCalledWith('plan'));
    expect(closePlanAdapter.prepareClose).toHaveBeenCalledWith('window', ['one', 'two'], expect.any(Number));
    expect(outcome).toBeUndefined();
    await act(async () => {
        finishExecution?.({ status: 'closed', orderedDocumentIds: [] });
    });
    expect(outcome).toBe('closed');
});

it('reports cancellation from a save prompt without executing the window plan', async () => {
    (closePlanAdapter.prepareClose as jest.Mock).mockResolvedValue({
        data: {
            id: 'plan',
            kind: 'window',
            status: 'collecting',
            tabSetRevision: 0,
            targets: [{ documentId: 'one', title: 'one', contentRevision: 1, dirty: true }],
        },
    });
    (closePlanAdapter.resolveClosePlan as jest.Mock).mockResolvedValue({
        data: { id: 'plan', kind: 'window', status: 'cancelled', tabSetRevision: 0, targets: [] },
    });
    const owner = renderCloseWorkflow();
    let outcome: string | undefined;
    act(() => {
        void owner.result.current.closeAllWindowTabs().then((value) => (outcome = value));
    });
    await waitFor(() => expect(owner.result.current.state.phase).toBe('collecting'));
    expect(outcome).toBeUndefined();
    await act(async () => owner.result.current.choose('cancel'));
    expect(outcome).toBe('cancelled');
    expect(closePlanAdapter.executeClosePlan).not.toHaveBeenCalled();
});

it('reports refusal when plan preparation is refused', async () => {
    (closePlanAdapter.prepareClose as jest.Mock).mockResolvedValue({
        error: { category: 'conflict', dedupKey: 'close-refused', message: 'Close refused' },
    });
    const owner = renderCloseWorkflow();
    let outcome: Promise<string> | undefined;
    act(() => {
        outcome = owner.result.current.closeAllWindowTabs();
    });
    await act(async () => {
        await expect(outcome).resolves.toBe('refused');
    });
    expect(closePlanAdapter.executeClosePlan).not.toHaveBeenCalled();
});

it('reports a failed plan as refusal rather than user cancellation', async () => {
    (closePlanAdapter.prepareClose as jest.Mock).mockResolvedValue({
        data: { id: 'plan', kind: 'window', status: 'failed', tabSetRevision: 0, targets: [] },
    });
    const owner = renderCloseWorkflow();
    let outcome: Promise<string> | undefined;
    act(() => {
        outcome = owner.result.current.closeAllWindowTabs();
    });
    await act(async () => {
        await expect(outcome).resolves.toBe('refused');
    });
});

it('settles a pending window close when the owner unmounts', async () => {
    (closePlanAdapter.prepareClose as jest.Mock).mockResolvedValue({
        data: {
            id: 'plan',
            kind: 'window',
            status: 'collecting',
            tabSetRevision: 0,
            targets: [{ documentId: 'one', title: 'one', contentRevision: 1, dirty: true }],
        },
    });
    const owner = renderCloseWorkflow();
    let outcome: Promise<string> | undefined;
    act(() => {
        outcome = owner.result.current.closeAllWindowTabs();
    });
    await waitFor(() => expect(owner.result.current.state.phase).toBe('collecting'));
    owner.unmount();
    await expect(outcome).resolves.toBe('refused');
});

it.each(['durability', 'recent-items', 'view-state'] as const)(
    'authorizes native Quit without acknowledging an asynchronous %s save warning',
    async (warning) => {
        let emitWarning!: (error: WireError) => void;
        await bootstrapAppModelProjection({
            ...appModelAdapter,
            getState: async () => ({
                activeBuffer: null,
                snapshot: {
                    revision: 1,
                    applicationVersion: 'test',
                    activeDocumentId: 'one',
                    orderedDocumentIds: ['one'],
                    documents: { one: documentFixture('one', 0) },
                    ui: {},
                },
            }),
            subscribeStatePatches: () => () => undefined,
            subscribeAsyncErrors: (listener) => {
                emitWarning = listener;
                return () => undefined;
            },
        });
        const runtime = nativeRecorder();
        const authorize = jest.fn(async () => undefined);
        runtime.native.authorizeQuit = authorize;
        const original = {
            id: 'old-native',
            kind: 'quit',
            status: 'collecting',
            tabSetRevision: 0,
            targets: [{ documentId: 'one', title: 'one.md', contentRevision: 0, dirty: true }],
        };
        const fresh = {
            id: 'fresh-native',
            kind: 'quit',
            status: 'collecting',
            tabSetRevision: 1,
            targets: [{ documentId: 'one', title: 'one.md', contentRevision: 2, dirty: false }],
        };
        (appModelAdapter.flushActiveSession as jest.Mock).mockResolvedValue(undefined);
        (appModelAdapter.getState as jest.Mock)
            .mockResolvedValueOnce({
                activeBuffer: null,
                snapshot: {
                    revision: 1,
                    tabSetRevision: 0,
                    activeDocumentId: 'one',
                    orderedDocumentIds: ['one'],
                    documents: { one: documentFixture('one', 0) },
                    ui: {},
                },
            })
            .mockResolvedValueOnce({
                activeBuffer: null,
                snapshot: {
                    revision: 2,
                    tabSetRevision: 1,
                    activeDocumentId: 'one',
                    orderedDocumentIds: ['one'],
                    documents: { one: { ...documentFixture('one', 2), dirty: false } },
                    ui: {},
                },
            })
            .mockResolvedValue({
                activeBuffer: null,
                snapshot: { revision: 3, orderedDocumentIds: [], documents: {}, ui: {} },
            });
        (closePlanAdapter.prepareClose as jest.Mock)
            .mockResolvedValueOnce({ data: original })
            .mockResolvedValueOnce({ data: fresh });
        (closePlanAdapter.resolveClosePlan as jest.Mock).mockImplementation(async (id: string) => ({
            data: id === original.id ? { ...original, status: 'cancelled' } : { ...fresh, status: 'ready' },
        }));
        (closePlanAdapter.executeClosePlan as jest.Mock).mockResolvedValue({
            status: 'noop',
            orderedDocumentIds: ['one'],
        });
        let finishSave!: (result: { status: 'saved'; writtenContentRevision: number }) => void;
        const writes = {
            saveForClose: jest.fn(
                () =>
                    new Promise<{ status: 'saved'; writtenContentRevision: number }>((resolve) => {
                        finishSave = resolve;
                    }),
            ),
            notifyInactiveFormatSkipped: jest.fn(),
        };
        const owner = renderHook(
            () => {
                const session = useDocumentSession();
                const shutdown = useShutdown({
                    bootstrapStatus: 'ready',
                    hydratedPendingClose: null,
                    dependencies: { native: runtime.native, appModel: runtime.model },
                });
                const close = useCloseWorkflow({
                    session,
                    shutdown,
                    conflicts: useConflictCommands(session.activation),
                    recoverySurface: null,
                    writes,
                });
                return { close, shutdown };
            },
            { wrapper },
        );
        act(() => runtime.emit('native-save-close'));
        await waitFor(() => expect(owner.result.current.close.state.phase).toBe('collecting'));
        act(() => void owner.result.current.close.choose('save'));
        await waitFor(() => expect(owner.result.current.close.state.phase).toBe('saving-active'));
        expect(owner.result.current.shutdown.pendingClose).toEqual({ id: 'native-save-close', owner: 'frontend' });
        expect(authorize).not.toHaveBeenCalled();
        act(() =>
            emitWarning({
                code: 'io',
                title: 'Saved',
                message: 'Warning',
                retryable: false,
                details: { saveWarning: warning },
            }),
        );
        expect(store.getState().notifications.items).toEqual([
            expect.objectContaining({ code: `save-warning-${warning}`, severity: 'warning' }),
        ]);
        await act(async () => finishSave({ status: 'saved', writtenContentRevision: 2 }));
        await waitFor(() => expect(authorize).toHaveBeenCalledWith('native-save-close'));
        expect(closePlanAdapter.prepareClose).toHaveBeenNthCalledWith(2, 'quit', ['one'], 1);
        expect(closePlanAdapter.executeClosePlan).toHaveBeenCalledWith('fresh-native');
        await waitFor(() => expect(owner.result.current.shutdown.pendingClose).toBeNull());
        expect(owner.result.current.close.state.phase).toBe('idle');
    },
);

it('shows an asynchronous save warning while the application remains open', async () => {
    let emitWarning!: (error: WireError) => void;
    await bootstrapAppModelProjection({
        ...appModelAdapter,
        getState: async () => ({
            activeBuffer: null,
            snapshot: {
                revision: 1,
                applicationVersion: 'test',
                activeDocumentId: 'one',
                orderedDocumentIds: ['one'],
                documents: { one: documentFixture('one', 0) },
                ui: {},
            },
        }),
        subscribeStatePatches: () => () => undefined,
        subscribeAsyncErrors: (listener) => {
            emitWarning = listener;
            return () => undefined;
        },
    });
    const owner = renderCloseWorkflow();
    act(() =>
        emitWarning({
            code: 'io',
            title: 'Saved',
            message: 'Warning',
            retryable: false,
            details: { saveWarning: 'durability' },
        }),
    );
    expect(store.getState().notifications.items).toEqual([
        expect.objectContaining({ code: 'save-warning-durability', severity: 'warning' }),
    ]);
    expect(store.getState().documents.orderedIds).toEqual(['one']);
    expect(owner.result.current.state.phase).toBe('idle');
});

it('cancels the terminal result when a target disappears during its save prompt', async () => {
    (closePlanAdapter.prepareClose as jest.Mock).mockResolvedValue({
        data: {
            id: 'plan',
            kind: 'window',
            status: 'collecting',
            tabSetRevision: 0,
            targets: [{ documentId: 'one', title: 'one', contentRevision: 1, dirty: true }],
        },
    });
    (closePlanAdapter.resolveClosePlan as jest.Mock).mockResolvedValue({
        data: { id: 'plan', kind: 'window', status: 'cancelled', tabSetRevision: 0, targets: [] },
    });
    const owner = renderCloseWorkflow();
    let outcome: Promise<string> | undefined;
    act(() => {
        outcome = owner.result.current.closeAllWindowTabs();
    });
    await waitFor(() => expect(owner.result.current.state.phase).toBe('collecting'));
    act(() => {
        store.dispatch(
            hydrateProjection({
                revision: 2,
                activeDocumentId: 'two',
                orderedDocumentIds: ['two'],
                documents: { two: { ...documentFixture('two'), dirty: false } },
                ui: {},
            }),
        );
    });
    await act(async () => {
        await expect(outcome).resolves.toBe('cancelled');
        await Promise.resolve();
    });
});

it('starts one native close for repeated early, hydrated, and live deliveries of the same identity', async () => {
    const recorder = createCommandRecorder();
    const getState = recorder.binding('GetState');
    (appModelAdapter.getState as jest.Mock).mockImplementation(() => getState({ id: 'close-state' }));
    const runtime = nativeRecorder();
    const owner = renderHook(
        ({ ready }) => {
            const session = useDocumentSession();
            const shutdown = useShutdown({
                bootstrapStatus: ready ? 'ready' : 'loading',
                hydratedPendingClose: { id: 'close-1', owner: 'frontend' },
                dependencies: { native: runtime.native, appModel: runtime.model },
            });
            return useCloseWorkflow({
                session,
                shutdown,
                conflicts: useConflictCommands(session.activation),
                recoverySurface: null,
                writes: unusedWrites,
            });
        },
        { initialProps: { ready: false }, wrapper },
    );
    act(() => {
        runtime.emit('close-1');
        runtime.emit('close-1');
    });
    expect(recorder.calls).toHaveLength(0);
    owner.rerender({ ready: true });
    act(() => {
        runtime.emit('close-1');
        runtime.emit('close-1');
    });
    await waitFor(() => expect(recorder.calls).toEqual([{ name: 'GetState', requestId: 'close-state', args: [] }]));
    expect(owner.result.current.state.phase).toBe('preparing');
    owner.unmount();
    runtime.emit('close-2');
    expect(recorder.calls).toHaveLength(1);
});

it('retains the native pending identity while recovery cancellation awaits its acknowledgement', async () => {
    const runtime = nativeRecorder();
    const owner = renderHook(
        () => {
            const session = useDocumentSession();
            const shutdown = useShutdown({
                bootstrapStatus: 'ready',
                hydratedPendingClose: null,
                dependencies: { native: runtime.native, appModel: runtime.model },
            });
            const close = useCloseWorkflow({
                session,
                shutdown,
                conflicts: useConflictCommands(session.activation),
                recoverySurface: {
                    savedOnDisk: true,
                    persistent: true,
                    closeBlocked: true,
                    commandsBlocked: true,
                    message: 'Saved; recovery unavailable.',
                },
                writes: unusedWrites,
            });
            return { close, shutdown };
        },
        { wrapper },
    );
    act(() => runtime.emit('recovery-close'));
    await waitFor(() => expect(owner.result.current.close.state.phase).toBe('recovery-confirmation'));
    expect(owner.result.current.close.recoveryDiscardNames).toEqual(['\u2068one.md\u2069']);
    act(() => {
        void owner.result.current.close.decideRecovery(false);
    });
    await waitFor(() =>
        expect(runtime.recorder.calls).toEqual([
            { name: 'CancelQuit', requestId: 'cancel-command', args: ['recovery-close'] },
        ]),
    );
    expect(owner.result.current.close.state.phase).toBe('cancelling');
    expect(owner.result.current.shutdown.pendingClose).toEqual({ id: 'recovery-close', owner: 'frontend' });
    expect(owner.result.current.close.active).toBe(true);
});

it.each([false, true])(
    'accepts recovery confirmation=%s once when recovery fails during the initial native state read',
    async (confirm) => {
        const recorder = createCommandRecorder();
        const getState = recorder.binding('GetState');
        (appModelAdapter.getState as jest.Mock).mockImplementation(() => getState({ id: 'close-state' }));
        const runtime = nativeRecorder();
        const owner = renderHook(
            ({ recoveryFailed }) => {
                const session = useDocumentSession();
                const shutdown = useShutdown({
                    bootstrapStatus: 'ready',
                    hydratedPendingClose: null,
                    dependencies: { native: runtime.native, appModel: runtime.model },
                });
                const close = useCloseWorkflow({
                    session,
                    shutdown,
                    conflicts: useConflictCommands(session.activation),
                    recoverySurface: recoveryFailed
                        ? {
                              savedOnDisk: true,
                              persistent: true,
                              closeBlocked: true,
                              commandsBlocked: true,
                              message: 'Saved; recovery unavailable.',
                          }
                        : null,
                    writes: unusedWrites,
                });
                return { close, shutdown };
            },
            { initialProps: { recoveryFailed: false }, wrapper },
        );
        act(() => runtime.emit('recovery-close'));
        await waitFor(() => expect(recorder.calls).toHaveLength(1));
        expect(owner.result.current.close.state.phase).toBe('preparing');
        owner.rerender({ recoveryFailed: true });
        expect(owner.result.current.close.state.phase).toBe('recovery-confirmation');

        const decide = owner.result.current.close.decideRecovery;
        act(() => {
            void decide(confirm);
            void decide(confirm);
        });
        expect(owner.result.current.close.state.phase).toBe(confirm ? 'preparing' : 'cancelling');
        expect(owner.result.current.shutdown.pendingClose).toEqual({ id: 'recovery-close', owner: 'frontend' });
        expect(recorder.calls).toHaveLength(confirm ? 2 : 1);
        expect(runtime.recorder.calls).toEqual(
            confirm ? [] : [{ name: 'CancelQuit', requestId: 'cancel-command', args: ['recovery-close'] }],
        );
    },
);

it('refuses repeated closes on buffer sync failure without duplicate operation errors', async () => {
    store.dispatch(resetNotifications());
    const { markBufferSyncError } = await import('../../src/logic/utils/bufferSyncError');
    const error = markBufferSyncError({ code: 'io', title: 'Sync', message: 'Failed', retryable: true });
    (appModelAdapter.flushActiveSession as jest.Mock).mockRejectedValue(error);
    const runtime = nativeRecorder();
    const owner = renderHook(
        () => {
            const session = useDocumentSession();
            const shutdown = useShutdown({
                bootstrapStatus: 'ready',
                hydratedPendingClose: null,
                dependencies: { native: runtime.native, appModel: runtime.model },
            });
            const close = useCloseWorkflow({
                session,
                shutdown,
                conflicts: useConflictCommands(session.activation),
                recoverySurface: null,
                writes: unusedWrites,
            });
            return { session, close };
        },
        { wrapper },
    );
    act(() =>
        owner.result.current.session.onBootstrapReady({
            status: 'ready',
            applicationVersion: 'test',
            activeBuffer: { documentId: 'one', content: 'draft', documentRevision: 0 },
        }),
    );
    await act(async () => {
        expect((await owner.result.current.close.onCloseDocument('one', 0)).status).toBe('refused');
        expect((await owner.result.current.close.onCloseDocument('one', 0)).status).toBe('refused');
    });
    expect(closePlanAdapter.prepareClose).not.toHaveBeenCalled();
    expect(store.getState().notifications.items).toHaveLength(0);
});

it('cancels a background close plan before reloading and prepares the original target again', async () => {
    const preview = conflictFixture('two', 1);
    const target = { documentId: 'two', title: 'two.md', contentRevision: 1, dirty: true };
    const old: ClosePlanSummary = {
        id: 'old',
        kind: 'single',
        status: 'collecting',
        tabSetRevision: 1,
        targets: [target],
    };
    const fresh: ClosePlanSummary = {
        ...old,
        id: 'fresh',
        status: 'ready',
        tabSetRevision: 2,
        targets: [{ ...target, contentRevision: 2, dirty: false }],
    };
    const prepare = jest.mocked(closePlanAdapter.prepareClose);
    const resolve = jest.mocked(closePlanAdapter.resolveClosePlan);
    const reload = jest.mocked(documentConflictAdapter.reloadFromDisk);
    const getState = jest.mocked(appModelAdapter.getState);
    const execute = jest.mocked(closePlanAdapter.executeClosePlan);
    prepare.mockResolvedValueOnce({ data: old }).mockResolvedValueOnce({ data: fresh });
    resolve
        .mockResolvedValueOnce({ data: { ...old, targets: [{ ...target, choice: 'save', conflict: preview }] } })
        .mockResolvedValueOnce({ data: { ...old, status: 'cancelled' } })
        .mockResolvedValueOnce({ data: fresh });
    reload.mockResolvedValueOnce({ status: 'reloaded', documentRevision: 2 });
    getState.mockResolvedValueOnce({
        activeBuffer: null,
        snapshot: {
            revision: 2,
            tabSetRevision: 2,
            activeDocumentId: 'one',
            orderedDocumentIds: ['one', 'two'],
            documents: { one: documentFixture(), two: { ...documentFixture('two', 2), dirty: false } },
            ui: {},
        },
    });
    execute.mockResolvedValueOnce({ status: 'closed', orderedDocumentIds: ['one'] });
    const writes = { saveForClose: jest.fn() };
    const owner = renderCloseWorkflow(writes);

    await act(async () => {
        await owner.result.current.onCloseDocument('two', 1);
        await owner.result.current.choose('save');
    });
    expect(owner.result.current.conflict?.preview).toEqual(preview);
    await act(async () => owner.result.current.conflict?.onDecision('reload'));

    expect(resolve.mock.calls).toEqual([
        ['old', [{ choice: 'save', documentId: 'two' }]],
        ['old', [{ choice: 'cancel' }]],
        ['fresh', []],
    ]);
    expect(reload).toHaveBeenCalledWith('two', 1, preview.detectedDiskVersion);
    expect(prepare).toHaveBeenNthCalledWith(2, 'single', ['two'], 2);
    expect(execute).toHaveBeenCalledWith('fresh');
    const continuation = [
        resolve.mock.invocationCallOrder[1],
        reload.mock.invocationCallOrder[0],
        getState.mock.invocationCallOrder[0],
        prepare.mock.invocationCallOrder[1],
        resolve.mock.invocationCallOrder[2],
        execute.mock.invocationCallOrder[0],
    ];
    expect(continuation).toEqual(continuation.toSorted((a, b) => a - b));
    expect(writes.saveForClose).not.toHaveBeenCalled();
    expect(owner.result.current.state.phase).toBe('idle');
});

it('routes a close-induced activation conflict through the external conflict owner', async () => {
    const onExternalConflict = jest.fn();
    (closePlanAdapter.prepareClose as jest.Mock).mockResolvedValue({
        data: { id: 'plan', kind: 'single', status: 'ready', tabSetRevision: 0, targets: [] },
    });
    (closePlanAdapter.resolveClosePlan as jest.Mock).mockResolvedValue({
        data: { id: 'plan', kind: 'single', status: 'ready', tabSetRevision: 0, targets: [] },
    });
    (closePlanAdapter.executeClosePlan as jest.Mock).mockResolvedValue({
        status: 'closed',
        orderedDocumentIds: ['two'],
        activeDocumentId: 'two',
        conflict: conflictFixture('two'),
    });
    const owner = renderCloseWorkflow(undefined, onExternalConflict);
    await act(async () => {
        await owner.result.current.onCloseDocument('one', 0);
    });
    expect(onExternalConflict).toHaveBeenCalledWith(conflictFixture('two'));
});
