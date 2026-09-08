import { useCallback } from 'react';

import {
  settingsAdapter,
  type EditorSettings,
  type MarkdownSettings,
} from '../adapter';
import { useAppDispatch, useAppSelector } from '../store';
import {
  acknowledgeEditorSettingsUpdate,
  acknowledgeMarkdownSettingsUpdate,
} from './settingsCommands';

export interface EditorSettingsState {
  markdownSettings: MarkdownSettings;
  settings: EditorSettings;
  update: (patch: Partial<EditorSettings>) => Promise<void>;
  updateMarkdown: (patch: Partial<MarkdownSettings>) => Promise<void>;
}

export function useEditorSettings(): EditorSettingsState {
  const dispatch = useAppDispatch();
  const settings = useAppSelector((state) => state.settings.editor);
  const markdownSettings = useAppSelector((state) => state.settings.markdown);

  const update = useCallback(
    (patch: Partial<EditorSettings>): Promise<void> =>
      acknowledgeEditorSettingsUpdate(
        settingsAdapter,
        settings,
        patch,
        dispatch,
      ),
    [dispatch, settings],
  );
  const updateMarkdown = useCallback(
    (patch: Partial<MarkdownSettings>): Promise<void> =>
      acknowledgeMarkdownSettingsUpdate(
        settingsAdapter,
        markdownSettings,
        patch,
        dispatch,
      ),
    [dispatch, markdownSettings],
  );

  return { markdownSettings, settings, update, updateMarkdown };
}
