export const EVENTS = {
  statePatch: 'state:patch',
  stateError: 'state:error',
  applicationCloseRequested: 'application:close-requested',
} as const;

export type AdapterEventName = (typeof EVENTS)[keyof typeof EVENTS];
