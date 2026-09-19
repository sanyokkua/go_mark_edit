import { useCallback } from 'react';

import { t } from '../i18n';
import { appModelAdapter } from '../logic/adapter';
import { useAppDispatch } from '../logic/store';
import { reportClassifiedError } from '../logic/store/classifiedNotification';
import type { ClassifiedError, DocumentTransitionResult } from '../logic/store/appModelTypes';
import type { NotificationRemediationIntent } from '../logic/store/notificationsSlice';
import { flushOutgoingDocument } from '../ui/widgets/outgoingFlush';
import type { DocumentSession } from './useDocumentSession';

export interface EntryCommandOutcome {
    error?: ClassifiedError;
}

/** Owns entry and activation commands. Widgets keep their existing command signatures. */
export function useCommands({ activeBuffer, activation }: Pick<DocumentSession, 'activeBuffer' | 'activation'>) {
    const dispatch = useAppDispatch();
    const activeBufferDocumentId = activeBuffer?.documentId;
    const flushActiveDocument = useCallback(async (): Promise<void> => {
        if (activeBufferDocumentId === undefined) return;
        await appModelAdapter.flushActiveSession?.(activeBufferDocumentId);
    }, [activeBufferDocumentId]);

    const reportEntryError = useCallback(
        (error: ClassifiedError | undefined, intent: NotificationRemediationIntent, path?: string): void => {
            reportClassifiedError(dispatch, error, t('notification.error.io.title'), {
                intent,
                ...(path === undefined ? {} : { retry: { path } }),
            });
        },
        [dispatch],
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
            reportEntryError(result?.error, 'open-document');
            return result;
        },
        [activation, flushActiveDocument, reportEntryError],
    );

    const onOpenRecentFile = useCallback(
        async (path: string, expectedTabSetRevision: number): Promise<EntryCommandOutcome | undefined> => {
            await flushActiveDocument();
            const generation = activation.begin();
            const result = await appModelAdapter.openRecentFile?.(path, expectedTabSetRevision);
            activation.acknowledge(generation, result?.activeBuffer);
            reportEntryError(result?.error, 'open-recent', path);
            return result;
        },
        [activation, flushActiveDocument, reportEntryError],
    );

    const onReopenLastFile = useCallback(
        async (expectedTabSetRevision: number): Promise<EntryCommandOutcome | undefined> => {
            await flushActiveDocument();
            const generation = activation.begin();
            const result = await appModelAdapter.reopenLastFile?.(expectedTabSetRevision);
            activation.acknowledge(generation, result?.activeBuffer);
            reportEntryError(result?.error, 'reopen-last');
            return result;
        },
        [activation, flushActiveDocument, reportEntryError],
    );

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

    return { onActivateDocument, onNewDocument, onOpenDocument, onOpenRecentFile, onReopenLastFile } as const;
}

export type UseCommandsResult = ReturnType<typeof useCommands>;
