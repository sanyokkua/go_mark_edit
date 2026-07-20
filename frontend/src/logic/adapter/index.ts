import {
  GetSettings,
  UpdateAppearance,
  UpdateContentPrivacy,
  UpdateMarkdown,
} from 'wailsjs/go/settings/SettingsHandler';

import { createSettingsAdapter, type SettingsBindings } from './services';

const generatedSettingsBindings: SettingsBindings = {
  getSettings: GetSettings,
  updateAppearance: UpdateAppearance,
  updateContentPrivacy: UpdateContentPrivacy,
  updateMarkdown: UpdateMarkdown,
};

export const settingsAdapter = createSettingsAdapter(generatedSettingsBindings);

export { guardArity } from './bridgeGuard';
export { unwrap } from './envelope';
export {
  createSettingsAdapter,
  type SettingsAdapter,
  type SettingsBindings,
} from './services';
export type {
  AppearanceSettings,
  ContentPrivacySettings,
  MarkdownSettings,
  Settings,
} from './settingsTypes';
