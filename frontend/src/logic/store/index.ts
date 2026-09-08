import { configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector } from 'react-redux';

import { documentsReducer } from './documentsSlice';
import notificationsReducer from './notificationsSlice';
import { uiReducer } from './uiSlice';

export const store = configureStore({
  reducer: {
    documents: documentsReducer,
    notifications: notificationsReducer,
    ui: uiReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
