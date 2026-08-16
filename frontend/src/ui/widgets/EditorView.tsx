import {
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';

import CodeEditor from '../components/CodeEditor';
import type { EditorPosition } from '../components/CodeEditor';
import { appModelAdapter } from '../../logic/adapter';
import {
  type LivePreviewAdapter,
  type LivePreviewSnapshot,
  useLivePreviewSnapshot,
} from '../../logic/hooks/useLivePreview';
import { dispatchAction } from '../../logic/actions/actionDispatcher';
import {
  type EditorSynchronizationAdapter,
  useSyncedBuffer,
} from '../../logic/hooks/useSyncedBuffer';
import { useAppDispatch, useAppSelector } from '../../logic/store';
import { setViewArrangement } from '../../logic/store/docViewCommands';
import type {
  ActiveBuffer,
  ClosePlanKind,
  DocumentTransitionResult,
  DocumentView,
  TabTransitionResult,
  ViewArrangement,
} from '../../logic/store/appModelTypes';
import {
  EditorSessionContext,
  useEditorSessionAttachment,
} from './editorSession';
import { useMinimumWindow } from './minimumWindow';
import PreviewPane from './PreviewPane';
import EditorChrome from './EditorChrome';
import type { DocumentTabsProps } from './DocumentTabs';
import { EDITOR_TABPANEL_ID, tabElementId } from './editorTabPanel';
import EditorContextMenu from './EditorContextMenu';
import styles from './EditorView.module.css';
import { t } from '../../i18n';
import { useEditorSettings } from '../../logic/settings/editorSettings';

function fallbackView(): DocumentView {
  return {
    arrangement: 'editor',
    editorVisible: true,
    previewVisible: false,
    cursor: { line: 1, column: 1 },
    selection: {
      start: { line: 1, column: 1 },
      end: { line: 1, column: 1 },
    },
    scroll: { editor: 0, preview: 0 },
  };
}

interface ActiveEditorProps {
  adapter: EditorSynchronizationAdapter;
  activeBuffer: ActiveBuffer;
  onLiveCursorChange: (cursor: EditorPosition) => void;
  onPreviewScrollHandler: (
    handler: ((scrollTop: number) => void) | null,
  ) => void;
  visible: boolean;
  view: DocumentView;
}

interface ActiveEditorHandle {
  captureViewState(): void;
}

export interface EditorViewProps {
  adapter?: EditorViewAdapter;
  tabAdapter?: DocumentTabsProps['adapter'];
  onNewDocument?: (expectedTabSetRevision: number) => Promise<unknown>;
  onActivateDocument?: (
    documentId: string,
    expectedTabSetRevision: number,
  ) => Promise<DocumentTransitionResult>;
  onCloseDocument?: (
    documentId: string,
    expectedTabSetRevision: number,
    kind?: ClosePlanKind,
    targetDocumentIds?: string[],
  ) => Promise<TabTransitionResult>;
  onLiveCursorChange?: (cursor: EditorPosition) => void;
}

export interface EditorViewAdapter
  extends EditorSynchronizationAdapter, LivePreviewAdapter {}

const ActiveEditor = forwardRef<ActiveEditorHandle, ActiveEditorProps>(
  function ActiveEditor(
    {
      adapter,
      activeBuffer,
      onLiveCursorChange,
      onPreviewScrollHandler,
      visible,
      view,
    }: ActiveEditorProps,
    ref,
  ): React.JSX.Element {
    const editorSettings = useEditorSettings().settings;
    const viewStateCaptureRef = useRef<(() => void) | null>(null);
    const attachEditor = useEditorSessionAttachment();
    const synchronizedBuffer = useSyncedBuffer(
      activeBuffer.documentId,
      view,
      adapter,
      activeBuffer.content,
    );
    const activationToken = synchronizedBuffer.activationToken;
    const flushSession = synchronizedBuffer.flushActiveSession;
    const attachCurrentEditor = useCallback(
      (editor: Parameters<typeof attachEditor>[1]): void => {
        attachEditor(
          activeBuffer.documentId,
          editor,
          synchronizedBuffer.activationToken,
        );
      },
      [
        activeBuffer.documentId,
        attachEditor,
        synchronizedBuffer.activationToken,
      ],
    );
    useEffect((): (() => void) | undefined => {
      if (adapter.registerActiveSession === undefined) {
        return undefined;
      }
      return adapter.registerActiveSession({
        documentId: activeBuffer.documentId,
        activationToken,
        flushActiveSession: async (): Promise<void> => {
          await flushSession(activeBuffer.documentId, activationToken);
        },
      });
    }, [adapter, activeBuffer.documentId, activationToken, flushSession]);
    const synchronizeMountedEditorTheme = useCallback((): void => {
      void import('../components/monacoSetup').then(
        ({ applyMonacoThemeFromRoot }): void => {
          // Monaco can restore its default theme while creating the editor,
          // after CodeEditor installed the root observer. Reapply once at the
          // mount boundary; CodeEditor's observer owns later root changes.
          applyMonacoThemeFromRoot()();
        },
      );
    }, []);

    useEffect((): void => {
      onLiveCursorChange(synchronizedBuffer.liveCursor);
    }, [onLiveCursorChange, synchronizedBuffer.liveCursor]);

    useEffect((): (() => void) => {
      onPreviewScrollHandler(synchronizedBuffer.onPreviewScrollChange);

      return (): void => {
        onPreviewScrollHandler(null);
      };
    }, [onPreviewScrollHandler, synchronizedBuffer.onPreviewScrollChange]);

    useImperativeHandle(
      ref,
      (): ActiveEditorHandle => ({
        captureViewState(): void {
          viewStateCaptureRef.current?.();
        },
      }),
      [],
    );

    return (
      <CodeEditor
        ref={attachCurrentEditor}
        documentId={activeBuffer.documentId}
        initialValue={activeBuffer.content}
        activationId={synchronizedBuffer.activationId}
        fontSize={editorSettings.fontSize as 13 | 14 | 16}
        lineNumbers={editorSettings.lineNumbers ? 'on' : 'off'}
        wordWrap={editorSettings.wordWrap ? 'on' : 'off'}
        initialSelection={{
          start: {
            lineNumber: view.selection.start.line,
            column: view.selection.start.column,
          },
          end: {
            lineNumber: view.selection.end.line,
            column: view.selection.end.column,
          },
        }}
        visible={visible}
        onViewStateCaptureReady={(capture: (() => void) | null): void => {
          viewStateCaptureRef.current = capture;
        }}
        onBlur={synchronizedBuffer.onBlur}
        onChange={synchronizedBuffer.onChange}
        onCursorPositionChange={synchronizedBuffer.onCursorPositionChange}
        onScrollChange={synchronizedBuffer.onEditorScrollChange}
        onSelectionChange={synchronizedBuffer.onSelectionChange}
        onEditorMounted={synchronizeMountedEditorTheme}
      />
    );
  },
);

interface LivePreviewProps {
  activeBuffer: ActiveBuffer;
  adapter: LivePreviewAdapter;
  onScrollChange: (scrollTop: number) => void;
  visible: boolean;
}

function parityPreviewRefreshMode(): 'refreshing' | 'failed' | undefined {
  if (typeof window === 'undefined') return undefined;
  const key = new URLSearchParams(window.location.search).get('parity-case');
  if (key === null) return undefined;
  if (key.startsWith('state:preview-refreshing:')) return 'refreshing';
  if (key.startsWith('state:preview-refresh-failed:')) return 'failed';
  return undefined;
}

const LivePreview: React.FC<LivePreviewProps> = ({
  activeBuffer,
  adapter,
  onScrollChange,
  visible,
}: LivePreviewProps): React.JSX.Element | null => {
  const accepted = useLivePreviewSnapshot(activeBuffer, adapter);

  if (!visible) {
    return null;
  }

  return (
    <section aria-label={t('editor.previewPane')} className={styles.pane}>
      <header className={styles.paneHeader}>
        <span className={styles.paneLive}>{t('editor.preview.live')}</span>
        <span className={styles.paneMeta}>{t('editor.preview.flavour')}</span>
      </header>
      <div
        className={styles.previewContent}
        onScroll={(event): void => {
          onScrollChange(event.currentTarget.scrollTop);
        }}
      >
        <PreviewPane
          ariaLabel={null}
          accepted={accepted}
          onRefresh={async () => {
            const parityRefreshMode = parityPreviewRefreshMode();
            if (parityRefreshMode === 'refreshing') {
              return new Promise<LivePreviewSnapshot>(() => undefined);
            }
            if (parityRefreshMode === 'failed') {
              throw new Error('Parity preview refresh failed.');
            }
            const result = await dispatchAction('refresh-preview', {
              invoke: (): LivePreviewSnapshot => accepted,
              windowFocused: true,
            });
            if (result.status !== 'mutated') {
              throw new Error('Preview refresh is unavailable.');
            }
            return accepted;
          }}
        />
      </div>
    </section>
  );
};

function arrangementFor(view: DocumentView): ViewArrangement {
  if (view.editorVisible && view.previewVisible) {
    return 'split';
  }
  if (view.previewVisible) {
    return 'preview';
  }
  return 'editor';
}

const EditorView: React.FC<EditorViewProps> = ({
  adapter = appModelAdapter,
  tabAdapter,
  onNewDocument,
  onActivateDocument,
  onCloseDocument,
  onLiveCursorChange: onLiveCursorChangeProp,
}: EditorViewProps): React.JSX.Element | null => {
  const dispatch = useAppDispatch();
  const activeBuffer = useContext(EditorSessionContext);
  const minimumWindow = useMinimumWindow();
  const activeEditorRef = useRef<ActiveEditorHandle | null>(null);
  const previewScrollHandlerRef = useRef<((scrollTop: number) => void) | null>(
    null,
  );
  const activeDocument = useAppSelector((state) => {
    if (activeBuffer === null) {
      return undefined;
    }
    return state.documents.byId[activeBuffer.documentId];
  });
  const onArrangementChange = useCallback(
    (nextArrangement: ViewArrangement): void => {
      if (nextArrangement === 'preview') {
        activeEditorRef.current?.captureViewState();
      }
      void dispatch(setViewArrangement(nextArrangement));
    },
    [dispatch],
  );
  const onLiveCursorChange = useCallback(
    (cursor: EditorPosition): void => {
      onLiveCursorChangeProp?.(cursor);
    },
    [onLiveCursorChangeProp],
  );
  const onPreviewScrollHandler = useCallback(
    (handler: ((scrollTop: number) => void) | null): void => {
      previewScrollHandlerRef.current = handler;
    },
    [],
  );

  if (activeBuffer === null) {
    return null;
  }

  const view = activeDocument?.view ?? fallbackView();
  /*
   * At the native minimum window the region carries one pane. Preview mode
   * keeps the viewer; Editor mode and Split both keep the editor, because this
   * is a Markdown editor and typing is the primary job — a fixed answer means
   * nobody has to guess which half of a Split they will be handed.
   *
   * This is presentation only. `arrangement` below still reads the stored view,
   * so the toolbar and the View menu keep reporting Split while the panes are
   * collapsed, nothing is dispatched, and widening the window restores both
   * panes with no user action.
   */
  const previewVisible = minimumWindow
    ? view.previewVisible && !view.editorVisible
    : view.previewVisible;
  const editorVisible = minimumWindow ? !previewVisible : view.editorVisible;
  const arrangement = arrangementFor(view);
  const title = activeDocument?.title ?? t('editor.untitled');
  const encoding = activeDocument?.encoding ?? 'utf-8';
  const lineEnding = activeDocument?.lineEnding ?? 'lf';
  const parityRoute =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('parity-case');
  const localizedEncoding = t(`status.encoding.${encoding.toLowerCase()}`);
  const localizedLineEnding = t(
    `status.lineEnding.${lineEnding.toLowerCase()}`,
  );
  return (
    <section aria-label={t('editor.view')} className={styles.editorView}>
      <EditorChrome
        arrangement={arrangement}
        onArrangementChange={onArrangementChange}
        tabAdapter={tabAdapter}
        onActivateDocument={onActivateDocument}
        onCloseDocument={onCloseDocument}
        onNewDocument={onNewDocument}
      />
      {/*
       * FR-FT-047: the tab strip declares `role="tab"` on every open document
       * and `aria-controls` on each of them; this is the element they control.
       * One panel serves every tab because the strip switches the document
       * inside a single stage rather than mounting a pane per tab, so the
       * panel takes its accessible name from whichever tab is active.
       */}
      <div
        aria-labelledby={
          activeBuffer.documentId === ''
            ? undefined
            : tabElementId(activeBuffer.documentId)
        }
        className={styles.panes}
        id={EDITOR_TABPANEL_ID}
        role="tabpanel"
      >
        <section
          aria-hidden={!editorVisible}
          aria-label={t('editor.editorPane')}
          className={`${styles.pane} ${editorVisible ? '' : styles.paneHidden}`}
        >
          <header className={styles.paneHeader}>
            <span>{t('editor.editorTitle', { title })}</span>
            <span className={styles.paneMeta}>
              {t('editor.metadata', {
                encoding: localizedEncoding,
                lineEnding: localizedLineEnding,
              })}
              {parityRoute ? (
                <>
                  {' · '}
                  <span className={styles.paneSelection}>
                    {t('editor.metadata.selection')}
                  </span>
                </>
              ) : (
                ''
              )}
            </span>
          </header>
          <EditorContextMenu>
            <ActiveEditor
              key={`${activeBuffer.documentId}:${activeBuffer.content}`}
              ref={activeEditorRef}
              adapter={adapter}
              activeBuffer={activeBuffer}
              view={view}
              visible={editorVisible}
              onLiveCursorChange={onLiveCursorChange}
              onPreviewScrollHandler={onPreviewScrollHandler}
            />
          </EditorContextMenu>
        </section>
        <LivePreview
          key={`${activeBuffer.documentId}:${activeBuffer.content}`}
          activeBuffer={activeBuffer}
          adapter={adapter}
          visible={previewVisible}
          onScrollChange={(scrollTop: number): void => {
            previewScrollHandlerRef.current?.(scrollTop);
          }}
        />
      </div>
    </section>
  );
};

export default EditorView;
