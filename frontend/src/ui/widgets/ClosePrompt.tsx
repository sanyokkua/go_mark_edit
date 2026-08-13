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
  const parityRoute =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('parity-case');
  const paritySingleTitle = isSingle
    ? `Save changes to ${dirtyTargets[0]?.displayName ?? dirtyTargets[0]?.title ?? 'document'}?`
    : undefined;
  const title =
    plan.kind === 'quit'
      ? t('close.quit.title')
      : t(isSingle ? 'close.single.title' : 'close.multi.title');
  const choose = (choice: CloseChoice): void => {
    if (busy) return;
    setBusy(true);
    void Promise.resolve(onChoice(choice)).finally(() => setBusy(false));
  };

  return (
    <ModalShell
      initialFocusRef={cancelRef}
      labelledBy="close-prompt-title"
      /*
       * A click outside deliberately does nothing. This box asks whether to
       * keep unsaved work, and a stray click is the least deliberate gesture a
       * user can make — it should not be the one that answers the question.
       * Escape still cancels, so the box is dismissable by keyboard, and Cancel
       * takes focus when it opens.
       */
      onBackdrop={(): void => undefined}
      onEscape={(): void => choose('cancel')}
      open
      heading={parityRoute ? paritySingleTitle : undefined}
      title={title}
    >
      <div
        className={styles.promptBody}
        data-close-kind={isSingle ? 'single' : plan.kind}
        data-close-prompt
      >
        <p>
          {parityRoute && isSingle
            ? 'It has unsaved changes. Cancel leaves everything exactly as it is — nothing has been written.'
            : t(isSingle ? 'close.single.message' : 'close.multi.message')}
        </p>
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
