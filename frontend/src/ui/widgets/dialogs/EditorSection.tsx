import { t } from '../../../i18n';
import Select, { type SelectOption } from '../../primitives/Select';
import Switch from '../../primitives/Switch';
import SettingsRow, { descriptionId } from './SettingsRow';
import type { SettingsDialogProps } from './settingsDialogTypes';

type FontSizeChoice = '13' | '14' | '16';

const fontSizeOptions: readonly SelectOption<FontSizeChoice>[] = [
    { label: t('settings.fontSize.13'), value: '13' },
    { label: t('settings.fontSize.14'), value: '14' },
    { label: t('settings.fontSize.16'), value: '16' },
];

const EditorSection: React.FC<SettingsDialogProps> = ({
    editorSettings,
    fileSettings,
    onEditorSettingsChange,
    onFileSettingsChange,
}: SettingsDialogProps): React.JSX.Element => (
    <>
        <SettingsRow
            description={t('settings.autosave.description')}
            id="settings-autosave"
            label={t('settings.autosave')}
        >
            <Switch
                checked={fileSettings?.autosave === true}
                describedBy={descriptionId('settings-autosave')}
                disabled={onFileSettingsChange === undefined}
                label={t('settings.autosave')}
                onChange={(autosave): void => onFileSettingsChange?.({ autosave })}
            />
        </SettingsRow>
        <SettingsRow id="settings-line-numbers" label={t('settings.editor.lineNumbers')}>
            <Switch
                checked={editorSettings?.lineNumbers === true}
                disabled={onEditorSettingsChange === undefined}
                label={t('settings.editor.lineNumbers')}
                onChange={(lineNumbers): void => onEditorSettingsChange?.({ lineNumbers })}
            />
        </SettingsRow>
        <SettingsRow id="settings-word-wrap" label={t('settings.editor.wordWrap')}>
            <Switch
                checked={editorSettings?.wordWrap === true}
                disabled={onEditorSettingsChange === undefined}
                label={t('settings.editor.wordWrap')}
                onChange={(wordWrap): void => onEditorSettingsChange?.({ wordWrap })}
            />
        </SettingsRow>
        <SettingsRow id="settings-scroll-sync" label={t('settings.editor.scrollSync')}>
            <Switch
                checked={editorSettings?.scrollSync === true}
                disabled={onEditorSettingsChange === undefined}
                label={t('settings.editor.scrollSync')}
                onChange={(scrollSync): void => onEditorSettingsChange?.({ scrollSync })}
            />
        </SettingsRow>
        <SettingsRow id="settings-font-size" label={t('settings.editor.fontSize.short')}>
            <Select
                disabled={onEditorSettingsChange === undefined || editorSettings === undefined}
                label={t('settings.editor.fontSize.short')}
                options={fontSizeOptions}
                value={String(editorSettings?.fontSize ?? 14) as FontSizeChoice}
                onChange={(fontSize): void => onEditorSettingsChange?.({ fontSize: Number(fontSize) })}
            />
        </SettingsRow>
    </>
);

export default EditorSection;
