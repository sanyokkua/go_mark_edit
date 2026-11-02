import { t } from '../../i18n';
import type { CommittedWriteWarning } from './appModelTypes';
import { notifyToast } from './notificationsSlice';

export function parseSaveWarning(value: unknown): CommittedWriteWarning | undefined {
    return value === 'durability' || value === 'recent-items' || value === 'view-state' ? value : undefined;
}

export function saveWarningNotification(warning: CommittedWriteWarning, subject: string) {
    return notifyToast({
        code: `save-warning-${warning}`,
        title: t('save.warning.title'),
        message: t(`save.warning.${warning}`),
        severity: 'warning',
        subject,
    });
}
