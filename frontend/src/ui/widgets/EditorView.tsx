import { useContext, useRef } from 'react';

import CodeEditor, { type CodeEditorHandle } from '../components/CodeEditor';
import { useDocumentCommands } from '../../logic/hooks/useDocumentCommands';
import { useSyncedBuffer } from '../../logic/hooks/useSyncedBuffer';
import { useAppSelector } from '../../logic/store';
import type {
  ActiveBuffer,
  DocumentView,
} from '../../logic/store/appModelTypes';
import { DocumentCommandContext, EditorSessionContext } from './editorSession';

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

const EditorView: React.FC = (): React.JSX.Element | null => {
  const activeBuffer = useContext(EditorSessionContext);
  const activeView = useAppSelector((state): DocumentView | undefined => {
    if (activeBuffer === null) {
      return undefined;
    }
    return state.documents.byId[activeBuffer.documentId]?.view;
  });

  if (activeBuffer === null) {
    return null;
  }

  return (
    <ActiveEditor
      activeBuffer={activeBuffer}
      view={activeView ?? fallbackView()}
    />
  );
};

export default EditorView;
