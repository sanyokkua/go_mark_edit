import { useCallback } from 'react';

import { settingsAdapter, type EditorSettings, type FileSettings, type MarkdownSettings } from '../adapter';
import { store, useAppDispatch, useAppSelector } from '../store';
import { notifyError } from '../store/notificationsSlice';
import { parseError } from '../utils/parseError';
import { createSettingsCommandOwner } from './settingsCommands';

const commands = createSettingsCommandOwner(settingsAdapter);

export interface EditorSettingsState {
    fileSettings: FileSettings;
    markdownSettings: MarkdownSettings | undefined;
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

    const update = useCallback(
        (patch: Partial<EditorSettings>): Promise<void> => commands.updateEditor(settings, patch, dispatch),
        [commands, dispatch, settings],
    );
    const updateMarkdown = useCallback(
        async (patch: Partial<MarkdownSettings>): Promise<void> => {
            try {
                await commands.updateMarkdown(() => store.getState().settings.markdown, patch, dispatch);
            } catch (error) {
                dispatch(notifyError(parseError(error)));
                throw error;
            }
        },
        [dispatch],
    );
    const updateFile = useCallback(
        (patch: Partial<FileSettings>): Promise<void> => commands.updateFile(fileSettings, patch, dispatch),
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
