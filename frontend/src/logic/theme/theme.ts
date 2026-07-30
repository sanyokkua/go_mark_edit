export type Theme = 'glass' | 'material' | 'minimal';
export type AppearanceChoice = 'auto' | 'light' | 'dark';
export type ResolvedAppearance = Exclude<AppearanceChoice, 'auto'>;

export interface ThemeState {
  mode: ResolvedAppearance;
  theme: Theme;
}

export function normalizeTheme(value: string): Theme {
  return value === 'glass' || value === 'minimal' ? value : 'material';
}

export function normalizeAppearance(value: string): AppearanceChoice {
  return value === 'light' || value === 'dark' ? value : 'auto';
}

export function resolveAppearance(
  choice: AppearanceChoice,
  prefersDark: () => boolean,
): ResolvedAppearance {
  return choice === 'auto' ? (prefersDark() ? 'dark' : 'light') : choice;
}

interface AppearanceMediaQuery {
  addEventListener(
    type: 'change',
    listener: (event: { matches: boolean }) => void,
  ): void;
  matches: boolean;
  removeEventListener(
    type: 'change',
    listener: (event: { matches: boolean }) => void,
  ): void;
}

export function observeSystemAppearance(
  choice: AppearanceChoice,
  matchMedia: (query: string) => AppearanceMediaQuery,
  onChange: (mode: ResolvedAppearance) => void,
): () => void {
  if (choice !== 'auto') return (): void => undefined;
  const media = matchMedia('(prefers-color-scheme: dark)');
  const listener = (event: { matches: boolean }): void =>
    onChange(event.matches ? 'dark' : 'light');
  media.addEventListener('change', listener);
  return (): void => media.removeEventListener('change', listener);
}

export function applyThemeToRoot(
  state: ThemeState,
  documentRef: Document,
): void {
  documentRef.documentElement.setAttribute('data-theme', state.theme);
  documentRef.documentElement.setAttribute('data-mode', state.mode);
}
