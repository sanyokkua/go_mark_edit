import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { t } from '../../i18n';
import type { LivePreviewAdapter } from '../../logic/hooks/useLivePreview';
import type { LinkRefusalReason, LinkTarget } from '../../logic/markdown/linkPolicy';
import { scrollToAnchor } from '../../logic/markdown/headings';
import type { MarkdownStandard } from '../../logic/markdown/pipeline';
import { classifyImageSource } from '../../logic/markdown/imagePolicy';
import type { OpenResult } from '../../logic/store/appModelTypes';
import type { CommittedMarkdownPreview } from '../components/MarkdownView';
import Button from '../primitives/Button';
import Icon from '../primitives/Icon';
import styles from './PreviewPane.module.css';

export const PREVIEW_BYTE_LIMIT = 2_097_152;
const MarkdownView = lazy(() => import('../components/MarkdownView'));

export interface PreviewSnapshot {
    byteLength: number;
    content: string;
    documentId?: string;
    revision: number;
}

interface PreviewSourceIdentity {
    content: string;
    documentId?: string;
    revision: number;
}

function sourceIdentity(snapshot: PreviewSnapshot, documentId?: string): PreviewSourceIdentity {
    return { content: snapshot.content, documentId: snapshot.documentId ?? documentId, revision: snapshot.revision };
}

function sameSource(first: PreviewSourceIdentity, second: PreviewSourceIdentity): boolean {
    return (
        first.content === second.content && first.documentId === second.documentId && first.revision === second.revision
    );
}

export interface PreviewRefreshError {
    code: 'io-failure';
}

export interface PreviewPaneProps {
    accepted: PreviewSnapshot;
    standard: MarkdownStandard;
    ariaLabel?: string | null;
    documentId?: string;
    documentPath?: string;
    linkAdapter?: Pick<LivePreviewAdapter, 'openPreviewLink' | 'openExternalLink' | 'resolvePreviewImage'>;
    notificationOwner?: PreviewNotificationOwner;
    onFocusedDocumentOpen?: (documentId: string) => void;
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
    return result.status === 'refused' ? (result.error?.message ?? t('preview.linkRefused.reason.open')) : undefined;
}

function notifyRefusal(owner: PreviewNotificationOwner | undefined, target: string, reason: string): void {
    owner?.warn(target, reason);
}

export function usePreviewPaneState(
    accepted: PreviewSnapshot,
    onRefresh: () => Promise<PreviewSnapshot>,
    documentId?: string,
): PreviewPaneState {
    const identity = useMemo<PreviewSourceIdentity>(
        () => ({
            content: accepted.content,
            documentId: accepted.documentId ?? documentId,
            revision: accepted.revision,
        }),
        [accepted.content, accepted.documentId, accepted.revision, documentId],
    );
    const [sourceState, setSourceState] = useState<{
        identity: PreviewSourceIdentity;
        manualSnapshot: PreviewSnapshot | null;
        refreshError: PreviewRefreshError | null;
    }>(() => ({ identity, manualSnapshot: null, refreshError: null }));
    const [isRefreshing, setIsRefreshing] = useState(false);
    const activeRefreshRef = useRef<Promise<void> | null>(null);
    const sourceChanged = !sameSource(sourceState.identity, identity);
    if (sourceChanged) {
        setSourceState({ identity, manualSnapshot: null, refreshError: null });
    }

    const rendered =
        accepted.byteLength <= PREVIEW_BYTE_LIMIT
            ? accepted
            : !sourceChanged && sourceState.manualSnapshot !== null
              ? sourceState.manualSnapshot
              : null;
    const currentRefreshError = sourceChanged ? null : sourceState.refreshError;

    const refresh = useCallback((): void => {
        if (activeRefreshRef.current !== null) {
            return;
        }

        const request = identity;
        setIsRefreshing(true);
        const operation = (async (): Promise<void> => {
            try {
                const refreshed = await onRefresh();
                if (!sameSource(sourceIdentity(refreshed, request.documentId), request)) {
                    return;
                }

                setSourceState((current) =>
                    sameSource(current.identity, request)
                        ? { ...current, manualSnapshot: refreshed, refreshError: null }
                        : current,
                );
            } catch {
                setSourceState((current) =>
                    sameSource(current.identity, request)
                        ? { ...current, manualSnapshot: null, refreshError: { code: 'io-failure' } }
                        : current,
                );
            } finally {
                activeRefreshRef.current = null;
                setIsRefreshing(false);
            }
        })();

        activeRefreshRef.current = operation;
    }, [identity, onRefresh]);

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
    <div className={styles.pausedStatus} data-preview-paused-bar="true" role="status">
        <Icon className={styles.pausedIcon} name="file" />
        <p className={styles.pausedMessage}>{t('preview.paused')}</p>
        {currentRefreshError === null ? null : (
            <p aria-live="assertive" data-error-code={currentRefreshError.code} role="alert">
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

interface PreviewPaneContentBaseProps {
    ariaLabel?: string | null;
    controller: PreviewPaneState;
    committedPreview?: CommittedMarkdownPreview | null;
    documentId?: string;
    documentPath?: string;
    linkAdapter?: Pick<LivePreviewAdapter, 'openPreviewLink' | 'openExternalLink' | 'resolvePreviewImage'>;
    notificationOwner?: PreviewNotificationOwner;
    onFocusedDocumentOpen?: (documentId: string) => void;
    onPreviewCommitted?: (preview: CommittedMarkdownPreview) => void;
    showPausedStatus?: boolean;
}

export type PreviewPaneContentProps = PreviewPaneContentBaseProps &
    ({ settingsLoaded: false; standard?: never } | { settingsLoaded?: true; standard: MarkdownStandard });

export const PreviewPaneContent: React.FC<PreviewPaneContentProps> = ({
    ariaLabel = t('editor.previewPane'),
    controller,
    committedPreview,
    documentId,
    documentPath,
    linkAdapter,
    notificationOwner,
    onFocusedDocumentOpen,
    onPreviewCommitted,
    showPausedStatus = true,
    settingsLoaded = true,
    standard,
}: PreviewPaneContentProps): React.JSX.Element => {
    const linkAdapterRef = useRef(linkAdapter);
    const notificationOwnerRef = useRef(notificationOwner);
    const focusedDocumentOpenRef = useRef(onFocusedDocumentOpen);
    const previewContainerRef = useRef<HTMLElement>(null);

    useEffect((): void => {
        linkAdapterRef.current = linkAdapter;
    }, [linkAdapter]);

    useEffect((): void => {
        notificationOwnerRef.current = notificationOwner;
    }, [notificationOwner]);

    useEffect((): void => {
        focusedDocumentOpenRef.current = onFocusedDocumentOpen;
    }, [onFocusedDocumentOpen]);

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

    /*
     * Stable forever (`useCallback` with no dependency): identity survives a
     * re-render triggered by an unrelated prop, such as a fresh notification
     * owner, so the memoized `MarkdownView` below does not treat it as new.
     * `linkAdapter` and `notificationOwner` are read through the refs kept
     * current above (the same pattern as `acceptedRef` in
     * `usePreviewPaneState`), so a click always reaches whichever owner or
     * adapter is current, never the one captured when this closure was
     * built.
     */
    const activateLink = useCallback((sourceDocumentId: string, target: LinkTarget): void => {
        switch (target.kind) {
            case 'anchor': {
                if (previewContainerRef.current !== null) {
                    scrollToAnchor(previewContainerRef.current, target.fragment);
                }
                return;
            }
            case 'external': {
                const adapter = linkAdapterRef.current;
                if (adapter?.openExternalLink === undefined) {
                    notifyRefusal(notificationOwnerRef.current, target.href, t('preview.linkRefused.reason.browser'));
                    return;
                }
                adapter.openExternalLink(target.href);
                return;
            }
            case 'refused':
                notifyRefusal(notificationOwnerRef.current, target.href, refusalReason(target.reason));
                return;
            case 'localDocument': {
                const adapter = linkAdapterRef.current;
                if (adapter?.openPreviewLink === undefined) {
                    notifyRefusal(notificationOwnerRef.current, target.href, t('preview.linkRefused.reason.open'));
                    return;
                }
                void adapter
                    .openPreviewLink(sourceDocumentId, target.href)
                    .then((result): void => {
                        if (result.status === 'focused' && result.documentId !== undefined) {
                            focusedDocumentOpenRef.current?.(result.documentId);
                        }
                        const reason = openResultRefusal(result);
                        if (reason !== undefined) notifyRefusal(notificationOwnerRef.current, target.href, reason);
                    })
                    .catch((): void => {
                        notifyRefusal(notificationOwnerRef.current, target.href, t('preview.linkRefused.reason.open'));
                    });
                return;
            }
        }
    }, []);

    return (
        <section
            aria-label={ariaLabel ?? undefined}
            data-preview-revision={controller.rendered?.revision}
            data-preview-state={!settingsLoaded ? 'loading' : controller.isPaused ? 'paused' : 'rendered'}
            ref={previewContainerRef}
        >
            {!settingsLoaded || standard === undefined ? (
                <span role="status">{t('preview.loading')}</span>
            ) : (
                <>
                    {controller.isPaused && showPausedStatus ? (
                        <PreviewPausedStatus
                            currentRefreshError={controller.currentRefreshError}
                            isRefreshing={controller.isRefreshing}
                            onRefresh={controller.refresh}
                        />
                    ) : null}
                    <Suspense fallback={<span role="status">{t('preview.loading')}</span>}>
                        <MarkdownView
                            committedPreview={committedPreview}
                            documentId={documentId}
                            documentPath={documentPath}
                            imageSourceResolver={resolveImageSource}
                            onActivateLink={activateLink}
                            onPreviewCommitted={onPreviewCommitted}
                            source={controller.rendered?.content ?? ''}
                            standard={standard}
                            suspended={controller.isPaused}
                        />
                    </Suspense>
                </>
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
    onFocusedDocumentOpen,
    onRefresh,
    standard,
}: PreviewPaneProps): React.JSX.Element => {
    const controller = usePreviewPaneState(accepted, onRefresh, documentId);

    return (
        <PreviewPaneContent
            ariaLabel={ariaLabel}
            controller={controller}
            documentId={documentId}
            documentPath={documentPath}
            linkAdapter={linkAdapter}
            notificationOwner={notificationOwner}
            onFocusedDocumentOpen={onFocusedDocumentOpen}
            standard={standard}
        />
    );
};

export default PreviewPane;
