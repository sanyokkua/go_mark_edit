import type { AppDispatch } from './index';
import type { ClassifiedError } from './appModelTypes';
import { notifyToast } from './notificationsSlice';

/**
 * The notification `code` a classified category is deduplicated and styled by.
 *
 * The backend's eight-category vocabulary (`internal/apperr/classified_error.go:13-22`)
 * is not the transport vocabulary `WireError.code` uses, so the two are mapped
 * here rather than assumed equal. `capacity-limit` keeps its own code because
 * the specification's classified-error table remediates it "message-only,
 * naming the limit" — collapsing it into `io` would make the 40-document and
 * 50 MiB refusals indistinguishable from an unrelated write failure.
 */
export function classifiedErrorCode(
  category: ClassifiedError['category'] | undefined,
): string {
  switch (category) {
    case 'not-found':
      return 'not_found';
    case 'permission-denied':
      return 'permission';
    case 'system-command-failure':
      return 'system-command-failure';
    case 'unsupported-input':
      return 'unsupported';
    case 'conflict':
      return 'conflict';
    case 'capacity-limit':
      return 'capacity-limit';
    default:
      return 'io';
  }
}

/**
 * Raise one classified failure as a toast, carrying the backend's own message.
 *
 * This deliberately dispatches `notifyToast` rather than `notifyError`:
 * `notifyError` runs `localizedErrorCopy`, which replaces the message with
 * generic catalog copy keyed by code, and the catalog has no string naming
 * either limit. FR-FT-005 requires the refusal to name the 50 MiB limit, so the
 * message must survive the trip from Go.
 */
export function reportClassifiedError(
  dispatch: AppDispatch,
  error: ClassifiedError | undefined,
  fallback: string,
  reveal = false,
): void {
  if (error === undefined) return;
  dispatch(
    notifyToast({
      code: classifiedErrorCode(error.category),
      message: error.message || fallback,
      remediation:
        error.remediation === 'Copy path' && reveal
          ? { action: 'copy-path', labelKey: 'action.copy-path.label' }
          : error.remediation === 'Retry'
            ? { action: 'retry', labelKey: 'action.retry.label' }
            : undefined,
      severity: 'error',
      subject: error.dedupKey,
      title: error.safeSubject ?? fallback,
    }),
  );
}
