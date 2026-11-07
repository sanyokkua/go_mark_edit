import { isBufferSyncError } from '../logic/utils/bufferSyncError';
import { useCallback, useEffect, useRef, useState } from 'react';

import { t } from '../i18n';
import { appModelAdapter, closePlanAdapter } from '../logic/adapter';
import { useAppDispatch, useAppSelector } from '../logic/store';
import { hydrateProjection } from '../logic/store/appModelProjectionActions';
import { reportClassifiedError } from '../logic/store/classifiedNotification';
import { notifyError } from '../logic/store/notificationsSlice';
import { parseError } from '../logic/utils/parseError';
import type {
    AppModelState,
    AppStateSnapshot,
    ClassifiedError,
    CloseChoice,
    ConflictPreview,
    ConflictResult,
    ClosePlanDecision,
    ClosePlanKind,
    ClosePlanResult,
    ClosePlanSummary,
    CloseTarget,
    RecoverySurface,
    TabTransitionResult,
} from '../logic/store/appModelTypes';
import type { ExternalChangeDecision } from '../ui/widgets/dialogs/ExternalChangePrompt';
import {
    closePlanDecisions,
    closeStateFor,
    recoveryDiscardNames,
    type CloseContext,
    type CloseOrigin,
    type CloseState,
} from './closeWorkflow';
import { isConflictCurrent, type ConflictPresentation } from './conflictPresentation';
import type { ConflictCommands } from './useConflictCommands';
import type { DocumentSession } from './useDocumentSession';
import type { CloseSaveOutcome, DocumentWrites } from './useDocumentWrites';
import type { ShutdownController } from './useShutdown';

interface CloseWorkflowOptions {
    session: DocumentSession;
    shutdown: ShutdownController;
    conflicts: ConflictCommands;
    recoverySurface: RecoverySurface | null;
    writes: Pick<DocumentWrites, 'saveForClose' | 'notifyInactiveFormatSkipped'>;
    onExternalConflict?: (preview: ConflictPreview) => void;
}

export type CloseAllWindowTabsResult = 'closed' | 'cancelled' | 'refused';

function closeConflictOutcome(decision: ExternalChangeDecision, result: ConflictResult) {
    const { error, preview, decisionToken, status } = result;
    if (error !== undefined) {
        if (decision === 'reload') return { kind: 'fail', error } as const;
        return { kind: 'report', error, preview } as const;
    }
    if (decision === 'keep-mine' && decisionToken !== undefined) return { kind: 'keep-mine', decisionToken } as const;
    if (decision === 'reload' && status === 'reloaded') return { kind: 'reload' } as const;
    return { kind: 'unchanged' } as const;
}

function closeTargetsAfterReload(origin: CloseOrigin, plan: ClosePlanSummary): string[] {
    return origin.type === 'tabs' ? origin.targetDocumentIds : plan.targets.map((target) => target.documentId);
}

function directCloseDecisions(kind: ClosePlanKind, dirty: CloseTarget[], choice: CloseChoice): ClosePlanDecision[] {
    return kind === 'single' && dirty.length === 1 ? [{ choice, documentId: dirty[0].documentId }] : [{ choice }];
}

function hasCompletedCloseSave(
    outcome: CloseSaveOutcome,
): outcome is Extract<CloseSaveOutcome, { status: 'saved' | 'reloaded' }> {
    return outcome.status === 'saved' || outcome.status === 'reloaded';
}

function closeSnapshotMatches(
    plan: ClosePlanSummary,
    targetIds: string[],
    snapshot: AppStateSnapshot,
    activeDocumentId: string,
    completedRevision: number,
): boolean {
    const allTabsTargeted = plan.kind === 'window' || plan.kind === 'quit';
    const openIds = snapshot.orderedDocumentIds ?? [];
    const sameOpenSet =
        !allTabsTargeted || (openIds.length === targetIds.length && openIds.every((id) => targetIds.includes(id)));
    return (
        sameOpenSet &&
        plan.targets.every((target) => {
            const document = snapshot.documents[target.documentId];
            return (
                document !== undefined &&
                (target.documentId === activeDocumentId
                    ? document.contentRevision === completedRevision && !document.dirty
                    : document.contentRevision === target.contentRevision)
            );
        })
    );
}

function freshCloseTargetsMatch(
    originals: CloseTarget[],
    fresh: CloseTarget[],
    activeDocumentId: string,
    completedRevision: number,
): boolean {
    return (
        fresh.length === originals.length &&
        !fresh.some(
            (target, index) =>
                target.documentId !== originals[index]?.documentId ||
                (target.documentId === activeDocumentId
                    ? target.contentRevision !== completedRevision || target.dirty
                    : target.contentRevision !== originals[index]?.contentRevision),
        )
    );
}

function closeChangedDuringSave(planId: string): ClassifiedError {
    return {
        category: 'conflict',
        message: t('close.changedDuringSave'),
        remediations: ['Retry'],
        dedupKey: `close:changed:${planId}`,
    };
}

function backgroundSaveReporting(
    plan: ClosePlanSummary,
    result: TabTransitionResult,
    origin: CloseOrigin,
    activeDocumentId: string | undefined,
): { completed: CloseTarget[]; unconfirmed: CloseTarget[] } {
    const targets = plan.targets.filter((target) => target.choice === 'save' && target.documentId !== activeDocumentId);
    if (result.error !== undefined) return { completed: [], unconfirmed: targets };
    const completed = result.status === 'closed' || (origin.type === 'native' && result.status === 'noop');
    return { completed: completed ? targets : [], unconfirmed: [] };
}

function confirmsBackgroundSave(snapshot: AppStateSnapshot, target: CloseTarget): boolean {
    const document = snapshot.documents[target.documentId];
    return document?.status === 'saved' && document.contentRevision === target.contentRevision && !document.dirty;
}

/** Owns close plans and their prompts; the shutdown controller owns native request identity. */
export function useCloseWorkflow({
    session,
    shutdown,
    conflicts,
    recoverySurface,
    writes,
    onExternalConflict,
}: CloseWorkflowOptions) {
    const dispatch = useAppDispatch();
    const tabSetRevision = useAppSelector((state) => state.documents.tabSetRevision);
    const [state, setState] = useState<CloseState>({ phase: 'idle' });
    const current = useRef<CloseState>(state);
    const nativeClose = useRef(shutdown.pendingClose);
    const mounted = useRef(false);
    const deciding = useRef(false);
    const pendingWindowClose = useRef<{
        origin: CloseOrigin;
        resolve: (result: CloseAllWindowTabsResult) => void;
    } | null>(null);
    const settleWindowClose = useCallback((origin: CloseOrigin, result: CloseAllWindowTabsResult): void => {
        if (pendingWindowClose.current?.origin !== origin) return;
        pendingWindowClose.current.resolve(result);
        pendingWindowClose.current = null;
    }, []);
    const publish = useCallback((next: CloseState): void => {
        current.current = next;
        setState(next);
    }, []);
    const isCurrent = useCallback(
        (origin: CloseOrigin): boolean =>
            mounted.current &&
            current.current.phase !== 'idle' &&
            current.current.origin === origin &&
            (origin.type !== 'native' ||
                (nativeClose.current?.id === origin.closeId && nativeClose.current.owner === 'frontend')),
        [],
    );
    useEffect(() => {
        nativeClose.current = shutdown.pendingClose;
    }, [shutdown.pendingClose]);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
            if (pendingWindowClose.current !== null) {
                pendingWindowClose.current.resolve('refused');
                pendingWindowClose.current = null;
            }
        };
    }, []);

    useEffect(() => {
        if (state.phase === 'idle' || state.phase === 'failed' || state.origin.type !== 'native') return;
        if (shutdown.pendingClose?.id === state.origin.closeId && shutdown.pendingClose.owner === 'frontend') return;
        queueMicrotask(() => {
            if (current.current === state) publish({ phase: 'idle' });
        });
    }, [publish, shutdown.pendingClose, state]);

    const reportUnknownError = useCallback(
        (error: unknown): void => {
            // Raw bridge/OS text must go through the localized error mapper.
            dispatch(
                notifyError(
                    { ...parseError(error), code: 'io', details: { subject: 'native-close' } },
                    'native-close:io-failure',
                ),
            );
        },
        [dispatch],
    );
    const reportError = useCallback(
        (error: ClassifiedError, origin: CloseOrigin): void => {
            reportClassifiedError(
                dispatch,
                error,
                t('notification.error.io.title'),
                origin.type === 'native'
                    ? { intent: 'quit' }
                    : {
                          intent: 'close-documents',
                          retry: { close: { kind: origin.kind, targetDocumentIds: origin.targetDocumentIds } },
                      },
            );
        },
        [dispatch],
    );

    const cancel = useCallback(
        async (context: CloseContext): Promise<void> => {
            if (!isCurrent(context.origin)) return;
            if (context.origin.type === 'native') {
                publish({ ...context, phase: 'cancelling' });
                try {
                    await shutdown.cancelQuit(context.origin.closeId);
                } catch (error) {
                    reportUnknownError(error);
                    return;
                }
            }
            settleWindowClose(context.origin, 'cancelled');
            if (isCurrent(context.origin)) publish({ phase: 'idle' });
        },
        [isCurrent, publish, reportUnknownError, settleWindowClose, shutdown],
    );

    const fail = useCallback(
        async (error: unknown, context: CloseContext): Promise<void> => {
            if (!isCurrent(context.origin)) return;
            if (!isBufferSyncError(error)) {
                if (typeof error === 'object' && error !== null && 'category' in error && 'dedupKey' in error) {
                    reportError(error as ClassifiedError, context.origin);
                } else {
                    reportUnknownError(error);
                }
            }
            publish({ ...context, phase: 'failed' });
            settleWindowClose(context.origin, 'refused');
            if (context.origin.type === 'native') await cancel(context);
        },
        [cancel, isCurrent, publish, reportError, reportUnknownError, settleWindowClose],
    );

    useEffect(() => {
        if (current.current !== state) return;
        if (state.phase !== 'collecting' && state.phase !== 'normalization' && state.phase !== 'conflict') return;
        if (state.plan.targets.every((target) => session.documentsById[target.documentId] !== undefined)) return;
        // A new origin object invalidates any in-flight decision for the removed target.
        const context: CloseContext = { ...state, origin: { ...state.origin } };
        settleWindowClose(state.origin, 'cancelled');
        current.current = { ...context, phase: 'cancelling' };
        void (async (): Promise<void> => {
            try {
                const result = await closePlanAdapter.resolveClosePlan(state.plan.id, [{ choice: 'cancel' }]);
                if (result.error !== undefined) await fail(result.error, context);
                else await cancel(context);
            } catch (error) {
                await fail(error, context);
            }
        })();
    }, [cancel, fail, publish, session.documentsById, settleWindowClose, state]);

    const acknowledgeCompletedClose = useCallback(
        (result: TabTransitionResult, context: CloseContext, generation: number): boolean => {
            if (
                pendingWindowClose.current?.origin === context.origin &&
                (result.status !== 'closed' || result.orderedDocumentIds.length !== 0)
            ) {
                settleWindowClose(context.origin, 'refused');
                publish({ ...context, phase: 'failed' });
                return false;
            }
            session.activation.acknowledge(generation, result.activeBuffer);
            if (result.conflict !== undefined) onExternalConflict?.(result.conflict);
            return true;
        },
        [onExternalConflict, publish, session.activation, settleWindowClose],
    );

    const hydrateEmptyProjectionIfCurrent = useCallback(
        (origin: CloseOrigin, reconciled: AppModelState): void => {
            if (isCurrent(origin) && (reconciled.snapshot.orderedDocumentIds ?? []).length === 0) {
                dispatch(hydrateProjection(reconciled.snapshot));
            }
        },
        [dispatch, isCurrent],
    );

    const settleSuccessfulClose = useCallback(
        (origin: CloseOrigin): void => {
            if (isCurrent(origin)) publish({ phase: 'idle' });
            settleWindowClose(origin, 'closed');
        },
        [isCurrent, publish, settleWindowClose],
    );

    const complete = useCallback(
        async (plan: ClosePlanSummary, context: CloseContext): Promise<TabTransitionResult | undefined> => {
            if (!isCurrent(context.origin)) return undefined;
            publish({ ...context, phase: 'executing', plan });
            const generation = session.activation.begin();
            try {
                const result = await closePlanAdapter.executeClosePlan(plan.id);
                if (!isCurrent(context.origin)) return result;
                const background = backgroundSaveReporting(
                    plan,
                    result,
                    context.origin,
                    session.activeDocument?.documentId ?? session.activeBuffer?.documentId,
                );
                background.completed.forEach((target) => writes.notifyInactiveFormatSkipped(target.documentId));
                if (background.unconfirmed.length > 0) {
                    // The batch stops on its first failed write. A still-open, clean document
                    // with the same revision and explicit-save status proves its write committed.
                    try {
                        const refreshed = await appModelAdapter.getState();
                        background.unconfirmed.forEach((target) => {
                            if (confirmsBackgroundSave(refreshed.snapshot, target))
                                writes.notifyInactiveFormatSkipped(target.documentId);
                        });
                    } catch {
                        // An unreadable state cannot prove a background save completed.
                    }
                }
                if (result.error !== undefined) {
                    await fail(result.error, context);
                    return result;
                }
                if (!acknowledgeCompletedClose(result, context, generation)) return result;
                if (result.orderedDocumentIds.length === 0) {
                    const reconciled = await appModelAdapter.getState();
                    hydrateEmptyProjectionIfCurrent(context.origin, reconciled);
                }
                if (!isCurrent(context.origin)) return result;
                if (context.origin.type === 'native') {
                    if (result.status !== 'noop') {
                        await fail(new Error('The quit plan was not prepared.'), context);
                        return result;
                    }
                    const refusal = await shutdown.authorizeQuit(context.origin.closeId);
                    if (refusal !== undefined) {
                        await fail(refusal, context);
                        return { ...result, error: refusal };
                    }
                    shutdown.clearPendingClose(context.origin.closeId);
                }
                settleSuccessfulClose(context.origin);
                return result;
            } catch (error) {
                await fail(error, context);
                return undefined;
            }
        },
        [
            acknowledgeCompletedClose,
            fail,
            hydrateEmptyProjectionIfCurrent,
            isCurrent,
            publish,
            session.activation,
            session.activeBuffer,
            session.activeDocument,
            settleSuccessfulClose,
            shutdown,
            writes,
        ],
    );

    const processResult = useCallback(
        async (result: ClosePlanResult, context: CloseContext): Promise<TabTransitionResult | undefined> => {
            if (!isCurrent(context.origin)) return undefined;
            if (result.error !== undefined) {
                await fail(result.error, context);
                return { status: 'refused', orderedDocumentIds: session.orderedDocumentIds, error: result.error };
            }
            const plan = result.data;
            if (plan === undefined) return undefined;
            if (plan.status === 'cancelled' || plan.status === 'failed' || plan.status === 'complete') {
                if (plan.status === 'failed') settleWindowClose(context.origin, 'refused');
                await cancel(context);
                return undefined;
            }
            if (context.discardRecovery && plan.status !== 'ready') {
                const discarded = await closePlanAdapter.resolveClosePlan(plan.id, [{ choice: 'discard-all' }]);
                if (discarded.error !== undefined) {
                    await fail(discarded.error, context);
                    return undefined;
                }
                if (discarded.data?.status === 'ready') return complete(discarded.data, context);
                return undefined;
            }
            const next = closeStateFor(plan, context);
            publish(next);
            if (next.phase === 'executing') return complete(plan, context);
            return undefined;
        },
        [cancel, complete, fail, isCurrent, publish, session.orderedDocumentIds, settleWindowClose],
    );

    const prepare = useCallback(
        async (
            kind: ClosePlanKind,
            targets: string[],
            revision: number,
            context: CloseContext,
        ): Promise<TabTransitionResult | undefined> => {
            try {
                let result = await closePlanAdapter.prepareClose(kind, targets, revision);
                if (!isCurrent(context.origin)) return undefined;
                if (result.error === undefined && result.data?.status === 'ready') {
                    result = await closePlanAdapter.resolveClosePlan(result.data.id, []);
                }
                return await processResult(result, context);
            } catch (error) {
                await fail(error, context);
                return undefined;
            }
        },
        [fail, isCurrent, processResult],
    );

    const prepareNative = useCallback(
        (context: CloseContext): Promise<void> => {
            current.current = { ...context, phase: 'preparing' };
            return appModelAdapter
                .getState()
                .then(async (snapshot): Promise<void> => {
                    if (!isCurrent(context.origin)) return;
                    publish({ ...context, phase: 'preparing' });
                    if (!context.discardRecovery && snapshot.activeBuffer !== null) {
                        await appModelAdapter.flushActiveSession?.(snapshot.activeBuffer.documentId);
                    }
                    if (!isCurrent(context.origin)) return;
                    await prepare(
                        'quit',
                        snapshot.snapshot.orderedDocumentIds ?? session.orderedDocumentIds,
                        snapshot.snapshot.tabSetRevision ?? 0,
                        context,
                    );
                })
                .catch((error: unknown) => fail(error, context));
        },
        [fail, isCurrent, prepare, publish, session.orderedDocumentIds],
    );

    useEffect(() => {
        const pending = shutdown.pendingClose;
        if (pending?.owner !== 'frontend' || recoverySurface !== null || current.current !== state) return;
        const closeId = pending.id;
        const progress = state;
        if (progress.phase !== 'idle' && progress.phase !== 'failed') return;
        if (progress.phase === 'failed' && progress.origin.type === 'native' && progress.origin.closeId === closeId)
            return;
        const context: CloseContext = { origin: { type: 'native', closeId }, acceptedNormalizations: {} };
        void prepareNative(context);
    }, [prepareNative, recoverySurface, shutdown.pendingClose, state]);

    const onCloseDocument = useCallback(
        async (
            documentId: string,
            expectedTabSetRevision: number,
            kind: ClosePlanKind = 'single',
            targetDocumentIds: string[] = [documentId],
        ): Promise<TabTransitionResult> => {
            if (current.current.phase !== 'idle' && current.current.phase !== 'failed') {
                return { status: 'noop', orderedDocumentIds: session.orderedDocumentIds };
            }
            const targets = targetDocumentIds.length === 0 ? [documentId] : [...targetDocumentIds];
            const context: CloseContext = {
                origin: { type: 'tabs', kind, targetDocumentIds: targets },
                acceptedNormalizations: {},
            };
            publish({ ...context, phase: 'preparing' });
            try {
                if (session.activeBuffer !== null && targets.includes(session.activeBuffer.documentId)) {
                    await appModelAdapter.flushActiveSession?.(session.activeBuffer.documentId);
                }
                if (!isCurrent(context.origin))
                    return { status: 'noop', orderedDocumentIds: session.orderedDocumentIds };
                return (
                    (await prepare(kind, targets, expectedTabSetRevision, context)) ?? {
                        status: 'noop',
                        orderedDocumentIds: session.orderedDocumentIds,
                    }
                );
            } catch (error) {
                await fail(error, context);
                return { status: 'refused', orderedDocumentIds: session.orderedDocumentIds };
            }
        },
        [fail, isCurrent, prepare, publish, session.activeBuffer, session.orderedDocumentIds],
    );

    const closeAllWindowTabs = useCallback((): Promise<CloseAllWindowTabsResult> => {
        if (current.current.phase !== 'idle' && current.current.phase !== 'failed') return Promise.resolve('refused');
        if (pendingWindowClose.current !== null) return Promise.resolve('refused');
        const targets = [...session.orderedDocumentIds];
        if (targets.length === 0) return Promise.resolve('closed');
        return new Promise((resolve) => {
            // onCloseDocument creates the origin synchronously before its first await.
            const close = onCloseDocument(targets[0], tabSetRevision, 'window', targets);
            const progress = current.current;
            if (
                progress.phase === 'preparing' &&
                progress.origin.type === 'tabs' &&
                progress.origin.kind === 'window'
            ) {
                pendingWindowClose.current = { origin: progress.origin, resolve };
                void close.then((result) => {
                    if (pendingWindowClose.current?.origin !== progress.origin) return;
                    if (result.status === 'refused' || current.current.phase === 'preparing') {
                        settleWindowClose(progress.origin, 'refused');
                    }
                });
            } else {
                resolve('refused');
            }
        });
    }, [onCloseDocument, session.orderedDocumentIds, settleWindowClose, tabSetRevision]);

    const choose = useCallback(
        async (choice: CloseChoice): Promise<void> => {
            const progress = current.current;
            if (progress.phase !== 'collecting' || deciding.current) return;
            deciding.current = true;
            try {
                const dirty = progress.plan.targets.filter((target) => target.dirty);
                const activeDocumentId = session.activeDocument?.documentId ?? session.activeBuffer?.documentId;
                const saveChoice = choice === 'save' || choice === 'save-all';
                if (
                    !saveChoice ||
                    activeDocumentId === undefined ||
                    !dirty.some((target) => target.documentId === activeDocumentId)
                ) {
                    const decisions = directCloseDecisions(progress.plan.kind, dirty, choice);
                    await processResult(await closePlanAdapter.resolveClosePlan(progress.plan.id, decisions), progress);
                    return;
                }

                publish({ ...progress, phase: 'saving-active', choice, activeDocumentId });
                const cancelled = await closePlanAdapter.resolveClosePlan(progress.plan.id, [{ choice: 'cancel' }]);
                if (!isCurrent(progress.origin)) return;
                if (cancelled.error !== undefined || cancelled.data?.status !== 'cancelled') {
                    await fail(cancelled.error ?? new Error('The close plan could not be cancelled.'), progress);
                    return;
                }
                const saved = await writes.saveForClose(activeDocumentId);
                if (!isCurrent(progress.origin)) return;
                if (!hasCompletedCloseSave(saved)) {
                    await cancel(progress);
                    return;
                }
                if (saved.status === 'saved') await appModelAdapter.flushActiveSession?.(activeDocumentId);
                const refreshed = await appModelAdapter.getState();
                if (!isCurrent(progress.origin)) return;
                const completedRevision =
                    saved.status === 'saved' ? saved.writtenContentRevision : saved.contentRevision;
                const originals = progress.plan.targets;
                const targetIds = originals.map((target) => target.documentId);
                if (
                    !closeSnapshotMatches(
                        progress.plan,
                        targetIds,
                        refreshed.snapshot,
                        activeDocumentId,
                        completedRevision,
                    )
                ) {
                    await fail(closeChangedDuringSave(progress.plan.id), progress);
                    return;
                }
                const freshResult = await closePlanAdapter.prepareClose(
                    progress.plan.kind,
                    targetIds,
                    refreshed.snapshot.tabSetRevision ?? progress.plan.tabSetRevision,
                );
                if (!isCurrent(progress.origin)) return;
                if (freshResult.error !== undefined || freshResult.data === undefined) {
                    await fail(freshResult.error ?? new Error('The close plan could not be refreshed.'), progress);
                    return;
                }
                const fresh = freshResult.data;
                if (!freshCloseTargetsMatch(originals, fresh.targets, activeDocumentId, completedRevision)) {
                    await fail(closeChangedDuringSave(progress.plan.id), progress);
                    return;
                }
                if (saved.status === 'reloaded') {
                    await processResult({ data: fresh }, { ...progress, acceptedNormalizations: {} });
                    return;
                }
                const remaining = fresh.targets.filter((target) => target.dirty);
                const decisions: ClosePlanDecision[] = remaining.map((target) => ({
                    choice: 'save',
                    documentId: target.documentId,
                }));
                await processResult(await closePlanAdapter.resolveClosePlan(fresh.id, decisions), {
                    ...progress,
                    acceptedNormalizations: {},
                });
            } catch (error) {
                await fail(error, progress);
            } finally {
                deciding.current = false;
            }
        },
        [cancel, fail, isCurrent, processResult, publish, session.activeBuffer, session.activeDocument, writes],
    );

    const decideNormalization = useCallback(
        async (confirm: boolean): Promise<void> => {
            const progress = current.current;
            if (progress.phase !== 'normalization' || deciding.current) return;
            deciding.current = true;
            const context: CloseContext = confirm
                ? {
                      ...progress,
                      acceptedNormalizations: {
                          ...progress.acceptedNormalizations,
                          [progress.request.documentId]: progress.request.decisionToken,
                      },
                  }
                : progress;
            try {
                const decisions = confirm
                    ? closePlanDecisions(progress.plan, progress.request)
                    : [{ choice: 'cancel' as const }];
                await processResult(await closePlanAdapter.resolveClosePlan(progress.plan.id, decisions), context);
            } catch (error) {
                await fail(error, context);
            } finally {
                deciding.current = false;
            }
        },
        [fail, processResult],
    );

    const decideConflict = useCallback(
        async (decision: ExternalChangeDecision): Promise<void> => {
            const progress = current.current;
            if (progress.phase !== 'conflict' || deciding.current) return;
            if (decision === 'keep-mine' && !isConflictCurrent(progress.preview, session.documentsById)) return;
            deciding.current = true;
            try {
                if (decision === 'skip' || decision === 'cancel') {
                    await processResult(
                        await closePlanAdapter.resolveClosePlan(progress.plan.id, [{ choice: 'cancel' }]),
                        progress,
                    );
                    return;
                }
                if (session.activeBuffer?.documentId === progress.preview.documentId) {
                    await appModelAdapter.flushActiveSession?.(progress.preview.documentId);
                }
                if (decision === 'reload') {
                    const cancelled = await closePlanAdapter.resolveClosePlan(progress.plan.id, [{ choice: 'cancel' }]);
                    if (cancelled.error !== undefined) {
                        await fail(cancelled.error, progress);
                        return;
                    }
                }
                const result = await conflicts.execute(decision, progress.preview);
                if (!isCurrent(progress.origin)) return;
                const outcome = closeConflictOutcome(decision, result);
                switch (outcome.kind) {
                    case 'fail':
                        await fail(outcome.error, progress);
                        return;
                    case 'report':
                        reportError(outcome.error, progress.origin);
                        if (outcome.preview !== undefined) publish({ ...progress, preview: outcome.preview });
                        return;
                    case 'keep-mine':
                        await processResult(
                            await closePlanAdapter.resolveClosePlan(
                                progress.plan.id,
                                closePlanDecisions(progress.plan, {
                                    documentId: progress.preview.documentId,
                                    decisionToken: outcome.decisionToken,
                                }),
                            ),
                            progress,
                        );
                        return;
                    case 'reload': {
                        const refreshed = await appModelAdapter.getState();
                        if (!isCurrent(progress.origin)) return;
                        const targets = closeTargetsAfterReload(progress.origin, progress.plan);
                        publish({ ...progress, phase: 'preparing' });
                        await prepare(
                            progress.plan.kind,
                            targets,
                            refreshed.snapshot.tabSetRevision ?? progress.plan.tabSetRevision,
                            { ...progress, acceptedNormalizations: {} },
                        );
                        return;
                    }
                    case 'unchanged':
                        return;
                }
            } catch (error) {
                await fail(error, progress);
            } finally {
                deciding.current = false;
            }
        },
        [
            conflicts,
            fail,
            isCurrent,
            prepare,
            processResult,
            publish,
            reportError,
            session.activeBuffer,
            session.documentsById,
        ],
    );

    const recoveryConfirmation: CloseState | null =
        recoverySurface !== null &&
        shutdown.pendingClose?.owner === 'frontend' &&
        (state.phase === 'idle' || state.phase === 'failed')
            ? {
                  phase: 'recovery-confirmation',
                  origin: { type: 'native', closeId: shutdown.pendingClose.id },
                  acceptedNormalizations: {},
              }
            : null;
    const closedTarget =
        (state.phase === 'collecting' || state.phase === 'normalization' || state.phase === 'conflict') &&
        state.plan.targets.some((target) => session.documentsById[target.documentId] === undefined);
    const nativePreparation: CloseState | null =
        shutdown.pendingClose?.owner === 'frontend' && (state.phase === 'idle' || state.phase === 'failed')
            ? {
                  phase: 'preparing',
                  origin: { type: 'native', closeId: shutdown.pendingClose.id },
                  acceptedNormalizations: {},
              }
            : null;
    const presentationState: CloseState =
        recoveryConfirmation ??
        nativePreparation ??
        (closedTarget ? ({ ...state, phase: 'cancelling' } as CloseState) : state);

    const decideRecovery = useCallback(
        async (confirm: boolean): Promise<void> => {
            const progress = recoveryConfirmation ?? current.current;
            if (progress.phase !== 'recovery-confirmation') return;
            if (recoveryConfirmation !== null && current.current !== state) {
                const preparing = current.current;
                // Recovery can fail during the initial state read. A decision replaces that
                // preparation's origin so its late completion cannot continue the close.
                if (
                    preparing.phase !== 'preparing' ||
                    preparing.origin.type !== 'native' ||
                    progress.origin.type !== 'native' ||
                    preparing.origin.closeId !== progress.origin.closeId ||
                    preparing.discardRecovery === true
                )
                    return;
            }
            if (confirm) {
                publish({ ...progress, phase: 'preparing' });
                await prepareNative({ ...progress, discardRecovery: true });
            } else {
                publish(progress);
                await cancel(progress);
            }
        },
        [cancel, prepareNative, publish, recoveryConfirmation, state],
    );

    const conflict: ConflictPresentation | null =
        presentationState.phase === 'conflict'
            ? {
                  id: `close:${presentationState.plan.id}:${presentationState.preview.documentId}`,
                  preview: presentationState.preview,
                  valid: isConflictCurrent(presentationState.preview, session.documentsById),
                  onDecision: decideConflict,
              }
            : null;
    return {
        state: presentationState,
        conflict,
        onCloseDocument,
        closeAllWindowTabs,
        choose,
        decideNormalization,
        decideRecovery,
        active: (state.phase !== 'idle' && state.phase !== 'failed') || shutdown.pendingClose?.owner === 'frontend',
        recoveryDiscardNames: recoveryDiscardNames(session.orderedDocumentIds, session.documentsById),
    } as const;
}

export type CloseWorkflow = ReturnType<typeof useCloseWorkflow>;
