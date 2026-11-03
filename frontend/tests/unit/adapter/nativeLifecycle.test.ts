import { appModelAdapter, nativeLifecycleAdapter } from '../../../src/logic/adapter';

it('sends one close id with each recovery lifecycle request', async () => {
    const root = window as unknown as { go: unknown };
    const previous = root.go;
    const acknowledge = jest.fn().mockResolvedValue({});
    const discard = jest.fn().mockResolvedValue({});
    root.go = {
        application: {
            ApplicationHandler: { AcknowledgeRecoveryClose: acknowledge, DiscardAndAuthorizeQuit: discard },
        },
    };
    try {
        await expect(nativeLifecycleAdapter.acknowledgeRecoveryClose('close-1')).resolves.toBeUndefined();
        await expect(nativeLifecycleAdapter.discardAndAuthorizeQuit('close-1')).resolves.toBeUndefined();
        expect(acknowledge).toHaveBeenCalledWith(expect.objectContaining({ id: expect.any(String) }), 'close-1');
        expect(discard).toHaveBeenCalledWith(expect.objectContaining({ id: expect.any(String) }), 'close-1');
    } finally {
        root.go = previous;
    }
});

it('returns classified refusal and propagates a failed recovery transport', async () => {
    const root = window as unknown as { go: unknown };
    const previous = root.go;
    root.go = {
        application: {
            ApplicationHandler: {
                AcknowledgeRecoveryClose: jest
                    .fn()
                    .mockResolvedValue({ error: { category: 'validation', message: 'stale', safeSubject: 'close' } }),
                DiscardAndAuthorizeQuit: jest.fn().mockRejectedValue(new Error('disconnected')),
            },
        },
    };
    try {
        await expect(nativeLifecycleAdapter.acknowledgeRecoveryClose('stale')).resolves.toMatchObject({
            category: 'validation',
            message: 'stale',
        });
        await expect(nativeLifecycleAdapter.discardAndAuthorizeQuit('stale')).rejects.toThrow('disconnected');
    } finally {
        root.go = previous;
    }
});

it.each(['frontend', 'native'])('preserves %s close ownership from GetState', async (owner) => {
    const root = window as unknown as { go: unknown };
    const previous = root.go;
    root.go = {
        appmodel: {
            AppModelHandler: {
                GetState: jest.fn().mockResolvedValue({
                    data: {
                        snapshot: { revision: 1, documents: {}, ui: {}, pendingClose: { id: 'close-1', owner } },
                    },
                }),
            },
        },
    };
    try {
        await expect(appModelAdapter.getState()).resolves.toMatchObject({
            snapshot: { pendingClose: { id: 'close-1', owner } },
        });
    } finally {
        root.go = previous;
    }
});

it('rejects unrecognized close ownership', async () => {
    const root = window as unknown as { go: unknown };
    const previous = root.go;
    root.go = {
        appmodel: {
            AppModelHandler: {
                GetState: jest.fn().mockResolvedValue({
                    data: {
                        snapshot: {
                            revision: 1,
                            documents: {},
                            ui: {},
                            pendingClose: { id: 'close-1', owner: 'unknown' },
                        },
                    },
                }),
            },
        },
    };
    try {
        await expect(appModelAdapter.getState()).rejects.toMatchObject({
            code: 'internal',
            message: 'Invalid native close ownership',
        });
    } finally {
        root.go = previous;
    }
});
