import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { t } from '../../i18n';
import type { WireError } from '../utils/parseError';
import type { ClosePlanKind } from './appModelTypes';

export type NotificationSeverity = 'error' | 'info' | 'success' | 'warning';

/**
 * The control a classified failure offers, and the command that control runs.
 *
 * `action` and `intent` are unions rather than strings on purpose. A remediation
 * whose command nobody implemented is the defect this type exists to prevent:
 * the button used to render from a free-form string and call nothing, so a new
 * value could be added and silently do nothing. Both fields are now exhaustively
 * switched in `App.tsx`, so an unhandled one fails the build instead.
 *
 * `intent` is what makes the button honest — `action` says what the label reads,
 * `intent` says which command re-runs. `reportClassifiedError` attaches a
 * remediation only when its caller declares an intent it can actually honour, so
 * a control that would do nothing is never constructed in the first place.
 */
export type NotificationRemediationAction =
  | 'copy-path'
  /**
   * The contract's `not-found` remediation for a *detached* document: write the
   * buffer back to the path whose file has gone, recreating it.
   *
   * A distinct member rather than a `retry` with a `save` intent, because the
   * control is not a re-issue of anything — the failure it answers is a Reveal or
   * Copy path against a missing file, and the label the contract gives it says
   * what it does rather than that it repeats. Its command is `save` all the same,
   * which is why `intent` carries that. T160.
   */
  | 'save-to-recreate'
  | 'retry';

/**
 * The command a remediation control runs.
 *
 * Every member names something the application can actually execute; a caller
 * that cannot name one gets no control, which is what keeps a rendered button
 * from calling nothing. The entry members were added by T156: Go classifies a
 * stale tab-set refusal as `conflict` and sends `Retry`, and the contract's
 * `conflict` row (amended by T159) covers exactly that — re-reading
 * `tabSetRevision` and re-issuing the same command.
 */
export type NotificationRemediationIntent =
  | 'copy-path'
  | 'reveal'
  | 'save'
  | 'save-as'
  | 'new-document'
  | 'open-document'
  | 'open-recent'
  | 'reopen-last'
  | 'activate-document'
  /**
   * Re-asks the native frame to close, after FR-FT-027's drain refused.
   *
   * It re-issues the *request*, not the authorization: the coordinator
   * cancelled the pending close when the drain failed, so there is nothing left
   * to authorize and `AuthorizeQuit` would refuse as stale. Asking the frame to
   * close again is what starts a fresh close plan, drain and permit — the only
   * sequence that can succeed.
   */
  | 'quit'
  /**
   * Re-prepares a refused close, after FR-FT-033's stale tab-set check.
   *
   * Like `quit` this re-issues the *request* rather than the refused call, and
   * for the same reason: the plan id the failure carries is exactly what the
   * backend rejected as stale, so re-executing it would refuse identically. What
   * has to come back instead is the original `kind` and `targets`, which only
   * `onCloseDocument` ever held — see `close` on NotificationRemediation.
   */
  | 'close-documents'
  /**
   * Re-issues a refused tab move, after FR-FT-033's stale tab-set check.
   *
   * Executed by the tab strip rather than by App, because FR-FT-034 requires the
   * completed move to be announced and the announcement is built from the
   * disambiguated tab label and the strip's length — see TabRemediationContext.
   */
  | 'reorder-document';

export interface NotificationRemediation {
  action: NotificationRemediationAction;
  documentId?: string;
  intent: NotificationRemediationIntent;
  labelKey: string;
  /**
   * The recent-file path an `open-recent` retry re-issues. Absent for every
   * other intent, and a retry is not offered at all without it.
   */
  path?: string;
  /**
   * The close request a `close-documents` retry re-issues, verbatim.
   *
   * A close is the one entry command whose retry cannot be rebuilt at the point
   * of failure. `Close others` and `Close to the right` name a set of documents
   * that is not derivable from the active document, and the reporting frames
   * hold neither — only the plan id the backend refused. Carrying the request
   * itself is what makes the control honest; without it a retry would close the
   * wrong tabs, which is worse than offering nothing.
   */
  close?: { kind: ClosePlanKind; targetDocumentIds: string[] };
  /**
   * The move a `reorder-document` retry re-issues: which tab, and the index it
   * was going to. The revision is deliberately absent — the one that failed is
   * the stale one, so the executor reads a fresh one.
   */
  reorder?: { documentId: string; targetIndex: number };
}

export interface Notification {
  code: string;
  count: number;
  error?: WireError;
  id: number;
  message: string;
  refreshGeneration: number;
  /**
   * The controls offered with this failure, in contract order.
   *
   * A list rather than one value because the contract specifies sets: a Reveal
   * `system-command-failure` offers "Retry; a Reveal failure also offers Copy
   * path", and a detached `not-found` offers "Save to recreate plus Copy path".
   * Empty means message-only, which is what most of the eight categories are.
   */
  remediations: NotificationRemediation[];
  severity: NotificationSeverity;
  subject: string;
  title: string;
}

export interface NotificationInput {
  automatic?: boolean;
  code: string;
  message: string;
  remediations?: NotificationRemediation[];
  severity: NotificationSeverity;
  subject: string;
  title: string;
}

export interface NotificationsState {
  banners: Notification[];
  items: Notification[];
  queuedErrors: Notification[];
}

const initialState: NotificationsState = {
  banners: [],
  items: [],
  queuedErrors: [],
};

let nextNotificationID = 0;

function localizedErrorCopy(error: WireError): {
  message: string;
  title: string;
} {
  return {
    message: t(`notification.error.${error.code}.message`),
    title: t(`notification.error.${error.code}.title`),
  };
}

function classifiedSubject(error: WireError): string {
  return (
    error.details?.subject ??
    error.details?.operation ??
    error.details?.field ??
    error.details?.name ??
    error.code
  );
}

function toNotification(
  input: NotificationInput,
  error?: WireError,
): Notification {
  nextNotificationID += 1;
  return {
    code: input.code,
    count: 1,
    error,
    id: nextNotificationID,
    message: input.message,
    refreshGeneration: 0,
    remediations: input.remediations ?? [],
    severity: input.severity,
    subject: input.subject,
    title: input.title,
  };
}

function findDuplicate(
  notifications: Notification[],
  incoming: Notification,
): Notification | undefined {
  return notifications.find(
    (notification) =>
      notification.code === incoming.code &&
      notification.subject === incoming.subject,
  );
}

/**
 * Merge, never replace.
 *
 * The previous line was `duplicate.remediation = incoming.remediation`, and a
 * second report of the same failure that carried no control erased the one the
 * first had earned. That is not hypothetical: a refused Save was reported twice
 * — once by the write path with its intent, once by the menu's result arm
 * without one — and the Retry button vanished behind a `×2` that read like the
 * contract's dedup count working (`App.tsx:99-100`, `:289-291`). A repeat is the
 * *same* failure, so a control it already offers stays offered; a control the
 * repeat brings and the notification does not have yet is added once.
 */
function mergeRemediations(
  existing: NotificationRemediation[],
  incoming: NotificationRemediation[],
): NotificationRemediation[] {
  const offered = [...existing];
  for (const candidate of incoming) {
    if (offered.some((current) => current.action === candidate.action))
      continue;
    offered.push(candidate);
  }
  return offered;
}

function refreshDuplicate(
  duplicate: Notification,
  incoming: Notification,
): void {
  duplicate.count += 1;
  duplicate.error = incoming.error;
  duplicate.message = incoming.message;
  duplicate.refreshGeneration += 1;
  duplicate.remediations = mergeRemediations(
    duplicate.remediations,
    incoming.remediations,
  );
  duplicate.severity = incoming.severity;
  duplicate.title = incoming.title;
}

function enqueueToast(state: NotificationsState, incoming: Notification): void {
  const duplicate =
    findDuplicate(state.items, incoming) ??
    findDuplicate(state.queuedErrors, incoming);
  if (duplicate !== undefined) {
    refreshDuplicate(duplicate, incoming);
    return;
  }

  if (state.items.length < 3) {
    state.items.push(incoming);
    return;
  }

  const oldestNonError = state.items.findIndex(
    (notification) => notification.severity !== 'error',
  );
  if (oldestNonError >= 0) {
    state.items.splice(oldestNonError, 1);
    state.items.push(incoming);
    return;
  }

  if (incoming.severity === 'error') {
    state.queuedErrors.push(incoming);
  }
}

const notificationsSlice = createSlice({
  name: 'notifications',
  initialState,
  reducers: {
    notifyError: {
      prepare(
        error: WireError,
        subject = classifiedSubject(error),
      ): { payload: Notification } {
        const copy = localizedErrorCopy(error);
        return {
          payload: toNotification(
            {
              code: error.code,
              message: copy.message,
              severity: 'error',
              subject,
              title: copy.title,
            },
            error,
          ),
        };
      },
      reducer(state, action: PayloadAction<Notification>): void {
        enqueueToast(state, action.payload);
      },
    },
    notifyToast: {
      prepare(input: NotificationInput): { payload: Notification | undefined } {
        if (input.automatic === true && input.severity === 'success') {
          return { payload: undefined };
        }
        return { payload: toNotification(input) };
      },
      reducer(state, action: PayloadAction<Notification | undefined>): void {
        if (action.payload !== undefined) {
          enqueueToast(state, action.payload);
        }
      },
    },
    notifyCondition: {
      prepare(input: NotificationInput): { payload: Notification } {
        return { payload: toNotification(input) };
      },
      reducer(state, action: PayloadAction<Notification>): void {
        const duplicate = findDuplicate(state.banners, action.payload);
        if (duplicate === undefined) {
          state.banners.push(action.payload);
        } else {
          refreshDuplicate(duplicate, action.payload);
        }
      },
    },
    dismissNotification(state, action: PayloadAction<number>): void {
      const visibleIndex = state.items.findIndex(
        (notification) => notification.id === action.payload,
      );
      if (visibleIndex >= 0) {
        state.items.splice(visibleIndex, 1);
        const queuedError = state.queuedErrors.shift();
        if (queuedError !== undefined) {
          state.items.push(queuedError);
        }
        return;
      }
      state.queuedErrors = state.queuedErrors.filter(
        (notification) => notification.id !== action.payload,
      );
    },
    clearCondition(state, action: PayloadAction<number>): void {
      state.banners = state.banners.filter(
        (notification) => notification.id !== action.payload,
      );
    },
    resetNotifications(): NotificationsState {
      return initialState;
    },
  },
});

export const {
  clearCondition,
  dismissNotification,
  notifyCondition,
  notifyError,
  notifyToast,
  resetNotifications,
} = notificationsSlice.actions;
export default notificationsSlice.reducer;
