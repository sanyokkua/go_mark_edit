import * as RadixToast from '@radix-ui/react-toast';
import { type PropsWithChildren } from 'react';

import { formatNumber, t } from '../../i18n';
import Button from './Button';
import styles from './Toast.module.css';
import type {
  LegacyNotification,
  LegacyNotificationRemediation,
  NotificationNotice,
  NotificationTone,
} from './notificationTypes';

type ToastProviderProps = PropsWithChildren;

interface NotificationToastProps {
  notification: NotificationNotice | LegacyNotification;
  onDismiss: (id: number) => void;
  /** Used only for legacy callers; surface actions carry their own callbacks. */
  onRemediate?: (remediation: LegacyNotificationRemediation) => void;
}

const durations: Record<NotificationTone, number> = {
  error: Number.POSITIVE_INFINITY,
  info: 6_000,
  success: 4_000,
  warning: 8_000,
};

function isSurfaceNotice(
  notification: NotificationNotice | LegacyNotification,
): notification is NotificationNotice {
  return 'kind' in notification;
}

function toneFor(
  notification: NotificationNotice | LegacyNotification,
): NotificationTone {
  if (isSurfaceNotice(notification)) {
    return (
      notification.tone ?? (notification.kind === 'error' ? 'error' : 'warning')
    );
  }
  return notification.severity;
}

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
}): React.JSX.Element => {
  const surfaceNotice = isSurfaceNotice(notification);
  const tone = toneFor(notification);
  const actions = surfaceNotice
    ? notification.actions
    : notification.remediations.map((remediation) => ({
        id: remediation.action,
        label: t(remediation.labelKey),
        onActivate: (): void => onRemediate?.(remediation),
      }));
  const count = notification.count ?? 1;
  const persistent =
    notification.persistent === true ||
    (surfaceNotice && notification.kind === 'stuck');
  const dismissible =
    (surfaceNotice && notification.kind !== 'stuck') ||
    (!surfaceNotice && notification.severity === 'error');

  return (
    <RadixToast.Root
      className={styles.toast}
      data-notification-code={
        surfaceNotice
          ? (notification.code ?? notification.id)
          : notification.code
      }
      data-severity={tone}
      duration={persistent ? Number.POSITIVE_INFINITY : durations[tone]}
      open
      onOpenChange={(open: boolean): void => {
        if (!open) {
          onDismiss(notification.id);
        }
      }}
    >
      <RadixToast.Title className={styles.title}>
        {notification.title}
        {count > 1
          ? t('notification.count', {
              count: formatNumber(count),
            })
          : ''}
      </RadixToast.Title>
      <RadixToast.Description className={styles.description}>
        {notification.message}
      </RadixToast.Description>
      <div className={styles.actions}>
        {actions.map((action) => (
          <Button
            className={styles.action}
            key={action.id}
            variant="primary"
            onClick={action.onActivate}
          >
            {action.label}
          </Button>
        ))}
        {dismissible ? (
          <RadixToast.Close asChild>
            <Button className={styles.action} variant="quiet">
              {t('notification.dismiss')}
            </Button>
          </RadixToast.Close>
        ) : null}
      </div>
    </RadixToast.Root>
  );
};
