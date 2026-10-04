import { useCallback, useContext, useEffect, useLayoutEffect, useRef } from 'react';

import { t } from '../i18n';
import type { DocumentCommandAPI } from '../logic/hooks/useDocumentCommands';
import { acquire, type OperationHandle } from '../logic/operations/operationSlot';
import * as problemsSummary from '../logic/operations/problemsSummary';
import { useEditorSettings } from '../logic/settings/editorSettings';
import { store, useAppDispatch, useAppSelector } from '../logic/store';
import { notifyToast } from '../logic/store/notificationsSlice';
import type { TidyPreferences } from '../logic/tidy/prefs';
import type { LintFinding, TidyOutcome } from '../logic/tidy/protocol';
import { runTidy } from '../logic/tidy/runTidy';
import type { EditorMarker } from '../ui/components/CodeEditor';
import { DocumentCommandContext, EditorSessionContext, EditorSessionEpochContext } from '../ui/widgets/editorSession';
import type { TidyCommands } from '../ui/widgets/tidyCommandsContext';

interface ActiveRun {
    handle: OperationHandle;
    documentId: string;
    text: string;
    commands: DocumentCommandAPI;
    externalEpoch: number;
    invalidated: boolean;
}

function normalize(text: string): string {
    return text.replace(/\r\n?/gu, '\n');
}

function tidyPreferences(settings: ReturnType<typeof useEditorSettings>['markdownSettings']): TidyPreferences | null {
    if (
        settings === undefined ||
        !['-', '*', '+'].includes(settings.bulletMarker) ||
        !['_', '*'].includes(settings.emphasisMarker) ||
        !['atx', 'setext'].includes(settings.headingStyle)
    )
        return null;
    return {
        bullet: settings.bulletMarker as TidyPreferences['bullet'],
        emphasis: settings.emphasisMarker as TidyPreferences['emphasis'],
        heading: settings.headingStyle as TidyPreferences['heading'],
    };
}

function markerFor(finding: LintFinding): EditorMarker {
    return {
        startLine: finding.startLine,
        startColumn: finding.startColumn,
        endLine: finding.endLine,
        endColumn: finding.endColumn,
        severity: finding.severity,
        message: `${t(`lint.rule.${finding.rule}.label`)} · ${t(`problems.severity.${finding.severity}`)}\n${t(finding.message.key, finding.message.args)}\n${t(finding.hint)}`,
    };
}

export function useTidyCommands(): TidyCommands {
    const dispatch = useAppDispatch();
    const activeBuffer = useContext(EditorSessionContext);
    const commands = useContext(DocumentCommandContext);
    const externalEpoch = useContext(EditorSessionEpochContext);
    const { markdownSettings } = useEditorSettings();
    const projectedDocumentId = useAppSelector((state) => state.documents.activeDocumentId);
    const capability = useAppSelector((state) =>
        activeBuffer === null ? undefined : state.documents.byId[activeBuffer.documentId]?.capability,
    );
    const current = useRef({
        activeBuffer,
        commands,
        externalEpoch,
        projectedDocumentId,
        capability,
        markdownSettings,
    });
    useLayoutEffect(() => {
        current.current = { activeBuffer, commands, externalEpoch, projectedDocumentId, capability, markdownSettings };
    }, [activeBuffer, commands, externalEpoch, projectedDocumentId, capability, markdownSettings]);
    const running = useRef<ActiveRun | null>(null);
    const previousSession = useRef<{
        documentId: string | null;
        externalEpoch: number;
        commands: DocumentCommandAPI | null;
    } | null>(null);

    useEffect(() => {
        let lastProjectedDocumentId = store.getState().documents.activeDocumentId;
        return store.subscribe(() => {
            const nextProjectedDocumentId = store.getState().documents.activeDocumentId;
            if (nextProjectedDocumentId === lastProjectedDocumentId) return;
            lastProjectedDocumentId = nextProjectedDocumentId;
            if (running.current !== null) running.current.invalidated = true;
            try {
                current.current.commands?.setMarkers([]);
            } catch {
                // Activation may already have disposed the outgoing editor model.
            }
            problemsSummary.clear();
        });
    }, []);

    useEffect(() => {
        const identity = { documentId: activeBuffer?.documentId ?? null, externalEpoch, commands };
        const previous = previousSession.current;
        if (
            previous !== null &&
            (previous.documentId !== identity.documentId ||
                previous.externalEpoch !== identity.externalEpoch ||
                previous.commands !== identity.commands)
        ) {
            if (running.current !== null) running.current.invalidated = true;
            try {
                previous.commands?.setMarkers([]);
            } catch {
                // CodeEditor disposes the outgoing model when its activation ends.
            }
            problemsSummary.clear();
        }
        previousSession.current = identity;
        // Guarded commands can reject clearing after a successor has attached.
    }, [activeBuffer?.documentId, commands, externalEpoch]);

    const showOutcomeNotice = useCallback(
        (kind: 'refused' | 'failed' | 'cancelled' | 'stale', documentId: string): void => {
            dispatch(
                notifyToast({
                    code: `tidy-${kind}`,
                    severity: kind === 'failed' ? 'error' : 'warning',
                    subject: documentId,
                    title: t(`tidy.${kind}.title`),
                    message: t(`tidy.${kind}.message`),
                }),
            );
        },
        [dispatch],
    );

    const run = useCallback<TidyCommands['run']>(
        async (op, options = {}) => {
            const origin = options.origin ?? 'user';
            const state = current.current;
            const documentId = state.activeBuffer?.documentId;
            const selectedCommands = options.commands ?? state.commands;
            const prefs = tidyPreferences(state.markdownSettings);
            if (
                documentId === undefined ||
                (options.documentId !== undefined && options.documentId !== documentId) ||
                state.projectedDocumentId !== documentId ||
                state.capability === undefined ||
                (op !== 'lint' && state.capability !== 'writable') ||
                selectedCommands === null ||
                prefs === null
            )
                return { kind: 'failed' };
            let content: ReturnType<DocumentCommandAPI['getContent']>;
            try {
                content = selectedCommands.getContent();
            } catch {
                if (origin === 'user') showOutcomeNotice('failed', documentId);
                return { kind: 'failed' };
            }
            if (content.status !== 'available') return { kind: 'failed' };
            const text = normalize(content.value);
            const handle = acquire(op, { documentId, size: new Blob([text]).size });
            if (handle === null) return { kind: 'busy' };
            const captured: ActiveRun = {
                handle,
                documentId,
                text,
                commands: selectedCommands,
                externalEpoch: state.externalEpoch,
                invalidated: false,
            };
            running.current = captured;
            try {
                let outcome: TidyOutcome;
                try {
                    outcome = await runTidy(
                        { op, text, prefs },
                        {
                            signal: handle.signal,
                            onProgress: (done, total): void => handle.setProgress(done, total),
                        },
                    );
                } catch {
                    outcome = { kind: 'failed' };
                }
                if (handle.signal.aborted) outcome = { kind: 'cancelled' };
                const latest = current.current;
                const now = selectedCommands.getContent();
                if (
                    captured.invalidated ||
                    latest.activeBuffer?.documentId !== documentId ||
                    latest.projectedDocumentId !== documentId ||
                    latest.commands !== captured.commands ||
                    latest.externalEpoch !== captured.externalEpoch ||
                    now.status !== 'available' ||
                    normalize(now.value) !== text
                )
                    outcome = { kind: 'stale' };
                if (
                    outcome.kind === 'edits' &&
                    outcome.edits.length > 0 &&
                    selectedCommands.applyEdits(outcome.edits).status !== 'available'
                )
                    outcome = { kind: 'failed' };
                if (outcome.kind === 'findings') {
                    const markers = outcome.findings.slice(0, 1000).map(markerFor);
                    if (selectedCommands.setMarkers(markers).status === 'available') {
                        problemsSummary.replace(documentId, outcome.findings, outcome.total, text);
                    } else outcome = { kind: 'failed' };
                }
                if (
                    origin === 'user' &&
                    (outcome.kind === 'refused' ||
                        outcome.kind === 'failed' ||
                        outcome.kind === 'cancelled' ||
                        outcome.kind === 'stale')
                )
                    showOutcomeNotice(outcome.kind, documentId);
                return outcome;
            } catch {
                if (origin === 'user') showOutcomeNotice('failed', documentId);
                return { kind: 'failed' };
            } finally {
                if (running.current === captured) running.current = null;
                handle.release();
            }
        },
        [showOutcomeNotice],
    );

    const cancel = useCallback((): void => {
        running.current?.handle.abort();
    }, []);

    const documentChanged = useCallback((documentId: string, text: string): void => {
        const normalized = normalize(text);
        problemsSummary.markStale(documentId, normalized);
        if (running.current?.documentId === documentId && running.current.text !== normalized) {
            running.current.invalidated = true;
        }
    }, []);

    return { run, cancel, documentChanged };
}
