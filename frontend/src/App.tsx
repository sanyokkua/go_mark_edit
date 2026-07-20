import { Provider } from 'react-redux';

import { dismissNotification } from './logic/store/notificationsSlice';
import { store, useAppDispatch, useAppSelector } from './logic/store';
import { NotificationToast, ToastProvider } from './ui/primitives/Toast';
import AppShell from './ui/widgets/AppShell';

const AppContents: React.FC = (): React.JSX.Element => {
  const dispatch = useAppDispatch();
  const notifications = useAppSelector((state) => state.notifications.items);

  return (
    <ToastProvider>
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
    </ToastProvider>
  );
};

const App: React.FC = (): React.JSX.Element => (
  <Provider store={store}>
    <AppContents />
  </Provider>
);

export default App;
