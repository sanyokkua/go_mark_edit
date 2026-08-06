import type { SettingsAdapter } from '../adapter/services';
import { store } from './index';
import { hydrateSettings, resetSettingsProjection } from './settingsSlice';

let bootstrapPromise: Promise<void> | undefined;

export function bootstrapSettingsProjection(
  settingsAdapter: SettingsAdapter,
): Promise<void> {
  if (bootstrapPromise === undefined) {
    bootstrapPromise = settingsAdapter.getSettings().then((settings): void => {
      store.dispatch(hydrateSettings(settings));
    });
  }
  return bootstrapPromise;
}

export function disposeSettingsProjection(): void {
  bootstrapPromise = undefined;
  store.dispatch(resetSettingsProjection());
}
