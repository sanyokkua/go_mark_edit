import { store } from '../store';
import { dismissNotification } from '../store/notificationsSlice';
import type { AppModelState, DocViewInput } from '../store/appModelTypes';
import type { WireError } from '../utils/parseError';
import {
  BUFFER_SYNC_MS,
  createAppModelAdapter,
  type AppModelRuntime,
} from './appModelAdapter';

type VoidResult = { error?: WireError };

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve: ((value: T) => void) | undefined;
  const promise = new Promise<T>((complete): void => {
    resolve = complete;
  });

  return { promise, resolve: resolve as (value: T) => void };
}

const state: AppModelState = {
  snapshot: {
    revision: 1,
    documents: {},
    activeDocumentId: '',
    ui: {},
  },
  activeBuffer: { documentId: '', content: '' },
};

const runtime: AppModelRuntime = {
  eventsOn: (): (() => void) => (): void => undefined,
};

afterEach((): void => {
  jest.useRealTimers();
  for (const notification of store.getState().notifications.items) {
    store.dispatch(dismissNotification(notification.id));
  }
});

it('STORY-019-AC-1 coalesces edits in the adapter-owned timer', async () => {
  jest.useFakeTimers();
  const updateBuffer = jest.fn<Promise<VoidResult>, [string, string]>(
    async (documentId: string, content: string): Promise<VoidResult> => {
      void documentId;
      void content;
      return {};
    },
  );
  const adapter = createAppModelAdapter(
    {
      getState: async (): Promise<{ data: AppModelState }> => ({ data: state }),
      updateBuffer,
      setDocView: async (
        documentId: string,
        view: DocViewInput,
      ): Promise<VoidResult> => {
        void documentId;
        void view;
        return {};
      },
      setUILayout: async (layout): Promise<VoidResult> => {
        void layout;
        return {};
      },
    },
    runtime,
  );

  await adapter.updateBuffer('document-1', 'first');
  await adapter.updateBuffer('document-1', 'latest');

  expect(updateBuffer).not.toHaveBeenCalled();
  await jest.advanceTimersByTimeAsync(BUFFER_SYNC_MS);

  expect(updateBuffer).toHaveBeenCalledTimes(1);
  expect(updateBuffer).toHaveBeenCalledWith('document-1', 'latest');
});

it('STORY-019-AC-2 flushes the latest buffer with ordered acknowledgement', async () => {
  jest.useFakeTimers();
  const first = deferred<VoidResult>();
  const second = deferred<VoidResult>();
  let updateCount = 0;
  const updateBuffer = jest.fn<Promise<VoidResult>, [string, string]>(
    (documentId: string, content: string): Promise<VoidResult> => {
      void documentId;
      void content;
      updateCount += 1;
      return updateCount === 1 ? first.promise : second.promise;
    },
  );
  const adapter = createAppModelAdapter(
    {
      getState: async (): Promise<{ data: AppModelState }> => ({ data: state }),
      updateBuffer,
      setDocView: async (
        documentId: string,
        view: DocViewInput,
      ): Promise<VoidResult> => {
        void documentId;
        void view;
        return {};
      },
      setUILayout: async (layout): Promise<VoidResult> => {
        void layout;
        return {};
      },
    },
    runtime,
  );
  const accepted = jest.fn();
  const unsubscribe = adapter.subscribeAcceptedBuffers(accepted);

  await adapter.updateBuffer('document-1', 'first');
  await jest.advanceTimersByTimeAsync(BUFFER_SYNC_MS);
  expect(updateBuffer).toHaveBeenCalledWith('document-1', 'first');

  await adapter.updateBuffer('document-1', 'latest');
  const flush = adapter.flushBuffer('document-1');
  expect(updateBuffer).toHaveBeenCalledTimes(1);

  first.resolve({});
  await jest.advanceTimersByTimeAsync(0);
  expect(updateBuffer).toHaveBeenNthCalledWith(2, 'document-1', 'latest');

  second.resolve({});
  await expect(flush).resolves.toBeUndefined();
  expect(accepted).toHaveBeenNthCalledWith(1, {
    documentId: 'document-1',
    content: 'first',
    generation: 1,
  });
  expect(accepted).toHaveBeenNthCalledWith(2, {
    documentId: 'document-1',
    content: 'latest',
    generation: 2,
  });
  unsubscribe();
});

it('STORY-017-AC-1 publishes the identical accepted buffer generation', async () => {
  jest.useFakeTimers();
  const acknowledgement = deferred<VoidResult>();
  const updateBuffer = jest.fn<Promise<VoidResult>, [string, string]>(
    (documentId: string, content: string): Promise<VoidResult> => {
      void documentId;
      void content;
      return acknowledgement.promise;
    },
  );
  const adapter = createAppModelAdapter(
    {
      getState: async (): Promise<{ data: AppModelState }> => ({ data: state }),
      updateBuffer,
      setDocView: async (): Promise<VoidResult> => ({}),
      setUILayout: async (): Promise<VoidResult> => ({}),
    },
    runtime,
  );
  const accepted = jest.fn();
  adapter.subscribeAcceptedBuffers(accepted);

  await adapter.updateBuffer('document-1', 'first keystroke');
  await adapter.updateBuffer('document-1', 'accepted snapshot');

  await jest.advanceTimersByTimeAsync(BUFFER_SYNC_MS);

  expect(updateBuffer).toHaveBeenCalledTimes(1);
  expect(updateBuffer).toHaveBeenCalledWith('document-1', 'accepted snapshot');
  expect(accepted).not.toHaveBeenCalled();

  acknowledgement.resolve({});
  await jest.advanceTimersByTimeAsync(0);

  expect(accepted).toHaveBeenCalledTimes(1);
  expect(accepted).toHaveBeenCalledWith({
    documentId: 'document-1',
    content: 'accepted snapshot',
    generation: 2,
  });
});

it('STORY-019-AC-6 retains the working copy after synchronization failure', async () => {
  jest.useFakeTimers();
  const wireError = {
    code: 'internal',
    title: 'Buffer unavailable',
    message: 'The buffer could not be synchronized.',
    retryable: true,
  } satisfies WireError;
  let updateCount = 0;
  const updateBuffer = jest.fn<Promise<VoidResult>, [string, string]>(
    (documentId: string, content: string): Promise<VoidResult> => {
      void documentId;
      void content;
      updateCount += 1;
      return Promise.resolve(updateCount === 1 ? { error: wireError } : {});
    },
  );
  const setDocView = jest.fn<Promise<VoidResult>, [string, DocViewInput]>(
    async (documentId: string, view: DocViewInput): Promise<VoidResult> => {
      void documentId;
      void view;
      return { error: wireError };
    },
  );
  const adapter = createAppModelAdapter(
    {
      getState: async (): Promise<{ data: AppModelState }> => ({ data: state }),
      updateBuffer,
      setDocView,
      setUILayout: async (layout): Promise<VoidResult> => {
        void layout;
        return {};
      },
    },
    runtime,
  );
  const accepted = jest.fn();
  adapter.subscribeAcceptedBuffers(accepted);

  await adapter.updateBuffer('document-1', 'local working copy');
  await jest.advanceTimersByTimeAsync(BUFFER_SYNC_MS);

  expect(store.getState().notifications.items).toEqual(
    expect.arrayContaining([expect.objectContaining({ error: wireError })]),
  );
  expect(accepted).not.toHaveBeenCalled();
  expect(JSON.stringify(store.getState())).not.toContain('local working copy');

  await expect(adapter.flushBuffer('document-1')).resolves.toBeUndefined();
  expect(updateBuffer).toHaveBeenNthCalledWith(
    2,
    'document-1',
    'local working copy',
  );

  await adapter.updateDocView('document-1', {
    editorVisible: true,
    previewVisible: false,
    cursor: { line: 2, column: 3 },
    selection: {
      start: { line: 2, column: 1 },
      end: { line: 2, column: 3 },
    },
    scroll: { editor: 0, preview: 0 },
  });
  await expect(adapter.flushDocView('document-1')).rejects.toBe(wireError);
  expect(setDocView).toHaveBeenCalledTimes(1);
});
