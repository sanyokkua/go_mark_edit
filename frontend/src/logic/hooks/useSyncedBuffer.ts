import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { appModelAdapter, type SupersededBuffer } from '../adapter';
import { createLifecycleBarrier, type LifecycleCapture } from './useLifecycleBarrier';
import type { DocViewInput, DocumentView, SelectionRange } from '../store/appModelTypes';
import type { EditorPosition, EditorSelection } from '../../ui/components/CodeEditor';

export interface EditorSynchronizationAdapter {
    flushActiveSession?: (documentId: string, expectedActivationToken?: symbol) => Promise<void>;
    registerActiveSession?: (session: {
        documentId: string;
        activationToken: symbol;
        flushActiveSession: () => Promise<void>;
    }) => () => void;
    flushBuffer: (documentId: string) => Promise<void>;
    flushDocView: (documentId: string) => Promise<void>;
    updateBuffer: (documentId: string, content: string, baseRevision: number) => Promise<void>;
    updateDocView: (documentId: string, view: DocViewInput) => Promise<void>;
    updateLocalDocView?: (documentId: string, view: DocViewInput) => Promise<void>;
    cancelPendingSession?: (documentId: string) => void;
    subscribeSupersededBuffers?: (listener: (buffer: SupersededBuffer) => void) => () => void;
}

export interface SyncedBufferCallbacks {
    activationToken: symbol;
    activationId: string;
    flushActiveSession: (
        expectedDocumentId: string,
        expectedActivationToken: symbol,
    ) => Promise<LifecycleCapture<string, DocViewInput, symbol>>;
    liveCursor: EditorPosition;
    onBlur: () => void;
    onChange: (content: string) => void;
    onCursorPositionChange: (position: EditorPosition) => void;
    onEditorScrollChange: (scrollTop: number) => void;
    onPreviewScrollChange: (scrollTop: number) => void;
    onSelectionChange: (selection: EditorSelection | null) => void;
}

let activationSequence = 0;

function toSelectionRange(selection: EditorSelection): SelectionRange {
    return {
        start: {
            line: selection.start.lineNumber,
            column: selection.start.column,
        },
        end: {
            line: selection.end.lineNumber,
            column: selection.end.column,
        },
    };
}

function toEditorPosition(line: number, column: number): EditorPosition {
    return { lineNumber: line, column };
}

function toDocViewInput(
    view: DocumentView,
    cursor: EditorPosition,
    selection: SelectionRange,
    scroll: DocumentView['scroll'],
): DocViewInput {
    return {
        editorVisible: view.editorVisible,
        previewVisible: view.previewVisible,
        ...(view.splitRatio === undefined ? {} : { splitRatio: view.splitRatio }),
        cursor: { line: cursor.lineNumber, column: cursor.column },
        selection,
        scroll: { ...scroll },
    };
}

export function useSyncedBuffer(
    documentId: string,
    view: DocumentView,
    adapter: EditorSynchronizationAdapter = appModelAdapter,
    initialContent = '',
    /*
     * Advances only when the document's text is replaced by something other than
     * the editor — today that is an external reload. It restarts the editor
     * session, which is the only way `initialContent` reaches Monaco: `CodeEditor`
     * seeds it as `defaultValue` under `key={documentId}:{activationId}`.
     *
     * Deliberately not the content revision. Every keystroke bumps that, so
     * keying the session on it would remount Monaco per character and throw away
     * undo history and cursor position.
     */
    externalEpoch = 0,
    /*
     * The document revision this session's `initialContent` was installed at.
     * Every buffer update carries it so the backend can refuse an edit typed
     * against text that a reload has since replaced, even when that edit was
     * already on its way when the reload landed.
     */
    baseRevision: number,
): SyncedBufferCallbacks {
    const viewRef = useRef(view);
    const cursorRef = useRef(toEditorPosition(view.cursor.line, view.cursor.column));
    const activation = useMemo(
        () => ({
            documentId,
            // The epoch is part of the identity, not just a cache key: naming it
            // here makes the dependency real rather than one the linter has to be
            // told to keep, and a session symbol now says which reload produced it.
            token: Symbol(`editor-activation-${++activationSequence}-external-${externalEpoch}`),
        }),
        [documentId, externalEpoch],
    );
    const currentActivationRef = useRef(activation.token);
    const contentRef = useRef(initialContent);
    const selectionRef = useRef(view.selection);
    const scrollRef = useRef(view.scroll);
    const sessionActiveRef = useRef(true);
    const [rebase, setRebase] = useState<{ token: symbol; from: number; to: number } | null>(null);
    const [liveCursor, setLiveCursor] = useState<EditorPosition>(() =>
        toEditorPosition(view.cursor.line, view.cursor.column),
    );

    /*
     * The session refs belong to one activation. The editor surface outlives a
     * document switch, and the outgoing Monaco instance can report a blur while
     * React commits the incoming document, before any passive effect runs. Every
     * callback therefore adopts its own render's document first, so it never
     * captures the outgoing document's text or caret under the incoming identity.
     */
    const adoptDocument = useCallback((): void => {
        if (currentActivationRef.current === activation.token) return;
        const cursor = toEditorPosition(view.cursor.line, view.cursor.column);
        currentActivationRef.current = activation.token;
        viewRef.current = view;
        contentRef.current = initialContent;
        cursorRef.current = cursor;
        selectionRef.current = view.selection;
        scrollRef.current = view.scroll;
        setLiveCursor(cursor);
    }, [activation.token, initialContent, view]);

    useEffect((): void => {
        viewRef.current = view;
        adoptDocument();
    }, [adoptDocument, view]);

    /*
     * Ending a session drops its unsent edits. That includes a session ended by
     * an external replacement: an edit typed before a reload describes the text
     * the reload discarded, and sending it afterwards would undo the reload.
     */
    useEffect((): (() => void) => {
        sessionActiveRef.current = true;
        return (): void => {
            sessionActiveRef.current = false;
            adapter.cancelPendingSession?.(documentId);
        };
    }, [adapter, documentId, externalEpoch]);

    /*
     * The base this session's updates carry: the installed revision, or the
     * revision the backend named when it refused an update of this session as
     * superseded.
     */
    const currentBase =
        rebase !== null && rebase.token === activation.token && rebase.from === baseRevision ? rebase.to : baseRevision;

    /*
     * A superseded update of the live session means its base is stale while the
     * editor still shows the user's text. The session keeps that text, adopts
     * the current revision and resends it, so the editor and the backend agree.
     * A session already ended by the reload ignores the report: the reloaded
     * text replaced it.
     */
    useEffect(
        (): (() => void) | undefined =>
            adapter.subscribeSupersededBuffers?.((buffer): void => {
                if (
                    buffer.documentId !== documentId ||
                    !sessionActiveRef.current ||
                    currentActivationRef.current !== activation.token ||
                    buffer.baseRevision !== currentBase
                )
                    return;
                setRebase({ token: activation.token, from: baseRevision, to: buffer.currentRevision });
                void adapter.updateBuffer(documentId, contentRef.current, buffer.currentRevision);
            }),
        [activation.token, adapter, baseRevision, currentBase, documentId],
    );

    const lifecycleBarrier = useMemo(
        () =>
            createLifecycleBarrier<string, DocViewInput, symbol>({
                flushBuffer: adapter.flushBuffer,
                flushDocView: adapter.flushDocView,
                queueBuffer: (documentId: string, content: string): Promise<void> =>
                    adapter.updateBuffer(documentId, content, currentBase),
                queueDocView: adapter.updateDocView,
            }),
        [adapter, currentBase],
    );

    const flushActiveSession = useCallback(
        (
            expectedDocumentId: string,
            expectedActivationToken: symbol,
        ): Promise<LifecycleCapture<string, DocViewInput, symbol>> =>
            lifecycleBarrier.flushActiveSession(
                expectedDocumentId,
                expectedActivationToken,
                (): LifecycleCapture<string, DocViewInput, symbol> => {
                    adoptDocument();
                    return {
                        documentId,
                        activationToken: activation.token,
                        content: contentRef.current,
                        view: toDocViewInput(
                            viewRef.current,
                            cursorRef.current,
                            selectionRef.current,
                            scrollRef.current,
                        ),
                    };
                },
            ),
        [activation.token, adoptDocument, documentId, lifecycleBarrier],
    );

    const updateDocView = useCallback((): void => {
        if (!sessionActiveRef.current) return;
        adoptDocument();
        const update = adapter.updateLocalDocView ?? adapter.updateDocView;
        void update(
            documentId,
            toDocViewInput(viewRef.current, cursorRef.current, selectionRef.current, scrollRef.current),
        );
    }, [adapter, adoptDocument, documentId]);

    const onChange = useCallback(
        (content: string): void => {
            if (!sessionActiveRef.current) return;
            adoptDocument();
            contentRef.current = content;
            void adapter.updateBuffer(documentId, content, currentBase);
        },
        [adapter, adoptDocument, currentBase, documentId],
    );

    const onCursorPositionChange = useCallback(
        (position: EditorPosition): void => {
            adoptDocument();
            cursorRef.current = position;
            setLiveCursor(position);
            updateDocView();
        },
        [adoptDocument, updateDocView],
    );

    const onSelectionChange = useCallback(
        (selection: EditorSelection | null): void => {
            if (selection === null) {
                return;
            }
            adoptDocument();
            selectionRef.current = toSelectionRange(selection);
            updateDocView();
        },
        [adoptDocument, updateDocView],
    );

    const onEditorScrollChange = useCallback(
        (scrollTop: number): void => {
            adoptDocument();
            scrollRef.current = { ...scrollRef.current, editor: scrollTop };
            updateDocView();
        },
        [adoptDocument, updateDocView],
    );

    const onPreviewScrollChange = useCallback(
        (scrollTop: number): void => {
            adoptDocument();
            scrollRef.current = { ...scrollRef.current, preview: scrollTop };
            updateDocView();
        },
        [adoptDocument, updateDocView],
    );

    const onBlur = useCallback((): void => {
        if (!sessionActiveRef.current) return;
        void flushActiveSession(documentId, activation.token).catch((): void => undefined);
    }, [activation.token, documentId, flushActiveSession]);

    return {
        activationToken: activation.token,
        activationId: String(activation.token),
        flushActiveSession,
        liveCursor,
        onBlur,
        onChange,
        onCursorPositionChange,
        onEditorScrollChange,
        onPreviewScrollChange,
        onSelectionChange,
    };
}
