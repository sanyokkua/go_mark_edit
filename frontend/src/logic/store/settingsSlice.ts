import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type {
  EditorSettings,
  FileSettings,
  MarkdownSettings,
  Settings,
} from '../adapter/settingsTypes';

export const defaultEditorSettings: EditorSettings = {
  lineNumbers: true,
  wordWrap: false,
  fontSize: 14,
};

export const defaultMarkdownSettings: MarkdownSettings = {
  standard: 'gfm',
  formatOnSave: false,
  lintOnSave: false,
  bulletMarker: '-',
  emphasisMarker: '*',
  headingStyle: 'atx',
};

export const defaultFileSettings: FileSettings = {
  autosave: true,
};

export interface SettingsProjectionState {
  hydrated: boolean;
  editor: EditorSettings;
  markdown: MarkdownSettings;
  file: FileSettings;
}

export const initialSettingsState: SettingsProjectionState = {
  hydrated: false,
  editor: defaultEditorSettings,
  markdown: defaultMarkdownSettings,
  file: defaultFileSettings,
};

const settingsSlice = createSlice({
  name: 'settings',
  initialState: initialSettingsState,
  reducers: {
    hydrateSettings(
      _state,
      action: PayloadAction<Settings>,
    ): SettingsProjectionState {
      return {
        hydrated: true,
        editor: action.payload.editor ?? defaultEditorSettings,
        markdown: action.payload.markdown,
        file: action.payload.file ?? defaultFileSettings,
      };
    },
    acknowledgeEditorSettings(
      state,
      action: PayloadAction<EditorSettings>,
    ): void {
      state.editor = action.payload;
    },
    acknowledgeMarkdownSettings(
      state,
      action: PayloadAction<MarkdownSettings>,
    ): void {
      state.markdown = action.payload;
    },
    acknowledgeFileSettings(state, action: PayloadAction<FileSettings>): void {
      state.file = action.payload;
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
  resetSettingsProjection,
} = settingsSlice.actions;

export default settingsSlice.reducer;
