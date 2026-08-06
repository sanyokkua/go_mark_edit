import type { AppModelAdapter } from '../adapter/appModelAdapter';
import { notifyError } from './notificationsSlice';

import {
  applyStatePatch,
  hydrateProjection,
  resetProjection,
} from './appModelProjectionActions';
import type { ActiveBuffer, AppStatePatch } from './appModelTypes';
import { store } from './index';
import { disposeSettingsProjection } from './settingsProjection';

export type AppModelBootstrapResult =
  | { status: 'ready'; activeBuffer: ActiveBuffer; applicationVersion: string }
  | { status: 'failed' };

interface BootstrapAttempt {
  disposeAsyncErrors?: () => void;
  disposeStatePatches?: () => void;
  isHydrated: boolean;
  queuedPatches: AppStatePatch[];
}

let bootstrapPromise: Promise<AppModelBootstrapResult> | undefined;
let activeAttempt: BootstrapAttempt | undefined;

export function bootstrapAppModelProjection(
  appModelAdapter: AppModelAdapter,
): Promise<AppModelBootstrapResult> {
  if (bootstrapPromise === undefined) {
    bootstrapPromise = initializeProjection(appModelAdapter);
  }
  return bootstrapPromise;
}

export function disposeAppModelProjection(): void {
  if (activeAttempt !== undefined) {
    resetAttempt(activeAttempt);
  }
}

async function initializeProjection(
  appModelAdapter: AppModelAdapter,
): Promise<AppModelBootstrapResult> {
  const attempt: BootstrapAttempt = {
    isHydrated: false,
    queuedPatches: [],
  };
  activeAttempt = attempt;

  try {
    attempt.disposeAsyncErrors = appModelAdapter.subscribeAsyncErrors?.(
      (error): void => {
        if (activeAttempt !== attempt) {
          return;
        }
        store.dispatch(notifyError(error));
      },
    );
    attempt.disposeStatePatches = appModelAdapter.subscribeStatePatches(
      (patch: AppStatePatch): void => {
        if (activeAttempt !== attempt) {
          return;
        }
        if (!attempt.isHydrated) {
          attempt.queuedPatches.push(patch);
          return;
        }
        store.dispatch(applyStatePatch(patch));
      },
    );
    const state = await appModelAdapter.getState();
    if (activeAttempt !== attempt) {
      return { status: 'failed' };
    }
    if (
      state.snapshot.applicationVersion === undefined ||
      state.snapshot.applicationVersion.length === 0
    ) {
      throw new Error('The backend did not provide an application version.');
    }
    store.dispatch(hydrateProjection(state.snapshot));
    attempt.isHydrated = true;
    for (const patch of attempt.queuedPatches) {
      store.dispatch(applyStatePatch(patch));
    }
    attempt.queuedPatches = [];

    return {
      status: 'ready',
      activeBuffer: state.activeBuffer,
      applicationVersion: state.snapshot.applicationVersion,
    };
  } catch {
    resetAttempt(attempt);
    return { status: 'failed' };
  }
}

function resetAttempt(attempt: BootstrapAttempt): void {
  if (activeAttempt !== attempt) {
    return;
  }

  activeAttempt = undefined;
  bootstrapPromise = undefined;
  attempt.disposeAsyncErrors?.();
  attempt.disposeAsyncErrors = undefined;
  attempt.disposeStatePatches?.();
  attempt.disposeStatePatches = undefined;
  attempt.isHydrated = false;
  attempt.queuedPatches = [];
  store.dispatch(resetProjection());
  disposeSettingsProjection();
}
