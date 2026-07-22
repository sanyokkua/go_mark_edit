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

export type EditorHandleSource =
  RefObject<CodeEditorHandle | null> | (() => CodeEditorHandle | null);

function resolveEditor(
  editorSource: EditorHandleSource,
): CodeEditorHandle | null {
  return typeof editorSource === 'function'
    ? editorSource()
    : editorSource.current;
}

export function createDocumentCommands(
  editorSource: EditorHandleSource,
): DocumentCommandAPI {
  return {
    getSelection(): EditorSelection | null {
      return resolveEditor(editorSource)?.getSelection() ?? null;
    },
    replaceRange(range: EditorRange, text: string): void {
      resolveEditor(editorSource)?.replaceRange(range, text);
    },
    replaceAll(text: string): void {
      resolveEditor(editorSource)?.replaceAll(text);
    },
  };
}

export function useDocumentCommands(
  editorSource: EditorHandleSource,
): DocumentCommandAPI {
  return useMemo(
    (): DocumentCommandAPI => createDocumentCommands(editorSource),
    [editorSource],
  );
}
