import { useMemo } from 'react';

import type { CodeEditorHandle, EditorMarker, EditorRange, EditorSelection } from '../../ui/components/CodeEditor';
import type { TextEdit } from '../tidy/protocol';

export type DocumentCommandResult<T> =
    { status: 'available'; value: T } | { status: 'unavailable' } | { status: 'document-mismatch' };

export interface DocumentCommandSession {
    documentId: string;
    handle: CodeEditorHandle;
    token: symbol;
}

export interface DocumentCommandAPI {
    focus: () => DocumentCommandResult<void>;
    getContent: () => DocumentCommandResult<string>;
    getSelection: () => DocumentCommandResult<EditorSelection | null>;
    replaceRange: (range: EditorRange, text: string, selection?: EditorSelection) => DocumentCommandResult<void>;
    replaceAll: (text: string) => DocumentCommandResult<void>;
    applyEdits: (edits: TextEdit[]) => DocumentCommandResult<void>;
    setPosition: (line: number, column: number) => DocumentCommandResult<void>;
    setMarkers: (markers: EditorMarker[]) => DocumentCommandResult<void>;
}

export type EditorSessionSource = () => DocumentCommandSession | null;

function resolveSession(
    expectedDocumentId: string | null,
    expectedToken: symbol | null,
    sessionSource: EditorSessionSource,
): DocumentCommandResult<CodeEditorHandle> {
    const session = sessionSource();

    if (session === null) {
        return { status: 'unavailable' };
    }

    if (session.documentId !== expectedDocumentId || session.token !== expectedToken) {
        return { status: 'document-mismatch' };
    }

    return { status: 'available', value: session.handle };
}

export function createDocumentCommands(
    expectedDocumentId: string | null,
    expectedToken: symbol | null,
    sessionSource: EditorSessionSource,
): DocumentCommandAPI {
    return {
        focus(): DocumentCommandResult<void> {
            const session = resolveSession(expectedDocumentId, expectedToken, sessionSource);
            if (session.status !== 'available') {
                return session;
            }

            return session.value.focus() ? { status: 'available', value: undefined } : { status: 'unavailable' };
        },
        getContent(): DocumentCommandResult<string> {
            const session = resolveSession(expectedDocumentId, expectedToken, sessionSource);
            if (session.status !== 'available') {
                return session;
            }

            const content = session.value.getContent();
            return content === null ? { status: 'unavailable' } : { status: 'available', value: content };
        },
        getSelection(): DocumentCommandResult<EditorSelection | null> {
            const session = resolveSession(expectedDocumentId, expectedToken, sessionSource);
            if (session.status !== 'available') {
                return session;
            }

            if (session.value.getContent() === null) {
                return { status: 'unavailable' };
            }

            return { status: 'available', value: session.value.getSelection() };
        },
        replaceRange(range: EditorRange, text: string, selection?: EditorSelection): DocumentCommandResult<void> {
            const session = resolveSession(expectedDocumentId, expectedToken, sessionSource);
            if (session.status !== 'available') {
                return session;
            }

            return session.value.replaceRange(range, text, selection)
                ? { status: 'available', value: undefined }
                : { status: 'unavailable' };
        },
        replaceAll(text: string): DocumentCommandResult<void> {
            const session = resolveSession(expectedDocumentId, expectedToken, sessionSource);
            if (session.status !== 'available') {
                return session;
            }

            return session.value.replaceAll(text)
                ? { status: 'available', value: undefined }
                : { status: 'unavailable' };
        },
        applyEdits(edits: TextEdit[]): DocumentCommandResult<void> {
            const session = resolveSession(expectedDocumentId, expectedToken, sessionSource);
            if (session.status !== 'available') return session;
            return session.value.applyEdits(edits)
                ? { status: 'available', value: undefined }
                : { status: 'unavailable' };
        },
        setPosition(line: number, column: number): DocumentCommandResult<void> {
            const session = resolveSession(expectedDocumentId, expectedToken, sessionSource);
            if (session.status !== 'available') return session;
            return session.value.setPosition(line, column)
                ? { status: 'available', value: undefined }
                : { status: 'unavailable' };
        },
        setMarkers(markers: EditorMarker[]): DocumentCommandResult<void> {
            const session = resolveSession(expectedDocumentId, expectedToken, sessionSource);
            if (session.status !== 'available') return session;
            return session.value.setMarkers(markers)
                ? { status: 'available', value: undefined }
                : { status: 'unavailable' };
        },
    };
}

export function useDocumentCommands(
    expectedDocumentId: string | null,
    expectedToken: symbol | null,
    sessionSource: EditorSessionSource,
): DocumentCommandAPI {
    return useMemo(
        (): DocumentCommandAPI => createDocumentCommands(expectedDocumentId, expectedToken, sessionSource),
        [expectedDocumentId, expectedToken, sessionSource],
    );
}
