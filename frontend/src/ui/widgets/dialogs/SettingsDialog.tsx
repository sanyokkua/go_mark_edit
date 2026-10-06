import { t } from '../../../i18n';
import type { MarkdownSettings } from '../../../logic/adapter/settingsTypes';
import type { AppearanceChoice, Theme } from '../../../logic/theme/theme';
import type { DefaultOpenMode } from '../appearanceSettingsContext';
import ModalShell from '../../components/ModalShell';
import Button from '../../primitives/Button';
import Segmented, { type SegmentedOption } from '../../primitives/Segmented';
import styles from './SettingsDialog.module.css';

export interface SettingsDialogProps {
    defaultOpenMode?: DefaultOpenMode;
    markdownSettings?: MarkdownSettings;
    mode: AppearanceChoice;
    onDefaultOpenModeChange?: (defaultOpenMode: DefaultOpenMode) => void;
    onModeChange: (mode: AppearanceChoice) => void;
    onMarkdownSettingsChange?: (patch: Partial<MarkdownSettings>) => void;
    onOpenChange: (open: boolean) => void;
    onReset: () => void;
    onThemeChange: (theme: Theme) => void;
    open: boolean;
    returnFocusTo?: HTMLElement | null;
    theme: Theme;
}

const themeOptions: readonly SegmentedOption<Theme>[] = [
    { label: t('appearance.theme.glass'), value: 'glass' },
    { label: t('appearance.theme.material'), value: 'material' },
    { label: t('appearance.theme.minimal'), value: 'minimal' },
];

const modeOptions: readonly SegmentedOption<AppearanceChoice>[] = [
    { label: t('appearance.mode.auto'), value: 'auto' },
    { label: t('appearance.mode.light'), value: 'light' },
    { label: t('appearance.mode.dark'), value: 'dark' },
];

const openModeOptions: readonly SegmentedOption<DefaultOpenMode>[] = [
    { label: t('settings.openMode.reading'), value: 'viewer' },
    { label: t('settings.openMode.editor'), value: 'editor' },
];

const standardOptions = [
    { label: t('settings.markdown.minimal'), value: 'minimal' },
    { label: t('settings.markdown.gfm'), value: 'gfm' },
    { label: t('settings.markdown.full'), value: 'full' },
] as const;
const bulletOptions = [
    { label: t('settings.markdown.bullet.dash'), value: '-' },
    { label: t('settings.markdown.bullet.asterisk'), value: '*' },
    { label: t('settings.markdown.bullet.plus'), value: '+' },
] as const;
const emphasisOptions = [
    { label: t('settings.markdown.emphasis.underscore'), value: '_' },
    { label: t('settings.markdown.emphasis.asterisk'), value: '*' },
] as const;
const headingOptions = [
    { label: t('settings.markdown.atx.parity'), value: 'atx' },
    { label: t('settings.markdown.setext'), value: 'setext' },
] as const;

const SettingsDialog: React.FC<SettingsDialogProps> = ({
    defaultOpenMode,
    markdownSettings,
    mode,
    onDefaultOpenModeChange,
    onModeChange,
    onMarkdownSettingsChange,
    onOpenChange,
    onReset,
    onThemeChange,
    open,
    returnFocusTo,
    theme,
}: SettingsDialogProps): React.JSX.Element | null => {
    if (!open) {
        return null;
    }
    const markdownDisabled = markdownSettings === undefined || onMarkdownSettingsChange === undefined;

    return (
        <ModalShell
            dismiss="backdrop"
            onRequestClose={(): void => onOpenChange(false)}
            open
            returnFocusTo={returnFocusTo}
            title={t('shell.settings')}
            width="32rem"
        >
            <header>
                <p>{t('appearance.help')}</p>
            </header>
            <section aria-labelledby="settings-appearance-title">
                <h2 id="settings-appearance-title">{t('appearance.title')}</h2>
                <div className={styles.label}>
                    <span>{t('appearance.theme.label')}</span>
                    <Segmented
                        ariaLabel={t('appearance.theme.label')}
                        options={themeOptions}
                        value={theme}
                        onChange={onThemeChange}
                    />
                </div>
                <div className={styles.label}>
                    <span>{t('appearance.mode.label')}</span>
                    <Segmented
                        ariaLabel={t('appearance.mode.label')}
                        options={modeOptions}
                        value={mode}
                        onChange={onModeChange}
                    />
                </div>
                <div className={styles.label}>
                    <span>{t('settings.openMode')}</span>
                    <Segmented
                        ariaLabel={t('settings.openMode')}
                        disabled={onDefaultOpenModeChange === undefined}
                        options={openModeOptions}
                        value={defaultOpenMode}
                        onChange={(next): void => onDefaultOpenModeChange?.(next)}
                    />
                </div>
            </section>
            <section aria-labelledby="settings-markdown-title">
                <h2 id="settings-markdown-title">{t('settings.markdown.title')}</h2>
                <div className={styles.label}>
                    <span>{t('settings.markdown.standard')}</span>
                    <p id="settings-markdown-standard-description">{t('settings.markdown.standard.description')}</p>
                    <Segmented
                        ariaLabel={t('settings.markdown.standard')}
                        ariaDescribedBy="settings-markdown-standard-description"
                        disabled={markdownDisabled}
                        options={standardOptions}
                        value={markdownSettings?.standard}
                        onChange={(standard): void => onMarkdownSettingsChange?.({ standard })}
                    />
                </div>
                <div className={styles.label}>
                    <span>{t('settings.markdown.bullet')}</span>
                    <p id="settings-markdown-bullet-description">{t('settings.markdown.bullet.description')}</p>
                    <Segmented
                        ariaLabel={t('settings.markdown.bullet')}
                        ariaDescribedBy="settings-markdown-bullet-description"
                        disabled={markdownDisabled}
                        options={bulletOptions}
                        value={markdownSettings?.bulletMarker}
                        onChange={(bulletMarker): void => onMarkdownSettingsChange?.({ bulletMarker })}
                    />
                </div>
                <div className={styles.label}>
                    <span>{t('settings.markdown.emphasis')}</span>
                    <p id="settings-markdown-emphasis-description">{t('settings.markdown.emphasis.description')}</p>
                    <Segmented
                        ariaLabel={t('settings.markdown.emphasis')}
                        ariaDescribedBy="settings-markdown-emphasis-description"
                        disabled={markdownDisabled}
                        options={emphasisOptions}
                        value={markdownSettings?.emphasisMarker}
                        onChange={(emphasisMarker): void => onMarkdownSettingsChange?.({ emphasisMarker })}
                    />
                </div>
                <div className={styles.label}>
                    <span>{t('settings.markdown.heading')}</span>
                    <p id="settings-markdown-heading-description">{t('settings.markdown.heading.description')}</p>
                    <Segmented
                        ariaLabel={t('settings.markdown.heading')}
                        ariaDescribedBy="settings-markdown-heading-description"
                        disabled={markdownDisabled}
                        options={headingOptions}
                        value={markdownSettings?.headingStyle}
                        onChange={(headingStyle): void => onMarkdownSettingsChange?.({ headingStyle })}
                    />
                </div>
                <label className={styles.label}>
                    <span>{t('settings.formatOnSave')}</span>
                    <span id="settings-format-on-save-description">{t('settings.formatOnSave.description')}</span>
                    <input
                        aria-label={t('settings.formatOnSave')}
                        aria-describedby="settings-format-on-save-description"
                        checked={markdownSettings?.formatOnSave === true}
                        disabled={markdownDisabled}
                        type="checkbox"
                        onChange={(event): void => onMarkdownSettingsChange?.({ formatOnSave: event.target.checked })}
                    />
                </label>
                <label className={styles.label}>
                    <span>{t('settings.lintOnSave')}</span>
                    <span id="settings-lint-on-save-description">{t('settings.lintOnSave.description')}</span>
                    <input
                        aria-label={t('settings.lintOnSave')}
                        aria-describedby="settings-lint-on-save-description"
                        checked={markdownSettings?.lintOnSave === true}
                        disabled={markdownDisabled}
                        type="checkbox"
                        onChange={(event): void => onMarkdownSettingsChange?.({ lintOnSave: event.target.checked })}
                    />
                </label>
            </section>
            <footer className={styles.actions}>
                <Button className={styles.secondary} variant="secondary" onClick={onReset}>
                    {t('appearance.reset')}
                </Button>
                <Button className={styles.primary} variant="primary" onClick={(): void => onOpenChange(false)}>
                    {t('appearance.close')}
                </Button>
            </footer>
        </ModalShell>
    );
};

export default SettingsDialog;
