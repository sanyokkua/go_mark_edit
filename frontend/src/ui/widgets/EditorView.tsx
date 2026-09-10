import { useCallback, useContext, useRef } from 'react';

import type { EditorPosition } from '../components/CodeEditor';
import { appModelAdapter } from '../../logic/adapter';
import { dispatchAction } from '../../logic/actions/actionDispatcher';
import type { LivePreviewSnapshot } from '../../logic/hooks/useLivePreview';
import { useAppDispatch, useAppSelector } from '../../logic/store';
import { setViewArrangement } from '../../logic/store/docViewCommands';
import { notifyToast } from '../../logic/store/notificationsSlice';
import type {
  ClosePlanKind,
  ConflictPreview,
  DocumentTransitionResult,
  DocumentView,
  TabTransitionResult,
  ViewArrangement,
} from '../../logic/store/appModelTypes';
import { EditorSessionContext } from './editorSession';
import type { DocumentTabsProps } from './DocumentTabs/DocumentTabs';
import DocumentTabs from './DocumentTabs/DocumentTabs';
import FormattingToolbar from './FormattingToolbar/FormattingToolbar';
import EditorStage, {
  type EditorStageAdapter,
  type EditorStageHandle,
} from './EditorStage/EditorStage';
import { EDITOR_TABPANEL_ID, tabElementId } from './editorTabPanel';
import { useMinimumWindow } from './minimumWindow';
import styles from './EditorView.module.css';
import { t } from '../../i18n';
import { useModalState } from './modalStateContext';

export type EditorViewAdapter = EditorStageAdapter;

/*
 * T173 kept this branch, and it is the only `?parity-case` read left in a
 * production component. It is a capture condition, which FR-FT-054 permits
 * explicitly — "seed a fixture and hold capture conditions fixed" — not a
 * fixture seed and not a component substitution.
 *
 * It cannot move anywhere better. The mock backend is the sanctioned home for
 * seeds, but this refresh never crosses the bridge: the callback dispatches
 * `refresh-preview` with `invoke: () => accepted`, entirely in the frontend,
 * so there is no backend call for a seed to intercept. The reference side
 * cannot express it either — the mockup is static HTML that already shows the
 * refreshing and failed states, and what is missing is a way to make
 * production hold them still long enough to be photographed. That is what
 * this does: it changes the timing and outcome of one async operation, and
 * renders no markup the application does not otherwise render.
 */
function parityPreviewRefreshMode(): 'refreshing' | 'failed' | undefined {
  if (typeof window === 'undefined') return undefined;
  const key = new URLSearchParams(window.location.search).get('parity-case');
  if (key === null) return undefined;
  if (key.startsWith('state:preview-refreshing:')) return 'refreshing';
  if (key.startsWith('state:preview-refresh-failed:')) return 'failed';
  return undefined;
}

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
  onExternalConflict?: (preview: ConflictPreview) => void;
  onLiveCursorChange?: (cursor: EditorPosition) => void;
}

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
  onExternalConflict,
  onLiveCursorChange: onLiveCursorChangeProp,
}: EditorViewProps): React.JSX.Element | null => {
  const dispatch = useAppDispatch();
  const activeBuffer = useContext(EditorSessionContext);
  const minimumWindow = useMinimumWindow();
  const modalOpen = useModalState();
  const stageRef = useRef<EditorStageHandle | null>(null);
  const activeDocument = useAppSelector((state) => {
    if (activeBuffer === null) {
      return undefined;
    }
    return state.documents.byId[activeBuffer.documentId];
  });
  const activeDocumentReadOnly =
    activeDocument?.capability !== undefined &&
    activeDocument.capability !== 'writable';
  const onArrangementChange = useCallback(
    (nextArrangement: ViewArrangement): void => {
      if (nextArrangement === 'preview') {
        stageRef.current?.captureViewState();
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
  const onPreviewRefresh = useCallback(
    async (accepted: LivePreviewSnapshot): Promise<LivePreviewSnapshot> => {
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
    },
    [],
  );

  if (activeBuffer === null) {
    return null;
  }

  const view = activeDocument?.view ?? fallbackView();
  const previewVisible = minimumWindow
    ? view.previewVisible && !view.editorVisible
    : view.previewVisible;
  const editorVisible = minimumWindow ? !previewVisible : view.editorVisible;
  const arrangement = arrangementFor(view);

  return (
    <section aria-label={t('editor.view')} className={styles.editorView}>
      <DocumentTabs
        adapter={tabAdapter}
        modalOpen={modalOpen}
        onActivateDocument={onActivateDocument}
        onCloseDocument={onCloseDocument}
        onExternalConflict={onExternalConflict}
        onNewDocument={onNewDocument}
      />
      <FormattingToolbar
        arrangement={arrangement}
        onArrangementChange={onArrangementChange}
      />
      <EditorStage
        ref={stageRef}
        activeBuffer={activeBuffer}
        activeDocument={activeDocument}
        adapter={adapter}
        editorVisible={editorVisible}
        labelledBy={
          activeBuffer.documentId === ''
            ? undefined
            : tabElementId(activeBuffer.documentId)
        }
        onLiveCursorChange={onLiveCursorChange}
        onPreviewRefresh={onPreviewRefresh}
        onPreviewWarning={onPreviewWarning}
        panelId={EDITOR_TABPANEL_ID}
        previewVisible={previewVisible}
        readOnly={activeDocumentReadOnly}
        view={view}
      />
    </section>
  );
};

export default EditorView;
