import { useRef, useState } from 'react';

import { t } from '../../../i18n';
import ModalShell from '../../components/ModalShell';
import styles from '../../components/ModalShell/ModalShell.module.css';
import Button from '../../primitives/Button';

export type CloseFolderChoice = 'close-tabs' | 'keep-tabs' | 'cancel';

export interface CloseFolderPromptProps {
    onChoice: (choice: CloseFolderChoice) => Promise<unknown>;
    open: boolean;
}

const CloseFolderPrompt: React.FC<CloseFolderPromptProps> = ({
    onChoice,
    open,
}: CloseFolderPromptProps): React.JSX.Element | null => {
    const cancelRef = useRef<HTMLButtonElement | null>(null);
    const busyRef = useRef(false);
    const [busy, setBusy] = useState(false);

    if (!open) return null;

    const choose = (choice: CloseFolderChoice): void => {
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
            title={t('workspace.close.title')}
        >
            <div className={styles.promptBody} data-close-folder-prompt>
                <p>{t('workspace.close.message')}</p>
                <div className={styles.actions}>
                    <Button
                        className={styles.primary}
                        disabled={busy}
                        variant="primary"
                        onClick={(): void => choose('close-tabs')}
                    >
                        {t('workspace.close.closeTabs')}
                    </Button>
                    <Button
                        className={styles.secondary}
                        disabled={busy}
                        variant="secondary"
                        onClick={(): void => choose('keep-tabs')}
                    >
                        {t('workspace.close.keepTabs')}
                    </Button>
                    <Button
                        ref={cancelRef}
                        className={styles.secondary}
                        disabled={busy}
                        variant="secondary"
                        onClick={(): void => choose('cancel')}
                    >
                        {t('workspace.close.cancel')}
                    </Button>
                </div>
            </div>
        </ModalShell>
    );
};

export default CloseFolderPrompt;
