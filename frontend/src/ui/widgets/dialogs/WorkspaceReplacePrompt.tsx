import { useRef, useState } from 'react';

import { t } from '../../../i18n';
import ModalShell from '../../components/ModalShell';
import styles from '../../components/ModalShell/ModalShell.module.css';
import Button from '../../primitives/Button';

export type WorkspaceReplaceChoice = 'replace' | 'new-window' | 'cancel';

export interface WorkspaceReplacePromptProps {
    folderPath: string;
    onChoice: (choice: WorkspaceReplaceChoice) => Promise<unknown>;
    open: boolean;
}

const WorkspaceReplacePrompt: React.FC<WorkspaceReplacePromptProps> = ({
    folderPath,
    onChoice,
    open,
}: WorkspaceReplacePromptProps): React.JSX.Element | null => {
    const cancelRef = useRef<HTMLButtonElement | null>(null);
    const busyRef = useRef(false);
    const [busy, setBusy] = useState(false);

    if (!open) return null;

    const choose = (choice: WorkspaceReplaceChoice): void => {
        if (busyRef.current) return;
        busyRef.current = true;
        setBusy(true);
        void Promise.resolve(onChoice(choice)).finally((): void => {
            busyRef.current = false;
            setBusy(false);
        });
    };

    return (
        <ModalShell
            dismiss="escape"
            initialFocus={cancelRef}
            onRequestClose={(): void => choose('cancel')}
            open
            title={t('workspace.replace.title')}
        >
            <div className={styles.promptBody} data-workspace-replace-prompt>
                <p>{t('workspace.replace.message', { folderPath })}</p>
                <div className={styles.actions}>
                    <Button
                        className={styles.primary}
                        disabled={busy}
                        variant="primary"
                        onClick={(): void => choose('replace')}
                    >
                        {t('workspace.replace.replace')}
                    </Button>
                    <Button
                        className={styles.secondary}
                        disabled={busy}
                        variant="secondary"
                        onClick={(): void => choose('new-window')}
                    >
                        {t('workspace.replace.newWindow')}
                    </Button>
                    <Button
                        ref={cancelRef}
                        className={styles.secondary}
                        disabled={busy}
                        variant="secondary"
                        onClick={(): void => choose('cancel')}
                    >
                        {t('workspace.replace.cancel')}
                    </Button>
                </div>
            </div>
        </ModalShell>
    );
};

export default WorkspaceReplacePrompt;
