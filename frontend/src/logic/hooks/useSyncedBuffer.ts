import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { appModelAdapter } from '../adapter';
import {
  createLifecycleBarrier,
  type LifecycleCapture,
} from './useLifecycleBarrier';
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
  flushActiveSession?: (
    documentId: string,
    expectedActivationToken?: symbol,
  ) => Promise<void>;
  registerActiveSession?: (session: {
    documentId: string;
    activationToken: symbol;
    flushActiveSession: () => Promise<void>;
  }) => () => void;
  flushBuffer: (documentId: string) => Promise<void>;
  flushDocView: (documentId: string) => Promise<void>;
  updateBuffer: (documentId: string, content: string) => Promise<void>;
  updateDocView: (documentId: string, view: DocViewInput) => Promise<void>;
  updateLocalDocView?: (
    documentId: string,
    view: DocViewInput,
  ) => Promise<void>;
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
): SyncedBufferCallbacks {
  const viewRef = useRef(view);
  const cursorRef = useRef(
    toEditorPosition(view.cursor.line, view.cursor.column),
  );
  const currentDocumentRef = useRef(documentId);
  const activation = useMemo(
    () => ({
      documentId,
      token: Symbol(`editor-activation-${++activationSequence}`),
    }),
    [documentId],
  );
  const contentRef = useRef(initialContent);
  const selectionRef = useRef(view.selection);
  const scrollRef = useRef(view.scroll);
  const [liveCursor, setLiveCursor] = useState<EditorPosition>(() =>
    toEditorPosition(view.cursor.line, view.cursor.column),
  );

  useEffect((): void => {
    viewRef.current = view;
    if (currentDocumentRef.current !== documentId) {
      const cursor = toEditorPosition(view.cursor.line, view.cursor.column);
      currentDocumentRef.current = documentId;
      contentRef.current = initialContent;
      cursorRef.current = cursor;
      selectionRef.current = view.selection;
      scrollRef.current = view.scroll;
      setLiveCursor(cursor);
    }
  }, [documentId, initialContent, view]);

  const lifecycleBarrier = useMemo(
    () =>
      createLifecycleBarrier<string, DocViewInput, symbol>({
        flushBuffer: adapter.flushBuffer,
        flushDocView: adapter.flushDocView,
        queueBuffer: adapter.updateBuffer,
        queueDocView: adapter.updateDocView,
      }),
    [adapter],
  );

  const flushActiveSession = useCallback(
    (
      expectedDocumentId: string,
      expectedActivationToken: symbol,
    ): Promise<LifecycleCapture<string, DocViewInput, symbol>> =>
      lifecycleBarrier.flushActiveSession(
        expectedDocumentId,
        expectedActivationToken,
        (): LifecycleCapture<string, DocViewInput, symbol> => ({
          documentId,
          activationToken: activation.token,
          content: contentRef.current,
          view: toDocViewInput(
            viewRef.current,
            cursorRef.current,
            selectionRef.current,
            scrollRef.current,
          ),
        }),
      ),
    [activation.token, documentId, lifecycleBarrier],
  );

  const updateDocView = useCallback((): void => {
    const update = adapter.updateLocalDocView ?? adapter.updateDocView;
    void update(
      documentId,
      toDocViewInput(
        viewRef.current,
        cursorRef.current,
        selectionRef.current,
        scrollRef.current,
      ),
    );
  }, [adapter, documentId]);

  const onChange = useCallback(
    (content: string): void => {
      contentRef.current = content;
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

  const onEditorScrollChange = useCallback(
    (scrollTop: number): void => {
      scrollRef.current = { ...scrollRef.current, editor: scrollTop };
      updateDocView();
    },
    [updateDocView],
  );

  const onPreviewScrollChange = useCallback(
    (scrollTop: number): void => {
      scrollRef.current = { ...scrollRef.current, preview: scrollTop };
      updateDocView();
    },
    [updateDocView],
  );

  const onBlur = useCallback((): void => {
    void flushActiveSession(documentId, activation.token).catch(
      (): void => undefined,
    );
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
