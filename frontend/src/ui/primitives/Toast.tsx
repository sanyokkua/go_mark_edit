import * as RadixToast from '@radix-ui/react-toast';
import { type PropsWithChildren } from 'react';

import { formatNumber, t } from '../../i18n';
import type {
  Notification,
  NotificationRemediation,
  NotificationSeverity,
} from '../../logic/store/notificationsSlice';
import Button from './Button';
import styles from './Toast.module.css';

type ToastProviderProps = PropsWithChildren;

interface NotificationToastProps {
  notification: Notification;
  onDismiss: (id: number) => void;
  /**
   * Required, not optional, and that is the point.
   *
   * While it was optional the remediation button rendered only when a caller
   * happened to pass it, the one production render site did not, and the entire
   * fixed remediation vocabulary was unreachable in the running application
   * without a single test going red. An optional prop lets the next render site
   * reintroduce exactly that defect; a required one cannot.
   */
  onRemediate: (remediation: NotificationRemediation) => void;
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
    duration={
      notification.persistent
        ? Number.POSITIVE_INFINITY
        : durations[notification.severity]
    }
    open
    onOpenChange={(open: boolean): void => {
      if (!open) {
        onDismiss(notification.id);
      }
    }}
  >
    <RadixToast.Title className={styles.title}>
      {notification.title}
      {notification.count > 1
        ? t('notification.count', {
            count: formatNumber(notification.count),
          })
        : ''}
    </RadixToast.Title>
    <RadixToast.Description className={styles.description}>
      {notification.message}
    </RadixToast.Description>
    <div className={styles.actions}>
      {/*
       * Every offered control, in contract order — not just the first. Two
       * contract rows pair two actions ("Retry; a Reveal failure also offers
       * Copy path"), and while this rendered one button the second was
       * unreachable however faithfully the backend sent it.
       */}
      {notification.remediations.map((remediation: NotificationRemediation) => (
        <Button
          className={styles.action}
          key={remediation.action}
          variant="primary"
          onClick={(): void => {
            onRemediate(remediation);
          }}
        >
          {t(remediation.labelKey)}
        </Button>
      ))}
      {notification.severity === 'error' ? (
        <RadixToast.Close asChild>
          <Button className={styles.action} variant="quiet">
            {t('notification.dismiss')}
          </Button>
        </RadixToast.Close>
      ) : null}
    </div>
  </RadixToast.Root>
);
