import {
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from 'react';

import type { EditorPosition } from '../components/CodeEditor';
import CodeEditor from '../components/CodeEditor';
import Pane from '../components/Pane';
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
import type {
  ActiveBuffer,
  DocumentMetadata,
  DocumentView,
} from '../../logic/store/appModelTypes';
import EditorContextMenu from './EditorContextMenu';
import {
  EditorSessionEpochContext,
  useEditorSessionAttachment,
} from './editorSession';
import {
  PreviewPaneContent,
  PreviewPausedStatus,
  usePreviewPaneState,
} from './PreviewPane';
import { EDITOR_TABPANEL_ID } from './editorTabPanel';
import styles from './EditorStage.module.css';
import { t } from '../../i18n';
import { useEditorSettings } from '../../logic/settings/editorSettings';

export interface EditorStageAdapter
  extends EditorSynchronizationAdapter, LivePreviewAdapter {}

export interface EditorStageHandle {
  captureViewState: () => void;
}

export interface EditorStageProps {
  activeBuffer: ActiveBuffer;
  activeDocument?: DocumentMetadata;
  adapter?: EditorStageAdapter;
  editorVisible: boolean;
  labelledBy?: string;
  onLiveCursorChange: (cursor: EditorPosition) => void;
  onPreviewRefresh?: (
    accepted: LivePreviewSnapshot,
  ) => Promise<LivePreviewSnapshot>;
  onPreviewWarning: (target: string, reason: string) => void;
  panelId?: string;
  previewVisible: boolean;
  readOnly: boolean;
  view: DocumentView;
}

interface ActiveEditorProps {
  activeBuffer: ActiveBuffer;
  adapter: EditorStageAdapter;
  onLiveCursorChange: (cursor: EditorPosition) => void;
  onPreviewScrollHandler: (
    handler: ((scrollTop: number) => void) | null,
  ) => void;
  readOnly: boolean;
  view: DocumentView;
  visible: boolean;
}

interface ActiveEditorHandle {
  captureViewState: () => void;
}

const ActiveEditor = forwardRef<ActiveEditorHandle, ActiveEditorProps>(
  function ActiveEditor(
    {
      activeBuffer,
      adapter,
      onLiveCursorChange,
      onPreviewScrollHandler,
      readOnly,
      view,
      visible,
    }: ActiveEditorProps,
    ref,
  ): React.JSX.Element {
    const editorSettings = useEditorSettings().settings;
    const viewStateCaptureRef = useRef<(() => void) | null>(null);
    const attachEditor = useEditorSessionAttachment();
    const externalEpoch = useContext(EditorSessionEpochContext);
    const synchronizedBuffer = useSyncedBuffer(
      activeBuffer.documentId,
      view,
      adapter,
      activeBuffer.content,
      externalEpoch,
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
          applyMonacoThemeFromRoot()();
        },
      );
    }, []);

    useEffect((): void => {
      onLiveCursorChange(synchronizedBuffer.liveCursor);
    }, [onLiveCursorChange, synchronizedBuffer.liveCursor]);

    useEffect((): (() => void) => {
      onPreviewScrollHandler(synchronizedBuffer.onPreviewScrollChange);
      return (): void => onPreviewScrollHandler(null);
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
        readOnly={readOnly}
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
  adapter: EditorStageAdapter;
  claimScrollRestore: (documentId: string) => boolean;
  documentPath: string;
  onPreviewRefresh?: (
    accepted: LivePreviewSnapshot,
  ) => Promise<LivePreviewSnapshot>;
  onPreviewWarning: (target: string, reason: string) => void;
  onScrollChange: (scrollTop: number) => void;
  savedScrollTop: number;
  visible: boolean;
}

const LivePreview: React.FC<LivePreviewProps> = ({
  activeBuffer,
  adapter,
  claimScrollRestore,
  documentPath,
  onPreviewRefresh,
  onPreviewWarning,
  onScrollChange,
  savedScrollTop,
  visible,
}: LivePreviewProps): React.JSX.Element | null => {
  const accepted = useLivePreviewSnapshot(activeBuffer, adapter);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const onRefresh = useCallback(async (): Promise<LivePreviewSnapshot> => {
    if (onPreviewRefresh !== undefined) {
      return onPreviewRefresh(accepted);
    }
    const result = await dispatchAction('refresh-preview', {
      invoke: (): LivePreviewSnapshot => accepted,
      windowFocused: true,
    });
    if (result.status !== 'mutated') {
      throw new Error('Preview refresh is unavailable.');
    }
    return accepted;
  }, [accepted, onPreviewRefresh]);
  const controller = usePreviewPaneState(accepted, onRefresh);

  useLayoutEffect((): void => {
    const node = contentRef.current;
    if (node === null) return;
    if (!claimScrollRestore(activeBuffer.documentId)) return;
    node.scrollTop = savedScrollTop;
  }, [activeBuffer.documentId, claimScrollRestore, savedScrollTop]);

  if (!visible) {
    return null;
  }

  return (
    <Pane
      accessory={
        controller.isPaused ? (
          <PreviewPausedStatus
            currentRefreshError={controller.currentRefreshError}
            isRefreshing={controller.isRefreshing}
            onRefresh={controller.refresh}
          />
        ) : undefined
      }
      ariaLabel={t('editor.previewPane')}
      body={
        <div
          ref={contentRef}
          className={styles.previewContent}
          onScroll={(event): void => {
            onScrollChange(event.currentTarget.scrollTop);
          }}
        >
          <PreviewPaneContent
            ariaLabel={null}
            controller={controller}
            documentId={activeBuffer.documentId}
            documentPath={documentPath}
            linkAdapter={adapter}
            notificationOwner={{ warn: onPreviewWarning }}
            showPausedStatus={false}
          />
        </div>
      }
      header={{
        leading: (
          <span className={styles.paneLive}>{t('editor.preview.live')}</span>
        ),
        trailing: <span>{t('editor.preview.flavour')}</span>,
      }}
      identity="preview"
    />
  );
};

const EditorStage = forwardRef<EditorStageHandle, EditorStageProps>(
  function EditorStage(
    {
      activeBuffer,
      activeDocument,
      adapter = appModelAdapter,
      editorVisible,
      labelledBy,
      onLiveCursorChange,
      onPreviewRefresh,
      onPreviewWarning,
      panelId = EDITOR_TABPANEL_ID,
      previewVisible,
      readOnly,
      view,
    }: EditorStageProps,
    ref,
  ): React.JSX.Element {
    const activeEditorRef = useRef<ActiveEditorHandle | null>(null);
    const previewScrollHandlerRef = useRef<
      ((scrollTop: number) => void) | null
    >(null);
    const registerPreviewScrollHandler = useCallback(
      (handler: ((scrollTop: number) => void) | null): void => {
        previewScrollHandlerRef.current = handler;
      },
      [],
    );
    const restoredPreviewDocumentRef = useRef<string | null>(null);
    const claimPreviewScrollRestore = useCallback(
      (documentId: string): boolean => {
        if (restoredPreviewDocumentRef.current === documentId) return false;
        restoredPreviewDocumentRef.current = documentId;
        return true;
      },
      [],
    );

    useImperativeHandle(
      ref,
      (): EditorStageHandle => ({
        captureViewState(): void {
          activeEditorRef.current?.captureViewState();
        },
      }),
      [],
    );

    const title = activeDocument?.title ?? t('editor.untitled');
    const encoding = activeDocument?.encoding ?? 'utf-8';
    const lineEnding = activeDocument?.lineEnding ?? 'lf';
    const localizedEncoding = t(`status.encoding.${encoding.toLowerCase()}`);
    const localizedLineEnding = t(
      `status.lineEnding.${lineEnding.toLowerCase()}`,
    );

    return (
      <div
        aria-labelledby={labelledBy}
        className={styles.stage}
        id={panelId}
        role="tabpanel"
      >
        <Pane
          ariaLabel={t('editor.editorPane')}
          body={
            <EditorContextMenu>
              <ActiveEditor
                ref={activeEditorRef}
                activeBuffer={activeBuffer}
                adapter={adapter}
                view={view}
                readOnly={readOnly}
                visible={editorVisible}
                onLiveCursorChange={onLiveCursorChange}
                onPreviewScrollHandler={registerPreviewScrollHandler}
              />
            </EditorContextMenu>
          }
          header={{
            leading: <span>{t('editor.editorTitle', { title })}</span>,
            trailing: (
              <span>
                {t('editor.metadata', {
                  encoding: localizedEncoding,
                  lineEnding: localizedLineEnding,
                })}
              </span>
            ),
          }}
          hidden={!editorVisible}
          identity="editor"
        />
        <LivePreview
          key={`${activeBuffer.documentId}:${activeBuffer.content}`}
          activeBuffer={activeBuffer}
          adapter={adapter}
          claimScrollRestore={claimPreviewScrollRestore}
          documentPath={activeDocument?.path ?? ''}
          onPreviewRefresh={onPreviewRefresh}
          onPreviewWarning={onPreviewWarning}
          onScrollChange={(scrollTop: number): void => {
            previewScrollHandlerRef.current?.(scrollTop);
          }}
          savedScrollTop={view.scroll.preview}
          visible={previewVisible}
        />
      </div>
    );
  },
);

export default EditorStage;
