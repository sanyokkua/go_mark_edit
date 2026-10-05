import { useCallback, useContext, useEffect, useRef, useState } from 'react';

import { t } from '../i18n';
import { appModelAdapter, documentConflictAdapter, documentWriteAdapter } from '../logic/adapter';
import { useAppDispatch, useAppSelector } from '../logic/store';
import { hydrateProjection } from '../logic/store/appModelProjectionActions';
import { reportClassifiedError } from '../logic/store/classifiedNotification';
import type { ClassifiedError, DocumentMetadata, RecoverySurface, WriteResult } from '../logic/store/appModelTypes';
import { notifyCondition, notifyToast, type NotificationRemediationIntent } from '../logic/store/notificationsSlice';
import type { ExternalChangeDecision } from '../ui/widgets/dialogs/ExternalChangePrompt';
import { TidyCommandsContext, type TidyCommandOutcome } from '../ui/widgets/tidyCommandsContext';
import type { DocumentSession } from './useDocumentSession';
import type { ConflictCommands } from './useConflictCommands';
import { isConflictCurrent, type ConflictPresentation } from './conflictPresentation';
import { promptAfterWrite, type WritePrompt } from './writeWorkflow';

function safeFilename(document: DocumentMetadata | undefined, targetPath?: string): string {
    const source = targetPath ?? document?.displayName ?? document?.path ?? document?.title;
    if (source === undefined || source.length === 0) return 'Untitled.md';
    const basename = source.replaceAll('\\', '/').split('/').pop() ?? source;
    const safe = basename.replace(/[\p{Cc}\p{Cf}]/gu, '');
    return safe.length === 0 ? 'Untitled.md' : safe;
}

function writeLineEndingLabel(outcome: { lineEndingOutcome: string }): string {
    switch (outcome.lineEndingOutcome) {
        case 'preserved-crlf':
        case 'normalized-crlf':
            return t('status.lineEnding.crlf');
        default:
            return t('status.lineEnding.lf');
    }
}

export type CloseSaveOutcome =
    | { status: 'saved'; writtenContentRevision: number }
    | { status: 'reloaded'; contentRevision: number }
    | { status: 'cancelled' | 'refused' | 'recovery' | 'disappeared' | 'unmounted' };

export function useDocumentWrites(session: DocumentSession, conflicts: ConflictCommands) {
    const { activeBuffer, activeDocument, documentsById } = session;
    const dispatch = useAppDispatch();
    const tidy = useContext(TidyCommandsContext);
    const markdownSettings = useAppSelector((state) => state.settings.markdown);
    const [prompt, updatePrompt] = useState<WritePrompt>({ phase: 'idle' });
    const [closeSavePending, setCloseSavePending] = useState(false);
    const [validationFailed, setValidationFailed] = useState(false);
    const promptRef = useRef<WritePrompt>(prompt);
    const operationRef = useRef(0);
    const inFlight = useRef(false);
    const mounted = useRef(false);
    const pendingCloseSave = useRef<{ documentId: string; resolve: (outcome: CloseSaveOutcome) => void } | null>(null);
    const suspendedWrite = useRef<{ prompt: WritePrompt; validationFailed: boolean } | null>(null);
    const settleCloseSave = useCallback((documentId: string, outcome: CloseSaveOutcome): void => {
        const pending = pendingCloseSave.current;
        if (pending?.documentId !== documentId) return;
        pendingCloseSave.current = null;
        if (mounted.current) setCloseSavePending(false);
        const suspended = suspendedWrite.current;
        suspendedWrite.current = null;
        if (mounted.current && suspended !== null) {
            promptRef.current = suspended.prompt;
            updatePrompt(suspended.prompt);
            setValidationFailed(suspended.validationFailed);
        }
        pending.resolve(outcome);
    }, []);
    const [recoverySurface, setRecoverySurface] = useState<RecoverySurface | null>(null);
    const showFormatSkip = useCallback(
        (documentId: string, reason: string): void => {
            dispatch(
                notifyToast({
                    code: 'format-on-save-skipped',
                    severity: 'warning',
                    subject: documentId,
                    title: t('tidy.skipped.title'),
                    message: t('tidy.skipped.message', { reason: t(`tidy.skipped.${reason}`) }),
                }),
            );
        },
        [dispatch],
    );
    const notifyInactiveFormatSkipped = useCallback(
        (documentId: string): void => {
            if (markdownSettings?.formatOnSave) showFormatSkip(documentId, 'notActive');
        },
        [markdownSettings?.formatOnSave, showFormatSkip],
    );
    const formatBeforeSave = useCallback(
        async (documentId: string, isActive: boolean): Promise<void> => {
            if (!markdownSettings?.formatOnSave) return;
            if (!isActive) {
                notifyInactiveFormatSkipped(documentId);
                return;
            }
            let outcome: TidyCommandOutcome;
            try {
                outcome = (await tidy?.run('format', { origin: 'on-save', documentId })) ?? { kind: 'failed' };
            } catch {
                outcome = { kind: 'failed' };
            }
            if (outcome.kind === 'edits') return;
            showFormatSkip(documentId, outcome.kind === 'stale' ? 'changed' : outcome.kind);
        },
        [markdownSettings?.formatOnSave, notifyInactiveFormatSkipped, showFormatSkip, tidy],
    );
    const lintAfterSave = useCallback(
        async (documentId: string): Promise<void> => {
            if (!markdownSettings?.lintOnSave) return;
            try {
                await tidy?.run('lint', { origin: 'on-save', documentId });
            } catch {
                // A completed disk write is not undone by a Lint failure.
            }
        },
        [markdownSettings?.lintOnSave, tidy],
    );
    const setPrompt = useCallback((next: WritePrompt): void => {
        promptRef.current = next;
        updatePrompt(next);
    }, []);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
            operationRef.current += 1;
            const pending = pendingCloseSave.current;
            if (pending !== null) settleCloseSave(pending.documentId, { status: 'unmounted' });
        };
    }, [settleCloseSave]);
    useEffect(() => {
        const current = promptRef.current;
        const pending = pendingCloseSave.current;
        if (pending !== null && documentsById[pending.documentId] === undefined) {
            operationRef.current += 1;
            inFlight.current = false;
            if (current.phase !== 'idle' && current.request.documentId === pending.documentId) {
                setPrompt({ phase: 'idle' });
                if (current.phase === 'normalization') {
                    void documentWriteAdapter
                        .cancelNormalization(current.request.documentId, current.request.decisionToken)
                        .catch(() => undefined);
                }
            }
            settleCloseSave(pending.documentId, { status: 'disappeared' });
            return;
        }
        if (current.phase === 'idle' || documentsById[current.request.documentId] !== undefined) return;
        operationRef.current += 1;
        inFlight.current = false;
        setPrompt({ phase: 'idle' });
        settleCloseSave(current.request.documentId, { status: 'disappeared' });
        if (current.phase === 'normalization') {
            void documentWriteAdapter
                .cancelNormalization(current.request.documentId, current.request.decisionToken)
                .catch(() => undefined);
        }
    }, [documentsById, prompt, setPrompt, settleCloseSave]);
    const reportWriteError = useCallback(
        (error: ClassifiedError | undefined, documentId: string, intent?: NotificationRemediationIntent): void => {
            if (!mounted.current) return;
            reportClassifiedError(
                dispatch,
                error ?? {
                    category: 'io-failure',
                    message: t('notification.error.io.message'),
                    remediations: intent === undefined ? [] : ['Retry'],
                    documentId,
                    dedupKey: `write:${documentId}`,
                },
                t('notification.error.io.title'),
                { intent },
            );
        },
        [dispatch],
    );

    const finishWrite = useCallback(
        async (
            kind: 'save' | 'save-as',
            documentId: string,
            contentRevision: number,
            decisionToken: string,
            filename: string,
            lintActive = false,
        ): Promise<WriteResult> => {
            const operation = operationRef.current;
            const result =
                kind === 'save'
                    ? await documentWriteAdapter.save(documentId, contentRevision, decisionToken)
                    : await documentWriteAdapter.saveAs(documentId, contentRevision, decisionToken);
            if (operation !== operationRef.current || !mounted.current) return result;
            const nextPrompt = promptAfterWrite(result, { kind, documentId, filename }, contentRevision, decisionToken);
            setPrompt(nextPrompt);
            if (nextPrompt.phase !== 'idle') return result;
            if (result.status === 'committed' && result.data !== undefined) {
                const recovered = await appModelAdapter.reconcileCommittedWrite(result.data);
                if (operation !== operationRef.current || !mounted.current) return result;
                if ('savedOnDisk' in recovered) {
                    setRecoverySurface(recovered);
                    dispatch(
                        notifyCondition({
                            code: 'recovery',
                            message: recovered.message,
                            severity: 'warning',
                            subject: documentId,
                            title: t('recovery.title'),
                        }),
                    );
                    settleCloseSave(documentId, { status: 'recovery' });
                } else {
                    setRecoverySurface(null);
                    dispatch(hydrateProjection(recovered.snapshot));
                    if (lintActive) await lintAfterSave(documentId);
                    if (operation !== operationRef.current || !mounted.current) return result;
                    settleCloseSave(documentId, {
                        status: 'saved',
                        writtenContentRevision: result.data.writtenContentRevision,
                    });
                }
                const writtenDocument = documentsById[documentId] ?? activeDocument;
                const safeName = safeFilename(writtenDocument, result.data.targetPath ?? filename);
                dispatch(
                    notifyToast({
                        code: 'save-success',
                        message: t('save.success.message', {
                            encoding: t(`status.encoding.${writtenDocument?.encoding ?? 'utf-8'}`),
                            filename: safeName,
                            lineEnding: writeLineEndingLabel(result.data),
                        }),
                        severity: 'success',
                        subject: documentId,
                        title: t('save.success.title'),
                    }),
                );
            } else if (result.status === 'conflict' || result.status === 'refused') {
                reportWriteError(result.error, documentId, kind);
                settleCloseSave(documentId, { status: 'refused' });
            } else if (result.status === 'cancelled') {
                settleCloseSave(documentId, { status: 'cancelled' });
            }
            return result;
        },
        [activeDocument, dispatch, documentsById, lintAfterSave, reportWriteError, setPrompt, settleCloseSave],
    );

    const beginWrite = useCallback(
        async (kind: 'save' | 'save-as', targetDocumentId?: string): Promise<WriteResult | undefined> => {
            if (inFlight.current || promptRef.current.phase !== 'idle') return undefined;
            const operation = ++operationRef.current;
            setValidationFailed(false);
            inFlight.current = true;
            try {
                const activeDocumentId = activeDocument?.documentId ?? activeBuffer?.documentId;
                const documentId = targetDocumentId ?? activeDocumentId;
                if (documentId === undefined) return undefined;
                const target = documentsById[documentId];
                if (target === undefined) return undefined;
                if (
                    target?.status === 'read-only' ||
                    (target?.capability !== undefined && target.capability !== 'writable')
                ) {
                    reportWriteError(
                        {
                            category: 'permission-denied',
                            message: t('save.readOnly'),
                            remediations: [],
                            safeSubject: safeFilename(target),
                            documentId,
                            dedupKey: `read-only:${documentId}`,
                        },
                        documentId,
                    );
                    return undefined;
                }
                if (documentId !== activeDocumentId) {
                    await formatBeforeSave(documentId, false);
                    const backgroundState = await appModelAdapter.getState();
                    if (
                        !mounted.current ||
                        operation !== operationRef.current ||
                        backgroundState.snapshot.documents[documentId] === undefined
                    )
                        return undefined;
                    return await finishWrite(
                        kind,
                        documentId,
                        backgroundState.snapshot.documents[documentId]?.contentRevision ?? target?.contentRevision ?? 0,
                        '',
                        safeFilename(target),
                    );
                }
                await formatBeforeSave(documentId, true);
                await appModelAdapter.flushActiveSession?.(documentId);
                const state = await appModelAdapter.getState();
                if (!mounted.current || operation !== operationRef.current) return undefined;
                const latestDocument = state.snapshot.documents[documentId];
                if (latestDocument === undefined) {
                    reportWriteError(
                        {
                            category: 'not-found',
                            message: t('save.activeDocumentChanged'),
                            remediations: [],
                            safeSubject: safeFilename(target),
                            documentId,
                            dedupKey: `active-document:${documentId}`,
                        },
                        documentId,
                        kind,
                    );
                    return undefined;
                }
                const stillActive = state.activeBuffer?.documentId === documentId;
                const revision = stillActive
                    ? (state.activeBuffer?.documentRevision ?? latestDocument.contentRevision ?? 0)
                    : (latestDocument.contentRevision ?? 0);
                return await finishWrite(kind, documentId, revision, '', safeFilename(target), stillActive);
            } catch {
                if (mounted.current && operation === operationRef.current)
                    reportWriteError(
                        undefined,
                        targetDocumentId ?? activeDocument?.documentId ?? activeBuffer?.documentId ?? '',
                        kind,
                    );
                return undefined;
            } finally {
                if (operation === operationRef.current) inFlight.current = false;
            }
        },
        [activeBuffer, activeDocument, documentsById, finishWrite, formatBeforeSave, reportWriteError],
    );

    const saveForClose = useCallback(
        (documentId: string): Promise<CloseSaveOutcome> => {
            if (pendingCloseSave.current !== null || inFlight.current) return Promise.resolve({ status: 'refused' });
            if (promptRef.current.phase !== 'idle') {
                suspendedWrite.current = { prompt: promptRef.current, validationFailed };
                setPrompt({ phase: 'idle' });
                setValidationFailed(false);
            }
            return new Promise((resolve) => {
                const pending = { documentId, resolve };
                pendingCloseSave.current = pending;
                setCloseSavePending(true);
                void beginWrite('save', documentId)
                    .then((result) => {
                        if (pendingCloseSave.current !== pending) return;
                        if (result === undefined) settleCloseSave(documentId, { status: 'refused' });
                        else if (result.status === 'cancelled') settleCloseSave(documentId, { status: 'cancelled' });
                        else if (
                            result.status === 'refused' ||
                            (result.status === 'conflict' && result.conflict === undefined)
                        )
                            settleCloseSave(documentId, { status: 'refused' });
                    })
                    .catch(() => {
                        if (pendingCloseSave.current === pending) settleCloseSave(documentId, { status: 'refused' });
                    });
            });
        },
        [beginWrite, setPrompt, settleCloseSave, validationFailed],
    );

    const decideNormalization = useCallback(
        async (confirm: boolean): Promise<void> => {
            const current = promptRef.current;
            if (current.phase !== 'normalization' || inFlight.current) return;
            const request = current.request;
            if (!confirm) {
                operationRef.current += 1;
                setPrompt({ phase: 'idle' });
                settleCloseSave(request.documentId, { status: 'cancelled' });
                try {
                    await documentWriteAdapter.cancelNormalization(request.documentId, request.decisionToken);
                } catch {
                    reportWriteError(undefined, request.documentId, request.kind);
                }
                return;
            }
            inFlight.current = true;
            const operation = operationRef.current;
            try {
                await finishWrite(
                    request.kind,
                    request.documentId,
                    request.contentRevision,
                    request.decisionToken,
                    request.filename,
                    true,
                );
            } catch {
                if (mounted.current && operation === operationRef.current) {
                    reportWriteError(undefined, request.documentId, request.kind);
                    settleCloseSave(request.documentId, { status: 'refused' });
                }
            } finally {
                if (operation === operationRef.current) inFlight.current = false;
            }
        },
        [finishWrite, reportWriteError, setPrompt, settleCloseSave],
    );

    // A deferred request is rechecked without starting the write it was waiting to authorize.
    const revalidatePrompt = useCallback(async (): Promise<boolean> => {
        const current = promptRef.current;
        if (current.phase === 'idle') return true;
        try {
            const state = await appModelAdapter.getState();
            if (!mounted.current || promptRef.current !== current) return false;
            const document = state.snapshot.documents[current.request.documentId];
            if (document === undefined) {
                setPrompt({ phase: 'idle' });
                settleCloseSave(current.request.documentId, { status: 'disappeared' });
                if (current.phase === 'normalization')
                    await documentWriteAdapter.cancelNormalization(
                        current.request.documentId,
                        current.request.decisionToken,
                    );
                setValidationFailed(false);
                return true;
            }
            if (current.phase === 'normalization') {
                if ((document.contentRevision ?? 0) !== current.request.contentRevision) {
                    setPrompt({ phase: 'idle' });
                    settleCloseSave(current.request.documentId, { status: 'refused' });
                    await documentWriteAdapter.cancelNormalization(
                        current.request.documentId,
                        current.request.decisionToken,
                    );
                }
                setValidationFailed(false);
                return true;
            }
            const result = await documentConflictAdapter.checkExternalChanges(current.request.documentId);
            if (!mounted.current || promptRef.current !== current) return false;
            setValidationFailed(result.error !== undefined);
            if (result.error !== undefined) {
                reportWriteError(result.error, current.request.documentId, current.request.kind);
                return false;
            }
            setPrompt(
                result.preview === undefined
                    ? { phase: 'idle' }
                    : {
                          phase: 'conflict',
                          request: { ...current.request, preview: result.preview },
                      },
            );
            return true;
        } catch {
            if (mounted.current && promptRef.current === current) {
                setValidationFailed(true);
                reportWriteError(undefined, current.request.documentId, current.request.kind);
            }
            return false;
        }
    }, [reportWriteError, setPrompt, settleCloseSave]);

    const decideConflict = useCallback(
        async (decision: ExternalChangeDecision): Promise<void> => {
            const current = promptRef.current;
            if (current.phase !== 'conflict' || inFlight.current) return;
            const request = current.request;
            if (decision === 'keep-mine' && (validationFailed || !isConflictCurrent(request.preview, documentsById)))
                return;
            inFlight.current = true;
            const operation = operationRef.current;
            try {
                if (activeBuffer?.documentId === request.documentId)
                    await appModelAdapter.flushActiveSession?.(request.documentId);
                if (promptRef.current !== current) return;
                const result = await conflicts.execute(decision, request.preview);
                if (!mounted.current || operation !== operationRef.current || promptRef.current !== current) return;
                if (result.error !== undefined) {
                    reportWriteError(result.error, request.documentId, request.kind);
                    if (result.preview !== undefined)
                        setPrompt({ phase: 'conflict', request: { ...request, preview: result.preview } });
                    else settleCloseSave(request.documentId, { status: 'refused' });
                    return;
                }
                if (decision === 'keep-mine' && result.status === 'authorized' && result.decisionToken !== undefined) {
                    setPrompt({ phase: 'idle' });
                    await finishWrite(
                        request.kind,
                        request.documentId,
                        request.preview.contentRevision,
                        result.decisionToken,
                        request.filename,
                        true,
                    );
                } else if (result.status === 'detected' && result.preview !== undefined) {
                    setPrompt({ phase: 'conflict', request: { ...request, preview: result.preview } });
                } else {
                    setPrompt({ phase: 'idle' });
                    settleCloseSave(
                        request.documentId,
                        decision === 'reload' && result.status === 'reloaded' && result.documentRevision !== undefined
                            ? { status: 'reloaded', contentRevision: result.documentRevision }
                            : { status: 'refused' },
                    );
                }
            } catch {
                if (mounted.current && operation === operationRef.current) {
                    reportWriteError(undefined, request.documentId, request.kind);
                    settleCloseSave(request.documentId, { status: 'refused' });
                }
            } finally {
                if (operation === operationRef.current) inFlight.current = false;
            }
        },
        [
            activeBuffer,
            conflicts,
            documentsById,
            finishWrite,
            reportWriteError,
            setPrompt,
            settleCloseSave,
            validationFailed,
        ],
    );

    const dismissWriteFailure = useCallback(
        async (kind?: 'save' | 'save-as', documentId?: string): Promise<void> => {
            const current = promptRef.current;
            if (!validationFailed || current.phase === 'idle') return;
            if (kind !== undefined && kind !== current.request.kind) return;
            if (documentId !== undefined && documentId !== current.request.documentId) return;
            operationRef.current += 1;
            setPrompt({ phase: 'idle' });
            setValidationFailed(false);
            settleCloseSave(current.request.documentId, { status: 'refused' });
            if (current.phase === 'normalization') {
                try {
                    await documentWriteAdapter.cancelNormalization(
                        current.request.documentId,
                        current.request.decisionToken,
                    );
                } catch {
                    reportWriteError(undefined, current.request.documentId);
                }
            }
        },
        [reportWriteError, setPrompt, settleCloseSave, validationFailed],
    );

    const retryWrite = useCallback(
        async (kind: 'save' | 'save-as', documentId?: string): Promise<boolean> => {
            const current = promptRef.current;
            if (current.phase !== 'idle' && validationFailed) {
                if (inFlight.current) return false;
                if (current.request.kind === kind && current.request.documentId === documentId) {
                    inFlight.current = true;
                    const operation = operationRef.current;
                    try {
                        if (activeBuffer?.documentId === documentId)
                            await appModelAdapter.flushActiveSession?.(documentId);
                        return await revalidatePrompt();
                    } catch {
                        reportWriteError(undefined, current.request.documentId, current.request.kind);
                        return false;
                    } finally {
                        if (operation === operationRef.current) inFlight.current = false;
                    }
                }
                await dismissWriteFailure();
            }
            return (await beginWrite(kind, documentId))?.status === 'committed';
        },
        [activeBuffer, beginWrite, dismissWriteFailure, reportWriteError, revalidatePrompt, validationFailed],
    );
    const onSave = useCallback(
        () =>
            validationFailed
                ? retryWrite('save', activeDocument?.documentId ?? activeBuffer?.documentId)
                : beginWrite('save'),
        [activeDocument?.documentId, activeBuffer?.documentId, beginWrite, retryWrite, validationFailed],
    );
    const onSaveAs = useCallback(
        () =>
            validationFailed
                ? retryWrite('save-as', activeDocument?.documentId ?? activeBuffer?.documentId)
                : beginWrite('save-as'),
        [activeDocument?.documentId, activeBuffer?.documentId, beginWrite, retryWrite, validationFailed],
    );
    const conflict: ConflictPresentation | null =
        prompt.phase === 'conflict' && !validationFailed
            ? {
                  id: `write:${prompt.request.kind}:${prompt.request.documentId}`,
                  preview: prompt.request.preview,
                  valid: !validationFailed && isConflictCurrent(prompt.request.preview, documentsById),
                  onDecision: decideConflict,
              }
            : null;
    return {
        active: prompt.phase !== 'idle',
        prompt,
        recoverySurface,
        conflict,
        beginWrite,
        saveForClose,
        notifyInactiveFormatSkipped,
        closeOwnedPrompt: closeSavePending && prompt.phase !== 'idle',
        retryWrite,
        dismissWriteFailure,
        validationFailed,
        onSave,
        onSaveAs,
        decideNormalization,
        revalidatePrompt,
    } as const;
}

export type DocumentWrites = ReturnType<typeof useDocumentWrites>;
