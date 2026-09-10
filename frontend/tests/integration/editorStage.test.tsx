import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';

import type { EditorStageAdapter } from '../../src/ui/widgets/EditorStage';
import EditorStage from '../../src/ui/widgets/EditorStage';
import {
  hydrateProjection,
  resetProjection,
} from '../../src/logic/store/appModelProjectionActions';
import type { DocumentMetadata } from '../../src/logic/store/appModelTypes';
import { store } from '../../src/logic/store';
import { EditorSessionProvider } from '../../src/ui/widgets/editorSession';

jest.mock('../../src/ui/components/CodeEditor', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const MockCodeEditor = React.forwardRef<
    HTMLTextAreaElement,
    { initialValue: string }
  >(function MockCodeEditor({ initialValue }, ref): React.JSX.Element {
    return React.createElement('textarea', {
      'aria-label': 'Markdown source',
      defaultValue: initialValue,
      ref,
    });
  });
  return { __esModule: true, default: MockCodeEditor };
});

const adapter: EditorStageAdapter = {
  flushBuffer: jest.fn(async (): Promise<void> => undefined),
  flushDocView: jest.fn(async (): Promise<void> => undefined),
  subscribeAcceptedBuffers: jest.fn(() => jest.fn()),
  updateBuffer: jest.fn(async (): Promise<void> => undefined),
  updateDocView: jest.fn(async (): Promise<void> => undefined),
};

function documentFor(
  arrangement: DocumentMetadata['view']['arrangement'],
): DocumentMetadata {
  return {
    documentId: 'document-1',
    title: 'Long document title',
    path: '',
    dirty: false,
    encoding: 'utf-8',
    lineEnding: 'lf',
    wordCount: 2,
    view: {
      arrangement,
      editorVisible: arrangement !== 'preview',
      previewVisible: arrangement !== 'editor',
      cursor: { line: 2, column: 3 },
      selection: {
        start: { line: 1, column: 1 },
        end: { line: 1, column: 4 },
      },
      scroll: { editor: 0, preview: 0 },
    },
  };
}

beforeEach(() => {
  store.dispatch(resetProjection());
});

afterEach(() => {
  store.dispatch(resetProjection());
});

// Proves: FR-040
it('keeps the editor and preview content in explicit panes for split view', () => {
  const document = documentFor('split');
  store.dispatch(
    hydrateProjection({
      revision: 1,
      documents: { [document.documentId]: document },
      activeDocumentId: document.documentId,
      ui: {},
    }),
  );

  render(
    <Provider store={store}>
      <EditorSessionProvider
        activeBuffer={{ documentId: document.documentId, content: '# Preview' }}
      >
        <EditorStage
          adapter={adapter}
          activeBuffer={{
            documentId: document.documentId,
            content: '# Preview',
          }}
          activeDocument={document}
          editorVisible
          labelledBy="active-tab"
          panelId="editor-tabpanel"
          previewVisible
          readOnly={false}
          view={document.view}
          onLiveCursorChange={jest.fn()}
          onPreviewWarning={jest.fn()}
        />
      </EditorSessionProvider>
    </Provider>,
  );

  expect(screen.getByRole('tabpanel')).toHaveAttribute('id', 'editor-tabpanel');
  expect(screen.getByLabelText('Editor pane')).toBeInTheDocument();
  expect(screen.getByLabelText('Preview pane')).toBeInTheDocument();
  expect(screen.getByLabelText('Markdown source')).toHaveValue('# Preview');
  expect(screen.getByRole('heading', { name: 'Preview' })).toBeInTheDocument();
});
