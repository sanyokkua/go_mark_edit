import type { AppModelAdapter } from '../adapter/appModelAdapter';

import {
  applyStatePatch,
  hydrateProjection,
  resetProjection,
} from './appModelProjectionActions';
import type { ActiveBuffer, AppStatePatch } from './appModelTypes';
import { store } from './index';

export type AppModelBootstrapResult =
  { status: 'ready'; activeBuffer: ActiveBuffer } | { status: 'failed' };

interface BootstrapAttempt {
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
    store.dispatch(hydrateProjection(state.snapshot));
    attempt.isHydrated = true;
    for (const patch of attempt.queuedPatches) {
      store.dispatch(applyStatePatch(patch));
    }
    attempt.queuedPatches = [];

    return { status: 'ready', activeBuffer: state.activeBuffer };
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
  attempt.disposeStatePatches?.();
  attempt.disposeStatePatches = undefined;
  attempt.isHydrated = false;
  attempt.queuedPatches = [];
  store.dispatch(resetProjection());
}
