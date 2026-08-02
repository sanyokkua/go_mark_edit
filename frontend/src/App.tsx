import { useCallback, useEffect, useRef, useState } from 'react';
import { Provider } from 'react-redux';

import {
  dismissNotification,
  resetNotifications,
} from './logic/store/notificationsSlice';
import { store, useAppDispatch, useAppSelector } from './logic/store';
import {
  setEditorPaneVisible,
  setPreviewPaneVisible,
} from './logic/store/docViewCommands';
import {
  bootstrapAppModelProjection,
  type AppModelBootstrapResult,
} from './logic/store/appModelProjection';
import type { ActiveBuffer } from './logic/store/appModelTypes';
import { setWorkspaceVisible } from './logic/store/uiLayoutCommands';
import { NotificationToast, ToastProvider } from './ui/primitives/Toast';
import NotificationBanner from './ui/primitives/Banner';
import AppShell from './ui/widgets/AppShell';
import AboutDialog from './ui/widgets/AboutDialog';
import AppearanceControls from './ui/widgets/AppearanceControls';
import ShellMenuRow from './ui/widgets/ShellMenuRow';
import { EditorSessionProvider } from './ui/widgets/editorSession';
import StartupFailure from './ui/widgets/StartupFailure';

let activeRetry: Promise<AppModelBootstrapResult> | undefined;

function startAppModelBootstrap(
  isRetry: boolean,
): Promise<AppModelBootstrapResult> {
  if (isRetry && activeRetry !== undefined) {
    return activeRetry;
  }
  const attempt = import('./logic/adapter')
    .then(async ({ applicationAdapter, appModelAdapter, windowAdapter }) => {
      if (isRetry) {
        await applicationAdapter.retryStartup();
      }
      const result = await bootstrapAppModelProjection(appModelAdapter);
      if (result.status === 'ready') {
        await windowAdapter.windowReady();
      }
      return result;
    })
    .catch((): AppModelBootstrapResult => ({ status: 'failed' }));
  if (!isRetry) {
    return attempt;
  }
  const retryAttempt = attempt.finally((): void => {
    activeRetry = undefined;
  });
  activeRetry = retryAttempt;
  return retryAttempt;
}

type BootstrapStatus = 'loading' | 'ready' | 'failed';

const AppContents: React.FC = (): React.JSX.Element => {
  const dispatch = useAppDispatch();
  const notifications = useAppSelector((state) => state.notifications.items);
  const banners = useAppSelector((state) => state.notifications.banners);
  const activeDocument = useAppSelector(
    (state) => state.documents.byId[state.documents.activeDocumentId],
  );
  const workspaceVisible = useAppSelector(
    (state) => state.ui.layout.sidebarVisible ?? true,
  );
  const [activeBuffer, setActiveBuffer] = useState<ActiveBuffer | null>(null);
  const [bootstrapStatus, setBootstrapStatus] =
    useState<BootstrapStatus>('loading');
  const [isRetrying, setIsRetrying] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [version, setVersion] = useState('');
  const bootstrapGeneration = useRef(0);

  const runBootstrap = useCallback(
    (isRetry: boolean): void => {
      const generation = bootstrapGeneration.current + 1;
      bootstrapGeneration.current = generation;
      if (isRetry) {
        setIsRetrying(true);
        dispatch(resetNotifications());
      }

      void startAppModelBootstrap(isRetry).then(
        (result: AppModelBootstrapResult): void => {
          if (bootstrapGeneration.current !== generation) {
            return;
          }

          setIsRetrying(false);
          if (result.status === 'ready') {
            setActiveBuffer(result.activeBuffer);
            setVersion(result.applicationVersion);
            setBootstrapStatus('ready');
            return;
          }

          setBootstrapStatus('failed');
        },
      );
    },
    [dispatch],
  );

  useEffect((): (() => void) => {
    let isCurrent = true;
    void Promise.resolve().then((): void => {
      if (isCurrent) {
        runBootstrap(false);
      }
    });

    return (): void => {
      isCurrent = false;
      bootstrapGeneration.current += 1;
    };
  }, [runBootstrap]);

  useEffect((): (() => void) | undefined => {
    if (bootstrapStatus !== 'ready') {
      return undefined;
    }

    let disposed = false;
    const reportNativeGeometry = (): void => {
      void import('./logic/adapter').then(
        async ({ appModelAdapter, windowAdapter }): Promise<void> => {
          const geometry = await windowAdapter.getNativeGeometry();
          if (disposed) {
            return;
          }
          await appModelAdapter.setUILayout({
            windowHeight: geometry.height,
            windowMaximized: geometry.maximized,
            windowWidth: geometry.width,
          });
        },
      );
    };
    window.addEventListener('resize', reportNativeGeometry);
    return (): void => {
      disposed = true;
      window.removeEventListener('resize', reportNativeGeometry);
    };
  }, [bootstrapStatus]);

  return (
    <ToastProvider>
      <EditorSessionProvider activeBuffer={activeBuffer}>
        <div className="application-frame">
          <div className="application-menu">
            <AppearanceControls
              visible={bootstrapStatus === 'ready'}
              settingsOpen={settingsOpen}
              onSettingsOpenChange={setSettingsOpen}
              settingsMenuRenderer={(settingsMenuProps): React.JSX.Element => (
                <ShellMenuRow
                  modalOpen={settingsOpen || aboutOpen}
                  onAbout={(): void => setAboutOpen(true)}
                  settingsMenuProps={settingsMenuProps}
                  viewMenuProps={
                    activeDocument === undefined
                      ? undefined
                      : {
                          editorVisible: activeDocument.view.editorVisible,
                          previewVisible: activeDocument.view.previewVisible,
                          onEditorVisibilityChange: (visible): void => {
                            void dispatch(setEditorPaneVisible(visible));
                          },
                          onPreviewVisibilityChange: (visible): void => {
                            void dispatch(setPreviewPaneVisible(visible));
                          },
                          workspaceVisible,
                          onWorkspaceVisibilityChange: (visible): void => {
                            void dispatch(setWorkspaceVisible(visible));
                          },
                        }
                  }
                />
              )}
            />
          </div>
          <div className="application-content">
            {bootstrapStatus === 'failed' ? (
              <StartupFailure
                isRetrying={isRetrying}
                onRetry={(): void => {
                  runBootstrap(true);
                }}
              />
            ) : bootstrapStatus === 'ready' ? (
              <>
                {banners.map((notification) => (
                  <NotificationBanner
                    key={`${notification.id}:${notification.refreshGeneration}`}
                    notification={notification}
                  />
                ))}
                <AppShell />
              </>
            ) : null}
          </div>
          <AboutDialog
            open={bootstrapStatus === 'ready' && aboutOpen}
            onOpenChange={setAboutOpen}
            version={version}
          />
          {bootstrapStatus === 'ready'
            ? notifications.map((notification) => (
                <NotificationToast
                  key={`${notification.id}:${notification.refreshGeneration}`}
                  notification={notification}
                  onDismiss={(id: number): void => {
                    dispatch(dismissNotification(id));
                  }}
                />
              ))
            : null}
        </div>
      </EditorSessionProvider>
    </ToastProvider>
  );
};

const App: React.FC = (): React.JSX.Element => (
  <Provider store={store}>
    <AppContents />
  </Provider>
);

export default App;
