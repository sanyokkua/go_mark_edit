import { store } from '../store';
import { dismissNotification } from '../store/notificationsSlice';
import type { AppModelState, AppStatePatch } from '../store/appModelTypes';
import type { WireError } from '../utils/parseError';
import {
  createAppModelAdapter,
  type AppModelBindings,
  type AppModelRuntime,
} from './appModelAdapter';

type VoidResult = { error?: WireError };

const state: AppModelState = {
  snapshot: {
    revision: 1,
    documents: {},
    activeDocumentId: '',
    ui: {},
  },
  activeBuffer: { documentId: '', content: '' },
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
      setDocView: async (): Promise<VoidResult> => ({}),
      setUILayout: async (): Promise<VoidResult> => ({}),
    },
    { eventsOn: (): (() => void) => (): void => undefined },
  );

  void adapter.updateBuffer('document-1', 'first');
  void adapter.updateBuffer('document-1', 'latest');

  expect(updateBuffer).not.toHaveBeenCalled();

  await jest.advanceTimersByTimeAsync(200);

  expect(updateBuffer).toHaveBeenCalledTimes(1);
  expect(updateBuffer).toHaveBeenCalledWith('document-1', 'latest');
});

it('STORY-012-AC-4 wraps app-model commands without optimistic state', async () => {
  const calls: string[] = [];
  const bindings: AppModelBindings = {
    getState(): Promise<{ data?: AppModelState }> {
      calls.push('get-state');
      return Promise.resolve({ data: state });
    },
    updateBuffer(documentId, content) {
      calls.push(`buffer:${documentId}:${content}`);
      return Promise.resolve({ error: undefined });
    },
    setDocView(documentId, view) {
      void view;
      calls.push(`view:${documentId}`);
      return Promise.resolve({ error: undefined });
    },
    setUILayout(layout) {
      void layout;
      calls.push('layout');
      return Promise.resolve({ error: undefined });
    },
  };
  const eventsOn = jest.fn<() => void, [string, (payload: unknown) => void]>(
    (): (() => void) => jest.fn(),
  );
  const runtime: AppModelRuntime = { eventsOn };
  const adapter = createAppModelAdapter(bindings, runtime);
  const beforeCommand = store.getState();

  await expect(adapter.getState()).resolves.toBe(state);
  await expect(
    adapter.updateBuffer('document-1', 'draft'),
  ).resolves.toBeUndefined();
  await expect(adapter.flushBuffer('document-1')).resolves.toBeUndefined();
  await expect(
    adapter.setDocView('document-1', {
      editorVisible: true,
      previewVisible: false,
      cursor: { line: 1, column: 1 },
      selection: {
        start: { line: 1, column: 1 },
        end: { line: 1, column: 1 },
      },
      scroll: { editor: 0, preview: 0 },
    }),
  ).resolves.toBeUndefined();
  await expect(
    adapter.setUILayout({ sidebarVisible: false }),
  ).resolves.toBeUndefined();

  expect(calls).toEqual([
    'get-state',
    'buffer:document-1:draft',
    'view:document-1',
    'layout',
  ]);
  expect(store.getState()).toBe(beforeCommand);
  expect(eventsOn).not.toHaveBeenCalled();

  const mismatchedAdapter = createAppModelAdapter(
    {
      ...bindings,
      updateBuffer: ((documentId: string) => {
        calls.push(`mismatched-buffer:${documentId}`);
        return Promise.resolve({ error: undefined });
      }) as unknown as AppModelBindings['updateBuffer'],
    },
    runtime,
  );
  await mismatchedAdapter.updateBuffer('document-1', 'draft');
  await expect(
    mismatchedAdapter.flushBuffer('document-1'),
  ).rejects.toMatchObject({
    code: 'internal',
    message: 'AppModelHandler.UpdateBuffer expects 1 argument(s), received 2.',
    retryable: true,
  });

  const wireError = {
    code: 'validation',
    title: 'Invalid layout',
    message: 'The backend rejected the layout.',
    retryable: false,
  } satisfies WireError;
  const rejectingAdapter = createAppModelAdapter(
    {
      ...bindings,
      setUILayout: async (layout) => {
        void layout;
        return { error: wireError };
      },
    },
    runtime,
  );
  await expect(rejectingAdapter.setUILayout({})).rejects.toBe(wireError);
  expect(store.getState().notifications.items).toEqual(
    expect.arrayContaining([expect.objectContaining({ error: wireError })]),
  );
});

it('STORY-012-AC-5 disposes state patch subscriptions', () => {
  let eventCallback: ((payload: unknown) => void) | undefined;
  const unsubscribe = jest.fn();
  const runtime: AppModelRuntime = {
    eventsOn(_eventName, callback): () => void {
      eventCallback = callback;
      return (): void => {
        unsubscribe();
        eventCallback = undefined;
      };
    },
  };
  const bindings: AppModelBindings = {
    getState: async () => ({ data: state }),
    updateBuffer: async () => ({}),
    setDocView: async () => ({}),
    setUILayout: async () => ({}),
  };
  const adapter = createAppModelAdapter(bindings, runtime);
  const firstPatchHandler = jest.fn<void, [AppStatePatch]>();
  const repeatedConsumerHandler = jest.fn<void, [AppStatePatch]>();

  const firstDispose = adapter.subscribeStatePatches(firstPatchHandler);
  const repeatedDispose = adapter.subscribeStatePatches(
    repeatedConsumerHandler,
  );
  eventCallback?.({ revision: 3 });

  expect(firstDispose).toBe(repeatedDispose);
  expect(firstPatchHandler).toHaveBeenCalledWith({ revision: 3 });
  expect(repeatedConsumerHandler).not.toHaveBeenCalled();

  firstDispose();
  repeatedDispose();
  eventCallback?.({ revision: 4 });

  expect(unsubscribe).toHaveBeenCalledTimes(1);
  expect(firstPatchHandler).toHaveBeenCalledTimes(1);
});
