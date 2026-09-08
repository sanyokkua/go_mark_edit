import type { ResultEnvelope } from './envelope';

export interface AppearanceSettings {
  theme: string;
  mode: string;
  defaultOpenMode: string;
}

export interface ContentPrivacySettings {
  remotePolicy: string;
}

export interface MarkdownSettings {
  standard: string;
  formatOnSave: boolean;
  lintOnSave: boolean;
  bulletMarker: string;
  emphasisMarker: string;
  headingStyle: string;
}

export interface Settings {
  appearance: AppearanceSettings;
  markdown: MarkdownSettings;
  contentPrivacy: ContentPrivacySettings;
}

export type SettingsResult = ResultEnvelope<Settings>;
export type VoidResult = ResultEnvelope<void>;
