import type { DocViewInput, DocumentMetadata } from '../../../src/logic/store/appModelTypes';

const mockFlushBuffer = jest.fn<Promise<void>, [string]>(
  async (): Promise<void> => undefined,
);
const mockFlushDocView = jest.fn<Promise<void>, [string]>(
  async (): Promise<void> => undefined,
);
const mockSetDocView = jest.fn<Promise<void>, [string, DocViewInput]>(
  async (): Promise<void> => undefined,
);

jest.mock('../../../src/logic/adapter', () => ({
  appModelAdapter: {
    flushBuffer: mockFlushBuffer,
    flushDocView: mockFlushDocView,
    setDocView: mockSetDocView,
  },
}));

import { setEditorPaneVisible, setViewArrangement } from '../../../src/logic/store/docViewCommands';
import {
  applyStatePatch,
  hydrateProjection,
  resetProjection,
} from '../../../src/logic/store/appModelProjectionActions';
import { store } from '../../../src/logic/store/index';

function documentFor(
  editorVisible: boolean,
  previewVisible: boolean,
): DocumentMetadata {
  return {
    documentId: 'document-1',
    title: 'Untitled',
    path: '',
    dirty: false,
    encoding: 'utf-8',
    lineEnding: 'lf',
    wordCount: 0,
    view: {
      arrangement: previewVisible
        ? editorVisible
          ? 'split'
          : 'preview'
        : 'editor',
      editorVisible,
      previewVisible,
      cursor: { line: 1, column: 1 },
      selection: {
        start: { line: 1, column: 1 },
        end: { line: 1, column: 1 },
      },
      scroll: { editor: 0, preview: 0 },
    },
  };
}

beforeEach((): void => {
  mockSetDocView.mockClear();
  mockFlushBuffer.mockClear();
  mockFlushDocView.mockClear();
  store.dispatch(resetProjection());
});

it('keeps the confirmed arrangement and panes unchanged until an accepted backend patch arrives', async (): Promise<void> => {
  let acknowledgeBuffer: (() => void) | undefined;
  mockFlushBuffer.mockImplementationOnce(
    (): Promise<void> =>
      new Promise<void>((resolve): void => {
        acknowledgeBuffer = resolve;
      }),
  );
  const document = documentFor(true, true);
  store.dispatch(
    hydrateProjection({
      revision: 1,
      documents: { [document.documentId]: document },
      activeDocumentId: document.documentId,
      ui: {},
    }),
  );

  const command = store.dispatch(setViewArrangement('preview'));
  expect(mockFlushBuffer).toHaveBeenCalledWith(document.documentId);
  expect(store.getState().documents.byId[document.documentId].view).toEqual(
    document.view,
  );

  acknowledgeBuffer?.();
  await command;
  expect(mockFlushDocView).toHaveBeenCalledWith(document.documentId);
  expect(store.getState().documents.byId[document.documentId].view).toEqual(
    document.view,
  );

  store.dispatch(
    applyStatePatch({
      revision: 2,
      documents: {
        upsert: {
          [document.documentId]: {
            ...document,
            view: {
              ...document.view,
              arrangement: 'preview',
              editorVisible: false,
              previewVisible: true,
            },
          },
        },
      },
    }),
  );
  expect(
    store.getState().documents.byId[document.documentId].view,
  ).toMatchObject({
    arrangement: 'preview',
    editorVisible: false,
    previewVisible: true,
  });
});

afterEach((): void => {
  store.dispatch(resetProjection());
});

it('does not issue a command that hides the final visible pane', async (): Promise<void> => {
  const document = documentFor(true, false);
  store.dispatch(
    hydrateProjection({
      revision: 1,
      documents: { [document.documentId]: document },
      activeDocumentId: document.documentId,
      ui: {},
    }),
  );

  await store.dispatch(setEditorPaneVisible(false));

  expect(mockSetDocView).not.toHaveBeenCalled();
});
