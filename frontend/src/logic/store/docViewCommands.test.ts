import type { DocViewInput, DocumentMetadata } from './appModelTypes';

const mockSetDocView = jest.fn<Promise<void>, [string, DocViewInput]>(
  async (): Promise<void> => undefined,
);

jest.mock('../adapter', () => ({
  appModelAdapter: {
    setDocView: mockSetDocView,
  },
}));

import { setEditorPaneVisible } from './docViewCommands';
import {
  hydrateProjection,
  resetProjection,
} from './appModelProjectionActions';
import { store } from './index';

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
  store.dispatch(resetProjection());
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
