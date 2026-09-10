import { useCallback, useMemo } from 'react';

import {
  settingsAdapter,
  type EditorSettings,
  type FileSettings,
  type MarkdownSettings,
} from '../adapter';
import { useAppDispatch, useAppSelector } from '../store';
import { createSettingsCommandOwner } from './settingsCommands';

export interface EditorSettingsState {
  fileSettings: FileSettings;
  markdownSettings: MarkdownSettings;
  settings: EditorSettings;
  updateFile: (patch: Partial<FileSettings>) => Promise<void>;
  update: (patch: Partial<EditorSettings>) => Promise<void>;
  updateMarkdown: (patch: Partial<MarkdownSettings>) => Promise<void>;
}

export function useEditorSettings(): EditorSettingsState {
  const dispatch = useAppDispatch();
  const settings = useAppSelector((state) => state.settings.editor);
  const markdownSettings = useAppSelector((state) => state.settings.markdown);
  const fileSettings = useAppSelector((state) => state.settings.file);
  const commands = useMemo(
    () => createSettingsCommandOwner(settingsAdapter),
    [],
  );

  const update = useCallback(
    (patch: Partial<EditorSettings>): Promise<void> =>
      commands.updateEditor(settings, patch, dispatch),
    [commands, dispatch, settings],
  );
  const updateMarkdown = useCallback(
    (patch: Partial<MarkdownSettings>): Promise<void> =>
      commands.updateMarkdown(markdownSettings, patch, dispatch),
    [commands, dispatch, markdownSettings],
  );
  const updateFile = useCallback(
    (patch: Partial<FileSettings>): Promise<void> =>
      commands.updateFile(fileSettings, patch, dispatch),
    [commands, dispatch, fileSettings],
  );

  return {
    fileSettings,
    markdownSettings,
    settings,
    update,
    updateFile,
    updateMarkdown,
  };
}
