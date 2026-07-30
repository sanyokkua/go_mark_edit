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
        const duplicate = state.items.some(
          (notification) =>
            notification.error.code === action.payload.error.code &&
            notification.error.title === action.payload.error.title &&
            notification.error.message === action.payload.error.message,
        );
        if (duplicate) return;
        state.items.push(action.payload);
        if (state.items.length > 3) state.items.shift();
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
