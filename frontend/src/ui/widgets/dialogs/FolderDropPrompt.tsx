import { useRef, useState } from 'react';

import { t } from '../../../i18n';
import ModalShell from '../../components/ModalShell';
import styles from '../../components/ModalShell/ModalShell.module.css';
import Button from '../../primitives/Button';

export type FolderDropChoice = 'first-only' | 'all-new-windows' | 'cancel';

export interface FolderDropPromptProps {
    open: boolean;
    folderPaths: readonly string[];
    onChoice: (choice: FolderDropChoice) => Promise<unknown>;
}

const FolderDropPrompt: React.FC<FolderDropPromptProps> = ({ open, folderPaths, onChoice }) => {
    const cancelRef = useRef<HTMLButtonElement | null>(null);
    const busyRef = useRef(false);
    const [busy, setBusy] = useState(false);
    if (!open) return null;

    const choose = (choice: FolderDropChoice): void => {
        if (busyRef.current) return;
        busyRef.current = true;
        setBusy(true);
        void Promise.resolve(onChoice(choice)).finally(() => {
            busyRef.current = false;
            setBusy(false);
        });
    };

    return (
        <ModalShell
            dismiss="escape"
            initialFocus={cancelRef}
            onRequestClose={() => choose('cancel')}
            open
            title={t('workspace.drop.folders.title')}
        >
            <div className={styles.promptBody} data-folder-drop-prompt>
                <p>{t('workspace.drop.folders.message', { count: folderPaths.length })}</p>
                <div className={styles.actions}>
                    <Button
                        data-testid="folder-drop-first-only"
                        disabled={busy}
                        variant="primary"
                        onClick={() => choose('first-only')}
                    >
                        {t('workspace.drop.folders.firstOnly')}
                    </Button>
                    <Button
                        data-testid="folder-drop-all-new-windows"
                        disabled={busy}
                        variant="secondary"
                        onClick={() => choose('all-new-windows')}
                    >
                        {t('workspace.drop.folders.allNewWindows')}
                    </Button>
                    <Button
                        ref={cancelRef}
                        data-testid="folder-drop-cancel"
                        disabled={busy}
                        variant="secondary"
                        onClick={() => choose('cancel')}
                    >
                        {t('workspace.drop.folders.cancel')}
                    </Button>
                </div>
            </div>
        </ModalShell>
    );
};

export default FolderDropPrompt;
