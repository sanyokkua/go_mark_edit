import {
  GetSettings,
  UpdateAppearance,
  UpdateContentPrivacy,
  UpdateMarkdown,
} from 'wailsjs/go/settings/SettingsHandler';
import {
  GetState,
  SetDocView,
  SetUILayout,
  UpdateBuffer,
} from 'wailsjs/go/appmodel/AppModelHandler';
import { apperr } from 'wailsjs/go/models';
import { EventsOn } from 'wailsjs/runtime';

import {
  createAppModelAdapter,
  type AppModelBindings,
  type AppModelRuntime,
} from './appModelAdapter';
import { createSettingsAdapter, type SettingsBindings } from './services';

const generatedSettingsBindings: SettingsBindings = {
  getSettings: GetSettings,
  updateAppearance: UpdateAppearance,
  updateContentPrivacy: UpdateContentPrivacy,
  updateMarkdown: UpdateMarkdown,
};

export const settingsAdapter = createSettingsAdapter(generatedSettingsBindings);

const generatedAppModelBindings: AppModelBindings = {
  getState: GetState,
  updateBuffer: UpdateBuffer,
  setDocView: (documentId, view) =>
    SetDocView(documentId, new apperr.DocViewInput(view)),
  setUILayout: (layout) => SetUILayout(new apperr.UILayout(layout)),
};

const wailsRuntime: AppModelRuntime = {
  eventsOn: EventsOn,
};

export const appModelAdapter = createAppModelAdapter(
  generatedAppModelBindings,
  wailsRuntime,
);

export { guardArity } from './bridgeGuard';
export { unwrap, unwrapPromise } from './envelope';
export {
  createAppModelAdapter,
  type AppModelAdapter,
  type AppModelBindings,
  type AppModelRuntime,
} from './appModelAdapter';
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
