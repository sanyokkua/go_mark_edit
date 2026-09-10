import {
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
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
import { notifyToast } from '../../logic/store/notificationsSlice';
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
  EditorSessionEpochContext,
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
  /**
   * Refuse editing, for a document whose capability is not `writable`.
   *
   * FR-FT-006 requires editing to be unavailable when input opened tolerantly
   * as read-only; FR-FT-005 makes an over-large file equally unwritable. T178.
   */
  readOnly: boolean;
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
      readOnly,
      visible,
      view,
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
  adapter: LivePreviewAdapter;
  documentPath: string;
  onPreviewWarning: (target: string, reason: string) => void;
  onScrollChange: (scrollTop: number) => void;
  /**
   * The document's saved preview offset, supplied only on activation.
   *
   * `undefined` on every other mount, and this pane remounts constantly — it is
   * keyed on `documentId:content`, so every accepted revision rebuilds it.
   * Restoring unconditionally would drag the pane back to the saved offset on
   * each keystroke and fight the user's own scrolling, so the parent decides
   * when a restore is owed and this component only performs it. T179.
   */
  savedScrollTop: number;
  /**
   * Claim the one restore this document is owed, from inside the mount effect.
   *
   * Returns `true` exactly once per activation. The pane asks rather than being
   * handed a value, so the parent's record is touched only during an effect.
   */
  claimScrollRestore: (documentId: string) => boolean;
  visible: boolean;
}

/*
 * T173 kept this branch, and it is the only `?parity-case` read left in a
 * production component. It is a capture condition, which FR-FT-054 permits
 * explicitly — "seed a fixture and hold capture conditions fixed" — not a
 * fixture seed and not a component substitution.
 *
 * It cannot move anywhere better. The mock backend is the sanctioned home for
 * seeds, but this refresh never crosses the bridge: `onRefresh` dispatches
 * `refresh-preview` with `invoke: () => accepted`, entirely in the frontend, so
 * there is no backend call for a seed to intercept. The reference side cannot
 * express it either — the mockup is static HTML that already *shows* the
 * refreshing and failed states, and what is missing is a way to make production
 * hold them still long enough to be photographed. That is what this does: it
 * changes the timing and outcome of one async operation, and renders no markup
 * the application does not otherwise render.
 *
 * The archtest allowlist carries this file at one occurrence for that reason.
 * If `refresh-preview` ever gains a backend call, move the seed to
 * `AppModelHandler` alongside `refuseSave` and `refuseCloseExecute` and drop the
 * allowance.
 */
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
  documentPath,
  onPreviewWarning,
  onScrollChange,
  savedScrollTop,
  claimScrollRestore,
  visible,
}: LivePreviewProps): React.JSX.Element | null => {
  const accepted = useLivePreviewSnapshot(activeBuffer, adapter);
  const contentRef = useRef<HTMLDivElement | null>(null);
  /*
   * Layout effect rather than `useEffect`: the assignment must land before the
   * browser paints, or the pane is visibly at zero for a frame and then jumps.
   * Declared above the `visible` early return because hooks cannot be
   * conditional; the guard is inside instead. FR-FT-032 / T179.
   */
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
    <section aria-label={t('editor.previewPane')} className={styles.pane}>
      <header className={styles.paneHeader}>
        <span className={styles.paneLive}>{t('editor.preview.live')}</span>
        <span className={styles.paneMeta}>{t('editor.preview.flavour')}</span>
      </header>
      <div
        ref={contentRef}
        className={styles.previewContent}
        onScroll={(event): void => {
          onScrollChange(event.currentTarget.scrollTop);
        }}
      >
        <PreviewPane
          ariaLabel={null}
          accepted={accepted}
          documentId={activeBuffer.documentId}
          documentPath={documentPath}
          linkAdapter={adapter}
          notificationOwner={{ warn: onPreviewWarning }}
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
  /*
   * FR-FT-006's "Editing … MUST be unavailable". The predicate is Go's own —
   * `capability !== 'writable'` (`internal/appmodel/save.go`) — rather than a
   * match on `unsafe-read-only`, because `large-read-only` (FR-FT-005, a file
   * over 10 MiB) is equally unwritable. A document whose capability the
   * projection has not carried yet stays editable, which is the pre-T178
   * behaviour for every ordinary document. T178.
   */
  const activeDocumentReadOnly =
    activeDocument?.capability !== undefined &&
    activeDocument.capability !== 'writable';
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
  const onPreviewWarning = useCallback(
    (target: string, reason: string): void => {
      dispatch(
        notifyToast({
          code: 'preview-link-refused',
          message: t('preview.linkRefused.message', { reason, target }),
          severity: 'warning',
          subject: target,
          title: t('preview.linkRefused.title'),
        }),
      );
    },
    [dispatch],
  );

  /*
   * FR-FT-032 requires each document to keep "its own … preview scroll" across
   * switches, and "across switches" is the clause: the offset is restored once
   * when a document becomes active, not on every render. `LivePreview` remounts
   * on every accepted revision (keyed on `documentId:content`), so its own state
   * cannot tell an activation from a keystroke — the record has to live here,
   * where nothing remounts on a content change.
   *
   * The pane *asks* rather than being told. A restore is claimed from inside
   * `LivePreview`'s layout effect, so this ref is only ever touched during an
   * effect — never read while rendering to decide a prop, which is unsafe under
   * concurrent rendering, and never written through `setState` inside an effect.
   * Both of those are what `react-hooks` rejected on the way to this shape.
   * Declared above the early return, because hooks cannot be conditional. T179.
   */
  const restoredPreviewDocumentRef = useRef<string | null>(null);
  const claimPreviewScrollRestore = useCallback(
    (documentId: string): boolean => {
      if (restoredPreviewDocumentRef.current === documentId) return false;
      restoredPreviewDocumentRef.current = documentId;
      return true;
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
            </span>
          </header>
          <EditorContextMenu>
            <ActiveEditor
              key={`${activeBuffer.documentId}:${activeBuffer.content}`}
              ref={activeEditorRef}
              adapter={adapter}
              activeBuffer={activeBuffer}
              view={view}
              readOnly={activeDocumentReadOnly}
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
          documentPath={activeDocument?.path ?? ''}
          onPreviewWarning={onPreviewWarning}
          savedScrollTop={view.scroll.preview}
          claimScrollRestore={claimPreviewScrollRestore}
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
