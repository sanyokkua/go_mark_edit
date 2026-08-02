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

interface Settings {
  appearance: AppearanceSettings;
  markdown: MarkdownSettings;
  contentPrivacy: ContentPrivacySettings;
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
    lintOnSave: false,
    bulletMarker: '-',
    emphasisMarker: '*',
    headingStyle: 'atx',
  },
  contentPrivacy: {
    remotePolicy: 'ask',
  },
};

function cloneSettings(): Settings {
  return {
    appearance: { ...settings.appearance },
    markdown: { ...settings.markdown },
    contentPrivacy: { ...settings.contentPrivacy },
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

export function GetSettings(): Promise<SettingsResult> {
  return Promise.resolve({ data: cloneSettings() });
}

export function UpdateAppearance(
  nextAppearance: AppearanceSettings,
): Promise<VoidResult> {
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

export function ResetAppearance(): Promise<VoidResult> {
  settings = {
    ...settings,
    appearance: { theme: 'material', mode: 'auto', defaultOpenMode: 'editor' },
  };
  return Promise.resolve({});
}

export function UpdateContentPrivacy(
  nextContentPrivacy: ContentPrivacySettings,
): Promise<VoidResult> {
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
): Promise<VoidResult> {
  if (nextMarkdown.standard === 'error') {
    return Promise.resolve(validationError());
  }

  settings = {
    ...settings,
    markdown: { ...nextMarkdown },
  };
  return Promise.resolve({});
}
