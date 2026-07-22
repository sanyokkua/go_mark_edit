import {
  createElement,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';

import type { ActiveBuffer } from '../../logic/store/appModelTypes';
import {
  type DocumentCommandAPI,
  useDocumentCommands,
} from '../../logic/hooks/useDocumentCommands';
import type { CodeEditorHandle } from '../components/CodeEditor';

export const EditorSessionContext = createContext<ActiveBuffer | null>(null);

export const DocumentCommandContext = createContext<DocumentCommandAPI | null>(
  null,
);

interface EditorSessionAttachment {
  attachEditor: (editor: CodeEditorHandle | null) => void;
}

const EditorSessionAttachmentContext =
  createContext<EditorSessionAttachment | null>(null);

export interface EditorSessionProviderProps extends PropsWithChildren {
  activeBuffer: ActiveBuffer | null;
}

export const EditorSessionProvider: React.FC<EditorSessionProviderProps> = ({
  activeBuffer,
  children,
}: EditorSessionProviderProps): React.JSX.Element => {
  const [editor, setEditor] = useState<CodeEditorHandle | null>(null);
  const attachEditor = useCallback(
    (nextEditor: CodeEditorHandle | null): void => {
      setEditor(nextEditor);
    },
    [],
  );
  const getEditor = useCallback(
    (): CodeEditorHandle | null => editor,
    [editor],
  );
  const documentCommands = useDocumentCommands(getEditor);
  const attachment = useMemo<EditorSessionAttachment>(
    (): EditorSessionAttachment => ({ attachEditor }),
    [attachEditor],
  );

  return createElement(
    EditorSessionContext.Provider,
    { value: activeBuffer },
    createElement(
      DocumentCommandContext.Provider,
      { value: documentCommands },
      createElement(
        EditorSessionAttachmentContext.Provider,
        { value: attachment },
        children,
      ),
    ),
  );
};

export function useEditorSessionAttachment(): (
  editor: CodeEditorHandle | null,
) => void {
  const attachment = useContext(EditorSessionAttachmentContext);

  return attachment?.attachEditor ?? noopEditorAttachment;
}

function noopEditorAttachment(): void {}
