import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Provider } from 'react-redux';

import {
  dismissNotification,
  resetNotifications,
} from './logic/store/notificationsSlice';
import { store, useAppDispatch, useAppSelector } from './logic/store';
import {
  setEditorPaneVisible,
  setPreviewPaneVisible,
  setViewArrangement,
} from './logic/store/docViewCommands';
import {
  bootstrapAppModelProjection,
  type AppModelBootstrapResult,
} from './logic/store/appModelProjection';
import type {
  ActiveBuffer,
  ViewArrangement,
} from './logic/store/appModelTypes';
import { setWorkspaceVisible } from './logic/store/uiLayoutCommands';
import { appModelAdapter } from './logic/adapter';
import { useEditorSettings } from './logic/settings/editorSettings';
import { bootstrapSettingsProjection } from './logic/store/settingsProjection';
import { NotificationToast, ToastProvider } from './ui/primitives/Toast';
import NotificationBanner from './ui/primitives/Banner';
import AppShell from './ui/widgets/AppShell';
import AboutDialog from './ui/widgets/AboutDialog';
import AppearanceControls from './ui/widgets/AppearanceControls';
import ShellMenuRow from './ui/widgets/ShellMenuRow';
import type { SettingsMenuProps } from './ui/widgets/SettingsMenu';
import { EditorSessionProvider } from './ui/widgets/editorSession';
import StartupFailure from './ui/widgets/StartupFailure';
import ShortcutsDialog from './ui/widgets/ShortcutsDialog';
import { ModalStateProvider } from './ui/widgets/modalState';

let activeRetry: Promise<AppModelBootstrapResult> | undefined;

function startAppModelBootstrap(
  isRetry: boolean,
): Promise<AppModelBootstrapResult> {
  if (isRetry && activeRetry !== undefined) {
    return activeRetry;
  }
  const attempt = import('./logic/adapter')
    .then(
      async ({
        applicationAdapter,
        appModelAdapter,
        settingsAdapter,
        windowAdapter,
      }) => {
        if (isRetry) {
          await applicationAdapter.retryStartup();
        }
        const [result] = await Promise.all([
          bootstrapAppModelProjection(appModelAdapter),
          bootstrapSettingsProjection(settingsAdapter),
        ]);
        if (result.status === 'ready') {
          await windowAdapter.windowReady();
        }
        return result;
      },
    )
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

interface ApplicationMenuState {
  modalOpen: boolean;
  onAbout: () => void;
  onNewDocument: (expectedTabSetRevision: number) => Promise<unknown>;
  onOpenDocument: (expectedTabSetRevision: number) => Promise<unknown>;
  onShortcuts: () => void;
}

const ApplicationMenuContext = createContext<ApplicationMenuState | null>(null);

const ApplicationShellMenu: React.FC<SettingsMenuProps> = (
  settingsMenuProps,
): React.JSX.Element => {
  const menuState = useContext(ApplicationMenuContext);
  if (menuState === null) {
    throw new Error('ApplicationShellMenu requires ApplicationMenuContext');
  }
  const dispatch = useAppDispatch();
  const activeDocument = useAppSelector((state) =>
    state.documents.activeDocumentId === null
      ? undefined
      : state.documents.byId[state.documents.activeDocumentId],
  );
  const workspaceVisible = useAppSelector(
    (state) => state.ui.layout.sidebarVisible ?? true,
  );
  const tabSetRevision = useAppSelector(
    (state) => state.documents.tabSetRevision,
  );
  const editorSettings = useEditorSettings();

  return (
    <ShellMenuRow
      modalOpen={menuState.modalOpen}
      onAbout={menuState.onAbout}
      onNewDocument={(): Promise<unknown> =>
        menuState.onNewDocument(tabSetRevision)
      }
      onOpenDocument={(): Promise<unknown> =>
        menuState.onOpenDocument(tabSetRevision)
      }
      onShortcuts={menuState.onShortcuts}
      settingsMenuProps={{
        ...settingsMenuProps,
        editorSettings: editorSettings.settings,
        onEditorSettingsChange: (patch): void => {
          void editorSettings.update(patch).catch((): void => undefined);
        },
      }}
      viewMenuProps={
        activeDocument === undefined
          ? undefined
          : {
              arrangement: activeDocument.view.arrangement as ViewArrangement,
              editorVisible: activeDocument.view.editorVisible,
              lineNumbers: editorSettings.settings.lineNumbers,
              previewVisible: activeDocument.view.previewVisible,
              onArrangementChange: (arrangement): void => {
                void dispatch(setViewArrangement(arrangement));
              },
              onEditorVisibilityChange: (visible): void => {
                void dispatch(setEditorPaneVisible(visible));
              },
              onFullscreen: (): void => {
                void import('./logic/adapter').then(({ windowAdapter }) => {
                  void windowAdapter.toggleFullscreen();
                });
              },
              onLineNumbersChange: (enabled): void => {
                void editorSettings.update({ lineNumbers: enabled });
              },
              onPreviewVisibilityChange: (visible): void => {
                void dispatch(setPreviewPaneVisible(visible));
              },
              onWordWrapChange: (enabled): void => {
                void editorSettings.update({ wordWrap: enabled });
              },
              wordWrap: editorSettings.settings.wordWrap,
              workspaceVisible,
              onWorkspaceVisibilityChange: (visible): void => {
                void dispatch(setWorkspaceVisible(visible));
              },
            }
      }
    />
  );
};

const AppContents: React.FC = (): React.JSX.Element => {
  const dispatch = useAppDispatch();
  const notifications = useAppSelector((state) => state.notifications.items);
  const banners = useAppSelector((state) => state.notifications.banners);
  const [activeBuffer, setActiveBuffer] = useState<ActiveBuffer | null>(null);
  const [bootstrapStatus, setBootstrapStatus] =
    useState<BootstrapStatus>('loading');
  const [isRetrying, setIsRetrying] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [version, setVersion] = useState('');
  const bootstrapGeneration = useRef(0);
  const onNewDocument = useCallback(
    async (expectedTabSetRevision: number): Promise<unknown> => {
      const result = await appModelAdapter.newDocument?.(
        expectedTabSetRevision,
      );
      if (result?.data !== undefined) {
        setActiveBuffer(result.data);
      }
      return result;
    },
    [],
  );
  const onOpenDocument = useCallback(
    async (expectedTabSetRevision: number): Promise<unknown> => {
      const result = await appModelAdapter.openDocument?.(
        expectedTabSetRevision,
      );
      if (result?.activeBuffer !== undefined) {
        setActiveBuffer(result.activeBuffer);
      }
      return result;
    },
    [],
  );
  const applicationMenuState = useMemo<ApplicationMenuState>(
    () => ({
      modalOpen: settingsOpen || aboutOpen || shortcutsOpen,
      onAbout: (): void => setAboutOpen(true),
      onNewDocument,
      onOpenDocument,
      onShortcuts: (): void => setShortcutsOpen(true),
    }),
    [aboutOpen, onNewDocument, onOpenDocument, settingsOpen, shortcutsOpen],
  );

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
      <ModalStateProvider
        modalOpen={settingsOpen || aboutOpen || shortcutsOpen}
      >
        <EditorSessionProvider activeBuffer={activeBuffer}>
          <div className="application-frame">
            <div className="application-menu">
              <ApplicationMenuContext.Provider value={applicationMenuState}>
                <AppearanceControls
                  visible={bootstrapStatus === 'ready'}
                  settingsOpen={settingsOpen}
                  onSettingsOpenChange={setSettingsOpen}
                  settingsMenuRenderer={ApplicationShellMenu}
                />
              </ApplicationMenuContext.Provider>
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
            <ShortcutsDialog
              open={bootstrapStatus === 'ready' && shortcutsOpen}
              onOpenChange={setShortcutsOpen}
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
      </ModalStateProvider>
    </ToastProvider>
  );
};

const App: React.FC = (): React.JSX.Element => (
  <Provider store={store}>
    <AppContents />
  </Provider>
);

export default App;
