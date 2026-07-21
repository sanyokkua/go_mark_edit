import { useCallback, useContext, useEffect, useRef, useState } from 'react';

import CodeEditor, { type CodeEditorHandle } from '../components/CodeEditor';
import type { EditorPosition } from '../components/CodeEditor';
import StatusBar from '../components/StatusBar';
import ViewModeToggle from '../components/ViewModeToggle';
import ViewMenu from '../primitives/ViewMenu';
import { appModelAdapter } from '../../logic/adapter';
import { useDocumentCommands } from '../../logic/hooks/useDocumentCommands';
import {
  type LivePreviewAdapter,
  useLivePreview,
} from '../../logic/hooks/useLivePreview';
import {
  type EditorSynchronizationAdapter,
  useSyncedBuffer,
} from '../../logic/hooks/useSyncedBuffer';
import { useAppDispatch, useAppSelector } from '../../logic/store';
import {
  setEditorPaneVisible,
  setPreviewPaneVisible,
  setViewArrangement,
} from '../../logic/store/docViewCommands';
import type {
  ActiveBuffer,
  DocumentView,
  ViewArrangement,
} from '../../logic/store/appModelTypes';
import { DocumentCommandContext, EditorSessionContext } from './editorSession';
import PreviewView from './PreviewView';
import styles from './EditorView.module.css';

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
  view: DocumentView;
}

export interface EditorViewProps {
  adapter?: EditorViewAdapter;
}

export interface EditorViewAdapter
  extends EditorSynchronizationAdapter, LivePreviewAdapter {}

const ActiveEditor: React.FC<ActiveEditorProps> = ({
  adapter,
  activeBuffer,
  onLiveCursorChange,
  view,
}: ActiveEditorProps): React.JSX.Element => {
  const editorRef = useRef<CodeEditorHandle | null>(null);
  const documentCommands = useDocumentCommands(editorRef);
  const synchronizedBuffer = useSyncedBuffer(
    activeBuffer.documentId,
    view,
    adapter,
  );

  useEffect((): void => {
    onLiveCursorChange(synchronizedBuffer.liveCursor);
  }, [onLiveCursorChange, synchronizedBuffer.liveCursor]);

  return (
    <DocumentCommandContext.Provider value={documentCommands}>
      <CodeEditor
        ref={editorRef}
        documentId={activeBuffer.documentId}
        initialValue={activeBuffer.content}
        onBlur={synchronizedBuffer.onBlur}
        onChange={synchronizedBuffer.onChange}
        onCursorPositionChange={synchronizedBuffer.onCursorPositionChange}
        onSelectionChange={synchronizedBuffer.onSelectionChange}
      />
    </DocumentCommandContext.Provider>
  );
};

interface LivePreviewProps {
  activeBuffer: ActiveBuffer;
  adapter: LivePreviewAdapter;
  visible: boolean;
}

const LivePreview: React.FC<LivePreviewProps> = ({
  activeBuffer,
  adapter,
  visible,
}: LivePreviewProps): React.JSX.Element | null => {
  const source = useLivePreview(activeBuffer, adapter);

  if (!visible) {
    return null;
  }

  return (
    <section aria-label="Preview pane" className={styles.pane}>
      <header className={styles.paneHeader}>
        <span>● Preview · live</span>
        <span className={styles.paneMeta}>GFM</span>
      </header>
      <div className={styles.previewContent}>
        <PreviewView source={source} />
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
}: EditorViewProps): React.JSX.Element | null => {
  const dispatch = useAppDispatch();
  const activeBuffer = useContext(EditorSessionContext);
  const [liveCursor, setLiveCursor] = useState<EditorPosition>({
    lineNumber: 1,
    column: 1,
  });
  const activeDocument = useAppSelector((state) => {
    if (activeBuffer === null) {
      return undefined;
    }
    return state.documents.byId[activeBuffer.documentId];
  });
  const onArrangementChange = useCallback(
    (nextArrangement: ViewArrangement): void => {
      void dispatch(setViewArrangement(nextArrangement));
    },
    [dispatch],
  );
  const onEditorVisibilityChange = useCallback(
    (visible: boolean): void => {
      void dispatch(setEditorPaneVisible(visible));
    },
    [dispatch],
  );
  const onPreviewVisibilityChange = useCallback(
    (visible: boolean): void => {
      void dispatch(setPreviewPaneVisible(visible));
    },
    [dispatch],
  );
  const onLiveCursorChange = useCallback((cursor: EditorPosition): void => {
    setLiveCursor(cursor);
  }, []);

  if (activeBuffer === null) {
    return null;
  }

  const view = activeDocument?.view ?? fallbackView();
  const arrangement = arrangementFor(view);
  const title = activeDocument?.title ?? 'Untitled';
  const encoding = activeDocument?.encoding.toUpperCase() ?? 'UTF-8';
  const lineEnding = activeDocument?.lineEnding.toUpperCase() ?? 'LF';
  const wordCount = activeDocument?.wordCount ?? 0;

  return (
    <section aria-label="Editor view" className={styles.editorView}>
      <header aria-label="Document toolbar" className={styles.toolbar}>
        <ViewMenu
          editorVisible={view.editorVisible}
          previewVisible={view.previewVisible}
          onEditorVisibilityChange={onEditorVisibilityChange}
          onPreviewVisibilityChange={onPreviewVisibilityChange}
        />
        <ViewModeToggle value={arrangement} onChange={onArrangementChange} />
      </header>
      <div className={styles.panes}>
        {view.editorVisible ? (
          <section aria-label="Editor pane" className={styles.pane}>
            <header className={styles.paneHeader}>
              <span>Editor · {title}</span>
              <span className={styles.paneMeta}>
                {encoding} · {lineEnding}
              </span>
            </header>
            <ActiveEditor
              adapter={adapter}
              activeBuffer={activeBuffer}
              view={view}
              onLiveCursorChange={onLiveCursorChange}
            />
          </section>
        ) : null}
        <LivePreview
          key={activeBuffer.documentId}
          activeBuffer={activeBuffer}
          adapter={adapter}
          visible={view.previewVisible}
        />
      </div>
      <StatusBar
        arrangement={arrangement}
        cursor={liveCursor}
        encoding={encoding}
        lineEnding={lineEnding}
        wordCount={wordCount}
      />
    </section>
  );
};

export default EditorView;
