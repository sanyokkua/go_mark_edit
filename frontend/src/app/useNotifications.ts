import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentProps } from 'react';

import { t } from '../i18n';
import { appModelAdapter, commandAdapter } from '../logic/adapter';
import { useAppDispatch, useAppSelector } from '../logic/store';
import { reportClassifiedError } from '../logic/store/classifiedNotification';
import { dismissNotification, type NotificationRemediation } from '../logic/store/notificationsSlice';
import type { NotificationNotice } from '../ui/components/Notifications';
import type AppShell from '../ui/widgets/AppShell';
import type { TabRemediationExecutor } from '../ui/widgets/tabRemediation';
import type { EntryCommandOutcome, UseCommandsResult } from './useCommands';
import type { DocumentWrites } from './useDocumentWrites';

type NotificationCommands = Pick<
    UseCommandsResult,
    'onActivateDocument' | 'onNewDocument' | 'onOpenDocument' | 'onOpenRecentFile' | 'onReopenLastFile'
> & {
    retryWrite: DocumentWrites['retryWrite'];
    dismissWriteFailure: DocumentWrites['dismissWriteFailure'];
    onCloseDocument: NonNullable<ComponentProps<typeof AppShell>['onCloseDocument']>;
    requestQuit: () => void;
};

/** Maps the notification projection and routes remediation to the command's owner. */
export function useNotifications({
    retryWrite,
    dismissWriteFailure,
    onActivateDocument,
    onNewDocument,
    onOpenDocument,
    onOpenRecentFile,
    onReopenLastFile,
    onCloseDocument,
    requestQuit,
}: NotificationCommands) {
    const dispatch = useAppDispatch();
    const notifications = useAppSelector((state) => state.notifications.items);
    const banners = useAppSelector((state) => state.notifications.banners);
    const [remediationAnnouncement, setRemediationAnnouncement] = useState('');
    const tabRemediationRef = useRef<TabRemediationExecutor | undefined>(undefined);
    const timers = useRef<number[]>([]);
    const mounted = useRef(false);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
            timers.current.forEach(window.clearTimeout);
        };
    }, []);
    const announceRemediation = useCallback((message: string): void => {
        if (!mounted.current) return;
        timers.current.forEach(window.clearTimeout);
        setRemediationAnnouncement('');
        timers.current = [
            window.setTimeout(() => setRemediationAnnouncement(message), 0),
            window.setTimeout(() => setRemediationAnnouncement(''), 3000),
        ];
    }, []);

    const retryEntryCommand = useCallback(
        async (remediation: NotificationRemediation, revision: number): Promise<EntryCommandOutcome | undefined> => {
            switch (remediation.intent) {
                case 'new-document':
                    return onNewDocument(revision);
                case 'open-document':
                    return onOpenDocument(revision);
                case 'open-recent':
                    return remediation.path === undefined ? undefined : onOpenRecentFile(remediation.path, revision);
                case 'reopen-last':
                    return onReopenLastFile(revision);
                case 'activate-document':
                    return remediation.documentId === undefined
                        ? undefined
                        : onActivateDocument(remediation.documentId, revision);
                default:
                    return undefined;
            }
        },
        [onActivateDocument, onNewDocument, onOpenDocument, onOpenRecentFile, onReopenLastFile],
    );
    const onRemediate = useCallback(
        async (remediation: NotificationRemediation, notificationId: number, safeSubject: string): Promise<void> => {
            switch (remediation.intent) {
                case 'command': {
                    const requestId = remediation.requestId;
                    if (requestId === undefined) return;
                    if (remediation.action === 'retry-command') {
                        commandAdapter?.retry(requestId);
                    } else if (remediation.action === 'cancel-command') {
                        commandAdapter?.cancel(requestId);
                    }
                    return;
                }
                case 'copy-path': {
                    const documentId = remediation.documentId;
                    if (documentId === undefined) return;
                    const result = await appModelAdapter.copyPath?.(documentId);
                    if (result?.error !== undefined) {
                        reportClassifiedError(dispatch, result.error, t('notification.error.io.title'), {
                            intent: 'copy-path',
                        });
                        return;
                    }
                    if (result?.status !== 'copied') return;
                    dispatch(dismissNotification(notificationId));
                    announceRemediation(t('editor.tab.copiedPath', { filename: safeSubject }));
                    return;
                }
                case 'reveal': {
                    const documentId = remediation.documentId;
                    if (documentId === undefined) return;
                    const result = await appModelAdapter.revealInFileManager?.(documentId);
                    if (result?.error !== undefined) {
                        reportClassifiedError(dispatch, result.error, t('notification.error.io.title'), {
                            intent: 'reveal',
                        });
                        return;
                    }
                    if (result?.status !== 'revealed') return;
                    dispatch(dismissNotification(notificationId));
                    return;
                }
                case 'new-document':
                case 'open-document':
                case 'open-recent':
                case 'reopen-last':
                case 'activate-document': {
                    const state = await appModelAdapter.getState();
                    const revision = state.snapshot.tabSetRevision ?? 0;
                    const result = await retryEntryCommand(remediation, revision);
                    if (result === undefined) return;
                    if (result.error !== undefined) {
                        if (remediation.intent === 'activate-document') {
                            reportClassifiedError(dispatch, result.error, t('editor.tabs'), {
                                intent: 'activate-document',
                                retry: { documentId: remediation.documentId },
                            });
                        }
                        return;
                    }
                    dispatch(dismissNotification(notificationId));
                    return;
                }
                case 'reorder-document': {
                    const state = await appModelAdapter.getState();
                    const handled = await tabRemediationRef.current?.(remediation, state.snapshot.tabSetRevision ?? 0);
                    if (handled !== true) return;
                    dispatch(dismissNotification(notificationId));
                    return;
                }
                case 'close-documents': {
                    const request = remediation.close;
                    if (request === undefined) return;
                    const state = await appModelAdapter.getState();
                    const revision = state.snapshot.tabSetRevision ?? 0;
                    const result = await onCloseDocument(
                        request.targetDocumentIds[0] ?? '',
                        revision,
                        request.kind,
                        request.targetDocumentIds,
                    );

                    if (result.error !== undefined || result.status === 'refused') return;
                    dispatch(dismissNotification(notificationId));
                    return;
                }
                case 'quit': {
                    dispatch(dismissNotification(notificationId));
                    requestQuit();
                    return;
                }
                case 'save':
                case 'save-as': {
                    const handled = await retryWrite(remediation.intent, remediation.documentId);
                    if (!handled) return;
                    dispatch(dismissNotification(notificationId));
                    return;
                }
                default: {
                    const unhandledIntent: never = remediation.intent;
                    return unhandledIntent;
                }
            }
        },
        [announceRemediation, retryWrite, dispatch, onCloseDocument, requestQuit, retryEntryCommand],
    );
    const surfaceNotices: readonly NotificationNotice[] = useMemo(
        () =>
            notifications.map((notification) => ({
                id: notification.id,
                code: notification.code,
                count: notification.count,
                kind:
                    notification.code === 'command-stuck'
                        ? ('stuck' as const)
                        : notification.severity === 'error'
                          ? ('error' as const)
                          : ('warning' as const),
                message: notification.message,
                persistent: notification.persistent,
                tone: notification.severity,
                title: notification.title,
                actions: notification.remediations.map((remediation) => ({
                    id: `${remediation.action}:${remediation.intent}:${remediation.documentId ?? ''}`,
                    label: t(remediation.labelKey),
                    onActivate: (): void => {
                        void onRemediate(remediation, notification.id, notification.title);
                    },
                })),
            })),
        [notifications, onRemediate],
    );
    const surfaceBanners: readonly NotificationNotice[] = useMemo(
        () =>
            banners.map((notification) => ({
                id: notification.id,
                code: notification.code,
                count: notification.count,
                kind: notification.severity === 'error' ? ('error' as const) : ('warning' as const),
                message: notification.message,
                title: notification.title,
                tone: notification.severity,
                actions: [],
            })),
        [banners],
    );

    const onDismiss = useCallback(
        (id: number): void => {
            const notification = notifications.find((item) => item.id === id);
            for (const remediation of notification?.remediations ?? []) {
                if (remediation.intent === 'save' || remediation.intent === 'save-as') {
                    void dismissWriteFailure(remediation.intent, remediation.documentId);
                }
            }
            dispatch(dismissNotification(id));
        },
        [dispatch, dismissWriteFailure, notifications],
    );
    return {
        notices: surfaceNotices,
        banners: surfaceBanners,
        announcement: remediationAnnouncement,
        onDismiss,
        tabRemediationRef,
    } as const;
}
