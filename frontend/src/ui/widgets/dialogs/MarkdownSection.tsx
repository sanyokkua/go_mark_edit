import { t } from '../../../i18n';
import Segmented from '../../primitives/Segmented';
import Switch from '../../primitives/Switch';
import SettingsRow, { descriptionId } from './SettingsRow';
import type { SettingsDialogProps } from './settingsDialogTypes';
import styles from './SettingsDialog.module.css';

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

const MarkdownSection: React.FC<SettingsDialogProps> = ({
    markdownSettings,
    onMarkdownSettingsChange,
}: SettingsDialogProps): React.JSX.Element => {
    const disabled = markdownSettings === undefined || onMarkdownSettingsChange === undefined;
    return (
        <>
            {disabled ? <p className={styles.notice}>{t('action.settingsLoading')}</p> : null}
            <SettingsRow
                description={t('settings.markdown.standard.description')}
                id="settings-markdown-standard"
                label={t('settings.markdown.standard')}
            >
                <Segmented
                    ariaDescribedBy={descriptionId('settings-markdown-standard')}
                    ariaLabel={t('settings.markdown.standard')}
                    disabled={disabled}
                    options={standardOptions}
                    value={markdownSettings?.standard}
                    onChange={(standard): void => onMarkdownSettingsChange?.({ standard })}
                />
            </SettingsRow>
            <SettingsRow
                description={t('settings.formatOnSave.description')}
                id="settings-format-on-save"
                label={t('settings.formatOnSave')}
            >
                <Switch
                    checked={markdownSettings?.formatOnSave === true}
                    describedBy={descriptionId('settings-format-on-save')}
                    disabled={disabled}
                    label={t('settings.formatOnSave')}
                    onChange={(formatOnSave): void => onMarkdownSettingsChange?.({ formatOnSave })}
                />
            </SettingsRow>
            <SettingsRow
                description={t('settings.lintOnSave.description')}
                id="settings-lint-on-save"
                label={t('settings.lintOnSave')}
            >
                <Switch
                    checked={markdownSettings?.lintOnSave === true}
                    describedBy={descriptionId('settings-lint-on-save')}
                    disabled={disabled}
                    label={t('settings.lintOnSave')}
                    onChange={(lintOnSave): void => onMarkdownSettingsChange?.({ lintOnSave })}
                />
            </SettingsRow>
            <SettingsRow
                description={t('settings.markdown.bullet.description')}
                id="settings-markdown-bullet"
                label={t('settings.markdown.bullet')}
            >
                <Segmented
                    ariaDescribedBy={descriptionId('settings-markdown-bullet')}
                    ariaLabel={t('settings.markdown.bullet')}
                    disabled={disabled}
                    options={bulletOptions}
                    value={markdownSettings?.bulletMarker}
                    onChange={(bulletMarker): void => onMarkdownSettingsChange?.({ bulletMarker })}
                />
            </SettingsRow>
            <SettingsRow
                description={t('settings.markdown.emphasis.description')}
                id="settings-markdown-emphasis"
                label={t('settings.markdown.emphasis')}
            >
                <Segmented
                    ariaDescribedBy={descriptionId('settings-markdown-emphasis')}
                    ariaLabel={t('settings.markdown.emphasis')}
                    disabled={disabled}
                    options={emphasisOptions}
                    value={markdownSettings?.emphasisMarker}
                    onChange={(emphasisMarker): void => onMarkdownSettingsChange?.({ emphasisMarker })}
                />
            </SettingsRow>
            <SettingsRow
                description={t('settings.markdown.heading.description')}
                id="settings-markdown-heading"
                label={t('settings.markdown.heading')}
            >
                <Segmented
                    ariaDescribedBy={descriptionId('settings-markdown-heading')}
                    ariaLabel={t('settings.markdown.heading')}
                    disabled={disabled}
                    options={headingOptions}
                    value={markdownSettings?.headingStyle}
                    onChange={(headingStyle): void => onMarkdownSettingsChange?.({ headingStyle })}
                />
            </SettingsRow>
        </>
    );
};

export default MarkdownSection;
