import { normalizeClassifiedError } from '../adapter/appModelAdapter';
import type { WireError } from '../utils/parseError';
import { reportClassifiedError } from './classifiedNotification';
import type { AppDispatch } from './index';
import { notifyError } from './notificationsSlice';

/** Preserve classified state:error copy and controls, retaining the legacy route. */
export function reportAsyncError(dispatch: AppDispatch, error: WireError): void {
    if (error.category === undefined || error.category === '') {
        dispatch(notifyError(error));
        return;
    }
    const classified = normalizeClassifiedError({
        ...error,
        category: error.category,
        dedupKey: error.dedupKey ?? error.details?.dedupKey ?? error.documentId ?? error.code,
    });
    // An asynchronous event does not identify a command to retry. The existing
    // reporter still offers document-bound Save to recreate and Copy path.
    reportClassifiedError(dispatch, classified, error.title);
}
