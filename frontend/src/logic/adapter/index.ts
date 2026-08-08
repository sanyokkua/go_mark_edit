import {
  GetSettings,
  UpdateAppearance,
  ResetAppearance,
  UpdateContentPrivacy,
  UpdateMarkdown,
  UpdateEditor,
} from 'wailsjs/go/settings/SettingsHandler';
import {
  GetState,
  NewDocument,
  OpenDocument,
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
import type {
  ClassifiedError,
  DocumentTransitionResult,
  DocumentMetadata,
  OpenResult,
} from '../store/appModelTypes';

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
    error: normalizeClassifiedError(result.error),
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

const generatedSettingsBindings: SettingsBindings = {
  getSettings: GetSettings,
  updateAppearance: UpdateAppearance,
  resetAppearance: ResetAppearance,
  updateContentPrivacy: UpdateContentPrivacy,
  updateMarkdown: UpdateMarkdown,
  updateEditor: UpdateEditor,
};

export const settingsAdapter = createSettingsAdapter(generatedSettingsBindings);

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
  createDocumentLifecycleAdapter,
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
  Settings,
} from './settingsTypes';
