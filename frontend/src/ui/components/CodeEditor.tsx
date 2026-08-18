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
  replaceRange(
    range: EditorRange,
    text: string,
    selection?: EditorSelection,
  ): boolean;
  replaceAll(text: string): boolean;
}

export interface CodeEditorProps {
  documentId: string;
  initialValue: string;
  /** Fresh identity for each activation; omitted only by isolated legacy callers. */
  activationId?: string;
  lineNumbers?: 'on' | 'off';
  wordWrap?: 'on' | 'off';
  fontSize?: 13 | 14 | 16;
  initialSelection?: EditorSelection;
  minimap?: boolean;
  /**
   * Refuse keyboard input, for a document whose capability is not `writable`.
   *
   * FR-FT-006 requires editing to be unavailable for input that opened
   * tolerantly as read-only, and FR-FT-005 makes an over-large file equally
   * unwritable. The registry and dispatcher stop the toolbar and the shortcuts;
   * this is what stops typing. T178.
   */
  readOnly?: boolean;
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

/*
 * T173 kept the parity capture conditions below, against its own expectation,
 * because a measurement contradicted the reasoning for removing them.
 *
 * The argument for deleting them was that they pin pixels nothing compares:
 * FR-FT-055 makes the Monaco editor interior a named reviewed exclusion and
 * `reference-adapter.ts`'s variantRules exclude `monaco` from every variant.
 * That is true of the *region* and false of the *comparison*. Removing the font
 * family, size and line height grew T059's `popup-antialiased-boundary`
 * residual from its measured 181 pixels to 239, and reverting this file alone
 * put it back — the File popup composites over the editor, so its antialiased
 * edge is blended against whatever glyphs are behind it. An excluded region can
 * still be load-bearing for a comparison outside it.
 *
 * So these are capture conditions in the sense FR-FT-054 permits — "hold
 * capture conditions fixed" — and they are held here because Monaco owns its
 * own text raster and there is nowhere else to hold them. What was deleted is
 * the one thing in this file that was not a capture condition: a lint
 * decoration drawn over a hardcoded range of a hardcoded document id, which
 * photographed a finding no lint engine had produced.
 *
 * The archtest allowlist carries this file for that reason. Before removing the
 * allowance, re-measure T059 rather than reasoning from the region exclusion.
 */
function isParityRoute(): boolean {
  return (
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('parity-case')
  );
}

function modelPath(documentId: string, activationId?: string): string {
  const activationSuffix =
    activationId === undefined ? '' : `/${encodeURIComponent(activationId)}`;
  return `inmemory://gomarkedit/${encodeURIComponent(documentId)}${activationSuffix}.md`;
}

function applyEdit(
  editorInstance: editor.IStandaloneCodeEditor | null,
  range: IRange,
  text: string,
  selection?: EditorSelection,
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
  if (selection !== undefined) {
    editorInstance.setSelection(toMonacoRange(selection));
  }
  editorInstance.pushUndoStop();

  return true;
}

const CodeEditor = forwardRef<CodeEditorHandle, CodeEditorProps>(
  function CodeEditor(
    {
      documentId,
      initialValue,
      activationId,
      lineNumbers = 'on',
      wordWrap = 'off',
      fontSize,
      initialSelection,
      minimap = false,
      readOnly = false,
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
    const parityRoute = isParityRoute();
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

    useEffect((): (() => void) => {
      return (): void => {
        const model = editorRef.current?.getModel();
        if (typeof model?.dispose === 'function') {
          model.dispose();
        }
        if (typeof editorRef.current?.dispose === 'function') {
          editorRef.current.dispose();
        }
        editorRef.current = null;
      };
    }, [activationId, documentId]);

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

    useEffect((): void => {
      editorRef.current?.updateOptions?.({
        lineNumbers,
        wordWrap,
        ...(fontSize === undefined ? {} : { fontSize }),
      });
    }, [fontSize, lineNumbers, wordWrap]);

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
        replaceRange(
          range: EditorRange,
          text: string,
          selection?: EditorSelection,
        ): boolean {
          return applyEdit(
            editorRef.current,
            toMonacoRange(range),
            text,
            selection,
          );
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
      if (initialSelection !== undefined) {
        editorInstance.setSelection(toMonacoRange(initialSelection));
      }
      if (onScrollChangeRef.current !== undefined) {
        editorInstance.onDidScrollChange((event): void => {
          onScrollChangeRef.current?.(event.scrollTop);
        });
      }
      onEditorMountedRef.current?.(editorInstance);
    };

    return (
      <div
        className={styles.editor}
        data-editor-surface
        data-parity-route={parityRoute ? 'true' : undefined}
      >
        <Suspense
          fallback={<div aria-busy="true" className={styles.loading} />}
        >
          <MonacoEditor
            key={`${documentId}:${activationId ?? 'legacy'}`}
            defaultValue={initialValue}
            language="markdown"
            path={modelPath(documentId, activationId)}
            className={styles.editor}
            options={{
              lineNumbers,
              lineNumbersMinChars: 3,
              wordWrap,
              minimap: { enabled: minimap },
              readOnly,
              fontFamily: parityRoute
                ? '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace'
                : undefined,
              fontSize: parityRoute ? 13 : (fontSize ?? getEditorFontSize()),
              lineHeight: parityRoute ? 23.4 : undefined,
              padding: { top: 12, bottom: 12 },
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
