import { t } from '../../../i18n';
import ToolButton from '../../primitives/ToolButton';
import styles from './WorkspaceTree.module.css';

interface HiddenFoldersToggleProps {
    pressed: boolean;
    onChange: (show: boolean) => unknown;
}

export default function HiddenFoldersToggle({
    pressed,
    onChange,
}: Readonly<HiddenFoldersToggleProps>): React.JSX.Element {
    return (
        <ToolButton
            className={styles.hiddenToggle}
            label={t('workspace.tree.showHiddenFolders')}
            onActivate={(): void => {
                void onChange(!pressed);
            }}
            pressed={pressed}
            variant="text"
        />
    );
}
