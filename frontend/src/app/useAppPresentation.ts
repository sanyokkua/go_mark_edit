import { useMemo, useState } from 'react';

import type { ApplicationMenuState } from '../ui/widgets/Menubar/ApplicationMenubar';
import type { ApplicationMenuTarget } from '../ui/widgets/applicationMenuRequest';
import type { DocumentSession } from './useDocumentSession';
import type { UseCommandsResult } from './useCommands';
import type { DocumentWrites } from './useDocumentWrites';
import type { CloseWorkflow } from './useCloseWorkflow';

interface AppPresentationOptions {
    session: DocumentSession;
    commands: UseCommandsResult;
    writes: DocumentWrites;
    close: CloseWorkflow;
    requestQuit: () => void;
    workflowModalOpen: boolean;
}

/** Local shell UI state and the existing menubar command contract. */
export function useAppPresentation({
    session,
    commands,
    writes,
    close,
    requestQuit,
    workflowModalOpen,
}: AppPresentationOptions) {
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [aboutOpen, setAboutOpen] = useState(false);
    const [shortcutsOpen, setShortcutsOpen] = useState(false);
    const [requestedMenu, requestMenu] = useState<ApplicationMenuTarget | null>(null);
    const modalOpen = settingsOpen || aboutOpen || shortcutsOpen || workflowModalOpen;
    const menuState = useMemo<ApplicationMenuState>(
        () => ({
            ...commands,
            onSave: writes.onSave,
            onSaveAs: writes.onSaveAs,
            onCloseDocument: close.onCloseDocument,
            onQuit: requestQuit,
            modalOpen,
            documentId: session.activeDocument?.documentId,
            sessionDocumentId: session.activeBuffer?.documentId,
            writable:
                session.activeDocument !== undefined &&
                session.activeDocument.status !== 'read-only' &&
                (session.activeDocument.capability === undefined || session.activeDocument.capability === 'writable'),
            onAbout: () => setAboutOpen(true),
            onShortcuts: () => setShortcutsOpen(true),
            requestedMenu,
            onRequestedMenuHandled: () => requestMenu(null),
        }),
        [
            close.onCloseDocument,
            commands,
            modalOpen,
            requestQuit,
            requestedMenu,
            session.activeBuffer?.documentId,
            session.activeDocument,
            writes.onSave,
            writes.onSaveAs,
        ],
    );
    return {
        modalOpen,
        menuState,
        requestMenu,
        settingsOpen,
        setSettingsOpen,
        about: { open: aboutOpen, onOpenChange: setAboutOpen },
        shortcuts: { open: shortcutsOpen, onOpenChange: setShortcutsOpen },
    } as const;
}
