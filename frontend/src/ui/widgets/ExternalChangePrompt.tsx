import { useRef, useState } from 'react';

import { t } from '../../i18n';
import type { ConflictPreview } from '../../logic/store/appModelTypes';
import ModalShell from '../primitives/ModalShell';
import styles from '../primitives/ModalShell.module.css';

export type ExternalChangeDecision = 'reload' | 'keep-mine' | 'skip' | 'cancel';

export interface ExternalChangePromptProps {
  onDecision: (decision: ExternalChangeDecision) => Promise<void> | void;
  open: boolean;
  preview?: ConflictPreview;
  valid?: boolean;
}

function sideLabel(
  name: 'onDisk' | 'yours',
  side: ConflictPreview['onDisk'],
): string {
  return t('conflict.sideLabel', {
    bytes: side.byteCount,
    label: name === 'onDisk' ? t('conflict.onDisk') : t('conflict.yours'),
    lines: side.lineCount,
  });
}

const ExternalChangePrompt: React.FC<ExternalChangePromptProps> = ({
  onDecision,
  open,
  preview,
  valid = true,
}: ExternalChangePromptProps): React.JSX.Element | null => {
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const skipRef = useRef<HTMLButtonElement | null>(null);
  const [busy, setBusy] = useState(false);
  if (!open || preview === undefined) return null;

  const choose = (decision: ExternalChangeDecision): void => {
    if (busy || (decision === 'keep-mine' && !valid)) return;
    setBusy(true);
    void Promise.resolve(onDecision(decision)).finally(() => setBusy(false));
  };
  const contentDiffers = preview.onDisk.text !== preview.yours.text;
  const title = t('conflict.title');
  const initialFocusRef = preview.readOnly ? cancelRef : skipRef;

  return (
    <ModalShell
      initialFocusRef={initialFocusRef}
      labelledBy="external-change-title"
      onBackdrop={(): void => choose(preview.readOnly ? 'cancel' : 'skip')}
      onEscape={(): void => choose(preview.readOnly ? 'cancel' : 'skip')}
      open
      title={title}
    >
      <div className={styles.promptBody}>
        <p>
          {t('conflict.message', {
            filename:
              preview.displayName ?? preview.path ?? t('editor.untitled'),
          })}
        </p>
        {!valid ? (
          <p className={styles.warning} data-conflict-invalidated>
            {t('conflict.invalidated')}
          </p>
        ) : null}
        {preview.metadataDifferences?.length ? (
          <section
            aria-label={t('conflict.metadataRegion')}
            className={styles.metadata}
          >
            <h2>{t('conflict.metadataTitle')}</h2>
            <ul>
              {preview.metadataDifferences.map((difference) => (
                <li key={difference}>{difference}</li>
              ))}
            </ul>
          </section>
        ) : null}
        {contentDiffers ? (
          <section
            aria-label={t('conflict.hunkRegion')}
            className={styles.comparison}
          >
            {(['onDisk', 'yours'] as const).map((name) => {
              const side = preview[name];
              return (
                <div className={styles.side} key={name}>
                  <h2>{sideLabel(name, side)}</h2>
                  <pre>{side.text}</pre>
                  {side.truncated ? (
                    <p data-conflict-truncated={name}>
                      {t('conflict.truncated')}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </section>
        ) : null}
        <div className={styles.actions}>
          <button
            className={styles.primary}
            data-conflict-action="reload"
            disabled={busy}
            type="button"
            onClick={(): void => choose('reload')}
          >
            {t('conflict.reload')}
          </button>
          {!preview.readOnly ? (
            <button
              className={styles.primary}
              data-conflict-action="keep-mine"
              disabled={busy || !valid}
              type="button"
              onClick={(): void => choose('keep-mine')}
            >
              {t('conflict.keepMine')}
            </button>
          ) : null}
          {!preview.readOnly ? (
            <button
              ref={skipRef}
              className={styles.secondary}
              data-conflict-action="skip"
              disabled={busy}
              type="button"
              onClick={(): void => choose('skip')}
            >
              {t('conflict.skip')}
            </button>
          ) : null}
          {preview.readOnly ? (
            <button
              ref={cancelRef}
              className={styles.secondary}
              data-conflict-action="cancel"
              disabled={busy}
              type="button"
              onClick={(): void => choose('cancel')}
            >
              {t('conflict.cancel')}
            </button>
          ) : null}
        </div>
      </div>
    </ModalShell>
  );
};

export default ExternalChangePrompt;
