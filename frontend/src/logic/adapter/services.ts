import { guardArity } from './bridgeGuard';
import { unwrap } from './envelope';
import type {
  ConflictResult,
  ClosePlanDecision,
  ClosePlanKind,
  ClosePlanResult,
  ClosePlanSummary,
  CloseTarget,
  DiskVersion,
  DocumentTransitionResult,
  OpenResult,
  WriteResult,
  TabTransitionResult,
} from '../store/appModelTypes';
import type {
  AppearanceSettings,
  ContentPrivacySettings,
  EditorSettings,
  FileSettings,
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
  updateFile: (settings: FileSettings) => Promise<VoidResult>;
}

export interface SettingsAdapter {
  getSettings: () => Promise<Settings>;
  updateAppearance: (settings: AppearanceSettings) => Promise<void>;
  resetAppearance: () => Promise<void>;
  updateContentPrivacy: (settings: ContentPrivacySettings) => Promise<void>;
  updateMarkdown: (settings: MarkdownSettings) => Promise<void>;
  updateEditor: (settings: EditorSettings) => Promise<void>;
  updateFile: (settings: FileSettings) => Promise<void>;
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

export interface DocumentConflictBindings {
  checkExternalChanges: (documentId: string) => Promise<ConflictResult>;
  reloadFromDisk: (
    documentId: string,
    contentRevision: number,
    detectedVersion: DiskVersion,
  ) => Promise<ConflictResult>;
  authorizeKeepMine: (
    documentId: string,
    contentRevision: number,
    path: string,
    detectedVersion: DiskVersion,
  ) => Promise<ConflictResult>;
  skipConflict: (
    documentId: string,
    contentRevision: number,
    detectedVersion: DiskVersion,
  ) => Promise<ConflictResult>;
  cancelConflict: (
    documentId: string,
    contentRevision: number,
    detectedVersion: DiskVersion,
  ) => Promise<ConflictResult>;
}

export type DocumentConflictAdapter = DocumentConflictBindings;

export interface ClosePlanBindings {
  prepareClose: (
    kind: ClosePlanKind,
    targetDocumentIds: string[],
    expectedTabSetRevision: number,
  ) => Promise<ClosePlanResult>;
  resolveClosePlan: (
    planId: string,
    decisions: ClosePlanDecision[],
  ) => Promise<ClosePlanResult>;
  executeClosePlan: (planId: string) => Promise<TabTransitionResult>;
}

export interface ClosePlanAdapter {
  prepareClose: ClosePlanBindings['prepareClose'];
  resolveClosePlan: ClosePlanBindings['resolveClosePlan'];
  executeClosePlan: ClosePlanBindings['executeClosePlan'];
}

function normalizeCloseTarget(target: CloseTarget): CloseTarget {
  return {
    ...target,
    conflict:
      target.conflict === undefined
        ? undefined
        : {
            ...target.conflict,
            detectedDiskVersion: {
              ...target.conflict.detectedDiskVersion,
              modifiedUnixNano: String(
                target.conflict.detectedDiskVersion.modifiedUnixNano,
              ),
            },
          },
  };
}

function normalizeClosePlanResult(result: ClosePlanResult): ClosePlanResult {
  return {
    error: result.error,
    data:
      result.data === undefined
        ? undefined
        : {
            ...result.data,
            kind: result.data.kind as ClosePlanSummary['kind'],
            status: result.data.status as ClosePlanSummary['status'],
            targets: result.data.targets.map(normalizeCloseTarget),
          },
  };
}

export function createClosePlanAdapter(
  bindings: ClosePlanBindings,
): ClosePlanAdapter {
  const prepareClose = guardArity(
    'AppModelHandler.PrepareClose',
    bindings.prepareClose,
  );
  const resolveClosePlan = guardArity(
    'AppModelHandler.ResolveClosePlan',
    bindings.resolveClosePlan,
  );
  const executeClosePlan = guardArity(
    'AppModelHandler.ExecuteClosePlan',
    bindings.executeClosePlan,
  );
  return {
    prepareClose: async (kind, targetDocumentIds, expectedTabSetRevision) =>
      normalizeClosePlanResult(
        await prepareClose(kind, targetDocumentIds, expectedTabSetRevision),
      ),
    resolveClosePlan: async (planId, decisions) =>
      normalizeClosePlanResult(await resolveClosePlan(planId, decisions)),
    executeClosePlan: async (planId) => executeClosePlan(planId),
  };
}

export function createDocumentConflictAdapter(
  bindings: DocumentConflictBindings,
): DocumentConflictAdapter {
  const checkExternalChanges = guardArity(
    'AppModelHandler.CheckExternalChanges',
    bindings.checkExternalChanges,
  );
  const reloadFromDisk = guardArity(
    'AppModelHandler.ReloadFromDisk',
    bindings.reloadFromDisk,
  );
  const authorizeKeepMine = guardArity(
    'AppModelHandler.AuthorizeKeepMine',
    bindings.authorizeKeepMine,
  );
  const skipConflict = guardArity(
    'AppModelHandler.SkipConflict',
    bindings.skipConflict,
  );
  const cancelConflict = guardArity(
    'AppModelHandler.CancelConflict',
    bindings.cancelConflict,
  );

  return {
    checkExternalChanges: (documentId) => checkExternalChanges(documentId),
    reloadFromDisk: (documentId, contentRevision, detectedVersion) =>
      reloadFromDisk(documentId, contentRevision, detectedVersion),
    authorizeKeepMine: (documentId, contentRevision, path, detectedVersion) =>
      authorizeKeepMine(documentId, contentRevision, path, detectedVersion),
    skipConflict: (documentId, contentRevision, detectedVersion) =>
      skipConflict(documentId, contentRevision, detectedVersion),
    cancelConflict: (documentId, contentRevision, detectedVersion) =>
      cancelConflict(documentId, contentRevision, detectedVersion),
  };
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
  const updateFile = guardArity(
    'SettingsHandler.UpdateFile',
    bindings.updateFile,
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
    async updateFile(settings: FileSettings): Promise<void> {
      return unwrap(await updateFile(settings));
    },
  };
}
