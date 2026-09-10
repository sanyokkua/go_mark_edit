import { useCallback, useEffect, useRef, useState } from 'react';

import { t } from '../../i18n';
import type { LivePreviewAdapter } from '../../logic/hooks/useLivePreview';
import type {
  LinkRefusalReason,
  LinkTarget,
} from '../../logic/markdown/linkPolicy';
import { classifyImageSource } from '../../logic/markdown/imagePolicy';
import type { OpenResult } from '../../logic/store/appModelTypes';
import MarkdownView from '../components/MarkdownView';
import Button from '../primitives/Button';
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
  documentId?: string;
  documentPath?: string;
  linkAdapter?: Pick<
    LivePreviewAdapter,
    'openPreviewLink' | 'openExternalLink' | 'resolvePreviewImage'
  >;
  notificationOwner?: PreviewNotificationOwner;
  onRefresh: () => Promise<PreviewSnapshot>;
}

export interface PreviewNotificationOwner {
  warn: (target: string, reason: string) => void;
}

export interface PreviewPaneState {
  currentRefreshError: PreviewRefreshError | null;
  isPaused: boolean;
  isRefreshing: boolean;
  refresh: () => void;
  rendered: PreviewSnapshot | null;
}

function initialRenderedSnapshot(
  accepted: PreviewSnapshot,
): PreviewSnapshot | null {
  return accepted.byteLength <= PREVIEW_BYTE_LIMIT ? accepted : null;
}

function refusalReason(reason: LinkRefusalReason): string {
  switch (reason) {
    case 'empty':
      return t('preview.linkRefused.reason.empty');
    case 'scheme':
      return t('preview.linkRefused.reason.scheme');
    case 'malformed':
      return t('preview.linkRefused.reason.malformed');
    case 'untitled-document':
      return t('preview.linkRefused.reason.untitled');
    case 'outside-document-folder':
      return t('preview.linkRefused.reason.outside');
    case 'unsupported-extension':
      return t('preview.linkRefused.reason.extension');
  }
}

function openResultRefusal(result: OpenResult): string | undefined {
  return result.status === 'refused'
    ? (result.error?.message ?? t('preview.linkRefused.reason.open'))
    : undefined;
}

export function usePreviewPaneState(
  accepted: PreviewSnapshot,
  onRefresh: () => Promise<PreviewSnapshot>,
): PreviewPaneState {
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

  const refresh = useCallback((): void => {
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
  }, [onRefresh]);

  return {
    currentRefreshError,
    isPaused: rendered === null,
    isRefreshing,
    refresh,
    rendered,
  };
}

export interface PreviewPausedStatusProps {
  currentRefreshError: PreviewRefreshError | null;
  isRefreshing: boolean;
  onRefresh: () => void;
}

export const PreviewPausedStatus: React.FC<PreviewPausedStatusProps> = ({
  currentRefreshError,
  isRefreshing,
  onRefresh,
}: PreviewPausedStatusProps): React.JSX.Element => (
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
    <Button
      className={styles.refreshButton}
      aria-busy={isRefreshing}
      disabled={isRefreshing}
      variant="secondary"
      onClick={onRefresh}
    >
      {currentRefreshError === null ? t('preview.refresh') : t('preview.retry')}
    </Button>
  </div>
);

export interface PreviewPaneContentProps {
  ariaLabel?: string | null;
  controller: PreviewPaneState;
  documentId?: string;
  documentPath?: string;
  linkAdapter?: Pick<
    LivePreviewAdapter,
    'openPreviewLink' | 'openExternalLink' | 'resolvePreviewImage'
  >;
  notificationOwner?: PreviewNotificationOwner;
  showPausedStatus?: boolean;
}

export const PreviewPaneContent: React.FC<PreviewPaneContentProps> = ({
  ariaLabel = t('editor.previewPane'),
  controller,
  documentId,
  documentPath,
  linkAdapter,
  notificationOwner,
  showPausedStatus = true,
}: PreviewPaneContentProps): React.JSX.Element => {
  const warn = (target: string, reason: string): void => {
    notificationOwner?.warn(target, reason);
  };

  const resolveImageSource = useCallback(
    (source: string): string | undefined => {
      const classified = classifyImageSource(source, documentPath);
      if (classified.kind !== 'local' || documentId === undefined) {
        return undefined;
      }
      return linkAdapter?.resolvePreviewImage?.(documentId, classified.source);
    },
    [documentId, documentPath, linkAdapter],
  );

  const activateLink = (sourceDocumentId: string, target: LinkTarget): void => {
    switch (target.kind) {
      case 'anchor': {
        const element = document.getElementById(target.fragment);
        element?.scrollIntoView?.({ block: 'start' });
        return;
      }
      case 'external':
        if (linkAdapter?.openExternalLink === undefined) {
          warn(target.href, t('preview.linkRefused.reason.browser'));
          return;
        }
        linkAdapter.openExternalLink(target.href);
        return;
      case 'refused':
        warn(target.href, refusalReason(target.reason));
        return;
      case 'localDocument':
        if (linkAdapter?.openPreviewLink === undefined) {
          warn(target.href, t('preview.linkRefused.reason.open'));
          return;
        }
        void linkAdapter
          .openPreviewLink(sourceDocumentId, target.href)
          .then((result): void => {
            const reason = openResultRefusal(result);
            if (reason !== undefined) warn(target.href, reason);
          })
          .catch((): void => {
            warn(target.href, t('preview.linkRefused.reason.open'));
          });
        return;
    }
  };

  return (
    <section
      aria-label={ariaLabel ?? undefined}
      data-preview-revision={controller.rendered?.revision}
      data-preview-state={controller.isPaused ? 'paused' : 'rendered'}
    >
      {controller.isPaused ? (
        showPausedStatus ? (
          <PreviewPausedStatus
            currentRefreshError={controller.currentRefreshError}
            isRefreshing={controller.isRefreshing}
            onRefresh={controller.refresh}
          />
        ) : null
      ) : (
        <MarkdownView
          documentId={documentId}
          documentPath={documentPath}
          imageSourceResolver={resolveImageSource}
          onActivateLink={activateLink}
          source={controller.rendered?.content ?? ''}
        />
      )}
    </section>
  );
};

const PreviewPane: React.FC<PreviewPaneProps> = ({
  accepted,
  ariaLabel = t('editor.previewPane'),
  documentId,
  documentPath,
  linkAdapter,
  notificationOwner,
  onRefresh,
}: PreviewPaneProps): React.JSX.Element => {
  const controller = usePreviewPaneState(accepted, onRefresh);

  return (
    <PreviewPaneContent
      ariaLabel={ariaLabel}
      controller={controller}
      documentId={documentId}
      documentPath={documentPath}
      linkAdapter={linkAdapter}
      notificationOwner={notificationOwner}
    />
  );
};

export default PreviewPane;
