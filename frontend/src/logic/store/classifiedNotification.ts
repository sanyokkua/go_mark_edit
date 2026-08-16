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
      remediations: remediationsFor(error, options),
      severity: 'error',
      subject: error.dedupKey,
      title: error.safeSubject ?? fallback,
    }),
  );
}

export interface ClassifiedReportOptions {
  /**
   * The command a `Retry` control re-runs.
   *
   * Only `Retry` needs telling: every other member of the vocabulary names its
   * own command. Omitting it is the deliberate way to say "this caller cannot
   * re-issue what failed", and no Retry is then offered. That is what keeps the
   * rendered button honest: until T116 nothing passed `onRemediate`, so every
   * remediation was built and discarded, and a control that renders without a
   * command behind it is the same defect wearing a button. A caller earns the
   * control by naming the command.
   */
  intent?: NotificationRemediationIntent;
  /**
   * Everything the retry command needs beyond the failing document, and the
   * reason a caller can be refused its control.
   *
   * `open-recent` re-issues a specific path, and `activate-document` acts on
   * the tab the user clicked rather than on whatever document the error
   * happens to name — a stale tab-set refusal often names none. A retry is
   * offered only when every argument its intent requires is present, so the
   * "control with no command behind it" case is unreachable by construction
   * rather than guarded at the click.
   */
  retry?: { documentId?: string; path?: string };
}

/**
 * Map the set Go sent onto the controls this application can actually run.
 *
 * Three contract rows specify a set rather than a value, and two of them reach
 * a toast: a Reveal `system-command-failure` offers "Retry; a Reveal failure
 * also offers Copy path", and a detached `not-found` offers "Save to recreate
 * plus Copy path". Order follows the contract table, so Retry precedes Copy path.
 *
 * `Save to recreate` is deliberately absent. Nothing in the frontend can run it:
 * `App.tsx`'s `beginWrite` refuses a detached document outright — which
 * contradicts FR-FT-023 — and it writes only the *active* document, so a control
 * carrying it would either refuse or save a different file than the toast names.
 * **T160** owns both. Dropping the member leaves the detached `not-found` row
 * half-served, which is a visible gap; rendering it would be a control with
 * nothing behind it, which is the defect T116 exists to remove.
 *
 * `Reload from disk`, `Keep mine`, `Skip` and `Cancel` are absent for a
 * different reason: the contract routes them through the external-change prompt
 * and the close prompt, not through a toast.
 */
/**
 * Whether the named command has everything it needs to run.
 *
 * The intent alone is not the promise — `open-recent` without a path and
 * `activate-document` without a document are both buttons that would call
 * nothing, which is the defect T116 removed. Naming each intent's arguments
 * here, once, is what keeps the check from drifting per call site.
 */
function retryIsExecutable(
  intent: NotificationRemediationIntent,
  documentId: string | undefined,
  path: string | undefined,
): boolean {
  switch (intent) {
    case 'copy-path':
    case 'reveal':
    case 'activate-document':
      return documentId !== undefined && documentId !== '';
    case 'open-recent':
      return path !== undefined && path !== '';
    case 'new-document':
    case 'open-document':
    case 'reopen-last':
    case 'save':
    case 'save-as':
      return true;
    default: {
      const unhandled: never = intent;
      return unhandled;
    }
  }
}

function remediationsFor(
  error: ClassifiedError,
  options: ClassifiedReportOptions,
): NotificationRemediation[] {
  const offered: NotificationRemediation[] = [];
  const { intent, retry } = options;
  const documentId = retry?.documentId ?? error.documentId;
  if (
    intent !== undefined &&
    error.remediations.includes('Retry') &&
    retryIsExecutable(intent, documentId, retry?.path)
  ) {
    offered.push({
      action: 'retry',
      documentId,
      intent,
      labelKey: 'action.retry.label',
      ...(retry?.path === undefined ? {} : { path: retry.path }),
    });
  }
  // `copy-path` names its own command, so it needs no intent from the caller —
  // only a document to act on.
  if (
    error.documentId !== undefined &&
    error.documentId !== '' &&
    error.remediations.includes('Copy path')
  ) {
    offered.push({
      action: 'copy-path',
      documentId: error.documentId,
      intent: 'copy-path',
      labelKey: 'action.copy-path.label',
    });
  }
  return offered;
}
