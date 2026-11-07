import { act, renderHook, waitFor } from '@testing-library/react';
import { useShutdown } from '../../src/app/useShutdown';
import type { NativeLifecycleAdapter } from '../../src/logic/adapter';
import type { PendingClose } from '../../src/logic/store/appModelTypes';

it('hydrates native ownership without treating it as a frontend close', async () => {
    const native = {
        onCloseRequested: () => () => undefined,
        requestQuit: () => undefined,
        authorizeQuit: async () => undefined,
        cancelQuit: async () => undefined,
        acknowledgeRecoveryClose: async () => undefined,
        discardAndAuthorizeQuit: async () => undefined,
    } satisfies NativeLifecycleAdapter;
    const { result } = renderHook(() =>
        useShutdown({
            bootstrapStatus: 'ready',
            hydratedState: {
                snapshot: {
                    revision: 1,
                    documents: {},
                    activeDocumentId: null,
                    ui: {},
                    pendingClose: { id: 'one', owner: 'native' },
                },
            },
            dependencies: { native },
        }),
    );
    await waitFor(() => expect(result.current.pendingClose).toEqual({ id: 'one', owner: 'native' }));
});

it('reconciles native takeover and cancellation from authoritative state', async () => {
    let current: PendingClose | undefined = { id: 'one', owner: 'frontend' };
    let notify: (() => void) | undefined;
    const native = {
        onCloseRequested: (listener: () => void) => {
            notify = listener;
            return () => {
                notify = undefined;
            };
        },
        requestQuit: () => undefined,
        authorizeQuit: async () => undefined,
        cancelQuit: async () => undefined,
        acknowledgeRecoveryClose: async () => undefined,
        discardAndAuthorizeQuit: async () => undefined,
    } satisfies NativeLifecycleAdapter;
    const model = {
        getState: async () => ({
            snapshot: { revision: 1, documents: {}, activeDocumentId: null, ui: {}, pendingClose: current },
            activeBuffer: null,
        }),
    };
    const { result } = renderHook(() =>
        useShutdown({
            bootstrapStatus: 'ready',
            hydratedPendingClose: current,
            dependencies: { native, appModel: model },
        }),
    );
    await waitFor(() => expect(result.current.pendingClose?.owner).toBe('frontend'));
    current = { id: 'one', owner: 'native' };
    act(() => notify?.());
    await waitFor(() => expect(result.current.pendingClose?.owner).toBe('native'));
    current = undefined;
    act(() => notify?.());
    await waitFor(() => expect(result.current.pendingClose).toBeNull());
});

it('ignores older discovery results and does not resurrect an acknowledged cancellation', async () => {
    type State = {
        snapshot: {
            revision: number;
            documents: Record<string, never>;
            activeDocumentId: null;
            ui: Record<string, never>;
            pendingClose?: PendingClose;
        };
        activeBuffer: null;
    };
    const waiting: Array<(state: State) => void> = [];
    let notify: (() => void) | undefined;
    const native = {
        onCloseRequested: (listener: () => void) => {
            notify = listener;
            return () => {
                notify = undefined;
            };
        },
        requestQuit: () => undefined,
        authorizeQuit: async () => undefined,
        cancelQuit: async () => undefined,
        acknowledgeRecoveryClose: async () => undefined,
        discardAndAuthorizeQuit: async () => undefined,
    } satisfies NativeLifecycleAdapter;
    const model = { getState: () => new Promise<State>((resolve) => waiting.push(resolve)) };
    const state = (pendingClose?: PendingClose): State => ({
        snapshot: { revision: 1, documents: {}, activeDocumentId: null, ui: {}, pendingClose },
        activeBuffer: null,
    });
    const { result } = renderHook(() =>
        useShutdown({
            bootstrapStatus: 'ready',
            hydratedPendingClose: null,
            dependencies: { native, appModel: model },
        }),
    );
    await act(async () => {
        notify?.();
        notify?.();
    });
    await act(async () => {
        waiting[1](state({ id: 'new', owner: 'frontend' }));
    });
    await act(async () => {
        waiting[0](state({ id: 'old', owner: 'frontend' }));
    });
    expect(result.current.pendingClose?.id).toBe('new');
    await act(async () => notify?.());
    await act(async () => {
        await result.current.cancelQuit();
    });
    await act(async () => {
        waiting[2](state({ id: 'new', owner: 'frontend' }));
    });
    expect(result.current.pendingClose).toBeNull();
});

it('reconciles an event buffered before an older null hydration', async () => {
    let notify: (() => void) | undefined;
    const native = {
        onCloseRequested: (listener: () => void) => {
            notify = listener;
            return () => {
                notify = undefined;
            };
        },
        requestQuit: () => undefined,
        authorizeQuit: async () => undefined,
        cancelQuit: async () => undefined,
        acknowledgeRecoveryClose: async () => undefined,
        discardAndAuthorizeQuit: async () => undefined,
    } satisfies NativeLifecycleAdapter;
    const model = {
        getState: async () => ({
            snapshot: {
                revision: 1,
                documents: {},
                activeDocumentId: null,
                ui: {},
                pendingClose: { id: 'early', owner: 'native' as const },
            },
            activeBuffer: null,
        }),
    };
    const { result, rerender } = renderHook(
        ({ ready }) =>
            useShutdown({
                bootstrapStatus: ready ? 'ready' : 'loading',
                hydratedPendingClose: null,
                dependencies: { native, appModel: model },
            }),
        { initialProps: { ready: false } },
    );
    act(() => notify?.());
    rerender({ ready: true });
    await waitFor(() => expect(result.current.pendingClose).toEqual({ id: 'early', owner: 'native' }));
});

it('keeps a fresh close discovered while an older cancellation is in flight', async () => {
    let notify: (() => void) | undefined;
    let finishCancel!: () => void;
    let finishRead!: (value: {
        snapshot: {
            revision: number;
            documents: Record<string, never>;
            activeDocumentId: null;
            ui: Record<string, never>;
            pendingClose: PendingClose;
        };
        activeBuffer: null;
    }) => void;
    const native = {
        onCloseRequested: (listener: () => void) => {
            notify = listener;
            return () => undefined;
        },
        requestQuit: () => undefined,
        authorizeQuit: async () => undefined,
        acknowledgeRecoveryClose: async () => undefined,
        discardAndAuthorizeQuit: async () => undefined,
        cancelQuit: () =>
            new Promise<void>((resolve) => {
                finishCancel = resolve;
            }),
    } satisfies NativeLifecycleAdapter;
    const model = {
        getState: () =>
            new Promise<{
                snapshot: {
                    revision: number;
                    documents: Record<string, never>;
                    activeDocumentId: null;
                    ui: Record<string, never>;
                    pendingClose: PendingClose;
                };
                activeBuffer: null;
            }>((resolve) => {
                finishRead = resolve;
            }),
    };
    const old = { id: 'old', owner: 'frontend' as const };
    const { result } = renderHook(() =>
        useShutdown({ bootstrapStatus: 'ready', hydratedPendingClose: old, dependencies: { native, appModel: model } }),
    );
    let cancelling!: Promise<void>;
    act(() => {
        cancelling = result.current.cancelQuit('old');
    });
    await act(async () => {
        notify?.();
    });
    await act(async () => {
        finishCancel();
        await cancelling;
    });
    await act(async () => {
        finishRead({
            snapshot: {
                revision: 1,
                documents: {},
                activeDocumentId: null,
                ui: {},
                pendingClose: { id: 'fresh', owner: 'frontend' },
            },
            activeBuffer: null,
        });
    });
    expect(result.current.pendingClose).toEqual({ id: 'fresh', owner: 'frontend' });
});

it('keeps a fresh discovery already started when an older authorized close is cleared', async () => {
    let notify: (() => void) | undefined;
    let finishRead!: (value: {
        snapshot: {
            revision: number;
            documents: Record<string, never>;
            activeDocumentId: null;
            ui: Record<string, never>;
            pendingClose: PendingClose;
        };
        activeBuffer: null;
    }) => void;
    const native = {
        onCloseRequested: (listener: () => void) => {
            notify = listener;
            return () => undefined;
        },
        requestQuit: () => undefined,
        authorizeQuit: async () => undefined,
        cancelQuit: async () => undefined,
        acknowledgeRecoveryClose: async () => undefined,
        discardAndAuthorizeQuit: async () => undefined,
    } satisfies NativeLifecycleAdapter;
    const model = {
        getState: () =>
            new Promise<{
                snapshot: {
                    revision: number;
                    documents: Record<string, never>;
                    activeDocumentId: null;
                    ui: Record<string, never>;
                    pendingClose: PendingClose;
                };
                activeBuffer: null;
            }>((resolve) => {
                finishRead = resolve;
            }),
    };
    const old = { id: 'old', owner: 'frontend' as const };
    const { result } = renderHook(() =>
        useShutdown({ bootstrapStatus: 'ready', hydratedPendingClose: old, dependencies: { native, appModel: model } }),
    );
    await act(async () => {
        notify?.();
    });
    act(() => result.current.clearPendingClose('old'));
    await act(async () => {
        finishRead({
            snapshot: {
                revision: 1,
                documents: {},
                activeDocumentId: null,
                ui: {},
                pendingClose: { id: 'fresh', owner: 'frontend' },
            },
            activeBuffer: null,
        });
    });
    expect(result.current.pendingClose).toEqual({ id: 'fresh', owner: 'frontend' });
});
