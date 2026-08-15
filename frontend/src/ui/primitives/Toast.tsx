import * as RadixToast from '@radix-ui/react-toast';
import { useEffect, type PropsWithChildren } from 'react';

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
    duration={durations[notification.severity]}
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
      {notification.remediation !== undefined ? (
        <button
          className={styles.action}
          type="button"
          onClick={(): void => {
            onRemediate(notification.remediation as NotificationRemediation);
          }}
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

export const ParityToastSurface: React.FC = (): React.JSX.Element => {
  useEffect((): (() => void) => {
    const keepParityToastRouteAtTop = (): void => {
      if (window.scrollY !== 0) window.scrollTo(0, 0);
    };
    keepParityToastRouteAtTop();
    window.addEventListener('scroll', keepParityToastRouteAtTop, {
      passive: true,
    });
    return (): void => {
      window.removeEventListener('scroll', keepParityToastRouteAtTop);
    };
  }, []);

  return (
    <div className={styles.parityViewport} data-notification-code="parity">
      <div className={`${styles.parityToast} ${styles.parityToastOk}`}>
        <span className={styles.parityToastIcon}>✓</span>
        <span className={styles.parityToastText}>
          <b>{t('parity.toast.saved.title')}</b>
          <span>{t('parity.toast.saved.message')}</span>
        </span>
      </div>
      <div className={styles.parityToast}>
        <span className={styles.parityToastIcon}>ℹ</span>
        <span className={styles.parityToastText}>
          <b>{t('parity.toast.formatted.title')}</b>
          <span>{t('parity.toast.formatted.message')}</span>
        </span>
      </div>
      <div className={`${styles.parityToast} ${styles.parityToastWarn}`}>
        <span className={styles.parityToastIcon}>⚠</span>
        <span className={styles.parityToastText}>
          <b>{t('parity.toast.lint.title')}</b>
          <span>{t('parity.toast.lint.message')}</span>
        </span>
      </div>
      <div className={`${styles.parityToast} ${styles.parityToastErr}`}>
        <span className={styles.parityToastIcon}>⤫</span>
        <span className={styles.parityToastText}>
          <b>{t('parity.toast.provider.title')}</b>
          <span>{t('parity.toast.provider.message')}</span>
        </span>
      </div>
    </div>
  );
};
