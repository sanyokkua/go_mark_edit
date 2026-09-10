import NotificationBanner from '../../primitives/Banner';
import { NotificationToast, ToastProvider } from '../../primitives/Toast';
import type { NotificationNotice } from '../../primitives/notificationTypes';

export interface NotificationsProps {
  readonly notices: readonly NotificationNotice[];
  /** Continuing conditions occupy the same owned surface but remain inline. */
  readonly banners?: readonly NotificationNotice[];
  readonly onDismiss?: (id: number) => void;
}

const Notifications: React.FC<NotificationsProps> = ({
  banners = [],
  notices,
  onDismiss = (): void => undefined,
}: NotificationsProps): React.JSX.Element => (
  <ToastProvider>
    {banners.map((notice) => (
      <NotificationBanner key={notice.id} notification={notice} />
    ))}
    {notices.map((notice) => (
      <NotificationToast
        key={notice.id}
        notification={notice}
        onDismiss={onDismiss}
      />
    ))}
  </ToastProvider>
);

export default Notifications;
export type { NotificationNotice } from '../../primitives/notificationTypes';
