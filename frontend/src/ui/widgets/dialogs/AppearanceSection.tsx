import { t } from '../../../i18n';
import type { ReadingWidth } from '../../../logic/adapter/settingsTypes';
import type { AppearanceChoice, Theme } from '../../../logic/theme/theme';
import type { OpenMode } from '../appearanceSettingsContext';
import Button from '../../primitives/Button';
import Select, { type SelectOption } from '../../primitives/Select';
import Segmented, { type SegmentedOption } from '../../primitives/Segmented';
import SettingsRow, { descriptionId } from './SettingsRow';
import type { SettingsDialogProps } from './settingsDialogTypes';
import styles from './SettingsDialog.module.css';

const themeOptions: readonly SegmentedOption<Theme>[] = [
    { label: t('appearance.theme.glass'), value: 'glass' },
    { label: t('appearance.theme.material'), value: 'material' },
    { label: t('appearance.theme.minimal'), value: 'minimal' },
];

const modeOptions: readonly SegmentedOption<AppearanceChoice>[] = [
    { label: t('appearance.mode.short.auto'), value: 'auto' },
    { label: t('appearance.mode.short.light'), value: 'light' },
    { label: t('appearance.mode.short.dark'), value: 'dark' },
];

const openModeOptions: readonly SelectOption<OpenMode>[] = [
    { label: t('settings.openMode.reading'), value: 'reading' },
    { label: t('settings.openMode.editor'), value: 'editor' },
    { label: t('settings.openMode.split'), value: 'split' },
    { label: t('settings.openMode.preview'), value: 'preview' },
    { label: t('settings.openMode.last'), value: 'last' },
];

const readingWidthOptions: readonly SegmentedOption<ReadingWidth>[] = [
    { label: t('settings.readingWidth.page'), value: 'page' },
    { label: t('settings.readingWidth.full'), value: 'full' },
];

const AppearanceSection: React.FC<SettingsDialogProps> = ({
    openMode,
    mode,
    onOpenModeChange,
    onModeChange,
    onReadingWidthChange,
    onReset,
    onThemeChange,
    readingWidth,
    theme,
}: SettingsDialogProps): React.JSX.Element => (
    <>
        <SettingsRow id="settings-theme" label={t('appearance.theme.label')}>
            <Segmented
                ariaLabel={t('appearance.theme.label')}
                options={themeOptions}
                value={theme}
                onChange={onThemeChange}
            />
        </SettingsRow>
        <SettingsRow id="settings-color-mode" label={t('settings.colorMode')}>
            <Segmented ariaLabel={t('settings.colorMode')} options={modeOptions} value={mode} onChange={onModeChange} />
        </SettingsRow>
        <SettingsRow
            description={t('settings.openMode.description')}
            id="settings-open-mode"
            label={t('settings.openMode')}
        >
            <Select
                describedBy={descriptionId('settings-open-mode')}
                disabled={onOpenModeChange === undefined}
                label={t('settings.openMode')}
                options={openModeOptions}
                value={openMode ?? 'last'}
                onChange={(next): void => onOpenModeChange?.(next)}
            />
        </SettingsRow>
        <SettingsRow
            description={t('settings.readingWidth.description')}
            id="settings-reading-width"
            label={t('settings.readingWidth')}
        >
            <Segmented
                ariaDescribedBy={descriptionId('settings-reading-width')}
                ariaLabel={t('settings.readingWidth')}
                disabled={onReadingWidthChange === undefined}
                options={readingWidthOptions}
                value={readingWidth}
                onChange={(next): void => onReadingWidthChange?.(next)}
            />
        </SettingsRow>
        <div className={styles.actions}>
            <Button variant="secondary" onClick={onReset}>
                {t('appearance.reset')}
            </Button>
        </div>
    </>
);

export default AppearanceSection;
