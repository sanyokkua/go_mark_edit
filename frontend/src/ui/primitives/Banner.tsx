import { formatNumber, t } from '../../i18n';
import styles from './Banner.module.css';
import type {
  LegacyNotification,
  NotificationNotice,
  NotificationTone,
} from './notificationTypes';

interface NotificationBannerProps {
  notification: NotificationNotice | LegacyNotification;
}

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

const NotificationBanner: React.FC<NotificationBannerProps> = ({
  notification,
}): React.JSX.Element => {
  const tone = toneFor(notification);
  const count = notification.count ?? 1;
  return (
    <section
      aria-label={notification.title}
      className={styles.banner}
      data-severity={tone}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      <strong>
        {notification.title}
        {count > 1
          ? t('notification.count', {
              count: formatNumber(count),
            })
          : ''}
      </strong>
      <span>{notification.message}</span>
    </section>
  );
};

export default NotificationBanner;
