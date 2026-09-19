import { Provider } from 'react-redux';

import { store } from '../logic/store';
import { ApplicationMenuRequestContext } from '../ui/widgets/applicationMenuRequest';
import { EditorSessionProvider } from '../ui/widgets/editorSession';
import { ModalStateProvider } from '../ui/widgets/modalState';
import { TabRemediationContext } from '../ui/widgets/tabRemediation';
import { AppDialogs } from './AppDialogs';
import { AppFrame } from './AppFrame';
import { useAppPresentation } from './useAppPresentation';
import { useBootstrap } from './useBootstrap';
import { useCloseWorkflow } from './useCloseWorkflow';
import { useCommands } from './useCommands';
import { useConflictCommands } from './useConflictCommands';
import { useDocumentSession } from './useDocumentSession';
import { useDocumentWrites } from './useDocumentWrites';
import { useExternalChanges } from './useExternalChanges';
import { useNotifications } from './useNotifications';
import { useShutdown } from './useShutdown';
import { useWindowGeometry } from './useWindowGeometry';
import { useWorkflowPrompts } from './useWorkflowPrompts';

const AppContents: React.FC = (): React.JSX.Element => {
    const session = useDocumentSession();
    const bootstrap = useBootstrap({ onReady: session.onBootstrapReady });
    const shutdown = useShutdown({
        bootstrapStatus: bootstrap.status,
        hydratedPendingCloseId: bootstrap.result?.pendingCloseId ?? null,
    });
    const commands = useCommands(session);
    const conflicts = useConflictCommands(session.activation);
    const writes = useDocumentWrites(session, conflicts);
    const close = useCloseWorkflow({ session, shutdown, conflicts, recoverySurface: writes.recoverySurface });
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
        workflowModalOpen: prompts.modalOpen,
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
                                onCloseDocument: close.onCloseDocument,
                                onExternalConflict: external.receiveConflict,
                            }}
                        >
                            <AppDialogs
                                status={bootstrap.status}
                                version={bootstrap.result?.applicationVersion ?? ''}
                                about={presentation.about}
                                shortcuts={presentation.shortcuts}
                                prompts={prompts}
                                recovery={writes.recoverySurface}
                                announcement={notifications.announcement}
                            />
                        </AppFrame>
                    </ApplicationMenuRequestContext.Provider>
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
