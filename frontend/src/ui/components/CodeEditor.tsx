import { forwardRef, lazy, Suspense, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import type { editor, IDisposable, IPosition, IRange, ISelection } from 'monaco-editor';

import type { EditorScrollPort, ScrollGeometryChange } from '../../logic/scrollSync/scrollSyncTypes';
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
    focus(): boolean;
    getContent(): string | null;
    getSelection(): EditorSelection | null;
    replaceRange(range: EditorRange, text: string, selection?: EditorSelection): boolean;
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
     * Editing is unavailable for input that opened tolerantly as read-only, and
     * an over-large file is equally unwritable. The registry and dispatcher stop
     * the toolbar and shortcuts; this prop is what stops typing.
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
    /**
     * Receives each mounted Monaco editor's scroll port once, and `null` when
     * that editor's activation ends: a new activation identity or document, or
     * this component unmounting.
     *
     * The withdrawal is not an ordering guarantee — Monaco may already have
     * disposed the editor underneath it — and a withdrawn port is inert rather
     * than live: every call is ignored and every read returns 0. A consumer
     * therefore releases whatever it built on the port when it sees `null`,
     * without reaching back through the port to do it.
     */
    onScrollPortReady?: (port: EditorScrollPort | null) => void;
}

const MonacoEditor = lazy(async () => {
    const [monacoReact, monacoSetup] = await Promise.all([import('@monaco-editor/react'), import('./monacoSetup')]);

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
        start: isBeforeOrEqual(selectionStart, selectionEnd) ? selectionStart : selectionEnd,
        end: isBeforeOrEqual(selectionStart, selectionEnd) ? selectionEnd : selectionStart,
    };
}

function isBeforeOrEqual(first: EditorPosition, second: EditorPosition): boolean {
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
    const value = window.getComputedStyle(document.documentElement).getPropertyValue('--editor-font-size');
    const fontSize = Number.parseFloat(value);

    return Number.isFinite(fontSize) && fontSize > 0 ? fontSize : 14;
}

function modelPath(documentId: string, activationId?: string): string {
    const activationSuffix = activationId === undefined ? '' : `/${encodeURIComponent(activationId)}`;
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

/** The editor's padding in pixels; Monaco's line offsets include the top padding but not the bottom one. */
const EDITOR_PADDING = { top: 12, bottom: 12 } as const;

/**
 * Builds the scroll port of one Monaco editor instance.
 *
 * Once `isMounted` reports that the instance is no longer the mounted editor,
 * every call is ignored and every read returns 0.
 */
function createEditorScrollPort(
    editorInstance: editor.IStandaloneCodeEditor,
    isMounted: () => boolean,
): EditorScrollPort {
    const read = (measure: () => number): number => (isMounted() ? measure() : 0);
    const subscribe = (listen: () => IDisposable[]): (() => void) => {
        if (!isMounted()) {
            return (): void => undefined;
        }
        const subscriptions = listen();

        return (): void => {
            subscriptions.forEach((subscription): void => {
                subscription.dispose();
            });
        };
    };
    const lineCount = (): number => editorInstance.getModel()?.getLineCount() ?? 0;

    return {
        getScrollTop: (): number => read(() => editorInstance.getScrollTop()),
        setScrollTop: (scrollTop: number): void => {
            if (isMounted()) {
                editorInstance.setScrollTop(scrollTop);
            }
        },
        getViewportHeight: (): number => read(() => editorInstance.getLayoutInfo().height),
        getLineCount: (): number => read(lineCount),
        getLineTop: (lineNumber: number): number => read(() => editorInstance.getTopForLineNumber(lineNumber)),
        getDocumentBottom: (): number =>
            read(() => editorInstance.getBottomForLineNumber(lineCount()) + EDITOR_PADDING.bottom),
        onScroll: (listener: (scrollTop: number) => void): (() => void) =>
            subscribe(() => [
                editorInstance.onDidScrollChange((event): void => {
                    if (event.scrollTopChanged) {
                        // Read at delivery, so a listener always hears where the pane is now.
                        listener(editorInstance.getScrollTop());
                    }
                }),
            ]),
        onGeometryChange: (listener: (change: ScrollGeometryChange) => void): (() => void) => {
            const report =
                (change: ScrollGeometryChange): (() => void) =>
                (): void => {
                    listener(change);
                };

            return subscribe(() => [
                editorInstance.onDidContentSizeChange(report('content')),
                editorInstance.onDidChangeModelContent(report('content')),
                editorInstance.onDidLayoutChange(report('layout')),
                editorInstance.onDidChangeConfiguration(report('layout')),
                editorInstance.onDidChangeHiddenAreas(report('layout')),
            ]);
        },
    };
}

const CodeEditor = forwardRef<CodeEditorHandle, CodeEditorProps>(function CodeEditor(
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
        onScrollPortReady,
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
    const onScrollPortReadyRef = useRef(onScrollPortReady);
    /** The Monaco editor that owns the scroll port currently published through `onScrollPortReady`. */
    const scrollPortEditorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
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
    onScrollPortReadyRef.current = onScrollPortReady;

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
            if (scrollPortEditorRef.current !== null) {
                scrollPortEditorRef.current = null;
                onScrollPortReadyRef.current?.(null);
            }
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
                restoreViewStateFrameRef.current = window.requestAnimationFrame((): void => {
                    editorRef.current?.restoreViewState?.(viewState);
                    viewStateRef.current = null;
                    restoreViewStateFrameRef.current = undefined;
                });
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
            focus(): boolean {
                if (editorRef.current === null) return false;
                editorRef.current.focus();
                return true;
            },
            getContent(): string | null {
                return editorRef.current?.getModel()?.getValue() ?? null;
            },
            getSelection(): EditorSelection | null {
                const selection = editorRef.current?.getSelection();

                return selection === null || selection === undefined ? null : toEditorSelection(selection);
            },
            replaceRange(range: EditorRange, text: string, selection?: EditorSelection): boolean {
                return applyEdit(editorRef.current, toMonacoRange(range), text, selection);
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

    const handleMount = (editorInstance: editor.IStandaloneCodeEditor): void => {
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
        if (scrollPortEditorRef.current !== editorInstance) {
            scrollPortEditorRef.current = editorInstance;
            onScrollPortReadyRef.current?.(
                createEditorScrollPort(editorInstance, (): boolean => editorRef.current === editorInstance),
            );
        }
        onEditorMountedRef.current?.(editorInstance);
    };

    return (
        <div className={styles.editor} data-editor-surface>
            <Suspense fallback={<div aria-busy="true" className={styles.loading} />}>
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
                        fontSize: fontSize ?? getEditorFontSize(),
                        padding: EDITOR_PADDING,
                    }}
                    onChange={(value: string | undefined): void => {
                        onChangeRef.current?.(value ?? '');
                    }}
                    onMount={handleMount}
                />
            </Suspense>
        </div>
    );
});

CodeEditor.displayName = 'CodeEditor';

export default CodeEditor;
