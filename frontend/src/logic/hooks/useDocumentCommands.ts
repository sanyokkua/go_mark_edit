import { useMemo } from 'react';

import type {
  CodeEditorHandle,
  EditorRange,
  EditorSelection,
} from '../../ui/components/CodeEditor';

export type DocumentCommandResult<T> =
  | { status: 'available'; value: T }
  | { status: 'unavailable' }
  | { status: 'document-mismatch' };

export interface DocumentCommandSession {
  documentId: string;
  handle: CodeEditorHandle;
  token: symbol;
}

export interface DocumentCommandAPI {
  getContent: () => DocumentCommandResult<string>;
  getSelection: () => DocumentCommandResult<EditorSelection | null>;
  replaceRange: (
    range: EditorRange,
    text: string,
  ) => DocumentCommandResult<void>;
  replaceAll: (text: string) => DocumentCommandResult<void>;
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

  if (
    session.documentId !== expectedDocumentId ||
    session.token !== expectedToken
  ) {
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
    getContent(): DocumentCommandResult<string> {
      const session = resolveSession(
        expectedDocumentId,
        expectedToken,
        sessionSource,
      );
      if (session.status !== 'available') {
        return session;
      }

      const content = session.value.getContent();
      return content === null
        ? { status: 'unavailable' }
        : { status: 'available', value: content };
    },
    getSelection(): DocumentCommandResult<EditorSelection | null> {
      const session = resolveSession(
        expectedDocumentId,
        expectedToken,
        sessionSource,
      );
      if (session.status !== 'available') {
        return session;
      }

      if (session.value.getContent() === null) {
        return { status: 'unavailable' };
      }

      return { status: 'available', value: session.value.getSelection() };
    },
    replaceRange(
      range: EditorRange,
      text: string,
    ): DocumentCommandResult<void> {
      const session = resolveSession(
        expectedDocumentId,
        expectedToken,
        sessionSource,
      );
      if (session.status !== 'available') {
        return session;
      }

      return session.value.replaceRange(range, text)
        ? { status: 'available', value: undefined }
        : { status: 'unavailable' };
    },
    replaceAll(text: string): DocumentCommandResult<void> {
      const session = resolveSession(
        expectedDocumentId,
        expectedToken,
        sessionSource,
      );
      if (session.status !== 'available') {
        return session;
      }

      return session.value.replaceAll(text)
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
    (): DocumentCommandAPI =>
      createDocumentCommands(expectedDocumentId, expectedToken, sessionSource),
    [expectedDocumentId, expectedToken, sessionSource],
  );
}
