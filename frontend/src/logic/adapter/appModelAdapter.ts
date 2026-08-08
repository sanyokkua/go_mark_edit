import { guardArity } from './bridgeGuard';
import { unwrapPromise } from './envelope';
import { createDocumentLifecycleAdapter } from './services';
import type {
  AppModelState,
  AppStatePatch,
  DocumentTransitionResult,
  DocViewInput,
  OpenResult,
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
  updateBuffer: (documentId: string, content: string) => Promise<void>;
  flushActiveSession?: (documentId: string) => Promise<void>;
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
  flushDocView: (documentId: string) => Promise<void>;
  setUILayout: (layout: UILayout) => Promise<void>;
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
        });
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

  return {
    async getState(): Promise<AppModelState> {
      return unwrapPromise(getState());
    },
    newDocument: documentLifecycle?.newDocument,
    openDocument: documentLifecycle?.openDocument,
    async updateBuffer(documentId: string, content: string): Promise<void> {
      const record = bufferRecord(documentId);
      record.nextGeneration += 1;
      record.pending = { generation: record.nextGeneration, content };
      scheduleBuffer(documentId);
    },
    async flushActiveSession(documentId: string): Promise<void> {
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
    },
    async flushBuffer(documentId: string): Promise<void> {
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
      const record = viewRecord(documentId);
      if (record.timer !== undefined) {
        clearTimeout(record.timer);
        record.timer = undefined;
      }
      queueDocView(record, view, fallbackView);
      return sendPendingView(documentId);
    },
    async updateDocView(documentId: string, view: DocViewInput): Promise<void> {
      const record = viewRecord(documentId);
      queueDocView(record, view);
      scheduleDocView(documentId);
    },
    async updateLocalDocView(
      documentId: string,
      view: DocViewInput,
    ): Promise<void> {
      const record = viewRecord(documentId);
      queueDocView(record, view, undefined, true);
      scheduleDocView(documentId);
    },
    async flushDocView(documentId: string): Promise<void> {
      const record = viewRecord(documentId);
      if (record.timer !== undefined) {
        clearTimeout(record.timer);
        record.timer = undefined;
      }
      await sendPendingView(documentId);
    },
    async setUILayout(layout: UILayout): Promise<void> {
      return unwrapPromise(setUILayout(layout));
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
