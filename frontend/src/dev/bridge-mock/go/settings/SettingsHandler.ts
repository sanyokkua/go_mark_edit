interface AppearanceSettings {
  theme: string;
  mode: string;
  defaultOpenMode: string;
}

interface MarkdownSettings {
  standard: string;
  formatOnSave: boolean;
  lintOnSave: boolean;
  bulletMarker: string;
  emphasisMarker: string;
  headingStyle: string;
}

interface ContentPrivacySettings {
  remotePolicy: string;
}

interface EditorSettings {
  lineNumbers: boolean;
  wordWrap: boolean;
  fontSize: 13 | 14 | 16;
}

interface FileSettings {
  autosave: boolean;
}

interface Settings {
  appearance: AppearanceSettings;
  markdown: MarkdownSettings;
  contentPrivacy: ContentPrivacySettings;
  editor: EditorSettings;
  file: FileSettings;
}

interface WireError {
  code: string;
  title: string;
  message: string;
  retryable: boolean;
}

interface SettingsResult {
  data?: Settings;
  error?: WireError;
}

interface VoidResult {
  error?: WireError;
}

let settings: Settings = {
  appearance: {
    theme: 'material',
    mode: 'auto',
    defaultOpenMode: 'editor',
  },
  markdown: {
    standard: 'gfm',
    formatOnSave: false,
    lintOnSave: true,
    bulletMarker: '-',
    emphasisMarker: '*',
    headingStyle: 'atx',
  },
  contentPrivacy: {
    remotePolicy: 'ask',
  },
  editor: {
    lineNumbers: true,
    wordWrap: false,
    fontSize: 14,
  },
  file: {
    autosave: true,
  },
};

function cloneSettings(): Settings {
  return {
    appearance: { ...settings.appearance },
    markdown: { ...settings.markdown },
    contentPrivacy: { ...settings.contentPrivacy },
    editor: { ...settings.editor },
    file: { ...settings.file },
  };
}

function validationError(): VoidResult {
  return {
    error: {
      code: 'validation',
      title: 'Invalid setting',
      message: 'The mock rejected this setting value.',
      retryable: false,
    },
  };
}

export function GetSettings(): Promise<SettingsResult>;
export function GetSettings(_request: bridge.Request): Promise<SettingsResult>;
export function GetSettings(
  ...args: [] | [bridge.Request]
): Promise<SettingsResult> {
  void args;
  return Promise.resolve({ data: cloneSettings() });
}

export function UpdateAppearance(
  nextAppearance: AppearanceSettings,
): Promise<VoidResult>;
export function UpdateAppearance(
  request: bridge.Request,
  nextAppearance: AppearanceSettings,
): Promise<VoidResult>;
export function UpdateAppearance(
  requestOrAppearance: bridge.Request | AppearanceSettings,
  ...args: [AppearanceSettings?]
): Promise<VoidResult> {
  const nextAppearance = isRequest(requestOrAppearance)
    ? (args[0] as AppearanceSettings)
    : requestOrAppearance;
  if (
    nextAppearance.theme === 'error' ||
    new URLSearchParams(globalThis.location.search).has('rejectAppearance')
  ) {
    return Promise.resolve(validationError());
  }

  settings = {
    ...settings,
    appearance: { ...nextAppearance },
  };
  return Promise.resolve({});
}

export function ResetAppearance(): Promise<VoidResult>;
export function ResetAppearance(_request: bridge.Request): Promise<VoidResult>;
export function ResetAppearance(
  ...args: [] | [bridge.Request]
): Promise<VoidResult> {
  void args;
  settings = {
    ...settings,
    appearance: { theme: 'material', mode: 'auto', defaultOpenMode: 'editor' },
  };
  return Promise.resolve({});
}

export function UpdateContentPrivacy(
  nextContentPrivacy: ContentPrivacySettings,
): Promise<VoidResult>;
export function UpdateContentPrivacy(
  request: bridge.Request,
  nextContentPrivacy: ContentPrivacySettings,
): Promise<VoidResult>;
export function UpdateContentPrivacy(
  requestOrPrivacy: bridge.Request | ContentPrivacySettings,
  ...args: [ContentPrivacySettings?]
): Promise<VoidResult> {
  const nextContentPrivacy = isRequest(requestOrPrivacy)
    ? (args[0] as ContentPrivacySettings)
    : requestOrPrivacy;
  if (nextContentPrivacy.remotePolicy === 'error') {
    return Promise.resolve(validationError());
  }

  settings = {
    ...settings,
    contentPrivacy: { ...nextContentPrivacy },
  };
  return Promise.resolve({});
}

export function UpdateMarkdown(
  nextMarkdown: MarkdownSettings,
): Promise<VoidResult>;
export function UpdateMarkdown(
  request: bridge.Request,
  nextMarkdown: MarkdownSettings,
): Promise<VoidResult>;
export function UpdateMarkdown(
  requestOrMarkdown: bridge.Request | MarkdownSettings,
  ...args: [MarkdownSettings?]
): Promise<VoidResult> {
  const nextMarkdown = isRequest(requestOrMarkdown)
    ? (args[0] as MarkdownSettings)
    : requestOrMarkdown;
  if (nextMarkdown.standard === 'error') {
    return Promise.resolve(validationError());
  }

  settings = {
    ...settings,
    markdown: { ...nextMarkdown },
  };
  return Promise.resolve({});
}

export function UpdateEditor(nextEditor: EditorSettings): Promise<VoidResult>;
export function UpdateEditor(
  request: bridge.Request,
  nextEditor: EditorSettings,
): Promise<VoidResult>;
export function UpdateEditor(
  requestOrEditor: bridge.Request | EditorSettings,
  ...args: [EditorSettings?]
): Promise<VoidResult> {
  const nextEditor = isRequest(requestOrEditor)
    ? (args[0] as EditorSettings)
    : requestOrEditor;
  if (![13, 14, 16].includes(nextEditor.fontSize)) {
    return Promise.resolve(validationError());
  }
  settings = { ...settings, editor: { ...nextEditor } };
  return Promise.resolve({});
}

export function UpdateFile(nextFile: FileSettings): Promise<VoidResult>;
export function UpdateFile(
  request: bridge.Request,
  nextFile: FileSettings,
): Promise<VoidResult>;
export function UpdateFile(
  requestOrFile: bridge.Request | FileSettings,
  ...args: [FileSettings?]
): Promise<VoidResult> {
  const nextFile = isRequest(requestOrFile)
    ? (args[0] as FileSettings)
    : requestOrFile;
  settings = { ...settings, file: { ...nextFile } };
  return Promise.resolve({});
}

function isRequest(value: unknown): value is bridge.Request {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string'
  );
}
import type { bridge } from '../../../../../wailsjs/go/models';
