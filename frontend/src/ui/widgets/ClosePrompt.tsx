import { useRef, useState } from 'react';

import { t } from '../../i18n';
import type {
  CloseChoice,
  ClosePlanSummary,
} from '../../logic/store/appModelTypes';
import ModalShell from '../primitives/ModalShell';
import styles from '../primitives/ModalShell.module.css';

export interface ClosePromptProps {
  onChoice: (choice: CloseChoice) => Promise<void> | void;
  open: boolean;
  plan?: ClosePlanSummary;
}

const ClosePrompt: React.FC<ClosePromptProps> = ({
  onChoice,
  open,
  plan,
}: ClosePromptProps): React.JSX.Element | null => {
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const [busy, setBusy] = useState(false);
  if (!open || plan === undefined) return null;

  const dirtyTargets = plan.targets.filter((target) => target.dirty);
  const isSingle = plan.kind === 'single' && dirtyTargets.length === 1;
  const choose = (choice: CloseChoice): void => {
    if (busy) return;
    setBusy(true);
    void Promise.resolve(onChoice(choice)).finally(() => setBusy(false));
  };

  return (
    <ModalShell
      initialFocusRef={cancelRef}
      labelledBy="close-prompt-title"
      onBackdrop={(): void => choose('cancel')}
      onEscape={(): void => choose('cancel')}
      open
      title={t(isSingle ? 'close.single.title' : 'close.multi.title')}
    >
      <div className={styles.promptBody} data-close-prompt>
        <p>{t(isSingle ? 'close.single.message' : 'close.multi.message')}</p>
        <ul aria-label={t('close.dirtyTargets')}>
          {dirtyTargets.map((target) => (
            <li key={target.documentId} data-close-target={target.documentId}>
              {target.displayName ?? target.title}
              {target.path !== undefined && target.path.length > 0
                ? ` — ${target.path}`
                : ''}
            </li>
          ))}
        </ul>
        <div className={styles.actions}>
          <button
            ref={cancelRef}
            className={styles.secondary}
            data-close-choice="cancel"
            disabled={busy}
            type="button"
            onClick={(): void => choose('cancel')}
          >
            {t('close.cancel')}
          </button>
          <button
            className={styles.secondary}
            data-close-choice={isSingle ? 'discard' : 'discard-all'}
            disabled={busy}
            type="button"
            onClick={(): void => choose(isSingle ? 'discard' : 'discard-all')}
          >
            {t(isSingle ? 'close.discard' : 'close.discardAll')}
          </button>
          <button
            className={styles.primary}
            data-close-choice={isSingle ? 'save' : 'save-all'}
            disabled={busy}
            type="button"
            onClick={(): void => choose(isSingle ? 'save' : 'save-all')}
          >
            {t(isSingle ? 'close.save' : 'close.saveAll')}
          </button>
        </div>
      </div>
    </ModalShell>
  );
};

export default ClosePrompt;
