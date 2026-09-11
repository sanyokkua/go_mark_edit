import { act, renderHook } from '@testing-library/react';

import {
  BUFFER_SYNC_MS,
  createAppModelAdapter,
} from '../../../src/logic/adapter';
import type { DocumentView } from '../../../src/logic/store/appModelTypes';
import { useSyncedBuffer } from '../../../src/logic/hooks/useSyncedBuffer';

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

it('separates live cursor display from restorable view synchronization', async () => {
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

it('does not publish a queued view update after the editor session unmounts', async () => {
  jest.useFakeTimers();
  const setDocView = jest.fn(
    async (documentId: string, nextView: unknown): Promise<object> => {
      void documentId;
      void nextView;
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
      updateBuffer: async (): Promise<object> => ({}),
      setDocView,
      setUILayout: async (): Promise<object> => ({}),
    },
    { eventsOn: (): (() => void) => (): void => undefined },
  );
  const { result, unmount } = renderHook(() =>
    useSyncedBuffer('document-1', view, adapter),
  );

  act(() => {
    result.current.onCursorPositionChange({ lineNumber: 4, column: 2 });
  });
  unmount();

  await act(async (): Promise<void> => {
    await jest.advanceTimersByTimeAsync(BUFFER_SYNC_MS);
  });

  expect(setDocView).not.toHaveBeenCalled();
  jest.useRealTimers();
});

/*
 * . Monaco is seeded once per editor session: `CodeEditor` passes the
 * content as `defaultValue` under `key={documentId}:{activationId}`, so text
 * only reaches the editor when that key changes. The session was keyed on
 * `documentId` alone, which is right for a tab switch and wrong for a reload —
 * a reload keeps the same document, so the reloaded text could never reach the
 * editor whatever revision the backend published.
 *
 * That was half of a data-loss defect found on the shipped binary: the document
 * was also marked clean, so the next keystroke's autosave wrote the stale buffer
 * over the file and destroyed the other process's change with no second prompt.
 *
 * The obvious fix is the wrong one. Keying the session on the content revision
 * would remount Monaco on **every keystroke**, because every edit bumps it. The
 * session must restart only for a replacement the editor did not originate,
 * which is what `externalEpoch` names — so both halves are asserted here: it
 * restarts when the epoch advances, and it does not restart when only the
 * content changes.
 */
// is installed, without restarting the session for ordinary edits.
it('starts a new editor session for an external replacement only', () => {
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
      updateBuffer: async (documentId: string, content: string) => {
        void documentId;
        void content;
        return {};
      },
      setDocView: async (documentId: string, docView: unknown) => {
        void documentId;
        void docView;
        return {};
      },
      setUILayout: async (layout: unknown) => {
        void layout;
        return {};
      },
    },
    { eventsOn: (): (() => void) => (): void => undefined },
  );
  const view: DocumentView = {
    arrangement: 'split',
    cursor: { line: 1, column: 1 },
    editorVisible: true,
    previewVisible: true,
    scroll: { editor: 0, preview: 0 },
    selection: {
      end: { line: 1, column: 1 },
      start: { line: 1, column: 1 },
    },
  };

  const { rerender, result } = renderHook(
    ({ content, epoch }: { content: string; epoch: number }) =>
      useSyncedBuffer('document-1', view, adapter, content, epoch),
    { initialProps: { content: 'mine\n', epoch: 0 } },
  );
  const first = result.current.activationId;

  // An ordinary edit must not restart the session: remounting Monaco per
  // keystroke would discard undo history and fight the user's cursor.
  rerender({ content: 'mine edited\n', epoch: 0 });
  expect(result.current.activationId).toBe(first);

  // A reload advances the epoch, which is the only thing that restarts it.
  rerender({ content: 'theirs\n', epoch: 1 });
  expect(result.current.activationId).not.toBe(first);
});
