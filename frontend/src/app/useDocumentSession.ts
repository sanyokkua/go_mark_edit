import { useCallback, useState } from 'react';

import { useAppSelector } from '../logic/store';
import type { ActiveBuffer } from '../logic/store/appModelTypes';
import type { AppModelBootstrapResult } from '../logic/store/appModelProjection';
import { useGuardedActivation, type InstallationReason } from '../ui/widgets/editorSession';

/** Owns installed editor content; metadata remains in the backend projection. */
export function useDocumentSession() {
    const [session, setSession] = useState({ activeBuffer: null as ActiveBuffer | null, externalEpoch: 0 });
    const documentsById = useAppSelector((state) => state.documents.byId);
    const orderedDocumentIds = useAppSelector((state) => state.documents.orderedIds);
    const activeDocumentId = useAppSelector((state) => state.documents.activeDocumentId);
    const install = useCallback((activeBuffer: ActiveBuffer, reason?: InstallationReason): void => {
        setSession((current) => ({
            activeBuffer,
            externalEpoch: current.externalEpoch + (reason === 'reload' ? 1 : 0),
        }));
    }, []);
    const activation = useGuardedActivation(install);
    const onBootstrapReady = useCallback((result: Extract<AppModelBootstrapResult, { status: 'ready' }>): void => {
        setSession((current) => ({ ...current, activeBuffer: result.activeBuffer }));
    }, []);

    if (!activeDocumentId && session.activeBuffer !== null) {
        setSession({ ...session, activeBuffer: null });
    }

    return {
        ...session,
        activation,
        onBootstrapReady,
        documentsById,
        orderedDocumentIds,
        activeDocument: activeDocumentId === null ? undefined : documentsById[activeDocumentId],
    } as const;
}

export type DocumentSession = ReturnType<typeof useDocumentSession>;
