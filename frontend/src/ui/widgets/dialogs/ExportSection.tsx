import { t } from '../../../i18n';
import type { PdfAppearance } from '../../../logic/adapter/settingsTypes';
import Segmented, { type SegmentedOption } from '../../primitives/Segmented';
import SettingsRow, { descriptionId } from './SettingsRow';
import type { SettingsDialogProps } from './settingsDialogTypes';

const pdfAppearanceOptions: readonly SegmentedOption<PdfAppearance>[] = [
    { label: t('settings.pdfAppearance.styled'), value: 'styled' },
    { label: t('settings.pdfAppearance.clean'), value: 'clean' },
];

const ExportSection: React.FC<SettingsDialogProps> = ({
    onPdfAppearanceChange,
    pdfAppearance,
}: SettingsDialogProps): React.JSX.Element => (
    <SettingsRow
        description={t('settings.pdfAppearance.description')}
        id="settings-pdf-appearance"
        label={t('settings.pdfAppearance')}
    >
        <Segmented
            ariaDescribedBy={descriptionId('settings-pdf-appearance')}
            ariaLabel={t('settings.pdfAppearance')}
            disabled={onPdfAppearanceChange === undefined}
            options={pdfAppearanceOptions}
            value={pdfAppearance}
            onChange={(next): void => onPdfAppearanceChange?.(next)}
        />
    </SettingsRow>
);

export default ExportSection;
