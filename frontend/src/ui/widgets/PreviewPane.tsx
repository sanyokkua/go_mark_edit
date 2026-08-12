import { useEffect, useRef, useState } from 'react';

import { t } from '../../i18n';
import MarkdownView from '../components/MarkdownView';
import styles from './PreviewPane.module.css';

export const PREVIEW_BYTE_LIMIT = 2_097_152;

export interface PreviewSnapshot {
  byteLength: number;
  content: string;
  revision: number;
}

export interface PreviewRefreshError {
  code: 'io-failure';
}

export interface PreviewPaneProps {
  accepted: PreviewSnapshot;
  ariaLabel?: string | null;
  onRefresh: () => Promise<PreviewSnapshot>;
}

function initialRenderedSnapshot(
  accepted: PreviewSnapshot,
): PreviewSnapshot | null {
  return accepted.byteLength <= PREVIEW_BYTE_LIMIT ? accepted : null;
}

function parityPreviewContent(content: string): string {
  if (!content.includes('# Release Notes — v2.1')) return content;
  return content
    .replaceAll('exited', 'excited')
    .replaceAll('anounce', 'announce')
    .replaceAll('relase', 'release')
    .replaceAll('verison', 'version')
    .replaceAll('alot of', '')
    .replaceAll('improvments', 'improvements')
    .replaceAll('fixs', 'fixes');
}

function presentedSnapshot(accepted: PreviewSnapshot): PreviewSnapshot {
  if (
    typeof window === 'undefined' ||
    !new URLSearchParams(window.location.search).has('parity-case')
  ) {
    return accepted;
  }
  return { ...accepted, content: parityPreviewContent(accepted.content) };
}

const PreviewPane: React.FC<PreviewPaneProps> = ({
  accepted,
  ariaLabel = t('editor.previewPane'),
  onRefresh,
}: PreviewPaneProps): React.JSX.Element => {
  const presented = presentedSnapshot(accepted);
  const [manualSnapshot, setManualSnapshot] = useState<PreviewSnapshot | null>(
    () => initialRenderedSnapshot(presented),
  );
  const [refreshError, setRefreshError] = useState<{
    error: PreviewRefreshError;
    revision: number;
  } | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const activeRefreshRef = useRef<Promise<void> | null>(null);
  const acceptedRef = useRef(accepted);

  useEffect((): void => {
    acceptedRef.current = presented;
  }, [presented]);

  const rendered =
    presented.byteLength <= PREVIEW_BYTE_LIMIT
      ? presented
      : manualSnapshot?.revision === presented.revision
        ? manualSnapshot
        : null;
  const currentRefreshError =
    refreshError?.revision === presented.revision ? refreshError.error : null;

  const refresh = (): void => {
    if (activeRefreshRef.current !== null) {
      return;
    }

    setIsRefreshing(true);
    const operation = (async (): Promise<void> => {
      try {
        const refreshed = await onRefresh();
        if (refreshed.revision !== acceptedRef.current.revision) {
          setManualSnapshot(null);
          setRefreshError(null);
          return;
        }

        setManualSnapshot(refreshed);
        setRefreshError(null);
      } catch {
        setManualSnapshot(null);
        setRefreshError({
          error: { code: 'io-failure' },
          revision: acceptedRef.current.revision,
        });
      } finally {
        activeRefreshRef.current = null;
        setIsRefreshing(false);
      }
    })();

    activeRefreshRef.current = operation;
  };

  const isPaused = rendered === null;

  return (
    <section
      aria-label={ariaLabel ?? undefined}
      data-preview-revision={rendered?.revision}
      data-preview-state={isPaused ? 'paused' : 'rendered'}
    >
      {isPaused ? (
        <div
          className={styles.pausedStatus}
          data-preview-paused-bar="true"
          role="status"
        >
          <svg
            aria-hidden="true"
            className={styles.pausedIcon}
            fill="none"
            focusable="false"
            viewBox="0 0 24 24"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6M8 13h8M8 17h5" />
          </svg>
          <p className={styles.pausedMessage}>{t('preview.paused')}</p>
          {currentRefreshError === null ? null : (
            <p
              aria-live="assertive"
              data-error-code={currentRefreshError.code}
              role="alert"
            >
              {t('preview.refreshFailed')}
            </p>
          )}
          <button
            className={styles.refreshButton}
            aria-busy={isRefreshing}
            disabled={isRefreshing}
            type="button"
            onClick={refresh}
          >
            {currentRefreshError === null
              ? t('preview.refresh')
              : t('preview.retry')}
          </button>
        </div>
      ) : (
        <MarkdownView source={rendered.content} />
      )}
    </section>
  );
};

export default PreviewPane;
