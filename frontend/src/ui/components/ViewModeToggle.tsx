import type { ViewArrangement } from '../../logic/store/appModelTypes';
import { t } from '../../i18n';
import Segmented, { type SegmentedOption } from '../primitives/Segmented';

const viewModeOptions: readonly SegmentedOption<ViewArrangement>[] = [
  { label: t('status.arrangement.editor'), value: 'editor' },
  { label: t('status.arrangement.split'), value: 'split' },
  { label: t('status.arrangement.preview'), value: 'preview' },
];

export interface ViewModeToggleProps {
  onChange: (arrangement: ViewArrangement) => void;
  value: ViewArrangement;
}

const ViewModeToggle: React.FC<ViewModeToggleProps> = ({
  onChange,
  value,
}: ViewModeToggleProps): React.JSX.Element => (
  <Segmented
    aria-label={t('editor.arrangement')}
    options={viewModeOptions}
    value={value}
    onValueChange={onChange}
  />
);

export default ViewModeToggle;
