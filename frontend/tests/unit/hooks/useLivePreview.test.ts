import { act, renderHook } from '@testing-library/react';
import { useEffect } from 'react';

import {
  BUFFER_SYNC_MS,
  createAppModelAdapter,
  type AppModelRuntime,
  type AcceptedBuffer,
} from '../../../src/logic/adapter/appModelAdapter';
import { store } from '../../../src/logic/store';
import { dismissNotification } from '../../../src/logic/store/notificationsSlice';
import type { AppModelState } from '../../../src/logic/store/appModelTypes';
import type { WireError } from '../../../src/logic/utils/parseError';
import {
  type LivePreviewAdapter,
  useLivePreview,
} from '../../../src/logic/hooks/useLivePreview';

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

const runtime: AppModelRuntime = {
  eventsOn: (): (() => void) => (): void => undefined,
};

function createBufferAdapter(
  updateBuffer: (documentId: string, content: string) => Promise<VoidResult>,
) {
  return createAppModelAdapter(
    {
      getState: async (): Promise<{ data: AppModelState }> => ({ data: state }),
      updateBuffer,
      setDocView: async (): Promise<VoidResult> => ({}),
      setUILayout: async (): Promise<VoidResult> => ({}),
    },
    runtime,
  );
}

afterEach((): void => {
  jest.useRealTimers();
  for (const notification of store.getState().notifications.items) {
    store.dispatch(dismissNotification(notification.id));
  }
});

it('keeps the last accepted preview on sync failure', async () => {
  jest.useFakeTimers();
  const wireError = {
    code: 'internal',
    title: 'Preview sync failed',
    message: 'The backend did not accept this buffer.',
    retryable: true,
  } satisfies WireError;
  let attempt = 0;
  const adapter = createBufferAdapter(
    async (documentId: string, content: string): Promise<VoidResult> => {
      void documentId;
      void content;
      attempt += 1;
      return attempt === 1 ? {} : { error: wireError };
    },
  );
  const { result } = renderHook(() =>
    useLivePreview(
      { documentId: 'document-1', content: '# Bootstrap preview' },
      adapter,
    ),
  );

  await act(async (): Promise<void> => {
    await adapter.updateBuffer('document-1', '# Last accepted preview');
    await jest.advanceTimersByTimeAsync(BUFFER_SYNC_MS);
  });
  expect(result.current).toBe('# Last accepted preview');

  await act(async (): Promise<void> => {
    await adapter.updateBuffer('document-1', '# Rejected preview');
    await jest.advanceTimersByTimeAsync(BUFFER_SYNC_MS);
  });

  expect(result.current).toBe('# Last accepted preview');
  expect(store.getState().notifications.items).toEqual(
    expect.arrayContaining([expect.objectContaining({ error: wireError })]),
  );
});

it('(EC-RENDER-4) bounds large-document preview work', async () => {
  jest.useFakeTimers();
  const updateBuffer = jest.fn<Promise<VoidResult>, [string, string]>(
    async (documentId: string, content: string): Promise<VoidResult> => {
      void documentId;
      void content;
      return {};
    },
  );
  const adapter = createBufferAdapter(updateBuffer);
  const previewPublications = jest.fn<void, [string]>();
  const largeDocument = `# Large document\n${'content '.repeat(200_000)}`;
  const settledDocument = `${largeDocument}final edit`;
  const { result } = renderHook(() => {
    const preview = useLivePreview(
      { documentId: 'document-1', content: '# Bootstrap preview' },
      adapter,
    );
    useEffect((): void => {
      previewPublications(preview);
    }, [preview]);
    return preview;
  });
  previewPublications.mockClear();

  await act(async (): Promise<void> => {
    await adapter.updateBuffer('document-1', largeDocument);
    await adapter.updateBuffer('document-1', `${largeDocument}second edit`);
    await adapter.updateBuffer('document-1', settledDocument);
  });

  expect(result.current).toBe('# Bootstrap preview');
  expect(updateBuffer).not.toHaveBeenCalled();
  expect(previewPublications).not.toHaveBeenCalled();

  await act(async (): Promise<void> => {
    await jest.advanceTimersByTimeAsync(BUFFER_SYNC_MS);
  });

  expect(updateBuffer).toHaveBeenCalledTimes(1);
  expect(updateBuffer).toHaveBeenCalledWith('document-1', settledDocument);
  expect(result.current).toBe(settledDocument);
  expect(previewPublications).toHaveBeenCalledTimes(1);
  expect(previewPublications).toHaveBeenCalledWith(settledDocument);
});

it('ignores stale accepted generations', () => {
  let acceptedListener: ((buffer: AcceptedBuffer) => void) | undefined;
  const unsubscribe = jest.fn();
  const adapter: LivePreviewAdapter = {
    subscribeAcceptedBuffers(
      listener: (buffer: AcceptedBuffer) => void,
    ): () => void {
      acceptedListener = listener;
      return unsubscribe;
    },
  };
  const { result } = renderHook(() =>
    useLivePreview(
      { documentId: 'document-1', content: '# Bootstrap preview' },
      adapter,
    ),
  );

  act((): void => {
    acceptedListener?.({
      documentId: 'document-1',
      content: '# Newest accepted preview',
      generation: 2,
    });
    acceptedListener?.({
      documentId: 'document-1',
      content: '# Stale accepted preview',
      generation: 1,
    });
  });

  expect(result.current).toBe('# Newest accepted preview');
});
