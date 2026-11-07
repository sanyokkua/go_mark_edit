import type { PropsWithChildren } from 'react';
import { act, fireEvent, renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';

jest.mock('../../src/logic/adapter', () => ({
    documentConflictAdapter: {
        checkExternalChanges: jest.fn(),
        authorizeKeepMine: jest.fn(),
        reloadFromDisk: jest.fn(),
        skipConflict: jest.fn(),
        cancelConflict: jest.fn(),
    },
}));

import { documentConflictAdapter } from '../../src/logic/adapter';
import { useDocumentSession } from '../../src/app/useDocumentSession';
import { useExternalChanges } from '../../src/app/useExternalChanges';
import { useConflictCommands } from '../../src/app/useConflictCommands';
import { store } from '../../src/logic/store';
import { hydrateProjection, resetProjection } from '../../src/logic/store/appModelProjectionActions';
import { conflictFixture, documentFixture } from '../support/appFixtures';
import { createCommandRecorder } from '../support/commandRecorder';

const wrapper = ({ children }: PropsWithChildren): React.JSX.Element => <Provider store={store}>{children}</Provider>;

function renderOwner(blocked = false) {
    return renderHook(
        ({ suspended }) => {
            const session = useDocumentSession();
            return useExternalChanges({
                session,
                conflicts: useConflictCommands(session.activation),
                bootstrapStatus: 'ready',
                blocked: suspended,
            });
        },
        { initialProps: { suspended: blocked }, wrapper },
    );
}

beforeEach(() => {
    store.dispatch(
        hydrateProjection({
            revision: 1,
            tabSetRevision: 1,
            activeDocumentId: 'one',
            orderedDocumentIds: ['one', 'two'],
            documents: { one: documentFixture(), two: documentFixture('two') },
            ui: {},
        }),
    );
});
afterEach(() => {
    store.dispatch(resetProjection());
    jest.clearAllMocks();
});

it('coalesces foreground events while a real owner check is in flight and disposes its listener', async () => {
    const recorder = createCommandRecorder();
    const check = recorder.binding('CheckExternalChanges', 1);
    (documentConflictAdapter.checkExternalChanges as jest.Mock).mockImplementation((id: string) =>
        check({ id: 'foreground-1' }, id),
    );
    const owner = renderOwner();
    fireEvent.focus(window);
    fireEvent.focus(window);
    fireEvent.focus(window);
    await waitFor(() =>
        expect(recorder.calls).toEqual([{ name: 'CheckExternalChanges', requestId: 'foreground-1', args: ['one'] }]),
    );
    owner.unmount();
    fireEvent.focus(window);
    expect(recorder.calls).toHaveLength(1);
});

it('keeps a deferred comparison hidden until the production owner rechecks it', async () => {
    const recorder = createCommandRecorder();
    const check = recorder.binding('CheckExternalChanges', 1);
    (documentConflictAdapter.checkExternalChanges as jest.Mock).mockImplementation((id: string) =>
        check({ id: 'deferred-1' }, id),
    );
    const owner = renderOwner();
    act(() => owner.result.current.receiveConflict(conflictFixture()));
    expect(owner.result.current.conflict?.preview.documentId).toBe('one');
    owner.rerender({ suspended: true });
    expect(owner.result.current.conflict).toBeNull();
    owner.rerender({ suspended: false });
    await waitFor(() =>
        expect(recorder.calls).toEqual([{ name: 'CheckExternalChanges', requestId: 'deferred-1', args: ['one'] }]),
    );
    expect(owner.result.current.conflict).toBeNull();
});

it('clears a foreground comparison after a deferred write saves the document', async () => {
    const check = documentConflictAdapter.checkExternalChanges as jest.Mock;
    check.mockResolvedValueOnce({ status: 'detected', preview: conflictFixture() });
    check.mockResolvedValueOnce({ status: 'unchanged' });
    const owner = renderOwner();
    act(() => owner.result.current.receiveConflict(conflictFixture()));
    owner.rerender({ suspended: true });
    owner.rerender({ suspended: false });
    await waitFor(() => expect(owner.result.current.conflict).not.toBeNull());
    await waitFor(() => expect(check).toHaveBeenCalledTimes(1));

    act(() => {
        store.dispatch(
            hydrateProjection({
                revision: 2,
                tabSetRevision: 1,
                activeDocumentId: 'one',
                orderedDocumentIds: ['one', 'two'],
                documents: {
                    one: { ...documentFixture(), dirty: false, status: 'saved' },
                    two: documentFixture('two'),
                },
                ui: {},
            }),
        );
    });
    await waitFor(() => expect(check).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(owner.result.current.conflict).toBeNull());
});

it('rechecks a saved document even when an older foreground check completes afterward', async () => {
    let resolveOlder!: (result: { status: string; preview: ReturnType<typeof conflictFixture> }) => void;
    const older = new Promise<{ status: string; preview: ReturnType<typeof conflictFixture> }>((resolve) => {
        resolveOlder = resolve;
    });
    const check = documentConflictAdapter.checkExternalChanges as jest.Mock;
    check.mockImplementationOnce(() => older).mockResolvedValueOnce({ status: 'unchanged' });
    const owner = renderOwner();
    act(() => owner.result.current.receiveConflict(conflictFixture()));
    owner.rerender({ suspended: true });
    owner.rerender({ suspended: false });
    await waitFor(() => expect(check).toHaveBeenCalledTimes(1));

    act(() => {
        store.dispatch(
            hydrateProjection({
                revision: 2,
                tabSetRevision: 1,
                activeDocumentId: 'one',
                orderedDocumentIds: ['one', 'two'],
                documents: {
                    one: { ...documentFixture(), dirty: false, status: 'saved' },
                    two: documentFixture('two'),
                },
                ui: {},
            }),
        );
        resolveOlder({ status: 'detected', preview: conflictFixture() });
    });
    await waitFor(() => expect(check).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(owner.result.current.conflict).toBeNull());
});

it('does not replace a newer foreground comparison with an older saved-document result', async () => {
    let resolveCheck!: (result: { status: string }) => void;
    const checkResult = new Promise<{ status: string }>((resolve) => {
        resolveCheck = resolve;
    });
    const check = documentConflictAdapter.checkExternalChanges as jest.Mock;
    check.mockImplementationOnce(() => checkResult);
    const owner = renderOwner();
    act(() => owner.result.current.receiveConflict(conflictFixture()));
    act(() => {
        store.dispatch(
            hydrateProjection({
                revision: 2,
                tabSetRevision: 1,
                activeDocumentId: 'one',
                orderedDocumentIds: ['one', 'two'],
                documents: {
                    one: { ...documentFixture(), dirty: false, status: 'saved' },
                    two: documentFixture('two'),
                },
                ui: {},
            }),
        );
    });
    await waitFor(() => expect(check).toHaveBeenCalledTimes(1));
    const newer = {
        ...conflictFixture(),
        detectedDiskVersion: { ...conflictFixture().detectedDiskVersion, modifiedUnixNano: '300' },
    };
    act(() => owner.result.current.receiveConflict(newer));
    await act(async () => resolveCheck({ status: 'unchanged' }));
    await waitFor(() =>
        expect(owner.result.current.conflict?.preview.detectedDiskVersion.modifiedUnixNano).toBe('300'),
    );
});

it('removes a pending comparison when its document closes', () => {
    const owner = renderOwner();
    act(() => owner.result.current.receiveConflict(conflictFixture()));
    act(() => {
        store.dispatch(
            hydrateProjection({ revision: 2, activeDocumentId: null, orderedDocumentIds: [], documents: {}, ui: {} }),
        );
    });
    expect(owner.result.current.conflict).toBeNull();
});

it('routes foreground Keep mine to authorization without issuing a write', async () => {
    const recorder = createCommandRecorder();
    const authorize = recorder.binding('AuthorizeKeepMine', 4);
    (documentConflictAdapter.authorizeKeepMine as jest.Mock).mockImplementation((...args: unknown[]) =>
        authorize({ id: 'authorize-1' }, ...args),
    );
    const owner = renderOwner();
    act(() => owner.result.current.receiveConflict(conflictFixture()));
    act(() => {
        void owner.result.current.conflict?.onDecision('keep-mine');
    });
    await waitFor(() =>
        expect(recorder.calls).toEqual([
            {
                name: 'AuthorizeKeepMine',
                requestId: 'authorize-1',
                args: ['one', 0, '/documents/one.md', { exists: true, size: 5, mode: 420, modifiedUnixNano: '200' }],
            },
        ]),
    );
});

it('does not inspect files on a timer and checks path-backed documents on resume', () => {
    jest.useFakeTimers();
    const recorder = createCommandRecorder();
    const check = recorder.binding('CheckExternalChanges', 1);
    (documentConflictAdapter.checkExternalChanges as jest.Mock).mockImplementation((id: string) =>
        check({ id: 'resume' }, id),
    );
    const owner = renderOwner();
    try {
        act(() => jest.advanceTimersByTime(120_000));
        expect(recorder.calls).toHaveLength(0);
        fireEvent(globalThis.document, new Event('visibilitychange'));
        expect(recorder.calls).toEqual([{ name: 'CheckExternalChanges', requestId: 'resume', args: ['one'] }]);
        act(() => jest.advanceTimersByTime(120_000));
        expect(recorder.calls).toHaveLength(1);
    } finally {
        owner.unmount();
        jest.useRealTimers();
    }
});

it('queues changed background documents in tab order after a foreground check', async () => {
    act(() => {
        store.dispatch(
            hydrateProjection({
                revision: 2,
                tabSetRevision: 2,
                activeDocumentId: 'one',
                orderedDocumentIds: ['one', 'two', 'three'],
                documents: { one: documentFixture(), two: documentFixture('two'), three: documentFixture('three') },
                ui: {},
            }),
        );
    });
    (documentConflictAdapter.checkExternalChanges as jest.Mock).mockImplementation(async (id: string) =>
        id === 'one' ? { status: 'unchanged' } : { status: 'detected', preview: conflictFixture(id) },
    );
    (documentConflictAdapter.skipConflict as jest.Mock).mockResolvedValue({ status: 'skipped' });
    const owner = renderOwner();
    fireEvent.focus(window);
    await waitFor(() => expect(owner.result.current.conflict?.preview.documentId).toBe('two'));
    await act(async () => owner.result.current.conflict?.onDecision('skip'));
    await waitFor(() => expect(owner.result.current.conflict?.preview.documentId).toBe('three'));
    await act(async () => owner.result.current.conflict?.onDecision('skip'));
    expect(owner.result.current.conflict).toBeNull();
});

it('does not discard a newer comparison when an older foreground check returns unchanged', async () => {
    let resolveCheck!: (result: { status: string }) => void;
    (documentConflictAdapter.checkExternalChanges as jest.Mock)
        .mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    resolveCheck = resolve;
                }),
        )
        .mockResolvedValue({ status: 'unchanged' });
    const owner = renderOwner();
    fireEvent.focus(window);
    act(() => owner.result.current.receiveConflict(conflictFixture()));
    await act(async () => resolveCheck({ status: 'unchanged' }));
    expect(owner.result.current.conflict?.preview.documentId).toBe('one');
});

it('rechecks every queued comparison after a higher-priority workflow ends', async () => {
    const check = documentConflictAdapter.checkExternalChanges as jest.Mock;
    check.mockImplementation(async (id: string) => ({ status: 'detected', preview: conflictFixture(id) }));
    (documentConflictAdapter.skipConflict as jest.Mock).mockResolvedValue({ status: 'skipped' });
    const owner = renderOwner(true);
    act(() => {
        owner.result.current.receiveConflict(conflictFixture('two'));
        owner.result.current.receiveConflict(conflictFixture('one'));
    });
    expect(owner.result.current.conflict).toBeNull();
    owner.rerender({ suspended: false });
    await waitFor(() => expect(owner.result.current.conflict?.preview.documentId).toBe('one'));
    await act(async () => owner.result.current.conflict?.onDecision('skip'));
    await waitFor(() => expect(owner.result.current.conflict?.preview.documentId).toBe('two'));
    expect(check.mock.calls.map(([id]) => id)).toEqual(['one', 'two']);
});

it('drops a closed queued document and rechecks the next open document', async () => {
    act(() => {
        store.dispatch(
            hydrateProjection({
                revision: 2,
                tabSetRevision: 2,
                activeDocumentId: 'one',
                orderedDocumentIds: ['one', 'two', 'three'],
                documents: { one: documentFixture(), two: documentFixture('two'), three: documentFixture('three') },
                ui: {},
            }),
        );
    });
    (documentConflictAdapter.checkExternalChanges as jest.Mock).mockResolvedValue({
        status: 'detected',
        preview: conflictFixture('three'),
    });
    const owner = renderOwner();
    act(() => {
        owner.result.current.receiveConflict(conflictFixture('two'));
        owner.result.current.receiveConflict(conflictFixture('three'));
    });
    expect(owner.result.current.conflict?.preview.documentId).toBe('two');
    act(() => {
        store.dispatch(
            hydrateProjection({
                revision: 3,
                tabSetRevision: 3,
                activeDocumentId: 'one',
                orderedDocumentIds: ['one', 'three'],
                documents: { one: documentFixture(), three: documentFixture('three') },
                ui: {},
            }),
        );
    });
    await waitFor(() => expect(owner.result.current.conflict?.preview.documentId).toBe('three'));
});

it('reloading a background comparison leaves the active editor buffer intact', async () => {
    (documentConflictAdapter.reloadFromDisk as jest.Mock).mockResolvedValue({ status: 'reloaded' });
    const owner = renderHook(
        () => {
            const session = useDocumentSession();
            const external = useExternalChanges({
                session,
                conflicts: useConflictCommands(session.activation),
                bootstrapStatus: 'ready',
                blocked: false,
            });
            return { session, external };
        },
        { wrapper },
    );
    act(() => {
        owner.result.current.session.onBootstrapReady({
            status: 'ready',
            activeBuffer: { documentId: 'one', content: 'active text' },
        } as Parameters<typeof owner.result.current.session.onBootstrapReady>[0]);
        owner.result.current.external.receiveConflict(conflictFixture('two'));
    });
    await act(async () => owner.result.current.external.conflict?.onDecision('reload'));
    expect(owner.result.current.session.activeBuffer).toEqual({ documentId: 'one', content: 'active text' });
});

it('does not invalidate an in-flight editor activation when reloading a background document', async () => {
    (documentConflictAdapter.reloadFromDisk as jest.Mock).mockResolvedValue({ status: 'reloaded' });
    const owner = renderHook(
        () => {
            const session = useDocumentSession();
            const commands = useConflictCommands(session.activation);
            return { session, commands };
        },
        { wrapper },
    );
    const generation = owner.result.current.session.activation.begin();
    await act(async () => {
        await owner.result.current.commands.execute('reload', conflictFixture('two'));
    });
    act(() => {
        owner.result.current.session.activation.acknowledge(
            generation,
            { documentId: 'one', content: 'activated', documentRevision: 0, projectionRevision: 2 },
            'one',
        );
        store.dispatch(
            hydrateProjection({
                revision: 2,
                activeDocumentId: 'one',
                orderedDocumentIds: ['one', 'two'],
                documents: { one: documentFixture(), two: documentFixture('two') },
                ui: {},
            }),
        );
    });
    await waitFor(() => expect(owner.result.current.session.activeBuffer?.content).toBe('activated'));
});

it('does not install a background reload response overtaken by a later activation', async () => {
    let resolveReload!: (result: unknown) => void;
    (documentConflictAdapter.reloadFromDisk as jest.Mock).mockImplementation(
        () =>
            new Promise((resolve) => {
                resolveReload = resolve;
            }),
    );
    const owner = renderHook(
        () => {
            const session = useDocumentSession();
            return { session, commands: useConflictCommands(session.activation) };
        },
        { wrapper },
    );
    let reload!: Promise<unknown>;
    act(() => {
        reload = owner.result.current.commands.execute('reload', conflictFixture('two'));
    });
    const generation = owner.result.current.session.activation.begin();
    act(() => {
        store.dispatch(
            hydrateProjection({
                revision: 3,
                activeDocumentId: 'one',
                orderedDocumentIds: ['one', 'two'],
                documents: { one: documentFixture(), two: documentFixture('two') },
                ui: {},
            }),
        );
        owner.result.current.session.activation.acknowledge(
            generation,
            { documentId: 'one', content: 'newer', documentRevision: 0, projectionRevision: 3 },
            'one',
        );
    });
    await act(async () => {
        resolveReload({
            status: 'reloaded',
            activeBuffer: { documentId: 'two', content: 'late', documentRevision: 0, projectionRevision: 2 },
        });
        await reload;
    });
    expect(owner.result.current.session.activeBuffer?.content).toBe('newer');
});

it('keeps a pending tab switch valid when the old active document reloads first', async () => {
    (documentConflictAdapter.reloadFromDisk as jest.Mock).mockResolvedValue({
        status: 'reloaded',
        activeBuffer: {
            documentId: 'one',
            content: 'reloaded',
            documentRevision: 0,
            projectionRevision: 1,
        },
    });
    const owner = renderHook(
        () => {
            const session = useDocumentSession();
            return { session, commands: useConflictCommands(session.activation) };
        },
        { wrapper },
    );
    const generation = owner.result.current.session.activation.begin();
    await act(async () => {
        await owner.result.current.commands.execute('reload', conflictFixture('one'));
    });
    act(() => {
        store.dispatch(
            hydrateProjection({
                revision: 2,
                activeDocumentId: 'two',
                orderedDocumentIds: ['one', 'two'],
                documents: { one: documentFixture(), two: documentFixture('two') },
                ui: {},
            }),
        );
        owner.result.current.session.activation.acknowledge(
            generation,
            { documentId: 'two', content: 'switched', documentRevision: 0, projectionRevision: 2 },
            'two',
        );
    });
    await waitFor(() => expect(owner.result.current.session.activeBuffer?.content).toBe('switched'));
});

it('installs an active reload when its updated projection arrives', async () => {
    (documentConflictAdapter.reloadFromDisk as jest.Mock).mockResolvedValue({
        status: 'reloaded',
        activeBuffer: {
            documentId: 'one',
            content: 'disk',
            documentRevision: 1,
            projectionRevision: 2,
        },
    });
    const owner = renderHook(
        () => {
            const session = useDocumentSession();
            return { session, commands: useConflictCommands(session.activation) };
        },
        { wrapper },
    );
    await act(async () => {
        await owner.result.current.commands.execute('reload', conflictFixture('one'));
    });
    expect(owner.result.current.session.activeBuffer).toBeNull();
    act(() => {
        store.dispatch(
            hydrateProjection({
                revision: 2,
                activeDocumentId: 'one',
                orderedDocumentIds: ['one', 'two'],
                documents: { one: documentFixture('one', 1), two: documentFixture('two') },
                ui: {},
            }),
        );
    });
    await waitFor(() => expect(owner.result.current.session.activeBuffer?.content).toBe('disk'));
    expect(owner.result.current.session.externalEpoch).toBe(1);
});

it('rechecks a queued dirty document after the first comparison is resolved', async () => {
    let resolveRecheck!: (result: unknown) => void;
    const check = documentConflictAdapter.checkExternalChanges as jest.Mock;
    check.mockImplementation(
        () =>
            new Promise((resolve) => {
                resolveRecheck = resolve;
            }),
    );
    (documentConflictAdapter.skipConflict as jest.Mock).mockResolvedValue({ status: 'skipped' });
    const owner = renderOwner();
    act(() => {
        owner.result.current.receiveConflict(conflictFixture('one'));
        owner.result.current.receiveConflict(conflictFixture('two'));
    });
    await act(async () => owner.result.current.conflict?.onDecision('skip'));
    await waitFor(() => expect(check).toHaveBeenCalledWith('two'));
    expect(owner.result.current.conflict).toBeNull();
    const changed = { ...conflictFixture('two'), onDisk: { text: 'new disk', byteCount: 8, lineCount: 1 } };
    await act(async () => resolveRecheck({ status: 'detected', preview: changed }));
    await waitFor(() => expect(owner.result.current.conflict?.preview.onDisk.text).toBe('new disk'));
});

it.each(['reload', 'keep-mine'] as const)(
    'refreshes a stale %s refusal without a replacement preview',
    async (decision) => {
        let resolveRecheck!: (result: unknown) => void;
        const check = documentConflictAdapter.checkExternalChanges as jest.Mock;
        check.mockImplementation(
            () =>
                new Promise((resolve) => {
                    resolveRecheck = resolve;
                }),
        );
        const command =
            decision === 'reload' ? documentConflictAdapter.reloadFromDisk : documentConflictAdapter.authorizeKeepMine;
        (command as jest.Mock).mockResolvedValue({
            status: 'refused',
            error: { category: 'conflict', message: 'changed', dedupKey: 'stale' },
        });
        const owner = renderOwner();
        act(() => owner.result.current.receiveConflict(conflictFixture()));
        await act(async () => owner.result.current.conflict?.onDecision(decision));
        await waitFor(() => expect(check).toHaveBeenCalledWith('one'));
        expect(owner.result.current.conflict).toBeNull();
        const changed = { ...conflictFixture(), onDisk: { text: 'new disk', byteCount: 8, lineCount: 1 } };
        await act(async () => resolveRecheck({ status: 'detected', preview: changed }));
        await waitFor(() => expect(owner.result.current.conflict?.preview.onDisk.text).toBe('new disk'));
    },
);

it('discards a deferred recheck overtaken by a higher-priority workflow', async () => {
    let resolveOld!: (result: unknown) => void;
    let resolveNew!: (result: unknown) => void;
    const check = documentConflictAdapter.checkExternalChanges as jest.Mock;
    check
        .mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    resolveOld = resolve;
                }),
        )
        .mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    resolveNew = resolve;
                }),
        );
    const owner = renderOwner(true);
    act(() => owner.result.current.receiveConflict(conflictFixture()));
    owner.rerender({ suspended: false });
    await waitFor(() => expect(check).toHaveBeenCalledTimes(1));
    owner.rerender({ suspended: true });
    await act(async () => resolveOld({ status: 'detected', preview: conflictFixture() }));
    expect(owner.result.current.conflict).toBeNull();
    owner.rerender({ suspended: false });
    await waitFor(() => expect(check).toHaveBeenCalledTimes(2));
    expect(owner.result.current.conflict).toBeNull();
    const changed = { ...conflictFixture(), onDisk: { text: 'latest', byteCount: 6, lineCount: 1 } };
    await act(async () => resolveNew({ status: 'detected', preview: changed }));
    await waitFor(() => expect(owner.result.current.conflict?.preview.onDisk.text).toBe('latest'));
});

it('does not replace a newer comparison with a delayed queued recheck', async () => {
    let resolveCheck!: (result: unknown) => void;
    (documentConflictAdapter.checkExternalChanges as jest.Mock).mockImplementation(
        () =>
            new Promise((resolve) => {
                resolveCheck = resolve;
            }),
    );
    (documentConflictAdapter.skipConflict as jest.Mock).mockResolvedValue({ status: 'skipped' });
    const owner = renderOwner();
    act(() => {
        owner.result.current.receiveConflict(conflictFixture('one'));
        owner.result.current.receiveConflict(conflictFixture('two'));
    });
    await act(async () => owner.result.current.conflict?.onDecision('skip'));
    await waitFor(() => expect(documentConflictAdapter.checkExternalChanges).toHaveBeenCalledWith('two'));
    const newer = { ...conflictFixture('two'), onDisk: { text: 'newer', byteCount: 5, lineCount: 1 } };
    act(() => owner.result.current.receiveConflict(newer));
    await act(async () => resolveCheck({ status: 'detected', preview: conflictFixture('two') }));
    expect(owner.result.current.conflict?.preview.onDisk.text).toBe('newer');
});
