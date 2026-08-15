import type { AppDispatch } from './index';
import type { ClassifiedError } from './appModelTypes';
import {
  notifyToast,
  type NotificationRemediation,
  type NotificationRemediationIntent,
} from './notificationsSlice';

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
  options: ClassifiedReportOptions = {},
): void {
  if (error === undefined) return;
  dispatch(
    notifyToast({
      code: classifiedErrorCode(error.category),
      message: error.message || fallback,
      remediation: remediationFor(error, options),
      severity: 'error',
      subject: error.dedupKey,
      title: error.safeSubject ?? fallback,
    }),
  );
}

export interface ClassifiedReportOptions {
  /** Offer `Copy path` where the contract pairs it with a reveal failure. */
  reveal?: boolean;
  /**
   * The command the remediation control re-runs.
   *
   * Omitting it is the deliberate way to say "this caller cannot re-issue what
   * failed", and the notification then carries no remediation at all. That is
   * what keeps the rendered button honest: until T116 nothing passed
   * `onRemediate`, so every remediation was built and discarded, and a control
   * that renders without a command behind it is the same defect wearing a
   * button. A caller earns the control by naming the command.
   */
  intent?: NotificationRemediationIntent;
}

function remediationFor(
  error: ClassifiedError,
  options: ClassifiedReportOptions,
): NotificationRemediation | undefined {
  if (options.intent === undefined) return undefined;
  if (error.remediation === 'Copy path' && options.reveal === true) {
    return {
      action: 'copy-path',
      documentId: error.documentId,
      intent: options.intent,
      labelKey: 'action.copy-path.label',
    };
  }
  if (error.remediation === 'Retry') {
    return {
      action: 'retry',
      documentId: error.documentId,
      intent: options.intent,
      labelKey: 'action.retry.label',
    };
  }
  return undefined;
}
