import { useEffect, useRef, useState } from 'react';

import { t } from '../../i18n';
import Button from '../primitives/Button';
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

  useEffect((): void => {
    if (open) {
      cancelRef.current?.focus();
    }
  }, [open]);

  if (!open) {
    return null;
  }

  const confirm = (): void => {
    if (busy) return;
    setBusy(true);
    void Promise.resolve(onConfirm()).finally((): void => setBusy(false));
  };

  return (
    <>
      <div
        aria-hidden="true"
        className={styles.overlay}
        data-normalization-backdrop
        onPointerDown={onCancel}
      />
      <section
        aria-labelledby="normalization-dialog-title"
        aria-modal="true"
        className={styles.content}
        data-normalization-prompt
        onKeyDown={(event): void => {
          if (event.key === 'Escape') {
            event.preventDefault();
            onCancel();
          }
        }}
        role="dialog"
        tabIndex={-1}
      >
        <header>
          <h1 id="normalization-dialog-title">{t('normalization.title')}</h1>
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
      </section>
    </>
  );
};

export default NormalizationPrompt;
