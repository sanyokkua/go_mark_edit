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

import type { ActiveBuffer, AppStateSnapshot } from '../../logic/store/appModelTypes';
import { useAppSelector } from '../../logic/store';
import {
    type DocumentCommandAPI,
    type DocumentCommandSession,
    useDocumentCommands,
} from '../../logic/hooks/useDocumentCommands';
import type { CodeEditorHandle } from '../components/CodeEditor';

export const EditorSessionContext = createContext<ActiveBuffer | null>(null);

export const DocumentCommandContext = createContext<DocumentCommandAPI | null>(null);

interface EditorSessionAttachment {
    attachEditor: (documentId: string, editor: CodeEditorHandle | null, activationToken?: symbol) => void;
}

class EditorSessionRegistry {
    public session: DocumentCommandSession | null = null;

    public readonly getSession = (): DocumentCommandSession | null => this.session;

    public setSession(session: DocumentCommandSession | null): void {
        this.session = session;
    }
}

const EditorSessionAttachmentContext = createContext<EditorSessionAttachment | null>(null);

export const EditorSessionEpochContext = createContext(0);

export interface EditorSessionProviderProps extends PropsWithChildren {
    activeBuffer: ActiveBuffer | null;
    externalEpoch?: number;
}

export const EditorSessionProvider: React.FC<EditorSessionProviderProps> = ({
    activeBuffer,
    children,
    externalEpoch = 0,
}: EditorSessionProviderProps): React.JSX.Element => {
    const [session, setSession] = useState<DocumentCommandSession | null>(null);
    const sessionRegistry = useMemo((): EditorSessionRegistry => new EditorSessionRegistry(), []);
    const attachEditor = useCallback(
        (documentId: string, editor: CodeEditorHandle | null, activationToken?: symbol): void => {
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
    const sessionToken = activeBuffer?.documentId === session?.documentId ? (session?.token ?? null) : null;
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
        EditorSessionEpochContext.Provider,
        { value: externalEpoch },
        createElement(
            EditorSessionContext.Provider,
            { value: activeBuffer },
            createElement(
                DocumentCommandContext.Provider,
                { value: documentCommands },
                createElement(EditorSessionAttachmentContext.Provider, { value: attachment }, children),
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

export function acceptsActivationAcknowledgement(
    acknowledgement: ActiveBuffer,
    request: ActivationRequest,
    latestGeneration: number,
    projection: Pick<AppStateSnapshot, 'activeDocumentId' | 'revision' | 'documents'>,
): boolean {
    const projectedDocument = projection.documents[acknowledgement.documentId];
    return (
        request.generation === latestGeneration &&
        request.documentId === acknowledgement.documentId &&
        projection.revision >= (acknowledgement.projectionRevision ?? 0) &&
        projection.activeDocumentId === acknowledgement.documentId &&
        projectedDocument !== undefined &&
        (projectedDocument.contentRevision ?? 0) === (acknowledgement.documentRevision ?? 0)
    );
}

export type InstallationReason = 'activation' | 'reload';

/** One generation is claimed before issuing a command and installed at most once. */
export interface GuardedActivation {
    begin: () => number;
    acknowledge: (
        generation: number,
        acknowledgement: ActiveBuffer | undefined,
        requestedDocumentId?: string,
        reason?: InstallationReason,
    ) => void;
}

interface PendingAcknowledgement {
    reason: InstallationReason;
    acknowledgement: ActiveBuffer;
    request: ActivationRequest;
}

export function useGuardedActivation(
    install: (acknowledgement: ActiveBuffer, reason: InstallationReason) => void,
): GuardedActivation {
    const latestGeneration = useRef(0);
    const installedGeneration = useRef(0);
    const [pending, setPending] = useState<PendingAcknowledgement | null>(null);
    const revision = useAppSelector((state) => state.documents.revision);
    const activeDocumentId = useAppSelector((state) => state.documents.activeDocumentId);
    const documents = useAppSelector((state) => state.documents.byId);
    const projection = useMemo(
        (): Pick<AppStateSnapshot, 'activeDocumentId' | 'revision' | 'documents'> => ({
            activeDocumentId,
            documents,
            revision,
        }),
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
            reason: InstallationReason = 'activation',
        ): void => {
            if (acknowledgement === undefined) return;
            if (generation !== latestGeneration.current) return;
            if (generation <= installedGeneration.current) return;
            setPending({
                acknowledgement,
                reason,
                request: {
                    generation,
                    documentId: requestedDocumentId ?? acknowledgement.documentId,
                },
            });
        },
        [],
    );

    // Command answers may precede their projection patch; wait until identity and revision agree.
    useEffect((): void => {
        if (pending === null) return;
        if (
            pending.request.generation !== latestGeneration.current ||
            pending.request.generation <= installedGeneration.current
        ) {
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
        installedGeneration.current = pending.request.generation;
        setPending(null);
        install(pending.acknowledgement, pending.reason);
    }, [install, pending, projection]);

    return useMemo((): GuardedActivation => ({ acknowledge, begin }), [acknowledge, begin]);
}
