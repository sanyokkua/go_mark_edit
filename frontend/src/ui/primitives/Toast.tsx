import * as RadixToast from '@radix-ui/react-toast';
import type { PropsWithChildren } from 'react';

import type { Notification } from '../../logic/store/notificationsSlice';
import styles from './Toast.module.css';

type ToastProviderProps = PropsWithChildren;

interface NotificationToastProps {
  notification: Notification;
  onDismiss: (id: number) => void;
}

export const ToastProvider: React.FC<ToastProviderProps> = ({
  children,
}): React.JSX.Element => (
  <RadixToast.Provider duration={5000}>
    {children}
    <RadixToast.Viewport className={styles.viewport} />
  </RadixToast.Provider>
);

export const NotificationToast: React.FC<NotificationToastProps> = ({
  notification,
  onDismiss,
}): React.JSX.Element => (
  <RadixToast.Root
    className={styles.toast}
    open
    onOpenChange={(open: boolean): void => {
      if (!open) {
        onDismiss(notification.id);
      }
    }}
  >
    <RadixToast.Title>{notification.error.title}</RadixToast.Title>
    <RadixToast.Description>
      {notification.error.message}
    </RadixToast.Description>
  </RadixToast.Root>
);
