import {
  normalizeAppearance,
  normalizeTheme,
  type AppearanceChoice,
  type Theme,
} from './theme';

const storageKey = 'gme.theme';
const startupThemeMirrorVersion = 1;

export interface StartupThemeMirror {
  mode: AppearanceChoice;
  theme: Theme;
}

export function readStartupThemeMirror(storage: Storage): StartupThemeMirror {
  try {
    const value: unknown = JSON.parse(storage.getItem(storageKey) ?? 'null');
    if (
      typeof value === 'object' &&
      value !== null &&
      'theme' in value &&
      'mode' in value &&
      'version' in value &&
      value.version === startupThemeMirrorVersion &&
      typeof value.theme === 'string' &&
      typeof value.mode === 'string' &&
      normalizeTheme(value.theme) === value.theme &&
      normalizeAppearance(value.mode) === value.mode
    ) {
      return { theme: value.theme, mode: value.mode };
    }
  } catch {
    // A corrupted pre-paint cache is never authoritative.
  }
  return { theme: 'material', mode: 'auto' };
}

export function writeStartupThemeMirror(
  storage: Storage,
  mirror: StartupThemeMirror,
): void {
  storage.setItem(
    storageKey,
    JSON.stringify({ version: startupThemeMirrorVersion, ...mirror }),
  );
}
