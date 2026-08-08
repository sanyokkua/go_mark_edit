import type {
  EditorSettings,
  FileSettings,
  MarkdownSettings,
} from '../adapter/settingsTypes';
import type { SettingsAdapter } from '../adapter/services';
import {
  acknowledgeEditorSettings,
  acknowledgeFileSettings,
  acknowledgeMarkdownSettings,
} from '../store/settingsSlice';

type SettingsDispatch = (
  action:
    | ReturnType<typeof acknowledgeEditorSettings>
    | ReturnType<typeof acknowledgeFileSettings>
    | ReturnType<typeof acknowledgeMarkdownSettings>,
) => unknown;

export async function acknowledgeEditorSettingsUpdate(
  adapter: Pick<SettingsAdapter, 'updateEditor'>,
  current: EditorSettings,
  patch: Partial<EditorSettings>,
  dispatch: SettingsDispatch,
): Promise<void> {
  const next = { ...current, ...patch };
  await adapter.updateEditor(next);
  dispatch(acknowledgeEditorSettings(next));
}

export async function acknowledgeMarkdownSettingsUpdate(
  adapter: Pick<SettingsAdapter, 'updateMarkdown'>,
  current: MarkdownSettings,
  patch: Partial<MarkdownSettings>,
  dispatch: SettingsDispatch,
): Promise<void> {
  const next = { ...current, ...patch };
  await adapter.updateMarkdown(next);
  dispatch(acknowledgeMarkdownSettings(next));
}

export async function acknowledgeFileSettingsUpdate(
  adapter: Pick<SettingsAdapter, 'updateFile'>,
  current: FileSettings,
  patch: Partial<FileSettings>,
  dispatch: SettingsDispatch,
): Promise<void> {
  const next = { ...current, ...patch };
  await adapter.updateFile(next);
  dispatch(acknowledgeFileSettings(next));
}
