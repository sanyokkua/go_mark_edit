import type { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';

jest.mock('../../src/logic/adapter', () => ({ appModelAdapter: { getState: jest.fn() } }));

import { appModelAdapter, type NativeLifecycleAdapter } from '../../src/logic/adapter';
import { store } from '../../src/logic/store';
import { hydrateProjection, resetProjection } from '../../src/logic/store/appModelProjectionActions';
import { useDocumentSession } from '../../src/app/useDocumentSession';
import { useCloseWorkflow } from '../../src/app/useCloseWorkflow';
import { useConflictCommands } from '../../src/app/useConflictCommands';
import { useShutdown } from '../../src/app/useShutdown';
import { createCommandRecorder } from '../support/commandRecorder';
import { documentFixture } from '../support/appFixtures';

const wrapper = ({ children }: PropsWithChildren): React.JSX.Element => <Provider store={store}>{children}</Provider>;

function nativeRecorder() {
    const recorder = createCommandRecorder();
    let listener: ((id?: string) => void) | undefined;
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
        cancelQuit: (id) => cancel({ id: 'cancel-command' }, id),
        authorizeQuit: (id) => authorize({ id: 'authorize-command' }, id),
    };
    return { native, recorder, emit: (id: string) => listener?.(id) };
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
    store.dispatch(resetProjection());
    jest.clearAllMocks();
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
                hydratedPendingCloseId: 'close-1',
                dependencies: { native: runtime.native },
            });
            return useCloseWorkflow({
                session,
                shutdown,
                conflicts: useConflictCommands(session.activation),
                recoverySurface: null,
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
                hydratedPendingCloseId: null,
                dependencies: { native: runtime.native },
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
            });
            return { close, shutdown };
        },
        { wrapper },
    );
    act(() => runtime.emit('recovery-close'));
    expect(owner.result.current.close.state.phase).toBe('recovery-confirmation');
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
    expect(owner.result.current.shutdown.pendingClose).toBe('recovery-close');
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
                    hydratedPendingCloseId: null,
                    dependencies: { native: runtime.native },
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
        expect(owner.result.current.shutdown.pendingClose).toBe('recovery-close');
        expect(recorder.calls).toHaveLength(confirm ? 2 : 1);
        expect(runtime.recorder.calls).toEqual(
            confirm ? [] : [{ name: 'CancelQuit', requestId: 'cancel-command', args: ['recovery-close'] }],
        );
    },
);
