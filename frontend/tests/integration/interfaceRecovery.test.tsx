import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import InterfaceErrorBoundary from '../../src/app/InterfaceErrorBoundary';
import InterfaceFailure from '../../src/app/InterfaceFailure';
import type { ShutdownController } from '../../src/app/useShutdown';
import type { AppModelState } from '../../src/logic/store/appModelTypes';

const state = (pendingClose?: { id: string; owner: 'frontend' | 'native' }): AppModelState => ({
    snapshot: { revision: 1, documents: {}, activeDocumentId: null, ui: {}, pendingClose },
    activeBuffer: null,
});

const controller = (pendingClose: ShutdownController['pendingClose'] = null): ShutdownController => ({
    pendingClose,
    requestQuit: jest.fn(),
    acknowledgeRecoveryClose: jest.fn(async () => undefined),
    authorizeQuit: jest.fn(async () => undefined),
    discardAndAuthorizeQuit: jest.fn(async () => undefined),
    cancelQuit: jest.fn(async () => undefined),
    clearPendingClose: jest.fn(),
});

it('announces recovery errors in the active recovery surface', async () => {
    const shutdown = controller({ id: 'close', owner: 'frontend' });
    (shutdown.discardAndAuthorizeQuit as jest.Mock).mockRejectedValue(new Error('failed'));
    const adapter = {
        getState: jest.fn(async () => state({ id: 'close', owner: 'frontend' })),
        getPendingBufferDocumentIds: () => ['one'],
        flushBuffer: jest.fn(async () => undefined),
    };
    render(<InterfaceFailure shutdown={shutdown} orderedDocumentIds={['one']} adapter={adapter} reload={jest.fn()} />);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('status')).toHaveTextContent('');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Quit' }));
    await waitFor(() =>
        expect(within(dialog).getByRole('status')).toHaveTextContent(
            'The close request could not be completed. Please try again.',
        ),
    );
    expect(screen.getAllByRole('status')).toHaveLength(1);
});

it('catches a descendant error and retains the editor queue', () => {
    const retain = jest.fn();
    const Broken = (): React.JSX.Element => {
        throw new Error('failure');
    };
    const errors = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
        <InterfaceErrorBoundary onError={retain} fallback={<span>recovery</span>}>
            <Broken />
        </InterfaceErrorBoundary>,
    );
    expect(screen.getByText('recovery')).toBeInTheDocument();
    expect(retain).toHaveBeenCalled();
    errors.mockRestore();
});

it('flushes all open buffers before reloading', async () => {
    const shutdown = controller();
    const reload = jest.fn();
    const adapter = {
        getState: jest.fn(async () => state()),
        getPendingBufferDocumentIds: jest.fn(() => []),
        flushBuffer: jest.fn(async () => undefined),
    };
    render(
        <InterfaceFailure shutdown={shutdown} orderedDocumentIds={['one', 'two']} adapter={adapter} reload={reload} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reload interface' }));
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(adapter.flushBuffer).toHaveBeenCalledWith('one');
    expect(adapter.flushBuffer).toHaveBeenCalledWith('two');
});

it('retains real queued editor text through crash cleanup', async () => {
    const { createAppModelAdapter } = await import('../../src/logic/adapter');
    const { useSyncedBuffer } = await import('../../src/logic/hooks/useSyncedBuffer');
    const writes: string[] = [];
    const model = createAppModelAdapter(
        {
            getState: async () => ({ data: state() }),
            updateBuffer: async (_id: string, content: string, baseRevision: number) => {
                void baseRevision;
                writes.push(content);
                return {};
            },
            setDocView: async () => ({}),
            setUILayout: async () => ({}),
        },
        { eventsOn: () => () => undefined },
    );
    const view = {
        arrangement: 'editor' as const,
        editorVisible: true,
        previewVisible: false,
        cursor: { line: 1, column: 1 },
        selection: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
        scroll: { editor: 0, preview: 0 },
    };
    const Child = ({ crash }: { crash: boolean }): React.JSX.Element => {
        const buffer = useSyncedBuffer('one', view, model);
        if (crash) throw new Error('crash');
        return <button onClick={() => buffer.onChange('unsent latest')}>edit</button>;
    };
    const errors = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const rendered = render(
        <InterfaceErrorBoundary fallback={<span>failed</span>} onError={model.retainPendingBuffers}>
            <Child crash={false} />
        </InterfaceErrorBoundary>,
    );
    fireEvent.click(screen.getByText('edit'));
    rendered.rerender(
        <InterfaceErrorBoundary fallback={<span>failed</span>} onError={model.retainPendingBuffers}>
            <Child crash />
        </InterfaceErrorBoundary>,
    );
    expect(screen.getByText('failed')).toBeInTheDocument();
    await model.flushBuffer('one');
    expect(writes).toEqual(['unsent latest']);
    errors.mockRestore();
});

it('prompts for a pending edit even if it is acknowledged during the state read', async () => {
    let resolveState!: (value: AppModelState) => void;
    let pending = ['one'];
    const shutdown = controller({ id: 'close', owner: 'frontend' });
    const adapter = {
        getState: jest.fn(
            () =>
                new Promise<AppModelState>((resolve) => {
                    resolveState = resolve;
                }),
        ),
        getPendingBufferDocumentIds: () => pending,
        flushBuffer: jest.fn(async () => undefined),
    };
    render(<InterfaceFailure shutdown={shutdown} orderedDocumentIds={['one']} adapter={adapter} reload={jest.fn()} />);
    await waitFor(() => expect(adapter.getState).toHaveBeenCalled());
    pending = [];
    resolveState(state({ id: 'close', owner: 'frontend' }));
    expect(
        await screen.findByRole('dialog', { name: 'Quit and discard unsaved changes in 1 document?' }),
    ).toBeInTheDocument();
    expect(shutdown.authorizeQuit).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Quit' }));
    await waitFor(() => expect(shutdown.discardAndAuthorizeQuit).toHaveBeenCalledWith('close'));
    expect(adapter.flushBuffer).not.toHaveBeenCalled();
});

it('allows explicit retry after a timed out reload and ignores its late completion', async () => {
    jest.useFakeTimers();
    let resolveFlush!: () => void;
    const shutdown = controller();
    const reload = jest.fn();
    let first = true;
    const adapter = {
        getState: jest.fn(async () => state()),
        getPendingBufferDocumentIds: () => [],
        flushBuffer: jest.fn(() => {
            if (first) {
                first = false;
                return new Promise<void>((resolve) => {
                    resolveFlush = resolve;
                });
            }
            return Promise.resolve();
        }),
    };
    render(<InterfaceFailure shutdown={shutdown} orderedDocumentIds={['one']} adapter={adapter} reload={reload} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reload interface' }));
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
    });
    await act(async () => {
        await jest.advanceTimersByTimeAsync(1000);
    });
    expect(reload).not.toHaveBeenCalled();
    expect(
        screen.getByText('Your changes could not be prepared for reload. Try Reload interface again.', {
            selector: 'p',
        }),
    ).toBeInTheDocument();
    await act(async () => {
        resolveFlush();
        await Promise.resolve();
    });
    expect(reload).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Reload interface' }));
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
    });
    expect(reload).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
});

it('bounds a hung recovery acknowledgement and retries the same close without late authorization', async () => {
    jest.useFakeTimers();
    let finishAck!: () => void;
    const shutdown = controller({ id: 'close', owner: 'frontend' });
    (shutdown.acknowledgeRecoveryClose as jest.Mock).mockImplementationOnce(
        () =>
            new Promise<void>((resolve) => {
                finishAck = resolve;
            }),
    );
    const adapter = {
        getState: jest.fn(async () => state({ id: 'close', owner: 'frontend' })),
        getPendingBufferDocumentIds: () => ['one'],
        flushBuffer: jest.fn(async () => undefined),
    };
    render(<InterfaceFailure shutdown={shutdown} orderedDocumentIds={['one']} adapter={adapter} reload={jest.fn()} />);
    await act(async () => {
        await Promise.resolve();
    });
    await act(async () => {
        await jest.advanceTimersByTimeAsync(1000);
    });
    expect(
        screen.getByText('The close request could not be completed. Please try again.', { selector: 'p' }),
    ).toBeInTheDocument();
    expect(adapter.getState).not.toHaveBeenCalled();
    await act(async () => {
        finishAck();
        await Promise.resolve();
    });
    expect(adapter.getState).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Quit' }));
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
    });
    expect(screen.getByRole('dialog', { name: 'Quit and discard unsaved changes in 1 document?' })).toBeInTheDocument();
    expect(shutdown.authorizeQuit).not.toHaveBeenCalled();
    jest.useRealTimers();
});

it('blocks reload while native close owns the request', async () => {
    const shutdown = controller({ id: 'close', owner: 'native' });
    const reload = jest.fn();
    const adapter = {
        getState: jest.fn(async () => state({ id: 'close', owner: 'native' })),
        getPendingBufferDocumentIds: () => ['one'],
        flushBuffer: jest.fn(async () => undefined),
    };
    render(<InterfaceFailure shutdown={shutdown} orderedDocumentIds={['one']} adapter={adapter} reload={reload} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reload interface' }));
    await waitFor(() =>
        expect(
            screen.getByText('Your changes could not be prepared for reload. Try Reload interface again.', {
                selector: 'p',
            }),
        ).toBeInTheDocument(),
    );
    expect(adapter.flushBuffer).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
});

it('keeps a newer queued edit behind an older in-flight delivery across a real crash', async () => {
    const { createAppModelAdapter } = await import('../../src/logic/adapter');
    const { useSyncedBuffer } = await import('../../src/logic/hooks/useSyncedBuffer');
    const writes: string[] = [];
    let release!: () => void;
    const model = createAppModelAdapter(
        {
            getState: async () => ({ data: state() }),
            updateBuffer: async (_id: string, content: string, baseRevision: number) => {
                void baseRevision;
                writes.push(content);
                if (content === 'old')
                    await new Promise<void>((resolve) => {
                        release = resolve;
                    });
                return {};
            },
            setDocView: async () => ({}),
            setUILayout: async () => ({}),
        },
        { eventsOn: () => () => undefined },
    );
    const view = {
        arrangement: 'editor' as const,
        editorVisible: true,
        previewVisible: false,
        cursor: { line: 1, column: 1 },
        selection: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
        scroll: { editor: 0, preview: 0 },
    };
    const Child = ({ crash }: { crash: boolean }): React.JSX.Element => {
        const buffer = useSyncedBuffer('one', view, model);
        if (crash) throw new Error('crash');
        return (
            <>
                <button onClick={() => buffer.onChange('old')}>old</button>
                <button onClick={() => buffer.onChange('new')}>new</button>
            </>
        );
    };
    const errors = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const tree = (crash: boolean): React.JSX.Element => (
        <InterfaceErrorBoundary fallback={<span>failed</span>} onError={model.retainPendingBuffers}>
            <Child crash={crash} />
        </InterfaceErrorBoundary>
    );
    const rendered = render(tree(false));
    fireEvent.click(screen.getByText('old'));
    const oldFlush = model.flushBuffer('one');
    await waitFor(() => expect(writes).toEqual(['old']));
    fireEvent.click(screen.getByText('new'));
    rendered.rerender(tree(true));
    release();
    await oldFlush;
    await model.flushBuffer('one');
    expect(writes).toEqual(['old', 'new']);
    errors.mockRestore();
});

it('invalidates a reload when a native close arrives during delivery', async () => {
    let finish!: () => void;
    const reload = jest.fn();
    const shutdown = controller();
    const adapter = {
        getState: jest.fn(async () => state()),
        getPendingBufferDocumentIds: () => [],
        flushBuffer: jest.fn(
            () =>
                new Promise<void>((resolve) => {
                    finish = resolve;
                }),
        ),
    };
    const view = (next: ShutdownController): React.JSX.Element => (
        <InterfaceFailure shutdown={next} orderedDocumentIds={['one']} adapter={adapter} reload={reload} />
    );
    const rendered = render(view(shutdown));
    fireEvent.click(screen.getByRole('button', { name: 'Reload interface' }));
    await waitFor(() => expect(adapter.flushBuffer).toHaveBeenCalled());
    const native = { ...shutdown, pendingClose: { id: 'native', owner: 'native' } as const };
    rendered.rerender(view(native));
    await act(async () => {
        finish();
        await Promise.resolve();
    });
    expect(reload).not.toHaveBeenCalled();
    expect(screen.getByText('A native close decision is in progress.', { selector: 'p' })).toBeInTheDocument();
});

it('keeps the discard prompt available after Cancel times out and ignores the late response', async () => {
    jest.useFakeTimers();
    let finishCancel!: () => void;
    const shutdown = controller({ id: 'close', owner: 'frontend' });
    (shutdown.cancelQuit as jest.Mock).mockImplementationOnce(
        () =>
            new Promise<void>((resolve) => {
                finishCancel = resolve;
            }),
    );
    const adapter = {
        getState: jest.fn(async () => state({ id: 'close', owner: 'frontend' })),
        getPendingBufferDocumentIds: () => ['one'],
        flushBuffer: jest.fn(async () => undefined),
    };
    render(<InterfaceFailure shutdown={shutdown} orderedDocumentIds={['one']} adapter={adapter} reload={jest.fn()} />);
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
    });
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await act(async () => {
        await jest.advanceTimersByTimeAsync(1000);
    });
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeEnabled();
    await act(async () => {
        finishCancel();
        await Promise.resolve();
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(shutdown.cancelQuit).toHaveBeenCalledTimes(2);
    expect(adapter.flushBuffer).not.toHaveBeenCalled();
    jest.useRealTimers();
});

it('does not time out a confirmed discard while an admitted write drains', async () => {
    jest.useFakeTimers();
    let finish!: () => void;
    const shutdown = controller({ id: 'close', owner: 'frontend' });
    (shutdown.discardAndAuthorizeQuit as jest.Mock).mockImplementation(
        () =>
            new Promise<void>((resolve) => {
                finish = resolve;
            }),
    );
    const adapter = {
        getState: jest.fn(async () => state({ id: 'close', owner: 'frontend' })),
        getPendingBufferDocumentIds: () => ['one'],
        flushBuffer: jest.fn(async () => undefined),
    };
    render(<InterfaceFailure shutdown={shutdown} orderedDocumentIds={['one']} adapter={adapter} reload={jest.fn()} />);
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
    });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Quit' }));
    await act(async () => {
        await jest.advanceTimersByTimeAsync(2000);
    });
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(shutdown.discardAndAuthorizeQuit).toHaveBeenCalledTimes(1);
    await act(async () => {
        finish();
        await Promise.resolve();
    });
    jest.useRealTimers();
});

it('remains usable with StrictMode effect replay', async () => {
    const { StrictMode } = await import('react');
    const shutdown = controller({ id: 'close', owner: 'frontend' });
    const adapter = {
        getState: jest.fn(async () => state({ id: 'close', owner: 'frontend' })),
        getPendingBufferDocumentIds: () => ['one'],
        flushBuffer: jest.fn(async () => undefined),
    };
    render(
        <StrictMode>
            <InterfaceFailure shutdown={shutdown} orderedDocumentIds={['one']} adapter={adapter} reload={jest.fn()} />
        </StrictMode>,
    );
    expect(
        await screen.findByRole('dialog', { name: 'Quit and discard unsaved changes in 1 document?' }),
    ).toBeInTheDocument();
});

it('does not reopen recovery controls when ownership changes during a terminal drain', async () => {
    let reject!: (error: Error) => void;
    const shutdown = controller({ id: 'close', owner: 'frontend' });
    (shutdown.discardAndAuthorizeQuit as jest.Mock).mockImplementation(
        () =>
            new Promise<void>((_resolve, fail) => {
                reject = fail;
            }),
    );
    const adapter = {
        getState: jest.fn(async () => state({ id: 'close', owner: 'frontend' })),
        getPendingBufferDocumentIds: () => ['one'],
        flushBuffer: jest.fn(async () => undefined),
    };
    const view = (controllerValue: ShutdownController): React.JSX.Element => (
        <InterfaceFailure
            shutdown={controllerValue}
            orderedDocumentIds={['one']}
            adapter={adapter}
            reload={jest.fn()}
        />
    );
    const rendered = render(view(shutdown));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Quit' }));
    await waitFor(() => expect(shutdown.discardAndAuthorizeQuit).toHaveBeenCalled());
    rendered.rerender(view({ ...shutdown, pendingClose: { id: 'close', owner: 'native' } }));
    expect(screen.getByRole('button', { name: 'Reload interface' })).toBeDisabled();
    await act(async () => {
        reject(new Error('refused'));
        await Promise.resolve();
    });
    expect(screen.getByRole('button', { name: 'Reload interface' })).toBeEnabled();
});

it('focuses reload and retries a same-ID close after a state-read failure', async () => {
    const shutdown = controller({ id: 'close', owner: 'frontend' });
    const adapter = {
        getState: jest
            .fn()
            .mockRejectedValueOnce(new Error('offline'))
            .mockResolvedValue(state({ id: 'close', owner: 'frontend' })),
        getPendingBufferDocumentIds: () => ['one'],
        flushBuffer: jest.fn(async () => undefined),
    };
    render(<InterfaceFailure shutdown={shutdown} orderedDocumentIds={['one']} adapter={adapter} reload={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Reload interface' })).toHaveFocus();
    expect(
        await screen.findByText('The close request could not be completed. Please try again.', { selector: 'p' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Quit' }));
    expect(
        await screen.findByRole('dialog', { name: 'Quit and discard unsaved changes in 1 document?' }),
    ).toBeInTheDocument();
    expect(shutdown.acknowledgeRecoveryClose).toHaveBeenCalledTimes(2);
});

it('bounds a hung state read after close acknowledgement and ignores the late snapshot', async () => {
    jest.useFakeTimers();
    let finishRead!: (value: AppModelState) => void;
    const shutdown = controller({ id: 'close', owner: 'frontend' });
    const adapter = {
        getState: jest
            .fn()
            .mockImplementationOnce(
                () =>
                    new Promise<AppModelState>((resolve) => {
                        finishRead = resolve;
                    }),
            )
            .mockResolvedValue(state({ id: 'close', owner: 'frontend' })),
        getPendingBufferDocumentIds: () => ['one'],
        flushBuffer: jest.fn(async () => undefined),
    };
    render(<InterfaceFailure shutdown={shutdown} orderedDocumentIds={['one']} adapter={adapter} reload={jest.fn()} />);
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
    });
    await act(async () => {
        await jest.advanceTimersByTimeAsync(1000);
    });
    expect(
        screen.getByText('The close request could not be completed. Please try again.', { selector: 'p' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Quit' }));
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await act(async () => {
        finishRead(state({ id: 'close', owner: 'frontend' }));
        await Promise.resolve();
    });
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(shutdown.authorizeQuit).not.toHaveBeenCalled();
    jest.useRealTimers();
});

it('routes a native close through the surviving real shutdown controller and cancel', async () => {
    const { useShutdown } = await import('../../src/app/useShutdown');
    let pendingClose: { id: string; owner: 'frontend' | 'native' } | undefined;
    let event: (() => void) | undefined;
    const native = {
        onCloseRequested: (callback: () => void) => {
            event = callback;
            return () => {
                event = undefined;
            };
        },
        requestQuit: () => {
            pendingClose = { id: 'native-request', owner: 'frontend' };
            event?.();
        },
        acknowledgeRecoveryClose: jest.fn(async () => undefined),
        authorizeQuit: jest.fn(async () => undefined),
        discardAndAuthorizeQuit: jest.fn(async () => undefined),
        cancelQuit: jest.fn(async () => {
            pendingClose = undefined;
        }),
    };
    const adapter = {
        getState: jest.fn(async () => state(pendingClose)),
        getPendingBufferDocumentIds: () => ['one'],
        flushBuffer: jest.fn(async () => undefined),
    };
    const Harness = (): React.JSX.Element => {
        const shutdown = useShutdown({
            bootstrapStatus: 'ready',
            hydratedPendingClose: null,
            dependencies: { native, appModel: adapter },
        });
        return (
            <InterfaceFailure
                shutdown={shutdown}
                orderedDocumentIds={['one', 'two']}
                adapter={adapter}
                reload={jest.fn()}
            />
        );
    };
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Quit' }));
    const dialog = await screen.findByRole('dialog', { name: 'Quit and discard unsaved changes in 1 document?' });
    expect(native.acknowledgeRecoveryClose).toHaveBeenCalledWith('native-request');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(native.cancelQuit).toHaveBeenCalledWith('native-request');
    expect(screen.getByRole('button', { name: 'Reload interface' })).toHaveFocus();
    expect(adapter.flushBuffer).not.toHaveBeenCalled();
});

it('cancels a frontend-owned close before reloading through the real controller', async () => {
    const { useShutdown } = await import('../../src/app/useShutdown');
    let pendingClose: { id: string; owner: 'frontend' | 'native' } | undefined = { id: 'close', owner: 'frontend' };
    const native = {
        onCloseRequested: () => () => undefined,
        requestQuit: () => undefined,
        acknowledgeRecoveryClose: jest.fn(async () => {
            throw new Error('unavailable');
        }),
        authorizeQuit: jest.fn(async () => undefined),
        discardAndAuthorizeQuit: jest.fn(async () => undefined),
        cancelQuit: jest.fn(async () => {
            pendingClose = undefined;
        }),
    };
    const adapter = {
        getState: jest.fn(async () => state(pendingClose)),
        getPendingBufferDocumentIds: () => [],
        flushBuffer: jest.fn(async () => undefined),
    };
    const reload = jest.fn();
    const Harness = (): React.JSX.Element => {
        const shutdown = useShutdown({
            bootstrapStatus: 'ready',
            hydratedPendingClose: { id: 'close', owner: 'frontend' },
            dependencies: { native, appModel: adapter },
        });
        return <InterfaceFailure shutdown={shutdown} orderedDocumentIds={['one']} adapter={adapter} reload={reload} />;
    };
    render(<Harness />);
    expect(
        await screen.findByText('The close request could not be completed. Please try again.', { selector: 'p' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reload interface' }));
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(native.cancelQuit).toHaveBeenCalledWith('close');
    expect(adapter.flushBuffer).toHaveBeenCalledWith('one');
});

it('keeps the real shutdown listener alive after an editor subtree crashes', async () => {
    const { createAppModelAdapter } = await import('../../src/logic/adapter');
    const { useSyncedBuffer } = await import('../../src/logic/hooks/useSyncedBuffer');
    const { useShutdown } = await import('../../src/app/useShutdown');
    let pendingClose: { id: string; owner: 'frontend' | 'native' } | undefined = undefined;
    let notify: (() => void) | undefined;
    const native = {
        onCloseRequested: (fn: () => void) => {
            notify = fn;
            return () => {
                notify = undefined;
            };
        },
        requestQuit: () => undefined,
        acknowledgeRecoveryClose: jest.fn(async () => undefined),
        authorizeQuit: jest.fn(async () => undefined),
        discardAndAuthorizeQuit: jest.fn(async () => undefined),
        cancelQuit: jest.fn(async () => undefined),
    };
    const model = createAppModelAdapter(
        {
            getState: async () => ({ data: state(pendingClose) }),
            updateBuffer: async () => ({}),
            setDocView: async () => ({}),
            setUILayout: async () => ({}),
        },
        { eventsOn: () => () => undefined },
    );
    const view = {
        arrangement: 'editor' as const,
        editorVisible: true,
        previewVisible: false,
        cursor: { line: 1, column: 1 },
        selection: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
        scroll: { editor: 0, preview: 0 },
    };
    const Child = ({ crash }: { crash: boolean }): React.JSX.Element => {
        const buffer = useSyncedBuffer('one', view, model);
        if (crash) throw new Error('broken subtree');
        return <button onClick={() => buffer.onChange('unsent')}>edit</button>;
    };
    const Harness = ({ crash }: { crash: boolean }): React.JSX.Element => {
        const shutdown = useShutdown({
            bootstrapStatus: 'ready',
            hydratedPendingClose: null,
            dependencies: { native, appModel: model },
        });
        return (
            <InterfaceErrorBoundary
                onError={model.retainPendingBuffers}
                fallback={
                    <InterfaceFailure
                        shutdown={shutdown}
                        orderedDocumentIds={['one']}
                        adapter={model}
                        reload={jest.fn()}
                    />
                }
            >
                <Child crash={crash} />
            </InterfaceErrorBoundary>
        );
    };
    const errors = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const rendered = render(<Harness crash={false} />);
    fireEvent.click(screen.getByText('edit'));
    rendered.rerender(<Harness crash />);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    pendingClose = { id: 'close', owner: 'frontend' };
    act(() => notify?.());
    expect(
        await screen.findByRole('dialog', { name: 'Quit and discard unsaved changes in 1 document?' }),
    ).toBeInTheDocument();
    expect(native.acknowledgeRecoveryClose).toHaveBeenCalledWith('close');
    errors.mockRestore();
});

it('reconciles an acknowledged cancellation whose first response was lost', async () => {
    jest.useFakeTimers();
    const { useShutdown } = await import('../../src/app/useShutdown');
    let pendingClose: { id: string; owner: 'frontend' | 'native' } | undefined = { id: 'close', owner: 'frontend' };
    let cancelCalls = 0;
    const native = {
        onCloseRequested: () => () => undefined,
        requestQuit: () => undefined,
        acknowledgeRecoveryClose: jest.fn(async () => undefined),
        authorizeQuit: jest.fn(async () => undefined),
        discardAndAuthorizeQuit: jest.fn(async () => undefined),
        cancelQuit: jest.fn(() => {
            cancelCalls++;
            if (cancelCalls === 1) {
                pendingClose = undefined;
                return new Promise<void>(() => undefined);
            }
            return Promise.reject(new Error('stale'));
        }),
    };
    const adapter = {
        getState: jest.fn(async () => state(pendingClose)),
        getPendingBufferDocumentIds: () => ['one'],
        flushBuffer: jest.fn(async () => undefined),
    };
    const Harness = (): React.JSX.Element => {
        const shutdown = useShutdown({
            bootstrapStatus: 'ready',
            hydratedPendingClose: { id: 'close', owner: 'frontend' },
            dependencies: { native, appModel: adapter },
        });
        return (
            <InterfaceFailure shutdown={shutdown} orderedDocumentIds={['one']} adapter={adapter} reload={jest.fn()} />
        );
    };
    render(<Harness />);
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
    });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    await act(async () => {
        await jest.advanceTimersByTimeAsync(1000);
    });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload interface' })).toBeEnabled();
    expect(adapter.getPendingBufferDocumentIds()).toEqual(['one']);
    jest.useRealTimers();
});

it.each([
    { id: 'new', owner: 'frontend' as const },
    { id: 'close', owner: 'native' as const },
])('does not clear another or native-owned close while reconciling a refused cancel', async (authoritative) => {
    const shutdown = controller({ id: 'close', owner: 'frontend' });
    let pendingClose: { id: string; owner: 'frontend' | 'native' } | undefined = { id: 'close', owner: 'frontend' };
    (shutdown.cancelQuit as jest.Mock).mockRejectedValue(new Error('stale'));
    const adapter = {
        getState: jest.fn(async () => state(pendingClose)),
        getPendingBufferDocumentIds: () => ['one'],
        flushBuffer: jest.fn(async () => undefined),
    };
    render(<InterfaceFailure shutdown={shutdown} orderedDocumentIds={['one']} adapter={adapter} reload={jest.fn()} />);
    const dialog = await screen.findByRole('dialog');
    pendingClose = authoritative;
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
        expect(
            screen.getAllByText('The close request could not be completed. Please try again.').length,
        ).toBeGreaterThan(0),
    );
    expect(shutdown.clearPendingClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
});

it('authorizes a clean close without presenting discard', async () => {
    const shutdown = controller({ id: 'close', owner: 'frontend' });
    const adapter = {
        getState: jest.fn(async () => state({ id: 'close', owner: 'frontend' })),
        getPendingBufferDocumentIds: () => [],
        flushBuffer: jest.fn(async () => undefined),
    };
    render(<InterfaceFailure shutdown={shutdown} orderedDocumentIds={[]} adapter={adapter} reload={jest.fn()} />);
    await waitFor(() => expect(shutdown.authorizeQuit).toHaveBeenCalledWith('close'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(shutdown.discardAndAuthorizeQuit).not.toHaveBeenCalled();
});

it('deduplicates backend dirty and pending documents in the plural prompt', async () => {
    const shutdown = controller({ id: 'close', owner: 'frontend' });
    const snapshot = state({ id: 'close', owner: 'frontend' });
    snapshot.snapshot.documents = {
        one: { dirty: true } as AppModelState['snapshot']['documents'][string],
        two: { dirty: true } as AppModelState['snapshot']['documents'][string],
    };
    const adapter = {
        getState: jest.fn(async () => snapshot),
        getPendingBufferDocumentIds: () => ['one'],
        flushBuffer: jest.fn(async () => undefined),
    };
    render(
        <InterfaceFailure
            shutdown={shutdown}
            orderedDocumentIds={['one', 'two']}
            adapter={adapter}
            reload={jest.fn()}
        />,
    );
    expect(
        await screen.findByRole('dialog', { name: 'Quit and discard unsaved changes in 2 documents?' }),
    ).toBeInTheDocument();
});

it('retains recovery after a rejected flush and succeeds only on explicit retry', async () => {
    const shutdown = controller();
    const reload = jest.fn();
    let pending = true;
    const adapter = {
        getState: jest.fn(async () => state()),
        getPendingBufferDocumentIds: () => (pending ? ['one'] : []),
        flushBuffer: jest
            .fn()
            .mockRejectedValueOnce(new Error('offline'))
            .mockImplementation(async () => {
                pending = false;
            }),
    };
    render(<InterfaceFailure shutdown={shutdown} orderedDocumentIds={['one']} adapter={adapter} reload={reload} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reload interface' }));
    expect(
        await screen.findByText('Your changes could not be prepared for reload. Try Reload interface again.', {
            selector: 'p',
        }),
    ).toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
    expect(adapter.getPendingBufferDocumentIds()).toEqual(['one']);
    fireEvent.click(screen.getByRole('button', { name: 'Reload interface' }));
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
});

it.each(['authorize', 'discard'] as const)(
    'handles a classified %s refusal without leaving recovery',
    async (operation) => {
        const shutdown = controller({ id: 'close', owner: 'frontend' });
        const refusal = {
            category: 'io-failure' as const,
            message: 'private details',
            remediations: [],
            dedupKey: 'test',
        };
        if (operation === 'authorize') (shutdown.authorizeQuit as jest.Mock).mockResolvedValue(refusal);
        else (shutdown.discardAndAuthorizeQuit as jest.Mock).mockResolvedValue(refusal);
        const adapter = {
            getState: jest.fn(async () => state({ id: 'close', owner: 'frontend' })),
            getPendingBufferDocumentIds: () => (operation === 'discard' ? ['one'] : []),
            flushBuffer: jest.fn(async () => undefined),
        };
        render(
            <InterfaceFailure shutdown={shutdown} orderedDocumentIds={['one']} adapter={adapter} reload={jest.fn()} />,
        );
        if (operation === 'discard')
            fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Quit' }));
        expect(
            (await screen.findAllByText('The close request could not be completed. Please try again.')).length,
        ).toBeGreaterThan(0);
        expect(screen.queryByText('private details')).not.toBeInTheDocument();
        if (operation === 'discard')
            expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' })).toBeEnabled();
        else expect(screen.getByRole('button', { name: 'Quit' })).toBeEnabled();
    },
);

it('bounds reconciliation after a refused Cancel and ignores the late reread', async () => {
    jest.useFakeTimers();
    let finishRead!: (value: AppModelState) => void;
    const shutdown = controller({ id: 'close', owner: 'frontend' });
    (shutdown.cancelQuit as jest.Mock).mockRejectedValue(new Error('stale'));
    const adapter = {
        getState: jest
            .fn()
            .mockResolvedValueOnce(state({ id: 'close', owner: 'frontend' }))
            .mockImplementationOnce(
                () =>
                    new Promise<AppModelState>((resolve) => {
                        finishRead = resolve;
                    }),
            ),
        getPendingBufferDocumentIds: () => ['one'],
        flushBuffer: jest.fn(async () => undefined),
    };
    render(<InterfaceFailure shutdown={shutdown} orderedDocumentIds={['one']} adapter={adapter} reload={jest.fn()} />);
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
    });
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
    });
    await act(async () => {
        await jest.advanceTimersByTimeAsync(1000);
    });
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeEnabled();
    await act(async () => {
        finishRead(state());
        await Promise.resolve();
    });
    expect(shutdown.clearPendingClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    jest.useRealTimers();
});
