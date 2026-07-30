import {
  forwardRef,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import type { editor, IPosition, IRange, ISelection } from 'monaco-editor';

import styles from './CodeEditor.module.css';

export interface EditorPosition {
  lineNumber: number;
  column: number;
}

export interface EditorRange {
  start: EditorPosition;
  end: EditorPosition;
}

export type EditorSelection = EditorRange;

export interface CodeEditorHandle {
  getContent(): string | null;
  getSelection(): EditorSelection | null;
  replaceRange(range: EditorRange, text: string): boolean;
  replaceAll(text: string): boolean;
}

export interface CodeEditorProps {
  documentId: string;
  initialValue: string;
  lineNumbers?: 'on' | 'off';
  wordWrap?: 'on' | 'off';
  minimap?: boolean;
  visible?: boolean;
  onChange?: (value: string) => void;
  onBlur?: () => void;
  onCursorPositionChange?: (position: EditorPosition) => void;
  onSelectionChange?: (selection: EditorSelection | null) => void;
  onScrollChange?: (scrollTop: number) => void;
  onEditorMounted?: (editor: editor.IStandaloneCodeEditor) => void;
  onViewStateCaptureReady?: (capture: (() => void) | null) => void;
}

const MonacoEditor = lazy(async () => {
  const [monacoReact, monacoSetup] = await Promise.all([
    import('@monaco-editor/react'),
    import('./monacoSetup'),
  ]);

  monacoReact.loader.config({ monaco: monacoSetup.monaco });

  return { default: monacoReact.default };
});

function toEditorPosition(position: IPosition): EditorPosition {
  return {
    lineNumber: position.lineNumber,
    column: position.column,
  };
}

function toEditorSelection(selection: ISelection): EditorSelection {
  const selectionStart: EditorPosition = {
    lineNumber: selection.selectionStartLineNumber,
    column: selection.selectionStartColumn,
  };
  const selectionEnd: EditorPosition = {
    lineNumber: selection.positionLineNumber,
    column: selection.positionColumn,
  };

  return {
    start: isBeforeOrEqual(selectionStart, selectionEnd)
      ? selectionStart
      : selectionEnd,
    end: isBeforeOrEqual(selectionStart, selectionEnd)
      ? selectionEnd
      : selectionStart,
  };
}

function isBeforeOrEqual(
  first: EditorPosition,
  second: EditorPosition,
): boolean {
  return (
    first.lineNumber < second.lineNumber ||
    (first.lineNumber === second.lineNumber && first.column <= second.column)
  );
}

function toMonacoRange(range: EditorRange): IRange {
  return {
    startLineNumber: range.start.lineNumber,
    startColumn: range.start.column,
    endLineNumber: range.end.lineNumber,
    endColumn: range.end.column,
  };
}

function getEditorFontSize(): number {
  const value = window
    .getComputedStyle(document.documentElement)
    .getPropertyValue('--editor-font-size');
  const fontSize = Number.parseFloat(value);

  return Number.isFinite(fontSize) && fontSize > 0 ? fontSize : 14;
}

function modelPath(documentId: string): string {
  return `inmemory://gomarkedit/${encodeURIComponent(documentId)}.md`;
}

function applyEdit(
  editorInstance: editor.IStandaloneCodeEditor | null,
  range: IRange,
  text: string,
): boolean {
  if (editorInstance === null || editorInstance.getModel() === null) {
    return false;
  }

  editorInstance.pushUndoStop();
  editorInstance.executeEdits('gomarkedit', [
    {
      range,
      text,
      forceMoveMarkers: true,
    },
  ]);
  editorInstance.pushUndoStop();

  return true;
}

const CodeEditor = forwardRef<CodeEditorHandle, CodeEditorProps>(
  function CodeEditor(
    {
      documentId,
      initialValue,
      lineNumbers = 'on',
      wordWrap = 'off',
      minimap = false,
      visible = true,
      onChange,
      onBlur,
      onCursorPositionChange,
      onSelectionChange,
      onScrollChange,
      onEditorMounted,
      onViewStateCaptureReady,
    }: CodeEditorProps,
    ref,
  ): React.JSX.Element {
    const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
    const onChangeRef = useRef(onChange);
    const onBlurRef = useRef(onBlur);
    const onCursorPositionChangeRef = useRef(onCursorPositionChange);
    const onSelectionChangeRef = useRef(onSelectionChange);
    const onScrollChangeRef = useRef(onScrollChange);
    const onEditorMountedRef = useRef(onEditorMounted);
    const onViewStateCaptureReadyRef = useRef(onViewStateCaptureReady);
    const restoreViewStateFrameRef = useRef<number | undefined>(undefined);
    const viewStateRef = useRef<editor.ICodeEditorViewState | null>(null);
    const wasVisibleRef = useRef(visible);

    onChangeRef.current = onChange;
    onBlurRef.current = onBlur;
    onCursorPositionChangeRef.current = onCursorPositionChange;
    onSelectionChangeRef.current = onSelectionChange;
    onScrollChangeRef.current = onScrollChange;
    onEditorMountedRef.current = onEditorMounted;
    onViewStateCaptureReadyRef.current = onViewStateCaptureReady;

    const captureViewState = useCallback((): void => {
      viewStateRef.current = editorRef.current?.saveViewState?.() ?? null;
    }, []);

    useEffect(() => {
      onViewStateCaptureReadyRef.current?.(captureViewState);

      return (): void => {
        onViewStateCaptureReadyRef.current?.(null);
      };
    }, [captureViewState]);

    useEffect(() => {
      let disposeThemeObserver: (() => void) | undefined;
      let disposed = false;

      void import('./monacoSetup').then(({ applyMonacoThemeFromRoot }) => {
        if (!disposed) disposeThemeObserver = applyMonacoThemeFromRoot();
      });

      return (): void => {
        disposed = true;
        disposeThemeObserver?.();
      };
    }, []);

    useEffect(() => {
      const wasVisible = wasVisibleRef.current;
      wasVisibleRef.current = visible;

      if (visible && !wasVisible) {
        editorRef.current?.layout();
        const viewState = viewStateRef.current;

        if (viewState !== null) {
          restoreViewStateFrameRef.current = window.requestAnimationFrame(
            (): void => {
              editorRef.current?.restoreViewState?.(viewState);
              viewStateRef.current = null;
              restoreViewStateFrameRef.current = undefined;
            },
          );
        }
      }

      return (): void => {
        if (restoreViewStateFrameRef.current !== undefined) {
          window.cancelAnimationFrame(restoreViewStateFrameRef.current);
          restoreViewStateFrameRef.current = undefined;
        }
      };
    }, [visible]);

    useImperativeHandle(
      ref,
      (): CodeEditorHandle => ({
        getContent(): string | null {
          return editorRef.current?.getModel()?.getValue() ?? null;
        },
        getSelection(): EditorSelection | null {
          const selection = editorRef.current?.getSelection();

          return selection === null || selection === undefined
            ? null
            : toEditorSelection(selection);
        },
        replaceRange(range: EditorRange, text: string): boolean {
          return applyEdit(editorRef.current, toMonacoRange(range), text);
        },
        replaceAll(text: string): boolean {
          const model = editorRef.current?.getModel();

          if (model === null || model === undefined) {
            return false;
          }

          return applyEdit(editorRef.current, model.getFullModelRange(), text);
        },
      }),
      [],
    );

    const handleMount = (
      editorInstance: editor.IStandaloneCodeEditor,
    ): void => {
      editorRef.current = editorInstance;
      editorInstance.onDidBlurEditorText((): void => {
        onBlurRef.current?.();
      });
      editorInstance.onDidChangeCursorPosition((event): void => {
        onCursorPositionChangeRef.current?.(toEditorPosition(event.position));
      });
      editorInstance.onDidChangeCursorSelection((event): void => {
        onSelectionChangeRef.current?.(toEditorSelection(event.selection));
      });
      if (onScrollChangeRef.current !== undefined) {
        editorInstance.onDidScrollChange((event): void => {
          onScrollChangeRef.current?.(event.scrollTop);
        });
      }
      onEditorMountedRef.current?.(editorInstance);
    };

    return (
      <div className={styles.editor}>
        <Suspense
          fallback={<div aria-busy="true" className={styles.loading} />}
        >
          <MonacoEditor
            key={documentId}
            defaultValue={initialValue}
            language="markdown"
            path={modelPath(documentId)}
            className={styles.editor}
            options={{
              lineNumbers,
              wordWrap,
              minimap: { enabled: minimap },
              fontSize: getEditorFontSize(),
            }}
            onChange={(value: string | undefined): void => {
              onChangeRef.current?.(value ?? '');
            }}
            onMount={handleMount}
          />
        </Suspense>
      </div>
    );
  },
);

CodeEditor.displayName = 'CodeEditor';

export default CodeEditor;
