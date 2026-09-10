import type {
  AppearanceSettings,
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

export const defaultAppearanceSettings = {
  defaultOpenMode: 'editor',
  mode: 'auto',
  theme: 'material',
} as const satisfies AppearanceSettings;

type SettingsAcknowledgement<T> = (next: T) => unknown;

type SettingsCommandAdapter = Pick<
  SettingsAdapter,
  | 'resetAppearance'
  | 'updateAppearance'
  | 'updateEditor'
  | 'updateFile'
  | 'updateMarkdown'
>;

export async function acknowledgeAppearanceSettingsUpdate(
  adapter: Pick<SettingsAdapter, 'updateAppearance'>,
  current: AppearanceSettings,
  patch: Partial<AppearanceSettings>,
  acknowledge: SettingsAcknowledgement<AppearanceSettings>,
): Promise<void> {
  const next = { ...current, ...patch };
  await adapter.updateAppearance(next);
  await acknowledge(next);
}

export async function resetAppearanceSettings(
  adapter: Pick<SettingsAdapter, 'resetAppearance'>,
  acknowledge: SettingsAcknowledgement<AppearanceSettings>,
): Promise<void> {
  await adapter.resetAppearance();
  await acknowledge(defaultAppearanceSettings);
}

export interface SettingsCommandOwner {
  resetAppearance: (
    acknowledge: SettingsAcknowledgement<AppearanceSettings>,
  ) => Promise<void>;
  updateAppearance: (
    current: AppearanceSettings,
    patch: Partial<AppearanceSettings>,
    acknowledge: SettingsAcknowledgement<AppearanceSettings>,
  ) => Promise<void>;
  updateEditor: (
    current: EditorSettings,
    patch: Partial<EditorSettings>,
    dispatch: SettingsDispatch,
  ) => Promise<void>;
  updateFile: (
    current: FileSettings,
    patch: Partial<FileSettings>,
    dispatch: SettingsDispatch,
  ) => Promise<void>;
  updateMarkdown: (
    current: MarkdownSettings,
    patch: Partial<MarkdownSettings>,
    dispatch: SettingsDispatch,
  ) => Promise<void>;
}

export function createSettingsCommandOwner(
  adapter: SettingsCommandAdapter,
): SettingsCommandOwner {
  let queue: Promise<void> | undefined;
  const enqueue = (command: () => Promise<void>): Promise<void> => {
    const result = queue === undefined ? command() : queue.then(command);
    queue = result.catch((): void => undefined);
    return result;
  };

  return {
    resetAppearance: (acknowledge): Promise<void> =>
      enqueue(() => resetAppearanceSettings(adapter, acknowledge)),
    updateAppearance: (current, patch, acknowledge): Promise<void> =>
      enqueue(() =>
        acknowledgeAppearanceSettingsUpdate(
          adapter,
          current,
          patch,
          acknowledge,
        ),
      ),
    updateEditor: (current, patch, dispatch): Promise<void> =>
      enqueue(() =>
        acknowledgeEditorSettingsUpdate(adapter, current, patch, dispatch),
      ),
    updateFile: (current, patch, dispatch): Promise<void> =>
      enqueue(() =>
        acknowledgeFileSettingsUpdate(adapter, current, patch, dispatch),
      ),
    updateMarkdown: (current, patch, dispatch): Promise<void> =>
      enqueue(() =>
        acknowledgeMarkdownSettingsUpdate(adapter, current, patch, dispatch),
      ),
  };
}

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
