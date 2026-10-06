import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { EditorSettings, FileSettings, MarkdownSettings, ReadingWidth, Settings } from '../adapter/settingsTypes';

export const defaultEditorSettings: EditorSettings = {
    lineNumbers: true,
    wordWrap: false,
    scrollSync: true,
    fontSize: 14,
};

export const defaultFileSettings: FileSettings = {
    autosave: true,
};

export interface SettingsProjectionState {
    hydrated: boolean;
    editor: EditorSettings;
    markdown: MarkdownSettings | undefined;
    file: FileSettings;
    readingWidth: ReadingWidth;
}

export const initialSettingsState: SettingsProjectionState = {
    hydrated: false,
    editor: defaultEditorSettings,
    markdown: undefined,
    file: defaultFileSettings,
    readingWidth: 'page',
};

const settingsSlice = createSlice({
    name: 'settings',
    initialState: initialSettingsState,
    reducers: {
        hydrateSettings(_state, action: PayloadAction<Settings>): SettingsProjectionState {
            return {
                hydrated: true,
                editor: action.payload.editor ?? defaultEditorSettings,
                markdown: action.payload.markdown,
                file: action.payload.file ?? defaultFileSettings,
                readingWidth: action.payload.appearance.readingWidth === 'full' ? 'full' : 'page',
            };
        },
        acknowledgeEditorSettings(state, action: PayloadAction<EditorSettings>): void {
            state.editor = action.payload;
        },
        acknowledgeMarkdownSettings(state, action: PayloadAction<MarkdownSettings>): void {
            state.markdown = action.payload;
        },
        acknowledgeFileSettings(state, action: PayloadAction<FileSettings>): void {
            state.file = action.payload;
        },
        readingWidthAcknowledged(state, action: PayloadAction<ReadingWidth>): void {
            state.readingWidth = action.payload;
        },
        resetSettingsProjection(): SettingsProjectionState {
            return initialSettingsState;
        },
    },
});

export const {
    acknowledgeEditorSettings,
    acknowledgeFileSettings,
    acknowledgeMarkdownSettings,
    hydrateSettings,
    readingWidthAcknowledged,
    resetSettingsProjection,
} = settingsSlice.actions;

export default settingsSlice.reducer;
