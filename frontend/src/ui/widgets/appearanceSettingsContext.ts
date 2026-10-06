import { createContext, useContext } from 'react';

import type { ReadingWidth } from '../../logic/adapter/settingsTypes';
import type { AppearanceChoice, Theme } from '../../logic/theme/theme';

export type DefaultOpenMode = 'viewer' | 'editor';

export interface AppearanceState {
    defaultOpenMode: string;
    mode: AppearanceChoice;
    readingWidth: ReadingWidth;
    theme: Theme;
}

export interface AppearanceSettingsController {
    appearance: AppearanceState;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onDefaultOpenModeChange: (defaultOpenMode: DefaultOpenMode) => void;
    onReadingWidthChange: (readingWidth: ReadingWidth) => void;
    onModeChange: (mode: AppearanceChoice) => void;
    onOpenAppearance: (opener?: HTMLElement | null) => void;
    onReset: () => void;
    returnFocusTo: HTMLElement | null;
    onThemeChange: (theme: Theme) => void;
}

export const AppearanceSettingsContext = createContext<AppearanceSettingsController | undefined>(undefined);

export function useAppearanceSettings(): AppearanceSettingsController {
    const controller = useContext(AppearanceSettingsContext);
    if (controller === undefined) {
        throw new Error('useAppearanceSettings requires AppearanceControls');
    }
    return controller;
}
