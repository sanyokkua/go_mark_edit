import { t } from '../../i18n';
import type { CommittedWriteWarning, CommittedWriteWarningReason } from './appModelTypes';
import { notifyToast } from './notificationsSlice';

export function parseSaveWarning(value: unknown): CommittedWriteWarning | undefined {
    return value === 'durability' || value === 'recent-items' || value === 'view-state' ? value : undefined;
}

export function parseSaveWarningReason(value: unknown): CommittedWriteWarningReason | undefined {
    return value === 'metadata-stat' ||
        value === 'readback' ||
        value === 'content-mismatch' ||
        value === 'directory-sync'
        ? value
        : undefined;
}

export function saveWarningNotification(
    warning: CommittedWriteWarning,
    subject: string,
    reason?: CommittedWriteWarningReason,
) {
    return notifyToast({
        code: `save-warning-${warning}`,
        title: t('save.warning.title'),
        message: t(
            warning === 'durability' && reason !== undefined
                ? `save.warning.${warning}.${reason}`
                : `save.warning.${warning}`,
        ),
        severity: 'warning',
        subject,
    });
}
