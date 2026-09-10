import { useRef, useState } from 'react';

import { t } from '../../../i18n';
import ModalShell from '../../components/ModalShell';
import Button from '../../primitives/Button';
import styles from './SettingsDialog.module.css';

export interface NormalizationPromptProps {
  filename: string;
  onCancel: () => void;
  onConfirm: () => Promise<void> | void;
  open: boolean;
  proposedEnding: 'lf' | 'crlf';
}

const NormalizationPrompt: React.FC<NormalizationPromptProps> = ({
  filename,
  onCancel,
  onConfirm,
  open,
  proposedEnding,
}: NormalizationPromptProps): React.JSX.Element | null => {
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const [busy, setBusy] = useState(false);

  if (!open) {
    return null;
  }

  const confirm = (): void => {
    if (busy) return;
    setBusy(true);
    void Promise.resolve(onConfirm()).finally((): void => setBusy(false));
  };

  return (
    <ModalShell
      dismiss="backdrop"
      initialFocus={cancelRef}
      onRequestClose={onCancel}
      open
      title={t('normalization.title')}
      width="440px"
    >
      <div className={styles.normalizationBody} data-normalization-prompt>
        <header>
          <p>
            {t('normalization.message', {
              ending: proposedEnding.toUpperCase(),
              filename,
            })}
          </p>
        </header>
        <footer className={styles.actions}>
          <Button
            className={styles.primary}
            disabled={busy}
            variant="primary"
            onClick={confirm}
          >
            {t('normalization.confirm')}
          </Button>
          <Button
            ref={cancelRef}
            className={styles.secondary}
            disabled={busy}
            variant="secondary"
            onClick={onCancel}
          >
            {t('normalization.cancel')}
          </Button>
        </footer>
      </div>
    </ModalShell>
  );
};

export default NormalizationPrompt;
