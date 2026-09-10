import { createContext, useContext } from 'react';

import type { AppearanceChoice, Theme } from '../../logic/theme/theme';

export interface AppearanceState {
  defaultOpenMode: string;
  mode: AppearanceChoice;
  theme: Theme;
}

export interface AppearanceSettingsController {
  appearance: AppearanceState;
  onModeChange: (mode: AppearanceChoice) => void;
  onOpenAppearance: (opener?: HTMLElement | null) => void;
  onReset: () => void;
  onThemeChange: (theme: Theme) => void;
}

export const AppearanceSettingsContext = createContext<
  AppearanceSettingsController | undefined
>(undefined);

export function useAppearanceSettings(): AppearanceSettingsController {
  const controller = useContext(AppearanceSettingsContext);
  if (controller === undefined) {
    throw new Error('useAppearanceSettings requires AppearanceControls');
  }
  return controller;
}
