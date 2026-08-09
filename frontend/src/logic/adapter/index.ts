import {
  GetSettings,
  UpdateAppearance,
  ResetAppearance,
  UpdateContentPrivacy,
  UpdateMarkdown,
  UpdateEditor,
  UpdateFile,
} from 'wailsjs/go/settings/SettingsHandler';
import {
  GetState,
  NewDocument,
  OpenDocument,
  OpenRecentFile,
  ReopenLastFile,
  ActivateDocument,
  ReorderDocument,
  CloseDocument,
  ExecuteClosePlan,
  CopyPath,
  PrepareClose,
  RevealInFileManager,
  ResolveClosePlan,
  SetDocView,
  SetUILayout,
  UpdateBuffer,
  Save,
  SaveAs,
  CheckExternalChanges,
  ReloadFromDisk,
  AuthorizeKeepMine,
  SkipConflict,
  CancelConflict,
} from 'wailsjs/go/appmodel/AppModelHandler';
import { apperr } from 'wailsjs/go/models';
import {
  EventsOn,
  WindowFullscreen,
  WindowGetSize,
  WindowIsFullscreen,
  WindowIsMaximised,
  WindowUnfullscreen,
  Quit,
} from 'wailsjs/runtime';
import {
  RetryStartup,
  WindowReady,
  AuthorizeQuit,
  CancelQuit,
} from 'wailsjs/go/application/ApplicationHandler';

import {
  createAppModelAdapter,
  type AppModelBindings,
  type AppModelRuntime,
} from './appModelAdapter';
import {
  createDocumentConflictAdapter,
  createDocumentWriteAdapter,
  createClosePlanAdapter,
  createSettingsAdapter,
  type SettingsBindings,
} from './services';
import { createWindowAdapter } from './windowAdapter';
import type {
  ClassifiedError,
  ConflictPreview,
  ConflictResult,
  ClosePlanResult,
  DocumentTransitionResult,
  DocumentMetadata,
  LineEndingOutcome,
  OpenResult,
  PathCommandResult,
  TabTransitionResult,
  WriteResult,
} from '../store/appModelTypes';
import { unwrapPromise } from './envelope';

const NATIVE_CLOSE_REQUEST_EVENT = 'application-close-requested';

function normalizeSaveStatus(
  status: string | undefined,
): DocumentMetadata['status'] {
  switch (status) {
    case 'not-saved':
    case 'unsaved-changes':
    case 'saved':
    case 'autosaved':
    case 'read-only':
      return status;
    default:
      return undefined;
  }
}

function normalizeClassifiedError(
  error: apperr.ClassifiedError | undefined,
): ClassifiedError | undefined {
  if (error === undefined) return undefined;
  return {
    ...error,
    category: error.category as ClassifiedError['category'],
    remediation: (error.remediation ?? '') as ClassifiedError['remediation'],
  };
}

function normalizeTransitionResult(
  result: apperr.DocumentTransitionResult,
): DocumentTransitionResult {
  return {
    data:
      result.data === undefined
        ? undefined
        : {
            documentId: result.data.documentId,
            documentRevision: result.data.documentRevision,
            projectionRevision: result.data.projectionRevision,
            content: result.data.content,
          },
    conflict: normalizeConflictPreview(result.conflict),
    error: normalizeClassifiedError(result.error),
  };
}

function normalizeConflictPreview(
  preview: apperr.ConflictPreview | undefined,
): ConflictPreview | undefined {
  if (preview === undefined) return undefined;
  return {
    contentRevision: preview.contentRevision,
    detectedDiskVersion: {
      exists: preview.detectedDiskVersion.exists,
      size: preview.detectedDiskVersion.size,
      modifiedUnixNano: String(preview.detectedDiskVersion.modifiedUnixNano),
      mode: preview.detectedDiskVersion.mode,
      fileIdentity: preview.detectedDiskVersion.fileIdentity,
    },
    displayName: preview.displayName,
    documentId: preview.documentId,
    metadataDifferences: preview.metadataDifferences
      ? [...preview.metadataDifferences]
      : undefined,
    onDisk: {
      byteCount: preview.onDisk.byteCount,
      lineCount: preview.onDisk.lineCount,
      text: preview.onDisk.text,
      truncated: preview.onDisk.truncated,
    },
    path: preview.path,
    readOnly: preview.readOnly,
    yours: {
      byteCount: preview.yours.byteCount,
      lineCount: preview.yours.lineCount,
      text: preview.yours.text,
      truncated: preview.yours.truncated,
    },
  };
}

function normalizeConflictResult(
  result: apperr.ConflictResult,
): ConflictResult {
  return {
    activeBuffer:
      result.activeBuffer === undefined
        ? undefined
        : {
            content: result.activeBuffer.content,
            documentId: result.activeBuffer.documentId,
            documentRevision: result.activeBuffer.documentRevision,
            projectionRevision: result.activeBuffer.projectionRevision,
          },
    decisionToken: result.decisionToken,
    documentId: result.documentId,
    documentRevision: result.documentRevision,
    error: normalizeClassifiedError(result.error),
    preview: normalizeConflictPreview(result.preview),
    projectionRevision: result.projectionRevision,
    status: result.status as ConflictResult['status'],
  };
}

function normalizeOpenResult(result: apperr.OpenResult): OpenResult {
  return {
    status: result.status as OpenResult['status'],
    documentId: result.documentId,
    projectionRevision: result.projectionRevision,
    activeBuffer:
      result.activeBuffer === undefined
        ? undefined
        : {
            documentId: result.activeBuffer.documentId,
            documentRevision: result.activeBuffer.documentRevision,
            projectionRevision: result.activeBuffer.projectionRevision,
            content: result.activeBuffer.content,
          },
    error: normalizeClassifiedError(result.error),
  };
}

function normalizeTabTransitionResult(
  result: apperr.TabTransitionResult,
): TabTransitionResult {
  return {
    status: result.status as TabTransitionResult['status'],
    documentId: result.documentId,
    projectionRevision: result.projectionRevision,
    tabSetRevision: result.tabSetRevision,
    orderedDocumentIds: [...(result.orderedDocumentIds ?? [])],
    activeDocumentId: result.activeDocumentId,
    activeBuffer:
      result.activeBuffer === undefined
        ? undefined
        : {
            documentId: result.activeBuffer.documentId,
            documentRevision: result.activeBuffer.documentRevision,
            projectionRevision: result.activeBuffer.projectionRevision,
            content: result.activeBuffer.content,
          },
    conflict: normalizeConflictPreview(result.conflict),
    error: normalizeClassifiedError(result.error),
  };
}

function normalizePathCommandResult(
  result: apperr.PathCommandResult,
): PathCommandResult {
  return {
    status: result.status as PathCommandResult['status'],
    error: normalizeClassifiedError(result.error),
  };
}

function normalizeWriteResult(result: apperr.WriteResult): WriteResult {
  return {
    status: result.status as WriteResult['status'],
    data:
      result.data === undefined
        ? undefined
        : {
            documentId: result.data.documentId,
            writtenContentRevision: result.data.writtenContentRevision,
            committedProjectionRevision:
              result.data.committedProjectionRevision,
            targetPath: result.data.targetPath,
            targetPathAdopted: result.data.targetPathAdopted,
            lineEndingOutcome: result.data
              .lineEndingOutcome as LineEndingOutcome,
            bomOutcome: result.data.bomOutcome as 'preserved' | 'absent',
            resyncRequired: result.data.resyncRequired,
          },
    decisionToken: result.decisionToken,
    proposedEnding:
      result.proposedEnding === undefined
        ? undefined
        : (result.proposedEnding as 'lf' | 'crlf'),
    documentRevision: result.documentRevision,
    conflict: normalizeConflictPreview(result.conflict),
    error: normalizeClassifiedError(result.error),
  };
}

const generatedSettingsBindings: SettingsBindings = {
  getSettings: GetSettings,
  updateAppearance: UpdateAppearance,
  resetAppearance: ResetAppearance,
  updateContentPrivacy: UpdateContentPrivacy,
  updateMarkdown: UpdateMarkdown,
  updateEditor: UpdateEditor,
  updateFile: UpdateFile,
};

export const settingsAdapter = createSettingsAdapter(generatedSettingsBindings);

export const documentWriteAdapter = createDocumentWriteAdapter({
  save: async (documentId, contentRevision, decisionToken) =>
    normalizeWriteResult(
      await Save(documentId, contentRevision, decisionToken),
    ),
  saveAs: async (documentId, contentRevision, decisionToken) =>
    normalizeWriteResult(
      await SaveAs(documentId, contentRevision, decisionToken),
    ),
});

export const documentConflictAdapter = createDocumentConflictAdapter({
  authorizeKeepMine: async (
    documentId,
    contentRevision,
    path,
    detectedVersion,
  ) =>
    normalizeConflictResult(
      await AuthorizeKeepMine(
        documentId,
        contentRevision,
        path,
        new apperr.DiskVersion(detectedVersion),
      ),
    ),
  cancelConflict: async (documentId, contentRevision, detectedVersion) =>
    normalizeConflictResult(
      await CancelConflict(
        documentId,
        contentRevision,
        new apperr.DiskVersion(detectedVersion),
      ),
    ),
  checkExternalChanges: async (documentId) =>
    normalizeConflictResult(await CheckExternalChanges(documentId)),
  reloadFromDisk: async (documentId, contentRevision, detectedVersion) =>
    normalizeConflictResult(
      await ReloadFromDisk(
        documentId,
        contentRevision,
        new apperr.DiskVersion(detectedVersion),
      ),
    ),
  skipConflict: async (documentId, contentRevision, detectedVersion) =>
    normalizeConflictResult(
      await SkipConflict(
        documentId,
        contentRevision,
        new apperr.DiskVersion(detectedVersion),
      ),
    ),
});

const generatedAppModelBindings: AppModelBindings = {
  getState: async () => {
    const result = await GetState();
    if (result.data === undefined) {
      return { error: result.error };
    }
    return {
      error: result.error,
      data: {
        snapshot: {
          ...result.data.snapshot,
          activeDocumentId: result.data.snapshot.activeDocumentId ?? null,
          orderedDocumentIds: result.data.snapshot.orderedDocumentIds ?? [],
          documents: Object.fromEntries(
            Object.entries(result.data.snapshot.documents ?? {}).map(
              ([documentId, document]) => [
                documentId,
                {
                  ...document,
                  status: normalizeSaveStatus(document.status),
                },
              ],
            ),
          ),
        },
        activeBuffer: result.data.activeBuffer ?? null,
      },
    };
  },
  newDocument: async (expectedTabSetRevision) =>
    normalizeTransitionResult(await NewDocument(expectedTabSetRevision)),
  openDocument: async (expectedTabSetRevision) =>
    normalizeOpenResult(await OpenDocument(expectedTabSetRevision)),
  openRecentFile: async (path, expectedTabSetRevision) =>
    normalizeOpenResult(await OpenRecentFile(path, expectedTabSetRevision)),
  reopenLastFile: async (expectedTabSetRevision) =>
    normalizeOpenResult(await ReopenLastFile(expectedTabSetRevision)),
  activateDocument: async (documentId, expectedTabSetRevision) =>
    normalizeTransitionResult(
      await ActivateDocument(documentId, expectedTabSetRevision),
    ),
  reorderDocument: async (documentId, targetIndex, expectedTabSetRevision) =>
    normalizeTabTransitionResult(
      await ReorderDocument(documentId, targetIndex, expectedTabSetRevision),
    ),
  closeDocument: async (documentId, expectedTabSetRevision) =>
    normalizeTabTransitionResult(
      await CloseDocument(documentId, expectedTabSetRevision),
    ),
  copyPath: async (documentId) =>
    normalizePathCommandResult(await CopyPath(documentId)),
  revealInFileManager: async (documentId) =>
    normalizePathCommandResult(await RevealInFileManager(documentId)),
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

export const closePlanAdapter = createClosePlanAdapter({
  prepareClose: async (kind, targetDocumentIds, expectedTabSetRevision) =>
    (await PrepareClose(
      kind,
      targetDocumentIds,
      expectedTabSetRevision,
    )) as unknown as ClosePlanResult,
  resolveClosePlan: async (planId, decisions) =>
    (await ResolveClosePlan(
      planId,
      decisions.map(
        (decision) =>
          new apperr.ClosePlanDecision({
            choice: decision.choice,
            decisionToken: decision.decisionToken,
            documentId: decision.documentId ?? '',
          }),
      ),
    )) as unknown as ClosePlanResult,
  executeClosePlan: (planId) =>
    ExecuteClosePlan(planId).then(normalizeTabTransitionResult),
});

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

export interface NativeLifecycleAdapter {
  onCloseRequested: (listener: () => void) => () => void;
  requestQuit: () => void;
  authorizeQuit: () => Promise<void>;
  cancelQuit: () => Promise<void>;
}

export const nativeLifecycleAdapter: NativeLifecycleAdapter = {
  onCloseRequested: (listener) =>
    EventsOn(NATIVE_CLOSE_REQUEST_EVENT, () => listener()),
  requestQuit: () => Quit(),
  authorizeQuit: async () => {
    await unwrapPromise(AuthorizeQuit());
  },
  cancelQuit: async () => {
    await unwrapPromise(CancelQuit());
  },
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
  createDocumentLifecycleAdapter,
  createDocumentWriteAdapter,
  createDocumentConflictAdapter,
  createClosePlanAdapter,
  type DocumentWriteAdapter,
  type DocumentWriteBindings,
  type DocumentConflictAdapter,
  type DocumentConflictBindings,
  type ClosePlanAdapter,
  type ClosePlanBindings,
  type DocumentLifecycleAdapter,
  type DocumentLifecycleBindings,
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
  EditorSettings,
  FileSettings,
  Settings,
} from './settingsTypes';
