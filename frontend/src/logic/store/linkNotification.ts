import { t } from '../../i18n';
import type { NotificationInput } from './notificationsSlice';

function targetIdentity(path: string): string {
    let hash = 0xcbf29ce484222325n;
    for (let index = 0; index < path.length; index += 1) {
        hash = BigInt.asUintN(64, (hash ^ BigInt(path.charCodeAt(index))) * 0x100000001b3n);
    }
    return `link:${hash.toString(16).padStart(16, '0')}`;
}

/** Builds the notice for a local file that the editor cannot open. */
export function buildUnsupportedFileNotice(revealPath: string, safeSubject?: string): NotificationInput | undefined {
    if (revealPath === '') return undefined;

    const filename =
        safeSubject !== undefined && safeSubject !== '' && !/[\\/]/u.test(safeSubject)
            ? safeSubject
            : t('link.unsupportedFile.title');

    return {
        code: 'link-unsupported-file',
        severity: 'warning',
        subject: targetIdentity(revealPath),
        title: filename,
        message: t('link.unsupportedFile.message'),
        remediations: [
            {
                action: 'retry',
                intent: 'reveal-workspace-path',
                labelKey: 'action.reveal-in-file-manager.label',
                path: revealPath,
            },
        ],
    };
}
