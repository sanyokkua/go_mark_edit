import { act, renderHook } from '@testing-library/react';

import { BUFFER_SYNC_MS, createAppModelAdapter } from '../adapter';
import type { DocumentView } from '../store/appModelTypes';
import { useSyncedBuffer } from './useSyncedBuffer';

const view: DocumentView = {
  arrangement: 'editor',
  editorVisible: true,
  previewVisible: false,
  cursor: { line: 1, column: 1 },
  selection: {
    start: { line: 1, column: 1 },
    end: { line: 1, column: 1 },
  },
  scroll: { editor: 0, preview: 0 },
};

it('STORY-019-AC-4 separates live cursor display from restorable view synchronization', async () => {
  jest.useFakeTimers();
  const setDocView = jest.fn(
    async (documentId: string, view: unknown): Promise<object> => {
      void documentId;
      void view;
      return {};
    },
  );
  const adapter = createAppModelAdapter(
    {
      getState: async () => ({
        data: {
          snapshot: {
            revision: 1,
            documents: {},
            activeDocumentId: '',
            ui: {},
          },
          activeBuffer: { documentId: '', content: '' },
        },
      }),
      updateBuffer: async (
        documentId: string,
        content: string,
      ): Promise<object> => {
        void documentId;
        void content;
        return {};
      },
      setDocView,
      setUILayout: async (layout: unknown): Promise<object> => {
        void layout;
        return {};
      },
    },
    { eventsOn: (): (() => void) => (): void => undefined },
  );
  const { result } = renderHook(() =>
    useSyncedBuffer('document-1', view, adapter),
  );

  act(() => {
    result.current.onCursorPositionChange({ lineNumber: 4, column: 2 });
  });

  expect(result.current.liveCursor).toEqual({ lineNumber: 4, column: 2 });
  expect(setDocView).not.toHaveBeenCalled();

  await act(async (): Promise<void> => {
    await jest.advanceTimersByTimeAsync(BUFFER_SYNC_MS);
  });

  expect(setDocView).toHaveBeenCalledWith('document-1', {
    editorVisible: true,
    previewVisible: false,
    cursor: { line: 4, column: 2 },
    selection: view.selection,
    scroll: view.scroll,
  });

  act((): void => {
    result.current.onBlur();
  });

  await Promise.resolve();
  expect(setDocView).toHaveBeenCalledTimes(1);
  jest.useRealTimers();
});
