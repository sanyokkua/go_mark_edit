import type { AppModelAdapter } from '../adapter/appModelAdapter';
import { isWireError, parseError } from '../utils/parseError';
import { notifyError } from './notificationsSlice';

import { applyStatePatch, hydrateProjection, resetProjection } from './appModelProjectionActions';
import type { ActiveBuffer, AppStatePatch } from './appModelTypes';
import { store } from './index';
import { disposeSettingsProjection } from './settingsProjection';

export type AppModelBootstrapResult =
    | {
          status: 'ready';
          activeBuffer: ActiveBuffer | null;
          applicationVersion: string;
          pendingCloseId?: string;
      }
    | {
          status: 'failed';
          failure?: {
              category: string;
              step: 'model' | 'settings';
          };
      };

interface BootstrapAttempt {
    disposeAsyncErrors?: () => void;
    disposeStatePatches?: () => void;
    isHydrated: boolean;
    isRecovering: boolean;
    queuedPatches: AppStatePatch[];
}

let bootstrapPromise: Promise<AppModelBootstrapResult> | undefined;
let activeAttempt: BootstrapAttempt | undefined;

export function bootstrapAppModelProjection(appModelAdapter: AppModelAdapter): Promise<AppModelBootstrapResult> {
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

async function initializeProjection(appModelAdapter: AppModelAdapter): Promise<AppModelBootstrapResult> {
    const attempt: BootstrapAttempt = {
        isHydrated: false,
        isRecovering: false,
        queuedPatches: [],
    };
    activeAttempt = attempt;

    try {
        attempt.disposeAsyncErrors = appModelAdapter.subscribeAsyncErrors?.((error): void => {
            if (activeAttempt !== attempt) {
                return;
            }
            store.dispatch(notifyError(error));
        });
        attempt.disposeStatePatches = appModelAdapter.subscribeStatePatches((patch: AppStatePatch): void => {
            if (activeAttempt !== attempt) {
                return;
            }
            attempt.queuedPatches.push(patch);
            if (attempt.isHydrated) {
                drainPatches(appModelAdapter, attempt);
            }
        });
        const state = await appModelAdapter.getState();
        if (activeAttempt !== attempt) {
            return { status: 'failed' };
        }
        if (state.snapshot.applicationVersion === undefined || state.snapshot.applicationVersion.length === 0) {
            throw new Error('The backend did not provide an application version.');
        }
        store.dispatch(hydrateProjection(state.snapshot));
        attempt.isHydrated = true;
        drainPatches(appModelAdapter, attempt);

        const result: Extract<AppModelBootstrapResult, { status: 'ready' }> = {
            status: 'ready',
            activeBuffer: state.activeBuffer,
            applicationVersion: state.snapshot.applicationVersion,
        };
        if (state.snapshot.pendingClose?.id !== undefined) {
            result.pendingCloseId = state.snapshot.pendingClose.id;
        }
        return result;
    } catch (error: unknown) {
        const startupStep: 'model' | 'settings' | undefined =
            isWireError(error) && (error.details?.startupStep === 'model' || error.details?.startupStep === 'settings')
                ? error.details.startupStep
                : undefined;
        const failure =
            startupStep === 'model' || startupStep === 'settings'
                ? {
                      category: isWireError(error) ? error.code : 'internal',
                      step: startupStep,
                  }
                : undefined;
        resetAttempt(attempt);
        return failure === undefined ? { status: 'failed' } : { failure, status: 'failed' };
    }
}

// Patches are partial metadata, so accepting a future revision can permanently
// hide an earlier document/workspace change. Recover from backend truth instead
// of assuming that transport delivery preserves publication order.
function drainPatches(appModelAdapter: AppModelAdapter, attempt: BootstrapAttempt, allowRecovery = true): void {
    if (attempt.isRecovering) {
        return;
    }
    while (attempt.queuedPatches.length > 0) {
        const patch = attempt.queuedPatches[0];
        // Save and close recovery can also hydrate the projection.
        const revision = store.getState().documents.revision;
        if (patch.revision <= revision) {
            attempt.queuedPatches.shift();
        } else if (patch.revision === revision + 1) {
            attempt.queuedPatches.shift();
            store.dispatch(applyStatePatch(patch));
        } else {
            if (allowRecovery) {
                attempt.isRecovering = true;
                void recoverProjection(appModelAdapter, attempt, patch.revision);
            }
            return;
        }
    }
}

async function recoverProjection(
    appModelAdapter: AppModelAdapter,
    attempt: BootstrapAttempt,
    gapRevision: number,
): Promise<void> {
    try {
        const state = await appModelAdapter.getState();
        if (activeAttempt !== attempt) {
            return;
        }
        store.dispatch(hydrateProjection(state.snapshot));
        attempt.isRecovering = false;
        // A snapshot behind its triggering event must not cause an unbounded
        // retry loop. Retain the gap and retry when another event arrives.
        drainPatches(appModelAdapter, attempt, state.snapshot.revision >= gapRevision);
    } catch (error: unknown) {
        if (activeAttempt !== attempt) {
            return;
        }
        attempt.isRecovering = false;
        // The adapter already reports classified bridge failures once.
        if (!isWireError(error)) {
            store.dispatch(notifyError(parseError(error)));
        }
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
    attempt.isRecovering = false;
    attempt.queuedPatches = [];
    store.dispatch(resetProjection());
    disposeSettingsProjection();
}
