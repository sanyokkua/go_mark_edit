import { useContext, useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';

import type { CodeEditorHandle } from '../components/CodeEditor';
import {
  applyStatePatch,
  hydrateProjection,
  resetProjection,
} from '../../logic/store/appModelProjectionActions';
import type { DocumentMetadata } from '../../logic/store/appModelTypes';
import { store } from '../../logic/store';
import { DocumentCommandContext, EditorSessionProvider } from './editorSession';
import EditorView, { type EditorViewAdapter } from './EditorView';

const mockEditorHandle: CodeEditorHandle = {
  getSelection: jest.fn(() => ({
    start: { lineNumber: 2, column: 1 },
    end: { lineNumber: 2, column: 5 },
  })),
  replaceAll: jest.fn(),
  replaceRange: jest.fn(),
};

jest.mock('../components/CodeEditor', () => {
  const React = jest.requireActual<typeof import('react')>('react');

  const MockCodeEditor = React.forwardRef<CodeEditorHandle, unknown>(
    function MockCodeEditor(_props, ref): React.JSX.Element {
      React.useImperativeHandle(ref, () => mockEditorHandle, []);

      return React.createElement('textarea', {
        'aria-label': 'Markdown source',
      });
    },
  );

  return { __esModule: true, default: MockCodeEditor };
});

const adapter: EditorViewAdapter = {
  flushBuffer: async (): Promise<void> => undefined,
  flushDocView: async (): Promise<void> => undefined,
  subscribeAcceptedBuffers: (): (() => void) => (): void => undefined,
  updateBuffer: async (): Promise<void> => undefined,
  updateDocView: async (): Promise<void> => undefined,
};

const NonEditorSibling: React.FC = (): React.JSX.Element => {
  const commands = useContext(DocumentCommandContext);
  const [selection, setSelection] = useState('not read');

  return (
    <aside aria-label="Non-editor commands">
      <output aria-label="Available document commands">
        {commands === null
          ? 'unavailable'
          : 'getSelection replaceRange replaceAll'}
      </output>
      <button
        type="button"
        onClick={(): void => {
          setSelection(commands?.getSelection() === null ? 'none' : 'selected');
        }}
      >
        Read active selection
      </button>
      <button
        type="button"
        onClick={(): void => {
          commands?.replaceAll('replacement from sibling');
        }}
      >
        Replace from sibling
      </button>
      <output aria-label="Sibling selection">{selection}</output>
    </aside>
  );
};

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
    wordCount: 1,
    view: {
      arrangement: editorVisible && previewVisible ? 'split' : 'editor',
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

function renderEditorSession(document: DocumentMetadata): void {
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
        activeBuffer={{ documentId: document.documentId, content: '# Buffer' }}
      >
        <NonEditorSibling />
        <EditorView adapter={adapter} />
      </EditorSessionProvider>
    </Provider>,
  );
}

beforeEach((): void => {
  store.dispatch(resetProjection());
  jest.clearAllMocks();
});

afterEach((): void => {
  store.dispatch(resetProjection());
});

it('STORY-023-AC-1 exposes commands to a non-editor sibling in Editor and Split', () => {
  const document = documentFor(true, false);
  renderEditorSession(document);
  const mountedEditor = screen.getByRole('textbox', {
    name: 'Markdown source',
  });

  fireEvent.click(
    screen.getByRole('button', { name: 'Read active selection' }),
  );
  expect(
    screen.getByRole('status', { name: 'Sibling selection' }),
  ).toHaveTextContent('selected');

  act((): void => {
    store.dispatch(
      applyStatePatch({
        revision: 2,
        documents: {
          upsert: {
            [document.documentId]: {
              ...document,
              ...documentFor(true, true),
            },
          },
        },
      }),
    );
  });

  expect(screen.getByRole('radio', { name: 'Split' })).toBeChecked();
  expect(screen.getByLabelText('Markdown source')).toBe(mountedEditor);
  expect(
    screen.getByRole('status', { name: 'Available document commands' }),
  ).toHaveTextContent('getSelection replaceRange replaceAll');
  fireEvent.click(
    screen.getByRole('button', { name: 'Read active selection' }),
  );
  expect(mockEditorHandle.getSelection).toHaveBeenCalledTimes(2);
});

it('STORY-023-AC-2 keeps sibling commands available in Preview-only', () => {
  const document = documentFor(true, false);
  renderEditorSession(document);
  const mountedEditor = screen.getByRole('textbox', {
    name: 'Markdown source',
  });

  act((): void => {
    store.dispatch(
      applyStatePatch({
        revision: 2,
        documents: {
          upsert: {
            [document.documentId]: {
              ...document,
              ...documentFor(false, true),
            },
          },
        },
      }),
    );
  });

  expect(screen.getByRole('radio', { name: 'Preview' })).toBeChecked();
  expect(screen.getByLabelText('Editor pane')).toHaveAttribute(
    'aria-hidden',
    'true',
  );
  expect(screen.getByLabelText('Markdown source')).toBe(mountedEditor);
  fireEvent.click(screen.getByRole('button', { name: 'Replace from sibling' }));
  expect(mockEditorHandle.replaceAll).toHaveBeenCalledWith(
    'replacement from sibling',
  );
});
