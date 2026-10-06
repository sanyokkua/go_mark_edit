import { configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector } from 'react-redux';

import { documentsReducer } from './documentsSlice';
import notificationsReducer from './notificationsSlice';
import readingReducer from './readingSlice';
import settingsReducer from './settingsSlice';
import { uiReducer } from './uiSlice';
import { workspaceReducer } from './workspaceSlice';

export const store = configureStore({
    reducer: {
        documents: documentsReducer,
        notifications: notificationsReducer,
        reading: readingReducer,
        settings: settingsReducer,
        ui: uiReducer,
        workspace: workspaceReducer,
    },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
