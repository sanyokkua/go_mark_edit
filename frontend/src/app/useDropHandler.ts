import { useCallback, useEffect, useRef, useState } from 'react';

import { t } from '../i18n';
import { appModelAdapter, windowAdapter } from '../logic/adapter';
import { subscribeFileDrops } from '../logic/adapter/events';
import { store, useAppDispatch } from '../logic/store';
import { notifyToast } from '../logic/store/notificationsSlice';
import type { FolderDropChoice } from '../ui/widgets/dialogs/FolderDropPrompt';
import type { UseCommandsResult } from './useCommands';

export interface DropHandler {
    dropEpoch: number;
    folderPaths: readonly string[];
    onFolderChoice: (choice: FolderDropChoice) => Promise<void>;
    handlePaths: (paths: string[]) => Promise<void>;
}

/** One native drop is classified once; files and folders then use existing entry commands. */
export function useDropHandler(
    commands: Pick<UseCommandsResult, 'onOpenRecentFile' | 'onOpenWorkspacePath' | 'replaceFolderPath'>,
    ready: boolean,
): DropHandler {
    const dispatch = useAppDispatch();
    const [dropEpoch, setDropEpoch] = useState(0);
    const [folderPaths, setFolderPaths] = useState<readonly string[]>([]);
    const [decisionEpoch, setDecisionEpoch] = useState(0);
    const busy = useRef(false);
    const pendingFolderChoice = useRef(false);
    const queuedDrops = useRef<string[][]>([]);
    const handlePaths = useCallback(
        async (paths: string[]): Promise<void> => {
            if (!ready || paths.length === 0) return;
            if (busy.current || pendingFolderChoice.current || commands.replaceFolderPath !== null) {
                queuedDrops.current.push(paths);
                return;
            }
            busy.current = true;
            try {
                const classification = await appModelAdapter.classifyDroppedPaths?.(paths);
                if (classification === undefined) return;
                if (classification.category !== undefined) {
                    dispatch(
                        notifyToast({
                            code: 'drop-classification',
                            severity: 'error',
                            subject: 'drop',
                            title: t('notification.error.io.title'),
                            message: classification.message ?? '',
                        }),
                    );
                    return;
                }
                if (classification.unsupported.length > 0) {
                    dispatch(
                        notifyToast({
                            code: 'drop-unsupported',
                            severity: 'warning',
                            subject: 'drop',
                            title: t('workspace.drop.hint'),
                            message: t('workspace.drop.unsupported', { count: classification.unsupported.length }),
                        }),
                    );
                }
                if (classification.folders.length === 1) {
                    await commands.onOpenWorkspacePath(classification.folders[0]);
                } else if (classification.folders.length > 1) {
                    pendingFolderChoice.current = true;
                    setFolderPaths(classification.folders);
                }
                for (let index = 0; index < classification.files.length; index += 1) {
                    const revision = store.getState().documents.tabSetRevision;
                    const result = await commands.onOpenRecentFile(classification.files[index], revision, true);
                    if (result?.error?.category === 'capacity-limit') {
                        dispatch(
                            notifyToast({
                                code: 'drop-capacity',
                                severity: 'warning',
                                subject: 'drop',
                                title: t('workspace.drop.hint'),
                                message: t('workspace.drop.capacity', { count: classification.files.length - index }),
                            }),
                        );
                        break;
                    }
                }
            } finally {
                busy.current = false;
                setDecisionEpoch((current) => current + 1);
            }
        },
        [commands, dispatch, ready],
    );

    useEffect(() => {
        if (!ready) return;
        return subscribeFileDrops((paths) => {
            setDropEpoch((current) => current + 1);
            void handlePaths(paths);
        });
    }, [handlePaths, ready]);

    useEffect(() => {
        if (
            !ready ||
            busy.current ||
            pendingFolderChoice.current ||
            commands.replaceFolderPath !== null ||
            folderPaths.length > 0
        )
            return;
        const next = queuedDrops.current.shift();
        if (next !== undefined) void handlePaths(next);
    }, [commands.replaceFolderPath, decisionEpoch, folderPaths, handlePaths, ready]);

    const onFolderChoice = useCallback(
        async (choice: FolderDropChoice): Promise<void> => {
            const paths = folderPaths;
            if (paths.length === 0) return;
            try {
                if (choice === 'first-only' && paths[0] !== undefined) {
                    await commands.onOpenWorkspacePath(paths[0]);
                } else if (choice === 'all-new-windows') {
                    const failed: string[] = [];
                    for (const path of paths) {
                        try {
                            await windowAdapter.openNewWindow(path);
                        } catch {
                            failed.push(path);
                        }
                    }
                    if (failed.length > 0) {
                        dispatch(
                            notifyToast({
                                code: 'drop-new-window-failed',
                                severity: 'error',
                                subject: 'drop',
                                title: t('workspace.drop.folders.title'),
                                message: t('workspace.drop.newWindowFailed', {
                                    count: failed.length,
                                    paths: failed.join(', '),
                                }),
                            }),
                        );
                    }
                }
            } finally {
                pendingFolderChoice.current = false;
                setFolderPaths([]);
                setDecisionEpoch((current) => current + 1);
            }
        },
        [commands, dispatch, folderPaths],
    );

    return { dropEpoch, folderPaths, onFolderChoice, handlePaths };
}
