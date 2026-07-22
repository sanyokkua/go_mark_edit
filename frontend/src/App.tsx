import { useCallback, useEffect, useRef, useState } from 'react';
import { Provider } from 'react-redux';

import { dismissNotification } from './logic/store/notificationsSlice';
import { store, useAppDispatch, useAppSelector } from './logic/store';
import {
  bootstrapAppModelProjection,
  type AppModelBootstrapResult,
} from './logic/store/appModelProjection';
import type { ActiveBuffer } from './logic/store/appModelTypes';
import { NotificationToast, ToastProvider } from './ui/primitives/Toast';
import AppShell from './ui/widgets/AppShell';
import { EditorSessionProvider } from './ui/widgets/editorSession';
import StartupFailure from './ui/widgets/StartupFailure';

function startAppModelBootstrap(): Promise<AppModelBootstrapResult> {
  return import('./logic/adapter')
    .then(({ appModelAdapter }) => bootstrapAppModelProjection(appModelAdapter))
    .catch(() => ({ status: 'failed' }));
}

type BootstrapStatus = 'loading' | 'ready' | 'failed';

const AppContents: React.FC = (): React.JSX.Element => {
  const dispatch = useAppDispatch();
  const notifications = useAppSelector((state) => state.notifications.items);
  const [activeBuffer, setActiveBuffer] = useState<ActiveBuffer | null>(null);
  const [bootstrapStatus, setBootstrapStatus] =
    useState<BootstrapStatus>('loading');
  const [isRetrying, setIsRetrying] = useState(false);
  const bootstrapGeneration = useRef(0);

  const runBootstrap = useCallback((isRetry: boolean): void => {
    const generation = bootstrapGeneration.current + 1;
    bootstrapGeneration.current = generation;
    if (isRetry) {
      setIsRetrying(true);
    }

    void startAppModelBootstrap().then(
      (result: AppModelBootstrapResult): void => {
        if (bootstrapGeneration.current !== generation) {
          return;
        }

        setIsRetrying(false);
        if (result.status === 'ready') {
          setActiveBuffer(result.activeBuffer);
          setBootstrapStatus('ready');
          return;
        }

        setBootstrapStatus('failed');
      },
    );
  }, []);

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

  return (
    <ToastProvider>
      <EditorSessionProvider activeBuffer={activeBuffer}>
        {bootstrapStatus === 'failed' ? (
          <StartupFailure
            isRetrying={isRetrying}
            onRetry={(): void => {
              runBootstrap(true);
            }}
          />
        ) : (
          <AppShell assistantVisible={false} />
        )}
        {notifications.map((notification) => (
          <NotificationToast
            key={notification.id}
            notification={notification}
            onDismiss={(id: number): void => {
              dispatch(dismissNotification(id));
            }}
          />
        ))}
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
