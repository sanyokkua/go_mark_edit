import type { ViewArrangement } from '../../logic/store/appModelTypes';
import Segmented, { type SegmentedOption } from '../primitives/Segmented';

const viewModeOptions: readonly SegmentedOption<ViewArrangement>[] = [
  { label: 'Editor', value: 'editor' },
  { label: 'Split', value: 'split' },
  { label: 'Preview', value: 'preview' },
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
    aria-label="View arrangement"
    options={viewModeOptions}
    value={value}
    onValueChange={onChange}
  />
);

export default ViewModeToggle;
