import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentProps } from 'react';

import { t } from '../i18n';
import { appModelAdapter, commandAdapter } from '../logic/adapter';
import { useAppDispatch, useAppSelector } from '../logic/store';
import { reportClassifiedError } from '../logic/store/classifiedNotification';
import { dismissNotification, notifyError, type NotificationRemediation } from '../logic/store/notificationsSlice';
import { parseError } from '../logic/utils/parseError';
import type { NotificationNotice } from '../ui/components/Notifications';
import type AppShell from '../ui/widgets/AppShell';
import type { TabRemediationExecutor } from '../ui/widgets/tabRemediation';
import type { EntryCommandOutcome, UseCommandsResult } from './useCommands';
import type { DocumentWrites } from './useDocumentWrites';

type NotificationCommands = Pick<
    UseCommandsResult,
    | 'onActivateDocument'
    | 'onNewDocument'
    | 'onOpenDocument'
    | 'onOpenFolder'
    | 'onRefreshWorkspace'
    | 'onOpenWorkspacePath'
    | 'onOpenRecentFile'
    | 'onOpenRecentItem'
    | 'onReopenLastFile'
> & {
    retryWrite: DocumentWrites['retryWrite'];
    dismissWriteFailure: DocumentWrites['dismissWriteFailure'];
    onCloseDocument: NonNullable<ComponentProps<typeof AppShell>['onCloseDocument']>;
    requestQuit: () => void;
};

function noticeKind(code: string, severity: string): NotificationNotice['kind'] {
    if (code === 'command-stuck') return 'stuck';
    return severity === 'error' ? 'error' : 'warning';
}

/** Maps the notification projection and routes remediation to the command's owner. */
export function useNotifications({
    retryWrite,
    dismissWriteFailure,
    onActivateDocument,
    onNewDocument,
    onOpenDocument,
    onOpenFolder,
    onRefreshWorkspace,
    onOpenWorkspacePath,
    onOpenRecentFile,
    onOpenRecentItem,
    onReopenLastFile,
    onCloseDocument,
    requestQuit,
}: NotificationCommands) {
    const dispatch = useAppDispatch();
    const notifications = useAppSelector((state) => state.notifications.items);
    const banners = useAppSelector((state) => state.notifications.banners);
    const [remediationAnnouncement, setRemediationAnnouncement] = useState('');
    const tabRemediationRef = useRef<TabRemediationExecutor | undefined>(undefined);
    const timers = useRef<ReturnType<typeof globalThis.setTimeout>[]>([]);
    const mounted = useRef(false);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
            timers.current.forEach(globalThis.clearTimeout);
        };
    }, []);
    const announceRemediation = useCallback((message: string): void => {
        if (!mounted.current) return;
        timers.current.forEach(globalThis.clearTimeout);
        setRemediationAnnouncement('');
        timers.current = [
            globalThis.setTimeout(() => setRemediationAnnouncement(message), 0),
            globalThis.setTimeout(() => setRemediationAnnouncement(''), 3000),
        ];
    }, []);

    const retryEntryCommand = useCallback(
        async (remediation: NotificationRemediation, revision: number): Promise<EntryCommandOutcome | undefined> => {
            switch (remediation.intent) {
                case 'new-document':
                    return onNewDocument(revision);
                case 'open-document':
                    return onOpenDocument(revision);
                case 'open-folder':
                    return remediation.path === undefined ? onOpenFolder() : onOpenWorkspacePath(remediation.path);
                case 'open-recent':
                    if (remediation.path === undefined) return undefined;
                    return remediation.kind === undefined
                        ? onOpenRecentFile(remediation.path, revision)
                        : onOpenRecentItem({ path: remediation.path, kind: remediation.kind }, revision);
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
        [
            onActivateDocument,
            onNewDocument,
            onOpenDocument,
            onOpenFolder,
            onOpenWorkspacePath,
            onOpenRecentFile,
            onOpenRecentItem,
            onReopenLastFile,
        ],
    );
    const onRemediate = useCallback(
        async (remediation: NotificationRemediation, notificationId: number, safeSubject: string): Promise<void> => {
            function remediateCommand(): void {
                const requestId = remediation.requestId;
                if (requestId === undefined) return;
                if (remediation.action === 'retry-command') {
                    commandAdapter?.retry(requestId);
                } else if (remediation.action === 'cancel-command') {
                    commandAdapter?.cancel(requestId);
                }
            }
            async function copyPath(): Promise<void> {
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
            }
            async function revealDocument(): Promise<void> {
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
            }
            async function revealWorkspacePath(): Promise<void> {
                const path = remediation.path;
                if (path === undefined || path === '') return;
                try {
                    const result = await appModelAdapter.revealWorkspacePath?.(path);
                    if (result?.error !== undefined) {
                        reportClassifiedError(dispatch, result.error, t('notification.error.io.title'), {
                            intent: 'reveal-workspace-path',
                            retry: { path },
                        });
                        return;
                    }
                    if (result?.status === 'revealed') dispatch(dismissNotification(notificationId));
                } catch (error) {
                    dispatch(notifyError(parseError(error), 'reveal-workspace-path'));
                }
            }
            async function retryEntry(): Promise<void> {
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
            }
            switch (remediation.intent) {
                case 'command':
                    return remediateCommand();
                case 'copy-path':
                    return copyPath();
                case 'reveal':
                    return revealDocument();
                case 'refresh-workspace': {
                    const result = await onRefreshWorkspace();
                    if (result?.error === undefined) dispatch(dismissNotification(notificationId));
                    return;
                }
                case 'reveal-workspace-path':
                    return revealWorkspacePath();
                case 'create-workspace-entry':
                case 'copy-workspace-path':
                    return;
                case 'new-document':
                case 'open-document':
                case 'open-folder':
                case 'open-recent':
                case 'reopen-last':
                case 'activate-document':
                    return retryEntry();
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
        [
            announceRemediation,
            retryWrite,
            dispatch,
            onCloseDocument,
            onRefreshWorkspace,
            requestQuit,
            retryEntryCommand,
        ],
    );
    const surfaceNotices: readonly NotificationNotice[] = useMemo(
        () =>
            notifications.map((notification) => ({
                id: notification.id,
                code: notification.code,
                count: notification.count,
                kind: noticeKind(notification.code, notification.severity),
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
