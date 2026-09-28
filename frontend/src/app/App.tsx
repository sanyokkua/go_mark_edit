import { useEffect } from 'react';
import { Provider } from 'react-redux';

import { store, useAppDispatch, useAppSelector } from '../logic/store';
import { setWorkspaceVisible } from '../logic/store/uiLayoutCommands';
import { ApplicationMenuRequestContext } from '../ui/widgets/applicationMenuRequest';
import { EditorSessionProvider } from '../ui/widgets/editorSession';
import { ModalStateProvider } from '../ui/widgets/modalState';
import { TabRemediationContext } from '../ui/widgets/tabRemediation';
import { WorkspaceTreeCommandsContext } from '../ui/widgets/WorkspaceTree/workspaceTreeCommands';
import { AppDialogs } from './AppDialogs';
import { AppFrame } from './AppFrame';
import { useAppPresentation } from './useAppPresentation';
import { useBootstrap } from './useBootstrap';
import { useCloseWorkflow } from './useCloseWorkflow';
import { useCommands } from './useCommands';
import { useConflictCommands } from './useConflictCommands';
import { useDocumentSession } from './useDocumentSession';
import { useDocumentWrites } from './useDocumentWrites';
import { useDropHandler } from './useDropHandler';
import { useExternalChanges } from './useExternalChanges';
import { useNotifications } from './useNotifications';
import { useShutdown } from './useShutdown';
import { useWindowGeometry } from './useWindowGeometry';
import { useWorkflowPrompts } from './useWorkflowPrompts';

const AppContents: React.FC = (): React.JSX.Element => {
    const dispatch = useAppDispatch();
    const workspaceRootPath = useAppSelector((state) => state.workspace.snapshot?.rootPath);
    useEffect(() => {
        if (workspaceRootPath !== undefined && workspaceRootPath !== null) {
            void dispatch(setWorkspaceVisible(true));
        }
    }, [dispatch, workspaceRootPath]);
    const session = useDocumentSession();
    const bootstrap = useBootstrap({ onReady: session.onBootstrapReady });
    const shutdown = useShutdown({
        bootstrapStatus: bootstrap.status,
        hydratedPendingCloseId: bootstrap.result?.pendingCloseId ?? null,
    });
    const conflicts = useConflictCommands(session.activation);
    const writes = useDocumentWrites(session, conflicts);
    const close = useCloseWorkflow({ session, shutdown, conflicts, recoverySurface: writes.recoverySurface });
    const commands = useCommands(session, close.closeAllWindowTabs);
    const drops = useDropHandler(commands, bootstrap.status === 'ready');
    const external = useExternalChanges({
        session,
        conflicts,
        bootstrapStatus: bootstrap.status,
        blocked: close.active || writes.active,
    });
    const prompts = useWorkflowPrompts(close, writes, external);
    const presentation = useAppPresentation({
        session,
        commands,
        writes,
        close,
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
                <EditorSessionProvider activeBuffer={session.activeBuffer} externalEpoch={session.externalEpoch}>
                    <WorkspaceTreeCommandsContext.Provider value={commands}>
                        <ApplicationMenuRequestContext.Provider value={presentation.requestMenu}>
                            <AppFrame
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
                                shell={{
                                    ...commands,
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
                                    prompts={prompts}
                                    folderCommands={commands}
                                    drops={drops}
                                    recovery={writes.recoverySurface}
                                    announcement={notifications.announcement}
                                />
                            </AppFrame>
                        </ApplicationMenuRequestContext.Provider>
                    </WorkspaceTreeCommandsContext.Provider>
                </EditorSessionProvider>
            </TabRemediationContext.Provider>
        </ModalStateProvider>
    );
};

const App: React.FC = (): React.JSX.Element => (
    <Provider store={store}>
        <AppContents />
    </Provider>
);
export default App;
