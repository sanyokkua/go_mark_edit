import { guardArity } from './bridgeGuard';
import { unwrapPromise } from './envelope';
import { createDocumentLifecycleAdapter } from './services';
import type { RegisteredLifecycleSession } from '../hooks/useLifecycleBarrier';
import type {
  AppModelState,
  AppStatePatch,
  DocumentTransitionResult,
  DocViewInput,
  OpenResult,
  CommittedWriteOutcome,
  PathCommandResult,
  RecoverySurface,
  TabTransitionResult,
  UILayout,
} from '../store/appModelTypes';
import { isWireError, type WireError } from '../utils/parseError';

export const BUFFER_SYNC_MS = 200;

interface VoidResult {
  error?: import('../utils/parseError').WireError;
}

interface StateResult {
  data?: AppModelState;
  error?: import('../utils/parseError').WireError;
}

export interface AppModelBindings {
  getState: () => Promise<StateResult>;
  newDocument?: (
    expectedTabSetRevision: number,
  ) => Promise<DocumentTransitionResult>;
  openDocument?: (expectedTabSetRevision: number) => Promise<OpenResult>;
  openRecentFile?: (
    path: string,
    expectedTabSetRevision: number,
  ) => Promise<OpenResult>;
  reopenLastFile?: (expectedTabSetRevision: number) => Promise<OpenResult>;
  activateDocument?: (
    documentId: string,
    expectedTabSetRevision: number,
  ) => Promise<DocumentTransitionResult>;
  reorderDocument?: (
    documentId: string,
    targetIndex: number,
    expectedTabSetRevision: number,
  ) => Promise<TabTransitionResult>;
  closeDocument?: (
    documentId: string,
    expectedTabSetRevision: number,
  ) => Promise<TabTransitionResult>;
  copyPath?: (documentId: string) => Promise<PathCommandResult>;
  revealInFileManager?: (documentId: string) => Promise<PathCommandResult>;
  updateBuffer: (documentId: string, content: string) => Promise<VoidResult>;
  setDocView: (documentId: string, view: DocViewInput) => Promise<VoidResult>;
  setUILayout: (layout: UILayout) => Promise<VoidResult>;
}

export interface AppModelRuntime {
  eventsOn: (
    eventName: string,
    callback: (payload: unknown) => void,
  ) => () => void;
}

export interface AcceptedBuffer {
  content: string;
  documentId: string;
  generation: number;
}

export interface AppModelAdapter {
  getState: () => Promise<AppModelState>;
  newDocument?: (
    expectedTabSetRevision: number,
  ) => Promise<DocumentTransitionResult>;
  openDocument?: (expectedTabSetRevision: number) => Promise<OpenResult>;
  openRecentFile?: (
    path: string,
    expectedTabSetRevision: number,
  ) => Promise<OpenResult>;
  reopenLastFile?: (expectedTabSetRevision: number) => Promise<OpenResult>;
  activateDocument?: (
    documentId: string,
    expectedTabSetRevision: number,
  ) => Promise<DocumentTransitionResult>;
  reorderDocument?: (
    documentId: string,
    targetIndex: number,
    expectedTabSetRevision: number,
  ) => Promise<TabTransitionResult>;
  closeDocument?: (
    documentId: string,
    expectedTabSetRevision: number,
  ) => Promise<TabTransitionResult>;
  copyPath?: (documentId: string) => Promise<PathCommandResult>;
  revealInFileManager?: (documentId: string) => Promise<PathCommandResult>;
  updateBuffer: (documentId: string, content: string) => Promise<void>;
  flushActiveSession?: (
    documentId: string,
    expectedActivationToken?: symbol,
  ) => Promise<void>;
  registerActiveSession?: (
    session: RegisteredLifecycleSession<symbol>,
  ) => () => void;
  flushBuffer: (documentId: string) => Promise<void>;
  subscribeAcceptedBuffers: (
    listener: (buffer: AcceptedBuffer) => void,
  ) => () => void;
  setDocView: (
    documentId: string,
    view: DocViewIntent,
    fallbackView?: DocViewInput,
  ) => Promise<void>;
  updateDocView: (documentId: string, view: DocViewInput) => Promise<void>;
  updateLocalDocView: (documentId: string, view: DocViewInput) => Promise<void>;
  cancelPendingSession?: (documentId: string) => void;
  flushDocView: (documentId: string) => Promise<void>;
  setUILayout: (layout: UILayout) => Promise<void>;
  reconcileCommittedWrite: (
    outcome: CommittedWriteOutcome,
  ) => Promise<AppModelState | RecoverySurface>;
  subscribeAsyncErrors?: (onError: (error: WireError) => void) => () => void;
  subscribeStatePatches: (
    onPatch: (patch: AppStatePatch) => void,
  ) => () => void;
}

interface BufferSnapshot {
  generation: number;
  content: string;
}

interface BufferRecord {
  acceptedGeneration: number;
  inFlight?: Promise<void>;
  inFlightGeneration?: number;
  nextGeneration: number;
  pending?: BufferSnapshot;
  timer?: ReturnType<typeof setTimeout>;
}

interface ViewRecord {
  inFlight?: Promise<void>;
  latestView?: DocViewInput;
  nextIntent: number;
  pending?: ViewSnapshot;
  timer?: ReturnType<typeof setTimeout>;
}

interface ViewSnapshot {
  intent: number;
  view: DocViewInput;
}

export interface DocViewArrangementIntent {
  editorVisible: boolean;
  previewVisible: boolean;
}

export type DocViewIntent = DocViewInput | DocViewArrangementIntent;

function isAppStatePatch(payload: unknown): payload is AppStatePatch {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'revision' in payload &&
    typeof payload.revision === 'number'
  );
}

export function createAppModelAdapter(
  bindings: AppModelBindings,
  runtime: AppModelRuntime,
): AppModelAdapter {
  const getState = guardArity('AppModelHandler.GetState', bindings.getState);
  const documentLifecycle =
    bindings.newDocument === undefined || bindings.openDocument === undefined
      ? undefined
      : createDocumentLifecycleAdapter({
          newDocument: bindings.newDocument,
          openDocument: bindings.openDocument,
          openRecentFile: bindings.openRecentFile,
          reopenLastFile: bindings.reopenLastFile,
        });
  const activateDocument =
    bindings.activateDocument === undefined
      ? undefined
      : guardArity(
          'AppModelHandler.ActivateDocument',
          bindings.activateDocument,
        );
  const reorderDocument =
    bindings.reorderDocument === undefined
      ? undefined
      : guardArity('AppModelHandler.ReorderDocument', bindings.reorderDocument);
  const closeDocument =
    bindings.closeDocument === undefined
      ? undefined
      : guardArity('AppModelHandler.CloseDocument', bindings.closeDocument);
  const copyPath =
    bindings.copyPath === undefined
      ? undefined
      : guardArity('AppModelHandler.CopyPath', bindings.copyPath);
  const revealInFileManager =
    bindings.revealInFileManager === undefined
      ? undefined
      : guardArity(
          'AppModelHandler.RevealInFileManager',
          bindings.revealInFileManager,
        );
  const updateBuffer = guardArity(
    'AppModelHandler.UpdateBuffer',
    bindings.updateBuffer,
  );
  const setDocView = guardArity(
    'AppModelHandler.SetDocView',
    bindings.setDocView,
  );
  const setUILayout = guardArity(
    'AppModelHandler.SetUILayout',
    bindings.setUILayout,
  );
  let disposeStatePatches: (() => void) | undefined;
  const statePatchListeners = new Set<(patch: AppStatePatch) => void>();
  const acceptedBufferListeners = new Set<(buffer: AcceptedBuffer) => void>();
  const bufferRecords = new Map<string, BufferRecord>();
  const viewRecords = new Map<string, ViewRecord>();
  let greatestProjectionRevision = 0;
  let recoveryPromise: Promise<AppModelState | RecoverySurface> | undefined;
  let recoverySurface: RecoverySurface | undefined;
  let activeSession: RegisteredLifecycleSession<symbol> | undefined;

  function assertCommandsAvailable(): void {
    if (recoveryPromise !== undefined || recoverySurface !== undefined) {
      throw new Error(
        recoverySurface?.message ?? 'Editor-state recovery is in progress.',
      );
    }
  }

  function bufferRecord(documentId: string): BufferRecord {
    const existing = bufferRecords.get(documentId);
    if (existing !== undefined) {
      return existing;
    }

    const record: BufferRecord = {
      acceptedGeneration: 0,
      nextGeneration: 0,
    };
    bufferRecords.set(documentId, record);
    return record;
  }

  function viewRecord(documentId: string): ViewRecord {
    const existing = viewRecords.get(documentId);
    if (existing !== undefined) {
      return existing;
    }

    const record: ViewRecord = { nextIntent: 0 };
    viewRecords.set(documentId, record);
    return record;
  }

  function snapshotDocView(view: DocViewInput): DocViewInput {
    return {
      editorVisible: view.editorVisible,
      previewVisible: view.previewVisible,
      cursor: { ...view.cursor },
      selection: {
        start: { ...view.selection.start },
        end: { ...view.selection.end },
      },
      scroll: { ...view.scroll },
    };
  }

  function isFullDocView(view: DocViewIntent): view is DocViewInput {
    return 'cursor' in view;
  }

  function queueDocView(
    record: ViewRecord,
    view: DocViewIntent,
    fallbackView?: DocViewInput,
    timedUpdate = false,
  ): void {
    const baseView = record.latestView ?? fallbackView;
    if (baseView === undefined && !isFullDocView(view)) {
      throw new Error('A view arrangement requires a document view snapshot.');
    }
    const latestView = isFullDocView(view)
      ? timedUpdate && baseView !== undefined
        ? {
            ...snapshotDocView(view),
            editorVisible: baseView.editorVisible,
            previewVisible: baseView.previewVisible,
          }
        : snapshotDocView(view)
      : {
          ...snapshotDocView(baseView as DocViewInput),
          editorVisible: view.editorVisible,
          previewVisible: view.previewVisible,
        };

    record.latestView = latestView;
    record.nextIntent += 1;
    record.pending = {
      intent: record.nextIntent,
      view: latestView,
    };
  }

  function sendPendingBuffer(documentId: string): Promise<void> {
    const record = bufferRecord(documentId);
    if (record.inFlight !== undefined) {
      return record.inFlight.then(() => sendPendingBuffer(documentId));
    }

    const snapshot = record.pending;
    if (snapshot === undefined) {
      return Promise.resolve();
    }
    record.pending = undefined;

    const inFlight = unwrapPromise<void>(
      updateBuffer(documentId, snapshot.content),
    )
      .then((): void => {
        if (snapshot.generation <= record.acceptedGeneration) {
          return;
        }
        record.acceptedGeneration = snapshot.generation;
        for (const listener of acceptedBufferListeners) {
          listener({
            documentId,
            content: snapshot.content,
            generation: snapshot.generation,
          });
        }
      })
      .catch((error: unknown): never => {
        if (
          record.pending === undefined ||
          record.pending.generation < snapshot.generation
        ) {
          record.pending = snapshot;
        }
        throw error;
      });
    const completed = inFlight.finally((): void => {
      if (record.inFlight === completed) {
        record.inFlight = undefined;
        record.inFlightGeneration = undefined;
      }
    });
    record.inFlight = completed;
    record.inFlightGeneration = snapshot.generation;
    return completed;
  }

  function scheduleBuffer(documentId: string): void {
    const record = bufferRecord(documentId);
    if (record.timer !== undefined) {
      clearTimeout(record.timer);
    }
    record.timer = setTimeout((): void => {
      record.timer = undefined;
      void sendPendingBuffer(documentId).catch((): void => undefined);
    }, BUFFER_SYNC_MS);
  }

  function sendPendingView(documentId: string): Promise<void> {
    const record = viewRecord(documentId);
    if (record.inFlight !== undefined) {
      return record.inFlight.then(() => sendPendingView(documentId));
    }

    const snapshot = record.pending;
    if (snapshot === undefined) {
      return Promise.resolve();
    }
    record.pending = undefined;

    const inFlight = unwrapPromise<void>(
      setDocView(documentId, snapshot.view),
    ).catch((error: unknown): never => {
      if (
        record.pending === undefined ||
        record.pending.intent < snapshot.intent
      ) {
        record.pending = snapshot;
      }
      throw error;
    });
    const completed = inFlight.finally((): void => {
      if (record.inFlight === completed) {
        record.inFlight = undefined;
      }
    });
    record.inFlight = completed;
    return completed.then(() => sendPendingView(documentId));
  }

  function scheduleDocView(documentId: string): void {
    const record = viewRecord(documentId);
    if (record.timer !== undefined) {
      clearTimeout(record.timer);
    }
    record.timer = setTimeout((): void => {
      record.timer = undefined;
      void sendPendingView(documentId).catch((): void => undefined);
    }, BUFFER_SYNC_MS);
  }

  async function flushQueuedSession(documentId: string): Promise<void> {
    const buffer = bufferRecord(documentId);
    const view = viewRecord(documentId);
    if (buffer.timer !== undefined) {
      clearTimeout(buffer.timer);
      buffer.timer = undefined;
    }
    if (view.timer !== undefined) {
      clearTimeout(view.timer);
      view.timer = undefined;
    }

    await sendPendingBuffer(documentId);
    await sendPendingView(documentId);
  }

  async function hydrateState(): Promise<AppModelState> {
    const state = await unwrapPromise(getState());
    greatestProjectionRevision = Math.max(
      greatestProjectionRevision,
      state.snapshot.revision,
    );
    return state;
  }

  return {
    async getState(): Promise<AppModelState> {
      return hydrateState();
    },
    newDocument:
      documentLifecycle === undefined
        ? undefined
        : async (
            expectedTabSetRevision: number,
          ): Promise<DocumentTransitionResult> => {
            assertCommandsAvailable();
            return documentLifecycle.newDocument(expectedTabSetRevision);
          },
    openDocument:
      documentLifecycle === undefined
        ? undefined
        : async (expectedTabSetRevision: number): Promise<OpenResult> => {
            assertCommandsAvailable();
            return documentLifecycle.openDocument(expectedTabSetRevision);
          },
    openRecentFile:
      documentLifecycle?.openRecentFile === undefined
        ? undefined
        : async (
            path: string,
            expectedTabSetRevision: number,
          ): Promise<OpenResult> => {
            assertCommandsAvailable();
            return (
              documentLifecycle.openRecentFile?.(
                path,
                expectedTabSetRevision,
              ) ?? { status: 'cancelled' }
            );
          },
    reopenLastFile:
      documentLifecycle?.reopenLastFile === undefined
        ? undefined
        : async (expectedTabSetRevision: number): Promise<OpenResult> => {
            assertCommandsAvailable();
            return (
              documentLifecycle.reopenLastFile?.(expectedTabSetRevision) ?? {
                status: 'cancelled',
              }
            );
          },
    activateDocument:
      activateDocument === undefined
        ? undefined
        : async (documentId, expectedTabSetRevision) => {
            assertCommandsAvailable();
            return activateDocument(documentId, expectedTabSetRevision);
          },
    reorderDocument:
      reorderDocument === undefined
        ? undefined
        : async (documentId, targetIndex, expectedTabSetRevision) => {
            assertCommandsAvailable();
            return reorderDocument(
              documentId,
              targetIndex,
              expectedTabSetRevision,
            );
          },
    closeDocument:
      closeDocument === undefined
        ? undefined
        : async (documentId, expectedTabSetRevision) => {
            assertCommandsAvailable();
            return closeDocument(documentId, expectedTabSetRevision);
          },
    copyPath:
      copyPath === undefined
        ? undefined
        : async (documentId) => {
            assertCommandsAvailable();
            return copyPath(documentId);
          },
    revealInFileManager:
      revealInFileManager === undefined
        ? undefined
        : async (documentId) => {
            assertCommandsAvailable();
            return revealInFileManager(documentId);
          },
    async updateBuffer(documentId: string, content: string): Promise<void> {
      assertCommandsAvailable();
      const record = bufferRecord(documentId);
      record.nextGeneration += 1;
      record.pending = { generation: record.nextGeneration, content };
      scheduleBuffer(documentId);
    },
    async flushActiveSession(
      documentId: string,
      expectedActivationToken?: symbol,
    ): Promise<void> {
      assertCommandsAvailable();
      if (
        expectedActivationToken !== undefined &&
        activeSession !== undefined &&
        activeSession.documentId !== documentId
      ) {
        return;
      }
      if (
        activeSession !== undefined &&
        activeSession.documentId === documentId
      ) {
        if (
          expectedActivationToken !== undefined &&
          !Object.is(expectedActivationToken, activeSession.activationToken)
        ) {
          throw new Error(
            'The active editor activation changed while its lifecycle state was being flushed.',
          );
        }
        await activeSession.flushActiveSession();
        return;
      }
      await flushQueuedSession(documentId);
    },
    registerActiveSession(
      session: RegisteredLifecycleSession<symbol>,
    ): () => void {
      activeSession = session;
      return (): void => {
        if (activeSession === session) {
          activeSession = undefined;
        }
      };
    },
    async flushBuffer(documentId: string): Promise<void> {
      assertCommandsAvailable();
      const record = bufferRecord(documentId);
      if (record.timer !== undefined) {
        clearTimeout(record.timer);
        record.timer = undefined;
      }
      const targetGeneration = Math.max(
        record.acceptedGeneration,
        record.pending?.generation ?? 0,
        record.inFlightGeneration ?? 0,
      );
      await sendPendingBuffer(documentId);
      if (record.acceptedGeneration < targetGeneration) {
        await sendPendingBuffer(documentId);
      }
    },
    subscribeAcceptedBuffers(
      listener: (buffer: AcceptedBuffer) => void,
    ): () => void {
      acceptedBufferListeners.add(listener);
      return (): void => {
        acceptedBufferListeners.delete(listener);
      };
    },
    async setDocView(
      documentId: string,
      view: DocViewIntent,
      fallbackView?: DocViewInput,
    ): Promise<void> {
      assertCommandsAvailable();
      const record = viewRecord(documentId);
      if (record.timer !== undefined) {
        clearTimeout(record.timer);
        record.timer = undefined;
      }
      queueDocView(record, view, fallbackView);
      return sendPendingView(documentId);
    },
    async updateDocView(documentId: string, view: DocViewInput): Promise<void> {
      assertCommandsAvailable();
      const record = viewRecord(documentId);
      queueDocView(record, view);
      scheduleDocView(documentId);
    },
    async updateLocalDocView(
      documentId: string,
      view: DocViewInput,
    ): Promise<void> {
      assertCommandsAvailable();
      const record = viewRecord(documentId);
      queueDocView(record, view, undefined, true);
      scheduleDocView(documentId);
    },
    cancelPendingSession(documentId: string): void {
      const buffer = bufferRecords.get(documentId);
      if (buffer?.timer !== undefined) {
        clearTimeout(buffer.timer);
        buffer.timer = undefined;
      }
      if (buffer !== undefined) {
        buffer.pending = undefined;
      }

      const view = viewRecords.get(documentId);
      if (view?.timer !== undefined) {
        clearTimeout(view.timer);
        view.timer = undefined;
      }
      if (view !== undefined) {
        view.pending = undefined;
        view.latestView = undefined;
      }
    },
    async flushDocView(documentId: string): Promise<void> {
      assertCommandsAvailable();
      const record = viewRecord(documentId);
      if (record.timer !== undefined) {
        clearTimeout(record.timer);
        record.timer = undefined;
      }
      await sendPendingView(documentId);
    },
    async setUILayout(layout: UILayout): Promise<void> {
      assertCommandsAvailable();
      return unwrapPromise(setUILayout(layout));
    },
    async reconcileCommittedWrite(
      outcome: CommittedWriteOutcome,
    ): Promise<AppModelState | RecoverySurface> {
      if (
        !outcome.resyncRequired &&
        outcome.committedProjectionRevision <= greatestProjectionRevision
      ) {
        return hydrateState();
      }
      if (recoveryPromise !== undefined) {
        return recoveryPromise;
      }

      recoveryPromise = new Promise<AppModelState | RecoverySurface>(
        (resolve) => {
          let attempts = 0;
          const tryHydrate = (): void => {
            attempts += 1;
            void hydrateState()
              .then((state): void => {
                recoverySurface = undefined;
                resolve(state);
              })
              .catch((): void => {
                if (attempts >= 3) {
                  recoverySurface = {
                    persistent: true,
                    savedOnDisk: true,
                    commandsBlocked: true,
                    closeBlocked: true,
                    message:
                      'The file was saved on disk, but editor-state recovery failed.',
                  };
                  resolve(recoverySurface);
                  return;
                }
                setTimeout(tryHydrate, attempts === 1 ? 250 : 1000);
              });
          };
          tryHydrate();
        },
      ).finally((): void => {
        recoveryPromise = undefined;
      });
      return recoveryPromise;
    },
    subscribeAsyncErrors(onError: (error: WireError) => void): () => void {
      return runtime.eventsOn('state:error', (payload: unknown) => {
        if (isWireError(payload)) {
          onError(payload);
        }
      });
    },
    subscribeStatePatches(onPatch: (patch: AppStatePatch) => void): () => void {
      statePatchListeners.add(onPatch);
      if (disposeStatePatches === undefined) {
        const unsubscribe = runtime.eventsOn(
          'state:patch',
          (payload: unknown) => {
            if (!isAppStatePatch(payload)) {
              return;
            }
            greatestProjectionRevision = Math.max(
              greatestProjectionRevision,
              payload.revision,
            );
            for (const listener of statePatchListeners) {
              listener(payload);
            }
          },
        );
        disposeStatePatches = (): void => {
          unsubscribe();
          disposeStatePatches = undefined;
        };
      }
      const dispose = (): void => {
        statePatchListeners.delete(onPatch);
        if (
          statePatchListeners.size !== 0 ||
          disposeStatePatches === undefined
        ) {
          return;
        }
        disposeStatePatches();
      };
      return dispose;
    },
  };
}
