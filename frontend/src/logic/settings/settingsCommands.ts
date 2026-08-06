import type {
  EditorSettings,
  MarkdownSettings,
} from '../adapter/settingsTypes';
import type { SettingsAdapter } from '../adapter/services';
import {
  acknowledgeEditorSettings,
  acknowledgeMarkdownSettings,
} from '../store/settingsSlice';

type SettingsDispatch = (
  action:
    | ReturnType<typeof acknowledgeEditorSettings>
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
