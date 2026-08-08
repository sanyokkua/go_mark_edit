import { guardArity } from './bridgeGuard';
import { unwrap } from './envelope';
import type {
  DocumentTransitionResult,
  OpenResult,
  WriteResult,
} from '../store/appModelTypes';
import type {
  AppearanceSettings,
  ContentPrivacySettings,
  EditorSettings,
  MarkdownSettings,
  Settings,
  SettingsResult,
  VoidResult,
} from './settingsTypes';

export interface SettingsBindings {
  getSettings: () => Promise<SettingsResult>;
  updateAppearance: (settings: AppearanceSettings) => Promise<VoidResult>;
  resetAppearance: () => Promise<VoidResult>;
  updateContentPrivacy: (
    settings: ContentPrivacySettings,
  ) => Promise<VoidResult>;
  updateMarkdown: (settings: MarkdownSettings) => Promise<VoidResult>;
  updateEditor: (settings: EditorSettings) => Promise<VoidResult>;
}

export interface SettingsAdapter {
  getSettings: () => Promise<Settings>;
  updateAppearance: (settings: AppearanceSettings) => Promise<void>;
  resetAppearance: () => Promise<void>;
  updateContentPrivacy: (settings: ContentPrivacySettings) => Promise<void>;
  updateMarkdown: (settings: MarkdownSettings) => Promise<void>;
  updateEditor: (settings: EditorSettings) => Promise<void>;
}

export interface DocumentLifecycleBindings {
  newDocument: (
    expectedTabSetRevision: number,
  ) => Promise<DocumentTransitionResult>;
  openDocument: (expectedTabSetRevision: number) => Promise<OpenResult>;
}

export interface DocumentLifecycleAdapter {
  newDocument: (
    expectedTabSetRevision: number,
  ) => Promise<DocumentTransitionResult>;
  openDocument: (expectedTabSetRevision: number) => Promise<OpenResult>;
}

export interface DocumentWriteBindings {
  save: (
    documentId: string,
    contentRevision: number,
    decisionToken: string,
  ) => Promise<WriteResult>;
  saveAs: (
    documentId: string,
    contentRevision: number,
    decisionToken: string,
  ) => Promise<WriteResult>;
}

export interface DocumentWriteAdapter {
  save: DocumentWriteBindings['save'];
  saveAs: DocumentWriteBindings['saveAs'];
}

export function createDocumentLifecycleAdapter(
  bindings: DocumentLifecycleBindings,
): DocumentLifecycleAdapter {
  const newDocument = guardArity(
    'AppModelHandler.NewDocument',
    bindings.newDocument,
  );
  const openDocument = guardArity(
    'AppModelHandler.OpenDocument',
    bindings.openDocument,
  );

  return {
    newDocument: (expectedTabSetRevision: number) =>
      newDocument(expectedTabSetRevision),
    openDocument: (expectedTabSetRevision: number) =>
      openDocument(expectedTabSetRevision),
  };
}

export function createDocumentWriteAdapter(
  bindings: DocumentWriteBindings,
): DocumentWriteAdapter {
  const save = guardArity('AppModelHandler.Save', bindings.save);
  const saveAs = guardArity('AppModelHandler.SaveAs', bindings.saveAs);

  return {
    save: (documentId, contentRevision, decisionToken) =>
      save(documentId, contentRevision, decisionToken),
    saveAs: (documentId, contentRevision, decisionToken) =>
      saveAs(documentId, contentRevision, decisionToken),
  };
}

export function createSettingsAdapter(
  bindings: SettingsBindings,
): SettingsAdapter {
  const getSettings = guardArity(
    'SettingsHandler.GetSettings',
    bindings.getSettings,
  );
  const updateAppearance = guardArity(
    'SettingsHandler.UpdateAppearance',
    bindings.updateAppearance,
  );
  const resetAppearance = guardArity(
    'SettingsHandler.ResetAppearance',
    bindings.resetAppearance,
  );
  const updateContentPrivacy = guardArity(
    'SettingsHandler.UpdateContentPrivacy',
    bindings.updateContentPrivacy,
  );
  const updateMarkdown = guardArity(
    'SettingsHandler.UpdateMarkdown',
    bindings.updateMarkdown,
  );
  const updateEditor = guardArity(
    'SettingsHandler.UpdateEditor',
    bindings.updateEditor,
  );

  return {
    async getSettings(): Promise<Settings> {
      return unwrap(await getSettings());
    },
    async updateAppearance(settings: AppearanceSettings): Promise<void> {
      return unwrap(await updateAppearance(settings));
    },
    async resetAppearance(): Promise<void> {
      return unwrap(await resetAppearance());
    },
    async updateContentPrivacy(
      settings: ContentPrivacySettings,
    ): Promise<void> {
      return unwrap(await updateContentPrivacy(settings));
    },
    async updateMarkdown(settings: MarkdownSettings): Promise<void> {
      return unwrap(await updateMarkdown(settings));
    },
    async updateEditor(settings: EditorSettings): Promise<void> {
      return unwrap(await updateEditor(settings));
    },
  };
}
