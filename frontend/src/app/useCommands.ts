import { useCallback, useRef, useState } from 'react';

import { t } from '../i18n';
import { appModelAdapter, windowAdapter } from '../logic/adapter';
import type { LinkTarget } from '../logic/markdown/linkPolicy';
import { store, useAppDispatch } from '../logic/store';
import { reportClassifiedError } from '../logic/store/classifiedNotification';
import { buildUnsupportedFileNotice } from '../logic/store/linkNotification';
import { notifyError, notifyToast } from '../logic/store/notificationsSlice';
import type {
    ClassifiedError,
    DocumentTransitionResult,
    OpenResult,
    RecentItem,
    WorkspaceResult,
    PathCommandResult,
} from '../logic/store/appModelTypes';
import type { NotificationRemediationIntent } from '../logic/store/notificationsSlice';
import { setWorkspaceReading } from '../logic/store/workspaceSlice';
import { parseError } from '../logic/utils/parseError';
import { flushOutgoingDocument } from '../ui/widgets/outgoingFlush';
import type { CloseFolderChoice } from '../ui/widgets/dialogs/CloseFolderPrompt';
import type { WorkspaceReplaceChoice } from '../ui/widgets/dialogs/WorkspaceReplacePrompt';
import type { DocumentSession } from './useDocumentSession';

export interface EntryCommandOutcome {
    error?: ClassifiedError;
    status?: string;
    documentId?: string;
}

export type WorkspaceCreateOutcome = WorkspaceResult & { openResult?: EntryCommandOutcome };

/** Owns entry and activation commands. Widgets keep their existing command signatures. */
export function useCommands(
    { activeBuffer, activation }: Pick<DocumentSession, 'activeBuffer' | 'activation'>,
    closeAllWindowTabs: () => Promise<'closed' | 'cancelled' | 'refused'>,
) {
    const dispatch = useAppDispatch();
    const [replaceFolderPath, setReplaceFolderPath] = useState<string | null>(null);
    const [closeFolderPromptOpen, setCloseFolderPromptOpen] = useState(false);
    const [tabRevealRequest, setTabRevealRequest] = useState<{ documentId: string; sequence: number } | null>(null);
    const [editorFocusRequest, setEditorFocusRequest] = useState<{ documentId: string; sequence: number } | null>(null);
    const [treeRevealRequest, setTreeRevealRequest] = useState<{
        documentId: string;
        path: string;
        seq: number;
    } | null>(null);
    const [fragmentRequest, setFragmentRequest] = useState<{ documentId: string; slug: string; seq: number } | null>(
        null,
    );
    const workspaceOpenPending = useRef(false);
    const pendingWorkspaceReads = useRef(0);
    const queuedWorkspacePath = useRef<string | null>(null);
    const activeBufferDocumentId = activeBuffer?.documentId;
    const beginWorkspaceRead = useCallback((): void => {
        pendingWorkspaceReads.current += 1;
        if (pendingWorkspaceReads.current === 1) dispatch(setWorkspaceReading(true));
    }, [dispatch]);
    const endWorkspaceRead = useCallback((): void => {
        pendingWorkspaceReads.current = Math.max(0, pendingWorkspaceReads.current - 1);
        if (pendingWorkspaceReads.current === 0) dispatch(setWorkspaceReading(false));
    }, [dispatch]);
    const flushActiveDocument = useCallback(async (): Promise<void> => {
        if (activeBufferDocumentId === undefined) return;
        await appModelAdapter.flushActiveSession?.(activeBufferDocumentId);
    }, [activeBufferDocumentId]);

    const reportEntryError = useCallback(
        (
            error: ClassifiedError | undefined,
            intent?: NotificationRemediationIntent,
            path?: string,
            kind?: RecentItem['kind'],
        ): void => {
            reportClassifiedError(dispatch, error, t('notification.error.io.title'), {
                intent,
                ...(path === undefined ? {} : { retry: { path, kind } }),
            });
        },
        [dispatch],
    );

    const onFocusedDocumentOpen = useCallback((documentId: string): void => {
        setTabRevealRequest((previous) => ({
            documentId,
            sequence: (previous?.sequence ?? 0) + 1,
        }));
    }, []);
    const onFocusCreatedFile = useCallback((documentId: string): void => {
        setEditorFocusRequest((previous) => ({ documentId, sequence: (previous?.sequence ?? 0) + 1 }));
    }, []);
    const requestFocusedTabReveal = useCallback(
        (result: OpenResult | undefined): void => {
            if (result?.status === 'focused' && result.documentId !== undefined) {
                onFocusedDocumentOpen(result.documentId);
            }
        },
        [onFocusedDocumentOpen],
    );

    const openLink = useCallback(
        async (target: Extract<LinkTarget, { kind: 'localDocument' }>, sourceDocumentId: string): Promise<void> => {
            try {
                await flushActiveDocument();
                const generation = activation.begin();
                const result = await appModelAdapter.openPreviewLink?.(sourceDocumentId, target.href);
                if (result === undefined || !activation.isCurrent(generation)) return;
                if (result.status === 'opened' || result.status === 'focused') {
                    const documentId = result.documentId;
                    if (documentId === undefined) return;
                    if (documentId !== sourceDocumentId) {
                        activation.acknowledge(generation, result.activeBuffer);
                        onFocusedDocumentOpen(documentId);
                        const treePath = result.treePath;
                        if (treePath) {
                            setTreeRevealRequest((previous) => ({
                                documentId,
                                path: treePath,
                                seq: (previous?.seq ?? 0) + 1,
                            }));
                        }
                    }
                    const fragment = target.fragment;
                    if (fragment !== undefined) {
                        setFragmentRequest((previous) => ({
                            documentId,
                            slug: fragment,
                            seq: (previous?.seq ?? 0) + 1,
                        }));
                    }
                    return;
                }
                if (result.status === 'refused') {
                    if (result.revealPath) {
                        const notice = buildUnsupportedFileNotice(result.revealPath, result.error?.safeSubject);
                        if (notice !== undefined) dispatch(notifyToast(notice));
                    } else {
                        reportEntryError(result.error);
                    }
                }
            } catch (error) {
                dispatch(notifyError(parseError(error)));
            }
        },
        [activation, dispatch, flushActiveDocument, onFocusedDocumentOpen, reportEntryError],
    );

    const onNewDocument = useCallback(
        async (expectedTabSetRevision: number): Promise<EntryCommandOutcome | undefined> => {
            await flushActiveDocument();
            const generation = activation.begin();
            const result = await appModelAdapter.newDocument?.(expectedTabSetRevision);
            activation.acknowledge(generation, result?.data);
            reportEntryError(result?.error, 'new-document');
            return result;
        },
        [activation, flushActiveDocument, reportEntryError],
    );

    const onOpenDocument = useCallback(
        async (expectedTabSetRevision: number): Promise<EntryCommandOutcome | undefined> => {
            await flushActiveDocument();
            const generation = activation.begin();
            const result = await appModelAdapter.openDocument?.(expectedTabSetRevision);
            activation.acknowledge(generation, result?.activeBuffer);
            requestFocusedTabReveal(result);
            reportEntryError(result?.error, 'open-document');
            return result;
        },
        [activation, flushActiveDocument, reportEntryError, requestFocusedTabReveal],
    );

    const onOpenRecentFile = useCallback(
        async (
            path: string,
            expectedTabSetRevision: number,
            suppressCapacityNotice = false,
        ): Promise<EntryCommandOutcome | undefined> => {
            await flushActiveDocument();
            const generation = activation.begin();
            const result = await appModelAdapter.openRecentFile?.(path, expectedTabSetRevision);
            activation.acknowledge(generation, result?.activeBuffer);
            requestFocusedTabReveal(result);
            const error = result?.error;
            if (!(suppressCapacityNotice && error?.category === 'capacity-limit'))
                reportEntryError(
                    error?.category === 'capacity-limit'
                        ? { ...error, message: `${error.message} ${t('workspace.tree.closeTabsFirst')}` }
                        : error,
                    'open-recent',
                    path,
                    'file',
                );
            if (error?.category === 'not-found') await appModelAdapter.refreshRecentItems?.();
            return result;
        },
        [activation, flushActiveDocument, reportEntryError, requestFocusedTabReveal],
    );

    const onRefreshRecentItems = useCallback(async (): Promise<void> => {
        const result = await appModelAdapter.refreshRecentItems?.();
        reportEntryError(result?.error, 'open-recent');
    }, [reportEntryError]);

    const onClearRecentItems = useCallback(async (): Promise<void> => {
        const result = await appModelAdapter.clearRecentItems?.();
        reportEntryError(result?.error, 'open-recent');
    }, [reportEntryError]);

    const onActivateDocument = useCallback(
        async (documentId: string, expectedTabSetRevision: number): Promise<DocumentTransitionResult> => {
            const currentDocumentId = activeBuffer?.documentId;
            const refusal = await flushOutgoingDocument(
                appModelAdapter.flushActiveSession,
                currentDocumentId === documentId ? undefined : currentDocumentId,
            );
            if (refusal !== undefined) {
                return { error: refusal };
            }
            const generation = activation.begin();
            const result = await appModelAdapter.activateDocument?.(documentId, expectedTabSetRevision);
            if (result === undefined) return {};
            activation.acknowledge(generation, result.data, documentId);
            return result;
        },
        [activation, activeBuffer?.documentId],
    );

    const openWorkspace = useCallback(
        async (path: string): Promise<EntryCommandOutcome | undefined> => {
            if (workspaceOpenPending.current) {
                queuedWorkspacePath.current = path;
                return undefined;
            }
            workspaceOpenPending.current = true;
            beginWorkspaceRead();
            try {
                let nextPath: string | null = path;
                let lastResult: EntryCommandOutcome | undefined;
                while (nextPath !== null) {
                    const result: WorkspaceResult | undefined = await appModelAdapter.openWorkspace?.(nextPath);
                    reportEntryError(result?.error, 'open-folder', nextPath);
                    if (result?.error?.category === 'not-found') await appModelAdapter.refreshRecentItems?.();
                    lastResult = result;
                    const queued = queuedWorkspacePath.current;
                    queuedWorkspacePath.current = null;
                    if (queued === null) break;
                    const currentRoot: string | undefined =
                        result?.status === 'opened' || result?.status === 'unchanged'
                            ? result.workspace?.rootPath
                            : store.getState().workspace.snapshot?.rootPath;
                    if (queued === currentRoot) break;
                    if (currentRoot !== undefined && currentRoot !== null) {
                        setReplaceFolderPath(queued);
                        break;
                    }
                    nextPath = queued;
                }
                return lastResult;
            } finally {
                workspaceOpenPending.current = false;
                endWorkspaceRead();
            }
        },
        [beginWorkspaceRead, endWorkspaceRead, reportEntryError],
    );

    const onOpenWorkspacePath = useCallback(
        async (path: string): Promise<EntryCommandOutcome | undefined> => {
            if (workspaceOpenPending.current) {
                queuedWorkspacePath.current = path;
                return undefined;
            }
            const currentRootPath = store.getState().workspace.snapshot?.rootPath;
            if (path === currentRootPath) return undefined;
            if (currentRootPath !== undefined && currentRootPath !== null) {
                setReplaceFolderPath(path);
                return undefined;
            }
            return openWorkspace(path);
        },
        [openWorkspace],
    );

    const onOpenRecentItem = useCallback(
        async (item: RecentItem, expectedTabSetRevision: number): Promise<EntryCommandOutcome | undefined> => {
            const result =
                item.kind === 'folder'
                    ? await (item.path === store.getState().workspace.snapshot?.rootPath
                          ? openWorkspace(item.path)
                          : onOpenWorkspacePath(item.path))
                    : await onOpenRecentFile(item.path, expectedTabSetRevision);
            return result;
        },
        [onOpenRecentFile, onOpenWorkspacePath, openWorkspace],
    );

    const onReopenLastFile = useCallback(
        async (expectedTabSetRevision: number): Promise<EntryCommandOutcome | undefined> => {
            await flushActiveDocument();
            const generation = activation.begin();
            const result = await appModelAdapter.reopenLastFile?.(expectedTabSetRevision);
            if (result?.status !== 'folder-target') activation.acknowledge(generation, result?.activeBuffer);
            requestFocusedTabReveal(result);
            if (result?.status === 'folder-target' && result.path !== undefined) {
                await onOpenRecentItem({ path: result.path, kind: 'folder' }, expectedTabSetRevision);
            }
            if (result?.error?.category === 'not-found') await onRefreshRecentItems();
            reportEntryError(result?.error, 'reopen-last');
            return result;
        },
        [
            activation,
            flushActiveDocument,
            onOpenRecentItem,
            onRefreshRecentItems,
            reportEntryError,
            requestFocusedTabReveal,
        ],
    );

    const onOpenFolder = useCallback(async (): Promise<EntryCommandOutcome | undefined> => {
        const result = await appModelAdapter.chooseWorkspaceFolder?.();
        reportEntryError(result?.error, 'open-folder');
        return result?.status === 'chosen' && result.path !== undefined ? onOpenWorkspacePath(result.path) : result;
    }, [onOpenWorkspacePath, reportEntryError]);

    const onNewWindow = useCallback(async (): Promise<void> => {
        try {
            await windowAdapter.openNewWindow('');
        } catch (error) {
            dispatch(notifyError(parseError(error), 'new-window'));
        }
    }, [dispatch]);

    const onRefreshWorkspace = useCallback(async (): Promise<EntryCommandOutcome | undefined> => {
        beginWorkspaceRead();
        try {
            const result = await appModelAdapter.refreshWorkspace?.();
            reportEntryError(result?.error, 'refresh-workspace');
            return result;
        } finally {
            endWorkspaceRead();
        }
    }, [beginWorkspaceRead, endWorkspaceRead, reportEntryError]);

    const onOpenTreeFile = useCallback(
        async (path: string, expectedTabSetRevision: number): Promise<EntryCommandOutcome | undefined> => {
            const result = await onOpenRecentFile(path, expectedTabSetRevision);
            if (result?.error?.category === 'not-found') await onRefreshWorkspace();
            return result;
        },
        [onOpenRecentFile, onRefreshWorkspace],
    );

    const onCreateWorkspaceEntry = useCallback(
        async (
            kind: 'file' | 'folder',
            parentPath: string,
            name: string,
        ): Promise<WorkspaceCreateOutcome | undefined> => {
            beginWorkspaceRead();
            try {
                const result =
                    kind === 'file'
                        ? await appModelAdapter.createWorkspaceFile?.(parentPath, name)
                        : await appModelAdapter.createWorkspaceFolder?.(parentPath, name);
                if (result?.error !== undefined && result.error.category !== 'conflict') {
                    reportEntryError(result.error, 'create-workspace-entry');
                }
                if (result?.status === 'opened' && kind === 'file') {
                    // Backend directory paths are absolute and canonical for the host OS.
                    // A backslash inside a POSIX folder name is an ordinary character.
                    const separator = parentPath.startsWith('/') ? '/' : '\\';
                    let openResult: EntryCommandOutcome | undefined;
                    try {
                        openResult = await onOpenRecentFile(
                            `${parentPath}${parentPath.endsWith(separator) ? '' : separator}${name}`,
                            store.getState().documents.tabSetRevision,
                            true,
                        );
                    } catch {
                        dispatch(
                            notifyToast({
                                code: 'io',
                                message: t('workspace.create.createdNotOpened'),
                                severity: 'error',
                                subject: name,
                                title: t('notification.error.io.title'),
                            }),
                        );
                        return { ...result, openResult: { status: 'refused' } };
                    }
                    if (openResult?.error?.category === 'capacity-limit') {
                        reportEntryError(
                            {
                                ...openResult.error,
                                message: `${t('workspace.create.createdNotOpened')} ${openResult.error.message} ${t('workspace.tree.closeTabsFirst')}`,
                            },
                            'create-workspace-entry',
                        );
                    } else if (
                        openResult === undefined ||
                        (openResult.status !== 'opened' &&
                            openResult.status !== 'focused' &&
                            openResult.error === undefined)
                    ) {
                        dispatch(
                            notifyToast({
                                code: 'io',
                                message: t('workspace.create.createdNotOpened'),
                                severity: 'error',
                                subject: name,
                                title: t('notification.error.io.title'),
                            }),
                        );
                    }
                    return { ...result, openResult };
                }
                return result;
            } catch (error) {
                dispatch(notifyError(parseError(error), 'create-workspace-entry'));
                return undefined;
            } finally {
                endWorkspaceRead();
            }
        },
        [beginWorkspaceRead, dispatch, endWorkspaceRead, onOpenRecentFile, reportEntryError],
    );

    const onRevealWorkspacePath = useCallback(
        async (path: string): Promise<PathCommandResult | undefined> => {
            try {
                const result = await appModelAdapter.revealWorkspacePath?.(path);
                reportEntryError(result?.error, 'reveal-workspace-path');
                return result;
            } catch (error) {
                dispatch(notifyError(parseError(error), 'reveal-workspace-path'));
                return undefined;
            }
        },
        [dispatch, reportEntryError],
    );

    const onCopyWorkspacePath = useCallback(
        async (path: string): Promise<PathCommandResult | undefined> => {
            try {
                const result = await appModelAdapter.copyWorkspacePath?.(path);
                reportEntryError(result?.error, 'copy-workspace-path');
                return result;
            } catch (error) {
                dispatch(notifyError(parseError(error), 'copy-workspace-path'));
                return undefined;
            }
        },
        [dispatch, reportEntryError],
    );

    const onSetWorkspaceHiddenFolders = useCallback(
        async (show: boolean): Promise<EntryCommandOutcome | undefined> => {
            beginWorkspaceRead();
            try {
                const result = await appModelAdapter.setWorkspaceHiddenFolders?.(show);
                reportEntryError(result?.error, 'refresh-workspace');
                return result;
            } finally {
                endWorkspaceRead();
            }
        },
        [beginWorkspaceRead, endWorkspaceRead, reportEntryError],
    );

    const onReplaceFolderChoice = useCallback(
        async (choice: WorkspaceReplaceChoice): Promise<void> => {
            const path = replaceFolderPath;
            setReplaceFolderPath(null);
            if (path === null || choice === 'cancel') return;
            if (choice === 'new-window') {
                try {
                    await windowAdapter.openNewWindow(path);
                } catch (error) {
                    dispatch(notifyError(parseError(error), 'open-folder:new-window'));
                }
                return;
            }
            if (store.getState().documents.orderedIds.length > 0 && (await closeAllWindowTabs()) !== 'closed') return;
            await openWorkspace(path);
        },
        [closeAllWindowTabs, dispatch, openWorkspace, replaceFolderPath],
    );

    const closeWorkspace = useCallback(async (): Promise<EntryCommandOutcome | undefined> => {
        const result = await appModelAdapter.closeWorkspace?.();
        reportClassifiedError(dispatch, result?.error, t('notification.error.io.title'));
        return result;
    }, [dispatch]);

    const onCloseFolder = useCallback(async (): Promise<EntryCommandOutcome | undefined> => {
        try {
            const { snapshot } = await appModelAdapter.getState();
            if (snapshot.workspace === undefined || snapshot.workspace === null) return undefined;
            if ((snapshot.orderedDocumentIds ?? []).length > 0) {
                setCloseFolderPromptOpen(true);
                return undefined;
            }
            return closeWorkspace();
        } catch (error) {
            dispatch(notifyError(parseError(error), 'close-folder:state'));
            return undefined;
        }
    }, [closeWorkspace, dispatch]);

    const onCloseFolderChoice = useCallback(
        async (choice: CloseFolderChoice): Promise<void> => {
            setCloseFolderPromptOpen(false);
            if (choice === 'cancel') return;
            if (choice === 'close-tabs' && (await closeAllWindowTabs()) !== 'closed') return;
            await closeWorkspace();
        },
        [closeAllWindowTabs, closeWorkspace],
    );

    return {
        openLink,
        treeRevealRequest,
        fragmentRequest,
        tabRevealRequest,
        editorFocusRequest,
        onFocusCreatedFile,
        onFocusedDocumentOpen,
        onActivateDocument,
        onNewDocument,
        onOpenDocument,
        onOpenRecentFile,
        onOpenRecentItem,
        onRefreshRecentItems,
        onClearRecentItems,
        onOpenTreeFile,
        onCreateWorkspaceEntry,
        onRevealWorkspacePath,
        onCopyWorkspacePath,
        onReopenLastFile,
        onOpenFolder,
        onNewWindow,
        onRefreshWorkspace,
        onSetWorkspaceHiddenFolders,
        onOpenWorkspacePath,
        onReplaceFolderChoice,
        replaceFolderPath,
        onCloseFolder,
        onCloseFolderChoice,
        closeFolderPromptOpen,
    } as const;
}

export type UseCommandsResult = ReturnType<typeof useCommands>;
