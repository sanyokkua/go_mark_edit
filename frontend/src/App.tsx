import { useEffect, useState } from 'react';
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
import { EditorSessionContext } from './ui/widgets/editorSession';

function startAppModelBootstrap(): Promise<AppModelBootstrapResult> {
  return import('./logic/adapter')
    .then(({ appModelAdapter }) => bootstrapAppModelProjection(appModelAdapter))
    .catch(() => ({ status: 'failed' }));
}

const appModelBootstrap = startAppModelBootstrap();

const AppContents: React.FC = (): React.JSX.Element => {
  const dispatch = useAppDispatch();
  const notifications = useAppSelector((state) => state.notifications.items);
  const [activeBuffer, setActiveBuffer] = useState<ActiveBuffer | null>(null);

  useEffect((): (() => void) => {
    let isMounted = true;
    void appModelBootstrap.then((result: AppModelBootstrapResult): void => {
      if (isMounted && result.status === 'ready') {
        setActiveBuffer(result.activeBuffer);
      }
    });

    return (): void => {
      isMounted = false;
    };
  }, []);

  return (
    <ToastProvider>
      <EditorSessionContext.Provider value={activeBuffer}>
        <AppShell assistantVisible={false} />
        {notifications.map((notification) => (
          <NotificationToast
            key={notification.id}
            notification={notification}
            onDismiss={(id: number): void => {
              dispatch(dismissNotification(id));
            }}
          />
        ))}
      </EditorSessionContext.Provider>
    </ToastProvider>
  );
};

const App: React.FC = (): React.JSX.Element => (
  <Provider store={store}>
    <AppContents />
  </Provider>
);

export default App;
