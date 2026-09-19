import { useCallback, useEffect, useRef, useState } from 'react';

import { t } from '../i18n';
import { appModelAdapter, closePlanAdapter } from '../logic/adapter';
import { useAppDispatch } from '../logic/store';
import { hydrateProjection } from '../logic/store/appModelProjectionActions';
import { reportClassifiedError } from '../logic/store/classifiedNotification';
import { notifyError } from '../logic/store/notificationsSlice';
import { parseError } from '../logic/utils/parseError';
import type {
    ClassifiedError,
    CloseChoice,
    ClosePlanDecision,
    ClosePlanKind,
    ClosePlanResult,
    ClosePlanSummary,
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
import type { ShutdownController } from './useShutdown';

interface CloseWorkflowOptions {
    session: DocumentSession;
    shutdown: ShutdownController;
    conflicts: ConflictCommands;
    recoverySurface: RecoverySurface | null;
}

/** Owns close plans and their prompts; the shutdown controller owns native request identity. */
export function useCloseWorkflow({ session, shutdown, conflicts, recoverySurface }: CloseWorkflowOptions) {
    const dispatch = useAppDispatch();
    const [state, setState] = useState<CloseState>({ phase: 'idle' });
    const current = useRef<CloseState>(state);
    const mounted = useRef(false);
    const deciding = useRef(false);
    const publish = useCallback((next: CloseState): void => {
        current.current = next;
        setState(next);
    }, []);
    const isCurrent = useCallback(
        (origin: CloseOrigin): boolean =>
            mounted.current && current.current.phase !== 'idle' && current.current.origin === origin,
        [],
    );
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);

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
            if (isCurrent(context.origin)) publish({ phase: 'idle' });
        },
        [isCurrent, publish, reportUnknownError, shutdown],
    );

    const fail = useCallback(
        async (error: ClassifiedError | unknown, context: CloseContext): Promise<void> => {
            if (!isCurrent(context.origin)) return;
            if (typeof error === 'object' && error !== null && 'category' in error && 'dedupKey' in error) {
                reportError(error as ClassifiedError, context.origin);
            } else {
                reportUnknownError(error);
            }
            publish({ ...context, phase: 'failed' });
            if (context.origin.type === 'native') await cancel(context);
        },
        [cancel, isCurrent, publish, reportError, reportUnknownError],
    );

    useEffect(() => {
        if (current.current !== state) return;
        if (state.phase !== 'collecting' && state.phase !== 'normalization' && state.phase !== 'conflict') return;
        if (state.plan.targets.every((target) => session.documentsById[target.documentId] !== undefined)) return;
        // A new origin object invalidates any in-flight decision for the removed target.
        const context: CloseContext = { ...state, origin: { ...state.origin } };
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
    }, [cancel, fail, publish, session.documentsById, state]);

    const complete = useCallback(
        async (plan: ClosePlanSummary, context: CloseContext): Promise<TabTransitionResult | undefined> => {
            if (!isCurrent(context.origin)) return undefined;
            publish({ ...context, phase: 'executing', plan });
            const generation = session.activation.begin();
            try {
                const result = await closePlanAdapter.executeClosePlan(plan.id);
                if (!isCurrent(context.origin)) return result;
                if (result.error !== undefined) {
                    await fail(result.error, context);
                    return result;
                }
                session.activation.acknowledge(generation, result.activeBuffer);
                if (result.orderedDocumentIds.length === 0) {
                    const reconciled = await appModelAdapter.getState();
                    if (isCurrent(context.origin) && (reconciled.snapshot.orderedDocumentIds ?? []).length === 0) {
                        dispatch(hydrateProjection(reconciled.snapshot));
                    }
                }
                if (!isCurrent(context.origin)) return result;
                if (context.origin.type === 'native') {
                    const refusal = await shutdown.authorizeQuit(context.origin.closeId);
                    if (refusal !== undefined) {
                        await fail(refusal, context);
                        return { ...result, error: refusal };
                    }
                    shutdown.clearPendingClose(context.origin.closeId);
                }
                if (isCurrent(context.origin)) publish({ phase: 'idle' });
                return result;
            } catch (error) {
                await fail(error, context);
                return undefined;
            }
        },
        [dispatch, fail, isCurrent, publish, session.activation, shutdown],
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
        [cancel, complete, fail, isCurrent, publish, session.orderedDocumentIds],
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
        const closeId = shutdown.pendingClose;
        if (closeId === null || recoverySurface !== null || current.current !== state) return;
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

    const choose = useCallback(
        async (choice: CloseChoice): Promise<void> => {
            const progress = current.current;
            if (progress.phase !== 'collecting' || deciding.current) return;
            deciding.current = true;
            try {
                const dirty = progress.plan.targets.filter((target) => target.dirty);
                const decisions: ClosePlanDecision[] =
                    progress.plan.kind === 'single' && dirty.length === 1
                        ? [{ choice, documentId: dirty[0].documentId }]
                        : [{ choice }];
                await processResult(await closePlanAdapter.resolveClosePlan(progress.plan.id, decisions), progress);
            } catch (error) {
                await fail(error, progress);
            } finally {
                deciding.current = false;
            }
        },
        [fail, processResult],
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
                if (result.error !== undefined) {
                    if (decision === 'reload') {
                        await fail(result.error, progress);
                        return;
                    }
                    reportError(result.error, progress.origin);
                    if (result.preview !== undefined) publish({ ...progress, preview: result.preview });
                    return;
                }
                if (decision === 'keep-mine' && result.decisionToken !== undefined) {
                    await processResult(
                        await closePlanAdapter.resolveClosePlan(
                            progress.plan.id,
                            closePlanDecisions(progress.plan, {
                                documentId: progress.preview.documentId,
                                decisionToken: result.decisionToken,
                            }),
                        ),
                        progress,
                    );
                } else if (decision === 'reload' && result.status === 'reloaded') {
                    const refreshed = await appModelAdapter.getState();
                    if (!isCurrent(progress.origin)) return;
                    const targets =
                        progress.origin.type === 'tabs'
                            ? progress.origin.targetDocumentIds
                            : progress.plan.targets.map((target) => target.documentId);
                    publish({ ...progress, phase: 'preparing' });
                    await prepare(
                        progress.plan.kind,
                        targets,
                        refreshed.snapshot.tabSetRevision ?? progress.plan.tabSetRevision,
                        { ...progress, acceptedNormalizations: {} },
                    );
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
        shutdown.pendingClose !== null &&
        (state.phase === 'idle' || state.phase === 'failed')
            ? {
                  phase: 'recovery-confirmation',
                  origin: { type: 'native', closeId: shutdown.pendingClose },
                  acceptedNormalizations: {},
              }
            : null;
    const closedTarget =
        (state.phase === 'collecting' || state.phase === 'normalization' || state.phase === 'conflict') &&
        state.plan.targets.some((target) => session.documentsById[target.documentId] === undefined);
    const nativePreparation: CloseState | null =
        shutdown.pendingClose !== null && (state.phase === 'idle' || state.phase === 'failed')
            ? {
                  phase: 'preparing',
                  origin: { type: 'native', closeId: shutdown.pendingClose },
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
        choose,
        decideNormalization,
        decideRecovery,
        active: (state.phase !== 'idle' && state.phase !== 'failed') || shutdown.pendingClose !== null,
        recoveryDiscardNames: recoveryDiscardNames(session.orderedDocumentIds, session.documentsById),
    } as const;
}

export type CloseWorkflow = ReturnType<typeof useCloseWorkflow>;
