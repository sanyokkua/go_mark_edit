import type {
    EditorSettings,
    FileSettings,
    MarkdownSettings,
    PdfAppearance,
    ReadingWidth,
} from '../../../logic/adapter/settingsTypes';
import type { AppearanceChoice, Theme } from '../../../logic/theme/theme';
import type { DefaultOpenMode } from '../appearanceSettingsContext';

/** Everything the Settings dialog shows and the writers it calls. A missing handler disables its control. */
export interface SettingsDialogProps {
    defaultOpenMode?: DefaultOpenMode;
    editorSettings?: EditorSettings;
    fileSettings?: FileSettings;
    markdownSettings?: MarkdownSettings;
    mode: AppearanceChoice;
    onDefaultOpenModeChange?: (defaultOpenMode: DefaultOpenMode) => void;
    onEditorSettingsChange?: (patch: Partial<EditorSettings>) => void;
    onFileSettingsChange?: (patch: Partial<FileSettings>) => void;
    onMarkdownSettingsChange?: (patch: Partial<MarkdownSettings>) => void;
    onModeChange: (mode: AppearanceChoice) => void;
    onOpenChange: (open: boolean) => void;
    onPdfAppearanceChange?: (pdfAppearance: PdfAppearance) => void;
    onReadingWidthChange?: (readingWidth: ReadingWidth) => void;
    onReset: () => void;
    onThemeChange: (theme: Theme) => void;
    open: boolean;
    pdfAppearance?: PdfAppearance;
    readingWidth?: ReadingWidth;
    returnFocusTo?: HTMLElement | null;
    theme: Theme;
}
