import * as RadixToast from '@radix-ui/react-toast';
import type { PropsWithChildren } from 'react';

import { formatNumber, t } from '../../i18n';
import type {
  Notification,
  NotificationRemediation,
  NotificationSeverity,
} from '../../logic/store/notificationsSlice';
import styles from './Toast.module.css';

type ToastProviderProps = PropsWithChildren;

interface NotificationToastProps {
  notification: Notification;
  onDismiss: (id: number) => void;
  onRemediate?: (remediation: NotificationRemediation) => void;
}

const durations: Record<NotificationSeverity, number> = {
  error: Number.POSITIVE_INFINITY,
  info: 6_000,
  success: 4_000,
  warning: 8_000,
};

export const ToastProvider: React.FC<ToastProviderProps> = ({
  children,
}): React.JSX.Element => (
  <RadixToast.Provider>
    {children}
    <RadixToast.Viewport className={styles.viewport} />
  </RadixToast.Provider>
);

export const NotificationToast: React.FC<NotificationToastProps> = ({
  notification,
  onDismiss,
  onRemediate,
}): React.JSX.Element => (
  <RadixToast.Root
    className={styles.toast}
    data-notification-code={notification.code}
    data-severity={notification.severity}
    duration={durations[notification.severity]}
    open
    onOpenChange={(open: boolean): void => {
      if (!open) {
        onDismiss(notification.id);
      }
    }}
  >
    <RadixToast.Title>
      {notification.title}
      {notification.count > 1
        ? t('notification.count', {
            count: formatNumber(notification.count),
          })
        : ''}
    </RadixToast.Title>
    <RadixToast.Description>{notification.message}</RadixToast.Description>
    <div className={styles.actions}>
      {notification.remediation !== undefined && onRemediate !== undefined ? (
        <button
          className={styles.action}
          type="button"
          onClick={(): void => onRemediate(notification.remediation!)}
        >
          {t(notification.remediation.labelKey)}
        </button>
      ) : null}
      {notification.severity === 'error' ? (
        <RadixToast.Close className={styles.action}>
          {t('notification.dismiss')}
        </RadixToast.Close>
      ) : null}
    </div>
  </RadixToast.Root>
);
