import { useCallback, useEffect, useRef, useState } from 'react';

import { appModelAdapter } from '../adapter';
import type {
  DocViewInput,
  DocumentView,
  SelectionRange,
} from '../store/appModelTypes';
import type {
  EditorPosition,
  EditorSelection,
} from '../../ui/components/CodeEditor';

export interface EditorSynchronizationAdapter {
  flushBuffer: (documentId: string) => Promise<void>;
  flushDocView: (documentId: string) => Promise<void>;
  updateBuffer: (documentId: string, content: string) => Promise<void>;
  updateDocView: (documentId: string, view: DocViewInput) => Promise<void>;
}

export interface SyncedBufferCallbacks {
  liveCursor: EditorPosition;
  onBlur: () => void;
  onChange: (content: string) => void;
  onCursorPositionChange: (position: EditorPosition) => void;
  onSelectionChange: (selection: EditorSelection | null) => void;
}

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
): DocViewInput {
  return {
    editorVisible: view.editorVisible,
    previewVisible: view.previewVisible,
    cursor: { line: cursor.lineNumber, column: cursor.column },
    selection,
    scroll: { ...view.scroll },
  };
}

export function useSyncedBuffer(
  documentId: string,
  view: DocumentView,
  adapter: EditorSynchronizationAdapter = appModelAdapter,
): SyncedBufferCallbacks {
  const viewRef = useRef(view);
  const cursorRef = useRef(
    toEditorPosition(view.cursor.line, view.cursor.column),
  );
  const currentDocumentRef = useRef(documentId);
  const selectionRef = useRef(view.selection);
  const [liveCursor, setLiveCursor] = useState<EditorPosition>(() =>
    toEditorPosition(view.cursor.line, view.cursor.column),
  );

  useEffect((): void => {
    viewRef.current = view;
    if (currentDocumentRef.current !== documentId) {
      const cursor = toEditorPosition(view.cursor.line, view.cursor.column);
      currentDocumentRef.current = documentId;
      cursorRef.current = cursor;
      selectionRef.current = view.selection;
      setLiveCursor(cursor);
    }
  }, [documentId, view]);

  const updateDocView = useCallback((): void => {
    void adapter.updateDocView(
      documentId,
      toDocViewInput(viewRef.current, cursorRef.current, selectionRef.current),
    );
  }, [adapter, documentId]);

  const onChange = useCallback(
    (content: string): void => {
      void adapter.updateBuffer(documentId, content);
    },
    [adapter, documentId],
  );

  const onCursorPositionChange = useCallback(
    (position: EditorPosition): void => {
      cursorRef.current = position;
      setLiveCursor(position);
      updateDocView();
    },
    [updateDocView],
  );

  const onSelectionChange = useCallback(
    (selection: EditorSelection | null): void => {
      if (selection === null) {
        return;
      }
      selectionRef.current = toSelectionRange(selection);
      updateDocView();
    },
    [updateDocView],
  );

  const onBlur = useCallback((): void => {
    void Promise.all([
      adapter.flushBuffer(documentId),
      adapter.flushDocView(documentId),
    ]).catch((): void => undefined);
  }, [adapter, documentId]);

  return {
    liveCursor,
    onBlur,
    onChange,
    onCursorPositionChange,
    onSelectionChange,
  };
}
