import {
  bootstrapAppModelProjection,
  disposeAppModelProjection,
} from '../../../src/logic/store/appModelProjection';
import type {
  AppModelState,
  AppStatePatch,
  DocumentMetadata,
} from '../../../src/logic/store/appModelTypes';
import { store } from '../../../src/logic/store/index';
import type { AppModelAdapter } from '../../../src/logic/adapter/appModelAdapter';
import { dismissNotification } from '../../../src/logic/store/notificationsSlice';
import type { WireError } from '../../../src/logic/utils/parseError';

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
      applicationVersion: 'test-build',
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
  emitError: (error: WireError) => void;
  emitPatch: (patch: AppStatePatch) => void;
  emitRetainedPatch: (attempt: number, patch: AppStatePatch) => void;
} {
  const patchListeners: Array<(patch: AppStatePatch) => void> = [];
  const errorListeners: Array<(error: WireError) => void> = [];

  return {
    getState,
    updateBuffer: jest.fn<Promise<void>, [string, string]>(),
    flushBuffer: jest.fn<Promise<void>, [string]>(),
    subscribeAcceptedBuffers: jest.fn<
      () => void,
      [(buffer: import('../../../src/logic/adapter/appModelAdapter').AcceptedBuffer) => void]
    >(),
    setDocView: jest.fn(),
    updateDocView: jest.fn(),
    updateLocalDocView: jest.fn(),
    flushDocView: jest.fn<Promise<void>, [string]>(),
    setUILayout: jest.fn(),
    reconcileCommittedWrite: jest.fn(),
    subscribeAsyncErrors(callback): () => void {
      errorListeners.push(callback);
      return jest.fn();
    },
    subscribeStatePatches(callback): () => void {
      patchListeners.push(callback);
      return jest.fn();
    },
    emitError(error: WireError): void {
      errorListeners.at(-1)?.(error);
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
  for (const notification of store.getState().notifications.items) {
    store.dispatch(dismissNotification(notification.id));
  }
});

it('strips content while hydrating projection metadata', async () => {
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
    applicationVersion: 'test-build',
  });

  const projection = store.getState();
  expect(projection.documents.byId).toEqual({
    [documentMetadata.documentId]: documentMetadata,
  });
  expect(projection).not.toHaveProperty('documents.byId.document-1.content');
  expect(JSON.stringify(projection)).not.toContain('Canonical content');
  expect(localStorage).toHaveLength(0);
});

it('dev bridge dirty state follows disk baseline', async (): Promise<void> => {
  const state = appState(12);
  state.snapshot.documents = {
    [documentMetadata.documentId]: {
      ...documentMetadata,
      dirty: true,
      status: 'unsaved-changes',
    } as DocumentMetadata,
  };

  await expect(
    bootstrapAppModelProjection(createAdapter(async () => state)),
  ).resolves.toMatchObject({ status: 'ready' });

  expect(
    store.getState().documents.byId[documentMetadata.documentId],
  ).toMatchObject({
    dirty: true,
    status: 'unsaved-changes',
  });
});

it('projects optional active state', async () => {
  const state = appState(9);
  state.snapshot.documents = {};
  state.snapshot.orderedDocumentIds = [];
  state.snapshot.activeDocumentId = null;
  state.snapshot.activeDocument = null;
  state.activeBuffer = null;

  await expect(
    bootstrapAppModelProjection(createAdapter(async () => state)),
  ).resolves.toEqual({
    status: 'ready',
    activeBuffer: null,
    applicationVersion: 'test-build',
  });

  expect(store.getState().documents).toMatchObject({
    revision: 9,
    tabSetRevision: 9,
    orderedIds: [],
    byId: {},
    activeDocumentId: null,
  });
});

it('clears a stale active identity when the last ordered document is removed', async () => {
  const state = appState(9);
  const adapter = createAdapter(async (): Promise<AppModelState> => state);

  await expect(bootstrapAppModelProjection(adapter)).resolves.toMatchObject({
    status: 'ready',
  });

  adapter.emitPatch({
    revision: 10,
    orderedDocumentIds: [],
    documents: { remove: [documentMetadata.documentId] },
  });

  expect(store.getState().documents).toMatchObject({
    orderedIds: [],
    byId: {},
    activeDocumentId: null,
  });
});

it('hydrates backend-acknowledged native geometry without a browser-owned substitute', async () => {
  const state = appState(3);
  state.snapshot.ui = {
    windowWidth: 1024,
    windowHeight: 768,
    windowMaximized: true,
    sidebarVisible: true,
  };
  const adapter = createAdapter(async (): Promise<AppModelState> => state);

  await expect(bootstrapAppModelProjection(adapter)).resolves.toMatchObject({
    status: 'ready',
  });

  expect(store.getState().ui.layout).toMatchObject({
    windowWidth: 1024,
    windowHeight: 768,
    windowMaximized: true,
  });
});

it('routes async appmodel layout failures into one safe notification without changing projection', async () => {
  const state = appState(3);
  state.snapshot.ui = {
    sidebarVisible: true,
    sidebarWidth: 256,
  };
  const adapter = createAdapter(async (): Promise<AppModelState> => state);

  await expect(bootstrapAppModelProjection(adapter)).resolves.toMatchObject({
    status: 'ready',
  });

  adapter.emitError({
    code: 'io',
    title: 'File operation failed',
    message: 'The file operation could not be completed.',
    details: { operation: 'update layout' },
    retryable: true,
  });

  expect(store.getState().ui).toEqual({
    revision: 3,
    layout: { sidebarVisible: true, sidebarWidth: 256 },
  });
  expect(store.getState().notifications.items).toEqual([
    expect.objectContaining({
      code: 'io',
      error: expect.objectContaining({
        code: 'io',
        details: { operation: 'update layout' },
      }),
      subject: 'update layout',
      title: 'File operation failed',
    }),
  ]);
});

it('hydrates the projection once', async () => {
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

it('reconciles revisioned content-free state patches', async () => {
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
  adapter.emitPatch({ revision: 7, ui: { windowMaximized: true } });

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
    ui: { windowMaximized: true },
  });
  adapter.emitPatch({ revision: 8, ui: { windowMaximized: false } });
  adapter.emitPatch({ revision: 7, ui: { windowHeight: 480 } });

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
    layout: { sidebarVisible: false, windowMaximized: true },
  });
  expect(JSON.stringify(projection)).not.toContain('Canonical content');
});

/*
 * Toggle Sidebar was inert against the real backend while the backend, the
 * command and the emitted patch were all correct.
 *
 * The layout patch really arrives as `{revision, orderedDocumentIds: null, ui}`.
 * `documentsSlice` guarded that field with `!== undefined`, so null passed the
 * guard and spreading it threw. A throw in one slice aborts the whole dispatch,
 * so the `ui` section of the same patch never reached `uiSlice` — a documents
 * field silently killing a layout change. The revision guard was never
 * involved: a synthetic patch at the same revision applied.
 */
it('applies the layout section of a patch carrying a null tab order', async () => {
  const state = appState(5);
  state.snapshot.ui = { sidebarVisible: false, sidebarWidth: 0 };
  const adapter = createAdapter(async (): Promise<AppModelState> => state);

  await expect(bootstrapAppModelProjection(adapter)).resolves.toMatchObject({
    status: 'ready',
  });

  expect((): void => {
    adapter.emitPatch({
      revision: 6,
      orderedDocumentIds: null,
      ui: { sidebarVisible: true },
    } as unknown as AppStatePatch);
  }).not.toThrow();

  expect(store.getState().ui).toEqual({
    revision: 6,
    layout: { sidebarVisible: true, sidebarWidth: 0 },
  });
  expect(store.getState().documents.orderedIds).toEqual([
    documentMetadata.documentId,
  ]);
});

it('still empties the tab order when the patch carries one', async () => {
  const state = appState(5);
  const adapter = createAdapter(async (): Promise<AppModelState> => state);

  await expect(bootstrapAppModelProjection(adapter)).resolves.toMatchObject({
    status: 'ready',
  });

  adapter.emitPatch({ revision: 6, orderedDocumentIds: [] });

  expect(store.getState().documents.orderedIds).toEqual([]);
});

it('isolates stale listeners queued patches and partial projection', async () => {
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
    ui: { windowMaximized: true },
  });
  rejectFirst?.(new Error('first snapshot failed'));

  await expect(first).resolves.toEqual({ status: 'failed' });
  expect(store.getState().documents).toEqual({
    revision: -1,
    tabSetRevision: -1,
    orderedIds: [],
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

it('supports a fresh retry after each repeated failed attempt', async () => {
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
    applicationVersion: 'test-build',
  });
});
