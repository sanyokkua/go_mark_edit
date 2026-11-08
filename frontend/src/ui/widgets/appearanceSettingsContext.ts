import { createContext, useContext } from 'react';

import type { PdfAppearance, ReadingWidth } from '../../logic/adapter/settingsTypes';
import type { AppearanceChoice, Theme } from '../../logic/theme/theme';

export type OpenMode = 'reading' | 'editor' | 'split' | 'preview' | 'last';

export interface AppearanceState {
    openMode: OpenMode;
    mode: AppearanceChoice;
    pdfAppearance: PdfAppearance;
    readingWidth: ReadingWidth;
    theme: Theme;
}

export interface AppearanceSettingsController {
    appearance: AppearanceState;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onOpenModeChange: (openMode: OpenMode) => void;
    onReadingWidthChange: (readingWidth: ReadingWidth) => void;
    onPdfAppearanceChange: (pdfAppearance: PdfAppearance) => void;
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
