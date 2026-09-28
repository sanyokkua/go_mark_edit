import { t } from '../../../i18n';
import Button from '../../primitives/Button';
import styles from './WorkspaceTree.module.css';

interface WorkspaceEmptyStateProps {
    onOpenFolder: () => unknown;
}

export default function WorkspaceEmptyState({ onOpenFolder }: WorkspaceEmptyStateProps): React.JSX.Element {
    return (
        <div className={styles.emptyState}>
            <p>{t('workspace.tree.noFolder')}</p>
            <Button
                variant="secondary"
                onClick={(): void => {
                    void onOpenFolder();
                }}
            >
                {t('workspace.tree.openFolder')}
            </Button>
        </div>
    );
}
