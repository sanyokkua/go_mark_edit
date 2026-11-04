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
    const [pendingById, setPendingById] = useState<Record<string, PendingExternalChange>>({});
    const pendingId = session.orderedDocumentIds.find((id) => pendingById[id] !== undefined);
    const pending = pendingId === undefined ? null : pendingById[pendingId];
    const setPending = useCallback(
        (
            update:
                | PendingExternalChange
                | null
                | ((current: PendingExternalChange | null) => PendingExternalChange | null),
        ) => {
            if (pendingId === undefined) return;
            setPendingById((current) => {
                const next = typeof update === 'function' ? update(current[pendingId] ?? null) : update;
                if (next === current[pendingId]) return current;
                const copy = { ...current };
                if (next === null) delete copy[pendingId];
                else copy[pendingId] = next;
                return copy;
            });
        },
        [pendingId],
    );
    const latest = useRef({ session, blocked, bootstrapStatus });
    const lifecycle = useRef(0);
    const flight = useRef<Promise<void> | null>(null);
    const deciding = useRef(false);
    const receivedGeneration = useRef<Record<string, number>>({});
    useEffect(() => {
        latest.current = { session, blocked, bootstrapStatus };
    }, [session, blocked, bootstrapStatus]);

    const receiveConflict = useCallback((preview: ConflictPreview): void => {
        if (latest.current.session.documentsById[preview.documentId] === undefined) return;
        receivedGeneration.current[preview.documentId] = (receivedGeneration.current[preview.documentId] ?? 0) + 1;
        setPendingById((current) => {
            const next = { ...current, [preview.documentId]: { preview, needsRecheck: latest.current.blocked } };
            const first = latest.current.session.orderedDocumentIds.find((id) => next[id] !== undefined);
            for (const [id, entry] of Object.entries(next)) {
                if (id !== first) next[id] = { ...entry, needsRecheck: true };
            }
            return next;
        });
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
                    const received = receivedGeneration.current[documentId] ?? 0;
                    const result = await documentConflictAdapter.checkExternalChanges(documentId);
                    if (generation !== lifecycle.current) return;
                    if (
                        received !== (receivedGeneration.current[documentId] ?? 0) ||
                        latest.current.session.documentsById[documentId] === undefined
                    )
                        continue;
                    if (result.status === 'detected' && result.preview !== undefined) {
                        receiveConflict(result.preview);
                    } else if (result.error === undefined && result.status === 'unchanged') {
                        setPendingById((current) => {
                            if (current[documentId] === undefined) return current;
                            const copy = { ...current };
                            delete copy[documentId];
                            return copy;
                        });
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

    const staleIds = Object.keys(pendingById).filter((id) => session.documentsById[id] === undefined);
    if (staleIds.length > 0 || (blocked && Object.values(pendingById).some((entry) => !entry.needsRecheck))) {
        const next = { ...pendingById };
        for (const id of staleIds) delete next[id];
        if (blocked) {
            for (const [id, entry] of Object.entries(next)) next[id] = { ...entry, needsRecheck: true };
        }
        setPendingById(next);
    }

    const pendingDocumentId = pending?.preview.documentId;
    const pendingDocumentStatus =
        pendingDocumentId === undefined ? undefined : session.documentsById[pendingDocumentId]?.status;
    const pendingNeedsRecheck = pending?.needsRecheck ?? false;
    useEffect(() => {
        if (pendingDocumentId === undefined || pendingDocumentStatus !== 'saved' || blocked || pendingNeedsRecheck)
            return;
        let disposed = false;
        const generation = receivedGeneration.current[pendingDocumentId] ?? 0;
        // A deferred write may finish while an older foreground check is in flight.
        // Wait for it, then compare the saved document against its new disk baseline.
        void (async (): Promise<void> => {
            await flight.current;
            if (disposed || latest.current.blocked) return;
            try {
                const result = await documentConflictAdapter.checkExternalChanges(pendingDocumentId);
                if (disposed) return;
                setPending((current) =>
                    (receivedGeneration.current[pendingDocumentId] ?? 0) !== generation ||
                    current?.preview.documentId !== pendingDocumentId ||
                    result.error !== undefined
                        ? current
                        : result.status === 'detected' && result.preview !== undefined
                          ? { preview: result.preview, needsRecheck: latest.current.blocked }
                          : result.status === 'unchanged'
                            ? null
                            : current,
                );
            } catch {
                // A later foreground event can retry the comparison.
            }
        })();
        return () => {
            disposed = true;
        };
    }, [blocked, pendingNeedsRecheck, pendingDocumentId, pendingDocumentStatus, setPending]);

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
    }, [blocked, bootstrapStatus, pending, setPending]);

    const decideConflict = useCallback(
        async (decision: ExternalChangeDecision): Promise<void> => {
            if (pending === null || blocked || pending.needsRecheck || deciding.current) return;
            const preview = pending.preview;
            if (decision === 'keep-mine' && !isConflictCurrent(preview, session.documentsById)) return;
            deciding.current = true;
            receivedGeneration.current[preview.documentId] = (receivedGeneration.current[preview.documentId] ?? 0) + 1;
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
                    else if (
                        result.error.category === 'conflict' &&
                        (decision === 'reload' || decision === 'keep-mine')
                    )
                        setPending((current) => (current === pending ? { ...current, needsRecheck: true } : current));
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
        [blocked, conflicts, dispatch, pending, session.documentsById, setPending],
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
