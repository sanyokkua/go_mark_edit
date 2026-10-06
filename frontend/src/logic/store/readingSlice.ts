import { createSlice } from '@reduxjs/toolkit';

/**
 * Transient Reading-mode presentation state. It is a frontend-only projection:
 * it is never persisted, never sent to the backend and starts inactive on every
 * launch. `sidebarShown` and `tabsShown` describe the overlays the reader has
 * summoned; entering Reading mode always starts with both hidden.
 */
export interface ReadingState {
    active: boolean;
    sidebarShown: boolean;
    tabsShown: boolean;
}

const initialState: ReadingState = { active: false, sidebarShown: false, tabsShown: false };

const readingSlice = createSlice({
    name: 'reading',
    initialState,
    reducers: {
        enterReading: () => ({ active: true, sidebarShown: false, tabsShown: false }),
        leaveReading: (state) => {
            state.active = false;
        },
        toggleReading: (state) =>
            state.active ? { ...state, active: false } : { active: true, sidebarShown: false, tabsShown: false },
        toggleReadingSidebar: (state) => {
            state.sidebarShown = !state.sidebarShown;
        },
        toggleReadingTabs: (state) => {
            state.tabsShown = !state.tabsShown;
        },
        closeReadingOverlays: (state) => {
            state.sidebarShown = false;
            state.tabsShown = false;
        },
        resetReading: () => initialState,
    },
});

export const {
    closeReadingOverlays,
    enterReading,
    leaveReading,
    resetReading,
    toggleReading,
    toggleReadingSidebar,
    toggleReadingTabs,
} = readingSlice.actions;
export default readingSlice.reducer;
