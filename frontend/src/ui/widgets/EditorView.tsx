import { useCallback, useContext, useRef } from 'react';

import CodeEditor, { type CodeEditorHandle } from '../components/CodeEditor';
import ViewModeToggle from '../components/ViewModeToggle';
import { useDocumentCommands } from '../../logic/hooks/useDocumentCommands';
import { useSyncedBuffer } from '../../logic/hooks/useSyncedBuffer';
import { useAppDispatch, useAppSelector } from '../../logic/store';
import { setViewArrangement } from '../../logic/store/docViewCommands';
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
  activeBuffer: ActiveBuffer;
  view: DocumentView;
}

const ActiveEditor: React.FC<ActiveEditorProps> = ({
  activeBuffer,
  view,
}: ActiveEditorProps): React.JSX.Element => {
  const editorRef = useRef<CodeEditorHandle | null>(null);
  const documentCommands = useDocumentCommands(editorRef);
  const synchronizedBuffer = useSyncedBuffer(activeBuffer.documentId, view);

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

function arrangementFor(view: DocumentView): ViewArrangement {
  if (view.editorVisible && view.previewVisible) {
    return 'split';
  }
  if (view.previewVisible) {
    return 'preview';
  }
  return 'editor';
}

const EditorView: React.FC = (): React.JSX.Element | null => {
  const dispatch = useAppDispatch();
  const activeBuffer = useContext(EditorSessionContext);
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

  if (activeBuffer === null) {
    return null;
  }

  const view = activeDocument?.view ?? fallbackView();
  const arrangement = arrangementFor(view);
  const title = activeDocument?.title ?? 'Untitled';
  const encoding = activeDocument?.encoding.toUpperCase() ?? 'UTF-8';
  const lineEnding = activeDocument?.lineEnding.toUpperCase() ?? 'LF';

  return (
    <section aria-label="Editor view" className={styles.editorView}>
      <header aria-label="Document toolbar" className={styles.toolbar}>
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
            <ActiveEditor activeBuffer={activeBuffer} view={view} />
          </section>
        ) : null}
        {view.previewVisible ? (
          <section aria-label="Preview pane" className={styles.pane}>
            <header className={styles.paneHeader}>
              <span>● Preview · live</span>
              <span className={styles.paneMeta}>GFM</span>
            </header>
            <div className={styles.previewContent}>
              <PreviewView source={activeBuffer.content} />
            </div>
          </section>
        ) : null}
      </div>
    </section>
  );
};

export default EditorView;
