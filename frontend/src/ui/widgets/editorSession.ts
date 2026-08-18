import {
  createElement,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';

import type {
  ActiveBuffer,
  AppStateSnapshot,
} from '../../logic/store/appModelTypes';
import { useAppSelector } from '../../logic/store';
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

/**
 * How many times the active document's text has been replaced by something
 * other than the editor — today only FR-FT-030's reload.
 *
 * It exists because Monaco is seeded once per editor session, so a replacement
 * that keeps the same document reaches the editor only if the session restarts.
 * Keying that on the content revision would restart it per keystroke; this
 * advances only for a replacement the editor did not originate. T191.
 */
export const EditorSessionEpochContext = createContext(0);

/**
 * Lets a descendant report that it replaced the active document's text.
 *
 * `DocumentTabs` owns an external-change prompt of its own, separate from the
 * one in `App`, and its reload arm is the one the foreground check actually
 * raises. It sits below this provider, so it cannot reach App's state — it
 * reports here instead and the provider adds its count to the epoch. T191.
 */
export type ExternalReloadInstaller = (
  acknowledgement: ActiveBuffer | undefined,
) => void;

export const EditorSessionReloadContext =
  createContext<ExternalReloadInstaller>((): void => undefined);

export interface EditorSessionProviderProps extends PropsWithChildren {
  activeBuffer: ActiveBuffer | null;
  externalEpoch?: number;
  /**
   * Installs a buffer the editor did not produce, and advances the epoch.
   *
   * Supplied by `App`, because the install has to go through the one guarded
   * activation seam (T128/T169) rather than be re-implemented wherever a reload
   * happens. `DocumentTabs` owns an external-change prompt of its own and calls
   * this; without it, its reload updated the backend and cleared the prompt
   * while the editor kept the pre-reload text. T191.
   */
  onExternalReload?: ExternalReloadInstaller;
}

export const EditorSessionProvider: React.FC<EditorSessionProviderProps> = ({
  activeBuffer,
  children,
  externalEpoch = 0,
  onExternalReload = (): void => undefined,
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
    EditorSessionReloadContext.Provider,
    { value: onExternalReload },
    createElement(
      EditorSessionEpochContext.Provider,
      { value: externalEpoch },
      createElement(
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
    projectedDocument !== undefined &&
    /*
     * Both sides are defaulted, because the two revisions travel under
     * different JSON rules and revision zero is the common case. Go tags the
     * projected `DocumentMetadata.ContentRevision` `omitempty`
     * (`internal/apperr/results.go:132`) but tags the acknowledgement's
     * `ActiveBuffer.DocumentRevision` plainly (`:160`), so a document that has
     * never been edited publishes no `contentRevision` at all and acknowledges
     * `documentRevision: 0`. Comparing them raw is `undefined === 0`, which
     * rejected every File New and every freshly opened file — the guard's first
     * live wiring failed three e2e cases on exactly that. Absence means zero on
     * this wire; a missing *document* is still a rejection, which is what the
     * explicit `projectedDocument !== undefined` above keeps separate.
     */
    (projectedDocument.contentRevision ?? 0) ===
      (acknowledgement.documentRevision ?? 0)
  );
}

/**
 * The single install path for an active-buffer acknowledgement.
 *
 * FR-FT-030 binds an acknowledgement to an identity and a revision and allows
 * it to be applied "only while both values still match the confirmed active
 * projection". Before T128 that guard existed as
 * `acceptsActivationAcknowledgement` and nothing in production called it: all
 * five acknowledging handlers in `App.tsx` — New, Open, Open Recent, Reopen and
 * Activate — installed `result.data` / `result.activeBuffer` the moment it
 * arrived, so a switch that had already lost a race still overwrote the
 * winner's source. That is the cross-document text installation SC-FT-003
 * requires to be impossible.
 *
 * The guard is not re-stated at the call sites, because a rule that has to be
 * remembered five times is the shape of defect this replaces. A handler claims
 * a generation with `begin()` before it issues its command and hands the answer
 * to `acknowledge()`; there is no other way to install one, so a sixth handler
 * cannot reintroduce the defect by forgetting a check it never had to write.
 */
export interface GuardedActivation {
  /**
   * Claim the newest activation generation. Every later acknowledgement from an
   * older generation is a loser by construction and is dropped on arrival.
   */
  begin: () => number;
  /**
   * Offer one acknowledgement for installation. `requestedDocumentId` is the
   * identity the command named, and is supplied only by Activate: the entry
   * commands ask the backend to choose a document, so the acknowledgement's own
   * identity is the only one they could compare against.
   */
  acknowledge: (
    generation: number,
    acknowledgement: ActiveBuffer | undefined,
    requestedDocumentId?: string,
  ) => void;
}

interface PendingAcknowledgement {
  acknowledgement: ActiveBuffer;
  request: ActivationRequest;
}

export function useGuardedActivation(
  install: (acknowledgement: ActiveBuffer) => void,
): GuardedActivation {
  const latestGeneration = useRef(0);
  const [pending, setPending] = useState<PendingAcknowledgement | null>(null);
  const revision = useAppSelector((state) => state.documents.revision);
  const activeDocumentId = useAppSelector(
    (state) => state.documents.activeDocumentId,
  );
  const documents = useAppSelector((state) => state.documents.byId);
  const projection = useMemo(
    (): Pick<
      AppStateSnapshot,
      'activeDocumentId' | 'revision' | 'documents'
    > => ({ activeDocumentId, documents, revision }),
    [activeDocumentId, documents, revision],
  );

  const begin = useCallback((): number => {
    latestGeneration.current += 1;
    return latestGeneration.current;
  }, []);

  const acknowledge = useCallback(
    (
      generation: number,
      acknowledgement: ActiveBuffer | undefined,
      requestedDocumentId?: string,
    ): void => {
      if (acknowledgement === undefined) return;
      if (generation !== latestGeneration.current) return;
      setPending({
        acknowledgement,
        request: {
          generation,
          documentId: requestedDocumentId ?? acknowledgement.documentId,
        },
      });
    },
    [],
  );

  /*
   * The projection is a separate delivery from the command's answer: Go
   * publishes the patch before it returns, but the patch travels the event bus
   * and the answer travels the call, so the store routinely still describes the
   * previous document when the acknowledgement lands. Rejecting outright at
   * that moment would drop legitimate acknowledgements, so a pending one waits
   * here and is re-tested on each projection change until either its generation
   * is superseded or the projection confirms it. Waiting is bounded: the next
   * `begin()` retires the pending generation.
   */
  useEffect((): void => {
    if (pending === null) return;
    if (pending.request.generation !== latestGeneration.current) {
      setPending(null);
      return;
    }
    if (
      !acceptsActivationAcknowledgement(
        pending.acknowledgement,
        pending.request,
        latestGeneration.current,
        projection,
      )
    ) {
      return;
    }
    setPending(null);
    install(pending.acknowledgement);
  }, [install, pending, projection]);

  return useMemo(
    (): GuardedActivation => ({ acknowledge, begin }),
    [acknowledge, begin],
  );
}
