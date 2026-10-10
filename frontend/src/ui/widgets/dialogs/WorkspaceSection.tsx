import { t } from '../../../i18n';
import Switch from '../../primitives/Switch';
import SettingsRow, { descriptionId } from './SettingsRow';
import type { SettingsDialogProps } from './settingsDialogTypes';

const WorkspaceSection: React.FC<SettingsDialogProps> = ({
    onShowHiddenFoldersChange,
    showHiddenFolders,
}: SettingsDialogProps): React.JSX.Element => (
    <SettingsRow
        description={t('settings.workspace.showHiddenFolders.description')}
        id="settings-show-hidden-folders"
        label={t('workspace.tree.showHiddenFolders')}
    >
        <Switch
            checked={showHiddenFolders === true}
            describedBy={descriptionId('settings-show-hidden-folders')}
            disabled={onShowHiddenFoldersChange === undefined}
            label={t('workspace.tree.showHiddenFolders')}
            onChange={(show): void => onShowHiddenFoldersChange?.(show)}
        />
    </SettingsRow>
);

export default WorkspaceSection;
