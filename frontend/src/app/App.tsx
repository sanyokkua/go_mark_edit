import { useState } from 'react';
import { Provider } from 'react-redux';

import { store } from '../logic/store';
import { ApplicationMenuRequestContext } from '../ui/widgets/applicationMenuRequest';
import { InsertTableRequestContext } from '../ui/widgets/insertTableRequest';
import { EditorSessionProvider } from '../ui/widgets/editorSession';
import { ModalStateProvider } from '../ui/widgets/modalState';
import { TabRemediationContext } from '../ui/widgets/tabRemediation';
import { WorkspaceTreeCommandsContext } from '../ui/widgets/WorkspaceTree/workspaceTreeCommands';
import { AppDialogs } from './AppDialogs';
import { AppFrame } from './AppFrame';
import { TidyCommandsProvider } from './TidyCommandsProvider';
import { useAppPresentation } from './useAppPresentation';
import { useBootstrap } from './useBootstrap';
import { useCloseWorkflow } from './useCloseWorkflow';
import { useCommands } from './useCommands';
import { useConflictCommands } from './useConflictCommands';
import { useDocumentSession } from './useDocumentSession';
import { useDocumentWrites } from './useDocumentWrites';
import { useDropHandler } from './useDropHandler';
import { useLaunchTarget } from './useLaunchTarget';
import { useExternalChanges } from './useExternalChanges';
import { useNotifications } from './useNotifications';
import { usePdfExport } from './usePdfExport';
import { useShutdown } from './useShutdown';
import { useWindowGeometry } from './useWindowGeometry';
import { useWorkflowPrompts } from './useWorkflowPrompts';

const AppWorkflows = ({
    session,
    bootstrap,
    shutdown,
}: {
    session: ReturnType<typeof useDocumentSession>;
    bootstrap: ReturnType<typeof useBootstrap>;
    shutdown: ReturnType<typeof useShutdown>;
}): React.JSX.Element => {
    const [problemsOpen, setProblemsOpen] = useState(false);
    const conflicts = useConflictCommands(session.activation);
    const writes = useDocumentWrites(session, conflicts);
    const close = useCloseWorkflow({ session, shutdown, conflicts, recoverySurface: writes.recoverySurface, writes });
    const commands = useCommands(session, close.closeAllWindowTabs);
    const drops = useDropHandler(commands, bootstrap.status === 'ready');
    useLaunchTarget(commands, bootstrap.status === 'ready');
    const external = useExternalChanges({
        session,
        conflicts,
        bootstrapStatus: bootstrap.status,
        blocked: close.active || writes.active,
    });
    const prompts = useWorkflowPrompts(close, writes, external);
    const pdf = usePdfExport(session);
    const presentation = useAppPresentation({
        session,
        commands,
        writes,
        close,
        exportPdf: pdf.exportPdf,
        requestQuit: shutdown.requestQuit,
        workflowModalOpen:
            prompts.modalOpen ||
            commands.replaceFolderPath !== null ||
            commands.closeFolderPromptOpen ||
            drops.folderPaths.length > 0,
    });
    const notifications = useNotifications({
        ...commands,
        retryWrite: writes.retryWrite,
        dismissWriteFailure: writes.dismissWriteFailure,
        onCloseDocument: close.onCloseDocument,
        requestQuit: shutdown.requestQuit,
    });
    useWindowGeometry(bootstrap.status);

    return (
        <ModalStateProvider modalOpen={presentation.modalOpen}>
            <TabRemediationContext.Provider value={notifications.tabRemediationRef}>
                <WorkspaceTreeCommandsContext.Provider value={commands}>
                    <ApplicationMenuRequestContext.Provider value={presentation.requestMenu}>
                        <InsertTableRequestContext.Provider value={presentation.requestTable}>
                            <AppFrame
                                problemsOpen={problemsOpen}
                                onToggleProblems={(): void => setProblemsOpen((open) => !open)}
                                bootstrap={bootstrap}
                                menuState={presentation.menuState}
                                settingsOpen={presentation.settingsOpen}
                                onSettingsOpenChange={presentation.setSettingsOpen}
                                onQuit={shutdown.requestQuit}
                                onRetry={bootstrap.retry}
                                notices={notifications.notices}
                                banners={notifications.banners}
                                onDismiss={notifications.onDismiss}
                                recovery={writes.recoverySurface}
                                printRequest={pdf.request}
                                shell={{
                                    ...commands,
                                    onOpenLink: commands.openLink,
                                    problemsOpen,
                                    onToggleProblems: (): void => setProblemsOpen((open) => !open),
                                    onCloseProblems: (): void => setProblemsOpen(false),
                                    dropEpoch: drops.dropEpoch,
                                    onCloseDocument: close.onCloseDocument,
                                    onOpenFolder: commands.onOpenFolder,
                                    onExternalConflict: external.receiveConflict,
                                }}
                            >
                                <AppDialogs
                                    status={bootstrap.status}
                                    version={bootstrap.result?.applicationVersion ?? ''}
                                    about={presentation.about}
                                    shortcuts={presentation.shortcuts}
                                    table={presentation.table}
                                    prompts={prompts}
                                    folderCommands={commands}
                                    drops={drops}
                                    recovery={writes.recoverySurface}
                                    announcement={notifications.announcement}
                                />
                            </AppFrame>
                        </InsertTableRequestContext.Provider>
                    </ApplicationMenuRequestContext.Provider>
                </WorkspaceTreeCommandsContext.Provider>
            </TabRemediationContext.Provider>
        </ModalStateProvider>
    );
};

const AppContents: React.FC = (): React.JSX.Element => {
    const session = useDocumentSession();
    const bootstrap = useBootstrap({ onReady: session.onBootstrapReady });
    const shutdown = useShutdown({
        bootstrapStatus: bootstrap.status,
        hydratedPendingCloseId: bootstrap.result?.pendingCloseId ?? null,
    });
    return (
        <EditorSessionProvider activeBuffer={session.activeBuffer} externalEpoch={session.externalEpoch}>
            <TidyCommandsProvider>
                <AppWorkflows session={session} bootstrap={bootstrap} shutdown={shutdown} />
            </TidyCommandsProvider>
        </EditorSessionProvider>
    );
};

const App: React.FC = (): React.JSX.Element => (
    <Provider store={store}>
        <AppContents />
    </Provider>
);
export default App;
