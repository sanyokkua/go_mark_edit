import { useCallback, useEffect, useRef, useState } from 'react';

import { documentConflictAdapter } from '../logic/adapter';
import { useAppDispatch } from '../logic/store';
import { reportClassifiedError } from '../logic/store/classifiedNotification';
import { notifyError } from '../logic/store/notificationsSlice';
import { parseError } from '../logic/utils/parseError';
import type { ConflictPreview } from '../logic/store/appModelTypes';
import { onApplicationForeground } from '../ui/widgets/foregroundFocus';
import type { ExternalChangeDecision } from '../ui/widgets/dialogs/ExternalChangePrompt';
import { isConflictCurrent, type ConflictPresentation } from './conflictPresentation';
import type { ConflictCommands } from './useConflictCommands';
import type { DocumentSession } from './useDocumentSession';

interface PendingExternalChange {
    readonly preview: ConflictPreview;
    readonly needsRecheck: boolean;
}

interface ExternalChangesOptions {
    session: DocumentSession;
    conflicts: ConflictCommands;
    bootstrapStatus: 'loading' | 'ready' | 'failed';
    blocked: boolean;
}

/** Foreground checks are single-flight, explicit, and disposed with the application. */
export function useExternalChanges({ session, conflicts, bootstrapStatus, blocked }: ExternalChangesOptions) {
    const dispatch = useAppDispatch();
    const [pending, setPending] = useState<PendingExternalChange | null>(null);
    const latest = useRef({ session, blocked, bootstrapStatus });
    const lifecycle = useRef(0);
    const flight = useRef<Promise<void> | null>(null);
    const deciding = useRef(false);
    useEffect(() => {
        latest.current = { session, blocked, bootstrapStatus };
    }, [session, blocked, bootstrapStatus]);

    const receiveConflict = useCallback((preview: ConflictPreview): void => {
        if (latest.current.session.documentsById[preview.documentId] === undefined) return;
        setPending({ preview, needsRecheck: latest.current.blocked });
    }, []);

    const runForegroundChecks = useCallback((): void => {
        if (flight.current !== null || latest.current.bootstrapStatus !== 'ready') return;
        const generation = lifecycle.current;
        const task = (async (): Promise<void> => {
            try {
                for (const documentId of latest.current.session.orderedDocumentIds) {
                    if (generation !== lifecycle.current) return;
                    const document = latest.current.session.documentsById[documentId];
                    if (document === undefined || document.path === '') continue;
                    const result = await documentConflictAdapter.checkExternalChanges(documentId);
                    if (generation !== lifecycle.current) return;
                    if (
                        result.status === 'detected' &&
                        result.preview !== undefined &&
                        documentId === latest.current.session.activeDocument?.documentId
                    ) {
                        receiveConflict(result.preview);
                    } else if (result.error === undefined && result.status === 'unchanged') {
                        setPending((current) => (current?.preview.documentId === documentId ? null : current));
                    }
                }
            } catch {
                // Foreground inspection failure leaves the backend and any existing prompt intact.
            }
        })();
        flight.current = task;
        void task.finally(() => {
            if (flight.current === task) flight.current = null;
        });
    }, [receiveConflict]);

    useEffect(() => {
        lifecycle.current += 1;
        const dispose = onApplicationForeground(runForegroundChecks);
        return () => {
            lifecycle.current += 1;
            dispose();
        };
    }, [runForegroundChecks]);

    if (pending !== null) {
        if (session.documentsById[pending.preview.documentId] === undefined) setPending(null);
        else if (blocked && !pending.needsRecheck) setPending({ ...pending, needsRecheck: true });
    }

    useEffect(() => {
        if (blocked || pending === null || !pending.needsRecheck || bootstrapStatus !== 'ready') return;
        let disposed = false;
        const recheck = async (): Promise<void> => {
            await flight.current;
            if (disposed || latest.current.blocked) return;
            const task = (async (): Promise<void> => {
                try {
                    const result = await documentConflictAdapter.checkExternalChanges(pending.preview.documentId);
                    if (disposed) return;
                    setPending((current) =>
                        current !== pending
                            ? current
                            : result.error !== undefined
                              ? current
                              : result.status === 'detected' && result.preview !== undefined
                                ? { preview: result.preview, needsRecheck: latest.current.blocked }
                                : result.status === 'unchanged'
                                  ? null
                                  : current,
                    );
                } catch {
                    // Keep the identity hidden; the next foreground event retries the check.
                }
            })();
            flight.current = task;
            await task;
            if (flight.current === task) flight.current = null;
        };
        void recheck();
        return () => {
            disposed = true;
        };
    }, [blocked, bootstrapStatus, pending]);

    const decideConflict = useCallback(
        async (decision: ExternalChangeDecision): Promise<void> => {
            if (pending === null || blocked || pending.needsRecheck || deciding.current) return;
            const preview = pending.preview;
            if (decision === 'keep-mine' && !isConflictCurrent(preview, session.documentsById)) return;
            deciding.current = true;
            const generation = lifecycle.current;
            try {
                const result = await conflicts.execute(decision, preview);
                if (generation !== lifecycle.current) return;
                if (result.error !== undefined) {
                    reportClassifiedError(
                        dispatch,
                        result.error,
                        'The external-change decision could not be completed.',
                    );
                    if (result.preview !== undefined)
                        setPending((current) =>
                            current === pending && result.preview !== undefined
                                ? { preview: result.preview, needsRecheck: latest.current.blocked }
                                : current,
                        );
                    return;
                }
                // Authorization also returns the compared preview; it never starts a Save here.
                if (result.status === 'detected' && result.preview !== undefined) {
                    setPending((current) =>
                        current === pending && result.preview !== undefined
                            ? { preview: result.preview, needsRecheck: latest.current.blocked }
                            : current,
                    );
                } else {
                    setPending((current) => (current === pending ? null : current));
                }
            } catch (error) {
                if (generation === lifecycle.current) {
                    dispatch(
                        notifyError(
                            { ...parseError(error), code: 'io', details: { subject: preview.documentId } },
                            `external-change:${preview.documentId}:io-failure`,
                        ),
                    );
                }
            } finally {
                deciding.current = false;
            }
        },
        [blocked, conflicts, dispatch, pending, session.documentsById],
    );

    const visible =
        pending !== null &&
        !blocked &&
        !pending.needsRecheck &&
        session.documentsById[pending.preview.documentId] !== undefined;
    const conflict: ConflictPresentation | null = visible
        ? {
              id: `foreground:${pending.preview.documentId}`,
              preview: pending.preview,
              valid: isConflictCurrent(pending.preview, session.documentsById),
              onDecision: decideConflict,
          }
        : null;
    return { conflict, receiveConflict, active: visible } as const;
}
