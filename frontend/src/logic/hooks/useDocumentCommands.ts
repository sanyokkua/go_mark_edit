import { useMemo, type RefObject } from 'react';

import type {
  CodeEditorHandle,
  EditorRange,
  EditorSelection,
} from '../../ui/components/CodeEditor';

export interface DocumentCommandAPI {
  getSelection: () => EditorSelection | null;
  replaceRange: (range: EditorRange, text: string) => void;
  replaceAll: (text: string) => void;
}

export function createDocumentCommands(
  editorRef: RefObject<CodeEditorHandle | null>,
): DocumentCommandAPI {
  return {
    getSelection(): EditorSelection | null {
      return editorRef.current?.getSelection() ?? null;
    },
    replaceRange(range: EditorRange, text: string): void {
      editorRef.current?.replaceRange(range, text);
    },
    replaceAll(text: string): void {
      editorRef.current?.replaceAll(text);
    },
  };
}

export function useDocumentCommands(
  editorRef: RefObject<CodeEditorHandle | null>,
): DocumentCommandAPI {
  return useMemo(
    (): DocumentCommandAPI => createDocumentCommands(editorRef),
    [editorRef],
  );
}
