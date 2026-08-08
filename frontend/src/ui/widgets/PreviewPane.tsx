import { useEffect, useRef, useState } from 'react';

import { t } from '../../i18n';
import MarkdownView from '../components/MarkdownView';

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

const PreviewPane: React.FC<PreviewPaneProps> = ({
  accepted,
  ariaLabel = t('editor.previewPane'),
  onRefresh,
}: PreviewPaneProps): React.JSX.Element => {
  const [manualSnapshot, setManualSnapshot] = useState<PreviewSnapshot | null>(
    () => initialRenderedSnapshot(accepted),
  );
  const [refreshError, setRefreshError] = useState<{
    error: PreviewRefreshError;
    revision: number;
  } | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const activeRefreshRef = useRef<Promise<void> | null>(null);
  const acceptedRef = useRef(accepted);

  useEffect((): void => {
    acceptedRef.current = accepted;
  }, [accepted]);

  const rendered =
    accepted.byteLength <= PREVIEW_BYTE_LIMIT
      ? accepted
      : manualSnapshot?.revision === accepted.revision
        ? manualSnapshot
        : null;
  const currentRefreshError =
    refreshError?.revision === accepted.revision ? refreshError.error : null;

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
        <div role="status">
          <p>{t('preview.paused')}</p>
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
