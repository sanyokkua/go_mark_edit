import {
  bootstrapAppModelProjection,
  disposeAppModelProjection,
} from './appModelProjection';
import type {
  AppModelState,
  AppStatePatch,
  DocumentMetadata,
} from './appModelTypes';
import { store } from './index';
import type { AppModelAdapter } from '../adapter/appModelAdapter';

const documentMetadata: DocumentMetadata = {
  documentId: 'document-1',
  title: 'One',
  path: '/documents/one.md',
  dirty: false,
  encoding: 'utf-8',
  lineEnding: 'lf',
  wordCount: 1,
  view: {
    arrangement: 'split',
    editorVisible: true,
    previewVisible: true,
    cursor: { line: 1, column: 1 },
    selection: {
      start: { line: 1, column: 1 },
      end: { line: 1, column: 1 },
    },
    scroll: { editor: 0, preview: 0 },
  },
};

function appState(revision: number): AppModelState {
  return {
    snapshot: {
      revision,
      documents: { [documentMetadata.documentId]: documentMetadata },
      activeDocumentId: documentMetadata.documentId,
      ui: { sidebarVisible: true },
    },
    activeBuffer: {
      documentId: documentMetadata.documentId,
      content: '# Canonical content stays outside Redux',
    },
  };
}

function createAdapter(
  getState: () => Promise<AppModelState>,
): AppModelAdapter & {
  emitPatch: (patch: AppStatePatch) => void;
  emitRetainedPatch: (attempt: number, patch: AppStatePatch) => void;
} {
  const patchListeners: Array<(patch: AppStatePatch) => void> = [];

  return {
    getState,
    updateBuffer: jest.fn<Promise<void>, [string, string]>(),
    flushBuffer: jest.fn<Promise<void>, [string]>(),
    subscribeAcceptedBuffers: jest.fn<
      () => void,
      [(buffer: import('../adapter/appModelAdapter').AcceptedBuffer) => void]
    >(),
    setDocView: jest.fn(),
    updateDocView: jest.fn(),
    updateLocalDocView: jest.fn(),
    flushDocView: jest.fn<Promise<void>, [string]>(),
    setUILayout: jest.fn(),
    subscribeStatePatches(callback): () => void {
      patchListeners.push(callback);
      return jest.fn();
    },
    emitPatch(patch: AppStatePatch): void {
      patchListeners.at(-1)?.(patch);
    },
    emitRetainedPatch(attempt: number, patch: AppStatePatch): void {
      patchListeners[attempt]?.(patch);
    },
  };
}

afterEach((): void => {
  disposeAppModelProjection();
  localStorage.clear();
});

it('STORY-012-AC-1 strips content while hydrating projection metadata', async () => {
  const state = appState(3);
  const documentWithUnexpectedContent = {
    ...documentMetadata,
    content: 'must not enter Redux',
  };
  const adapter = createAdapter(async (): Promise<AppModelState> => ({
    ...state,
    snapshot: {
      ...state.snapshot,
      documents: {
        [documentMetadata.documentId]: documentWithUnexpectedContent,
      } as Record<string, DocumentMetadata>,
    },
  }));

  await expect(bootstrapAppModelProjection(adapter)).resolves.toEqual({
    status: 'ready',
    activeBuffer: state.activeBuffer,
  });

  const projection = store.getState();
  expect(projection.documents.byId).toEqual({
    [documentMetadata.documentId]: documentMetadata,
  });
  expect(projection).not.toHaveProperty('documents.byId.document-1.content');
  expect(JSON.stringify(projection)).not.toContain('Canonical content');
  expect(localStorage).toHaveLength(0);
});

it('STORY-012-AC-2 hydrates the projection once', async () => {
  let resolveState: ((state: AppModelState) => void) | undefined;
  const getState = jest.fn(
    () =>
      new Promise<AppModelState>((resolve): void => {
        resolveState = resolve;
      }),
  );
  const adapter = createAdapter(getState);

  const first = bootstrapAppModelProjection(adapter);
  const repeatedConsumer = bootstrapAppModelProjection(adapter);

  expect(repeatedConsumer).toBe(first);
  expect(getState).toHaveBeenCalledTimes(1);
  expect(resolveState).toBeDefined();
  resolveState?.(appState(4));

  await expect(first).resolves.toMatchObject({ status: 'ready' });
  expect(store.getState().documents.revision).toBe(4);
  expect(store.getState().ui.revision).toBe(4);
  expect(getState).toHaveBeenCalledTimes(1);
});

it('STORY-012-AC-3 reconciles revisioned content-free state patches', async () => {
  let resolveState: ((state: AppModelState) => void) | undefined;
  const adapter = createAdapter(
    () =>
      new Promise<AppModelState>((resolve): void => {
        resolveState = resolve;
      }),
  );

  const bootstrap = bootstrapAppModelProjection(adapter);
  adapter.emitPatch({
    revision: 7,
    documents: {
      upsert: {
        [documentMetadata.documentId]: {
          ...documentMetadata,
          dirty: true,
          wordCount: 7,
          view: { ...documentMetadata.view, arrangement: 'editor' },
        },
      },
    },
    ui: { sidebarVisible: false },
  });
  adapter.emitPatch({ revision: 6, ui: { sidebarVisible: true } });
  adapter.emitPatch({ revision: 7, ui: { assistantVisible: true } });

  resolveState?.(appState(5));
  await expect(bootstrap).resolves.toMatchObject({ status: 'ready' });

  adapter.emitPatch({
    revision: 8,
    documents: {
      upsert: {
        [documentMetadata.documentId]: {
          ...documentMetadata,
          dirty: true,
          wordCount: 8,
          view: { ...documentMetadata.view, arrangement: 'preview' },
        },
      },
    },
    ui: { assistantVisible: true },
  });
  adapter.emitPatch({ revision: 8, ui: { assistantVisible: false } });
  adapter.emitPatch({ revision: 7, ui: { previewPaneVisible: false } });

  const projection = store.getState();
  expect(projection.documents).toMatchObject({
    revision: 8,
    byId: {
      [documentMetadata.documentId]: {
        dirty: true,
        wordCount: 8,
        view: { arrangement: 'preview' },
      },
    },
  });
  expect(projection.ui).toEqual({
    revision: 8,
    layout: { sidebarVisible: false, assistantVisible: true },
  });
  expect(JSON.stringify(projection)).not.toContain('Canonical content');
});

it('STORY-027-AC-2 isolates stale listeners queued patches and partial projection', async () => {
  let rejectFirst: ((error: Error) => void) | undefined;
  const failedAttempt = createAdapter(
    () =>
      new Promise<AppModelState>((_resolve, reject): void => {
        rejectFirst = reject;
      }),
  );

  const first = bootstrapAppModelProjection(failedAttempt);
  failedAttempt.emitPatch({
    revision: 99,
    documents: { upsert: { [documentMetadata.documentId]: documentMetadata } },
    ui: { assistantVisible: true },
  });
  rejectFirst?.(new Error('first snapshot failed'));

  await expect(first).resolves.toEqual({ status: 'failed' });
  expect(store.getState().documents).toEqual({
    revision: -1,
    byId: {},
    activeDocumentId: '',
  });
  expect(store.getState().ui).toEqual({ revision: -1, layout: {} });

  let resolveRetry: ((state: AppModelState) => void) | undefined;
  const retryAttempt = createAdapter(
    () =>
      new Promise<AppModelState>((resolve): void => {
        resolveRetry = resolve;
      }),
  );
  const retry = bootstrapAppModelProjection(retryAttempt);

  failedAttempt.emitRetainedPatch(0, {
    revision: 100,
    documents: { upsert: { [documentMetadata.documentId]: documentMetadata } },
    ui: { sidebarVisible: false },
  });
  resolveRetry?.(appState(6));

  await expect(retry).resolves.toMatchObject({ status: 'ready' });
  expect(store.getState().documents.revision).toBe(6);
  expect(store.getState().ui).toEqual({
    revision: 6,
    layout: { sidebarVisible: true },
  });
});

it('STORY-027-AC-3 supports a fresh retry after each repeated failed attempt', async () => {
  const firstFailure = createAdapter(async (): Promise<AppModelState> => {
    throw new Error('first failure');
  });
  const secondFailure = createAdapter(async (): Promise<AppModelState> => {
    throw new Error('second failure');
  });
  const success = createAdapter(async (): Promise<AppModelState> =>
    appState(7),
  );

  const first = bootstrapAppModelProjection(firstFailure);
  expect(bootstrapAppModelProjection(firstFailure)).toBe(first);
  await expect(first).resolves.toEqual({ status: 'failed' });

  const second = bootstrapAppModelProjection(secondFailure);
  expect(bootstrapAppModelProjection(secondFailure)).toBe(second);
  await expect(second).resolves.toEqual({ status: 'failed' });

  await expect(bootstrapAppModelProjection(success)).resolves.toEqual({
    status: 'ready',
    activeBuffer: appState(7).activeBuffer,
  });
});
