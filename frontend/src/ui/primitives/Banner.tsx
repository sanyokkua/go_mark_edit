import { formatNumber, t } from '../../i18n';
import type { Notification } from '../../logic/store/notificationsSlice';
import styles from './Banner.module.css';

interface NotificationBannerProps {
  notification: Notification;
}

const NotificationBanner: React.FC<NotificationBannerProps> = ({
  notification,
}): React.JSX.Element => (
  <section
    aria-label={notification.title}
    className={styles.banner}
    data-severity={notification.severity}
    role={notification.severity === 'error' ? 'alert' : 'status'}
  >
    <strong>
      {notification.title}
      {notification.count > 1
        ? t('notification.count', {
            count: formatNumber(notification.count),
          })
        : ''}
    </strong>
    <span>{notification.message}</span>
  </section>
);

export default NotificationBanner;
