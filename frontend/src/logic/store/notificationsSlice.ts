import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { t } from '../../i18n';
import type { WireError } from '../utils/parseError';

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
export type NotificationRemediationAction = 'copy-path' | 'retry';

export type NotificationRemediationIntent = 'copy-path';

export interface NotificationRemediation {
  action: NotificationRemediationAction;
  documentId?: string;
  intent: NotificationRemediationIntent;
  labelKey: string;
}

export interface Notification {
  code: string;
  count: number;
  error?: WireError;
  id: number;
  message: string;
  refreshGeneration: number;
  remediation?: NotificationRemediation;
  severity: NotificationSeverity;
  subject: string;
  title: string;
}

export interface NotificationInput {
  automatic?: boolean;
  code: string;
  message: string;
  remediation?: NotificationRemediation;
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
    remediation: input.remediation,
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

function refreshDuplicate(
  duplicate: Notification,
  incoming: Notification,
): void {
  duplicate.count += 1;
  duplicate.error = incoming.error;
  duplicate.message = incoming.message;
  duplicate.refreshGeneration += 1;
  duplicate.remediation = incoming.remediation;
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
