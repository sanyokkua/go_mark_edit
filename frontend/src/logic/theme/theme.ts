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

export function applyThemeToRoot(
  state: ThemeState,
  documentRef: Document,
): void {
  documentRef.documentElement.setAttribute('data-theme', state.theme);
  documentRef.documentElement.setAttribute('data-mode', state.mode);
}
