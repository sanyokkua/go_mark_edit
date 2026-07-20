import { guardArity } from './bridgeGuard';
import { unwrap } from './envelope';
import type {
  AppearanceSettings,
  ContentPrivacySettings,
  MarkdownSettings,
  Settings,
  SettingsResult,
  VoidResult,
} from './settingsTypes';

export interface SettingsBindings {
  getSettings: () => Promise<SettingsResult>;
  updateAppearance: (settings: AppearanceSettings) => Promise<VoidResult>;
  updateContentPrivacy: (
    settings: ContentPrivacySettings,
  ) => Promise<VoidResult>;
  updateMarkdown: (settings: MarkdownSettings) => Promise<VoidResult>;
}

export interface SettingsAdapter {
  getSettings: () => Promise<Settings>;
  updateAppearance: (settings: AppearanceSettings) => Promise<void>;
  updateContentPrivacy: (settings: ContentPrivacySettings) => Promise<void>;
  updateMarkdown: (settings: MarkdownSettings) => Promise<void>;
}

export function createSettingsAdapter(bindings: SettingsBindings): SettingsAdapter {
  const getSettings = guardArity(
    'SettingsHandler.GetSettings',
    bindings.getSettings,
  );
  const updateAppearance = guardArity(
    'SettingsHandler.UpdateAppearance',
    bindings.updateAppearance,
  );
  const updateContentPrivacy = guardArity(
    'SettingsHandler.UpdateContentPrivacy',
    bindings.updateContentPrivacy,
  );
  const updateMarkdown = guardArity(
    'SettingsHandler.UpdateMarkdown',
    bindings.updateMarkdown,
  );

  return {
    async getSettings(): Promise<Settings> {
      return unwrap(await getSettings());
    },
    async updateAppearance(settings: AppearanceSettings): Promise<void> {
      return unwrap(await updateAppearance(settings));
    },
    async updateContentPrivacy(
      settings: ContentPrivacySettings,
    ): Promise<void> {
      return unwrap(await updateContentPrivacy(settings));
    },
    async updateMarkdown(settings: MarkdownSettings): Promise<void> {
      return unwrap(await updateMarkdown(settings));
    },
  };
}
