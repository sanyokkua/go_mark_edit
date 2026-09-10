import { useRef, useState } from 'react';

import { t } from '../../i18n';
import type { ConflictPreview } from '../../logic/store/appModelTypes';
import ModalShell from '../components/ModalShell';
import Button from '../primitives/Button';
import styles from '../components/ModalShell/ModalShell.module.css';
import { safeBasenameOf } from './tabLabel';

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
  const contentDiffers =
    preview.onDisk.text !== preview.yours.text ||
    preview.onDisk.truncated === true ||
    preview.yours.truncated === true;
  const title = t('conflict.title');
  const initialFocusRef = preview.readOnly ? cancelRef : skipRef;

  return (
    <ModalShell
      dismiss="backdrop"
      initialFocus={initialFocusRef}
      onRequestClose={(): void => choose(preview.readOnly ? 'cancel' : 'skip')}
      open
      title={title}
    >
      <div className={styles.promptBody}>
        <p>
          {t('conflict.message', {
            /*
             * FR-FT-048 forbids a private full path in user-facing copy, and
             * the classified error contract narrows the subject to the safe
             * basename. `displayName` is already that; `path` is the full
             * canonical path and MUST be reduced before it is rendered.
             */
            filename:
              preview.displayName ??
              safeBasenameOf(preview.path) ??
              t('editor.untitled'),
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
          <Button
            className={styles.primary}
            data-conflict-action="reload"
            disabled={busy}
            variant="primary"
            onClick={(): void => choose('reload')}
          >
            {t('conflict.reload')}
          </Button>
          {!preview.readOnly ? (
            <Button
              className={styles.primary}
              data-conflict-action="keep-mine"
              disabled={busy || !valid}
              variant="primary"
              onClick={(): void => choose('keep-mine')}
            >
              {t('conflict.keepMine')}
            </Button>
          ) : null}
          {!preview.readOnly ? (
            <Button
              ref={skipRef}
              className={styles.secondary}
              data-conflict-action="skip"
              disabled={busy}
              variant="secondary"
              onClick={(): void => choose('skip')}
            >
              {t('conflict.skip')}
            </Button>
          ) : null}
          {preview.readOnly ? (
            <Button
              ref={cancelRef}
              className={styles.secondary}
              data-conflict-action="cancel"
              disabled={busy}
              variant="secondary"
              onClick={(): void => choose('cancel')}
            >
              {t('conflict.cancel')}
            </Button>
          ) : null}
        </div>
      </div>
    </ModalShell>
  );
};

export default ExternalChangePrompt;
