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
  OpenPreviewLink,
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
  CancelNormalization,
  CheckExternalChanges,
  ReloadFromDisk,
  AuthorizeKeepMine,
  SkipConflict,
  CancelConflict,
} from 'wailsjs/go/appmodel/AppModelHandler';
import { apperr, bridge } from 'wailsjs/go/models';
import {
  EventsOn,
  WindowFullscreen,
  WindowGetSize,
  WindowIsFullscreen,
  WindowIsMaximised,
  WindowUnfullscreen,
  Quit,
  BrowserOpenURL,
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
import { store } from '../store';
import {
  dismissStuckCommand,
  notifyStuckCommand,
} from '../store/notificationsSlice';
import {
  createCommandInvoker,
  getBootstrapStatus,
  type CommandBindOptions,
} from './command';
import { EVENTS } from './events';

const commandInvoker = createCommandInvoker({
  isReady: (): boolean => getBootstrapStatus() === 'ready',
  requestFactory: (requestId): bridge.Request =>
    new bridge.Request({ id: requestId }),
  noticeOwner: {
    show: ({ command, requestId }): void => {
      store.dispatch(notifyStuckCommand(requestId, command));
    },
    withdraw: (requestId): void => {
      store.dispatch(dismissStuckCommand(requestId));
    },
  },
});

const commandArities: Readonly<Record<string, number>> = {
  'SettingsHandler.GetSettings': 0,
  'SettingsHandler.UpdateAppearance': 1,
  'SettingsHandler.ResetAppearance': 0,
  'SettingsHandler.UpdateContentPrivacy': 1,
  'SettingsHandler.UpdateMarkdown': 1,
  'SettingsHandler.UpdateEditor': 1,
  'SettingsHandler.UpdateFile': 1,
  'AppModelHandler.GetState': 0,
  'AppModelHandler.NewDocument': 1,
  'AppModelHandler.OpenDocument': 1,
  'AppModelHandler.OpenRecentFile': 2,
  'AppModelHandler.OpenPreviewLink': 2,
  'AppModelHandler.ReopenLastFile': 1,
  'AppModelHandler.ActivateDocument': 2,
  'AppModelHandler.ReorderDocument': 3,
  'AppModelHandler.CloseDocument': 2,
  'AppModelHandler.CopyPath': 1,
  'AppModelHandler.RevealInFileManager': 1,
  'AppModelHandler.UpdateBuffer': 2,
  'AppModelHandler.SetDocView': 2,
  'AppModelHandler.SetUILayout': 1,
  'AppModelHandler.PrepareClose': 3,
  'AppModelHandler.ResolveClosePlan': 2,
  'AppModelHandler.ExecuteClosePlan': 1,
  'AppModelHandler.Save': 3,
  'AppModelHandler.SaveAs': 3,
  'AppModelHandler.CancelNormalization': 2,
  'AppModelHandler.CheckExternalChanges': 1,
  'AppModelHandler.ReloadFromDisk': 3,
  'AppModelHandler.AuthorizeKeepMine': 4,
  'AppModelHandler.SkipConflict': 3,
  'AppModelHandler.CancelConflict': 3,
  'ApplicationHandler.RetryStartup': 0,
  'ApplicationHandler.WindowReady': 0,
  'ApplicationHandler.AuthorizeQuit': 1,
  'ApplicationHandler.CancelQuit': 1,
};

function command<TArgs extends unknown[], TResult>(
  commandName: string,
  bound: (request: bridge.Request, ...args: TArgs) => Promise<TResult>,
  options?: CommandBindOptions<TArgs>,
): (...args: TArgs) => Promise<TResult> {
  return commandInvoker.bind(commandName, bound, {
    ...options,
    expectedArity: options?.expectedArity ?? commandArities[commandName],
  });
}

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
    remediations: (error.remediations ?? []) as ClassifiedError['remediations'],
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
  getSettings: command('SettingsHandler.GetSettings', GetSettings),
  updateAppearance: command(
    'SettingsHandler.UpdateAppearance',
    UpdateAppearance,
  ),
  resetAppearance: command('SettingsHandler.ResetAppearance', ResetAppearance),
  updateContentPrivacy: command(
    'SettingsHandler.UpdateContentPrivacy',
    UpdateContentPrivacy,
  ),
  updateMarkdown: command('SettingsHandler.UpdateMarkdown', UpdateMarkdown),
  updateEditor: command('SettingsHandler.UpdateEditor', UpdateEditor),
  updateFile: command('SettingsHandler.UpdateFile', UpdateFile),
};

export const settingsAdapter = createSettingsAdapter(generatedSettingsBindings);

const commandInvokerSave = command('AppModelHandler.Save', Save, {
  pacing: (documentId: string): 'bounded' | 'user-paced' =>
    store.getState().documents.byId[documentId]?.path === ''
      ? 'user-paced'
      : 'bounded',
});
const commandInvokerSaveAs = command('AppModelHandler.SaveAs', SaveAs, {
  pacing: 'user-paced',
});
const commandInvokerCancelNormalization = command(
  'AppModelHandler.CancelNormalization',
  CancelNormalization,
);
const commandInvokerCheckExternalChanges = command(
  'AppModelHandler.CheckExternalChanges',
  CheckExternalChanges,
);
const commandInvokerReloadFromDisk = command(
  'AppModelHandler.ReloadFromDisk',
  ReloadFromDisk,
);
const commandInvokerAuthorizeKeepMine = command(
  'AppModelHandler.AuthorizeKeepMine',
  AuthorizeKeepMine,
);
const commandInvokerSkipConflict = command(
  'AppModelHandler.SkipConflict',
  SkipConflict,
);
const commandInvokerCancelConflict = command(
  'AppModelHandler.CancelConflict',
  CancelConflict,
);

const commandInvokerGetState = command('AppModelHandler.GetState', GetState);
const commandInvokerNewDocument = command(
  'AppModelHandler.NewDocument',
  NewDocument,
);
const commandInvokerOpenDocument = command(
  'AppModelHandler.OpenDocument',
  OpenDocument,
  { pacing: 'user-paced' },
);
const commandInvokerOpenRecentFile = command(
  'AppModelHandler.OpenRecentFile',
  OpenRecentFile,
);
const commandInvokerOpenPreviewLink = command(
  'AppModelHandler.OpenPreviewLink',
  OpenPreviewLink,
);
const commandInvokerReopenLastFile = command(
  'AppModelHandler.ReopenLastFile',
  ReopenLastFile,
);
const commandInvokerActivateDocument = command(
  'AppModelHandler.ActivateDocument',
  ActivateDocument,
);
const commandInvokerReorderDocument = command(
  'AppModelHandler.ReorderDocument',
  ReorderDocument,
);
const commandInvokerCloseDocument = command(
  'AppModelHandler.CloseDocument',
  CloseDocument,
);
const commandInvokerCopyPath = command('AppModelHandler.CopyPath', CopyPath);
const commandInvokerRevealInFileManager = command(
  'AppModelHandler.RevealInFileManager',
  RevealInFileManager,
);
const commandInvokerUpdateBuffer = command(
  'AppModelHandler.UpdateBuffer',
  UpdateBuffer,
);
const commandInvokerSetDocView = command(
  'AppModelHandler.SetDocView',
  SetDocView,
);
const commandInvokerSetUILayout = command(
  'AppModelHandler.SetUILayout',
  SetUILayout,
);
const commandInvokerPrepareClose = command(
  'AppModelHandler.PrepareClose',
  PrepareClose,
);
const commandInvokerResolveClosePlan = command(
  'AppModelHandler.ResolveClosePlan',
  ResolveClosePlan,
  { pacing: 'user-paced' },
);
const commandInvokerExecuteClosePlan = command(
  'AppModelHandler.ExecuteClosePlan',
  ExecuteClosePlan,
);
const commandInvokerRetryStartup = command(
  'ApplicationHandler.RetryStartup',
  RetryStartup,
);
const commandInvokerWindowReady = command(
  'ApplicationHandler.WindowReady',
  WindowReady,
);
const commandInvokerAuthorizeQuit = command(
  'ApplicationHandler.AuthorizeQuit',
  AuthorizeQuit,
);
const commandInvokerCancelQuit = command(
  'ApplicationHandler.CancelQuit',
  CancelQuit,
);

export const documentWriteAdapter = createDocumentWriteAdapter({
  save: async (documentId, contentRevision, decisionToken) =>
    normalizeWriteResult(
      await commandInvokerSave(documentId, contentRevision, decisionToken),
    ),
  saveAs: async (documentId, contentRevision, decisionToken) =>
    normalizeWriteResult(
      await commandInvokerSaveAs(documentId, contentRevision, decisionToken),
    ),
  cancelNormalization: async (documentId, decisionToken) =>
    commandInvokerCancelNormalization(documentId, decisionToken),
});

export const documentConflictAdapter = createDocumentConflictAdapter({
  authorizeKeepMine: async (
    documentId,
    contentRevision,
    path,
    detectedVersion,
  ) =>
    normalizeConflictResult(
      await commandInvokerAuthorizeKeepMine(
        documentId,
        contentRevision,
        path,
        new apperr.DiskVersion(detectedVersion),
      ),
    ),
  cancelConflict: async (documentId, contentRevision, detectedVersion) =>
    normalizeConflictResult(
      await commandInvokerCancelConflict(
        documentId,
        contentRevision,
        new apperr.DiskVersion(detectedVersion),
      ),
    ),
  checkExternalChanges: async (documentId) =>
    normalizeConflictResult(
      await commandInvokerCheckExternalChanges(documentId),
    ),
  reloadFromDisk: async (documentId, contentRevision, detectedVersion) =>
    normalizeConflictResult(
      await commandInvokerReloadFromDisk(
        documentId,
        contentRevision,
        new apperr.DiskVersion(detectedVersion),
      ),
    ),
  skipConflict: async (documentId, contentRevision, detectedVersion) =>
    normalizeConflictResult(
      await commandInvokerSkipConflict(
        documentId,
        contentRevision,
        new apperr.DiskVersion(detectedVersion),
      ),
    ),
});

const generatedAppModelBindings: AppModelBindings = {
  getState: async () => {
    const result = await commandInvokerGetState();
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
          pendingClose:
            result.data.snapshot.pendingClose === undefined
              ? undefined
              : { id: result.data.snapshot.pendingClose.id },
        },
        activeBuffer: result.data.activeBuffer ?? null,
      },
    };
  },
  newDocument: async (expectedTabSetRevision) =>
    normalizeTransitionResult(
      await commandInvokerNewDocument(expectedTabSetRevision),
    ),
  openDocument: async (expectedTabSetRevision) =>
    normalizeOpenResult(
      await commandInvokerOpenDocument(expectedTabSetRevision),
    ),
  openRecentFile: async (path, expectedTabSetRevision) =>
    normalizeOpenResult(
      await commandInvokerOpenRecentFile(path, expectedTabSetRevision),
    ),
  openPreviewLink: async (documentId, href) =>
    normalizeOpenResult(await commandInvokerOpenPreviewLink(documentId, href)),
  openExternalLink: (href) => BrowserOpenURL(href),
  reopenLastFile: async (expectedTabSetRevision) =>
    normalizeOpenResult(
      await commandInvokerReopenLastFile(expectedTabSetRevision),
    ),
  activateDocument: async (documentId, expectedTabSetRevision) =>
    normalizeTransitionResult(
      await commandInvokerActivateDocument(documentId, expectedTabSetRevision),
    ),
  reorderDocument: async (documentId, targetIndex, expectedTabSetRevision) =>
    normalizeTabTransitionResult(
      await commandInvokerReorderDocument(
        documentId,
        targetIndex,
        expectedTabSetRevision,
      ),
    ),
  closeDocument: async (documentId, expectedTabSetRevision) =>
    normalizeTabTransitionResult(
      await commandInvokerCloseDocument(documentId, expectedTabSetRevision),
    ),
  copyPath: async (documentId) =>
    normalizePathCommandResult(await commandInvokerCopyPath(documentId)),
  revealInFileManager: async (documentId) =>
    normalizePathCommandResult(
      await commandInvokerRevealInFileManager(documentId),
    ),
  updateBuffer: commandInvokerUpdateBuffer,
  setDocView: (documentId, view) =>
    commandInvokerSetDocView(documentId, new apperr.DocViewInput(view)),
  setUILayout: (layout) =>
    commandInvokerSetUILayout(new apperr.UILayout(layout)),
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
    (await commandInvokerPrepareClose(
      kind,
      targetDocumentIds,
      expectedTabSetRevision,
    )) as unknown as ClosePlanResult,
  resolveClosePlan: async (planId, decisions) =>
    (await commandInvokerResolveClosePlan(
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
    commandInvokerExecuteClosePlan(planId).then(normalizeTabTransitionResult),
});

export const windowAdapter = createWindowAdapter({
  retryStartup: commandInvokerRetryStartup,
  windowReady: commandInvokerWindowReady,
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
  onCloseRequested: (listener: (closeID?: string) => void) => () => void;
  requestQuit: () => void;
  /**
   * Arms the one-use native close permit, or returns the classified reason it
   * could not be armed.
   *
   * A refusal is returned rather than thrown, and it is not routed through
   * `unwrapPromise`. A drain failure reaches the user as a
   * classified `io-failure` offering Retry; `unwrapPromise` dispatches
   * `notifyError`, which renders generic catalogue copy from an internal
   * `WireError` code and can carry no remediation. Handing the caller the
   * `ClassifiedError` lets it report the backend's own message and offer the
   * control the requirement names. A rejected promise still throws — that is a
   * dead bridge, not a classified outcome.
   */
  authorizeQuit: (closeID: string) => Promise<ClassifiedError | undefined>;
  cancelQuit: (closeID: string) => Promise<void>;
}

function closeRequestID(payload: unknown): string | undefined {
  if (
    typeof payload === 'object' &&
    payload !== null &&
    'id' in payload &&
    typeof payload.id === 'string'
  ) {
    return payload.id;
  }
  return typeof payload === 'string' ? payload : undefined;
}

export const nativeLifecycleAdapter: NativeLifecycleAdapter = {
  onCloseRequested: (listener) =>
    EventsOn(EVENTS.applicationCloseRequested, (payload: unknown) =>
      listener(closeRequestID(payload)),
    ),
  requestQuit: () => Quit(),
  authorizeQuit: async (closeID) =>
    normalizeClassifiedError(
      (await commandInvokerAuthorizeQuit(closeID)).error,
    ),
  cancelQuit: async (closeID) => {
    const result = await commandInvokerCancelQuit(closeID);
    if (result.error !== undefined) throw result.error;
  },
};

export const commandAdapter = {
  retry: commandInvoker.retry,
  cancel: commandInvoker.cancel,
};

export { guardArity } from './bridgeGuard';
export { unwrap, unwrapPromise } from './envelope';
export {
  createCommandInvoker,
  getBootstrapStatus,
  setBootstrapStatus,
  type BootstrapStatus,
  type CommandBindOptions,
  type CommandInvoker,
  type CommandInvokerOptions,
  type CommandNoticeOwner,
  type CommandPacing,
} from './command';
export { EVENTS, type AdapterEventName } from './events';
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
