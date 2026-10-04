import { useRef, useState } from 'react';

import { t } from '../../../i18n';
import type { ConflictPreview } from '../../../logic/store/appModelTypes';
import ModalShell from '../../components/ModalShell';
import Button from '../../primitives/Button';
import ConflictDiff from '../../components/ConflictDiff';
import styles from '../../components/ModalShell/ModalShell.module.css';
import { safeBasenameOf } from '../tabLabel';

export type ExternalChangeDecision = 'reload' | 'keep-mine' | 'skip' | 'cancel';

export interface ExternalChangePromptProps {
    onDecision: (decision: ExternalChangeDecision) => Promise<void> | void;
    open: boolean;
    preview?: ConflictPreview;
    valid?: boolean;
}

function sideLabel(name: 'onDisk' | 'yours', side: ConflictPreview['onDisk']): string {
    const label = name === 'onDisk' ? t('conflict.onDisk') : t('conflict.yoursSaved');
    if (side.byteCount === null) {
        const reason = side.byteCountUnavailableReason ?? 'unsafe-content';
        return t('conflict.sideUnavailable', {
            label,
            lines: side.lineCount,
            reason: t(`conflict.size.${reason}`),
        });
    }
    return t('conflict.sideLabel', {
        bytes: side.byteCount,
        label,
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
            dismiss="backdrop"
            initialFocus={initialFocusRef}
            onRequestClose={(): void => choose(preview.readOnly ? 'cancel' : 'skip')}
            open
            title={title}
            width="min(92vw, 78rem)"
        >
            <div className={styles.promptBody}>
                <p>
                    {t('conflict.message', {
                        /*
                         * User-facing copy never includes a private full path, and
                         * the classified error contract narrows the subject to the safe
                         * basename. `displayName` is already that; `path` is the full
                         * canonical path and MUST be reduced before it is rendered.
                         */
                        filename: preview.displayName ?? safeBasenameOf(preview.path) ?? t('editor.untitled'),
                    })}
                </p>
                {!valid ? (
                    <p className={styles.warning} data-conflict-invalidated>
                        {t('conflict.invalidated')}
                    </p>
                ) : null}
                {preview.metadataDifferences?.length ? (
                    <section aria-label={t('conflict.metadataRegion')} className={styles.metadata}>
                        <h2>{t('conflict.metadataTitle')}</h2>
                        <ul>
                            {preview.metadataDifferences.map((difference) => (
                                <li key={difference}>{difference}</li>
                            ))}
                        </ul>
                    </section>
                ) : null}
                <div className={styles.comparison}>
                    <h2>{sideLabel('onDisk', preview.onDisk)}</h2>
                    <h2>{sideLabel('yours', preview.yours)}</h2>
                </div>
                {contentDiffers ? (
                    <section aria-label={t('conflict.hunkRegion')}>
                        <ConflictDiff onDisk={preview.onDisk.text} yours={preview.yours.text} />
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
