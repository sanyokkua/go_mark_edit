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

let bootstrapPromise: Promise<AppModelBootstrapResult> | undefined;
let disposeStatePatches: (() => void) | undefined;
let isHydrated = false;
let queuedPatches: AppStatePatch[] = [];

export function bootstrapAppModelProjection(
  appModelAdapter: AppModelAdapter,
): Promise<AppModelBootstrapResult> {
  if (bootstrapPromise === undefined) {
    bootstrapPromise = initializeProjection(appModelAdapter);
  }
  return bootstrapPromise;
}

export function disposeAppModelProjection(): void {
  disposeStatePatches?.();
  disposeStatePatches = undefined;
  bootstrapPromise = undefined;
  isHydrated = false;
  queuedPatches = [];
  store.dispatch(resetProjection());
}

async function initializeProjection(
  appModelAdapter: AppModelAdapter,
): Promise<AppModelBootstrapResult> {
  disposeStatePatches = appModelAdapter.subscribeStatePatches(
    (patch: AppStatePatch): void => {
      if (!isHydrated) {
        queuedPatches.push(patch);
        return;
      }
      store.dispatch(applyStatePatch(patch));
    },
  );

  try {
    const state = await appModelAdapter.getState();
    store.dispatch(hydrateProjection(state.snapshot));
    isHydrated = true;
    for (const patch of queuedPatches) {
      store.dispatch(applyStatePatch(patch));
    }
    queuedPatches = [];

    return { status: 'ready', activeBuffer: state.activeBuffer };
  } catch {
    disposeStatePatches?.();
    disposeStatePatches = undefined;
    isHydrated = false;
    queuedPatches = [];
    store.dispatch(resetProjection());
    return { status: 'failed' };
  }
}
