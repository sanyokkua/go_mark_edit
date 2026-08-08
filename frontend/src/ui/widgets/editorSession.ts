import {
  createElement,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';

import type {
  ActiveBuffer,
  AppStateSnapshot,
} from '../../logic/store/appModelTypes';
import {
  type DocumentCommandAPI,
  type DocumentCommandSession,
  useDocumentCommands,
} from '../../logic/hooks/useDocumentCommands';
import type { CodeEditorHandle } from '../components/CodeEditor';

export const EditorSessionContext = createContext<ActiveBuffer | null>(null);

export const DocumentCommandContext = createContext<DocumentCommandAPI | null>(
  null,
);

interface EditorSessionAttachment {
  attachEditor: (
    documentId: string,
    editor: CodeEditorHandle | null,
    activationToken?: symbol,
  ) => void;
}

class EditorSessionRegistry {
  public session: DocumentCommandSession | null = null;

  public readonly getSession = (): DocumentCommandSession | null =>
    this.session;

  public setSession(session: DocumentCommandSession | null): void {
    this.session = session;
  }
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
  const [session, setSession] = useState<DocumentCommandSession | null>(null);
  const sessionRegistry = useMemo(
    (): EditorSessionRegistry => new EditorSessionRegistry(),
    [],
  );
  const attachEditor = useCallback(
    (
      documentId: string,
      editor: CodeEditorHandle | null,
      activationToken?: symbol,
    ): void => {
      if (editor === null) {
        if (sessionRegistry.session?.documentId === documentId) {
          sessionRegistry.setSession(null);
          setSession(null);
        }
        return;
      }

      const nextSession: DocumentCommandSession = {
        documentId,
        handle: editor,
        token: activationToken ?? Symbol('editor-session'),
      };
      sessionRegistry.setSession(nextSession);
      setSession(nextSession);
    },
    [sessionRegistry],
  );
  const sessionToken =
    activeBuffer?.documentId === session?.documentId
      ? (session?.token ?? null)
      : null;
  const documentCommands = useDocumentCommands(
    activeBuffer?.documentId ?? null,
    sessionToken,
    sessionRegistry.getSession,
  );
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
  documentId: string,
  editor: CodeEditorHandle | null,
  activationToken?: symbol,
) => void {
  const attachment = useContext(EditorSessionAttachmentContext);

  return attachment?.attachEditor ?? noopEditorAttachment;
}

function noopEditorAttachment(): void {}

export interface ActivationRequest {
  generation: number;
  documentId: string;
}

/**
 * Accepts an active-buffer acknowledgement only after the request won, the
 * projection caught up, and the projected document revision still matches.
 */
export function acceptsActivationAcknowledgement(
  acknowledgement: ActiveBuffer,
  request: ActivationRequest,
  latestGeneration: number,
  projection: Pick<
    AppStateSnapshot,
    'activeDocumentId' | 'revision' | 'documents'
  >,
): boolean {
  const projectedDocument = projection.documents[acknowledgement.documentId];
  return (
    request.generation === latestGeneration &&
    request.documentId === acknowledgement.documentId &&
    projection.revision >= (acknowledgement.projectionRevision ?? 0) &&
    projection.activeDocumentId === acknowledgement.documentId &&
    projectedDocument?.contentRevision === acknowledgement.documentRevision
  );
}
