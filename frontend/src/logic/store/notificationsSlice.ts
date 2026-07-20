import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { WireError } from '../utils/parseError';

export interface Notification {
  id: number;
  error: WireError;
}

interface NotificationsState {
  items: Notification[];
}

const initialState: NotificationsState = {
  items: [],
};

let nextNotificationID = 0;

const notificationsSlice = createSlice({
  name: 'notifications',
  initialState,
  reducers: {
    notifyError: {
      prepare(error: WireError): { payload: Notification } {
        nextNotificationID += 1;
        return {
          payload: {
            id: nextNotificationID,
            error,
          },
        };
      },
      reducer(state, action: PayloadAction<Notification>): void {
        state.items.push(action.payload);
      },
    },
    dismissNotification(state, action: PayloadAction<number>): void {
      state.items = state.items.filter(
        (notification) => notification.id !== action.payload,
      );
    },
  },
});

export const { dismissNotification, notifyError } = notificationsSlice.actions;
export default notificationsSlice.reducer;
