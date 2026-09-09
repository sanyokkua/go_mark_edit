import type { SettingsAdapter } from '../adapter/services';
import { store } from './index';
import { hydrateSettings, resetSettingsProjection } from './settingsSlice';

let bootstrapPromise: Promise<void> | undefined;

export function bootstrapSettingsProjection(
  settingsAdapter: SettingsAdapter,
): Promise<void> {
  if (bootstrapPromise === undefined) {
    const trackedPromise: Promise<void> = Promise.resolve()
      .then(() => settingsAdapter.getSettings())
      .then((settings): void => {
        if (bootstrapPromise !== trackedPromise) return;
        store.dispatch(hydrateSettings(settings));
      })
      .catch((error: unknown): never => {
        if (bootstrapPromise === trackedPromise) {
          bootstrapPromise = undefined;
        }
        throw error;
      });
    bootstrapPromise = trackedPromise;
  }
  return bootstrapPromise;
}

export function disposeSettingsProjection(): void {
  bootstrapPromise = undefined;
  store.dispatch(resetSettingsProjection());
}
