import { guardArity } from './bridgeGuard';
import { unwrapPromise } from './envelope';
import type {
  AppModelState,
  AppStatePatch,
  DocViewInput,
  UILayout,
} from '../store/appModelTypes';

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
  updateBuffer: (documentId: string, content: string) => Promise<void>;
  flushBuffer: (documentId: string) => Promise<void>;
  subscribeAcceptedBuffers: (
    listener: (buffer: AcceptedBuffer) => void,
  ) => () => void;
  setDocView: (documentId: string, view: DocViewInput) => Promise<void>;
  updateDocView: (documentId: string, view: DocViewInput) => Promise<void>;
  flushDocView: (documentId: string) => Promise<void>;
  setUILayout: (layout: UILayout) => Promise<void>;
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
  pending?: DocViewInput;
  timer?: ReturnType<typeof setTimeout>;
}

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

    const record: ViewRecord = {};
    viewRecords.set(documentId, record);
    return record;
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

    const view = record.pending;
    if (view === undefined) {
      return Promise.resolve();
    }
    record.pending = undefined;

    const inFlight = unwrapPromise<void>(setDocView(documentId, view));
    const completed = inFlight.finally((): void => {
      if (record.inFlight === completed) {
        record.inFlight = undefined;
      }
    });
    record.inFlight = completed;
    return completed.catch((error: unknown): never => {
      if (record.pending === undefined) {
        record.pending = view;
      }
      throw error;
    });
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
    async updateBuffer(documentId: string, content: string): Promise<void> {
      const record = bufferRecord(documentId);
      record.nextGeneration += 1;
      record.pending = { generation: record.nextGeneration, content };
      scheduleBuffer(documentId);
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
    async setDocView(documentId: string, view: DocViewInput): Promise<void> {
      return unwrapPromise(setDocView(documentId, view));
    },
    async updateDocView(documentId: string, view: DocViewInput): Promise<void> {
      const record = viewRecord(documentId);
      record.pending = view;
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
    subscribeStatePatches(onPatch: (patch: AppStatePatch) => void): () => void {
      if (disposeStatePatches !== undefined) {
        return disposeStatePatches;
      }

      const unsubscribe = runtime.eventsOn(
        'state:patch',
        (payload: unknown) => {
          if (isAppStatePatch(payload)) {
            onPatch(payload);
          }
        },
      );
      const dispose = (): void => {
        if (disposeStatePatches !== dispose) {
          return;
        }
        unsubscribe();
        disposeStatePatches = undefined;
      };
      disposeStatePatches = dispose;
      return dispose;
    },
  };
}
