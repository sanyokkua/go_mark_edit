import { useCallback, useEffect, useRef, useState } from 'react';

import {
  appModelAdapter,
  nativeLifecycleAdapter,
  type NativeLifecycleAdapter,
} from '../logic/adapter';
import type { AppModelAdapter } from '../logic/adapter/appModelAdapter';
import type {
  AppModelState,
  ClassifiedError,
} from '../logic/store/appModelTypes';

export type ShutdownBootstrapStatus = 'loading' | 'ready' | 'failed';

export interface ShutdownDependencies {
  appModel?: Pick<AppModelAdapter, 'getState'>;
  native?: NativeLifecycleAdapter;
}

export interface UseShutdownOptions {
  bootstrapStatus: ShutdownBootstrapStatus;
  /**
   * The value read by the projection bootstrap's GetState call. Supplying the
   * value avoids a second hydration read while still making pending-close
   * discovery part of the same authoritative snapshot.
   */
  hydratedPendingCloseId?: string | null;
  hydratedState?: Pick<AppModelState, 'snapshot'>;
  onRequest?: (closeID: string) => void | Promise<void>;
  onPendingChange?: (closeID: string | null) => void;
  dependencies?: ShutdownDependencies;
}

export interface ShutdownController {
  pendingClose: string | null;
  authorizeQuit: (closeID?: string) => Promise<ClassifiedError | undefined>;
  cancelQuit: (closeID?: string) => Promise<void>;
  clearPendingClose: (closeID?: string) => void;
  requestQuit: () => void;
}

const legacyCloseID = 'legacy-close-request';

function closeIDFromPayload(payload: unknown): string | undefined {
  if (typeof payload === 'string' && payload.length > 0) return payload;
  if (
    typeof payload === 'object' &&
    payload !== null &&
    'id' in payload &&
    typeof payload.id === 'string' &&
    payload.id.length > 0
  ) {
    return payload.id;
  }
  return undefined;
}

export function useShutdown(options: UseShutdownOptions): ShutdownController {
  const native = options.dependencies?.native ?? nativeLifecycleAdapter;
  const model = options.dependencies?.appModel ?? appModelAdapter;
  const [pendingClose, setPendingClose] = useState<string | null>(null);
  const pendingCloseRef = useRef<string | null>(null);
  const bufferedCloseRef = useRef<string | undefined>(undefined);
  const handledCloseIDsRef = useRef(new Set<string>());
  const readyRef = useRef(options.bootstrapStatus === 'ready');
  const onRequestRef = useRef(options.onRequest);
  const onPendingChangeRef = useRef(options.onPendingChange);
  const acceptCloseRef = useRef<(closeID: string) => void>(() => undefined);
  const eventHandlerRef = useRef<(payload: unknown) => void>(() => undefined);

  const setPending = useCallback((closeID: string | null): void => {
    pendingCloseRef.current = closeID;
    setPendingClose(closeID);
    onPendingChangeRef.current?.(closeID);
  }, []);

  const acceptClose = useCallback(
    (closeID: string): void => {
      if (handledCloseIDsRef.current.has(closeID)) return;
      handledCloseIDsRef.current.add(closeID);
      setPending(closeID);
      void Promise.resolve(onRequestRef.current?.(closeID)).catch(
        (): void => undefined,
      );
    },
    [setPending],
  );
  useEffect((): void => {
    readyRef.current = options.bootstrapStatus === 'ready';
    onRequestRef.current = options.onRequest;
    onPendingChangeRef.current = options.onPendingChange;
    acceptCloseRef.current = acceptClose;
    eventHandlerRef.current = (payload: unknown): void => {
      const closeID = closeIDFromPayload(payload) ?? legacyCloseID;
      if (!readyRef.current) {
        bufferedCloseRef.current = closeID;
        return;
      }
      acceptCloseRef.current(closeID);
    };
  }, [
    acceptClose,
    options.bootstrapStatus,
    options.onPendingChange,
    options.onRequest,
  ]);

  /*
   * This effect is deliberately mount-only. It is scheduled before App's
   * bootstrap effect, so a native close cannot fall between mounting the shell
   * and hydrating the projection.
   */
  useEffect((): (() => void) => {
    const dispose = native.onCloseRequested((closeID?: string): void => {
      eventHandlerRef.current(closeID);
    });
    return dispose;
  }, [native]);

  useEffect((): (() => void) | undefined => {
    if (options.bootstrapStatus !== 'ready') return undefined;

    let disposed = false;
    const explicitPendingClose =
      options.hydratedPendingCloseId !== undefined ||
      options.hydratedState !== undefined;
    const hydratedCloseID =
      options.hydratedPendingCloseId ??
      options.hydratedState?.snapshot.pendingClose?.id;

    const handleDiscoveredClose = (closeID: string | undefined): void => {
      if (disposed || closeID === undefined || closeID.length === 0) return;
      acceptCloseRef.current(closeID);
    };

    const bufferedCloseID = bufferedCloseRef.current;
    bufferedCloseRef.current = undefined;
    handleDiscoveredClose(bufferedCloseID);
    if (explicitPendingClose) {
      handleDiscoveredClose(hydratedCloseID);
      return (): void => {
        disposed = true;
      };
    }

    void model
      .getState()
      .then((state): void => {
        handleDiscoveredClose(state.snapshot.pendingClose?.id);
      })
      .catch((): void => undefined);
    return (): void => {
      disposed = true;
    };
  }, [
    model,
    options.bootstrapStatus,
    options.hydratedPendingCloseId,
    options.hydratedState,
  ]);

  const cancelQuit = useCallback(
    async (closeID = pendingCloseRef.current ?? ''): Promise<void> => {
      if (closeID.length === 0) return;
      await native.cancelQuit(closeID);
      if (pendingCloseRef.current === closeID) {
        handledCloseIDsRef.current.delete(closeID);
        setPending(null);
      }
    },
    [native, setPending],
  );

  const authorizeQuit = useCallback(
    async (
      closeID = pendingCloseRef.current ?? '',
    ): Promise<ClassifiedError | undefined> => {
      if (closeID.length === 0) return undefined;
      return native.authorizeQuit(closeID);
    },
    [native],
  );

  const clearPendingClose = useCallback(
    (closeID = pendingCloseRef.current ?? ''): void => {
      if (closeID.length === 0 || pendingCloseRef.current !== closeID) return;
      handledCloseIDsRef.current.delete(closeID);
      setPending(null);
    },
    [setPending],
  );

  return {
    pendingClose,
    authorizeQuit,
    cancelQuit,
    clearPendingClose,
    requestQuit: native.requestQuit,
  };
}
