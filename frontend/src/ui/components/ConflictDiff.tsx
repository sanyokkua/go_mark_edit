import { useEffect, useRef, useState } from 'react';
import type { editor } from 'monaco-editor';

import { t } from '../../i18n';
import Button from '../primitives/Button';
import styles from './ConflictDiff.module.css';

interface ConflictDiffProps {
    onDisk: string;
    yours: string;
}

type DiffStatus = 'loading' | 'ready' | 'incomplete' | 'error';

/** A transient read-only Monaco view; neither model participates in the document command seam. */
export default function ConflictDiff({ onDisk, yours }: ConflictDiffProps): React.JSX.Element {
    const hostRef = useRef<HTMLDivElement | null>(null);
    const editorRef = useRef<editor.IStandaloneDiffEditor | null>(null);
    const [status, setStatus] = useState<DiffStatus>('loading');

    useEffect(() => {
        let disposed = false;
        let deadline: ReturnType<typeof setTimeout> | undefined;
        let original: editor.ITextModel | undefined;
        let modified: editor.ITextModel | undefined;
        let diff: editor.IStandaloneDiffEditor | undefined;
        let stopTheme: (() => void) | undefined;
        let updateListener: { dispose(): void } | undefined;

        void import('./monacoSetup')
            .then(({ monaco, applyMonacoThemeFromRoot }) => {
                if (disposed || hostRef.current === null) return;
                setStatus('loading');
                stopTheme = applyMonacoThemeFromRoot();
                original = monaco.editor.createModel(onDisk, 'markdown');
                modified = monaco.editor.createModel(yours, 'markdown');
                diff = monaco.editor.createDiffEditor(hostRef.current, {
                    automaticLayout: true,
                    diffAlgorithm: 'advanced',
                    disableLayerHinting: true,
                    domReadOnly: true,
                    ignoreTrimWhitespace: false,
                    lineNumbers: 'on',
                    maxComputationTime: 5000,
                    maxFileSize: 50,
                    minimap: { enabled: false },
                    modifiedAriaLabel: t('conflict.yours'),
                    originalEditable: false,
                    originalAriaLabel: t('conflict.onDisk'),
                    readOnly: true,
                    renderMarginRevertIcon: false,
                    scrollBeyondLastLine: false,
                    stopRenderingLineAfter: -1,
                    useInlineViewWhenSpaceIsLimited: true,
                    wordWrap: 'on',
                });
                diff.getOriginalEditor().updateOptions({ ariaLabel: t('conflict.onDisk') });
                diff.getModifiedEditor().updateOptions({ ariaLabel: t('conflict.yours') });
                editorRef.current = diff;
                const started = performance.now();
                updateListener = diff.onDidUpdateDiff(() => {
                    if (disposed || diff === undefined) return;
                    const changes = diff.getLineChanges();
                    if (changes === null) return;
                    if (changes.length === 0 || performance.now() - started >= 5000) {
                        setStatus('incomplete');
                    } else {
                        setStatus((current) => (current === 'incomplete' ? current : 'ready'));
                        clearTimeout(deadline);
                    }
                });
                deadline = setTimeout(() => setStatus('incomplete'), 5000);
                diff.setModel({ original, modified });
            })
            .catch(() => {
                if (!disposed) setStatus('error');
            });

        return () => {
            disposed = true;
            clearTimeout(deadline);
            updateListener?.dispose();
            diff?.setModel(null);
            diff?.dispose();
            original?.dispose();
            modified?.dispose();
            stopTheme?.();
            editorRef.current = null;
        };
    }, [onDisk, yours]);

    return (
        <div className={styles.root}>
            <div className={styles.toolbar}>
                <Button
                    disabled={status === 'loading' || status === 'error'}
                    variant="secondary"
                    onClick={() => editorRef.current?.goToDiff('previous')}
                >
                    {t('conflict.previousChange')}
                </Button>
                <Button
                    disabled={status === 'loading' || status === 'error'}
                    variant="secondary"
                    onClick={() => editorRef.current?.goToDiff('next')}
                >
                    {t('conflict.nextChange')}
                </Button>
            </div>
            {status === 'loading' ? <p role="status">{t('conflict.diffLoading')}</p> : null}
            {status === 'incomplete' ? (
                <p className={styles.notice} role="status">
                    {t('conflict.diffIncomplete')}
                </p>
            ) : null}
            {status === 'error' ? (
                <p className={styles.notice} role="alert">
                    {t('conflict.diffError')}
                </p>
            ) : null}
            <div
                ref={hostRef}
                aria-label={t('conflict.hunkRegion')}
                className={styles.editor}
                data-conflict-diff
                hidden={status === 'error'}
            />
            {status === 'error' ? (
                <div className={styles.fallback}>
                    <textarea aria-label={t('conflict.onDisk')} readOnly value={onDisk} />
                    <textarea aria-label={t('conflict.yours')} readOnly value={yours} />
                </div>
            ) : null}
        </div>
    );
}
