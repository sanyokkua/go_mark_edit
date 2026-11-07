import { useCallback, useEffect, useRef, useState } from 'react';

import { appModelAdapter, nativeLifecycleAdapter, type NativeLifecycleAdapter } from '../logic/adapter';
import type { AppModelAdapter } from '../logic/adapter/appModelAdapter';
import type { AppModelState, ClassifiedError, PendingClose } from '../logic/store/appModelTypes';

export type ShutdownBootstrapStatus = 'loading' | 'ready' | 'failed';
export interface ShutdownDependencies {
    appModel?: Pick<AppModelAdapter, 'getState'>;
    native?: NativeLifecycleAdapter;
}
export interface UseShutdownOptions {
    bootstrapStatus: ShutdownBootstrapStatus;
    hydratedPendingClose?: PendingClose | null;
    hydratedState?: Pick<AppModelState, 'snapshot'>;
    dependencies?: ShutdownDependencies;
}
export interface ShutdownController {
    pendingClose: PendingClose | null;
    authorizeQuit: (closeID?: string) => Promise<ClassifiedError | undefined>;
    acknowledgeRecoveryClose: (closeID?: string) => Promise<ClassifiedError | undefined>;
    discardAndAuthorizeQuit: (closeID?: string) => Promise<ClassifiedError | undefined>;
    cancelQuit: (closeID?: string) => Promise<void>;
    clearPendingClose: (closeID?: string) => void;
    requestQuit: () => void;
}

export function useShutdown(options: UseShutdownOptions): ShutdownController {
    const native = options.dependencies?.native ?? nativeLifecycleAdapter;
    const model = options.dependencies?.appModel ?? appModelAdapter;
    const [pendingClose, setPendingClose] = useState<PendingClose | null>(null);
    const pendingRef = useRef<PendingClose | null>(null);
    const generation = useRef(0);
    const buffered = useRef(false);
    const ready = useRef(options.bootstrapStatus === 'ready');
    const settled = useRef(new Set<string>());
    const setPending = useCallback((value: PendingClose | null): void => {
        if (value !== null && settled.current.has(value.id)) return;
        const previous = pendingRef.current;
        if (previous?.id === value?.id && previous?.owner === value?.owner) return;
        pendingRef.current = value;
        setPendingClose(value);
    }, []);
    const discover = useCallback((): void => {
        const current = ++generation.current;
        void Promise.resolve()
            .then(() => model.getState())
            .then((state): void => {
                if (current === generation.current) setPending(state.snapshot.pendingClose ?? null);
            })
            .catch((): void => undefined);
    }, [model, setPending]);
    const event = useRef((): void => undefined);
    useEffect(() => {
        event.current = (): void => {
            if (!ready.current) {
                buffered.current = true;
                return;
            }
            discover();
        };
    }, [discover]);
    useEffect(() => native.onCloseRequested(() => event.current()), [native]);
    useEffect(() => {
        ready.current = options.bootstrapStatus === 'ready';
        if (!ready.current) return;
        if (buffered.current) {
            buffered.current = false;
            discover();
            return;
        }
        if (options.hydratedPendingClose !== undefined) setPending(options.hydratedPendingClose);
        else if (options.hydratedState !== undefined) setPending(options.hydratedState.snapshot.pendingClose ?? null);
        else discover();
        return () => {
            generation.current++;
        };
    }, [discover, options.bootstrapStatus, options.hydratedPendingClose, options.hydratedState, setPending]);
    const cancelQuit = useCallback(
        async (id = pendingRef.current?.id ?? ''): Promise<void> => {
            if (id.length === 0) return;
            const cancelGeneration = generation.current;
            await native.cancelQuit(id);
            settled.current.add(id);
            if (generation.current === cancelGeneration) generation.current++;
            if (pendingRef.current?.id === id) setPending(null);
        },
        [native, setPending],
    );
    const authorizeQuit = useCallback(
        async (id = pendingRef.current?.id ?? '') => (id.length === 0 ? undefined : native.authorizeQuit(id)),
        [native],
    );
    const acknowledgeRecoveryClose = useCallback(
        async (id = pendingRef.current?.id ?? '') =>
            id.length === 0 ? undefined : native.acknowledgeRecoveryClose(id),
        [native],
    );
    const discardAndAuthorizeQuit = useCallback(
        async (id = pendingRef.current?.id ?? '') => (id.length === 0 ? undefined : native.discardAndAuthorizeQuit(id)),
        [native],
    );
    const clearPendingClose = useCallback(
        (id = pendingRef.current?.id ?? ''): void => {
            if (id.length === 0 || pendingRef.current?.id !== id) return;
            settled.current.add(id);
            setPending(null);
        },
        [setPending],
    );
    return {
        pendingClose,
        authorizeQuit,
        acknowledgeRecoveryClose,
        discardAndAuthorizeQuit,
        cancelQuit,
        clearPendingClose,
        requestQuit: native.requestQuit,
    };
}
