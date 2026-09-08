import {
  GetSettings,
  UpdateAppearance,
  ResetAppearance,
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
import {
  EventsOn,
  WindowFullscreen,
  WindowGetSize,
  WindowIsFullscreen,
  WindowIsMaximised,
  WindowUnfullscreen,
} from 'wailsjs/runtime';
import {
  RetryStartup,
  WindowReady,
} from 'wailsjs/go/application/ApplicationHandler';

import {
  createAppModelAdapter,
  type AppModelBindings,
  type AppModelRuntime,
} from './appModelAdapter';
import { createSettingsAdapter, type SettingsBindings } from './services';
import { createWindowAdapter } from './windowAdapter';

const generatedSettingsBindings: SettingsBindings = {
  getSettings: GetSettings,
  updateAppearance: UpdateAppearance,
  resetAppearance: ResetAppearance,
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

export const windowAdapter = createWindowAdapter({
  retryStartup: RetryStartup,
  windowReady: WindowReady,
  windowFullscreen: WindowFullscreen,
  windowGetSize: WindowGetSize,
  windowIsFullscreen: WindowIsFullscreen,
  windowIsMaximised: WindowIsMaximised,
  windowUnfullscreen: WindowUnfullscreen,
});

export const applicationAdapter = {
  retryStartup: windowAdapter.retryStartup,
};

export { guardArity } from './bridgeGuard';
export { unwrap, unwrapPromise } from './envelope';
export {
  BUFFER_SYNC_MS,
  createAppModelAdapter,
  type AppModelAdapter,
  type AppModelBindings,
  type DocViewArrangementIntent,
  type DocViewIntent,
  type AppModelRuntime,
} from './appModelAdapter';
export {
  createSettingsAdapter,
  type SettingsAdapter,
  type SettingsBindings,
} from './services';
export {
  createWindowAdapter,
  type WindowAdapter,
  type WindowBindings,
} from './windowAdapter';
export type {
  AppearanceSettings,
  ContentPrivacySettings,
  MarkdownSettings,
  Settings,
} from './settingsTypes';
